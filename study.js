/* ============================================================================
   study.js — "Modo Estudo": lógica PURA de persistência local + revisão espaçada.
   SÓ funções puras (sem DOM, sem localStorage, sem relógio interno) — a cola de
   localStorage/UI vive no app.js. Exposto em window.FAIRGATE_STUDY p/ ser testável
   via node (mesmo padrão de missions.js / fairgate-engine.js).

   Invariante de honestidade: este módulo NUNCA decide o veredito do gate. Ele só
   agenda revisões e valida o "save". O gate (aprendizado_consolidado) continua
   determinístico e exigindo prova viva — ver app.js + ADR-018.
   ============================================================================ */
window.FAIRGATE_STUDY = (function () {
  "use strict";
  const STUDY_KEY = "fairgate:estudo:v1";   // canal localStorage SEPARADO do PROG_KEY (sessionStorage)
  const SCHEMA = 1;
  const DAY = 86400000;                      // ms num dia
  const INTERVALS = [0, 2, 7];               // caixas 1..3 → dias até revisar (Leitner enxuto: 3 caixas)
  const MAX_BOX = INTERVALS.length;          // 3
  const DUE_CAP = 4;                          // no máx. N revisões por sessão (salto de relógio não vira "revise 7")
  const CONFS = ["baixa", "media", "alta"];
  const TOTAL = 7;

  const clampBox = (b) => Math.max(1, Math.min(MAX_BOX, Math.round(Number(b)) || 1));
  const okConf = (c) => (CONFS.indexOf(c) >= 0 ? c : "media");

  // agenda um card após uma resposta. PURA: recebe now (ms), não lê o relógio.
  // acerto confiante (alta) sobe a caixa; acerto sem alta mantém; ERRO volta à caixa 1 (revisar logo).
  function schedule(card, outcome, now) {
    const prevBox = clampBox(card && card.box);
    const correct = !!(outcome && outcome.correct);
    const forte = correct && outcome && outcome.conf === "alta";
    const box = forte ? Math.min(prevBox + 1, MAX_BOX) : (correct ? prevBox : 1);
    const t = Number(now) || 0;
    return {
      box: box,
      lastSeen: t,
      dueAt: t + INTERVALS[box - 1] * DAY,
      lastCorrect: correct,
      lastConf: okConf(outcome && outcome.conf),
    };
  }

  // estações vencidas (due) p/ revisar. PURA: recebe now. Defensiva a relógio retrocedido/saltado:
  // base = max(now, updatedAt) — relógio para trás NÃO congela nem inunda; cap DUE_CAP por sessão.
  function computeDue(save, now) {
    if (!save || !save.cards) return [];
    const base = Math.max(Number(now) || 0, Number(save.updatedAt) || 0);
    const due = [];
    for (let n = 1; n <= TOTAL; n++) {
      const c = save.cards[String(n)];
      if (!c) continue;
      if ((Number(c.dueAt) || 0) <= base) due.push(n);
    }
    return due.slice(0, DUE_CAP);
  }

  // valida/sanitiza um save cru (input NÃO-confiável do localStorage). Retorna save limpo ou null.
  // Corrupção/shape inválido ⇒ null (o app trata como ausente, caminho demo). Versão futura ⇒ null.
  function validateSave(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (Number(raw.schema) > SCHEMA) return null;
    const out = {
      schema: SCHEMA,
      enabled: raw.enabled === true,
      completed: [],
      calib: {},
      cards: {},
      jaConsolidouAntes: raw.jaConsolidouAntes === true,
      updatedAt: Number(raw.updatedAt) || 0,
    };
    if (Array.isArray(raw.completed)) {
      out.completed = raw.completed.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= TOTAL);
    }
    if (raw.calib && typeof raw.calib === "object") {
      for (let n = 1; n <= TOTAL; n++) {
        const c = raw.calib[String(n)];
        if (c && typeof c === "object") out.calib[String(n)] = { correct: c.correct === true, conf: okConf(c.conf) };
      }
    }
    if (raw.cards && typeof raw.cards === "object") {
      for (let n = 1; n <= TOTAL; n++) {
        const c = raw.cards[String(n)];
        if (c && typeof c === "object") out.cards[String(n)] = {
          box: clampBox(c.box),
          lastSeen: Number(c.lastSeen) || 0,
          dueAt: Number(c.dueAt) || 0,
          lastCorrect: c.lastCorrect === true,
          lastConf: okConf(c.lastConf),
        };
      }
    }
    return out;
  }

  // cria um save novo (vazio) já habilitado, semeando cards a partir da calibração da sessão.
  function freshSave(calib, completed, now) {
    const sv = { schema: SCHEMA, enabled: true, completed: [], calib: {}, cards: {}, jaConsolidouAntes: false, updatedAt: Number(now) || 0 };
    if (Array.isArray(completed)) sv.completed = completed.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= TOTAL);
    if (calib && typeof calib === "object") {
      for (let n = 1; n <= TOTAL; n++) {
        const c = calib[String(n)] || calib[n];
        if (c && typeof c === "object") {
          sv.calib[String(n)] = { correct: c.correct === true, conf: okConf(c.conf) };
          sv.cards[String(n)] = schedule({ box: 1 }, { correct: c.correct === true, conf: c.conf }, now);
        }
      }
    }
    return sv;
  }

  return { STUDY_KEY, SCHEMA, INTERVALS, MAX_BOX, DUE_CAP, TOTAL, schedule, computeDue, validateSave, freshSave };
})();
