import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Tür bilgili kurallar: veritabanı katmanı eşzamansız (async) olduğundan unutulmuş
    // await'leri ve yanlış yerde kullanılan Promise'leri yakalar.
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
    },
  },
  globalIgnores([".next/**", ".next-test/**", "out/**", "build/**", "data/**", "next-env.d.ts"]),
]);
