// api/tts.js — Vercel Serverless (Node runtime · CommonJS).
// Voz humana pt-BR para o tutor. Porte do lib/tts do Vitaliza, sem deps:
//   ordem TTS_PROVIDER (default google) -> TTS_FALLBACK_PROVIDER (default elevenlabs) -> resto.
//   Google: service-account (JWT->OAuth) OU API key · voz pt-BR-Chirp3-HD-Charon (masculina nativa).
//   ElevenLabs: eleven_multilingual_v2 · voz nativa pt-BR (env ELEVENLABS_VOICE_ID).
// Segredos SÓ em env var no servidor. Se nada configurado/erro -> 501/502 e o cliente usa a voz do navegador.
const crypto = require("node:crypto");

const TTS_TEXT_LIMIT = 1500;
const MAX_INPUT = 8000;

// ---- normalização de texto p/ fala (porte de speechify.ts) ----
const ABBREV = [
  [/\bp\.?\s?ex\.?\b/gi, "por exemplo"], [/\bex\.:/gi, "por exemplo:"], [/\betc\.?\b/gi, "etcétera"],
  [/\bvs\.?\b/gi, "versus"], [/\bn[ºo]\.?\s?(?=\d)/gi, "número "], [/\bart\.\s?(?=\d)/gi, "artigo "],
];
function normalizeForSpeech(input) {
  if (!input) return "";
  let t = String(input);
  t = t.replace(/```[\s\S]*?```/g, " ").replace(/`([^`]+)`/g, "$1");
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/https?:\/\/[^\s)]+/g, "").replace(/\bwww\.[^\s)]+/g, "");
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "").replace(/^\s{0,3}>\s?/gm, "");
  t = t.replace(/^\s*[-*+•]\s+/gm, "").replace(/^\s*\d+[.)]\s+/gm, "");
  t = t.replace(/(\*\*|\*|__|_|~~)(.*?)\1/g, "$2");
  t = t.replace(/R\$\s?([\d.,]+)/g, "$1 reais").replace(/%/g, " por cento");
  t = t.replace(/&/g, " e ").replace(/\s*[—–]\s*/g, ", ").replace(/\s*\/\s*/g, " ");
  t = t.replace(/[=<>|^~*#]+/g, " ").replace(/\.{3,}/g, "…");
  for (const [re, rep] of ABBREV) t = t.replace(re, rep);
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, "");
  t = t.replace(/[ \t]{2,}/g, " ").replace(/[ \t]*\n{2,}[ \t]*/g, ". ").replace(/[ \t]*\n[ \t]*/g, ". ");
  t = t.replace(/(?:\.\s*){2,}/g, ". ").replace(/\s+([,.;:!?…])/g, "$1").replace(/([,;:])(?=\S)/g, "$1 ");
  t = t.replace(/\s{2,}/g, " ").trim();
  if (t && !/[.!?…]$/.test(t)) t += ".";
  return t;
}

// ---- Google Cloud TTS (service-account JWT->OAuth OU API key) ----
function readServiceAccount() {
  const raw = (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || "").replace(/^﻿/, "").trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j.client_email && j.private_key) return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, "\n") };
  } catch (e) {}
  return null;
}
let _tokenCache = null;
async function googleToken(sa, signal) {
  const now = Math.floor(Date.now() / 1000);
  if (_tokenCache && _tokenCache.exp - 60 > now) return _tokenCache.token;
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = enc({ alg: "RS256", typ: "JWT" });
  const claim = enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const signer = crypto.createSign("RSA-SHA256"); signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${signer.sign(sa.private_key).toString("base64url")}`;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", signal, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
  if (!r.ok) throw new Error("google_oauth_" + r.status);
  const d = await r.json();
  _tokenCache = { token: d.access_token, exp: now + (d.expires_in || 3600) };
  return _tokenCache.token;
}
function googleConfigured() { return !!((process.env.GOOGLE_TTS_API_KEY || "").trim() || readServiceAccount()); }
async function googleSynth(text, signal) {
  const apiKey = (process.env.GOOGLE_TTS_API_KEY || "").trim();
  const sa = readServiceAccount();
  if (!apiKey && !sa) throw new Error("google_nao_configurado");
  const languageCode = (process.env.GOOGLE_TTS_LANGUAGE_CODE || "").trim() || "pt-BR";
  const voiceName = (process.env.GOOGLE_TTS_VOICE_NAME || "").trim() || "pt-BR-Chirp3-HD-Charon";
  const body = JSON.stringify({ input: { text }, voice: { languageCode, name: voiceName }, audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 } });
  let url = "https://texttospeech.googleapis.com/v1/text:synthesize";
  const headers = { "Content-Type": "application/json" };
  if (apiKey) url += "?key=" + encodeURIComponent(apiKey);
  else headers.Authorization = "Bearer " + (await googleToken(sa, signal));
  const r = await fetch(url, { method: "POST", signal, headers, body });
  if (!r.ok) throw new Error("google_tts_" + r.status);
  const d = await r.json();
  if (!d.audioContent) throw new Error("google_sem_audio");
  return Buffer.from(d.audioContent, "base64");
}

// ---- ElevenLabs (eleven_multilingual_v2, voz nativa pt-BR via env) ----
function elevenConfigured() { return !!(process.env.ELEVENLABS_API_KEY || "").trim(); }
async function elevenSynth(text, signal) {
  const key = (process.env.ELEVENLABS_API_KEY || "").trim().replace(/[^\x21-\x7E]/g, "");
  if (!key) throw new Error("eleven_nao_configurado");
  const voiceId = (process.env.ELEVENLABS_VOICE_ID || "").trim() || "EXAVITQu4vr4xnSDxMaL";
  const modelId = (process.env.ELEVENLABS_MODEL_ID || "").trim() || "eleven_multilingual_v2";
  const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voiceId), {
    method: "POST", signal,
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: modelId, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
  });
  if (!r.ok) throw new Error("eleven_" + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length === 0) throw new Error("eleven_vazio");
  return buf;
}

const PROVIDERS = {
  google: { configured: googleConfigured, synth: googleSynth, describe: () => "Google TTS · " + ((process.env.GOOGLE_TTS_VOICE_NAME || "pt-BR-Chirp3-HD-Charon")) },
  elevenlabs: { configured: elevenConfigured, synth: elevenSynth, describe: () => "ElevenLabs · " + ((process.env.ELEVENLABS_VOICE_ID || "default") + " / " + (process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2")) },
};
const ALL = ["google", "elevenlabs"];
const asName = (v, fb) => { const n = String(v || "").toLowerCase(); return n === "google" || n === "elevenlabs" ? n : fb; };
function ttsEnabled() { return String(process.env.TTS_ENABLED || "true").toLowerCase() !== "false"; }
function providerOrder() {
  const primary = asName(process.env.TTS_PROVIDER, "google");
  const fallback = asName(process.env.TTS_FALLBACK_PROVIDER, "elevenlabs");
  const order = [];
  for (const n of [primary, fallback, ...ALL]) if (!order.includes(n)) order.push(n);
  return order;
}
function status() {
  const providers = ALL.map((name) => ({ name, configured: PROVIDERS[name].configured(), description: PROVIDERS[name].describe() }));
  const anyConfigured = providers.some((p) => p.configured);
  return { enabled: ttsEnabled(), autoplay: String(process.env.AUDIO_AUTOPLAY || "true").toLowerCase() !== "false",
    primary: asName(process.env.TTS_PROVIDER, "google"), fallback: asName(process.env.TTS_FALLBACK_PROVIDER, "elevenlabs"),
    providers, anyConfigured, serverVoiceAvailable: ttsEnabled() && anyConfigured };
}

// rate-limit best-effort por IP (TTS custa por chamada — endpoint público)
const _rl = new Map();
function rateLimited(ip) {
  const now = Date.now(), win = 60000, max = 20;
  const arr = (_rl.get(ip) || []).filter((t) => now - t < win);
  arr.push(now); _rl.set(ip, arr);
  if (_rl.size > 5000) _rl.clear();
  return arr.length > max;
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body) { if (typeof req.body === "string") { try { return resolve(JSON.parse(req.body)); } catch { return resolve({}); } } return resolve(req.body); }
    let data = "", bytes = 0;
    req.on("data", (c) => { bytes += c.length; if (bytes > MAX_INPUT * 2) { try { req.destroy(); } catch (e) {} return resolve({}); } data += c; });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

module.exports = async (req, res) => {
  if (req.method === "GET") { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); return res.end(JSON.stringify(status())); }
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "use GET/POST" })); }
  const ct = (req.headers["content-type"] || "").split(";")[0].trim();
  if (ct && ct !== "application/json") { res.statusCode = 415; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "Content-Type deve ser application/json" })); }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  if (rateLimited(ip)) { res.statusCode = 429; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "muitas requisições de voz — tente em instantes" })); }

  const body = await readBody(req);
  const raw = typeof body.text === "string" ? body.text : "";
  if (!raw.trim()) { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "texto_ausente" })); }
  if (raw.length > MAX_INPUT) { res.statusCode = 413; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "texto_muito_longo" })); }

  const st = status();
  if (!st.enabled) { res.statusCode = 503; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "tts_desativado", serverVoiceAvailable: false })); }
  if (!st.anyConfigured) { res.statusCode = 501; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "tts_nao_configurado", serverVoiceAvailable: false, message: "Sem provedor de voz; use a voz do navegador." })); }

  const text = normalizeForSpeech(raw).slice(0, TTS_TEXT_LIMIT);
  if (!text) { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "texto_vazio_pos_normalizacao" })); }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  const attempts = [];
  try {
    for (const name of providerOrder()) {
      if (!PROVIDERS[name].configured()) { attempts.push(name + ":nao_config"); continue; }
      try {
        const audio = await PROVIDERS[name].synth(text, ctrl.signal);
        res.statusCode = 200;
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Provider", name);
        res.setHeader("Cache-Control", "no-store");
        return res.end(audio);
      } catch (e) { attempts.push(name + ":" + String(e.message || e).slice(0, 40)); }
    }
    res.statusCode = 502; res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "falha_provedores", serverVoiceAvailable: false, attempts }));
  } finally { clearTimeout(timer); }
};
