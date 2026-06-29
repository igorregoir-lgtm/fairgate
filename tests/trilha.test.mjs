// Contrato da PEDAGOGIA (trilha/missions.js) — a Trilha Educacional é auditável.
// Garante integridade do dado pedagógico: escalada Bloom, checks predict-first bem
// formados (exatamente 1 correta + feedback em toda opção) e a prova de consolidação.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = {};
eval(readFileSync(join(ROOT, "trilha", "missions.js"), "utf8"));
const T = globalThis.window.FAIRGATE_TRILHA;

// Bloom revisado (PT) — conjunto válido de níveis cognitivos
const BLOOM = new Set(["Lembrar", "Entender", "Aplicar", "Analisar", "Avaliar", "Criar"]);
const okOne = (opts) => opts.filter((o) => o.correct).length === 1;
const allFb = (opts) => opts.every((o) => typeof o.feedback === "string" && o.feedback.trim().length > 0);

test("TRILHA: exatamente 7 estações, numeradas 1..7 em sequência", () => {
  assert.equal(T.TOTAL, 7);
  assert.equal(T.STATIONS.length, 7);
  T.STATIONS.forEach((m, i) => assert.equal(m.n, i + 1, `estação ${i} deve ter n=${i + 1}`));
});

test("TRILHA: toda estação tem Bloom válido, objetivo, instrução (scaffolding) e título", () => {
  for (const m of T.STATIONS) {
    assert.ok(BLOOM.has(m.bloom), `estação ${m.n}: bloom "${m.bloom}" válido`);
    for (const f of ["name", "title", "pedTitle", "objective", "instruction"]) {
      assert.ok(typeof m[f] === "string" && m[f].trim().length > 0, `estação ${m.n}: campo "${f}" presente`);
    }
    assert.ok(Number.isFinite(m.estMin) && m.estMin > 0, `estação ${m.n}: estMin > 0`);
  }
});

test("TRILHA: a escalada Bloom termina em 'Criar' (capstone) e começa abaixo dele", () => {
  assert.equal(T.STATIONS[T.STATIONS.length - 1].bloom, "Criar", "última estação = Criar");
  assert.notEqual(T.STATIONS[0].bloom, "Criar", "primeira estação não é Criar");
});

test("CHECK formativo: toda estação tem check predict-first com EXATAMENTE 1 correta + feedback em toda opção", () => {
  for (const m of T.STATIONS) {
    const c = m.check;
    assert.ok(c && typeof c.prompt === "string" && c.prompt.trim(), `estação ${m.n}: check.prompt`);
    assert.ok(Array.isArray(c.options) && c.options.length >= 2, `estação ${m.n}: ≥2 opções`);
    assert.ok(okOne(c.options), `estação ${m.n}: exatamente 1 opção correta`);
    assert.ok(allFb(c.options), `estação ${m.n}: feedback em toda opção (o erro também ensina)`);
  }
});

test("MOVIMENTOS: tipos válidos (why/alt/con/q) e texto não-vazio", () => {
  const TYPES = new Set(["why", "alt", "con", "q"]);
  for (const m of T.STATIONS) {
    assert.ok(Array.isArray(m.movements) && m.movements.length >= 1, `estação ${m.n}: tem movimentos`);
    for (const mv of m.movements) {
      assert.ok(TYPES.has(mv.type), `estação ${m.n}: tipo "${mv.type}" válido`);
      assert.ok(typeof mv.text === "string" && mv.text.trim(), `estação ${m.n}: movimento com texto`);
    }
  }
});

test("CONSOLIDAÇÃO (gate de aprendizado): retrieval cumulativo bem-formado (1 correta + feedback)", () => {
  const C = T.CONSOLIDATION;
  assert.ok(C && Array.isArray(C.questions) && C.questions.length >= 3, "≥3 questões cumulativas");
  assert.equal(C.total, C.questions.length);
  const ids = new Set();
  for (const q of C.questions) {
    assert.ok(typeof q.id === "string" && !ids.has(q.id), `questão id único: ${q.id}`); ids.add(q.id);
    assert.ok(typeof q.prompt === "string" && q.prompt.trim(), `questão ${q.id}: prompt`);
    assert.ok(okOne(q.options), `questão ${q.id}: exatamente 1 correta`);
    assert.ok(allFb(q.options), `questão ${q.id}: feedback em toda opção`);
  }
});
