import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import * as actions from "./actions";
import { ASSET_TYPES, CATALOG_CATEGORY_LABEL, displaySymbol, isAssetType, isCurrency, normalizeSymbol, type AssetType, type Mode } from "./assets";
import { formatMoney, formatQuantity } from "./format";
import { todayIstanbul } from "./portfolio";
import { getLatestReport } from "./news";
import { getHeadlines } from "./freeNews";

// SOHBET ARAÇLARI
// Claude'un çağırabildiği araçlar. Hepsi src/lib/actions.ts eylem katmanını
// kullanır; doğrulama orada yapılır. Değişiklik yapan araçlar sohbette
// gösterilecek bir "kart" (ne yapıldı, rakamlarla) üretir.

export interface ActionCard {
  /** warn: yanıtta doğrulanamayan rakam uyarısı */
  tone: "ok" | "error" | "warn";
  title: string;
  lines: string[];
  /** İlgili sayfa */
  href?: string;
}

export interface ToolOutcome {
  /** Claude'a dönen sonuç (JSON'a çevrilir) */
  result: unknown;
  isError?: boolean;
  card?: ActionCard;
}

const assetTypeProp = { type: "string", enum: [...ASSET_TYPES], description: "bist: BIST hissesi, foreign: yabancı hisse / ETF / endeks (^GSPC) / emtia vadelisi (GC=F altın, SI=F gümüş, CL=F petrol, BZ=F Brent, NG=F doğalgaz, HG=F bakır), crypto: kripto (symbol BTC = Binance BTC/USDT, fiyat USD; BTC-TRY = Binance BTC/TL; BTC@BTCTURK = BtcTurk BTC/TL; BTC-USDT@BTCTURK = BtcTurk BTC/USDT; spotta olmayan coinler: RATS@BINANCE-F = Binance vadeli kontrat fiyatı (1 coin için, USD), SHARE@BINANCE-ALPHA = Binance Alpha token (USD); Binance ve BtcTurk'te olmayanlar: OKB@COINGECKO = CoinGecko fiyatı (USD)), fx: döviz, gold: altın (symbol GRAM = gram altın, CEYREK, YARIM, TAM, CUMHURIYET, ATA, BILEZIK22 = 22 ayar bilezik gramı), fund: TEFAS yatırım fonu (3 karakterli fon kodu, örn. AFT)" };
const modeProp = { type: "string", enum: ["real", "virtual"], description: "real: gerçek portföy, virtual: sanal portföy" };
const currencyProp = { type: "string", enum: ["TRY", "USD", "EUR"] };
const numProp = (description: string) => ({ type: "number", description });
const accountProp = {
  type: "string",
  description:
    "Hesap adı (örn. Midas, İş Yatırım, Banka). Yalnızca gerçek portföyde geçerli; verilmezse varsayılan hesap (portföy özetinde: toplama dahil tüm hesaplar). Hesap adlarını get_portfolio_summary 'hesaplar' alanında görürsün; kullanıcı hangi hesap olduğunu söylemediyse ve birden çok hesap varsa sor.",
};

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_portfolio_summary",
    description:
      "Gerçek ya da sanal portföyün özetini getirir: pozisyonlar (adet, ortalama maliyet, güncel fiyat, değer, K/Z, yıllık getiri) ve TL toplamlar. Gerçekte hesap listesi ve hesap başına toplamlar da döner; account verilirse yalnızca o hesap.",
    input_schema: { type: "object", properties: { mode: modeProp, account: accountProp }, required: ["mode"] },
  },
  {
    name: "get_quote",
    description: "Bir ya da birkaç varlığın canlı fiyatını ve günlük değişimini getirir.",
    input_schema: {
      type: "object",
      properties: {
        instruments: {
          type: "array",
          items: { type: "object", properties: { asset_type: assetTypeProp, symbol: { type: "string" } }, required: ["asset_type", "symbol"] },
        },
      },
      required: ["instruments"],
    },
  },
  {
    name: "search_symbol",
    description: "Sembol arar (şirket adı, kısaltma ya da \"altın\", \"dolar\", \"gümüş\", \"petrol\" gibi Türkçe kelimeler). Kripto paritelerinin tümünü (Binance USDT/TL, BtcTurk) de bulur. Doğru asset_type ve symbol'ü bulmak için kullan; sonuçlar kategori (liste), borsa ve para birimiyle gelir.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "create_sanal_position",
    description:
      "Sanal portföyde güncel canlı fiyattan pozisyon açar ('alsaydım ne olurdu'). Ya amount+amount_currency (örn. 10000 TRY) ya da quantity (adet) ver, ikisini birden verme.",
    input_schema: {
      type: "object",
      properties: {
        asset_type: assetTypeProp,
        symbol: { type: "string" },
        amount: numProp("Yatırılacak tutar"),
        amount_currency: currencyProp,
        quantity: numProp("Adet"),
        note: { type: "string" },
      },
      required: ["asset_type", "symbol"],
    },
  },
  {
    name: "promote_sanal_to_gercek",
    description:
      "'Gerçekten aldım': bir varlığın sanal pozisyonunu arşivler ve gerçek portföye alış işlemi ekler. quantity verilmezse sanal pozisyonun adedi, price verilmezse güncel piyasa fiyatı, date verilmezse bugün kullanılır.",
    input_schema: {
      type: "object",
      properties: {
        asset_type: assetTypeProp,
        symbol: { type: "string" },
        quantity: numProp("Gerçekte alınan adet"),
        price: numProp("Gerçekte ödenen birim fiyat"),
        currency: currencyProp,
        date: { type: "string", description: "YYYY-MM-DD" },
        note: { type: "string" },
        account: accountProp,
        fee: numProp("Komisyon tutarı (işlem para biriminde); verilmezse hesabın varsayılan oranı"),
      },
      required: ["asset_type", "symbol"],
    },
  },
  {
    name: "add_transaction",
    description: "Portföye elle alış/satış işlemi ekler (birim fiyat ve adet bilinen gerçekleşmiş işlem).",
    input_schema: {
      type: "object",
      properties: {
        mode: modeProp,
        asset_type: assetTypeProp,
        symbol: { type: "string" },
        side: { type: "string", enum: ["buy", "sell"] },
        quantity: numProp("Adet"),
        price: numProp("Birim fiyat"),
        currency: currencyProp,
        date: { type: "string", description: "YYYY-MM-DD; verilmezse bugün" },
        note: { type: "string" },
        account: accountProp,
        fee: numProp("Komisyon / ücret tutarı (işlem para biriminde). Verilmezse hesabın varsayılan komisyon oranı uygulanır."),
        fee_pct: numProp("Komisyon yüzdesi (örn. 0,2); fee yerine"),
      },
      required: ["mode", "asset_type", "symbol", "side", "quantity", "price", "currency"],
    },
  },
  {
    name: "place_order",
    description:
      "Koşullu al/sat emri verir (yalnızca uygulama içinde; aracı kurum yok). Koşul sağlanınca işlem otomatik kaydedilir. trigger_price varlığın fiyat biriminde olmalı (BIST: TRY, kripto: USD, yabancı hisse: USD, gram altın: TRY, döviz: TRY). Ya amount+amount_currency ya da quantity ver.",
    input_schema: {
      type: "object",
      properties: {
        mode: modeProp,
        asset_type: assetTypeProp,
        symbol: { type: "string" },
        side: { type: "string", enum: ["buy", "sell"] },
        condition: { type: "string", enum: ["lte", "gte"], description: "lte: fiyat ≤ tetik (düşerse), gte: fiyat ≥ tetik (yükselirse)" },
        trigger_price: numProp("Tetik fiyatı"),
        amount: numProp("Tutar"),
        amount_currency: currencyProp,
        quantity: numProp("Adet"),
        note: { type: "string" },
        account: accountProp,
      },
      required: ["mode", "asset_type", "symbol", "side", "condition", "trigger_price"],
    },
  },
  {
    name: "cancel_order",
    description: "Bekleyen bir emri iptal eder.",
    input_schema: { type: "object", properties: { order_id: { type: "integer" } }, required: ["order_id"] },
  },
  {
    name: "list_orders",
    description: "Emirleri listeler (varsayılan: tümü, en yeni önce).",
    input_schema: { type: "object", properties: { status: { type: "string", enum: ["pending", "executed", "cancelled", "failed"] } } },
  },
  {
    name: "get_latest_news_report",
    description: "Uygulamanın son haber analizi raporunu getirir (varlık başına duygu, önem, özet, kaynaklar). symbol verilirse yalnızca o varlığın maddesi döner.",
    input_schema: { type: "object", properties: { asset_type: assetTypeProp, symbol: { type: "string" } } },
  },
  {
    name: "get_technical_signals",
    description:
      "Bir varlığın teknik analizini getirir: günlük kapanışlarla RSI(14), MACD(12,26,9), SMA/EMA 20/50/200, Bollinger(20,2), hacim oranı ve bunlardan çıkan özet sinyal (Güçlü Al / Al / Nötr / Sat / Güçlü Sat) ile nedenleri. Kullanıcıya anlatırken sade dil kullan ve teknik sinyallerin geleceği garanti etmediğini, yatırım tavsiyesi olmadığını belirt. asset_type verilmezse sembolden tahmin edilir (THYAO.IS → bist, BTCUSDT → crypto, diğerleri → foreign).",
    input_schema: { type: "object", properties: { asset_type: assetTypeProp, symbol: { type: "string" } }, required: ["symbol"] },
  },
  {
    name: "list_dividends",
    description:
      "Temettüleri (kâr payı) listeler: onaylanıp gelir olarak kaydedilenler (yıllara göre TL toplam), elde tutulurken ödenmiş ama henüz onaylanmamış öneriler ve elde tutulan hisselerin temettü geçmişi. symbol verilirse yalnızca o hissenin geçmişi ve kayıtları döner. Temettüler kullanıcı Temettü sayfasında onaylayınca gerçekleşen K/Z'ye eklenir.",
    input_schema: { type: "object", properties: { asset_type: { type: "string", enum: ["bist", "foreign"] }, symbol: { type: "string" } } },
  },
  {
    name: "get_kap_disclosures",
    description:
      "Bir BIST hissesinin son KAP (Kamuyu Aydınlatma Platformu) bildirimlerini getirir: şirketin resmi açıklamaları (bilanço, kâr payı, yeni iş, pay geri alımı…), başlık, özet, zaman ve kap.org.tr bağlantısı. Ücretsizdir; bir hisse hakkında güncel gelişme sorulursa web aramasından ÖNCE buna bak. Yalnızca portföy ve izleme listesindeki hisselerin bildirimleri saklanır.",
    input_schema: { type: "object", properties: { symbol: { type: "string", description: "BIST kodu, örn. THYAO" }, hours: { type: "number", description: "Kaç saat geriye (varsayılan 168)" } }, required: ["symbol"] },
  },
  {
    name: "get_headlines",
    description:
      "Bir varlığın son 1 günlük haber BAŞLIKLARINI getirir (Google Haberler ve yabancı hisse/kripto için Yahoo Finance RSS; ÜCRETSİZ). Her başlık yayıncı, zaman ve bağlantıyla gelir. Güncel haber sorulduğunda web_search'ten ÖNCE bunu kullan; yanıtta haberin bağlantısını ver.",
    input_schema: { type: "object", properties: { asset_type: assetTypeProp, symbol: { type: "string" } }, required: ["symbol"] },
  },
  {
    name: "create_alarm",
    description:
      "İşlem YAPMAYAN bir alarm kurar: koşul sağlanınca kullanıcıya bildirim + push gelir. Türler: price (fiyat eşiği; direction up = üstüne çıkarsa, down = altına inerse; threshold varlığın fiyat biriminde), day_change (bir günde % değişim; threshold yüzde, örn. 5; direction up/down/both), cost_change (pozisyonun TL maliyetine göre % kâr/zarar; mode real/virtual), volume_spike (bugünkü hacim / 20 günlük ortalama; threshold kat, örn. 2), signal_change (teknik özet sinyal değişimi; threshold yok). scope=watchlist: izleme listesindeki herhangi bir varlık (yalnızca day_change, volume_spike, signal_change). repeat: once (tek sefer, varsayılan) ya da every (her seferinde, cooldown_min dakika arayla). Kullanıcı 'haber ver', 'uyar', 'alarm' derse bunu kullan; 'al'/'sat' derse emir (place_order) kullan.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["price", "day_change", "cost_change", "volume_spike", "signal_change"] },
        scope: { type: "string", enum: ["asset", "watchlist"] },
        asset_type: assetTypeProp,
        symbol: { type: "string" },
        mode: modeProp,
        direction: { type: "string", enum: ["up", "down", "both"] },
        threshold: numProp("Eşik: fiyat, yüzde ya da kat"),
        repeat: { type: "string", enum: ["once", "every"] },
        cooldown_min: numProp("Her seferinde alarmda iki bildirim arası en az dakika (varsayılan 60)"),
        note: { type: "string" },
        account: { ...accountProp, description: "cost_change alarmında hangi hesabın pozisyonu (verilmezse tüm hesaplar). Diğer türlerde etiket." },
      },
      required: ["kind"],
    },
  },
  {
    name: "list_alarms",
    description: "Kurulu alarmları (açık/kapalı, koşul, kaç kez çaldı) ve son çalan alarmları listeler.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "delete_alarm",
    description: "Bir alarmı siler.",
    input_schema: { type: "object", properties: { alarm_id: { type: "integer" } }, required: ["alarm_id"] },
  },
];

const TOOL_LABELS: Record<string, string> = {
  get_portfolio_summary: "Portföye bakılıyor",
  get_quote: "Fiyat alınıyor",
  search_symbol: "Sembol aranıyor",
  create_sanal_position: "Sanal pozisyon açılıyor",
  promote_sanal_to_gercek: "Gerçek portföye aktarılıyor",
  add_transaction: "İşlem ekleniyor",
  place_order: "Emir veriliyor",
  cancel_order: "Emir iptal ediliyor",
  list_orders: "Emirlere bakılıyor",
  get_latest_news_report: "Haber raporuna bakılıyor",
  get_technical_signals: "Teknik göstergelere bakılıyor",
  list_dividends: "Temettülere bakılıyor",
  get_kap_disclosures: "KAP bildirimlerine bakılıyor",
  get_headlines: "Haber başlıklarına bakılıyor",
  create_alarm: "Alarm kuruluyor",
  list_alarms: "Alarmlara bakılıyor",
  delete_alarm: "Alarm siliniyor",
  web_search: "Webde aranıyor",
};

export function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}

// ---- Yardımcılar ----------------------------------------------------------------

type Input = Record<string, unknown>;

const AI_NOTE = "Yapay zeka sohbetiyle";
const modeName = (m: Mode) => (m === "real" ? "gerçek" : "sanal");
const r = (v: number | null | undefined, d = 4) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

function ref(i: Input): { assetType: AssetType; symbol: string } {
  if (!isAssetType(i.asset_type)) throw new actions.ValidationError("asset_type geçersiz.");
  const symbol = normalizeSymbol(i.asset_type, String(i.symbol ?? ""));
  if (!symbol) throw new actions.ValidationError("symbol eksik.");
  return { assetType: i.asset_type, symbol };
}

/** asset_type verilmediğinde sembolden tahmin: THYAO.IS → bist, BTCUSDT / BTC-TRY / BTC@BTCTURK → crypto, diğerleri → foreign */
function guessRef(raw: string): { assetType: AssetType; symbol: string } {
  const up = raw.trim().toLocaleUpperCase("en-US");
  if (!up) throw new actions.ValidationError("symbol eksik.");
  if (up.endsWith(".IS")) return { assetType: "bist", symbol: normalizeSymbol("bist", up) };
  if (/USDT$|@(BTCTURK|BINANCE|BINANCE[-_]F|BINANCE[-_]ALPHA|COINGECKO)$|^[A-Z0-9]+[-/](TRY|USDT)$/.test(up)) return { assetType: "crypto", symbol: normalizeSymbol("crypto", up) };
  if (up === "GRAM" || up === "ALTIN") return { assetType: "gold", symbol: "GRAM" };
  return { assetType: "foreign", symbol: normalizeSymbol("foreign", up) };
}

/** "20.11.2026 15:40 (İstanbul)" — her rakamın yanında söylenecek veri zamanı */
const dataTime = (ms: number | null | undefined) =>
  ms ? `${new Date(ms).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })} (İstanbul)` : null;

const opt = <T,>(v: unknown): T | undefined => (v === null || v === undefined || v === "" ? undefined : (v as T));
/** account adı → hesap kimliği (gerçek portföy); bilinmeyen ad doğrulama hatası verir */
async function accountIdOf(i: Input): Promise<number | null> {
  const name = typeof i.account === "string" ? i.account.trim() : "";
  if (!name) return null;
  const all = await actions.listAccounts({ includeArchived: true });
  const key = name.toLocaleLowerCase("tr-TR");
  const acc = all.find((a) => a.name.toLocaleLowerCase("tr-TR") === key) ?? all.find((a) => a.name.toLocaleLowerCase("tr-TR").includes(key));
  if (!acc) throw new actions.ValidationError(`"${name}" adında hesap yok. Hesaplar: ${all.filter((a) => !a.archived).map((a) => a.name).join(", ")}.`);
  return acc.id;
}
const accountLabel = async (id: number | null | undefined) => (id != null ? ((await actions.listAccounts({ includeArchived: true })).find((a) => a.id === id)?.name ?? null) : null);
const note = (i: Input, ctx: ToolContext) => {
  const tag = ctx.note ?? AI_NOTE;
  return typeof i.note === "string" && i.note.trim() ? `${i.note.trim()} · ${tag}` : tag;
};

function sizingLine(o: { amount: number | null; amountCurrency: string | null; quantity: number | null }) {
  return o.amount != null ? `${formatMoney(o.amount, o.amountCurrency ?? "TRY")} tutarında` : `${formatQuantity(o.quantity ?? 0)} adet`;
}

// ---- Çalıştırma -------------------------------------------------------------------

/** Aracı kim çağırıyor: note, işlem / emir notuna eklenen etiket (varsayılan "Yapay zeka sohbetiyle"). */
export interface ToolContext {
  note?: string;
}

/** Aracı çalıştırır. Hata fırlatmaz: doğrulama hataları isError sonuç + hata kartı olur. */
export async function executeChatTool(name: string, rawInput: unknown, ctx: ToolContext = {}): Promise<ToolOutcome> {
  const input = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Input;
  try {
    return await run(name, input, ctx);
  } catch (err) {
    const message = err instanceof actions.ValidationError ? err.message : "İşlem sırasında beklenmeyen bir hata oluştu.";
    if (!(err instanceof actions.ValidationError)) console.error(`[sohbet] ${name} hatası`, err);
    return {
      result: { hata: message },
      isError: true,
      card: MUTATING.has(name) ? { tone: "error", title: ERROR_TITLES[name] ?? "İşlem yapılamadı", lines: [message] } : undefined,
    };
  }
}

const ERROR_TITLES: Record<string, string> = {
  create_sanal_position: "Sanal pozisyon açılamadı",
  promote_sanal_to_gercek: "Gerçek portföye aktarılamadı",
  add_transaction: "İşlem eklenemedi",
  place_order: "Emir verilemedi",
  cancel_order: "Emir iptal edilemedi",
  create_alarm: "Alarm kurulamadı",
  delete_alarm: "Alarm silinemedi",
};
const MUTATING = new Set(Object.keys(ERROR_TITLES));
/** Değişiklik yapan (yazma) araçları */
export function isMutatingTool(name: string): boolean {
  return MUTATING.has(name);
}

async function run(name: string, i: Input, ctx: ToolContext): Promise<ToolOutcome> {
  switch (name) {
    case "get_portfolio_summary": {
      const mode: Mode = i.mode === "virtual" ? "virtual" : "real";
      const account = mode === "real" ? await accountIdOf(i) : null;
      const p = await actions.getPortfolioSummary(mode, { account });
      return {
        result: {
          portfoy: modeName(mode),
          hesap: account != null ? await accountLabel(account) : mode === "real" ? "toplama dahil tüm hesaplar" : null,
          veri_zamani: dataTime(p.updatedAt),
          ...(mode === "real"
            ? {
                hesaplar: p.accounts.map((a) => ({
                  hesap: a.name,
                  toplama_dahil: a.includeInTotal,
                  deger_tl: r(a.valueTry, 2),
                  kz_tl: r(a.pnlTry, 2),
                  varsayilan_komisyon_yuzde: a.feePct,
                })),
              }
            : {}),
          toplam: {
            deger_tl: r(p.totals.valueTry, 2),
            maliyet_tl: r(p.totals.costTry, 2),
            kz_tl: r(p.totals.pnlTry, 2),
            kz_yuzde: r(p.totals.pnlPct, 2),
            gerceklesen_kz_tl: r(p.totals.realizedPnlTry, 2),
            odenen_komisyon_tl: r(p.totals.feesTry, 2),
            yillik_getiri_yuzde_xirr: r(p.totals.annual?.pct, 2),
            ...(p.totals.annual?.short ? { toplam_getiri_yuzde: r(p.totals.annual.totalPct, 2), yillik_getiri_notu: p.totals.annual.note } : {}),
            eksik_fiyat_var: p.totals.incomplete,
          },
          pozisyonlar: p.holdings.map((h) => ({
            asset_type: h.assetType,
            symbol: h.symbol,
            adet: r(h.quantity, 8),
            ort_maliyet: r(h.avgCost),
            guncel_fiyat: r(h.price),
            para_birimi: h.currency,
            deger_tl: r(h.valueTry, 2),
            kz_tl: r(h.pnlTry, 2),
            ...(h.fxEffectTry != null ? { kz_tl_fiyat_etkisi: r(h.priceEffectTry, 2), kz_tl_kur_etkisi: r(h.fxEffectTry, 2) } : {}),
            kz_yuzde: r(h.pnlPct, 2),
            yillik_getiri_yuzde_xirr: r(h.annual?.pct, 2),
            ...(h.annual?.short ? { toplam_getiri_yuzde: r(h.annual.totalPct, 2), yillik_getiri_notu: h.annual.note } : {}),
            ...(h.accounts.length ? { hesaplar: h.accounts.map((a) => `${a.name}: ${formatQuantity(a.quantity)}`) } : {}),
            gun: h.days,
            fiyat_zamani: dataTime(h.sourceTime ?? h.fetchedAt),
            fiyat_eski: h.stale,
          })),
        },
      };
    }

    case "get_quote": {
      const list = (Array.isArray(i.instruments) ? i.instruments : []).slice(0, 10).map((x) => ref((x ?? {}) as Input));
      if (list.length === 0) throw new actions.ValidationError("En az bir varlık verin.");
      const quotes = await actions.getPrices(list.map((x) => ({ type: x.assetType, symbol: x.symbol })));
      return {
        result: quotes.map((q, k) => ({
          asset_type: list[k].assetType,
          symbol: list[k].symbol,
          veri_zamani: dataTime(q.sourceTime ?? q.fetchedAt),
          kaynak: q.source || null,
          ...(q.delayed ? { gecikmeli_15dk: true } : {}),
          fiyat: r(q.price, 6),
          para_birimi: q.currency || null,
          gunluk_degisim_yuzde: r(q.changePct, 2),
          eski_fiyat: q.stale,
          hata: q.price == null ? "Fiyat alınamadı; sembolü kontrol edin." : undefined,
        })),
      };
    }

    case "search_symbol": {
      const res = await actions.searchSymbols(String(i.query ?? ""));
      return { result: res.slice(0, 20).map((s) => ({ asset_type: s.assetType, symbol: s.symbol, ad: s.name, borsa: s.exchange, para_birimi: s.currency || null, liste: CATALOG_CATEGORY_LABEL[s.category] })) };
    }

    case "create_sanal_position": {
      const a = ref(i);
      const quantity = opt<number>(i.quantity);
      const amount = opt<number>(i.amount);
      if (quantity == null && amount == null) throw new actions.ValidationError("Tutar ya da adet belirtilmeli.");
      const amountCurrency = isCurrency(i.amount_currency) ? i.amount_currency : "TRY";
      const tx = await actions.createSanalPosition({
        ...a,
        ...(quantity != null ? { quantity } : { amount, amountCurrency }),
        note: note(i, ctx),
      });
      const name = displaySymbol(tx.assetType, tx.symbol);
      return {
        result: { tamam: true, islem_id: tx.id, adet: r(tx.quantity, 8), fiyat: r(tx.price), para_birimi: tx.currency, tutar: tx.amount, tarih: tx.date },
        card: {
          tone: "ok",
          title: `Sanal pozisyon açıldı: ${name}`,
          lines: [
            `${formatQuantity(tx.quantity)} adet × ${formatMoney(tx.price, tx.currency, 4)}`,
            tx.amount != null ? `Yatırılan: ${formatMoney(tx.amount, tx.amountCurrency ?? "TRY")}` : `Toplam: ${formatMoney(tx.quantity * tx.price, tx.currency)}`,
            `Tarih: ${tx.date}`,
          ],
          href: "/",
        },
      };
    }

    case "promote_sanal_to_gercek": {
      const a = ref(i);
      const virtual = await actions.getPortfolioSummary("virtual");
      const h = virtual.holdings.find((x) => x.assetType === a.assetType && x.symbol === a.symbol);
      if (!h) throw new actions.ValidationError(`Sanal portföyde ${displaySymbol(a.assetType, a.symbol)} pozisyonu yok.`);
      const quantity = opt<number>(i.quantity) ?? h.quantity;
      let price = opt<number>(i.price);
      let currency = isCurrency(i.currency) ? i.currency : undefined;
      let priceNote = "";
      if (price == null) {
        const [q] = await actions.getPrices([{ type: a.assetType, symbol: a.symbol }], { force: true });
        if (q.price == null || q.stale) throw new actions.ValidationError("Güncel fiyat alınamadı; ödediğiniz fiyatı belirtin.");
        if (!isCurrency(q.currency)) throw new actions.ValidationError(`Fiyat birimi ${q.currency}; ödediğiniz fiyatı TRY/USD/EUR olarak belirtin.`);
        price = q.price;
        currency = q.currency;
        priceNote = " (güncel piyasa fiyatı)";
      }
      if (!currency) currency = isCurrency(h.currency) ? h.currency : "TRY";
      const tx = await actions.promoteSanalToGercek({
        ...a,
        quantity,
        price,
        currency,
        date: typeof i.date === "string" && i.date ? i.date : todayIstanbul(),
        note: note(i, ctx),
        accountId: await accountIdOf(i),
        fee: opt<number>(i.fee) ?? null,
      });
      const name = displaySymbol(tx.assetType, tx.symbol);
      return {
        result: { tamam: true, gercek_islem_id: tx.id, adet: r(tx.quantity, 8), fiyat: r(tx.price), para_birimi: tx.currency, tarih: tx.date, fiyat_kaynagi: priceNote ? "güncel piyasa fiyatı" : "kullanıcı" },
        card: {
          tone: "ok",
          title: `Gerçek portföye aktarıldı: ${name}`,
          lines: [
            `${formatQuantity(tx.quantity)} adet × ${formatMoney(tx.price, tx.currency, 4)}${priceNote}`,
            `Toplam: ${formatMoney(tx.quantity * tx.price, tx.currency)} · Tarih: ${tx.date}`,
            `Hesap: ${(await accountLabel(tx.accountId)) ?? "—"}${tx.fee > 0 ? ` · Komisyon: ${formatMoney(tx.fee, tx.currency)}` : ""}`,
            "Sanal kayıt arşivlendi. Gerçek fiyat farklıysa İşlemler sayfasından düzeltebilirsiniz.",
          ],
          href: "/islemler",
        },
      };
    }

    case "add_transaction": {
      const a = ref(i);
      const mode: Mode = i.mode === "virtual" ? "virtual" : "real";
      if (!isCurrency(i.currency)) throw new actions.ValidationError("Para birimi TRY, USD ya da EUR olmalı.");
      const tx = await actions.addTransaction({
        mode,
        ...a,
        side: i.side === "sell" ? "sell" : "buy",
        quantity: i.quantity as number,
        price: i.price as number,
        currency: i.currency,
        date: typeof i.date === "string" && i.date ? i.date : todayIstanbul(),
        note: note(i, ctx),
        accountId: mode === "real" ? await accountIdOf(i) : null,
        fee: opt<number>(i.fee) ?? null,
        feePct: opt<number>(i.fee_pct) ?? null,
      });
      const name = displaySymbol(tx.assetType, tx.symbol);
      return {
        result: { tamam: true, islem_id: tx.id, hesap: await accountLabel(tx.accountId), komisyon: r(tx.fee, 4) },
        card: {
          tone: "ok",
          title: `İşlem eklendi: ${name} ${tx.side === "buy" ? "alış" : "satış"}`,
          lines: [
            `${formatQuantity(tx.quantity)} adet × ${formatMoney(tx.price, tx.currency, 4)} = ${formatMoney(tx.quantity * tx.price, tx.currency)}`,
            `${modeName(tx.mode)} portföy${tx.accountId != null ? ` · ${await accountLabel(tx.accountId)}` : ""} · ${tx.date}${tx.fee > 0 ? ` · komisyon ${formatMoney(tx.fee, tx.currency)}` : ""}`,
          ],
          href: "/islemler",
        },
      };
    }

    case "place_order": {
      const a = ref(i);
      const quantity = opt<number>(i.quantity);
      const amount = opt<number>(i.amount);
      if (quantity == null && amount == null) throw new actions.ValidationError("Tutar ya da adet belirtilmeli.");
      const o = await actions.placeOrder(
        {
          mode: i.mode === "virtual" ? "virtual" : "real",
          ...a,
          side: i.side === "sell" ? "sell" : "buy",
          condition: i.condition === "gte" ? "gte" : "lte",
          triggerPrice: i.trigger_price as number,
          ...(quantity != null ? { quantity } : { amount, amountCurrency: isCurrency(i.amount_currency) ? i.amount_currency : "TRY" }),
          note: note(i, ctx),
          accountId: i.mode === "virtual" ? null : await accountIdOf(i),
        },
        "yapay_zeka",
      );
      const name = displaySymbol(o.assetType, o.symbol);
      const statusText = { pending: "bekliyor", executed: "hemen gerçekleşti", cancelled: "iptal", failed: `başarısız: ${o.error ?? ""}` }[o.status];
      return {
        result: { tamam: true, emir_id: o.id, durum: o.status, tetik_para_birimi: o.triggerCurrency, hata: o.error ?? undefined },
        card: {
          tone: o.status === "failed" ? "error" : "ok",
          title: `Emir verildi #${o.id}: ${name} ${o.side === "buy" ? "alış" : "satış"}`,
          lines: [
            `Koşul: fiyat ${o.condition === "lte" ? "≤" : "≥"} ${formatMoney(o.triggerPrice, o.triggerCurrency, 4)}`,
            `Miktar: ${sizingLine(o)} · ${modeName(o.mode)} portföy${o.accountName ? ` · ${o.accountName}` : ""}`,
            `Durum: ${statusText}`,
          ],
          href: "/emirler",
        },
      };
    }

    case "cancel_order": {
      const id = Number(i.order_id);
      if (!Number.isInteger(id) || id <= 0) throw new actions.ValidationError("Emir numarası geçersiz.");
      const o = await actions.cancelOrder(id);
      if (!o) throw new actions.ValidationError(`#${id} numaralı emir bulunamadı.`);
      return {
        result: { tamam: true, emir_id: o.id, durum: o.status },
        card: {
          tone: "ok",
          title: `Emir iptal edildi #${o.id}`,
          lines: [`${displaySymbol(o.assetType, o.symbol)} ${o.side === "buy" ? "alış" : "satış"} · fiyat ${o.condition === "lte" ? "≤" : "≥"} ${formatMoney(o.triggerPrice, o.triggerCurrency, 4)}`],
          href: "/emirler",
        },
      };
    }

    case "list_orders": {
      const status = ["pending", "executed", "cancelled", "failed"].includes(String(i.status)) ? (i.status as actions.OrderStatus) : undefined;
      return {
        result: (await actions.listOrders(status)).slice(0, 30).map((o) => ({
          emir_id: o.id,
          portfoy: modeName(o.mode),
          asset_type: o.assetType,
          symbol: o.symbol,
          yon: o.side,
          kosul: `${o.condition === "lte" ? "<=" : ">="} ${o.triggerPrice} ${o.triggerCurrency}`,
          miktar: o.amount != null ? `${o.amount} ${o.amountCurrency}` : `${o.quantity} adet`,
          durum: o.status,
          kaynak: o.source,
          olusturma: o.createdAt,
          gerceklesme: o.executedAt,
          gerceklesme_fiyati: o.executedPrice,
          hata: o.error,
        })),
      };
    }

    case "get_latest_news_report": {
      const one = i.asset_type && i.symbol ? ref(i) : null;
      const instrument = one ? `${one.assetType}:${one.symbol}` : undefined;
      const rep = await getLatestReport(instrument);
      if (!rep) return { result: { rapor: null, aciklama: "Henüz haber analizi raporu yok. Kullanıcı Analizler sayfasından 'Şimdi analiz et' diyebilir." } };
      return {
        result: {
          rapor_id: rep.id,
          tarih_utc: rep.finishedAt ?? rep.createdAt,
          piyasa_ozeti: rep.marketSummary,
          maddeler: rep.items
            .filter((x) => !instrument || x.instrument === instrument)
            .map((x) => ({
              asset_type: x.assetType,
              symbol: x.symbol,
              duygu: x.sentiment,
              onem: x.importance,
              ozet: x.summary,
              pozisyona_etkisi: x.positionImpact,
              kaynaklar: x.sources,
            })),
        },
      };
    }

    case "get_technical_signals": {
      const a = i.asset_type ? ref(i) : guessRef(String(i.symbol ?? ""));
      const t = await actions.getTechnicalSignals({ type: a.assetType, symbol: a.symbol });
      const s = t.snapshot;
      return {
        result: {
          asset_type: t.assetType,
          symbol: t.symbol,
          son_kapanis: r(s.close, 6),
          para_birimi: t.currency,
          veri_tarihi_utc: t.asOf ? new Date(t.asOf * 1000).toISOString().slice(0, 10) : null,
          gun_sayisi: s.bars,
          sinyal: t.summary.label,
          puan: t.summary.score,
          sinyal_aciklamasi: t.labelExplain,
          nedenler: t.summary.reasons.map((x) => ({ neden: x.title, puan: x.points, aciklama: x.explain })),
          gostergeler: {
            rsi14: r(s.rsi, 2),
            macd: r(s.macd, 6),
            macd_sinyal: r(s.macdSignal, 6),
            macd_histogram: r(s.macdHist, 6),
            sma20: r(s.sma20, 6),
            sma50: r(s.sma50, 6),
            sma200: r(s.sma200, 6),
            ema20: r(s.ema20, 6),
            ema50: r(s.ema50, 6),
            ema200: r(s.ema200, 6),
            bollinger_ust: r(s.bbUpper, 6),
            bollinger_orta: r(s.bbMiddle, 6),
            bollinger_alt: r(s.bbLower, 6),
            hacim_ortalama_orani: r(s.volumeRatio, 2),
            ...(s.volumePartial ? { hacim_gun_ici_kismi: true } : {}),
          },
          uyari: "Teknik sinyaller geçmiş fiyatlara dayanır, geleceği garanti etmez; yatırım tavsiyesi değildir.",
        },
      };
    }

    case "list_dividends": {
      const one = i.symbol ? (i.asset_type ? ref(i) : guessRef(String(i.symbol))) : null;
      if (one) {
        const h = await actions.getDividendHistory({ type: one.assetType, symbol: one.symbol });
        const records = (await actions.listDividends({ status: "confirmed" })).filter((d) => d.assetType === one.assetType && d.symbol === one.symbol);
        const sugg = (await actions.getDividendSuggestions()).filter((d) => d.assetType === one.assetType && d.symbol === one.symbol);
        return {
          result: {
            asset_type: one.assetType,
            symbol: one.symbol,
            para_birimi: h.currency,
            gecmis: h.events.slice(-20).map((e) => ({ hak_kullanim_tarihi: e.date, pay_basina: r(e.amount, 6) })),
            gecmis_eski: h.stale || undefined,
            kaydedilenler: records.map((d) => ({ portfoy: modeName(d.mode), tarih: d.exDate, adet: r(d.quantity, 6), tutar: r(d.amount, 2), para_birimi: d.currency, tutar_tl: r(d.amountTry, 2) })),
            onay_bekleyen: sugg.map((d) => ({ portfoy: modeName(d.mode), tarih: d.exDate, adet: r(d.quantity, 6), tutar: r(d.amount, 2), para_birimi: d.currency })),
            aciklama: "Tutarlar brüttür; BIST'te stopaj (vergi kesintisi) sonrası hesaba daha az geçebilir.",
          },
        };
      }
      const o = await actions.getDividendOverview();
      return {
        result: {
          alinan_toplam_tl_gercek: r(o.receivedTotalTry, 2),
          yillar: o.received.map((y) => ({
            yil: y.year,
            toplam_tl_gercek: r(y.totalTry, 2),
            kayitlar: y.items.map((d) => ({ portfoy: modeName(d.mode), symbol: d.symbol, tarih: d.exDate, tutar: r(d.amount, 2), para_birimi: d.currency, tutar_tl: r(d.amountTry, 2) })),
          })),
          onay_bekleyen: o.suggestions.map((d) => ({ portfoy: modeName(d.mode), symbol: d.symbol, tarih: d.exDate, adet: r(d.quantity, 6), tutar: r(d.amount, 2), para_birimi: d.currency })),
          yaklasan: o.upcoming.slice(0, 10).map((u) => ({ symbol: u.symbol, tarih: u.date, baslik: u.title, ayrinti: u.detail, baglanti: u.url })),
          hisseler: o.holdings.map((h) => ({ symbol: h.symbol, son_temettuler: h.history.events.slice(-4).map((e) => `${e.date}: ${r(e.amount, 4)} ${h.history.currency}`) })),
          aciklama: "Onay bekleyen temettüler kullanıcı Temettü sayfasında onaylayınca gerçekleşen K/Z'ye eklenir.",
        },
      };
    }

    case "get_kap_disclosures": {
      const sym = normalizeSymbol("bist", String(i.symbol ?? ""));
      if (!sym) throw new actions.ValidationError("symbol eksik.");
      const hours = Math.min(24 * 60, Math.max(1, Number(i.hours) || 168));
      const items = await actions.listKapDisclosures({ ticker: sym, sinceMs: Date.now() - hours * 3600_000, limit: 20 });
      return {
        result: {
          symbol: sym,
          bildirimler: items.map((d) => ({
            zaman: new Date(d.publishAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }),
            konu: d.subject,
            ozet: d.summary,
            baglanti: d.url,
          })),
          aciklama: items.length === 0 ? "Bu süre içinde saklanmış KAP bildirimi yok (yalnızca portföy ve izleme listesindeki hisseler takip edilir)." : undefined,
        },
      };
    }

    case "get_headlines": {
      const a = i.asset_type ? ref(i) : guessRef(String(i.symbol ?? ""));
      const set = await getHeadlines(a.assetType, a.symbol, { limit: 10 });
      return {
        result: {
          asset_type: a.assetType,
          symbol: a.symbol,
          veri_zamani: dataTime(set.fetchedAt),
          eski: set.stale || undefined,
          basliklar: set.items.map((h) => ({ baslik: h.title, yayinci: h.publisher, zaman: dataTime(h.publishedAt), baglanti: h.url })),
          aciklama: set.items.length === 0 ? "Son 1 günde başlık bulunamadı." : "Başlıklar yalnızca başlıktır; haberin tamamını okumadan kesin yorum yapma.",
        },
      };
    }

    case "create_alarm": {
      const scope = i.scope === "watchlist" ? "watchlist" : "asset";
      const a = scope === "asset" ? (i.asset_type ? ref(i) : guessRef(String(i.symbol ?? ""))) : null;
      const alarm = await actions.createAlarm(
        {
          kind: i.kind as actions.AlarmKind,
          scope,
          ...(a ? { assetType: a.assetType, symbol: a.symbol } : {}),
          mode: i.mode === "virtual" ? "virtual" : "real",
          direction: i.direction === "up" || i.direction === "down" ? i.direction : "both",
          threshold: opt<number>(i.threshold),
          repeat: i.repeat === "every" ? "every" : "once",
          cooldownMin: opt<number>(i.cooldown_min),
          note: typeof i.note === "string" ? i.note : null,
          accountId: await accountIdOf(i),
        },
        "yapay_zeka",
      );
      return {
        result: { tamam: true, alarm_id: alarm.id, kosul: alarm.description, tekrar: alarm.repeat, acik: alarm.active, calma_sayisi: alarm.fireCount },
        card: {
          tone: "ok",
          title: `Alarm kuruldu #${alarm.id}`,
          lines: [alarm.description, alarm.repeat === "once" ? "Tek sefer çalar" : `Her seferinde, en az ${alarm.cooldownMin} dk arayla`, "Alarm işlem yapmaz; yalnızca bildirim gönderir."],
          href: "/alarmlar",
        },
      };
    }

    case "list_alarms": {
      return {
        result: {
          alarmlar: (await actions.listAlarms()).map((x) => ({ alarm_id: x.id, kosul: x.description, tekrar: x.repeat, bekleme_dk: x.cooldownMin, acik: x.active, calma_sayisi: x.fireCount, son_calma: x.lastFiredAt ? new Date(x.lastFiredAt).toISOString() : null })),
          son_calanlar: (await actions.listAlarmEvents(10)).map((e) => ({ zaman_utc: new Date(e.firedAt).toISOString(), mesaj: e.message })),
        },
      };
    }

    case "delete_alarm": {
      const id = Number(i.alarm_id);
      if (!Number.isInteger(id) || id <= 0) throw new actions.ValidationError("Alarm numarası geçersiz.");
      if (!(await actions.deleteAlarm(id))) throw new actions.ValidationError(`#${id} numaralı alarm bulunamadı.`);
      return { result: { tamam: true, alarm_id: id }, card: { tone: "ok", title: `Alarm silindi #${id}`, lines: [], href: "/alarmlar" } };
    }

    default:
      throw new actions.ValidationError(`Bilinmeyen araç: ${name}`);
  }
}
