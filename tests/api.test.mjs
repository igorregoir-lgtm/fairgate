// Testes das funções serverless (api/tts.js, api/tutor.js) — HERMÉTICOS (sem rede).
// Removemos as env keys p/ exercitar o caminho "sem provider": status, validação de
// entrada, rate-limit, e o contrato P3 (nunca 500; reason opaco; sem vazar upstream).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// hermético: garante estado "sem provider" independ. do ambiente
for (const k of ["DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "GOOGLE_TTS_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS_JSON", "ELEVENLABS_API_KEY"]) delete process.env[k];

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tts = require(join(ROOT, "api", "tts.js"));
const tutor = require(join(ROOT, "api", "tutor.js"));

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: "", ended: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(b) { if (b !== undefined) this.body = typeof b === "string" ? b : String(b); this.ended = true; },
  };
}
let _ip = 0;
function mockReq(method, { ct, body } = {}) {
  const headers = { "x-forwarded-for": "10.0.0." + (++_ip) }; // IP único por chamada → sem 429
  if (ct) headers["content-type"] = ct;
  else if (body !== undefined) headers["content-type"] = "application/json";
  return { method, headers, body };
}
const call = async (fn, req) => { const res = mockRes(); await fn(req, res); return res; };
const json = (res) => JSON.parse(res.body);

// ───────────── api/tts.js ─────────────
test("tts GET → 200 status JSON; sem chaves ⟹ serverVoiceAvailable=false", async () => {
  const res = await call(tts, mockReq("GET"));
  assert.equal(res.statusCode, 200);
  const j = json(res);
  assert.equal(typeof j.serverVoiceAvailable, "boolean");
  assert.equal(j.serverVoiceAvailable, false);
});

test("tts método inválido → 405", async () => {
  assert.equal((await call(tts, mockReq("DELETE"))).statusCode, 405);
});

test("tts POST com Content-Type errado → 415", async () => {
  assert.equal((await call(tts, mockReq("POST", { ct: "text/plain", body: { text: "oi" } }))).statusCode, 415);
});

test("tts POST sem texto → 400", async () => {
  assert.equal((await call(tts, mockReq("POST", { body: {} }))).statusCode, 400);
});

test("tts POST com texto mas sem provider ⟹ 501 (não chama upstream, não vaza)", async () => {
  const res = await call(tts, mockReq("POST", { body: { text: "olá, mundo" } }));
  assert.equal(res.statusCode, 501);
  assert.equal(json(res).serverVoiceAvailable, false);
});

test("tts rate-limit: do MESMO IP, a 21ª req em 60s → 429", async () => {
  const ip = "203.0.113.7";
  const mk = () => ({ method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: { text: "x" } });
  let saw429 = false;
  for (let i = 0; i < 25; i++) { const r = await call(tts, mk()); if (r.statusCode === 429) { saw429 = true; break; } }
  assert.ok(saw429, "deve barrar com 429 após o teto por IP");
});

// ───────────── api/tutor.js ─────────────
test("tutor método inválido (GET) → 405", async () => {
  assert.equal((await call(tutor, mockReq("GET"))).statusCode, 405);
});

test("tutor POST com Content-Type errado → 415", async () => {
  assert.equal((await call(tutor, mockReq("POST", { ct: "text/plain", body: { question: "oi" } }))).statusCode, 415);
});

test("tutor POST sem pergunta → 400", async () => {
  assert.equal((await call(tutor, mockReq("POST", { body: {} }))).statusCode, 400);
});

test("tutor POST sem chave ⟹ 200 fallback determinístico (P3: nunca 500; reason opaco; sem vazar chave/upstream)", async () => {
  const res = await call(tutor, mockReq("POST", { body: { question: "O que é o gate de fairness?" } }));
  assert.equal(res.statusCode, 200);
  const j = json(res);
  assert.equal(j.source, "fallback");
  assert.ok(typeof j.answer === "string" && j.answer.length > 0, "fallback retorna resposta não-vazia");
  assert.ok(j.reason, "carrega reason (opaco)");
  // não vaza segredo nem detalhe de upstream
  assert.ok(!/sk-|api[_-]?key|bearer|deepseek\.com|openrouter\.ai/i.test(res.body), "não vaza chave/host upstream");
});
