// Testes do motor fairgate sobre os DADOS REAIS embutidos.  Rode:  node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = {};
// 0) carregar base real + política + motor (globais, como no browser)
eval(readFileSync(join(ROOT, "data", "german-credit.js"), "utf8"));
eval(readFileSync(join(ROOT, "data", "policy.js"), "utf8"));
eval(readFileSync(join(ROOT, "fairgate-engine.js"), "utf8"));
const E = globalThis.window.FairgateEngine;
const P = E.loadPolicy();

test("FONTE ÚNICA: policy.js (de policy.yaml) bate com DEFAULT_POLICY do motor", () => {
  assert.ok(globalThis.window.FAIRGATE_POLICY, "policy.js carregou window.FAIRGATE_POLICY");
  const p = E.loadPolicy(), d = E.DEFAULT_POLICY;
  assert.equal(p.quality.coverage_min, d.quality.coverage_min);
  assert.equal(p.quality.domain_violation_max, d.quality.domain_violation_max);
  assert.equal(p.quality.base_rate_gap_max, d.quality.base_rate_gap_max);
  assert.equal(p.fairness.disparate_impact_min, d.fairness.disparate_impact_min);
  assert.equal(p.fairness.demographic_parity_diff_max, d.fairness.demographic_parity_diff_max);
  assert.equal(p.probe_model.seed, d.probe_model.seed);
  assert.equal(p.probe_model.test_size, d.probe_model.test_size);
});

test("base real carrega (1000 linhas)", () => {
  const rows = E.loadReal();
  assert.equal(rows.length, 1000);
  assert.ok(rows.every((r) => "risk" in r && "age_lt_25" in r));
});

test("métricas reais batem com o esperado", () => {
  const rows = E.loadReal();
  const m = E.metrics(rows, P, null);
  const bad = rows.filter((r) => r.risk === "bad").length / rows.length;
  assert.ok(Math.abs(bad - 0.30) < 0.001, `bad global=${bad}`);
  assert.ok(m.completude.detail.covYoung < 0.16, "cobertura jovem ~14,9%");
  assert.ok(m.precisao.detail.brYoung > m.precisao.detail.brOld, "jovem tem mais 'bad'");
  assert.ok(Math.abs(m.precisao.value - 0.129) < 0.01, `gap=${m.precisao.value}`);
});

test("ARCO: cru → FAIL ; mitigado → PASS", () => {
  const raw = E.loadReal();
  const vRaw = E.runGate(raw, P, { weights: null, imputed: false, seed: 42, source: "real" });
  assert.equal(vRaw.status, "FAIL");
  // checagens de qualidade reprovam; fairness (DI) passa cru
  assert.equal(vRaw.checks.find((c) => c.id === "completude").pass, false);
  assert.equal(vRaw.checks.find((c) => c.id === "base_rate").pass, false);
  assert.equal(vRaw.checks.find((c) => c.id === "di_age").pass, true);

  const imp = E.imputeStratified(raw);
  const T = E.tradeoff(imp, P, raw, 11);
  assert.ok(T.chosen.gatePass, "chosen passa o gate inteiro");
  assert.ok(T.chosen.lambda > 0, `chosen λ=${T.chosen.lambda} > 0 (KC entra)`);
  const w = E.sweepWeights(imp, T.chosen.lambda);
  const vMit = E.runGate(imp, P, { weights: w, imputed: true, seed: 42, source: "real" });
  assert.equal(vMit.status, "PASS");
});

test("DETERMINISMO: probe é reprodutível bit-a-bit", () => {
  const rows = E.loadReal();
  const a = E.probe(rows, null, false);
  const b = E.probe(rows, null, false);
  assert.equal(a.auc, b.auc);
  assert.equal(a.di_age, b.di_age);
  assert.equal(a.dpd_age, b.dpd_age);
});

test("PROVENIÊNCIA: hash de policy é estável e veredito carrega proveniência", () => {
  const rows = E.loadReal();
  const v = E.runGate(rows, P, { seed: 42, source: "real" });
  assert.equal(E.hash(P), E.hash(P));
  assert.equal(v.provenance.policy_hash, E.hash(P));
  assert.equal(v.provenance.seed, 42);
  assert.equal(v.provenance.source, "real");
});

test("MODO SINTÉTICO-ESTRESSE: cru reprova e o gate de fairness (DI) aperta", () => {
  const syn = E.makeDataset(42, 1000);
  const v = E.runGate(syn, P, { weights: null, imputed: false, seed: 42, source: "synthetic" });
  assert.equal(v.status, "FAIL");
  // no sintético o NA é proxy forte de idade → a sonda discrimina mais (DI menor que no real)
  const di = v.checks.find((c) => c.id === "di_age").value;
  assert.ok(di < 0.97, `DI sintético=${di} deve ser mais apertado que o real`);
});
