// Testler için: Node'un TypeScript desteğiyle src/lib dosyalarını derlemeden çalıştırır.
// Uzantısız göreli importları (./db → ./db.ts) ve "@/..." takma adını çözer.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

registerHooks({
  resolve(specifier, context, next) {
    let spec = specifier;
    if (spec.startsWith("@/")) spec = pathToFileURL(path.join(SRC, spec.slice(2))).href;
    const isPath = spec.startsWith(".") || spec.startsWith("file:");
    if (isPath && !path.extname(spec)) {
      const base = spec.startsWith("file:") ? fileURLToPath(spec) : path.resolve(path.dirname(fileURLToPath(context.parentURL)), spec);
      for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (existsSync(cand)) return next(pathToFileURL(cand).href, context);
      }
    }
    return next(spec, context);
  },
});
