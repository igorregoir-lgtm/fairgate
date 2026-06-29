// check.mjs — syntax-check (`node --check`) de todo JS/MJS do projeto.
// Cross-platform; usado por `npm run check` e pelo CI. Não executa código (só parse).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SKIP = new Set(["node_modules", ".venv", ".git", "__pycache__", "__marimo__", ".vercel"]);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".golden")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(mjs|cjs|js)$/.test(name)) files.push(p);
  }
})(process.cwd());

let fail = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    fail++;
    console.error("✗ SINTAXE:", f, "\n" + String(e.stderr || e.stdout || e).slice(0, 500));
  }
}
console.log(`node --check: ${files.length - fail}/${files.length} OK${fail ? ` (${fail} falha(s))` : ""}`);
process.exit(fail ? 1 : 0);
