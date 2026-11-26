// ABD hisse / ETF anlık görüntüsünü üretir: src/lib/data/usSymbolsSnapshot.ts (gzip + base64 JSON).
// Katalog yenilemesinde Nasdaq Trader (HTTPS, FTP) ve GitHub aynasının hiçbiri olmazsa ve katalogda
// ABD listesi yoksa bu liste yazılır (bkz. catalog.ts). Kaynak: GitHub aynası (datasets/nasdaq-listings,
// datasets/nyse-other-listings). Ağ gerekir; ara sıra (örn. birkaç ayda bir) yeniden çalıştırılabilir.
//   node --conditions=react-server --import ./scripts/ts-hooks.mjs scripts/generate-us-symbols.ts
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const catalog = await import("../src/lib/catalog");

async function get(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return await res.text();
}

const [nasdaq, other] = await Promise.all([get(catalog.US_MIRROR["nasdaqlisted.txt"]), get(catalog.US_MIRROR["otherlisted.txt"])]);
const rows = catalog.parseUsSymbolDirectory(catalog.csvToPipe(nasdaq), catalog.csvToPipe(other));
if (rows.length < 3000) throw new Error(`ABD listesi eksik (${rows.length})`);
const snap = catalog.toUsSnapshot(rows, "github:datasets/nasdaq-listings + datasets/nyse-other-listings");
const gz = gzipSync(JSON.stringify(snap), { level: 9 }).toString("base64");

const out = path.join(import.meta.dirname, "..", "src", "lib", "data", "usSymbolsSnapshot.ts");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  `// OTOMATİK ÜRETİLDİ (scripts/generate-us-symbols.ts) — elle düzenlemeyin.\n` +
    `// ABD hisse / ETF listesinin son çare anlık görüntüsü: ${rows.length} satır, ${snap.generatedAt}.\n` +
    `// Biçim: gzip + base64 JSON { generatedAt, source, rows: [sembol, ad, borsa, etf][] } (catalog.ts UsSnapshot).\n` +
    `export const US_SYMBOLS_SNAPSHOT_GZ =\n  "${gz}";\n`,
);
const etf = rows.filter((r) => r.category === "etf").length;
console.log(`${rows.length} satır (${rows.length - etf} hisse, ${etf} ETF), ${(gz.length / 1024).toFixed(0)} KB → ${out}`);
