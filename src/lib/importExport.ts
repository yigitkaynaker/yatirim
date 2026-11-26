import "server-only";
import { background } from "./background";
import { createHash } from "node:crypto";
import { getDb } from "./db";
import { ASSET_TYPE_INFO, ASSET_TYPES, defaultCurrencyFor, isAssetType, normalizeSymbol, type AssetType } from "./assets";
import {
  activeTransactions,
  getPortfolio,
  lockPositions,
  parseTransactionInput,
  positionLockKey,
  recordTransaction,
  ValidationError,
  type TransactionInput,
} from "./portfolio";
import { accountNames, createAccount, listAccounts } from "./accounts";
import { listDividendRecords } from "./dividends";
import { getYearlyReport } from "./reports";
import { ensureFxRates } from "./fxRates";
import { isAmbiguousNumber, normKey, parseCsv, parseDateLoose, parseNumberLoose, toCsv, trDate, type Cell } from "./csv";

// CSV DIŞA / İÇE AKTARMA
// Dışa: işlemler, pozisyonlar, temettüler, yıllık gerçekleşen kazanç (Excel Türkçe uyumlu CSV).
// İçe: işlemler. Kendi şablonumuz ya da başka bir aracı kurumun dosyası (sütun eşleme ile).
// Önizlemede her satır doğrulanır (aynı kurallarla, kaydetmeden — deneme işlemi geri alınır),
// mükerrer satırlar (tarih, sembol, yön, adet, fiyat, hesap) işaretlenir. Kayıt tek bir veritabanı
// işleminde yapılır: bir satır bile kaydedilemezse hiçbiri kaydedilmez.

// ---- Dışa aktarma -------------------------------------------------------------------------

const SIDE_LABEL = { buy: "Alış", sell: "Satış" } as const;
const typeLabel = (t: AssetType) => ASSET_TYPE_INFO[t].label;

export const TX_HEADERS = ["Tarih", "Hesap", "Tür", "Sembol", "Yön", "Miktar", "Fiyat", "Para birimi", "Komisyon", "Kur (TL)", "Not"];

export async function exportTransactionsCsv(opts: { account?: number | null } = {}): Promise<string> {
  const names = await accountNames();
  const txs = (await activeTransactions("real"))
    .filter((t) => opts.account == null || t.accountId === opts.account)
    .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  const rows: Cell[][] = txs.map((t) => [
    trDate(t.date),
    t.accountId != null ? (names.get(t.accountId) ?? "") : "",
    typeLabel(t.assetType),
    t.symbol,
    SIDE_LABEL[t.side],
    t.quantity,
    t.price,
    t.currency,
    t.fee,
    t.currency === "TRY" ? 1 : t.fxTry,
    t.note ?? "",
  ]);
  return toCsv(TX_HEADERS, rows);
}

export async function exportHoldingsCsv(opts: { account?: number | null } = {}): Promise<string> {
  const p = await getPortfolio("real", { account: opts.account ?? null });
  const names = await accountNames();
  const rows: Cell[][] = [];
  for (const h of p.holdings) {
    const parts = h.accounts.length ? h.accounts : [];
    rows.push([
      opts.account != null ? (names.get(opts.account) ?? "") : parts.map((a) => a.name).join(", "),
      typeLabel(h.assetType),
      h.symbol,
      h.name ?? "",
      h.quantity,
      h.avgCost != null ? Number(h.avgCost.toFixed(6)) : null,
      h.currency,
      h.price,
      h.costTry != null ? Number(h.costTry.toFixed(2)) : null,
      h.valueTry != null ? Number(h.valueTry.toFixed(2)) : null,
      h.pnlTry != null ? Number(h.pnlTry.toFixed(2)) : null,
      h.pnlPct != null ? Number(h.pnlPct.toFixed(2)) : null,
      h.annual?.pct != null ? Number(h.annual.pct.toFixed(2)) : null,
    ]);
  }
  return toCsv(
    ["Hesap", "Tür", "Sembol", "Ad", "Miktar", "Ort. maliyet", "Para birimi", "Güncel fiyat", "Maliyet (TL)", "Değer (TL)", "K/Z (TL)", "K/Z %", "Yıllık getiri %"],
    rows,
  );
}

export async function exportDividendsCsv(opts: { account?: number | null } = {}): Promise<string> {
  const list = (await listDividendRecords({ mode: "real", status: "confirmed" })).filter((d) => opts.account == null || d.accountId === opts.account);
  const rows: Cell[][] = list.map((d) => {
    const gross = d.grossAmount ?? d.amount;
    return [
      trDate(d.exDate),
      d.accountName ?? "",
      d.symbol,
      d.quantity,
      d.perShare,
      Number(gross.toFixed(4)),
      d.withholdingPct,
      Number((gross - d.amount).toFixed(4)),
      Number(d.amount.toFixed(4)),
      d.currency,
      d.fxTry,
      d.amountTry != null ? Number(d.amountTry.toFixed(2)) : null,
    ];
  });
  return toCsv(["Hak kullanım tarihi", "Hesap", "Sembol", "Adet", "Pay başına", "Brüt", "Stopaj %", "Stopaj", "Net", "Para birimi", "Kur (TL)", "Net (TL)"], rows);
}

export async function exportRealizedCsv(opts: { account?: number | null; year?: string | null } = {}): Promise<string> {
  const r = await getYearlyReport({ account: opts.account ?? null });
  const rows: Cell[][] = [];
  const f2 = (n: number) => Number(n.toFixed(2));
  for (const y of r.years) {
    if (opts.year && y.year !== opts.year) continue;
    for (const a of y.rows) {
      rows.push([y.year, typeLabel(a.assetType), a.symbol, a.soldQuantity || null, f2(a.proceedsTry), f2(a.costTry), f2(a.realizedTry), f2(a.dividendsGrossTry), f2(a.withholdingTry), f2(a.dividendsNetTry), f2(a.feesTry), f2(a.totalTry)]);
    }
    const t = y.totals;
    rows.push([y.year, "TOPLAM", "", null, f2(t.proceedsTry), f2(t.costTry), f2(t.realizedTry), f2(t.dividendsGrossTry), f2(t.withholdingTry), f2(t.dividendsNetTry), f2(t.feesTry), f2(t.totalTry)]);
  }
  rows.push([]);
  rows.push(["Not: Bu rapor bilgilendirme amaçlıdır, resmî vergi beyanı değildir. Tutarlar işlem günü kurlarıyla TL'dir; komisyonlar K/Z'ye dahildir."]);
  return toCsv(
    ["Yıl", "Tür", "Sembol", "Satılan miktar", "Satış geliri (TL)", "Satılanın maliyeti (TL)", "Gerçekleşen K/Z (TL)", "Temettü brüt (TL)", "Stopaj (TL)", "Temettü net (TL)", "Komisyon (TL)", "Toplam (TL)"],
    rows,
  );
}

/** İçe aktarma şablonu: başlıklar + iki örnek satır */
export async function importTemplateCsv(): Promise<string> {
  const acc = (await listAccounts())[0]?.name ?? "Ana hesap";
  return toCsv(TX_HEADERS, [
    ["15.03.2025", acc, typeLabel("bist"), "THYAO", "Alış", 100, 245.5, "TRY", 12.5, 1, "Örnek satır — silin"],
    ["22.04.2025", acc, typeLabel("foreign"), "AAPL", "Alış", 5, 198.4, "USD", 1, 37.95, "Kur boşsa işlem günü kuru otomatik alınır"],
  ]);
}

// ---- İçe aktarma ---------------------------------------------------------------------------

export const IMPORT_FIELDS = ["date", "account", "assetType", "symbol", "side", "quantity", "price", "currency", "fee", "fxTry", "note"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportMapping = Partial<Record<ImportField, number | null>>;

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  date: "Tarih",
  account: "Hesap",
  assetType: "Tür",
  symbol: "Sembol",
  side: "Yön (Alış/Satış)",
  quantity: "Miktar",
  price: "Fiyat",
  currency: "Para birimi",
  fee: "Komisyon",
  fxTry: "Kur (TL)",
  note: "Not",
};

const REQUIRED: ImportField[] = ["date", "symbol", "side", "quantity", "price"];

const SYNONYMS: Record<ImportField, string[]> = {
  date: ["tarih", "date", "islemtarihi", "valortarihi", "emirtarihi", "tradedate"],
  account: ["hesap", "account", "hesapadi", "kurum", "araci", "aracikurum", "broker"],
  assetType: ["tur", "varliktipi", "varliktur", "type", "assettype", "enstrumantipi", "urun", "urunturu"],
  symbol: ["sembol", "symbol", "hisse", "kod", "menkulkiymet", "enstruman", "ticker", "varlik", "hissekodu", "fonkodu"],
  side: ["yon", "islem", "islemtipi", "islemturu", "side", "alissatis", "alsat", "buysell", "action"],
  quantity: ["miktar", "adet", "quantity", "lot", "nominal", "qty", "amount"],
  price: ["fiyat", "birimfiyat", "price", "islemfiyati", "gerceklesenfiyat", "ortalamafiyat", "unitprice"],
  currency: ["parabirimi", "doviz", "currency", "dovizcinsi", "pb"],
  fee: ["komisyon", "ucret", "fee", "masraf", "commission", "komisyontutari"],
  fxTry: ["kur", "kurtl", "kurtry", "fx", "fxrate", "dovizkuru"],
  note: ["not", "aciklama", "note", "notes", "description"],
};

/** Başlıklardan otomatik sütun eşleme */
export function autoMapping(headers: string[]): ImportMapping {
  const keys = headers.map(normKey);
  const m: ImportMapping = {};
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    const idx = keys.findIndex((k, i) => !used.has(i) && SYNONYMS[f].includes(k));
    if (idx >= 0) {
      m[f] = idx;
      used.add(idx);
    }
  }
  return m;
}

function parseSide(raw: string): "buy" | "sell" | null {
  const k = normKey(raw);
  if (["alis", "al", "buy", "b", "a", "alim", "long"].includes(k)) return "buy";
  if (["satis", "sat", "sell", "s", "satim", "short"].includes(k)) return "sell";
  return null;
}

function parseAssetType(raw: string): AssetType | null {
  const k = normKey(raw);
  if (!k) return null;
  if (isAssetType(k)) return k;
  for (const t of ASSET_TYPES) if (normKey(ASSET_TYPE_INFO[t].label) === k) return t;
  const syn: Record<string, AssetType> = {
    hisse: "bist",
    bisthisse: "bist",
    bisthissesi: "bist",
    hissesenedi: "bist",
    yabancihissesi: "foreign",
    abdhissesi: "foreign",
    kriptovarlik: "crypto",
    pay: "bist",
    abd: "foreign",
    yabanci: "foreign",
    yabancihisse: "foreign",
    abdhisse: "foreign",
    kripto: "crypto",
    kriptopara: "crypto",
    doviz: "fx",
    altin: "gold",
    fon: "fund",
    yatirimfonu: "fund",
    tefas: "fund",
  };
  return syn[k] ?? null;
}

export interface ImportOptions {
  mapping?: ImportMapping;
  /** Eşlemede tür sütunu yoksa ya da hücre boşsa */
  defaultAssetType?: AssetType;
  /** Hesap sütunu yoksa ya da hücre boşsa (yoksa varsayılan hesap) */
  defaultAccountId?: number | null;
  /** Dosyadaki bilinmeyen hesap adları oluşturulsun mu */
  createAccounts?: boolean;
}

export interface ImportRow {
  /** Dosyadaki satır numarası (başlık = 1) */
  line: number;
  cells: string[];
  /** Okunan değerler (önizleme tablosu) */
  date: string | null;
  account: string | null;
  assetType: AssetType | null;
  symbol: string | null;
  side: "buy" | "sell" | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  fee: number | null;
  errors: string[];
  /** Kaydı engellemeyen uyarılar (örn. belirsiz sayı: kullanıcı kontrol etsin) */
  warnings: string[];
  /** Bilgi notları (örn. aynı satır dosyada birden çok kez var) */
  info: string[];
  duplicate: boolean;
  hash: string | null;
}

export interface ImportPreview {
  headers: string[];
  mapping: ImportMapping;
  rows: ImportRow[];
  counts: { total: number; valid: number; invalid: number; duplicate: number };
  /** Dosyada geçen ama olmayan hesap adları */
  unknownAccounts: string[];
}

const numKey = (n: number) => String(Number(n.toPrecision(10)));

/** Mükerrer kontrolü anahtarı: tarih, sembol, yön, adet, fiyat, hesap */
export function txHash(t: { date: string; symbol: string; side: string; quantity: number; price: number; accountId: number | null }): string {
  return createHash("sha1")
    .update([t.date, t.symbol.toUpperCase(), t.side, numKey(t.quantity), numKey(t.price), t.accountId ?? ""].join("|"))
    .digest("hex")
    .slice(0, 16);
}

interface Built {
  row: ImportRow;
  body: Record<string, unknown> | null;
  fxTry: number | null;
}

async function buildRows(text: string, opts: ImportOptions): Promise<{ headers: string[]; mapping: ImportMapping; built: Built[] }> {
  const table = parseCsv(text);
  if (table.length === 0) throw new ValidationError("Dosya boş.");
  if (table.length > 5001) throw new ValidationError("En fazla 5000 satır içe aktarılabilir.");
  const headers = table[0];
  const mapping = opts.mapping ?? autoMapping(headers);
  const missing = REQUIRED.filter((f) => mapping[f] == null);
  if (missing.length) {
    throw new ValidationError(`Şu alanlar için sütun seçin: ${missing.map((f) => IMPORT_FIELD_LABEL[f]).join(", ")}.`);
  }
  // Dışa aktarmada formül korumasıyla eklenen baştaki ' geri alınır ('=… → =…).
  const cell = (cells: string[], f: ImportField) => (mapping[f] != null ? (cells[mapping[f]!] ?? "").trim().replace(/^'(?=[=+@-])/, "") : "");
  const accNames = new Map((await listAccounts({ includeArchived: true })).map((a) => [a.name.toLocaleLowerCase("tr-TR"), a]));
  const defaultAcc = opts.defaultAccountId != null ? (await listAccounts({ includeArchived: true })).find((a) => a.id === opts.defaultAccountId) : undefined;

  const built: Built[] = table.slice(1).map((cells, i) => {
    const errors: string[] = [];
    const date = parseDateLoose(cell(cells, "date"));
    if (!date) errors.push("Tarih okunamadı (gg.aa.yyyy bekleniyor).");
    const typeRaw = cell(cells, "assetType");
    const assetType = typeRaw ? parseAssetType(typeRaw) : (opts.defaultAssetType ?? null);
    if (!assetType) errors.push(typeRaw ? `Tür tanınmadı: "${typeRaw}".` : "Tür yok (sütun seçin ya da varsayılan tür belirleyin).");
    const symRaw = cell(cells, "symbol").replace(/\.IS$/i, "");
    const symbol = symRaw ? (assetType ? normalizeSymbol(assetType, symRaw) : symRaw.toUpperCase()) : null;
    if (!symbol) errors.push("Sembol boş.");
    const sideRaw = cell(cells, "side");
    const side = parseSide(sideRaw);
    if (!side) errors.push(`Yön tanınmadı: "${sideRaw}" (Alış / Satış).`);
    const qRaw = cell(cells, "quantity");
    const quantity = parseNumberLoose(qRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`Miktar geçersiz: "${qRaw}".`);
    const pRaw = cell(cells, "price");
    const price = parseNumberLoose(pRaw);
    if (!Number.isFinite(price) || price < 0) errors.push(`Fiyat geçersiz: "${pRaw}".`);
    const curRaw = cell(cells, "currency").toUpperCase().replace(/^TL$/, "TRY");
    const currency = curRaw || (assetType && symbol ? defaultCurrencyFor(assetType, symbol) : assetType ? ASSET_TYPE_INFO[assetType].defaultCurrency : "TRY");
    if (!["TRY", "USD", "EUR"].includes(currency)) errors.push(`Para birimi desteklenmiyor: "${curRaw}" (TRY, USD, EUR).`);
    const feeRaw = cell(cells, "fee");
    const fee = feeRaw ? Math.abs(parseNumberLoose(feeRaw)) : 0;
    if (feeRaw && !Number.isFinite(fee)) errors.push(`Komisyon okunamadı: "${feeRaw}".`);
    const fxRaw = cell(cells, "fxTry");
    const fx = fxRaw ? parseNumberLoose(fxRaw) : NaN;
    if (fxRaw && !(fx > 0)) errors.push(`Kur okunamadı: "${fxRaw}".`);
    const accRaw = cell(cells, "account");
    let account: string | null = accRaw || defaultAcc?.name || null;
    if (accRaw && !accNames.has(accRaw.toLocaleLowerCase("tr-TR")) && !opts.createAccounts) {
      errors.push(`"${accRaw}" adında hesap yok (Ayarlar'dan ekleyin ya da "eksik hesapları oluştur"u seçin).`);
    }
    if (accRaw) account = accNames.get(accRaw.toLocaleLowerCase("tr-TR"))?.name ?? accRaw;
    const note = cell(cells, "note").slice(0, 500) || null;
    const warnings: string[] = [];
    for (const [f, raw] of [["quantity", qRaw], ["price", pRaw], ["fee", feeRaw], ["fxTry", fxRaw]] as const) {
      if (isAmbiguousNumber(raw)) {
        warnings.push(`Belirsiz sayı: ${IMPORT_FIELD_LABEL[f]} "${raw}" → ${parseNumberLoose(raw).toLocaleString("tr-TR", { maximumFractionDigits: 8 })} olarak okundu (Türkçe biçim). Doğru değilse dosyayı düzeltin.`);
      }
    }

    const row: ImportRow = {
      line: i + 2,
      cells,
      date,
      account,
      assetType,
      symbol,
      side,
      quantity: Number.isFinite(quantity) ? quantity : null,
      price: Number.isFinite(price) ? price : null,
      currency,
      fee: Number.isFinite(fee) ? fee : null,
      errors,
      warnings,
      info: [],
      duplicate: false,
      hash: null,
    };
    const body =
      errors.length === 0
        ? { mode: "real", account: account ?? undefined, assetType, symbol, side, quantity, price, currency, date, note, fee: mapping.fee != null ? fee : undefined }
        : null;
    return { row, body, fxTry: currency === "TRY" ? 1 : fx > 0 ? fx : null };
  });
  return { headers, mapping, built };
}

/**
 * Satırları tek bir veritabanı işleminde dener. dryRun: sonunda geri alınır (önizleme).
 * Satırlar tarih sırasıyla eklenir (eldekinden fazla satış kontrolü doğru çalışsın).
 */
async function run(text: string, opts: ImportOptions, mode: "preview" | "commit"): Promise<{ preview: ImportPreview; inserted: number }> {
  const { headers, mapping, built } = await buildRows(text, opts);
  const db = await getDb();
  const knownNames = new Set((await listAccounts({ includeArchived: true })).map((a) => a.name.toLocaleLowerCase("tr-TR")));
  const unknownAccounts = [...new Set(built.map((b) => b.row.account).filter((n): n is string => !!n && !knownNames.has(n.toLocaleLowerCase("tr-TR"))))];
  let inserted = 0;
  // Önizlemede işlem sonunda geri alınır (özel hata ile).
  class PreviewRollback extends Error {}
  try {
    await db.tx(async () => {
    if (opts.createAccounts) for (const name of unknownAccounts) await createAccount({ name });
    const ordered = [...built].filter((b) => b.body).sort((a, b) => (a.row.date! < b.row.date! ? -1 : a.row.date! > b.row.date! ? 1 : a.row.line - b.row.line));
    const inputs = new Map<Built, TransactionInput>();
    const inFile = new Map<string, number>();
    for (const b of ordered) {
      try {
        const input = await parseTransactionInput(b.body, { allowArchived: true });
        inputs.set(b, input);
        b.row.hash = txHash({ ...input, accountId: input.accountId });
        inFile.set(b.row.hash, (inFile.get(b.row.hash) ?? 0) + 1);
      } catch (err) {
        b.row.errors.push(err instanceof ValidationError ? err.message : "Geçersiz satır.");
      }
    }
    // Dosyadaki tüm pozisyonların kilitleri baştan, sıralı alınır (eşzamanlı kayıtlarla yarış ve kilitlenme olmasın).
    await lockPositions([...inputs.values()].map((i) => positionLockKey(i.mode, i.assetType, i.symbol, i.accountId)));
    // Mükerrer kontrolü yalnızca veritabanında ZATEN olan kayıtlara karşı yapılır. Dosyada aynı satır
    // birden çok kez varsa (örn. aynı gün aynı fiyattan iki ayrı alım) bunlar ayrı işlemdir: k. tekrar,
    // veritabanında o satırdan en az k tane varsa mükerrer sayılır (aynı dosyayı iki kez yüklemek yine güvenli).
    const existing = new Map<string, number>();
    for (const t of (await activeTransactions("real"))) {
      const h = txHash({ date: t.date, symbol: t.symbol, side: t.side, quantity: t.quantity, price: t.price, accountId: t.accountId });
      existing.set(h, (existing.get(h) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    for (const b of ordered) {
      const input = inputs.get(b);
      if (!input) continue;
      const h = b.row.hash!;
      const total = inFile.get(h) ?? 1;
      if (total > 1) b.row.info.push(`Aynı satır dosyada ${total} kez var; her biri ayrı işlem olarak eklenir.`);
      const occurrence = (seen.get(h) ?? 0) + 1;
      seen.set(h, occurrence);
      if (occurrence <= (existing.get(h) ?? 0)) {
        b.row.duplicate = true;
        continue;
      }
      // Satır hatası tüm işlemi bozmasın: recordTransaction iç içe tx olduğu için kendi kayıt noktasıdır.
      try {
        await recordTransaction(input, { fxTry: b.fxTry, deferFx: true });
        inserted++;
      } catch (err) {
        b.row.errors.push(err instanceof ValidationError ? err.message : "Kaydedilemedi.");
      }
    }
    const invalid = built.filter((b) => b.row.errors.length > 0).length;
    if (mode === "commit" && invalid > 0) {
      throw new ValidationError(`${invalid} satırda hata var; hiçbir satır kaydedilmedi. Önizlemede hataları düzeltin.`);
    }
    if (mode !== "commit") throw new PreviewRollback();
    });
  } catch (err) {
    if (!(err instanceof PreviewRollback)) throw err;
  }
  if (mode === "commit" && inserted > 0) background(() => ensureFxRates({ force: true }));
  const rows = built.map((b) => b.row);
  return {
    preview: {
      headers,
      mapping,
      rows,
      counts: {
        total: rows.length,
        valid: rows.filter((r) => r.errors.length === 0 && !r.duplicate).length,
        invalid: rows.filter((r) => r.errors.length > 0).length,
        duplicate: rows.filter((r) => r.duplicate).length,
      },
      unknownAccounts,
    },
    inserted,
  };
}

/** Önizleme: doğrulama + mükerrer işareti, hiçbir şey kaydedilmez. */
export async function previewImport(text: string, opts: ImportOptions = {}): Promise<ImportPreview> {
  return (await run(text, opts, "preview")).preview;
}

/** Kaydet: hatalı satır varsa hiçbiri kaydedilmez; mükerrerler atlanır. */
export async function commitImport(text: string, opts: ImportOptions = {}): Promise<{ inserted: number; skippedDuplicates: number; preview: ImportPreview }> {
  const r = await run(text, opts, "commit");
  return { inserted: r.inserted, skippedDuplicates: r.preview.counts.duplicate, preview: r.preview };
}

