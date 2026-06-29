/* ============================================================
   fairgate-engine.js — núcleo de verificação determinístico
   Pure JS. Sem deps. Roda no browser (file://) e em Node (eval/import).
   Tese: a justiça vira um teste que BLOQUEIA o treino.
   Determinismo (P3): PRNG semeado, split por índice, LogReg init=0.
   Expõe window.FairgateEngine.

   Derivado do handoff Claude Design (allla). Adaptações desta versão:
   - loadReal(): usa o german_credit_data.csv REAL (window.GERMAN_CREDIT),
     com makeDataset() preservado como modo "sintético-estresse".
   - PURPOSE estendido aos 8 valores reais do dataset.
   - tradeoff.chosen = MENOR λ que passa o GATE INTEIRO (não só DI/DPD) — P4:
     nunca afrouxa o limite; escolhe a menor mitigação que satisfaz toda a política.
   - pontos do Pareto enriquecidos (di, dpd, br_gap, auc, diPass, gatePass).
   ============================================================ */
window.FairgateEngine = (function () {
  "use strict";

  // ---- PRNG determinístico (mulberry32) ----
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rnd) { // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  // ---- Domínios (German Credit / Statlog, versão kabure) ----
  const SAVING = ["little", "moderate", "quite_rich", "rich"];   // + NA (not_known)
  const CHECK = ["little", "moderate", "rich"];                  // + NA (not_known)
  const HOUSING = ["own", "rent", "free"];
  // domínio real completo de "Purpose" (8 categorias no german_credit_data.csv)
  const PURPOSE = ["car", "radio/TV", "furniture/equipment", "business", "education", "repairs", "vacation/others", "domestic appliances"];

  function pickByQuality(levels, qEff, rnd) {
    const p = clamp(sigmoid(0.9 * qEff), 0.02, 0.98);
    const idx = clamp(Math.floor(p * levels.length + (rnd() - 0.5) * 1.2), 0, levels.length - 1);
    return levels[idx];
  }

  // ---- Dados REAIS (default) — german_credit_data.csv embutido em data/german-credit.js ----
  function loadReal() {
    const src = (typeof window !== "undefined" && window.GERMAN_CREDIT) || null;
    if (!src) return null;
    // clone defensivo (o motor nunca muta a fonte)
    return src.map((r) => ({
      id: r.id, sex: r.sex, age: r.age, age_lt_25: r.age_lt_25,
      duration: r.duration, credit_amount: r.credit_amount, job: r.job,
      saving_account: r.saving_account, checking_account: r.checking_account,
      housing: r.housing, purpose: r.purpose, risk: r.risk,
    }));
  }

  // ---- Política (fonte única: policy.yaml -> data/policy.js -> window.FAIRGATE_POLICY) ----
  // merge defensivo sobre o DEFAULT_POLICY: garante todas as chaves mesmo se o YAML omitir alguma.
  function loadPolicy() {
    const ext = (typeof window !== "undefined" && window.FAIRGATE_POLICY) || null;
    if (!ext) return JSON.parse(JSON.stringify(DEFAULT_POLICY));
    return {
      version: ext.version != null ? ext.version : DEFAULT_POLICY.version,
      protected_attributes: ext.protected_attributes || DEFAULT_POLICY.protected_attributes,
      quality: Object.assign({}, DEFAULT_POLICY.quality, ext.quality),
      fairness: Object.assign({}, DEFAULT_POLICY.fairness, ext.fairness),
      probe_model: Object.assign({}, DEFAULT_POLICY.probe_model, ext.probe_model),
    };
  }

  // ---- Geração SINTÉTICA do dataset (modo estresse-de-viés, FR-1) ----
  // Calibrado p/ reproduzir as taxas-base reais do German Credit:
  //   bad: feminino ~35,2% vs masculino ~27,7% ; jovem<25 ~41% vs ≥25 ~28%
  // No sintético o NA é proxy FORTE de idade (MNAR) → o probe aprende NA→bad e
  // pune o jovem: aqui o GATE DE FAIRNESS (DI) chega a reprovar — contraste pedagógico.
  function makeDataset(seed, n) {
    seed = seed == null ? 42 : seed;
    n = n || 1000;
    const rnd = mulberry32(seed);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const female = rnd() < 0.31;
      const young = rnd() < 0.20;                // age_lt_25
      const age = young ? Math.floor(19 + rnd() * 6) : Math.floor(25 + rnd() * 50);

      const q = gauss(rnd);
      const qLabel = q - 0.62 * (young ? 1 : 0) - 0.34 * (female ? 1 : 0);
      const qProx = q - 0.18 * (young ? 1 : 0) - 0.04 * (female ? 1 : 0);

      const duration = clamp(Math.round(20 - 7 * qProx + gauss(rnd) * 3.5), 4, 72);
      const credit_amount = clamp(Math.round(3200 - 1500 * qProx + gauss(rnd) * 1500), 250, 18000);
      const job = clamp(Math.round(1.7 + 0.55 * qProx + gauss(rnd) * 0.7), 0, 3);

      // NA não-aleatório (MNAR) FORTE no sintético: jovem ~58% NA vs ~18%
      const pNAcheck = clamp(0.16 + 0.44 * (young ? 1 : 0) + 0.10 * (female ? 1 : 0) - 0.05 * qProx, 0.04, 0.82);
      const pNAsave = clamp(0.10 + 0.20 * (young ? 1 : 0) + 0.05 * (female ? 1 : 0) - 0.04 * qProx, 0.02, 0.62);
      const checking_account = rnd() < pNAcheck ? "NA" : pickByQuality(CHECK, qProx, rnd);
      const saving_account = rnd() < pNAsave ? "NA" : pickByQuality(SAVING, qProx, rnd);

      const housing = pickByQuality(HOUSING, qProx * 0.6 + 0.2, rnd);
      const purpose = PURPOSE[clamp(Math.floor(rnd() * PURPOSE.length), 0, PURPOSE.length - 1)];

      const naPen = (checking_account === "NA" ? 0.55 : 0) + (saving_account === "NA" ? 0.25 : 0);
      const pGood = clamp(sigmoid(1.15 * qLabel - naPen + 1.50), 0.02, 0.985);
      const risk = rnd() < pGood ? "good" : "bad";

      rows.push({
        id: i, sex: female ? "female" : "male", age, age_lt_25: young,
        duration, credit_amount, job, saving_account, checking_account,
        housing, purpose, risk,
      });
    }
    return rows;
  }

  // dataset por fonte: "real" (default) | "synthetic"
  function dataset(source, seed, n) {
    if (source === "synthetic") return makeDataset(seed, n);
    const r = loadReal();
    return (r && r.length) ? r : makeDataset(seed, n); // fallback se a base faltar OU vier vazia
  }

  // ---- Encoding para a sonda (exclui atributos protegidos: sex, age) ----
  function featurize(rows, useMissingFlags) {
    const cats = {
      saving_account: SAVING.concat(["NA"]),
      checking_account: CHECK.concat(["NA"]),
      housing: HOUSING,
      purpose: PURPOSE,
    };
    const names = ["duration_z", "amount_z", "job_z"];
    for (const c in cats) for (const lv of cats[c]) names.push(c + "=" + lv);
    if (useMissingFlags) names.push("saving_was_missing", "checking_was_missing");

    const mean = {}, std = {};
    for (const k of ["duration", "credit_amount", "job"]) {
      const xs = rows.map((r) => r[k]);
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
      mean[k] = m; std[k] = Math.sqrt(v) || 1;
    }
    const X = rows.map((r) => {
      const f = [
        (r.duration - mean.duration) / std.duration,
        (r.credit_amount - mean.credit_amount) / std.credit_amount,
        (r.job - mean.job) / std.job,
      ];
      for (const c in cats) for (const lv of cats[c]) f.push(r[c] === lv ? 1 : 0);
      if (useMissingFlags) {
        f.push(r.saving_was_missing ? 1 : 0);
        f.push(r.checking_was_missing ? 1 : 0);
      }
      return f;
    });
    const y = rows.map((r) => (r.risk === "good" ? 1 : 0));
    return { X, y, names };
  }

  // split determinístico por índice (test_size 0.25 → i%4===0)
  function split(rows) {
    const tr = [], te = [];
    rows.forEach((r, i) => (i % 4 === 0 ? te : tr).push(i));
    return { tr, te };
  }

  // ---- Sonda: Regressão Logística por gradiente (init=0, determinística) ----
  function trainLogReg(X, y, idxTr, weights, opts) {
    opts = opts || {};
    const iters = opts.iters || 280, lr = opts.lr || 0.32, l2 = opts.l2 || 0.004;
    const d = X[0].length;
    const w = new Array(d).fill(0); let b = 0;
    let wsum = 0; for (const i of idxTr) wsum += weights ? weights[i] : 1;
    for (let it = 0; it < iters; it++) {
      const gw = new Array(d).fill(0); let gb = 0;
      for (const i of idxTr) {
        const sw = weights ? weights[i] : 1;
        let z = b; const xi = X[i];
        for (let j = 0; j < d; j++) z += w[j] * xi[j];
        const err = (sigmoid(z) - y[i]) * sw;
        for (let j = 0; j < d; j++) gw[j] += err * xi[j];
        gb += err;
      }
      for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / wsum + l2 * w[j]);
      b -= lr * (gb / wsum);
    }
    return { w, b };
  }
  function predictProba(model, xi) {
    let z = model.b; for (let j = 0; j < xi.length; j++) z += model.w[j] * xi[j];
    return sigmoid(z);
  }
  function auc(scores, labels) {
    const pos = [], neg = [];
    scores.forEach((s, i) => (labels[i] === 1 ? pos : neg).push(s));
    if (!pos.length || !neg.length) return 0.5;
    let win = 0; for (const p of pos) for (const ng of neg) win += p > ng ? 1 : p === ng ? 0.5 : 0;
    return win / (pos.length * neg.length);
  }

  // ---- Probe + métricas de seleção por grupo (FR-4) ----
  function probe(rows, weights, useMissingFlags) {
    const { X, y } = featurize(rows, useMissingFlags);
    const { tr, te } = split(rows);
    const model = trainLogReg(X, y, tr, weights, {});
    const proba = rows.map((r, i) => predictProba(model, X[i]));
    const aucVal = auc(te.map((i) => proba[i]), te.map((i) => y[i]));

    function selRate(filter) {
      let num = 0, den = 0;
      for (const i of te) {
        if (!filter(rows[i])) continue;
        const sw = weights ? weights[i] : 1;
        den += sw; if (proba[i] >= 0.5) num += sw;
      }
      return den ? num / den : 0;
    }
    const sr = {
      young: selRate((r) => r.age_lt_25),
      old: selRate((r) => !r.age_lt_25),
      female: selRate((r) => r.sex === "female"),
      male: selRate((r) => r.sex === "male"),
    };
    const diAge = sr.old ? sr.young / sr.old : 0;
    const diSex = sr.male ? sr.female / sr.male : 0;
    return {
      auc: aucVal, sr,
      di_age: diAge, di_sex: diSex,
      dpd_age: Math.abs(sr.old - sr.young),
      dpd_sex: Math.abs(sr.male - sr.female),
      proba,
    };
  }

  // ---- 3 métricas de DQ (FR-2). weights → cobertura/base-rate efetivas ----
  function weightedShare(rows, weights, filter) {
    let num = 0, den = 0;
    rows.forEach((r, i) => { const w = weights ? weights[i] : 1; den += w; if (filter(r)) num += w; });
    return den ? num / den : 0;
  }
  function badRate(rows, weights, filter) {
    let num = 0, den = 0;
    rows.forEach((r, i) => { if (!filter(r)) return; const w = weights ? weights[i] : 1; den += w; if (r.risk === "bad") num += w; });
    return den ? num / den : 0;
  }
  function metrics(rows, policy, weights) {
    const covYoung = weightedShare(rows, weights, (r) => r.age_lt_25);
    const covFemale = weightedShare(rows, weights, (r) => r.sex === "female");
    const minCov = Math.min(covYoung, covFemale);
    let viol = 0;
    rows.forEach((r) => {
      if (r.saving_account === "NA") viol++;
      if (r.checking_account === "NA") viol++;
    });
    const domRate = viol / (rows.length * 2);
    const brYoung = badRate(rows, weights, (r) => r.age_lt_25);
    const brOld = badRate(rows, weights, (r) => !r.age_lt_25);
    const brGap = Math.abs(brYoung - brOld);

    return {
      completude: {
        value: minCov, limit: policy.quality.coverage_min, pass: minCov >= policy.quality.coverage_min,
        detail: { covYoung, covFemale },
      },
      consistencia: {
        value: domRate, limit: policy.quality.domain_violation_max, pass: domRate <= policy.quality.domain_violation_max,
        detail: { violations: viol, na_check: rows.filter((r) => r.checking_account === "NA").length, na_save: rows.filter((r) => r.saving_account === "NA").length },
      },
      precisao: {
        value: brGap, limit: policy.quality.base_rate_gap_max, pass: brGap <= policy.quality.base_rate_gap_max,
        detail: { brYoung, brOld },
      },
    };
  }

  // ---- Mitigação 1 — Reponderação Kamiran–Calders sobre (age_lt_25 × risk) ----
  function reweighWeights(rows) {
    const n = rows.length;
    const Pg = {}, Py = {}, Pgy = {};
    const gkey = (r) => (r.age_lt_25 ? "Y" : "O");
    const ykey = (r) => (r.risk === "good" ? "g" : "b");
    rows.forEach((r) => {
      Pg[gkey(r)] = (Pg[gkey(r)] || 0) + 1;
      Py[ykey(r)] = (Py[ykey(r)] || 0) + 1;
      const k = gkey(r) + ykey(r); Pgy[k] = (Pgy[k] || 0) + 1;
    });
    return rows.map((r) => {
      const k = gkey(r) + ykey(r);
      return (Pg[gkey(r)] * Py[ykey(r)]) / (n * Pgy[k]);
    });
  }
  function mitigationWeights(rows, targetCoverage) {
    const target = targetCoverage || 0.31;
    const wkc = reweighWeights(rows);
    const n = rows.length;
    const s = rows.filter((r) => r.age_lt_25).length / n;
    const kYoung = (target * (1 - s)) / ((1 - target) * s);
    const w = rows.map((r, i) => wkc[i] * (r.age_lt_25 ? kYoung : 1));
    const mean = w.reduce((a, b) => a + b, 0) / n;
    return w.map((b) => b / mean);
  }

  function coverageWeights(rows, targetCoverage) {
    const target = targetCoverage || 0.31;
    const n = rows.length;
    const s = rows.filter((r) => r.age_lt_25).length / n;
    const kYoung = (target * (1 - s)) / ((1 - target) * s);
    const w = rows.map((r) => (r.age_lt_25 ? kYoung : 1));
    const mean = w.reduce((a, b) => a + b, 0) / n;
    return w.map((b) => b / mean);
  }

  // λ=0 → só cobertura (A2) ; λ=1 → mitigação plena (cobertura × Kamiran–Calders)
  function sweepWeights(rows, lambda) {
    const wc = coverageWeights(rows), wm = mitigationWeights(rows);
    return wc.map((c, i) => c + lambda * (wm[i] - c));
  }

  // ---- Mitigação 2 — Imputação estratificada por grupo + flag missingness ----
  function imputeStratified(rows) {
    const groupMode = (col) => {
      const tally = {};
      rows.forEach((r) => {
        if (r[col] === "NA") return;
        const g = (r.sex) + "|" + (r.age_lt_25 ? "Y" : "O");
        (tally[g] = tally[g] || {})[r[col]] = (tally[g][r[col]] || 0) + 1;
      });
      const mode = {};
      for (const g in tally) mode[g] = Object.keys(tally[g]).sort((a, b) => tally[g][b] - tally[g][a])[0];
      return mode;
    };
    const ms = groupMode("saving_account"), mc = groupMode("checking_account");
    return rows.map((r) => {
      const g = (r.sex) + "|" + (r.age_lt_25 ? "Y" : "O");
      const out = Object.assign({}, r);
      out.saving_was_missing = r.saving_account === "NA";
      out.checking_was_missing = r.checking_account === "NA";
      if (r.saving_account === "NA") out.saving_account = ms[g] || "little";
      if (r.checking_account === "NA") out.checking_account = mc[g] || "little";
      return out;
    });
  }

  // ---- Hash determinístico (proveniência, P6) ----
  function hash(obj) {
    const s = typeof obj === "string" ? obj : JSON.stringify(obj);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  // ---- avaliação das 6 checagens do gate (núcleo compartilhado) ----
  function gateChecks(rows, policy, weights, useFlags) {
    const m = metrics(rows, policy, weights);
    const p = probe(rows, weights, useFlags);
    const checks = [
      { id: "completude", pillar: "COMPLETUDE", subgroup: "age_lt_25", metric: "cobertura efetiva", value: m.completude.value, limit: m.completude.limit, op: "≥", pass: m.completude.pass },
      { id: "consistencia", pillar: "CONSISTÊNCIA", subgroup: "saving/checking", metric: "violação de domínio (NA not_known)", value: m.consistencia.value, limit: m.consistencia.limit, op: "≤", pass: m.consistencia.pass },
      { id: "base_rate", pillar: "PRECISÃO", subgroup: "age_lt_25", metric: "gap de taxa-base bad", value: m.precisao.value, limit: m.precisao.limit, op: "≤", pass: m.precisao.pass },
      { id: "di_age", pillar: "FAIRNESS", subgroup: "age_lt_25", metric: "disparate impact ratio", value: p.di_age, limit: policy.fairness.disparate_impact_min, op: "≥", pass: p.di_age >= policy.fairness.disparate_impact_min },
      { id: "dpd_age", pillar: "FAIRNESS", subgroup: "age_lt_25", metric: "demographic parity diff", value: p.dpd_age, limit: policy.fairness.demographic_parity_diff_max, op: "≤", pass: p.dpd_age <= policy.fairness.demographic_parity_diff_max },
      { id: "di_sex", pillar: "FAIRNESS", subgroup: "female", metric: "disparate impact ratio", value: p.di_sex, limit: policy.fairness.disparate_impact_min, op: "≥", pass: p.di_sex >= policy.fairness.disparate_impact_min },
    ];
    return { checks, metrics: m, probe: p };
  }

  // ---- O GATE (FR-3/4/7) — cláusula suspensiva ----
  function runGate(rows, policy, state) {
    state = state || {};
    const weights = state.weights || null;
    const useFlags = !!state.imputed;
    const gc = gateChecks(rows, policy, weights, useFlags);
    const failures = gc.checks.filter((c) => !c.pass);
    const status = failures.length === 0 ? "PASS" : "FAIL";
    return {
      status, checks: gc.checks, failures, metrics: gc.metrics, probe: gc.probe,
      provenance: {
        policy_version: policy.version, policy_hash: hash(policy),
        data_version: hash({ n: rows.length, w: !!weights, imp: useFlags, seed: state.seed || 42, src: state.source || "real" }),
        seed: state.seed || 42, source: state.source || "real", ts: state.ts || "2026-06-28T00:00:00Z",
      },
    };
  }

  // ---- Curva de trade-off (FR-8): fronteira acurácia × justiça ----
  // points = varredura de força de mitigação λ sobre o dado imputado.
  // chosen = MENOR λ que passa o GATE INTEIRO (P4: menor mitigação que satisfaz toda a política).
  function tradeoff(rows, policy, rawRows, steps) {
    steps = steps || 11;
    const diMin = policy.fairness.disparate_impact_min;
    const dpdMax = policy.fairness.demographic_parity_diff_max;
    const pts = [];
    for (let s = 0; s < steps; s++) {
      const lambda = s / (steps - 1);
      const w = sweepWeights(rows, lambda);
      const m = metrics(rows, policy, w);
      const p = probe(rows, w, true);
      const diPass = p.di_age >= diMin && p.di_sex >= diMin && p.dpd_age <= dpdMax;
      const gatePass = m.completude.pass && m.consistencia.pass && m.precisao.pass && diPass;
      pts.push({
        lambda, di_age: p.di_age, di_sex: p.di_sex, dpd_age: p.dpd_age, auc: p.auc,
        br_gap: m.precisao.value, cov: m.completude.value,
        passes: p.di_age >= diMin,   // p/ a régua "DI ≥ 0,80" do plot
        gatePass,
      });
    }
    let raw = null;
    if (rawRows) { const pr = probe(rawRows, null, false); const mr = metrics(rawRows, policy, null); raw = { di_age: pr.di_age, dpd_age: pr.dpd_age, auc: pr.auc, br_gap: mr.precisao.value }; }
    const chosen = pts.find((pt) => pt.gatePass) || pts[pts.length - 1];
    return { points: pts, raw: raw, impute_only: pts[0], chosen: chosen };
  }

  const DEFAULT_POLICY = {
    version: 1,
    protected_attributes: ["sex", "age_lt_25"],
    quality: { coverage_min: 0.30, domain_violation_max: 0.05, base_rate_gap_max: 0.10 },
    fairness: { disparate_impact_min: 0.80, demographic_parity_diff_max: 0.10 },
    probe_model: { seed: 42, test_size: 0.25 },
  };

  return {
    loadReal, loadPolicy, makeDataset, dataset, metrics, probe, runGate, gateChecks, reweighWeights,
    mitigationWeights, coverageWeights, sweepWeights, imputeStratified, tradeoff, hash, DEFAULT_POLICY,
    // nota: loadPolicy faz merge ALLOWLIST sobre DEFAULT_POLICY (version/protected_attributes/quality/
    // fairness/probe_model). Chaves novas no policy.yaml fora dessa lista são ignoradas de propósito.
    SAVING, CHECK, HOUSING, PURPOSE,
  };
})();

// suporte a Node (testes): expõe o módulo se houver CommonJS/global
if (typeof module !== "undefined" && module.exports) module.exports = window.FairgateEngine;
