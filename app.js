/* ============================================================================
   app.js — Console do Operador (render + interação). Substitui o DCLogic do
   protótipo Claude Design por DOM real. Liga o fairgate-engine (determinístico)
   às 7 estações da Trilha (Data Engineering) e funde a pedagogia do Vitaliza
   (Bloom · scaffolding · check formativo predict-first · progresso · tour · capstone).
   Globais, sem módulos (roda em file://).
   ============================================================================ */
(function () {
  "use strict";
  let E = window.FairgateEngine;
  let T = window.FAIRGATE_TRILHA;
  const root = document.getElementById("fg-root");
  const PROG_KEY = "fairgate:trilha:v1";

  // ── estado ──────────────────────────────────────────────────────────────
  const _pol = (typeof window !== "undefined" && window.FAIRGATE_POLICY) || null;
  const S = {
    source: "real",
    seed: (_pol && _pol.probe_model && _pol.probe_model.seed) || 42,
    diThreshold: (_pol && _pol.fairness && _pol.fairness.disparate_impact_min) || 0.80,
    ready: false, step: 1, maxStep: 4,
    gate: "idle", imputed: false, reweighed: false, verdict: null,
    lambdaIdx: 0,
    completed: loadProgress(), check: null, picked: null, tour: false, defShown: true,
    dock: { open: false, messages: [], loading: false, speakOn: false, listening: false, ttsLoading: false, playing: false },
  };
  // áudio/voz fora do estado de render (persistem entre re-renders)
  let _audio = null, _rec = null, _ttsStatus = null, _ptVoice = null, _speakToken = 0;
  // computados no boot
  let P, raw, imp, pop, sample, tradeoffData, chosenIdx, rawSnap, policyHash;

  // ── progresso (sessionStorage) ──────────────────────────────────────────
  function loadProgress() {
    // a Trilha de Aprendizado reinicia a cada carregamento do site —
    // sem persistência de progresso entre reloads (limpa qualquer estado salvo).
    try { sessionStorage.removeItem(PROG_KEY); } catch (e) {}
    return new Set();
  }
  function saveProgress() {
    try { sessionStorage.setItem(PROG_KEY, JSON.stringify([...S.completed])); } catch (e) {}
  }
  function markComplete(n) { S.completed.add(n); saveProgress(); }

  // ── helpers de formatação ────────────────────────────────────────────────
  const pct = (x) => (x * 100).toFixed(1) + "%";
  const pp = (x) => (x * 100).toFixed(1);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // ── boot ─────────────────────────────────────────────────────────────────
  function boot() {
    const base = E.loadPolicy();   // fonte única: policy.yaml -> window.FAIRGATE_POLICY
    P = Object.assign({}, base, {
      fairness: Object.assign({}, base.fairness, { disparate_impact_min: S.diThreshold }),
    });
    raw = E.dataset(S.source, S.seed, 1000);
    imp = E.imputeStratified(raw);
    const n = raw.length, cnt = (g) => raw.filter(g).length;
    const br = (g) => { const s = raw.filter(g); return s.length ? s.filter((r) => r.risk === "bad").length / s.length : 0; };
    pop = {
      n, female: cnt((r) => r.sex === "female") / n, young: cnt((r) => r.age_lt_25) / n,
      bad: cnt((r) => r.risk === "bad") / n, brYoung: br((r) => r.age_lt_25), brOld: br((r) => !r.age_lt_25),
    };
    sample = raw.slice(0, 8);
    tradeoffData = E.tradeoff(imp, P, raw, 11);
    chosenIdx = Math.max(0, tradeoffData.points.findIndex((p) => p === tradeoffData.chosen));
    rawSnap = { met: E.metrics(raw, P, null), probe: E.probe(raw, null, false) };
    policyHash = E.hash(P);
    S.lambdaIdx = chosenIdx;
    S.ready = true;
    render();
  }

  // ── dataset/peso ativos conforme a mitigação ─────────────────────────────
  function current() {
    if (S.reweighed) return { rows: imp, weights: E.sweepWeights(imp, tradeoffData.chosen.lambda), imputed: true };
    if (S.imputed) return { rows: imp, weights: E.coverageWeights(imp), imputed: true };
    return { rows: raw, weights: null, imputed: false };
  }

  // ── transições de estado ──────────────────────────────────────────────────
  function set(patch) { Object.assign(S, patch); render(); }
  function go(n) { if (n <= S.maxStep) set({ step: n }); }
  let gateTimer = null;
  function runGate() {
    if (S.gate === "running") return;
    set({ gate: "running" });
    clearTimeout(gateTimer);
    gateTimer = setTimeout(() => {
      const c = current();
      const v = E.runGate(c.rows, P, { weights: c.weights, imputed: c.imputed, seed: S.seed, source: S.source });
      const ok = v.status === "PASS";
      S.gate = ok ? "approved" : "blocked";
      S.verdict = v;
      S.maxStep = Math.max(S.maxStep, ok ? 7 : 5);
      render();
    }, 1150);
  }
  function applyImpute() { set({ imputed: true, gate: "idle", verdict: null }); }
  function applyReweigh() { set({ reweighed: true, gate: "idle", verdict: null, maxStep: Math.max(S.maxStep, 6), lambdaIdx: chosenIdx }); }
  function reset() { set({ imputed: false, reweighed: false, gate: "idle", verdict: null, maxStep: 4, step: 1, lambdaIdx: chosenIdx }); }
  function changePolicy(patch) { Object.assign(S, patch, { gate: "idle", imputed: false, reweighed: false, verdict: null, maxStep: 4 }); if (S.step > 4) S.step = 4; boot(); }
  function setDi(d) { changePolicy({ diThreshold: clamp(+(S.diThreshold + d).toFixed(2), 0.50, 0.95) }); }
  function switchSource(src) {
    if (src === S.source) return;
    Object.assign(S, { source: src, gate: "idle", imputed: false, reweighed: false, verdict: null, maxStep: 4, step: 1 });
    boot();
  }

  // ── check formativo ───────────────────────────────────────────────────────
  function openCheck(n) { set({ check: n, picked: null }); }
  function pickOption(i) { if (S.picked === null) set({ picked: i }); }
  function closeCheck(advance) {
    const n = S.check;
    markComplete(n);
    S.check = null; S.picked = null;
    if (advance && S.tour) { const nx = n + 1; if (nx <= S.maxStep) S.step = nx; }
    render();
    const t = root.querySelector('[data-act="openCheck"]'); if (t) t.focus(); // devolve o foco (C-2)
  }

  // ── tutor (3 camadas: /api/tutor LLM → fallback do servidor → offline determinístico no cliente) ──
  function tutorOffline(n, q) {
    const s = (q || "").toLowerCase();
    if (/reweigh|kamiran|reponder|peso|smote|reamostr/.test(s))
      return "A reponderação Kamiran–Calders usa peso w(g,y)=P(g)P(y)/P(g,y) por célula (grupo×rótulo), quebrando a correlação protegido↔rótulo antes do treino. SMOTE foi preterido: pontos sintéticos injetam ruído e derrubam a AUC sobre 1.000 linhas escassas.";
    if (/imputa|imputo|not_known|faltante|missing|nulo|preench|moda/.test(s))
      return "Imputamos o NA condicionando ao subgrupo (group-aware), nunca pela moda global — a moda global apaga a estrutura da minoria e a viesa. A flag 'missingness-as-signal' preserva o fato de o dado ter faltado.";
    if (/disparate|impact|paridade|fairness|justi|80%|regra dos|\bdi\b|dpd/.test(s))
      return "Disparate impact é a razão entre a taxa de seleção do grupo protegido e a do privilegiado (regra dos 80% ⇒ ≥ 0,80). No dado real do fairgate isso já passa cru — a sonda exclui sexo/idade. A injustiça mora na representação (jovem<25 = 14,9%) e nos rótulos (gap 12,8 p.p.), não num único DI.";
    if (/pandera|contrato|valida|schema|\bci\b|pr-blocker|blocker|pipeline|automatiz/.test(s))
      return "A validação é um contrato executável (Pandera) que falha rápido na ingestão e roda no CI como PR-blocker — nada chega ao treino sem passar. O gate é cláusula suspensiva (P1): bloqueia, não recomenda; o veredito é determinístico (P3).";
    if (/trade|pareto|acur|custo|fronteira|\bλ\b|lambda/.test(s))
      return "A fronteira de Pareto torna o custo explícito: o ponto escolhido respeita o limite de justiça com a MENOR perda de acurácia — não maximiza fairness cegamente. É o menor λ de mitigação que faz o gate inteiro passar.";
    if (/completude|cobertura|consist|domínio|dominio|qualidade|métric|metric|representa/.test(s))
      return "As 3 métricas: completude representacional (cobertura mínima de subgrupo, P5 — não % de não-nulos), consistência de domínio (NA not_known + categorias fora do dicionário) e precisão (gap de taxa-base entre grupos). Cada uma com limite em policy.yaml e conexão causal com o viés.";
    if (/ingest|protegid|deriv|atributo|mapea|idade|sexo/.test(s))
      return "Derivamos sexo e idade<25 logo na ingestão para tornar o eixo de justiça auditável desde o início. O gate precisa de subgrupos nomeáveis (P7) para que o veredito seja legível — por isso idade vira faixa (<25) e não contínua.";
    return "O fairgate mede qualidade e justiça na ingestão e BLOQUEIA o dataset enviesado antes do treino. Pergunte sobre as 3 métricas de DQ, as 2 mitigações (imputação estratificada, Kamiran–Calders), o contrato Pandera, o gate ou o trade-off acurácia × justiça.";
  }
  // ── dock conversacional + voz (porte do tutor do Vitaliza) ──
  const DOCK_WELCOME = "Oi! Sou o tutor do fairgate. Antes de um modelo de IA aprender a decidir quem recebe crédito, este sistema audita se os dados tratam os diferentes grupos de pessoas de forma equânime (sem viés por idade, sexo etc.) — e bloqueia a base quando detecta injustiça, em vez de apenas sinalizar. Pode me perguntar qualquer coisa, por texto ou por voz, ou tocar em \"explicar esta fase\".";
  const DOCK_SUGGEST = ["O que esta fase mostra?", "Por que o gate bloqueia se o DI já passa cru?", "Por que SMOTE foi preterido?"];

  function setDock(patch) {
    const inp = root.querySelector(".fg-dock-input"); if (inp) S.dock.input = inp.value;
    Object.assign(S.dock, patch); render();
  }
  function ensureWelcome() { if (S.dock.messages.length === 0) S.dock.messages.push({ role: "assistant", content: DOCK_WELCOME }); }
  function scrollDock() { const b = root.querySelector(".fg-dock-msgs"); if (b) b.scrollTop = b.scrollHeight; }
  let _welcomedVoice = false;
  function openDock(seedQ) {
    const wasClosed = !S.dock.open;
    S.dock.open = true; ensureWelcome();
    const fresh = S.dock.messages.length === 1 && S.dock.messages[0].role === "assistant";
    const greet = wasClosed && fresh && !seedQ && !_welcomedVoice;   // 1ª abertura da sessão
    if (greet) { _welcomedVoice = true; S.dock.speakOn = true; }     // abre já com voz
    render();
    const inp = root.querySelector(".fg-dock-input"); if (inp) { if (seedQ) inp.value = seedQ; inp.focus(); }
    scrollDock();
    if (greet) speak(DOCK_WELCOME);                                   // fala o welcome ao abrir
  }
  function closeDock() { stopSpeak(); stopMic(); S.dock.open = false; render(); }
  function toggleSpeak() { S.dock.speakOn = !S.dock.speakOn; if (!S.dock.speakOn) stopSpeak(); render(); }

  async function sendDock(text) {
    const q = (text || "").trim();
    if (!q || S.dock.loading) return;
    S.dock.messages.push({ role: "user", content: q });
    S.dock.input = ""; S.dock.loading = true; render(); scrollDock();
    const m = T.get(S.step);
    let answer;
    try {
      const hist = S.dock.messages.filter((x) => x.role === "user" || x.role === "assistant");
      const r = await fetch("/api/tutor", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: hist, station: m ? `${m.n} · ${m.name}` : "" }) });
      if (!r.ok) throw new Error("http " + r.status);
      const d = await r.json(); answer = d.answer || tutorOffline(S.step, q);
    } catch (e) { answer = tutorOffline(S.step, q); }   // camada 3: offline determinístico no cliente
    S.dock.loading = false; S.dock.messages.push({ role: "assistant", content: answer }); render(); scrollDock();
    if (S.dock.speakOn) speak(answer);
  }
  function explainStation(n) {
    const m = T.get(n); if (!m) return;
    S.dock.open = true; ensureWelcome(); S.dock.speakOn = true;
    sendDock(`Explique de forma clara a fase "${m.name}" (estação ${m.n} de 7) do fairgate: o que ela mostra, por que importa e a conexão com o viés/justiça.`);
  }

  // ---- voz (porte de use-speak): TTS de servidor (/api/tts) + fallback do navegador ----
  async function getTtsStatus() {
    if (_ttsStatus !== null) return _ttsStatus;
    try { const r = await fetch("/api/tts"); _ttsStatus = r.ok ? await r.json() : { serverVoiceAvailable: false }; }
    catch (e) { _ttsStatus = { serverVoiceAvailable: false }; }
    return _ttsStatus;
  }
  function pickPtVoice() {
    if (typeof speechSynthesis === "undefined") return null;
    const voices = speechSynthesis.getVoices(); if (!voices.length) return null;
    const pt = voices.filter((v) => /^pt([-_]?br)?/i.test(v.lang)); const pool = pt.length ? pt : voices;
    const score = (v) => { const n = (v.name || "").toLowerCase(); let s = 0; if (/natural|neural|online|premium|enhanced/.test(n)) s += 9; if (/google/.test(n)) s += 5; if (/pt[-_]?br/i.test(v.lang)) s += 3; if (v.localService === false) s += 2; return s; };
    return [...pool].sort((a, b) => score(b) - score(a))[0] || null;
  }
  function stopSpeak() {
    _speakToken++;   // invalida qualquer fala chunkada em andamento
    try { if (_audio) { _audio.pause(); _audio.src = ""; _audio = null; } } catch (e) {}
    try { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); } catch (e) {}
    S.dock.playing = false;
  }
  function speakBrowser(text) {
    try {
      if (typeof speechSynthesis === "undefined") return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = _ptVoice || pickPtVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "pt-BR";
      u.rate = 1.0; u.pitch = 1.0;
      u.onend = () => { S.dock.playing = false; render(); };
      u.onerror = () => { S.dock.playing = false; };
      S.dock.playing = true; speechSynthesis.speak(u);
    } catch (e) { S.dock.playing = false; }
  }
  // quebra o texto em pedaços ~frase (<= max chars) p/ síntese progressiva
  function splitForTTS(text, max) {
    max = max || 170;
    const clean = String(text).replace(/\s+/g, " ").trim();
    const sents = clean.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) || [clean];
    const chunks = []; let cur = "";
    for (const s of sents) {
      const t = s.trim(); if (!t) continue;
      if (cur && (cur + " " + t).length > max) { chunks.push(cur); cur = t; }
      else cur = cur ? cur + " " + t : t;
    }
    if (cur) chunks.push(cur);
    return chunks.length ? chunks : [clean];
  }
  async function ttsSynth(text) {
    const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const ct = r.headers.get("Content-Type") || "";
    return (r.ok && ct.indexOf("audio") === 0) ? await r.blob() : null;
  }
  // Fala progressiva: sintetiza por frase e toca a 1ª assim que pronta,
  // pré-buscando as próximas em paralelo → início em ~1 frase curta (não no texto todo).
  async function speak(text) {
    stopSpeak();
    const token = _speakToken;
    const st = await getTtsStatus();
    if (token !== _speakToken) return;
    if (st && st.serverVoiceAvailable) {
      const chunks = splitForTTS(text);
      const jobs = new Array(chunks.length).fill(null);
      const kick = (i) => { if (i < chunks.length && !jobs[i]) jobs[i] = ttsSynth(chunks[i]).catch(() => null); };
      setDock({ ttsLoading: true });
      kick(0); kick(1);                                  // arranca a 1ª e pré-busca a 2ª
      try {
        for (let i = 0; i < chunks.length; i++) {
          kick(i);
          const blob = await jobs[i];
          if (token !== _speakToken) return;             // cancelado por nova fala/stop
          if (!blob) { if (i === 0) { speakBrowser(text); render(); } else { S.dock.playing = false; _audio = null; render(); } return; }
          kick(i + 1);                                   // pré-busca a próxima enquanto esta toca
          const url = URL.createObjectURL(blob);
          const a = new Audio(url); _audio = a;
          if (i === 0) { S.dock.ttsLoading = false; S.dock.playing = true; render(); }
          await new Promise((res) => {
            a.onended = () => { URL.revokeObjectURL(url); res(); };
            a.onerror = () => { URL.revokeObjectURL(url); res(); };
            a.onpause = () => res();                      // stopSpeak pausa → resolve p/ checar cancelamento
            a.play().catch(() => res());
          });
          if (token !== _speakToken) { try { a.pause(); } catch (e) {} return; }
        }
        _audio = null; S.dock.playing = false; render();
        return;
      } catch (e) { S.dock.ttsLoading = false; }
    }
    speakBrowser(text); render();
  }

  // ---- mic (SpeechRecognition pt-BR) ----
  function stopMic() { try { if (_rec) _rec.stop(); } catch (e) {} S.dock.listening = false; }
  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (S.dock.listening) { stopMic(); render(); return; }
    const rec = new SR(); rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => { let interim = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else interim += t; } const inp = root.querySelector(".fg-dock-input"); if (inp) inp.value = finalText || interim; };
    rec.onerror = () => { S.dock.listening = false; render(); };
    rec.onend = () => { S.dock.listening = false; render(); if (finalText.trim()) sendDock(finalText); };
    _rec = rec; S.dock.listening = true; render();
    try { rec.start(); } catch (e) { S.dock.listening = false; render(); }
  }

  // ── ações (delegação) ─────────────────────────────────────────────────────
  root.addEventListener("click", (ev) => {
    if (S.check != null && ev.target.classList && ev.target.classList.contains("fg-modal-veil")) { closeCheck(false); return; }
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const act = el.getAttribute("data-act");
    const n = +el.getAttribute("data-n");
    const i = +el.getAttribute("data-i");
    switch (act) {
      case "closeDef": S.defShown = false; render(); break;
      case "go": go(n); break;
      case "reset": reset(); break;
      case "di": setDi(parseFloat(el.getAttribute("data-d"))); break;
      case "runGate": runGate(); break;
      case "impute": applyImpute(); break;
      case "reweigh": if (S.imputed) applyReweigh(); break;
      case "setLambda": set({ lambdaIdx: i }); break;
      case "primary": primaryAction(); break;
      case "source": switchSource(el.getAttribute("data-src")); break;
      case "openCheck": openCheck(n); break;
      case "pick": pickOption(i); break;
      case "closeCheck": closeCheck(false); break;
      case "closeNext": closeCheck(true); break;
      case "tour": startTour(); break;
      case "openDock": openDock(el.getAttribute("data-q") || ""); break;
      case "closeDock": closeDock(); break;
      case "dockSend": { const ta = root.querySelector(".fg-dock-input"); sendDock(ta ? ta.value : ""); break; }
      case "dockSuggest": sendDock(el.getAttribute("data-q") || ""); break;
      case "toggleSpeak": toggleSpeak(); break;
      case "toggleMic": toggleMic(); break;
      case "dockStop": stopSpeak(); render(); break;
      case "explain": explainStation(n); break;
      case "speakMsg": { const j = +el.getAttribute("data-i"); const msg = S.dock.messages[j]; if (msg) { speak(msg.content); } break; }
      case "print": window.print(); break;
      case "noop": break;
    }
  });

  // ativar por teclado os elementos não-button com data-act (pontos SVG do Pareto)
  root.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const el = ev.target.closest('[data-act="setLambda"]');
    if (el) { ev.preventDefault(); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
  });

  document.addEventListener("keydown", (ev) => {
    if (S.dock.open && ev.key === "Escape" && S.check == null) { closeDock(); return; }
    if (S.check == null) return;
    if (ev.key === "Escape") { closeCheck(false); return; }
    if (ev.key === "Tab") {
      const modal = root.querySelector(".fg-modal");
      if (!modal) return;
      const f = modal.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (ev.shiftKey && (a === first || a === modal)) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && a === last) { ev.preventDefault(); first.focus(); }
    }
  });

  function startTour() {
    const firstIncomplete = T.STATIONS.find((s) => !S.completed.has(s.n) && s.n <= S.maxStep) || T.STATIONS[0];
    set({ tour: true, step: firstIncomplete.n });
  }

  function primaryAction() {
    const g = S.gate;
    if (g === "running") return;
    if (g === "approved") return go(7);
    if (g === "blocked" && S.step < 5) return go(5);
    if (S.step < 4) return go(S.step + 1);
    if (S.step === 4) return runGate();
    if (S.step === 5) { if (S.imputed && S.reweighed) return go(6); return; }
    return runGate();
  }

  // ── render ─────────────────────────────────────────────────────────────────
  function render() {
    if (!S.ready) return;
    root.innerHTML = `<div class="fg-app">${backdrop()}${topbar()}${defBanner()}
      <div class="fg-body">${railLeft()}${stage()}${railRight()}</div>
      ${footer()}${S.check != null ? checkModal() : ""}${dockUI()}</div>`;
    if (S.check != null) { const md = root.querySelector(".fg-modal"); if (md) md.focus(); }
  }

  function backdrop() {
    return `<svg class="fg-backdrop" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="fgGlow" cx="76%" cy="14%" r="60%">
          <stop offset="0%" stop-color="#14B8A6" stop-opacity="0.16"/><stop offset="55%" stop-color="#14B8A6" stop-opacity="0.04"/><stop offset="100%" stop-color="#14B8A6" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="fgGlow2" cx="14%" cy="92%" r="55%">
          <stop offset="0%" stop-color="#1E3A5F" stop-opacity="0.06"/><stop offset="100%" stop-color="#1E3A5F" stop-opacity="0"/>
        </radialGradient>
        <pattern id="fgDots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="1.2" fill="#0E1F30" fill-opacity="0.05"/></pattern>
      </defs>
      <rect width="1440" height="900" fill="#FAFAFA"/><rect width="1440" height="900" fill="url(#fgDots)"/>
      <rect width="1440" height="900" fill="url(#fgGlow)"/><rect width="1440" height="900" fill="url(#fgGlow2)"/>
    </svg>`;
  }

  // ── top bar ─────────────────────────────────────────────────────────────
  // banner de definição (plain language) — "o que é o fairgate", no topo, dispensável
  function defBanner() {
    if (!S.defShown) return "";
    return `<section class="fg-defbanner" aria-label="O que é o fairgate">
      <span class="fg-defbanner-ic" aria-hidden="true"><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6'><circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='4.6'/><circle cx='12' cy='12' r='1.1' fill='currentColor' stroke='none'/></svg></span>
      <p class="fg-defbanner-tx"><b>O que é o fairgate?</b> Antes de um <b>modelo de IA</b> aprender a decidir quem recebe <b>crédito</b>, ele audita se os <b>dados são justos</b> com todos os grupos de pessoas — ou seja, sem <b>viés</b> que favoreça ou prejudique por <b>idade</b>, <b>sexo</b> etc. — e <b>bloqueia a base</b> quando detecta injustiça, em vez de apenas sinalizar.</p>
      <button class="fg-defbanner-close" data-act="closeDef" aria-label="Fechar a definição" title="Fechar">×</button>
    </section>`;
  }
  function topbar() {
    const srcReal = S.source === "real";
    return `<header class="fg-top">
      <div class="fg-top-left">
        <div class="fg-brand">
          <svg width="30" height="26" viewBox="0 0 30 26" style="display:block;">
            <rect x="1" y="13" width="5.4" height="12" rx="1" fill="#647D93"/><rect x="8.6" y="7" width="5.4" height="18" rx="1" fill="#5B7691"/>
            <rect x="16.2" y="1" width="5.4" height="24" rx="1" fill="#14B8A6"/><rect x="23.8" y="9" width="5.4" height="16" rx="1" fill="#5B7691"/>
          </svg>
          <div style="line-height:1;"><div class="fg-brand-name">fairgate</div><div class="mono fg-brand-tag">intelligence applied</div></div>
        </div>
        <div class="fg-divider-v"></div>
        <div class="mono fg-subtitle">Console do Operador<span style="color:#8A9AAB;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>audita e bloqueia dados de crédito enviesados antes do treino do modelo</div>
      </div>
      <div class="fg-top-right">
        <div class="fg-seg" role="group" aria-label="Fonte de dados">
          <button data-act="source" data-src="real" class="${srcReal ? "on" : ""}" aria-pressed="${srcReal}" title="German Credit real (1.000 linhas)">REAL</button>
          <button data-act="source" data-src="synthetic" class="${!srcReal ? "on" : ""}" aria-pressed="${!srcReal}" title="Modo estresse-de-viés (seed ${S.seed})">SINTÉTICO</button>
        </div>
        <div class="mono fg-chip" title="${srcReal ? "German Credit · Statlog" : "Sintético-estresse"}"><b>${pop.n}</b> linhas</div>
        <div class="mono fg-chip"><span class="k">policy</span> v${P.version} <span style="color:#0F9486;">#${policyHash}</span></div>
        <div class="mono fg-chip live"><span class="fg-dot"></span>AO VIVO</div>
        <button class="fg-btn-ghost" data-act="reset" title="Reiniciar o ciclo do gate">↺ REINICIAR</button>
      </div>
    </header>`;
  }

  // ── left rail (a trilha) ──────────────────────────────────────────────────
  function railLeft() {
    const progressW = Math.round((S.maxStep / 7) * 100) + "%";
    const rows = T.STATIONS.map((m) => {
      const unlocked = m.n <= S.maxStep;
      const active = m.n === S.step;
      let mk = "";
      if (m.n === 4 && S.gate === "approved") mk = `<div class="fg-station-mark ok" aria-hidden="true">✓</div><span class="sr-only">aprovado</span>`;
      else if (m.n === 4 && S.gate === "blocked") mk = `<div class="fg-station-mark bad" aria-hidden="true">✕</div><span class="sr-only">bloqueado</span>`;
      else if (!unlocked) mk = `<div class="fg-station-mark lock" aria-hidden="true"><svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0'><rect x='4' y='11' width='16' height='10' rx='2'/><path d='M8 11V7a4 4 0 0 1 8 0v4'/></svg></div>`;
      else if (S.completed.has(m.n)) mk = `<div class="fg-station-mark done" aria-hidden="true">✓</div><span class="sr-only">check respondido</span>`;
      else mk = `<div style="width:18px;"></div>`;
      return `<button class="fg-station ${active ? "active" : ""}" data-unlocked="${unlocked ? 1 : 0}" ${active ? 'aria-current="step"' : ""} ${unlocked ? `data-act="go" data-n="${m.n}"` : 'disabled aria-label="' + m.name + ' — estação bloqueada, avance no gate para destravar"'}>
        <div class="fg-station-row">
          <div class="fg-station-num">${("0" + m.n).slice(-2)}</div>
          <div style="flex:1; min-width:0;">
            <div class="fg-station-name">${m.name}</div>
            <div class="fg-station-aula">${m.aula} <span class="fg-station-bloom">· ${m.bloom}</span></div>
          </div>
          ${mk}
        </div>
      </button>`;
    }).join("");
    return `<aside class="fg-rail fg-rail-left" aria-label="Trilha de aprendizado">
      <div class="fg-rail-head">
        <div class="mono" style="font-size:9.5px; letter-spacing:.2em; color:#647D93;">DATA ENGINEERING · MÓDULO 2</div>
        <div style="display:flex; align-items:center; gap:10px; margin-top:9px;">
          <div class="fg-progress-track" role="progressbar" aria-valuenow="${S.maxStep}" aria-valuemin="0" aria-valuemax="7" aria-label="Estações destravadas"><div class="fg-progress-fill" style="width:${progressW};"></div></div>
          <div class="mono" style="font-size:10px; color:#0F9486; letter-spacing:.04em;">${S.maxStep}/7</div>
        </div>
        <div class="mono" style="font-size:9px; color:#5B7691; margin-top:8px; letter-spacing:.04em;">checks <span style="color:#0F9486; font-weight:600;">✓ ${S.completed.size}/7</span></div>
        <button class="fg-tour-cta ${S.tour ? "on" : ""}" data-act="tour" aria-label="${S.tour ? "Continuar a trilha de aprendizado guiada" : "Iniciar a trilha de aprendizado guiada"}">
          <span class="fg-tour-ic">${S.tour
            ? "<svg width='17' height='17' viewBox='0 0 24 24' aria-hidden='true'><circle cx='12' cy='12' r='6' fill='currentColor'/></svg>"
            : "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='6' cy='19' r='2.3'/><circle cx='18' cy='5' r='2.3'/><path d='M8.1 17.6C13 15.2 11 8.8 15.9 6.4'/></svg>"}</span>
          <span class="fg-tour-txt"><span class="fg-tour-title">Trilha de Aprendizado</span><span class="fg-tour-sub">${S.tour ? "em andamento · continuar" : "guiada · 7 estações · ~" + T.EST_MIN + " min"}</span></span>
          <span class="fg-tour-arrow" aria-hidden="true">▸</span>
        </button>
      </div>
      <div class="fg-stations">${rows}</div>
      <div class="fg-rail-foot">
        <div class="mono" style="font-size:9px; letter-spacing:.13em; color:#647D93; line-height:1.7;">INVARIANTE P1 · CLÁUSULA SUSPENSIVA<br><span style="color:#5B7691;">o gate bloqueia — não recomenda</span></div>
      </div>
    </aside>`;
  }

  // ── métricas vivas (memo simples por render) ──────────────────────────────
  function liveMetrics() {
    const c = current();
    return { met: E.metrics(c.rows, P, c.weights), pr: E.probe(c.rows, c.weights, c.imputed) };
  }

  // ── stage (centro) ────────────────────────────────────────────────────────
  function stage() {
    let inner = "";
    switch (S.step) {
      case 1: inner = stepIngest(); break;
      case 2: inner = stepMetrics(); break;
      case 3: inner = stepContract(); break;
      case 4: inner = stepGate(); break;
      case 5: inner = stepMitigate(); break;
      case 6: inner = stepRegress(); break;
      case 7: inner = stepTradeoff(); break;
    }
    return `<main class="fg-stage">${inner}</main>`;
  }

  function head(m, extra) {
    return `<div>
      <div class="fg-eyebrow">${m.eyebrow} <span class="fr-tag">— ${m.fr}</span></div>
      <h1 class="fr fg-h1 ${m.n === 1 ? "big" : ""}">${m.title}</h1>
      ${extra || ""}
    </div>`;
  }

  // STEP 1 — Ingestão
  function stepIngest() {
    const m = T.get(1);
    const rowsHtml = sample.map((r) => {
      const na = (v) => v === "NA";
      const bin = r.age_lt_25 ? `<span class="tag tag-bin-young">&lt;25</span>` : `<span class="tag tag-bin-old">≥25</span>`;
      const sav = na(r.saving_account) ? `<span class="tag tag-na">${r.saving_account}</span>` : `<span style="color:#2D4663;">${r.saving_account}</span>`;
      const chk = na(r.checking_account) ? `<span class="tag tag-na">${r.checking_account}</span>` : `<span style="color:#2D4663;">${r.checking_account}</span>`;
      const risk = r.risk === "good" ? `<span class="tag tag-good">good</span>` : `<span class="tag tag-bad">bad</span>`;
      return `<tr><td class="mono" style="color:#5B7691; font-size:11px;">${r.id}</td><td>${r.sex}</td><td>${r.age}</td><td>${bin}</td><td>${sav}</td><td>${chk}</td><td>${risk}</td></tr>`;
    }).join("");
    const lead = `<p class="fg-lead">Carregamos o German Credit ${S.source === "real" ? "<b style='color:#8A9AAB;font-weight:400'>real</b>" : "sintético"}, derivamos os atributos protegidos — <span class="mono">sexo</span> e <span class="mono">idade&lt;25</span> — e a disparidade já aparece na taxa-base, antes de qualquer modelo.</p>`;
    return `<section class="fg-section">
      ${head(m, lead)}
      <div class="fg-row">
        <div class="fg-card" style="flex:1.5;">
          <div class="fg-card-head"><span class="mono" style="font-size:10px; letter-spacing:.14em; color:#8A9AAB;">Dataset Crédito · amostra <span style="color:#0F9486;">(deriva sexo · idade_bin)</span></span><span class="mono" style="font-size:9.5px; color:#647D93;">${pop.n} linhas · 1 hash de conteúdo</span></div>
          <div style="padding:4px 6px;"><table class="fg-table">
            <thead><tr><th>id</th><th>sexo</th><th>idade</th><th>bin</th><th>poupança</th><th>conta</th><th>risco</th></tr></thead>
            <tbody>${rowsHtml}</tbody></table></div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; gap:14px;">
          <div class="fg-panel">
            <div class="mono fg-label" style="font-size:9.5px;">COMPOSIÇÃO DA POPULAÇÃO</div>
            <div style="margin-top:13px; display:flex; flex-direction:column; gap:12px;">
              <div>
                <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:5px;"><span style="color:rgba(14, 31, 48,.78);">Feminino</span><span class="mono" style="color:#0E1F30;">${pct(pop.female)}</span></div>
                <div class="fg-bar"><div style="width:${pct(pop.female)}; background:#5B7691;"></div></div>
              </div>
              <div>
                <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:5px;"><span style="color:rgba(14, 31, 48,.78);">Jovem &lt; 25</span><span class="mono" style="color:#E0726B;">${pct(pop.young)}</span></div>
                <div class="fg-bar"><div style="width:${pct(pop.young)}; background:#E0726B;"></div></div>
                <div class="mono" style="font-size:9px; color:#647D93; margin-top:4px;">sub-representado — cobertura abaixo do mínimo de política</div>
              </div>
            </div>
          </div>
          <div style="background:rgba(224,114,107,.09); border:1px solid rgba(224,114,107,.28); border-radius:9px; padding:15px 17px; flex:1;">
            <div class="mono" style="font-size:9.5px; letter-spacing:.14em; color:#E0726B;">DISPARIDADE DE TAXA-BASE · JÁ NO DADO CRU</div>
            <div style="display:flex; align-items:flex-end; gap:18px; margin-top:13px;">
              <div><div class="fr" style="font-size:34px; color:#E0726B; line-height:1;">${pct(pop.brYoung)}</div><div style="font-size:11px; color:rgba(14, 31, 48,.76); margin-top:4px;">"bad" · jovem &lt;25</div></div>
              <div style="font-size:20px; color:#647D93; padding-bottom:8px;">vs</div>
              <div><div class="fr" style="font-size:34px; color:rgba(14, 31, 48,.9); line-height:1;">${pct(pop.brOld)}</div><div style="font-size:11px; color:rgba(14, 31, 48,.76); margin-top:4px;">"bad" · ≥25</div></div>
            </div>
            <div style="font-size:12.5px; line-height:1.5; color:rgba(14, 31, 48,.82); margin-top:13px; font-weight:300;">Um gap de <span style="color:#E0726B; font-weight:500;">${((pop.brYoung - pop.brOld) * 100).toFixed(1)}</span> p.p. — o rótulo histórico já carrega a desigualdade que o modelo iria <em style="color:#0E1F30; font-weight:500;">amplificar</em>.</div>
          </div>
        </div>
      </div>
    </section>`;
  }

  // STEP 2 — Métricas DQ
  function stepMetrics() {
    const m = T.get(2);
    const { met, pr } = liveMetrics();
    const tagOk = (p) => (p ? "color:#0F9486;background:#EAF8F5;" : "color:#C0504D;background:#FBECEC;");
    const cards = [
      { n: "01", title: "Completude representacional", pillar: "COMPLETUDE", value: pp(met.completude.value) + "%", limit: "cobertura ≥ 30% por subgrupo", pass: met.completude.pass,
        mede: "Menor cobertura de subgrupo protegido vs. população — não é % de não-nulos (P5).", impact: "Sub-representação → o modelo subajusta a minoria → erro e injustiça concentrados nela. É causa, não sintoma.", extra: "jovem " + pp(met.completude.detail.covYoung) + "% · fem " + pp(met.completude.detail.covFemale) + "%" },
      { n: "02", title: "Consistência de domínio", pillar: "CONSISTÊNCIA", value: pp(met.consistencia.value) + "%", limit: "violação ≤ 5% · 0 não-mapeadas", pass: met.consistencia.pass,
        mede: "Valores fora do domínio + categorias não-mapeadas; o not_known é NA explícito, nunca categoria.", impact: "Código inválido vira proxy espúrio que o modelo correlaciona ao grupo → discriminação por artefato de dado.", extra: met.consistencia.detail.violations + " células NA (not_known)" },
      { n: "03", title: "Precisão + disparidade de taxa-base", pillar: "PRECISÃO", value: pp(met.precisao.value) + " p.p.", limit: "gap ≤ 10 p.p. · DI ≥ 0,80", pass: met.precisao.pass,
        mede: "Gap de taxa-base \"bad\" entre subgrupos + disparate impact medido no modelo-sonda (seed 42).", impact: "Rótulo histórico enviesado → o modelo aprende e amplifica a injustiça; a média mascara o subgrupo.", extra: "DI " + pr.di_age.toFixed(2) + " · regra dos 80%" },
    ];
    const pillar = (txt, sub, on) => `<div style="flex:${on ? 1.3 : 1}; background:${on ? "rgba(20,184,166,.13)" : "rgba(14, 31, 48,.03)"}; border:1px solid ${on ? "rgba(20,184,166,.4)" : "rgba(14, 31, 48,.08)"}; border-radius:6px; padding:8px 11px; ${on ? "" : "opacity:.5;"}"><div class="mono" style="font-size:11px; font-weight:600; color:${on ? "#0F9486" : "#5B7691"};">${txt}${on ? " ✓" : ""}</div><div style="font-size:10px; color:${on ? "#2D4663" : "#647D93"}; margin-top:2px;">${sub}</div></div>`;
    const cardsHtml = cards.map((c) => `<div class="fg-card fg-card-sm" style="flex:1; border:1px solid ${c.pass ? "#B4E6DD" : "#EBC4C4"}; padding:15px 16px 14px; display:flex; flex-direction:column;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:11px; border-bottom:1px solid #EDF0F3;">
        <div style="display:flex; align-items:baseline; gap:9px; min-width:0;"><span class="mono" style="font-size:13px; font-weight:600; color:#0F9486;">${c.n}</span><span style="font-size:15px; font-weight:600; color:#0E1F30; line-height:1.12;">${c.title}</span></div>
        <span class="mono" style="font-size:8.5px; letter-spacing:.08em; color:#0F9486; background:#EAF8F5; padding:3px 7px; border-radius:3px; white-space:nowrap;">${c.pillar}</span>
      </div>
      <div class="mono" style="font-size:9px; letter-spacing:.16em; color:#5B7691; margin-top:12px;">MEDE</div>
      <div style="font-size:12.5px; line-height:1.45; color:#2D4663; margin-top:4px;">${c.mede}</div>
      <div style="margin-top:11px; background:#EAF8F5; border-left:3px solid #14B8A6; padding:8px 11px; border-radius:0 4px 4px 0;">
        <div class="mono" style="font-size:9px; letter-spacing:.1em; color:#0F9486;">LIMITE OPERACIONAL · policy.yaml</div>
        <div style="font-size:12.5px; color:#0E1F30; margin-top:2px;">${c.limit}</div>
      </div>
      <div class="mono" style="font-size:9px; letter-spacing:.16em; color:#5B7691; margin-top:11px;">IMPACTO NO MODELO DE CRÉDITO</div>
      <div style="font-size:12.5px; line-height:1.45; color:#2D4663; margin-top:4px;">${c.impact}</div>
      <div style="margin-top:auto; padding-top:12px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span class="mono" style="font-size:10px;font-weight:600;letter-spacing:.05em;padding:3px 9px;border-radius:4px;${tagOk(c.pass)}">${c.pass ? "✓ PASS" : "✕ REPROVA"}</span>
        <div style="text-align:right;"><span class="fr" style="font-size:26px; line-height:1; color:${c.pass ? "#0F9486" : "#C0504D"};">${c.value}</span><div class="mono" style="font-size:9px; color:#5B7691; margin-top:3px;">${c.extra}</div></div>
      </div>
    </div>`).join("");
    return `<section class="fg-section" style="height:100%;">
      ${head(Object.assign({}, m, { title: m.title }), "")}
      <div>
        <div class="mono" style="font-size:9px; letter-spacing:.12em; color:#647D93; margin-bottom:7px;">OS 6 PILARES DA QUALIDADE (AULA 4) — SELECIONAMOS OS 3 QUE FALHAM NO GERMAN CREDIT</div>
        <div style="display:flex; gap:7px;">
          ${pillar("ATUALIDADE", "está atualizado?", false)}${pillar("PRECISÃO", "correto — e igual entre grupos?", true)}${pillar("COMPLETUDE", "completo por subgrupo?", true)}${pillar("CONSISTÊNCIA", "segue o domínio válido?", true)}${pillar("CONFORMIDADE", "existe um padrão?", false)}${pillar("INTEGRIDADE", "conecta a outros dados?", false)}
        </div>
      </div>
      <div style="display:flex; gap:13px; flex:1; min-height:0;">${cardsHtml}</div>
    </section>`;
  }

  // STEP 3 — Contrato
  function stepContract() {
    const m = T.get(3);
    const { met } = liveMetrics();
    const noNA = met.consistencia.value === 0;
    const checks = [
      { n: "01", name: "Alcance", desc: "idade 18–120 · valor ≥ 0", pass: true },
      { n: "02", name: "Tipo", desc: 'numérico sem texto "N/A"', pass: true },
      { n: "03", name: "Formato", desc: "código no padrão Statlog", pass: true },
      { n: "04", name: "Consistência", desc: "domínio válido · not_known ≠ categoria", pass: met.consistencia.pass },
      { n: "05", name: "Unicidade", desc: "sem registros duplicados", pass: true },
      { n: "06", name: "Existência", desc: "campo crítico não-nulo", pass: noNA },
      { n: "07", name: "Integridade + cobertura de subgrupo", desc: "a checagem de fairness que diferencia este gate", pass: met.completude.pass },
    ];
    const list = checks.map((c) => `<div style="display:flex; align-items:center; gap:11px;">
      <span style="${c.pass ? "color:#0F9486;background:#EAF8F5;" : "color:#C0504D;background:#FBECEC;"}width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${c.pass ? "✓" : "✕"}</span>
      <span class="mono" style="font-size:10px; color:#5B7691; width:18px;">${c.n}</span>
      <span style="font-size:13.5px; font-weight:600; color:#0E1F30;">${c.name}</span>
      <span style="font-size:12.5px; color:#647D93;">— ${c.desc}</span>
    </div>`).join("");
    const lead = `<p class="fg-lead" style="font-size:13.5px;">Um contrato versionado (Pandera) que falha rápido na ingestão — a "segurança que confere o documento na entrada" (Aula 7).</p>`;
    return `<section class="fg-section" style="height:100%;">
      ${head(m, lead)}
      <div style="display:flex; gap:14px; flex:1; min-height:0;">
        <div class="fg-card" style="flex:1.15; background:#FFFFFF; padding:15px 18px; display:flex; flex-direction:column;">
          <div style="display:flex; align-items:center; gap:9px; margin-bottom:11px;"><span class="mono" style="font-size:9.5px; letter-spacing:.13em; color:#5B7691;">CHECAGENS VERSIONADAS</span><span style="flex:1; height:1px; background:#EDF0F3;"></span><span class="mono" style="font-size:11px; font-weight:600; color:#0F9486;">Pandera</span></div>
          <div style="display:flex; flex-direction:column; gap:8px;">${list}</div>
        </div>
        <div style="width:392px; flex-shrink:0; display:flex; flex-direction:column; gap:13px;">
          <div class="fg-panel-deep">
            <div class="mono" style="font-size:9px; letter-spacing:.13em; color:#0F9486; margin-bottom:9px;">contract.py · DATAFRAMESCHEMA</div>
            <pre class="mono" style="margin:0; font-size:11.5px; line-height:1.65; color:#647D93; white-space:pre-wrap;">Column("age", int, Check.in_range(18,120))
Column("saving", str, Check.isin(DOMAIN))
Column("checking", nullable=<span style="color:#E0726B;">False</span>)
@check  cobertura_subgrupo &gt;= 0.30</pre>
          </div>
          <div class="fg-panel" style="flex:1;">
            <div class="mono" style="font-size:9px; letter-spacing:.13em; color:#5B7691; margin-bottom:9px;">ALERTAS &amp; GATES — DOIS NÍVEIS</div>
            <div style="display:flex; flex-direction:column; gap:9px;">
              <div style="display:flex; gap:9px; align-items:baseline;"><span class="mono" style="font-size:10px; font-weight:600; color:#D98E5A; background:rgba(217,142,90,.14); padding:2px 8px; border-radius:3px;">WARNING</span><span style="font-size:12.5px; color:rgba(14, 31, 48,.82);">registra e segue</span></div>
              <div style="display:flex; gap:9px; align-items:baseline;"><span class="mono" style="font-size:10px; font-weight:600; color:#E0726B; background:rgba(224,114,107,.15); padding:2px 8px; border-radius:3px;">BLOCKER</span><span style="font-size:12.5px; color:rgba(14, 31, 48,.82);">reprova e interrompe · roda no CI como <strong style="color:#0E1F30; font-weight:500;">PR-blocker</strong></span></div>
            </div>
            <div style="margin-top:13px; padding-top:11px; border-top:1px solid rgba(14, 31, 48,.08);">
              <div style="font-size:12.5px; line-height:1.5; color:rgba(14, 31, 48,.76); font-weight:300;">No dado cru, as checagens <strong style="color:#E0726B; font-weight:500;">04 · 06 · 07</strong> reprovam — o <em class="mono" style="font-size:11px;">not_known</em>, o NA em conta e a sub-cobertura de jovem.</div>
            </div>
          </div>
        </div>
      </div>
      ${maturityCurve()}
    </section>`;
  }
  function maturityCurve() {
    const bar = (h, n, t, on) => `<div style="flex:1; display:flex; flex-direction:column; gap:5px;"><div style="height:${h}px; background:${on || "rgba(14, 31, 48,.1)"}; border-radius:3px; ${on ? "box-shadow:0 4px 14px -5px rgba(20,184,166,.6);" : ""}"></div><div style="font-size:11px; color:${on ? "rgba(14, 31, 48,.82)" : "#647D93"};"><span class="mono" style="font-size:9px; color:${on ? "#0F9486" : "#8A9AAB"};">${n}</span> ${t}</div></div>`;
    return `<div class="fg-panel" style="padding:12px 17px; flex-shrink:0;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <span class="mono" style="font-size:9px; letter-spacing:.13em; color:#5B7691;">CURVA DE MATURIDADE DATAOPS — ONDE O FAIRGATE OPERA</span>
        <span class="fr" style="font-style:italic; font-size:13.5px; color:rgba(14, 31, 48,.72);">“Sem validação não há escala — só escala de erro.”</span>
      </div>
      <div style="display:flex; align-items:flex-end; gap:8px;">
        ${bar(16, "N1", "Dados inconsistentes", "")}${bar(26, "N2", "Correção manual", "")}${bar(38, "N3", "Regras automatizadas", "#14B8A6")}${bar(50, "N4", "Monitoramento contínuo", "#0F9486")}${bar(62, "N5", "Observabilidade + IA", "")}
        <div style="width:188px; padding-left:13px; border-left:1px solid rgba(14, 31, 48,.1); align-self:stretch; display:flex; align-items:center;"><div style="font-size:12px; line-height:1.45; color:rgba(14, 31, 48,.78); font-weight:300;">O <strong style="color:#0F9486; font-weight:500;">fairgate</strong> entrega <strong style="color:#0E1F30; font-weight:500;">N3→N4</strong>: regras versionadas em Git + drift, com horizonte em N5.</div></div>
      </div>
    </div>`;
  }

  // STEP 4 — Gate
  function stepGate() {
    const m = T.get(4);
    const { met, pr } = liveMetrics();
    const g = S.gate, v = S.verdict;
    const Pf = P;
    const gateChecks = v ? v.checks : [
      { pillar: "COMPLETUDE", subgroup: "age_lt_25", metric: "cobertura efetiva", value: met.completude.value, limit: Pf.quality.coverage_min, op: "≥", pass: met.completude.pass },
      { pillar: "CONSISTÊNCIA", subgroup: "saving/checking", metric: "violação de domínio", value: met.consistencia.value, limit: Pf.quality.domain_violation_max, op: "≤", pass: met.consistencia.pass },
      { pillar: "PRECISÃO", subgroup: "age_lt_25", metric: "gap de taxa-base", value: met.precisao.value, limit: Pf.quality.base_rate_gap_max, op: "≤", pass: met.precisao.pass },
      { pillar: "FAIRNESS", subgroup: "age_lt_25", metric: "disparate impact ratio", value: pr.di_age, limit: Pf.fairness.disparate_impact_min, op: "≥", pass: pr.di_age >= Pf.fairness.disparate_impact_min },
      { pillar: "FAIRNESS", subgroup: "age_lt_25", metric: "demographic parity diff", value: pr.dpd_age, limit: Pf.fairness.demographic_parity_diff_max, op: "≤", pass: pr.dpd_age <= Pf.fairness.demographic_parity_diff_max },
      { pillar: "FAIRNESS", subgroup: "female", metric: "disparate impact ratio", value: pr.di_sex, limit: Pf.fairness.disparate_impact_min, op: "≥", pass: pr.di_sex >= Pf.fairness.disparate_impact_min },
    ];
    const rowsHtml = gateChecks.map((c) => `<tr style="border-top:1px solid #EDF0F3;">
      <td class="mono" style="padding:6px; font-size:9.5px; color:#5B7691;">${c.pillar}</td>
      <td class="mono" style="padding:6px; font-size:11px; color:#2D4663;">${c.subgroup}</td>
      <td style="padding:6px; color:#2D4663;">${c.metric}</td>
      <td class="mono" style="padding:6px; text-align:right; ${c.pass ? "color:#0F9486;" : "color:#C0504D;font-weight:600;"}">${c.value.toFixed(3)}</td>
      <td class="mono" style="padding:6px; text-align:center; color:#5B7691; font-size:11px;">${c.op} ${c.limit}</td>
      <td style="padding:6px; text-align:center; color:${c.pass ? "#0F9486" : "#C0504D"}; font-weight:700;">${c.pass ? "✓" : "✕"}</td>
    </tr>`).join("");

    let outTone = "#5B7691", outTitle = "AGUARDANDO", outSub = "rode o gate para o veredito", outBg = "rgba(14, 31, 48,.03)", outBd = "rgba(14, 31, 48,.09)", outAnim = "", evNote = "pré-execução · medição ao vivo";
    if (g === "running") { outTone = "#14B8A6"; outTitle = "CALCULANDO"; outSub = "treinando a sonda…"; outBd = "rgba(20,184,166,.3)"; }
    else if (g === "blocked") { outTone = "#E0726B"; outTitle = "✕ TREINO SUSPENSO"; outSub = "GateBlocked · quarentena"; outBg = "rgba(224,114,107,.1)"; outBd = "rgba(224,114,107,.4)"; outAnim = "animation:fgSlam .5s var(--fg-ease);"; evNote = "veredito emitido"; }
    else if (g === "approved") { outTone = "#0F9486"; outTitle = "✓ TREINO LIBERADO"; outSub = "dataset_aprovado emitido"; outBg = "rgba(20,184,166,.1)"; outBd = "rgba(20,184,166,.42)"; outAnim = "animation:fgSlam .5s var(--fg-ease);"; evNote = "veredito emitido"; }

    const diMin = Pf.fairness.disparate_impact_min;
    const diBtn = (d, lbl, dis) => `<button class="fg-step" data-act="di" data-d="${d}" ${dis ? "disabled" : ""} aria-label="${lbl}">${lbl}</button>`;
    return `<section class="fg-section" style="height:100%;">
      ${head(m, "")}
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <span class="mono" style="font-size:9px; letter-spacing:.13em; color:#647D93;">POLÍTICA DO GATE · EDITÁVEL</span>
        <div class="fg-policy-ctl"><span class="mono">DI ≥</span>${diBtn(-0.05, "−", diMin <= 0.50)}<b class="mono">${diMin.toFixed(2)}</b>${diBtn(0.05, "+", diMin >= 0.95)}</div>
        <span class="mono" style="font-size:9.5px; color:#8A9AAB;">mexa no limite e rode o gate — a regra dos 80% é dos EUA; <em style="font-style:italic;">qual número você assinaria sob LGPD?</em></span>
      </div>
      <div style="display:flex; align-items:stretch; gap:14px;">
        <div class="fg-panel" style="width:150px; flex-shrink:0; display:flex; flex-direction:column; justify-content:center; text-align:center;">
          <div class="mono" style="font-size:9px; letter-spacing:.12em; color:#647D93;">ENTRADA</div>
          <div style="font-size:14px; color:rgba(14, 31, 48,.85); margin-top:6px; line-height:1.3;">dados de crédito</div>
          <div style="font-size:11px; color:#647D93; margin-top:6px; line-height:1.35;">na ingestão,<br>antes do treino</div>
        </div>
        <div style="display:flex; align-items:center; color:#0F9486; font-size:20px;">→</div>
        <div style="flex:1; position:relative; background:#EEF1F5; border:1px solid rgba(20,184,166,.28); border-radius:11px; padding:15px 18px; overflow:hidden;">
          ${g === "running" ? `<div style="position:absolute; inset:0; background:linear-gradient(100deg, transparent 30%, rgba(20,184,166,.14) 50%, transparent 70%); background-size:360px 100%; animation:fgShimmer 1.1s linear infinite;"></div>` : ""}
          <div style="position:relative; display:flex; align-items:center; justify-content:space-between;"><div class="mono" style="font-size:10px; letter-spacing:.14em; color:#0F9486;">O GATE · 3 CAMADAS</div><div class="mono" style="font-size:9px; letter-spacing:.1em; color:#647D93;">modelo-sonda · LogReg · seed ${S.seed}</div></div>
          <div style="position:relative; display:flex; gap:9px; margin-top:12px;">
            <div style="flex:1; background:rgba(14, 31, 48,.04); border:1px solid rgba(14, 31, 48,.09); border-radius:7px; padding:9px 11px;"><div class="mono" style="font-size:9px; color:#5B7691; letter-spacing:.06em;">L1 · CONTRATO</div><div style="font-size:11.5px; color:rgba(14, 31, 48,.7); margin-top:3px; line-height:1.3;">schema · domínio</div></div>
            <div style="flex:1.25; background:rgba(20,184,166,.1); border:1px solid rgba(20,184,166,.34); border-radius:7px; padding:9px 11px;"><div class="mono" style="font-size:9px; color:#0F9486; letter-spacing:.06em;">L2 · FAIRNESS ◀</div><div style="font-size:11.5px; color:rgba(14, 31, 48,.82); margin-top:3px; line-height:1.3;">cobertura · DI ≥ ${Pf.fairness.disparate_impact_min.toFixed(2)} · DPD</div></div>
            <div style="flex:1; background:rgba(14, 31, 48,.04); border:1px solid rgba(14, 31, 48,.09); border-radius:7px; padding:9px 11px;"><div class="mono" style="font-size:9px; color:#5B7691; letter-spacing:.06em;">L3 · REGRESSÃO</div><div style="font-size:11.5px; color:rgba(14, 31, 48,.7); margin-top:3px; line-height:1.3;">re-mede pós-mitig.</div></div>
          </div>
        </div>
        <div style="display:flex; align-items:center; color:#0F9486; font-size:20px;">→</div>
        <div style="width:184px; flex-shrink:0; border-radius:11px; padding:14px; display:flex; flex-direction:column; justify-content:center; text-align:center; background:${outBg}; border:1px solid ${outBd};">
          <div class="mono" style="font-size:9px; letter-spacing:.12em; color:${outTone}; opacity:.85;">SAÍDA</div>
          <div class="mono" style="font-size:17px; font-weight:600; letter-spacing:.02em; color:${outTone}; margin-top:7px; ${outAnim}">${outTitle}</div>
          <div style="font-size:11.5px; color:rgba(14, 31, 48,.78); margin-top:6px; line-height:1.35;">${outSub}</div>
        </div>
      </div>
      <div style="display:flex; gap:14px; flex:1; min-height:0;">
        <div class="fg-card fg-card-sm" style="flex:1.4; padding:13px 16px; display:flex; flex-direction:column; min-height:0;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;"><span class="mono" style="font-size:9.5px; letter-spacing:.13em; color:#5B7691;">VEREDITO · EVIDÊNCIA LEGÍVEL</span><span class="mono" style="font-size:9px; color:#0F9486;">${evNote}</span></div>
          <table class="fg-table" style="font-size:12px;">
            <thead><tr><th>pilar</th><th>subgrupo</th><th>métrica</th><th style="text-align:right;">valor</th><th style="text-align:center;">limite</th><th></th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="fg-panel" style="width:296px; flex-shrink:0; display:flex; flex-direction:column;">
          <div class="mono" style="font-size:9.5px; letter-spacing:.13em; color:#5B7691;">LEITURA DA SONDA</div>
          <div style="margin-top:12px; display:flex; flex-direction:column; gap:11px;">
            ${probeRow("AUC global", pr.auc.toFixed(3), "#0E1F30", true)}
            <div style="height:1px; background:rgba(14, 31, 48,.07);"></div>
            ${probeRow("taxa de seleção · jovem", pp(pr.sr.young) + "%", "#E0726B")}
            ${probeRow("taxa de seleção · ≥25", pp(pr.sr.old) + "%", "rgba(14, 31, 48,.85)")}
            <div style="height:1px; background:rgba(14, 31, 48,.07);"></div>
            ${probeRow("disparate impact", pr.di_age.toFixed(3), "#0F9486")}
            ${probeRow("parity difference", pr.dpd_age.toFixed(3), "#0F9486")}
          </div>
          <div style="margin-top:auto; padding-top:12px; border-top:1px solid rgba(14, 31, 48,.08); font-size:11.5px; line-height:1.5; color:rgba(14, 31, 48,.72); font-weight:300;">Diagnóstico pode ser heurístico; o <strong style="color:#0E1F30; font-weight:500;">veredito é determinístico</strong> — Python puro sobre <em class="mono" style="font-size:10.5px;">policy.yaml</em> (P3).</div>
        </div>
      </div>
    </section>`;
  }
  function probeRow(label, val, color, serif) {
    return `<div style="display:flex; justify-content:space-between; align-items:baseline;"><span style="font-size:12.5px; color:rgba(14, 31, 48,.82);">${label}</span><span class="${serif ? "fr" : "mono"}" style="font-size:${serif ? 21 : 14}px; color:${color};">${val}</span></div>`;
  }

  // STEP 5 — Mitigação
  function stepMitigate() {
    const m = T.get(5);
    const { met, pr } = liveMetrics();
    const rs = rawSnap, Pf = P;
    const mit = {
      covRaw: pp(rs.met.completude.value) + "%", covNow: pp(met.completude.value) + "%",
      naRaw: rs.met.consistencia.detail.violations, naNow: met.consistencia.detail.violations,
      diRaw: rs.probe.di_age.toFixed(3), diNow: pr.di_age.toFixed(3),
      aucRaw: rs.probe.auc.toFixed(3), aucNow: pr.auc.toFixed(3),
    };
    const impStyle = "font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.04em;padding:9px 14px;border-radius:6px;cursor:pointer;border:none;" + (S.imputed ? "background:#EAF8F5;color:#0F9486;" : "background:#14B8A6;color:#0E1F30;");
    const rwStyle = "font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.04em;padding:9px 14px;border-radius:6px;cursor:" + (S.imputed ? "pointer" : "not-allowed") + ";border:none;" + (S.reweighed ? "background:#EAF8F5;color:#0F9486;" : (S.imputed ? "background:#14B8A6;color:#0E1F30;" : "background:rgba(14, 31, 48,.08);color:#8A9AAB;"));
    // campo de pesos
    const c5 = current(); const wA = c5.weights; const stp = Math.max(1, Math.floor(c5.rows.length / 48));
    let cells = "";
    for (let k = 0; k < 48; k++) { const idx = k * stp; const r = c5.rows[idx] || c5.rows[0]; const w = wA ? wA[idx] : 1; const na = (r.checking_account === "NA" || r.saving_account === "NA"); const sz = Math.max(6, Math.min(17, 7 + w * 3)); cells += `<div style="width:${sz}px; height:${sz}px; border-radius:3px; transition:all .6s var(--fg-ease); background:${r.age_lt_25 ? "#14B8A6" : "#647D93"}; opacity:${na ? 0.3 : 0.95}; border:${na ? "1px dashed #D98E5A" : "1px solid transparent"};"></div>`; }
    const deltaBox = (lbl, raw2, now, warn) => `<div style="flex:1; background:${warn ? "#FBF3EC" : "#EAF8F5"}; border:1px solid ${warn ? "#E8D2BE" : "#B4E6DD"}; border-radius:6px; padding:8px 11px;"><div class="mono" style="font-size:8.5px; letter-spacing:.1em; color:${warn ? "#B96F36" : "#0F9486"};">${lbl}</div><div class="mono" style="font-size:14px; font-weight:600; color:#0E1F30; margin-top:2px;">${raw2} <span style="color:#5B7691;">→</span> <span style="color:${warn ? "#B96F36" : "#0F9486"};">${now}</span></div></div>`;

    return `<section class="fg-section" style="height:100%;">
      ${head(m, "")}
      <div style="display:flex; gap:14px; flex:1; min-height:0;">
        <div style="flex:1.35; display:flex; flex-direction:column; gap:12px; min-height:0;">
          <div class="fg-card" style="background:#FFFFFF; border:1px solid #D8DDE3; padding:14px 16px; flex:1;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
              <div style="display:flex; align-items:center; gap:10px;"><span class="mono" style="font-size:10px; font-weight:600; color:#fff; background:#14B8A6; padding:3px 9px; border-radius:4px;">AÇÃO 02</span><span style="font-size:16px; font-weight:600; color:#0E1F30;">Imputação estratificada por grupo</span></div>
              <button data-act="impute" style="${impStyle}">${S.imputed ? "✓ APLICADA" : "APLICAR ▸"}</button>
            </div>
            <div style="display:flex; gap:18px; margin-top:11px;">
              <div style="flex:1;"><div class="mono" style="font-size:8.5px; letter-spacing:.14em; color:#5B7691;">O QUE</div><div style="font-size:12.5px; line-height:1.45; color:#2D4663; margin-top:3px;">Imputar o NA de conta condicionando ao subgrupo — nunca pela moda global, que apaga a estrutura da minoria.</div></div>
              <div style="flex:1;"><div class="mono" style="font-size:8.5px; letter-spacing:.14em; color:#5B7691;">TRADE-OFF</div><div style="font-size:12.5px; line-height:1.45; color:#B96F36; margin-top:3px;">Arrisca reforçar estereótipo (codifica o grupo) → contido pela flag <em class="mono" style="font-size:11px;">missingness-as-signal</em>.</div></div>
            </div>
            <div style="margin-top:11px; display:flex; gap:9px;">${deltaBox("COBERTURA &lt;25", mit.covRaw, mit.covNow)}${deltaBox("NA not_known", mit.naRaw, mit.naNow)}</div>
          </div>
          <div class="fg-card" style="background:#FFFFFF; border:1px solid #D8DDE3; padding:14px 16px; flex:1;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
              <div style="display:flex; align-items:center; gap:10px;"><span class="mono" style="font-size:10px; font-weight:600; color:#fff; background:#14B8A6; padding:3px 9px; border-radius:4px;">AÇÃO 01</span><span style="font-size:16px; font-weight:600; color:#0E1F30;">Reponderação <span style="color:#647D93; font-weight:400;">(Kamiran–Calders)</span></span></div>
              <button data-act="reweigh" style="${rwStyle}">${S.reweighed ? "✓ APLICADA" : "APLICAR ▸"}</button>
            </div>
            <div style="display:flex; gap:18px; margin-top:11px;">
              <div style="flex:1;"><div class="mono" style="font-size:8.5px; letter-spacing:.14em; color:#5B7691;">O QUE</div><div style="font-size:12.5px; line-height:1.45; color:#2D4663; margin-top:3px;">Peso <em class="mono" style="font-size:11px;">w(g,y)=P(g)·P(y)/P(g,y)</em> por célula quebra a correlação protegido↔rótulo antes do treino.</div></div>
              <div style="flex:1;"><div class="mono" style="font-size:8.5px; letter-spacing:.14em; color:#5B7691;">TRADE-OFF</div><div style="font-size:12.5px; line-height:1.45; color:#B96F36; margin-top:3px;">Fairness ↑, acurácia ↓ de forma medível — redistribui ênfase, não cria informação. SMOTE preterido.</div></div>
            </div>
            <div style="margin-top:11px; display:flex; gap:9px;">${deltaBox("GAP TAXA-BASE", pp(rs.met.precisao.value) + "pp", pp(met.precisao.value) + "pp")}${deltaBox("AUC (CUSTO)", mit.aucRaw, mit.aucNow, true)}</div>
          </div>
        </div>
        <div style="width:330px; flex-shrink:0; display:flex; flex-direction:column; gap:12px; min-height:0;">
          <div class="fg-panel" style="flex:1;">
            <div class="mono" style="font-size:9px; letter-spacing:.13em; color:#5B7691;">DADO SE REORGANIZANDO · PESOS POR AMOSTRA</div>
            <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:12px; align-content:flex-start;">${cells}</div>
            <div style="display:flex; gap:12px; margin-top:12px; flex-wrap:wrap;">
              <span style="display:flex; align-items:center; gap:5px; font-size:10px; color:#5B7691;"><span style="width:9px; height:9px; border-radius:2px; background:#14B8A6;"></span>jovem &lt;25</span>
              <span style="display:flex; align-items:center; gap:5px; font-size:10px; color:#5B7691;"><span style="width:9px; height:9px; border-radius:2px; background:#647D93;"></span>≥25</span>
              <span style="display:flex; align-items:center; gap:5px; font-size:10px; color:#5B7691;"><span style="width:9px; height:9px; border-radius:2px; border:1px dashed #D98E5A;"></span>NA</span>
            </div>
          </div>
          <div class="fg-panel-deep" style="border:1px solid rgba(20,184,166,.22); padding:13px 16px;">
            <div class="mono" style="font-size:9px; letter-spacing:.14em; color:#0F9486;">A ORDEM IMPORTA</div>
            <div style="font-size:12.5px; line-height:1.5; color:rgba(14, 31, 48,.7); margin-top:6px; font-weight:300;">Corrigir a representação (<strong style="color:#0E1F30; font-weight:500;">Ação 02</strong>) <em>antes</em> de reponderar (<strong style="color:#0E1F30; font-weight:500;">Ação 01</strong>) evita reponderar sobre dado já enviesado na origem.</div>
          </div>
        </div>
      </div>
    </section>`;
  }

  // STEP 6 — Regressão
  function stepRegress() {
    const m = T.get(6);
    const approved = S.gate === "approved";
    const { pr } = liveMetrics();
    let leftCard;
    if (approved) {
      const v = S.verdict;
      leftCard = `<div class="fg-cert" style="flex:1; display:flex; flex-direction:column; justify-content:center; animation:fgSlam .55s var(--fg-ease);">
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="width:54px; height:54px; border-radius:50%; background:#14B8A6; display:flex; align-items:center; justify-content:center; font-size:28px; color:#0E1F30; flex-shrink:0;">✓</div>
          <div><div class="mono" style="font-size:10px; letter-spacing:.16em; color:#0F9486;">ARTEFATO EMITIDO</div><div class="fr" style="font-size:30px; color:#0E1F30; line-height:1.1; margin-top:3px;">dataset_aprovado</div></div>
        </div>
        <div style="font-size:14px; line-height:1.55; color:rgba(14, 31, 48,.75); margin-top:16px; font-weight:300; max-width:520px;">O gate foi reexecutado sobre o dataset mitigado e voltou <strong style="color:#0F9486; font-weight:500;">verde</strong>. Só agora o treino é liberado — o artefato carrega sua proveniência completa.</div>
        <div class="mono" style="font-size:10px; letter-spacing:.04em; color:#5B7691; margin-top:14px; padding-top:13px; border-top:1px solid rgba(14, 31, 48,.1);">proveniência · policy v${v.provenance.policy_version} <span style="color:#0F9486;">#${v.provenance.policy_hash}</span> · seed ${v.provenance.seed} · DI ${pr.di_age.toFixed(3)} · DPD ${pr.dpd_age.toFixed(3)} · AUC ${pr.auc.toFixed(3)}</div>
        <button class="fg-btn fg-btn-sm no-print" data-act="print" style="margin-top:16px; align-self:flex-start;">Imprimir certificado</button>
      </div>`;
    } else {
      leftCard = `<div style="background:rgba(14, 31, 48,.03); border:1px dashed rgba(14, 31, 48,.18); border-radius:12px; padding:24px; flex:1; display:flex; flex-direction:column; align-items:flex-start; justify-content:center;">
        <div class="mono" style="font-size:10px; letter-spacing:.14em; color:#5B7691;">GATE DE REGRESSÃO · PRONTO</div>
        <div style="font-size:15px; line-height:1.55; color:rgba(14, 31, 48,.72); margin-top:10px; max-width:520px; font-weight:300;">As duas mitigações foram aplicadas ao dataset. Reexecute o gate para emitir — ou não — o <em class="mono" style="font-size:13px;">dataset_aprovado</em>. Não se declara verde sem reexecução (invariante 4).</div>
        <button class="fg-btn" data-act="runGate" style="margin-top:18px;">Reexecutar o gate ▸</button>
      </div>`;
    }
    return `<section class="fg-section" style="height:100%;">
      ${head(m, "")}
      <div style="display:flex; gap:14px; flex:1; min-height:0;">
        <div style="flex:1; display:flex; flex-direction:column; gap:12px;">${leftCard}</div>
        <div class="fg-panel-deep" style="width:330px; flex-shrink:0; border:1px solid rgba(14, 31, 48,.1); display:flex; flex-direction:column;">
          <div class="mono" style="font-size:9px; letter-spacing:.13em; color:#0F9486;">APRENDIZADO UNIDIRECIONAL · P4</div>
          <div style="font-size:13px; line-height:1.55; color:rgba(14, 31, 48,.7); margin-top:9px; font-weight:300;">A divergência (gate vermelho) corrige o <strong style="color:#0E1F30; font-weight:500;">dataset/contrato</strong> — nunca afrouxa o threshold. Relaxar um limite é decisão humana registrada (PR + assinatura do Fairness Steward).</div>
          <div style="margin-top:14px; padding-top:13px; border-top:1px solid rgba(14, 31, 48,.08); display:flex; flex-direction:column; gap:9px;">
            ${["re-medição obrigatória pós-mitigação", "loops autônomos de convergência são proibidos", "veredito sem proveniência é inválido (P6)"].map((t) => `<div style="display:flex; gap:9px; align-items:flex-start;"><span style="color:#0F9486; font-size:13px; margin-top:1px;">✓</span><span style="font-size:12px; color:rgba(14, 31, 48,.76); line-height:1.4;">${t}</span></div>`).join("")}
          </div>
        </div>
      </div>
    </section>`;
  }

  // STEP 7 — Trade-off (Pareto: gap de taxa-base × AUC — o eixo que de fato binda)
  function stepTradeoff() {
    const m = T.get(7);
    const Tp = tradeoffData, gapMax = P.quality.base_rate_gap_max;
    const pts = Tp.points;
    const plotW = 326, plotH = 208, padL = 48, padT = 14;
    const GAP_VIS = 0.18; // 0..18 p.p. preenche o eixo x
    const aucs = pts.map((p) => p.auc).concat(Tp.raw ? [Tp.raw.auc] : []);
    const aMax = Math.max.apply(null, aucs) + 0.0015, aMin = Math.min.apply(null, aucs) - 0.0015;
    const xMap = (gap) => padL + clamp(gap / GAP_VIS, 0, 1) * plotW;
    const yMap = (auc) => padT + clamp((aMax - auc) / (aMax - aMin || 1), 0, 1) * plotH;
    const thrX = +xMap(gapMax).toFixed(1);
    const cpts = pts.map((p, i) => ({ i, cx: +xMap(p.br_gap).toFixed(1), cy: +yMap(p.auc).toFixed(1), gatePass: p.gatePass, gap: pp(p.br_gap), auc: p.auc.toFixed(3), di: p.di_age.toFixed(3), r: i === S.lambdaIdx ? 6 : 3.4, fill: p.gatePass ? "#14B8A6" : "#C0504D" }));
    const sel = cpts[S.lambdaIdx] || cpts[0];
    const path = "M " + cpts.map((p) => p.cx + " " + p.cy).join(" L ");
    const dots = cpts.map((p) => `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${p.fill}" data-act="setLambda" data-i="${p.i}" tabindex="0" role="button" aria-label="Ponto ${p.i + 1}: gap ${p.gap} p.p., AUC ${p.auc}, ${p.gatePass ? "passa o gate" : "reprova"}" style="cursor:pointer; transition:all .2s;"></circle>`).join("");
    const paretoLabel = `Fronteira de Pareto: gap de taxa-base no eixo X (menor é mais justo, limite ${(gapMax * 100).toFixed(0)} p.p.) versus AUC no eixo Y. Ponto cru em ${Tp.raw ? pp(Tp.raw.br_gap) : "—"} p.p.; ponto ótimo escolhido em ${pp(Tp.chosen.br_gap)} p.p., dentro do limite. ${cpts.length} pontos de força de mitigação.`;
    const rawCx = Tp.raw ? +xMap(Tp.raw.br_gap).toFixed(1) : 0, rawCy = Tp.raw ? +yMap(Tp.raw.auc).toFixed(1) : 0;
    const chosen = cpts[chosenIdx] || sel;
    const dAuc = Tp.raw ? ((Tp.raw.auc - Tp.chosen.auc) * 100).toFixed(1) : "0.0";
    const selPass = pts[S.lambdaIdx] ? pts[S.lambdaIdx].gatePass : sel.gatePass;

    return `<section class="fg-section" style="height:100%;">
      ${head(m, "")}
      <div style="display:flex; gap:16px; flex:1; min-height:0;">
        <div class="fg-card fg-card-sm" style="flex:1.5; background:#FFFFFF; padding:14px 16px; display:flex; flex-direction:column;">
          <div class="mono" style="font-size:9.5px; letter-spacing:.13em; color:#5B7691; margin-bottom:4px;">CLIQUE NA FRONTEIRA — VEJA O GATE REAGIR</div>
          <svg viewBox="0 0 400 252" role="img" aria-label="${paretoLabel}" style="width:100%; height:auto; flex:1;">
            <title>Fronteira de Pareto · justiça × acurácia</title>
            <rect x="${thrX}" y="14" width="${(374 - thrX).toFixed(1)}" height="208" fill="#FBECEC" opacity="0.55"></rect>
            <rect x="48" y="14" width="${(thrX - 48).toFixed(1)}" height="208" fill="#EAF8F5" opacity="0.7"></rect>
            <line x1="48" y1="222" x2="374" y2="222" stroke="#8A9AAB" stroke-width="1.4"></line>
            <line x1="48" y1="14" x2="48" y2="222" stroke="#8A9AAB" stroke-width="1.4"></line>
            <line x1="${thrX}" y1="14" x2="${thrX}" y2="222" stroke="#C0504D" stroke-width="1.4" stroke-dasharray="4 3"></line>
            <text x="${thrX}" y="11" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" fill="#C0504D" font-weight="600">gap ≤ ${(gapMax * 100).toFixed(0)} p.p.</text>
            <path d="${path}" fill="none" stroke="#2D4663" stroke-width="2" stroke-linecap="round"></path>
            ${dots}
            ${Tp.raw ? `<circle cx="${rawCx}" cy="${rawCy}" r="6.5" fill="#C0504D"></circle><text x="${rawCx}" y="${(rawCy + 18).toFixed(1)}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8.5" fill="#C0504D" font-weight="600">cru</text>` : ""}
            <circle cx="${chosen.cx}" cy="${chosen.cy}" r="9" fill="none" stroke="#0F9486" stroke-width="2"></circle>
            <text x="${chosen.cx}" y="${(chosen.cy - 13).toFixed(1)}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8.5" fill="#0F9486" font-weight="600">ótimo</text>
            <text x="211" y="246" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" fill="#647D93">← mais justo · gap de taxa-base (p.p.)</text>
            <text x="13" y="118" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" fill="#647D93" transform="rotate(-90 13 118)">Acurácia · AUC →</text>
          </svg>
        </div>
        <div style="width:300px; flex-shrink:0; display:flex; flex-direction:column; gap:12px;">
          <div class="fg-panel">
            <div class="mono" style="font-size:9px; letter-spacing:.13em; color:#5B7691;">PONTO SELECIONADO</div>
            <div style="display:flex; align-items:flex-end; gap:16px; margin-top:11px;">
              <div><div class="fr" style="font-size:30px; line-height:1; color:#0E1F30;">${sel.gap}</div><div style="font-size:10.5px; color:#647D93; margin-top:4px;">gap taxa-base (p.p.)</div></div>
              <div><div class="fr" style="font-size:30px; line-height:1; color:#0E1F30;">${sel.auc}</div><div style="font-size:10.5px; color:#647D93; margin-top:4px;">AUC</div></div>
            </div>
            <div class="mono" style="display:inline-block; margin-top:13px; font-size:10px; font-weight:600; letter-spacing:.06em; color:${selPass ? "#0F9486" : "#C0504D"}; border:1px solid ${selPass ? "#0F9486" : "#C0504D"}; padding:4px 10px; border-radius:5px;">${selPass ? "PASSA O GATE" : "AINDA REPROVA"}</div>
            <div class="mono" style="font-size:9.5px; color:#647D93; margin-top:9px;">DI da sonda neste ponto: ${sel.di}</div>
          </div>
          <div class="fg-panel-deep" style="border:1px solid rgba(20,184,166,.22); padding:14px 16px; flex:1;">
            <div class="mono" style="font-size:9px; letter-spacing:.13em; color:#0F9486;">O PONTO ESCOLHIDO</div>
            <div style="font-size:12.5px; line-height:1.55; color:rgba(14, 31, 48,.7); margin-top:8px; font-weight:300;">Respeita o limite de justiça com a <strong style="color:#0E1F30; font-weight:500;">menor perda de acurácia</strong> — não maximiza fairness cegamente.</div>
            <div style="margin-top:13px; display:flex; gap:10px;">
              <div style="flex:1; background:rgba(192,80,77,.1); border:1px solid rgba(192,80,77,.3); border-radius:6px; padding:8px 10px;"><div class="mono" style="font-size:8px; letter-spacing:.08em; color:#E0726B;">CRU</div><div class="mono" style="font-size:12px; color:#0E1F30; margin-top:2px;">gap ${Tp.raw ? pp(Tp.raw.br_gap) : "—"}</div></div>
              <div style="flex:1; background:rgba(20,184,166,.1); border:1px solid rgba(20,184,166,.3); border-radius:6px; padding:8px 10px;"><div class="mono" style="font-size:8px; letter-spacing:.08em; color:#0F9486;">ESCOLHIDO</div><div class="mono" style="font-size:12px; color:#0E1F30; margin-top:2px;">gap ${pp(Tp.chosen.br_gap)}</div></div>
            </div>
            <div style="margin-top:10px; font-size:11.5px; color:rgba(14, 31, 48,.72); line-height:1.4;">Custo aceito: <strong style="color:#B96F36; font-weight:500;">−${dAuc} p.p.</strong> de AUC pela travessia do limite.</div>
          </div>
        </div>
      </div>
    </section>`;
  }

  // ── right rail (pedagogia) ────────────────────────────────────────────────
  function railRight() {
    const m = T.get(S.step);
    const moves = m.movements.map((mv) => `<div class="fg-move ${mv.type}"><div class="fg-move-label">${mv.label}</div><div class="fg-move-text">${mv.text}</div></div>`).join("");
    const done = S.completed.has(m.n);
    // instrução (scaffolding decrescente) — adaptativa à fonte na estação do gate
    let guidance = m.instruction;
    if (m.n === 4 && S.source === "synthetic") {
      guidance = "Rode o gate no modo sintético-estresse: aqui o NA é proxy forte de idade e a sonda aprende NA→bad. O DI da sonda despenca e o gate de fairness (L2) reprova de forma dramática — o mesmo gate, outro dado. É o contraste que prova que fairness depende do dado, não de um número fixo.";
    }
    const guideBlock = `<div style="background:rgba(20,184,166,.06); border:1px solid rgba(20,184,166,.2); border-radius:8px; padding:11px 13px;">
      <div class="mono" style="font-size:8.5px; letter-spacing:.13em; color:#0F9486;">COMO FAZER${S.tour ? " · TOUR" : ""}</div>
      <div style="font-size:12.5px; line-height:1.5; color:rgba(14, 31, 48,.82); margin-top:5px; font-weight:300;">${guidance}</div>
    </div>`;
    return `<aside class="fg-rail fg-rail-right" aria-label="Pedagogia da estação">
      <div class="fg-ped-head">
        <div class="mono" style="font-size:9.5px; letter-spacing:.18em; color:#647D93;">A TRILHA ENSINA · ${m.bloom.toUpperCase()}</div>
        <div style="font-size:12.5px; color:rgba(14, 31, 48,.72); margin-top:6px; font-weight:300; line-height:1.4;">${m.pedTitle}</div>
        <div style="font-size:11.5px; color:rgba(14, 31, 48,.72); margin-top:7px; line-height:1.5; font-weight:300;"><span class="mono" style="font-size:8.5px; letter-spacing:.1em; color:#5B7691;">OBJETIVO</span><br>${m.objective}</div>
        <button class="fg-btn fg-btn-sm ${done ? "fg-btn-applied" : ""}" data-act="openCheck" data-n="${m.n}" style="margin-top:11px; width:100%;">${done ? "✓ check respondido · rever" : "Responder o check ▸"}</button>
        <button class="fg-btn-ghost" data-act="openDock" style="margin-top:8px; width:100%; padding:8px; display:flex; align-items:center; justify-content:center; gap:6px;"><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0'><path d='M21 11.5a8.4 8.4 0 0 1-9 8.3 9 9 0 0 1-4-1L3 20l1.2-4.5A8.4 8.4 0 1 1 21 11.5Z'/></svg> Pergunte ao tutor</button>
        <button class="fg-btn-ghost" data-act="explain" data-n="${m.n}" style="margin-top:6px; width:100%; padding:8px; display:flex; align-items:center; justify-content:center; gap:6px;"><svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0'><path d='M11 5 6 9H2v6h4l5 4Z'/><path d='M15.5 8.5a5 5 0 0 1 0 7'/><path d='M19 5a9 9 0 0 1 0 14'/></svg> Explicar esta fase</button>
      </div>
      <div class="fg-ped-list">
        ${guideBlock}
        ${moves}
        <details class="fg-deepen"><summary>APROFUNDAR</summary><p>${m.deepen}</p><a class="fg-deepen-link" href="notebook/fairgate.html" target="_blank" rel="noopener">↳ evidência formal · notebook L2 (Marimo) ▸</a></details>
      </div>
    </aside>`;
  }

  // ── footer (veredito) ─────────────────────────────────────────────────────
  function footer() {
    const g = S.gate, v = S.verdict;
    let stampText = "AGUARDANDO", stampBg = "rgba(14, 31, 48,.06)", stampFg = "#5B7691", stampBd = "rgba(14, 31, 48,.12)";
    let verdictLine = "Rode o gate de fairness para emitir um veredito sobre o estado atual do dataset.";
    let provLine = "nenhum veredito emitido · proveniência pendente";
    if (g === "running") { stampText = "CALCULANDO"; stampFg = "#0F9486"; stampBd = "rgba(20,184,166,.4)"; verdictLine = "Treinando modelo-sonda (LogReg, seed " + S.seed + ") e medindo paridade…"; }
    else if (g === "blocked" && v) {
      stampText = "GATE BLOCKED"; stampBg = "rgba(192,80,77,.16)"; stampFg = "#E0726B"; stampBd = "rgba(224,114,107,.45)";
      const fl = v.failures[0];
      verdictLine = `FAIL · ${v.failures.length} violação(ões) · subgrupo «${fl ? fl.subgroup : "—"}» ${fl ? fl.metric : ""} = ${fl ? fl.value.toFixed(3) : ""} ${fl ? (fl.op === "≥" ? "<" : ">") : ""} ${fl ? fl.limit : ""}`;
      provLine = "proveniência: policy v" + v.provenance.policy_version + " #" + v.provenance.policy_hash + " · data #" + v.provenance.data_version + " · seed " + v.provenance.seed;
    } else if (g === "approved" && v) {
      stampText = "DATASET APROVADO"; stampBg = "rgba(20,184,166,.16)"; stampFg = "#0F9486"; stampBd = "rgba(20,184,166,.45)";
      verdictLine = "PASS · todos os limites de policy.yaml respeitados · treino liberado.";
      provLine = "proveniência: policy v" + v.provenance.policy_version + " #" + v.provenance.policy_hash + " · data #" + v.provenance.data_version + " · seed " + v.provenance.seed;
    }
    const slam = (g === "blocked" || g === "approved") ? "animation:fgSlam .5s var(--fg-ease);" : "";

    // ação primária adaptativa
    let pLabel, pMuted = false;
    if (g === "running") { pLabel = "Calculando…"; pMuted = true; }
    else if (g === "approved") pLabel = "Ver trade-off ▸";
    else if (g === "blocked" && S.step < 5) pLabel = "Ir para mitigação ▸";
    else if (S.step < 4) pLabel = "Avançar ▸";
    else if (S.step === 4) pLabel = "Rodar o gate ▸";
    else if (S.step === 5) { const ok = S.imputed && S.reweighed; pLabel = ok ? "Reexecutar o gate ▸" : "Aplique as 2 ações"; pMuted = !ok; }
    else pLabel = "Rodar o gate ▸";

    return `<footer class="fg-foot" aria-label="Veredito do gate">
      <div style="display:flex; align-items:center; gap:16px; min-width:0;">
        <div class="fg-stamp" style="background:${stampBg}; color:${stampFg}; border:1px solid ${stampBd}; ${slam}">${stampText}</div>
        <div style="min-width:0;" role="status" aria-live="polite"><div class="fg-verdict-line">${verdictLine}</div><div class="fg-prov-line">${provLine}</div></div>
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
        <button class="fg-foot-tutor" data-act="openDock" aria-label="Abrir o tutor (texto e voz)" title="Tutor — pergunte por texto ou voz"><span aria-hidden="true" style="font-size:15px; font-weight:700; line-height:1;">?</span><span>Tutor</span></button>
        <button class="fg-btn ${pMuted ? "muted" : ""}" data-act="primary" ${pMuted ? "disabled" : ""}>${pLabel}</button>
      </div>
    </footer>`;
  }

  // ── station check (quiz formativo) ────────────────────────────────────────
  function checkModal() {
    const m = T.get(S.check); if (!m) { S.check = null; return ""; }
    const chk = m.check; const picked = S.picked;
    const opts = chk.options.map((o, i) => {
      let cls = "fg-check-opt", fb = "";
      if (picked !== null) {
        if (o.correct) cls += " correct";
        else if (i === picked) cls += " wrong";
        if (i === picked || o.correct) fb = `<div class="fg-check-fb">${o.feedback}</div>`;
      }
      return `<button class="${cls}" ${picked === null ? `data-act="pick" data-i="${i}"` : "disabled"}>
        <div style="display:flex; gap:9px; align-items:flex-start;"><span style="color:${picked !== null && o.correct ? "#0F9486" : picked === i ? "#E0726B" : "#647D93"}; font-weight:700; flex-shrink:0;">${picked !== null ? (o.correct ? "✓" : (i === picked ? "✕" : "·")) : "○"}</span><span>${o.text}</span></div>
        ${fb}
      </button>`;
    }).join("");
    const answered = picked !== null;
    return `<div class="fg-modal-veil">
      <div class="fg-modal" role="dialog" aria-modal="true" aria-labelledby="fg-modal-title" tabindex="-1">
        <div class="mono" style="font-size:9.5px; letter-spacing:.16em; color:#0F9486;">CHECK FORMATIVO · ESTAÇÃO ${("0" + m.n).slice(-2)} · ${m.bloom.toUpperCase()}</div>
        <div style="font-size:11px; color:#5B7691; margin-top:6px; font-weight:300;">${answered ? "Veja o porquê — sem punição, o erro também ensina." : "Preveja antes de ver (predict-first): qual a sua aposta?"}</div>
        <h2 id="fg-modal-title" class="fr" style="font-weight:300; font-size:21px; line-height:1.25; color:#0E1F30; margin:12px 0 14px;">${chk.prompt}</h2>
        ${opts}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:18px; gap:10px;">
          <button class="fg-btn-ghost" data-act="closeCheck">${answered ? "Fechar" : "Pular"}</button>
          ${answered ? `<button class="fg-btn fg-btn-sm" data-act="${S.tour ? "closeNext" : "closeCheck"}">${S.tour ? "Concluir e seguir ▸" : "Concluir estação ✓"}</button>` : ""}
        </div>
      </div>
    </div>`;
  }

  // ── dock UI (rodapé, abrível a qualquer momento) ──────────────────────────
  function dockUI() {
    const d = S.dock;
    const esc = (x) => (x || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    if (!d.open) {
      return "";   // launcher do tutor vive no rodapé (footer) — ver footer()
    }
    const m = T.get(S.step);
    // SEGURANÇA: esc() (& e <) antes da substituição \n→<br>. Não reordenar.
    const fmt = (c) => esc(c).replace(/\n/g, "<br>");
    const msgs = d.messages.map((mm, i) => mm.role === "user"
      ? `<div class="fg-msg user"><div class="fg-bub">${fmt(mm.content)}</div></div>`
      : `<div class="fg-msg bot"><div class="fg-bub">${fmt(mm.content)}</div><button class="fg-msg-listen" data-act="speakMsg" data-i="${i}" title="Ouvir" aria-label="Ouvir esta resposta"><svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0'><path d='M11 5 6 9H2v6h4l5 4Z'/><path d='M15.5 8.5a5 5 0 0 1 0 7'/><path d='M19 5a9 9 0 0 1 0 14'/></svg></button></div>`).join("");
    const sugg = d.messages.length <= 1
      ? `<div class="fg-dock-sugg">${DOCK_SUGGEST.map((s) => `<button class="fg-chip-sugg" data-act="dockSuggest" data-q="${esc(s).replace(/"/g, "&quot;")}">${esc(s)}</button>`).join("")}</div>` : "";
    const micOn = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const statusTx = d.playing ? "falando…" : (d.ttsLoading ? "sintetizando voz…" : "ensina — nunca altera o veredito (P3)");
    return `<section class="fg-dock" role="dialog" aria-label="Tutor do fairgate">
      <div class="fg-dock-head">
        <div style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="fg-dock-ic"><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0'><path d='M21 11.5a8.4 8.4 0 0 1-9 8.3 9 9 0 0 1-4-1L3 20l1.2-4.5A8.4 8.4 0 1 1 21 11.5Z'/></svg></span>
          <div style="min-width:0;">
            <div class="mono" style="font-size:9px; letter-spacing:.14em; color:#0F9486;">TUTOR · ${m ? "FASE " + ("0" + m.n).slice(-2) : "FAIRGATE"}</div>
            <div style="font-size:10px; color:#647D93;">${statusTx}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <button class="fg-dock-btn ${d.speakOn ? "on" : ""}" data-act="toggleSpeak" title="Ler as respostas em voz" aria-pressed="${d.speakOn}">${d.speakOn ? "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0'><path d='M11 5 6 9H2v6h4l5 4Z'/><path d='M15.5 8.5a5 5 0 0 1 0 7'/><path d='M19 5a9 9 0 0 1 0 14'/></svg>" : "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0'><path d='M11 5 6 9H2v6h4l5 4Z'/><line x1='23' y1='9' x2='17' y2='15'/><line x1='17' y1='9' x2='23' y2='15'/></svg>"}</button>
          ${d.playing ? `<button class="fg-dock-btn" data-act="dockStop" title="Parar a voz" aria-label="Parar a voz"><svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0'><rect x='6' y='6' width='12' height='12' rx='2' fill='currentColor' stroke='none'/></svg></button>` : ""}
          <button class="fg-dock-btn" data-act="explain" data-n="${S.step}" title="Explicar esta fase em voz" aria-label="Explicar esta fase em voz"><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0'><path d='M21 11.5a8.4 8.4 0 0 1-9 8.3 9 9 0 0 1-4-1L3 20l1.2-4.5A8.4 8.4 0 1 1 21 11.5Z'/></svg></button>
          <button class="fg-dock-btn" data-act="closeDock" title="Fechar" aria-label="Fechar o tutor">✕</button>
        </div>
      </div>
      <div class="fg-dock-msgs">${msgs}${d.loading ? `<div class="fg-msg bot"><div class="fg-bub fg-typing"><span></span><span></span><span></span></div></div>` : ""}</div>
      ${sugg}
      <div class="fg-dock-input-row">
        ${micOn ? `<button class="fg-dock-btn mic ${d.listening ? "on" : ""}" data-act="toggleMic" title="${d.listening ? "Ouvindo…" : "Falar pelo microfone"}" aria-label="Falar pelo microfone">${d.listening ? "●" : "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0'><rect x='9' y='2' width='6' height='12' rx='3'/><path d='M5 10a7 7 0 0 0 14 0'/><line x1='12' y1='19' x2='12' y2='22'/></svg>"}</button>` : ""}
        <input class="fg-dock-input" type="text" placeholder="Pergunte ou fale…" value="${esc(d.input || "")}" aria-label="Sua pergunta ao tutor" onkeydown="if(event.key==='Enter'){event.preventDefault();var b=this.parentNode.querySelector('.fg-dock-send'); if(b)b.click();}">
        <button class="fg-dock-send ${d.loading ? "muted" : ""}" data-act="dockSend" ${d.loading ? "disabled" : ""} aria-label="Enviar pergunta">▸</button>
      </div>
      <div class="mono" style="font-size:8px; color:#8A9AAB; padding:0 4px 2px; letter-spacing:.03em;">offline → voz do navegador · online → voz natural pt-BR (Google/ElevenLabs) · o tutor nunca toca o gate (P3)</div>
    </section>`;
  }

  // priming das vozes do navegador (fallback de voz) + status do TTS de servidor
  if (typeof speechSynthesis !== "undefined") {
    try { _ptVoice = pickPtVoice(); speechSynthesis.addEventListener("voiceschanged", () => { _ptVoice = pickPtVoice() || _ptVoice; }); } catch (e) {}
  }
  getTtsStatus(); // pré-aquece o status (cacheado)

  // ── arranque ───────────────────────────────────────────────────────────────
  if (E && window.GERMAN_CREDIT) {
    boot();
  } else {
    // motor/base ainda carregando — tenta de novo (robustez de ordem de script)
    let tries = 0;
    const iv = setInterval(() => {
      if (window.FairgateEngine && window.GERMAN_CREDIT && window.FAIRGATE_TRILHA) { clearInterval(iv); E = window.FairgateEngine; T = window.FAIRGATE_TRILHA; boot(); }
      else if (++tries > 50) { clearInterval(iv); root.innerHTML = '<div class="fg-app"><div class="fg-loading"><div class="mono" style="color:#E0726B;">Falha ao carregar o motor/base.</div></div></div>'; }
    }, 40);
  }
})();
