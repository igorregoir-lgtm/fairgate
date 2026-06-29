// ============================================================================
// build-data.mjs — converte o german_credit_data.csv REAL em data/german-credit.js
// (window.GERMAN_CREDIT). Determinístico; rode após qualquer troca do CSV.
//   node scripts/build-data.mjs
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV = join(ROOT, "german_credit_data.csv");
const OUT = join(ROOT, "data", "german-credit.js");

const lines = readFileSync(CSV, "utf8").trim().split(/\r?\n/);
// header: ,Age,Sex,Job,Housing,Saving accounts,Checking account,Credit amount,Duration,Purpose,Risk
const rows = lines.slice(1).map((line, i) => {
  const c = line.split(",");
  const age = parseInt(c[1], 10);
  const sav = c[5] === "quite rich" ? "quite_rich" : c[5]; // normaliza p/ o domínio do motor
  return {
    id: i,
    sex: c[2],
    age,
    age_lt_25: age < 25,
    job: parseInt(c[3], 10),
    housing: c[4],
    saving_account: sav,
    checking_account: c[6],
    credit_amount: parseInt(c[7], 10),
    duration: parseInt(c[8], 10),
    purpose: c[9],
    risk: c[10],
  };
});

// resumo determinístico (proveniência leve) — gravado como comentário
const n = rows.length;
const cnt = (f) => rows.filter(f).length;
const br = (f) => {
  const s = rows.filter(f);
  return s.length ? (s.filter((r) => r.risk === "bad").length / s.length) : 0;
};
const summary = {
  n,
  female_share: +(cnt((r) => r.sex === "female") / n).toFixed(4),
  young_share: +(cnt((r) => r.age_lt_25) / n).toFixed(4),
  bad_global: +(cnt((r) => r.risk === "bad") / n).toFixed(4),
  br_young: +br((r) => r.age_lt_25).toFixed(4),
  br_old: +br((r) => !r.age_lt_25).toFixed(4),
  na_saving: cnt((r) => r.saving_account === "NA"),
  na_checking: cnt((r) => r.checking_account === "NA"),
};

const banner = `/* AUTO-GERADO por scripts/build-data.mjs — NÃO editar à mão.
   Fonte: german_credit_data.csv (German Credit / Statlog, versão kabure).
   Resumo: ${JSON.stringify(summary)} */\n`;

const body =
  banner +
  "window.GERMAN_CREDIT = " +
  JSON.stringify(rows) +
  ";\nwindow.GERMAN_CREDIT_SUMMARY = " +
  JSON.stringify(summary) +
  ";\n";

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(OUT, body, "utf8");
console.log("OK ->", OUT, "\n", JSON.stringify(summary, null, 2));
