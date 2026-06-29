// Contrato do MODO ESTUDO (study.js) — lógica pura de persistência + revisão espaçada (Leitner).
// Garante: agendamento determinístico, defesa de relógio, sanitização de input não-confiável,
// e (via source-slice do app.js) o GATE HONESTO — progresso restaurado NUNCA pinta verde sem reexecução.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = {};
eval(readFileSync(join(ROOT, "study.js"), "utf8"));
const S = globalThis.window.FAIRGATE_STUDY;
const DAY = 86400000;
const T0 = 1_700_000_000_000;   // "now" fixo p/ determinismo (sem Date.now)

test("ESTUDO schedule: acerto de alta confiança SOBE a caixa (cap em MAX_BOX)", () => {
  let c = { box: 1 };
  c = S.schedule(c, { correct: true, conf: "alta" }, T0); assert.equal(c.box, 2);
  c = S.schedule(c, { correct: true, conf: "alta" }, T0); assert.equal(c.box, 3);
  c = S.schedule(c, { correct: true, conf: "alta" }, T0); assert.equal(c.box, S.MAX_BOX, "não passa do teto");
  assert.equal(c.dueAt, T0 + S.INTERVALS[S.MAX_BOX - 1] * DAY);
});

test("ESTUDO schedule: erro volta à caixa 1 (revisar logo); acerto sem alta MANTÉM a caixa", () => {
  const erro = S.schedule({ box: 3 }, { correct: false, conf: "alta" }, T0);
  assert.equal(erro.box, 1, "erro → caixa 1");
  assert.equal(erro.dueAt, T0, "caixa 1 = vencer hoje (intervalo 0)");
  const mantem = S.schedule({ box: 2 }, { correct: true, conf: "media" }, T0);
  assert.equal(mantem.box, 2, "acerto sem alta mantém");
});

test("ESTUDO schedule: PURA — mesmas entradas, mesma saída (sem ler relógio interno)", () => {
  const a = S.schedule({ box: 1 }, { correct: true, conf: "alta" }, T0);
  const b = S.schedule({ box: 1 }, { correct: true, conf: "alta" }, T0);
  assert.deepEqual(a, b);
});

test("ESTUDO computeDue: vencido quando dueAt<=now; respeita o cap por sessão", () => {
  const cards = {};
  for (let n = 1; n <= 7; n++) cards[String(n)] = { box: 1, lastSeen: T0 - DAY, dueAt: T0 - DAY, lastCorrect: false, lastConf: "media" };
  const due = S.computeDue({ cards, updatedAt: T0 - DAY }, T0);
  assert.equal(due.length, S.DUE_CAP, "no máximo DUE_CAP vencidos por sessão");
});

test("ESTUDO computeDue: relógio RETROCEDIDO não congela nem inunda (base=max(now,updatedAt))", () => {
  const cards = { "1": { box: 2, lastSeen: T0, dueAt: T0 + 2 * DAY, lastCorrect: true, lastConf: "alta" } };
  // now muito no passado (relógio voltou), mas updatedAt é recente → base=updatedAt; card vence em +2d, não vencido ainda
  const due = S.computeDue({ cards, updatedAt: T0 }, T0 - 10 * DAY);
  assert.deepEqual(due, [], "relógio para trás não destrava revisão prematura nem trava");
});

test("ESTUDO validateSave: input não-confiável é sanitizado; corrupção/versão-futura ⇒ null", () => {
  assert.equal(S.validateSave(null), null);
  assert.equal(S.validateSave("nope"), null);
  assert.equal(S.validateSave([]), null, "array não é save");
  assert.equal(S.validateSave({ schema: 999 }), null, "versão futura ignorada");
  const v = S.validateSave({ schema: 1, enabled: true, completed: [1, 2, 99, "x"], calib: { "1": { correct: true, conf: "ZZZ" } }, cards: { "1": { box: 9, dueAt: "bad" } }, jaConsolidouAntes: true, updatedAt: T0 });
  assert.deepEqual(v.completed, [1, 2], "completed filtra fora-de-faixa/não-inteiro");
  assert.equal(v.calib["1"].conf, "media", "conf inválida vira media (whitelist)");
  assert.equal(v.cards["1"].box, S.MAX_BOX, "box é clampeado a 1..MAX_BOX");
  assert.equal(v.cards["1"].dueAt, 0, "dueAt não-numérico vira 0");
  assert.equal(v.jaConsolidouAntes, true);
});

test("ESTUDO freshSave: semeia cards a partir da calibração; habilitado por padrão", () => {
  const sv = S.freshSave({ "1": { correct: true, conf: "alta" }, "2": { correct: false, conf: "media" } }, [1, 2], T0);
  assert.equal(sv.enabled, true);
  assert.equal(sv.cards["1"].box, 2, "acerto-alta semeia caixa 2");
  assert.equal(sv.cards["2"].box, 1, "erro semeia caixa 1");
  assert.equal(sv.jaConsolidouAntes, false);
});

test("GATE HONESTO (modo estudo ⟂ veredito): boot não semeia completed/learnCert; persistStudy é opt-in", () => {
  const src = readFileSync(join(ROOT, "app.js"), "utf8");
  // persistStudy deve ser no-op sem enabled (guard explícito)
  const i = src.indexOf("function persistStudy");
  assert.ok(i >= 0, "persistStudy existe");
  const body = src.slice(i, src.indexOf("\n  }", i));
  assert.ok(/enabled/.test(body) && /return/.test(body), "persistStudy faz guard por enabled (no-op sem opt-in)");
  // o seeding do estudo NÃO pode escrever em S.completed nem S.learnCert
  const j = src.indexOf("function initStudy");
  assert.ok(j >= 0, "initStudy existe");
  const seed = src.slice(j, src.indexOf("\n  }", j));
  assert.ok(!/S\.completed\.add|S\.completed\s*=|S\.learnCert\s*=\s*true/.test(seed), "initStudy não semeia completed nem pinta learnCert verde");
});
