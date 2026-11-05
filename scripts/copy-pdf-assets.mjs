import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
mkdirSync("public/pdf-assets", { recursive: true });
for (const name of ["cmaps", "standard_fonts", "wasm"]) {
  cpSync(join(root, name), join("public/pdf-assets", name), { recursive: true });
}
