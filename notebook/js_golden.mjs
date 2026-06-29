// js_golden.mjs — executa o motor JS ATUAL e grava notebook/.golden.json com os números
// canônicos (cru + mitigado). O crosscheck.py compara o L2(Python) contra estes valores → prova
// que L1 e L2 não divergem. Rode:  node notebook/js_golden.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = {};
eval(readFileSync(join(ROOT, "data", "german-credit.js"), "utf8"));
eval(readFileSync(join(ROOT, "data", "policy.js"), "utf8"));
eval(readFileSync(join(ROOT, "fairgate-engine.js"), "utf8"));
const E = globalThis.window.FairgateEngine;
const P = E.loadPolicy();

const raw = E.loadReal();
const mRaw = E.metrics(raw, P, null);
const pRaw = E.probe(raw, null, false);
const vRaw = E.runGate(raw, P, { weights: null, imputed: false, seed: 42, source: "real" });

const imp = E.imputeStratified(raw);
let minPass = null;
for (let s = 0; s <= 10; s++) {
  const lam = s / 10;
  const v = E.runGate(imp, P, { weights: E.sweepWeights(imp, lam), imputed: true, seed: 42, source: "real" });
  if (v.status === "PASS" && minPass === null) minPass = lam;
}
const wMit = E.sweepWeights(imp, minPass);
const mMit = E.metrics(imp, P, wMit);
const pMit = E.probe(imp, wMit, true);
const vMit = E.runGate(imp, P, { weights: wMit, imputed: true, seed: 42, source: "real" });

const golden = {
  n: raw.length,
  raw: { gate: vRaw.status, cov_young: mRaw.completude.detail.covYoung, dom_na: mRaw.consistencia.value,
         gap: mRaw.precisao.value, di_age: pRaw.di_age, di_sex: pRaw.di_sex, dpd_age: pRaw.dpd_age, auc: pRaw.auc },
  min_pass_lambda: minPass,
  mit: { gate: vMit.status, cov_young: mMit.completude.detail.covYoung, dom_na: mMit.consistencia.value,
         gap: mMit.precisao.value, di_age: pMit.di_age, di_sex: pMit.di_sex, dpd_age: pMit.dpd_age, auc: pMit.auc },
};
writeFileSync(join(ROOT, "notebook", ".golden.json"), JSON.stringify(golden, null, 2));
console.log(JSON.stringify(golden, null, 2));
