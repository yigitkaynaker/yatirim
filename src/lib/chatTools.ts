import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import * as actions from "./actions";
import { ASSET_TYPES, displaySymbol, isAssetType, isCurrency, normalizeSymbol, type AssetType, type Mode } from "./assets";
import { formatMoney, formatQuantity } from "./format";
import { todayIstanbul } from "./portfolio";
import { getLatestReport } from "./news";

// SOHBET ARAÇLARI
// Claude'un çağırabildiği araçlar. Hepsi src/lib/actions.ts eylem katmanını
// kullanır; doğrulama orada yapılır. Değişiklik yapan araçlar sohbette
// gösterilecek bir "kart" (ne yapıldı, rakamlarla) üretir.

export interface ActionCard {
  tone: "ok" | "error";
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

const assetTypeProp = { type: "string", enum: [...ASSET_TYPES], description: "bist: BIST hissesi, foreign: yabancı hisse/endeks, crypto: kripto, fx: döviz, gold: gram altın (symbol GRAM)" };
const modeProp = { type: "string", enum: ["real", "virtual"], description: "real: gerçek portföy, virtual: sanal portföy" };
const currencyProp = { type: "string", enum: ["TRY", "USD", "EUR"] };
const numProp = (description: string) => ({ type: "number", description });

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_portfolio_summary",
    description: "Gerçek ya da sanal portföyün özetini getirir: pozisyonlar (adet, ortalama maliyet, güncel fiyat, değer, K/Z) ve TL toplamlar.",
    input_schema: { type: "object", properties: { mode: modeProp }, required: ["mode"] },
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
    description: "Sembol arar (şirket adı, kısaltma ya da \"altın\", \"dolar\" gibi Türkçe kelimeler). Doğru asset_type ve symbol'ü bulmak için kullan.",
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

const opt = <T,>(v: unknown): T | undefined => (v === null || v === undefined || v === "" ? undefined : (v as T));
const note = (i: Input) => (typeof i.note === "string" && i.note.trim() ? `${i.note.trim()} · ${AI_NOTE}` : AI_NOTE);

function sizingLine(o: { amount: number | null; amountCurrency: string | null; quantity: number | null }) {
  return o.amount != null ? `${formatMoney(o.amount, o.amountCurrency ?? "TRY")} tutarında` : `${formatQuantity(o.quantity ?? 0)} adet`;
}

// ---- Çalıştırma -------------------------------------------------------------------

/** Aracı çalıştırır. Hata fırlatmaz: doğrulama hataları isError sonuç + hata kartı olur. */
export async function executeChatTool(name: string, rawInput: unknown): Promise<ToolOutcome> {
  const input = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Input;
  try {
    return await run(name, input);
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
};
const MUTATING = new Set(Object.keys(ERROR_TITLES));

async function run(name: string, i: Input): Promise<ToolOutcome> {
  switch (name) {
    case "get_portfolio_summary": {
      const mode: Mode = i.mode === "virtual" ? "virtual" : "real";
      const p = await actions.getPortfolioSummary(mode);
      return {
        result: {
          portfoy: modeName(mode),
          toplam: {
            deger_tl: r(p.totals.valueTry, 2),
            maliyet_tl: r(p.totals.costTry, 2),
            kz_tl: r(p.totals.pnlTry, 2),
            kz_yuzde: r(p.totals.pnlPct, 2),
            gerceklesen_kz_tl: r(p.totals.realizedPnlTry, 2),
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
            kz_yuzde: r(h.pnlPct, 2),
            gun: h.days,
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
      return { result: res.slice(0, 8).map((s) => ({ asset_type: s.assetType, symbol: s.symbol, ad: s.name, borsa: s.exchange })) };
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
        note: note(i),
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
      const tx = actions.promoteSanalToGercek({
        ...a,
        quantity,
        price,
        currency,
        date: typeof i.date === "string" && i.date ? i.date : todayIstanbul(),
        note: note(i),
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
      const tx = actions.addTransaction({
        mode,
        ...a,
        side: i.side === "sell" ? "sell" : "buy",
        quantity: i.quantity as number,
        price: i.price as number,
        currency: i.currency,
        date: typeof i.date === "string" && i.date ? i.date : todayIstanbul(),
        note: note(i),
      });
      const name = displaySymbol(tx.assetType, tx.symbol);
      return {
        result: { tamam: true, islem_id: tx.id },
        card: {
          tone: "ok",
          title: `İşlem eklendi: ${name} ${tx.side === "buy" ? "alış" : "satış"}`,
          lines: [
            `${formatQuantity(tx.quantity)} adet × ${formatMoney(tx.price, tx.currency, 4)} = ${formatMoney(tx.quantity * tx.price, tx.currency)}`,
            `${modeName(tx.mode)} portföy · ${tx.date}`,
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
          note: note(i),
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
            `Miktar: ${sizingLine(o)} · ${modeName(o.mode)} portföy`,
            `Durum: ${statusText}`,
          ],
          href: "/emirler",
        },
      };
    }

    case "cancel_order": {
      const id = Number(i.order_id);
      if (!Number.isInteger(id) || id <= 0) throw new actions.ValidationError("Emir numarası geçersiz.");
      const o = actions.cancelOrder(id);
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
        result: actions.listOrders(status).slice(0, 30).map((o) => ({
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
      const rep = getLatestReport(instrument);
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

    default:
      throw new actions.ValidationError(`Bilinmeyen araç: ${name}`);
  }
}
