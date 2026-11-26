// Midas'ta işlem gören kripto listesini yeniden üretir: src/lib/data/midasCoins.ts ([sembol, ad][]).
// Piyasa sayfasındaki "Midas" klasörü bu listeyle süzülür (uygulama Midas'ı çalışma anında okumaz).
// Geliştirici aracıdır; Midas yeni coin eklediğinde / çıkardığında elle çalıştırılır:
//   node --import ./scripts/ts-hooks.mjs scripts/update-midas-coins.ts            (sayfayı indirir)
//   node --import ./scripts/ts-hooks.mjs scripts/update-midas-coins.ts m.html     (kaydedilmiş sayfadan)
// Kaynak: https://www.getmidas.com/canli-kripto/ (tablo satırları: <a class="title stock-code"> içinde
// <span class="info">SEMBOL <span class="name">Ad</span>). Canlı fiyatı olmayan coinler (OMIT) yazılmaz.
// Yeni coin katalogda (Binance, BtcTurk, vadeli, Alpha) yoksa coingecko.ts listesine elle eklenmelidir;
// adı değişmiş coinler için midas.ts'teki MIDAS_ALIASES güncellenir.
import fs from "node:fs";
import path from "node:path";

const URL = "https://www.getmidas.com/canli-kripto/";
/** Midas'ta listeli ama hiçbir kaynakta güncel fiyatı olmayan coinler */
const OMIT = new Set(["TROY", "SLF"]);

const file = process.argv[2];
const html = file
  ? fs.readFileSync(file, "utf8")
  : await (async () => {
      const res = await fetch(URL, { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`${URL}: HTTP ${res.status}`);
      return await res.text();
    })();

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const re = /<a class="title stock-code" href="\/canli-kripto\/[^"]*">[\s\S]*?<span class="info">\s*([^\s<]+)\s*<span class="name">([^<]*)<\/span>/g;
const coins = new Map<string, string>();
const omitted: string[] = [];
for (const m of html.matchAll(re)) {
  const sym = m[1].toUpperCase();
  if (!/^[A-Z0-9]{1,15}$/.test(sym) || coins.has(sym)) continue;
  if (OMIT.has(sym)) {
    if (!omitted.includes(sym)) omitted.push(sym);
    continue;
  }
  coins.set(sym, decode(m[2]) || sym);
}
if (coins.size < 200) throw new Error(`Midas listesi eksik (${coins.size}); sayfa yapısı değişmiş olabilir`);

const today = new Date().toISOString().slice(0, 10);
const out = path.join(import.meta.dirname, "..", "src", "lib", "data", "midasCoins.ts");
const lines = [...coins].map(([s, n]) => `  [${JSON.stringify(s)}, ${JSON.stringify(n)}],`);
fs.writeFileSync(
  out,
  `// OTOMATİK ÜRETİLDİ (scripts/update-midas-coins.ts) — elle düzenlemeyin.\n` +
    `// Midas'ta işlem gören kriptolar (${URL}, ${today}): ${coins.size} coin, Midas'taki sırayla.\n` +
    `// Fiyatı olmadığı için alınmayanlar: ${omitted.join(", ") || "yok"}.\n` +
    `/** [sembol, ad] */\n` +
    `export const MIDAS_COINS: readonly (readonly [string, string])[] = [\n${lines.join("\n")}\n];\n`,
);
console.log(`${coins.size} coin (${omitted.length} alınmadı: ${omitted.join(", ")}) → ${out}`);
