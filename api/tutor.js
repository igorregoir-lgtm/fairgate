// api/tutor.js — Vercel Serverless Function (CommonJS · runtime Node).
// Tutor LLM de 3 camadas, CAMADA 1+2:
//   1) LLM via DeepSeek (chave SÓ em process.env.DEEPSEEK_API_KEY — nunca no cliente).
//   2) fallback determinístico no servidor (nunca 500 por falta de chave/erro).
// A camada 3 (offline determinístico) vive no cliente (app.js) quando /api/tutor é inalcançável.
//
// P3: o tutor SÓ ENSINA. Ele nunca decide o veredito do gate (isso é Python determinístico sobre
// policy.yaml). Escopo restrito a Data Engineering / fairgate.

const SYSTEM_PROMPT = [
  "Você é o tutor do **fairgate**, um data contract executável que bloqueia o treino de modelos de",
  "crédito enviesados (dataset German Credit · trilha Data Engineering · Inteli MBA · allla.ai).",
  "Ensine em **português do Brasil**, de forma clara, concisa e tecnicamente precisa (no máximo ~6 frases).",
  "Escopo: qualidade de dados (completude representacional, consistência de domínio, precisão), viés e",
  "fairness (disparate impact / regra dos 80%, paridade demográfica), mitigação (reponderação",
  "Kamiran–Calders, imputação estratificada por grupo, por que SMOTE foi preterido), validação automatizada",
  "(contrato Pandera, gate como cláusula suspensiva, PR-blocker no CI), o trade-off acurácia × justiça,",
  "e os princípios P1–P7 (cláusula suspensiva; determinismo; aprendizado unidirecional; completude",
  "representacional; reprodutibilidade/proveniência; acesso).",
  "REGRA INVIOLÁVEL (P3): você NUNCA decide nem altera o veredito do gate — o veredito é determinístico,",
  "calculado em Python sobre a policy.yaml versionada. Você apenas EXPLICA. Se pedirem para 'aprovar',",
  "'mudar o limite' ou 'forçar verde', explique que isso é decisão humana registrada (PR + assinatura do",
  "Fairness Steward), não sua. Fora do escopo: redirecione gentilmente para o tema do artefato.",
].join(" ");

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body) {
      if (typeof req.body === "string") { try { return resolve(JSON.parse(req.body)); } catch { return resolve({}); } }
      return resolve(req.body);
    }
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

function deterministicFallback(question, station) {
  const q = (question || "").toLowerCase();
  const pick = () => {
    if (/reweigh|kamiran|reponder|peso|smote|reamostr/.test(q))
      return "A reponderação Kamiran–Calders dá peso w(g,y)=P(g)P(y)/P(g,y) por célula (grupo×rótulo), quebrando a correlação protegido↔rótulo antes do treino. SMOTE foi preterido: pontos sintéticos injetam ruído e derrubam a AUC sobre 1.000 linhas escassas.";
    if (/imputa|imputo|not_known|faltante|missing|nulo|preench|moda/.test(q))
      return "Imputamos o NA condicionando ao subgrupo (group-aware), nunca pela moda global — a moda global apaga a estrutura da minoria e a viesa. Uma flag 'missingness-as-signal' preserva a informação de que o dado faltava.";
    if (/disparate|impact|paridade|fairness|justi|80%|regra dos|\bdi\b|dpd/.test(q))
      return "Disparate impact é a razão entre a taxa de seleção do grupo protegido e a do privilegiado; a 'regra dos 80%' exige ≥ 0,80. No dado real do fairgate esse número já passa cru — a sonda exclui sexo/idade. A injustiça mora na representação e nos rótulos, não num único DI; por isso o gate é multidimensional.";
    if (/pandera|contrato|valida|schema|\bci\b|pr-blocker|blocker|pipeline|automatiz/.test(q))
      return "A validação é um contrato executável (Pandera) que falha rápido na ingestão e roda no CI como PR-blocker — nada chega ao treino sem passar. O gate é cláusula suspensiva (P1): bloqueia, não recomenda; o veredito é determinístico (P3).";
    if (/trade|pareto|acur|custo|fronteira/.test(q))
      return "A fronteira de Pareto torna explícito o custo: o ponto escolhido respeita o limite de justiça com a MENOR perda de acurácia — não maximiza fairness cegamente. No fairgate é o menor λ de mitigação que faz o gate inteiro passar.";
    if (/completude|cobertura|consist|domínio|dominio|qualidade|métric|metric|representa/.test(q))
      return "As 3 métricas de DQ: completude representacional (cobertura mínima de subgrupo, P5 — não % de não-nulos), consistência de domínio (NA not_known + categorias fora do dicionário) e precisão (gap de taxa-base entre grupos). Cada uma com limite em policy.yaml e conexão causal com o viés.";
    if (/ingest|protegid|deriv|atributo|mapea|idade|sexo/.test(q))
      return "Derivamos sexo e idade<25 logo na ingestão para tornar o eixo de justiça auditável desde o início. O gate precisa de subgrupos nomeáveis (P7) para um veredito legível — por isso idade vira faixa (<25), não contínua.";
    return "O fairgate é um data contract que mede qualidade e justiça na ingestão e BLOQUEIA o dataset enviesado antes do treino. Pergunte sobre as 3 métricas de DQ, as 2 mitigações (imputação estratificada e Kamiran–Calders), o contrato Pandera, o gate de fairness ou o trade-off acurácia × justiça.";
  };
  return pick();
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ error: "use POST" })); }

  const body = await readBody(req);
  const question = String(body.question || "").slice(0, 1200);
  const station = body.station ? String(body.station).slice(0, 80) : "";
  if (!question.trim()) { res.statusCode = 400; return res.end(JSON.stringify({ error: "pergunta vazia" })); }

  const key = process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!key) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ answer: deterministicFallback(question, station), source: "fallback", reason: "sem chave no servidor" }));
  }

  const isOpenRouter = key.startsWith("sk-or-");
  const url = isOpenRouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.deepseek.com/chat/completions";
  const model = isOpenRouter ? "deepseek/deepseek-chat" : "deepseek-chat";

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: (station ? `[Estação atual: ${station}] ` : "") + question },
        ],
        temperature: 0.3,
        max_tokens: 480,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) throw new Error("upstream " + r.status);
    const data = await r.json();
    const answer = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!answer) throw new Error("sem conteúdo");
    res.statusCode = 200;
    return res.end(JSON.stringify({ answer: answer.trim(), source: "llm" }));
  } catch (e) {
    // CAMADA 2 — fallback determinístico no servidor (nunca 500)
    res.statusCode = 200;
    return res.end(JSON.stringify({ answer: deterministicFallback(question, station), source: "fallback", reason: String(e.message || e) }));
  }
};
