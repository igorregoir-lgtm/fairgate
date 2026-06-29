// build-policy.mjs — policy.yaml (fonte única) -> data/policy.js (window.FAIRGATE_POLICY)
// Mantém L1 (console JS) e L2 (notebook) lendo OS MESMOS limites. node scripts/build-policy.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const YAML = join(ROOT, "policy.yaml");
const OUT = join(ROOT, "data", "policy.js");

const coerce = (v) => {
  if (v === "" || v == null) return v;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
  return v.replace(/^['"]|['"]$/g, "");
};

// parser de subconjunto YAML suficiente para policy.yaml (key:val · key: + lista · key: + mapa 2-níveis)
function parseYaml(text) {
  const lines = text.split(/\r?\n/)
    .map((l) => l.replace(/\s+#.*$/, "").replace(/^#.*$/, "").replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");
  const root = {};
  let curKey = null;
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const t = line.trim();
    if (indent === 0) {
      const m = t.match(/^([\w.]+):\s*(.*)$/);
      if (!m) continue;
      if (m[2] === "") { curKey = m[1]; root[curKey] = undefined; }
      else { root[m[1]] = coerce(m[2]); curKey = null; }
    } else if (curKey != null) {
      if (t.startsWith("- ")) {
        if (!Array.isArray(root[curKey])) root[curKey] = [];
        root[curKey].push(coerce(t.slice(2).trim()));
      } else {
        const m = t.match(/^([\w.]+):\s*(.*)$/);
        if (m) {
          if (root[curKey] == null || Array.isArray(root[curKey])) root[curKey] = {};
          root[curKey][m[1]] = coerce(m[2]);
        }
      }
    }
  }
  return root;
}

const policy = parseYaml(readFileSync(YAML, "utf8"));
mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(
  OUT,
  "/* AUTO-GERADO por scripts/build-policy.mjs a partir de policy.yaml — NÃO editar à mão. */\n" +
    "window.FAIRGATE_POLICY = " + JSON.stringify(policy) + ";\n",
  "utf8"
);
console.log("OK ->", OUT, "\n", JSON.stringify(policy, null, 2));
