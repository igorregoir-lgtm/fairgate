// Property/invariant tests do GATE de fairness sobre o motor real.  Rode:  node --test tests/
// Não testa números fixos — testa INVARIANTES que devem valer para qualquer entrada/seed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = {};
eval(readFileSync(join(ROOT, "data", "german-credit.js"), "utf8"));
eval(readFileSync(join(ROOT, "data", "policy.js"), "utf8"));
eval(readFileSync(join(ROOT, "fairgate-engine.js"), "utf8"));
const E = globalThis.window.FairgateEngine;
const P = E.loadPolicy();

// amostra determinística de seeds (sem aleatório — reprodutível)
const SEEDS = [1, 7, 13, 42, 99, 128, 256, 512, 777, 1000, 2024, 31337];
const synth = (seed) => E.makeDataset(seed, 1000);
const gate = (rows, source, extra = {}) => E.runGate(rows, P, { weights: null, imputed: false, seed: 42, source, ...extra });

test("INVARIANTE (soundness): cada check.pass reflete fielmente value vs limit pelo op (≥/≤), em N seeds", () => {
  for (const seed of SEEDS) {
    const v = gate(synth(seed), "synthetic", { seed });
    for (const c of v.checks) {
      const expected = c.op === "≥" ? c.value >= c.limit : c.value <= c.limit;
      assert.equal(c.pass, expected, `seed ${seed} · ${c.id}: ${c.value} ${c.op} ${c.limit} → pass deveria ser ${expected}`);
    }
  }
});

test("INVARIANTE: o gate é a CONJUNÇÃO dos checks (status PASS sse todos passam), em N seeds + dado real", () => {
  const cases = [["real", E.loadReal(), "real"], ...SEEDS.map((s) => [`syn:${s}`, synth(s), "synthetic"])];
  for (const [label, rows, src] of cases) {
    const v = gate(rows, src);
    const allPass = v.checks.every((c) => c.pass);
    assert.equal(v.status === "PASS", allPass, `${label}: status=${v.status} mas allPass=${allPass}`);
    assert.equal(v.status === "FAIL", !allPass, `${label}`);
  }
});

test("INVARIANTE (P3 · 'sempre bloqueia'): DI(idade) < limite ⟹ check reprova E gate bloqueia, em N seeds", () => {
  let viuAbaixo = false;
  for (const seed of SEEDS) {
    const v = gate(synth(seed), "synthetic", { seed });
    const di = v.checks.find((c) => c.id === "di_age");
    assert.ok(di, `seed ${seed}: check di_age existe`);
    if (di.value < di.limit) {
      viuAbaixo = true;
      assert.equal(di.pass, false, `seed ${seed}: DI=${di.value} < ${di.limit} deve reprovar`);
      assert.equal(v.status, "FAIL", `seed ${seed}: DI abaixo do limite ⟹ gate BLOQUEIA`);
    }
    // qualquer métrica abaixo do limite ⟹ FAIL (generalização)
    if (v.checks.some((c) => !c.pass)) assert.equal(v.status, "FAIL", `seed ${seed}: há check reprovado ⟹ bloqueia`);
  }
  assert.ok(viuAbaixo, "o modo sintético-estresse deve produzir ≥1 seed com DI abaixo do limite (senão o teste é vazio)");
});

test("INVARIANTE (P4): endurecer a policy NUNCA destrava (proibido FAIL→PASS)", () => {
  const rows = E.loadReal();
  const strict = JSON.parse(JSON.stringify(P));
  strict.fairness.disparate_impact_min = Math.min(0.99, P.fairness.disparate_impact_min + 0.15);
  strict.quality.coverage_min = Math.min(0.99, P.quality.coverage_min + 0.20);
  const vBase = E.runGate(rows, P, { seed: 42, source: "real" });
  const vStrict = E.runGate(rows, strict, { seed: 42, source: "real" });
  if (vBase.status === "FAIL") assert.equal(vStrict.status, "FAIL", "policy mais rígida não pode aprovar o que a frouxa reprovou");
});

test("INVARIANTE: 'chosen' (menor λ que passa o gate inteiro) realmente PASSA — real e sintético", () => {
  for (const src of ["real", "synthetic"]) {
    const base = src === "real" ? E.loadReal() : synth(42);
    const imp = E.imputeStratified(base);
    const T = E.tradeoff(imp, P, base, 11);
    assert.ok(T.chosen, `${src}: tradeoff retorna chosen`);
    if (T.chosen.gatePass) {
      const w = E.sweepWeights(imp, T.chosen.lambda);
      const v = E.runGate(imp, P, { weights: w, imputed: true, seed: 42, source: src });
      assert.equal(v.status, "PASS", `${src}: chosen λ=${T.chosen.lambda} deve passar o gate inteiro`);
    }
  }
});

test("INVARIANTE: veredito é função PURA de (rows, policy) — determinístico em N seeds", () => {
  for (const seed of SEEDS) {
    const a = gate(synth(seed), "synthetic", { seed });
    const b = gate(synth(seed), "synthetic", { seed });
    assert.equal(a.status, b.status, `seed ${seed} determinístico`);
    assert.deepEqual(a.checks.map((c) => [c.id, c.pass, c.value]), b.checks.map((c) => [c.id, c.pass, c.value]));
  }
});

test("INVARIANTE (proveniência P6): todo veredito carrega policy_hash == hash(P) e seed/source", () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const v = gate(synth(seed), "synthetic", { seed });
    assert.equal(v.provenance.policy_hash, E.hash(P));
    assert.equal(v.provenance.seed, seed);
    assert.equal(v.provenance.source, "synthetic");
  }
});
