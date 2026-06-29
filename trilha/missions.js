/* ============================================================================
   trilha/missions.js — fonte ÚNICA da pedagogia das 7 estações (Trilha · Data
   Engineering). Funde a estrutura do design fairgate com a máquina pedagógica da
   Trilha do Vitaliza (Bloom + scaffolding decrescente + check formativo predict-first).
   Sem lógica de UI — só dados. Expõe window.FAIRGATE_TRILHA.
   Conexões longitudinais citam outros artefatos allla (FIDC, motor trabalhista) —
   o "fio" transversal que produz o efeito de coerência.
   ============================================================================ */
window.FAIRGATE_TRILHA = (function () {
  "use strict";

  // Movimentos do painel direito ("a trilha ensina · 4 movimentos").
  // tipo: 'why' (porquê+trade-off) | 'alt' (caminho alternativo) | 'con' (conexão
  // longitudinal) | 'q' (pergunta provocativa).
  const STATIONS = [
    {
      n: 1, key: "ingest", bloom: "Entender",
      name: "Ingestão & mapeamento", aula: "Aula 1–2 · Pipeline",
      eyebrow: "01 / INGESTÃO & MAPEAMENTO", fr: "FR-1",
      title: "O viés não é defeito do modelo. É defeito do <em>dado</em>.",
      pedTitle: "Por que derivar os atributos protegidos antes de tudo.",
      objective: "Dimensionar a disparidade já na taxa-base — antes de qualquer modelo.",
      // scaffolding ALTO (estação inicial): instrução passo a passo
      instruction:
        "Carregamos o German Credit real (1.000 linhas) e derivamos os atributos protegidos — sexo e idade<25. Olhe a composição da população à direita: o jovem<25 é só ~15% da base. Agora veja a disparidade de taxa-base: a fração de \"bad\" entre jovens já é bem maior — e isso é o rótulo histórico, não o modelo.",
      deepen:
        "Abra a amostra e procure linhas com NA em conta/poupança — o not_known não é categoria, é ausência. Ele vai voltar como o vilão da Consistência.",
      check: {
        prompt: "No dado cru, qual é o gap de taxa-base \"bad\" entre jovem<25 e ≥25?",
        options: [
          { text: "≈ 13 pontos percentuais (40,9% vs 28,1%).", correct: true,
            feedback: "Isso. O gap real é 12,8 p.p. — e ele já está no rótulo histórico, antes de treinar nada. É a desigualdade que um modelo iria amplificar." },
          { text: "≈ 0 — não há diferença relevante entre os grupos.", correct: false,
            feedback: "Há, sim: jovens têm 40,9% de \"bad\" vs 28,1% dos ≥25 — um gap de 12,8 p.p. Ignorá-lo é deixar o viés entrar pela porta da frente." },
          { text: "≈ 41 p.p. — a própria taxa do jovem.", correct: false,
            feedback: "Cuidado: 40,9% é a taxa do jovem, não o gap. O gap é a diferença entre os grupos: 40,9 − 28,1 = 12,8 p.p." },
        ],
      },
      movements: [
        { type: "why", label: "PORQUÊ + TRADE-OFF", text: "Derivar sexo e idade<25 logo na ingestão expõe o eixo de justiça desde o início — troca-se a simplicidade do schema pela auditabilidade do viés." },
        { type: "alt", label: "CAMINHO ALTERNATIVO", text: "Tratar idade como contínua foi preterido: o gate precisa de subgrupos nomeáveis para o veredito ser legível (P7)." },
        { type: "con", label: "CONEXÃO LONGITUDINAL", text: "Mapear o atributo protegido na borda do pipeline espelha o gate de autorização do FIDC da allla — a condição é checada à entrada." },
      ],
      estMin: 2,
    },
    {
      n: 2, key: "metrics", bloom: "Analisar",
      name: "Métricas de Data Quality", aula: "Aula 4 · 6 Pilares",
      eyebrow: "02 / MÉTRICAS DE DATA QUALITY", fr: "FR-2 · rubrica 25%",
      title: "Três pilares que ligam <em>qualidade</em> à justiça do crédito",
      pedTitle: "Por que estes 3 dos 6 pilares.",
      objective: "Decompor qualidade em pilares mensuráveis e ligar cada um ao viés.",
      instruction:
        "Dos 6 pilares de qualidade (Aula 4), 3 falham no German Credit: Completude (cobertura por subgrupo, não % de não-nulos), Consistência (o not_known) e Precisão (gap de taxa-base). Cada card mostra o que mede, o limite operacional do policy.yaml e o impacto no modelo de crédito.",
      deepen:
        "Repare que \"Completude\" aqui é representacional (P5) — cobertura mínima de subgrupo — e não a métrica fácil de não-nulos. É a diferença entre medir o sintoma e medir a causa.",
      check: {
        prompt: "Neste gate, \"Completude\" mede o quê?",
        options: [
          { text: "A cobertura mínima de um subgrupo protegido (representação).", correct: true,
            feedback: "Exato. Completude representacional (P5): a fração efetiva do menor subgrupo. Sub-representação é causa mecânica do viés — o modelo subajusta a minoria." },
          { text: "A porcentagem de células não-nulas na tabela.", correct: false,
            feedback: "Essa é a métrica fácil — e ela mascara o problema. Aqui Completude é cobertura de subgrupo: o jovem<25 está em 14,9%, abaixo do mínimo de 30%." },
          { text: "A acurácia agregada do modelo.", correct: false,
            feedback: "Não — acurácia agregada mascara o subgrupo minoritário (Aula 5). Completude mede representação, antes do modelo existir." },
        ],
      },
      movements: [
        { type: "why", label: "PORQUÊ + TRADE-OFF", text: "Completude aqui é cobertura de subgrupo (P5), não % de não-nulos — troca-se a métrica fácil pela que é causa mecânica do viés." },
        { type: "alt", label: "CAMINHO ALTERNATIVO", text: "Medir só acurácia agregada foi preterido: a média mascara o subgrupo minoritário (Aula 5 — métricas de imparcialidade)." },
        { type: "con", label: "CONEXÃO LONGITUDINAL", text: "Os 3 pilares escolhidos — Completude, Consistência, Precisão — são exatamente os que falham no German Credit (Aula 4)." },
      ],
      estMin: 2,
    },
    {
      n: 3, key: "contract", bloom: "Aplicar",
      name: "Contrato de schema", aula: "Aula 7 · Data Validation",
      eyebrow: "03 / CONTRATO DE SCHEMA EXECUTÁVEL", fr: "FR-3 · DataOps",
      title: "A validação é <em>código</em>, não revisão manual",
      pedTitle: "Por que contrato-como-código.",
      objective: "Codificar a validação como um contrato versionado que falha rápido.",
      instruction:
        "Um contrato executável (Pandera) com 7 checagens versionadas que falham na ingestão — a \"segurança que confere o documento na entrada\" (Aula 7). Dois níveis: WARNING registra e segue; BLOCKER reprova e interrompe, rodando no CI como PR-blocker. No dado cru, as checagens 04 · 06 · 07 reprovam.",
      deepen:
        "Veja a curva de maturidade DataOps no rodapé: o fairgate entrega N3→N4 (regras versionadas em Git + drift), com horizonte em N5 (observabilidade + IA).",
      check: {
        prompt: "Uma checagem marcada BLOCKER falha no CI. O que acontece?",
        options: [
          { text: "Reprova e interrompe — vira PR-blocker, o dado enviesado não entra.", correct: true,
            feedback: "Isso. BLOCKER é cláusula suspensiva: raise GateBlocked, sem \"avisar e seguir\". Já WARNING registra e segue. A diferença é o que torna o gate um gate." },
          { text: "Registra um aviso e o pipeline continua normalmente.", correct: false,
            feedback: "Esse é o comportamento de um WARNING. Um BLOCKER interrompe — é o que separa um gate de um relatório que sugere." },
          { text: "Corrige o dado automaticamente e segue.", correct: false,
            feedback: "Não. O gate nunca reescreve o dado nem a política sozinho (P4) — ele bloqueia e devolve a decisão para o humano." },
        ],
      },
      movements: [
        { type: "why", label: "PORQUÊ + TRADE-OFF", text: "Contrato como código (Pandera) troca a robustez de uma suíte pesada por determinismo e fail-fast no núcleo." },
        { type: "alt", label: "CAMINHO ALTERNATIVO", text: "Great Expectations foi preterido (ADR-003): overhead de projeto desproporcional ao core demonstrável." },
        { type: "con", label: "CONEXÃO LONGITUDINAL", text: "A validação é a \"segurança que confere o documento na entrada\" (Aula 7) — agora versionada em Git como PR-blocker." },
      ],
      estMin: 2,
    },
    {
      n: 4, key: "gate", bloom: "Avaliar",
      name: "Gate de fairness", aula: "Aula 5–6 · Viés & Fairness",
      eyebrow: "04 / GATE DE FAIRNESS", fr: "FR-4 · a espinha · cláusula suspensiva",
      title: "Um <em>gate</em> que bloqueia, não um relatório que sugere",
      pedTitle: "O coração: o gate que bloqueia.",
      objective: "Julgar o dataset: o gate treina uma sonda, mede a justiça e bloqueia.",
      instruction:
        "Rode o gate. Ele treina um modelo-sonda determinístico (LogReg, seed 42) e mede paridade. Repare numa verdade incômoda do dado real: o DI da sonda já passa cru (0,97) — porque a sonda exclui sexo e idade. A injustiça não está num único número de DI; está na representação e nos rótulos. O gate bloqueia mesmo assim.",
      deepen:
        "Troque os Dados para \"sintético-estresse\" (PRNG semeado): é outro dataset, e o gate continua bloqueando pelos MESMOS pilares de qualidade — cobertura do jovem, NA como proxy de idade, e gap de taxa-base — não por um único DI. O mesmo gate, outro dado: a lição é que fairness é propriedade do dado, medida em vários eixos, e o gate não está \"decorado\" para uma base específica.",
      check: {
        prompt: "No dado real, o DI da sonda já passa cru (0,97). Por que, então, o gate ainda bloqueia?",
        options: [
          { text: "Porque a injustiça mora na representação e nos rótulos — não num único DI. A sonda exclui sexo/idade.", correct: true,
            feedback: "Exato. Esse é o ponto mais fino do artefato: um único número de fairness engana. O gate bloqueia pela cobertura (14,9%), pelo NA e pelo gap de taxa-base — fairness é multidimensional." },
          { text: "Porque o DI de 0,97 está, na verdade, abaixo do limite de 0,80.", correct: false,
            feedback: "0,97 ≥ 0,80, então o DI passa. O bloqueio vem de outras checagens: cobertura, consistência e gap de taxa-base. Fairness não é um número só." },
          { text: "Porque a sonda inclui sexo e idade como features.", correct: false,
            feedback: "Ao contrário: a sonda EXCLUI os atributos protegidos. É justamente por isso que o DI parece bom — e por que olhar só ele esconde o viés do dado." },
        ],
      },
      movements: [
        { type: "why", label: "PORQUÊ + TRADE-OFF", text: "LogReg como sonda: troca-se robustez do modelo por determinismo + sample_weight + <10s. Não é o modelo final — é o instrumento de medição." },
        { type: "alt", label: "CAMINHO ALTERNATIVO", text: "Warnings não-bloqueantes foram preteridos (ADR-006): a cláusula suspensiva exige raise GateBlocked, sem \"avisar e seguir\"." },
        { type: "con", label: "CONEXÃO LONGITUDINAL", text: "É o gate de autorização do FIDC e o \"LLM decide, código calcula\" do motor trabalhista allla: diagnóstico heurístico, veredito determinístico (P3)." },
        { type: "q", label: "PERGUNTA PROVOCATIVA", text: "O limite de DI a 0,80 é a regra dos EUA. Qual número Risco/Jurídico fixaria sob LGPD e igualdade material — e quem assina?" },
      ],
      estMin: 3,
    },
    {
      n: 5, key: "mitigate", bloom: "Aplicar",
      name: "Mitigação de viés", aula: "Aula 6 · Mitigação",
      eyebrow: "05 / MITIGAÇÃO DE VIÉS", fr: "FR-5/6 · rubrica 30%",
      title: "Duas ações — e o <em>trade-off</em> de cada uma",
      pedTitle: "Onde pagar o custo da justiça.",
      objective: "Aplicar duas mitigações na raiz do dataset — e medir o custo de cada uma.",
      // scaffolding MÉDIO: ainda há ordem a respeitar
      instruction:
        "Aplique as duas ações — a ordem importa. Primeiro a Imputação estratificada (Ação 02): conserta o NA condicionando ao subgrupo, nunca pela moda global. Depois a Reponderação Kamiran–Calders (Ação 01): quebra a correlação protegido↔rótulo. Corrigir a representação antes de reponderar evita reponderar sobre dado já enviesado.",
      deepen:
        "Por que não SMOTE? Pontos sintéticos injetam ruído e derrubam AUC sobre 1.000 linhas escassas. A reponderação preserva o dado real e só redistribui ênfase — fairness↑, AUC↓ de forma medível.",
      check: {
        prompt: "Por que imputar o NA condicionando ao subgrupo, e não pela moda global?",
        options: [
          { text: "A moda global apaga a estrutura da minoria e a viesa contra o grupo sub-representado.", correct: true,
            feedback: "Isso. Imputar group-aware preserva a distribuição de cada subgrupo; a moda global empurra todo mundo para o padrão da maioria. E a flag missingness-as-signal contém o risco de codificar o grupo." },
          { text: "Porque a moda global é computacionalmente mais cara.", correct: false,
            feedback: "Custo não é o ponto — ambas são baratas. O problema da moda global é estatístico: ela apaga a estrutura da minoria e reforça o viés." },
          { text: "Porque imputar por subgrupo elimina a necessidade de reponderar.", correct: false,
            feedback: "Não elimina: imputação conserta representação/consistência; a reponderação ataca a correlação rótulo↔grupo. São ações complementares, e a ordem importa." },
        ],
      },
      movements: [
        { type: "why", label: "PORQUÊ + TRADE-OFF", text: "Reweighing preserva o dado real e desloca a fronteira (fairness↑, AUC↓) de forma medível — redistribui ênfase, não cria informação." },
        { type: "alt", label: "CAMINHO ALTERNATIVO", text: "SMOTE preterido: pontos sintéticos injetam ruído e derrubam AUC (perda de sinal preditivo) sobre 1.000 linhas escassas." },
        { type: "con", label: "CONEXÃO LONGITUDINAL", text: "Imputar group-aware evita a moda global que viesa contra o minoritário (Aula 6) — e a flag de missingness vira sinal." },
        { type: "q", label: "PERGUNTA PROVOCATIVA", text: "A ordem importa: corrigir representação antes de reponderar. Quanta acurácia a banca aceita trocar por paridade?" },
      ],
      estMin: 3,
    },
    {
      n: 6, key: "regress", bloom: "Avaliar",
      name: "Regressão de justiça", aula: "Aula 7 · Validação contínua",
      eyebrow: "06 / REGRESSÃO DE JUSTIÇA", fr: "FR-7 · re-medição obrigatória",
      title: "Verde <em>só</em> após reexecutar o gate",
      pedTitle: "Aprendizado unidirecional (P4).",
      objective: "Re-julgar pós-mitigação: dataset_aprovado só sai se o gate voltar verde.",
      // scaffolding BAIXO: enxuto
      instruction:
        "Reexecute o gate sobre o dataset mitigado. Só se voltar verde o artefato dataset_aprovado é emitido — com proveniência completa. Não se declara verde sem reexecução (invariante 4).",
      deepen:
        "A divergência (gate vermelho) corrige o dataset/contrato — nunca afrouxa o threshold. Relaxar um limite é decisão humana registrada: PR + assinatura do Fairness Steward.",
      check: {
        prompt: "Depois de aplicar as mitigações, posso declarar o dataset \"aprovado\" sem rodar o gate de novo?",
        options: [
          { text: "Não — a re-medição é obrigatória (invariante 4); verde sem reexecução é inválido.", correct: true,
            feedback: "Exato. Aprendizado unidirecional (P4): a mitigação não se auto-certifica. E veredito sem proveniência é inválido (P6) — por isso o artefato carrega policy#hash · seed · DI · DPD · AUC." },
          { text: "Sim — se as duas ações foram aplicadas, o verde é garantido.", correct: false,
            feedback: "Aplicar não é aprovar. A mitigação pode não bastar (ou exagerar e custar acurácia demais). Só a reexecução do gate emite o veredito." },
          { text: "Sim, e se ainda reprovar eu afrouxo o limite até passar.", correct: false,
            feedback: "Isso é proibido por arquitetura (P4): o motor nunca reescreve a própria política. Afrouxar limite é decisão humana assinada, registrada em PR." },
        ],
      },
      movements: [
        { type: "why", label: "PORQUÊ + TRADE-OFF", text: "Re-medição obrigatória troca a conveniência de declarar verde pela garantia de que o verde foi de fato reexecutado (invariante 4)." },
        { type: "alt", label: "CAMINHO ALTERNATIVO", text: "Afrouxar o threshold para passar é arquiteturalmente proibido (P4): o motor nunca reescreve a própria política." },
        { type: "con", label: "CONEXÃO LONGITUDINAL", text: "Aprendizado unidirecional: a divergência corrige dataset/contrato, nunca a regra — como o motor trabalhista da allla." },
      ],
      estMin: 2,
    },
    {
      n: 7, key: "tradeoff", bloom: "Criar",
      name: "Curva de trade-off", aula: "Aula 6 · Pareto",
      eyebrow: "07 / TRADE-OFF", fr: "FR-8 · fronteira de Pareto",
      title: "A fronteira <em>acurácia × justiça</em>",
      pedTitle: "Escolher na fronteira de Pareto.",
      objective: "Criar a decisão final: escolher o ponto que respeita o limite ao menor custo.",
      instruction:
        "Clique nos pontos da fronteira e veja o gate reagir. O ponto escolhido respeita o limite de justiça com a menor perda de acurácia — não maximiza fairness cegamente. Promover o dataset ao treino é decisão normativa: pertence a Risco/Jurídico.",
      deepen:
        "Paridade e calibração são matematicamente incompatíveis — não há ponto que zere os dois. A escolha do ponto é um juízo de valor, e por isso exige assinatura.",
      check: {
        prompt: "Na fronteira acurácia × justiça, o \"melhor\" ponto é…",
        options: [
          { text: "O que respeita o limite de justiça com a menor perda de acurácia.", correct: true,
            feedback: "Isso. Maximizar fairness cegamente destrói acurácia sem ganho real de acesso ao crédito justo. O ponto certo é o mínimo de mitigação que cruza o limite — e ele é uma escolha normativa, não automática." },
          { text: "O que maximiza a justiça (fairness), custe o que custar em acurácia.", correct: false,
            feedback: "Não. Acurácia jogada fora não vira crédito mais justo — vira modelo inútil. Busca-se respeitar o limite ao menor custo, não fairness máxima." },
          { text: "O que maximiza a acurácia, ignorando o limite de justiça.", correct: false,
            feedback: "Esse ponto é exatamente o que o gate bloqueia. O limite de justiça é inegociável pelo motor; o que se otimiza é o custo dentro dele." },
        ],
      },
      movements: [
        { type: "why", label: "PORQUÊ + TRADE-OFF", text: "A fronteira de Pareto torna explícito onde pagar o custo: o ponto que respeita o limite com a menor perda de acurácia." },
        { type: "alt", label: "CAMINHO ALTERNATIVO", text: "Maximizar fairness cegamente foi preterido: destrói acurácia sem ganho real de acesso ao crédito justo." },
        { type: "con", label: "CONEXÃO LONGITUDINAL", text: "Paridade e calibração são incompatíveis — a escolha do ponto é normativa e pertence a Risco/Jurídico (P4 · P7)." },
        { type: "q", label: "PERGUNTA PROVOCATIVA", text: "Promover este dataset ao treino exige assinatura. Você assina o ponto verde — e registra o override se um dia quiser outro?" },
      ],
      estMin: 2,
    },
  ];

  // ── Prova de consolidação (gate de aprendizado) ───────────────────────────
  // Retrieval CUMULATIVO interleaving as 7 estações — base evidence: prática de
  // recuperação + espaçada = alta utilidade (Dunlosky et al. 2013, PSPI). É um GATE
  // ESTRITO (como o de dados): todas as questões certas emitem `aprendizado_consolidado`.
  // Re-tentar é permitido (formativo) — a própria re-recuperação é o aprendizado.
  const CONSOLIDATION = {
    title: "Prova de consolidação",
    sub: "3 questões que cruzam as 7 estações. Acertar todas emite o artefato aprendizado_consolidado — o gate de aprendizado, espelho do gate de dados.",
    questions: [
      {
        id: "origem",
        prompt: "Onde nasce o viés que o fairgate bloqueia no German Credit?",
        options: [
          { text: "No dado: o rótulo histórico (gap de taxa-base de 12,8 p.p.) e a sub-representação do jovem<25 (~15%). O modelo só amplificaria.", correct: true,
            feedback: "Exato — viés é defeito do dado, não do modelo (estações 1–2). É por isso que o gate age na ingestão, antes de treinar." },
          { text: "No algoritmo de treino: é um defeito do modelo, corrigível com mais épocas ou regularização.", correct: false,
            feedback: "Não. O gap de 12,8 p.p. e a sub-representação já existem no dado cru — nenhum ajuste de treino apaga uma desigualdade que está no rótulo." },
          { text: "Na métrica escolhida: qualquer modelo é neutro se a acurácia agregada for alta.", correct: false,
            feedback: "Cuidado: a acurácia agregada esconde o viés do subgrupo. O jovem com taxa pior ensina o modelo que ele é mais arriscado — invisível no número agregado." },
        ],
      },
      {
        id: "gate",
        prompt: "O que faz do fairgate um gate (não um relatório), e qual mitigação ele aplica?",
        options: [
          { text: "Reprova a ingestão e bloqueia o treino (cláusula suspensiva); mitiga com o MENOR λ de reponderação Kamiran–Calders que faz o gate inteiro passar.", correct: true,
            feedback: "Isso (estações 4–5). Bloqueia, não sugere; e escolhe a menor mitigação suficiente (P4) — não afrouxa o limite." },
          { text: "Emite um alerta e segue o pipeline; mitiga duplicando a minoria com SMOTE até equilibrar as classes.", correct: false,
            feedback: "Não: 'avisar e seguir' é exatamente o que o gate recusa. E SMOTE foi preterido — inflar a minoria com pontos sintéticos adiciona ruído e derruba AUC sem dado real." },
          { text: "Recalibra o modelo já treinado; nenhuma mudança no dado é necessária.", correct: false,
            feedback: "O fairgate age ANTES do treino, sobre o dado. Recalibrar o modelo deixa o viés entrar e só maquia a saída." },
        ],
      },
      {
        id: "auditavel",
        prompt: "Como o fairgate mantém o veredito honesto e auditável?",
        options: [
          { text: "Limites versionados no policy.yaml (fonte única; L1 do console ≡ L2 do notebook); veredito determinístico com proveniência (hash da policy + seed); o ponto escolhido respeita o limite com a menor perda de acurácia.", correct: true,
            feedback: "Perfeito (estações 3, 6, 7). Fonte única + determinismo + proveniência = veredito reproduzível e contestável — não opinião." },
          { text: "O tutor decide o veredito caso a caso, ajustando o limite ao contexto da pergunta.", correct: false,
            feedback: "Invariante P3: o tutor só ENSINA — nunca toca o veredito. O caminho do gate e o do tutor são disjuntos." },
          { text: "A acurácia agregada define a aprovação; a justiça vira um relatório separado, opcional.", correct: false,
            feedback: "Justiça é invariante de pipeline aqui, verificada ex-ante — não um anexo opcional. Acurácia alta com subgrupo prejudicado ainda reprova." },
        ],
      },
    ],
  };
  CONSOLIDATION.total = CONSOLIDATION.questions.length;
  // Resposta-modelo (estática) para AUTOCOMPARAÇÃO na carta de auto-explicação — sintetiza as 3
  // questões. NUNCA é correção do texto do aluno; é o alvo contra o qual ele compara o próprio
  // rascunho (auto-explicação · produção · Bisra et al. 2018). O gate continua sendo só as 7/7.
  CONSOLIDATION.modelAnswer =
    "O viés que o fairgate bloqueia nasce no DADO, não no modelo: o rótulo histórico do German Credit " +
    "já traz um gap de taxa-base de 12,8 p.p. e o jovem<25 é só ~15% da base — um modelo apenas " +
    "amplificaria. Por isso o fairgate age como GATE (não relatório): reprova a ingestão e bloqueia o " +
    "treino (cláusula suspensiva), e mitiga com o MENOR λ de reponderação Kamiran–Calders que faz o " +
    "gate inteiro passar — sem afrouxar o limite nem inflar a minoria com SMOTE. E mantém o veredito " +
    "honesto e auditável: limites versionados no policy.yaml (fonte única, L1≡L2), veredito determinístico " +
    "com proveniência (hash + seed), e o ponto escolhido respeita a justiça com a menor perda de acurácia.";

  // Sementes socráticas (tutoria dialógica · AutoTutor; lição de design do RCT de tutor de IA,
  // Kestin et al. 2024). O tutor PERGUNTA (ask) e dá uma PISTA (follow) — nunca a resposta pronta,
  // nunca avalia, nunca toca o veredito (P3). 'follow' é autorado p/ o modo offline pump de forma
  // determinística. Inspirado nos movements tipo 'q' (que existiam só p/ 3 das 7 estações).
  const SOCRATIC = {
    1: { ask: "Se a sonda não enxerga sexo nem idade, como ela ainda pode produzir um veredito injusto?",
         follow: "Olhe os proxies: variáveis correlacionadas ao grupo protegido (e o próprio NA como proxy) carregam o sinal mesmo sem a coluna. Derivamos os atributos protegidos para MEDIR, não para alimentar o modelo." },
    2: { ask: "Uma coluna 100% preenchida ainda pode reprovar a 'completude representacional'. Como?",
         follow: "Completude aqui não é % de não-nulos — é a cobertura DO SUBGRUPO. Se o jovem<25 é ~15% da base, o modelo subajusta a minoria mesmo sem nenhum nulo." },
    3: { ask: "Por que escrever a validação como contrato-código (Pandera) no CI, em vez de um relatório de qualidade que alguém lê?",
         follow: "Um relatório avisa; um contrato bloqueia. No CI ele é PR-blocker (cláusula suspensiva, P1): nada chega ao treino sem passar — e a checagem é versionada e reproduzível." },
    4: { ask: "O limite de DI a 0,80 é a regra dos EUA. Que número Risco/Jurídico fixaria sob LGPD e igualdade material — e quem assina?",
         follow: "Não há número 'neutro': o limite é decisão de política, registrada e assinada (Fairness Steward). O gate torna essa escolha explícita e versionada — não a esconde num default." },
    5: { ask: "A ordem importa: corrigir representação antes de reponderar. Quanta acurácia a banca aceita trocar por paridade?",
         follow: "A resposta certa não é 'o máximo de fairness' — é o MENOR custo que faz o gate passar. Imputação estratificada corrige a representação; Kamiran–Calders quebra a correlação protegido↔rótulo." },
    6: { ask: "Se o gate volta vermelho depois da mitigação, o que se ajusta — o threshold ou o dataset?",
         follow: "Aprendizado unidirecional (P4): a divergência corrige o DADO/contrato, nunca afrouxa o limite. Relaxar um limite é decisão humana registrada (PR + assinatura), não um loop automático." },
    7: { ask: "Promover este dataset ao treino exige assinatura. Você assina o ponto verde — e registra o override se um dia quiser outro?",
         follow: "O ponto ótimo respeita o limite com a MENOR perda de acurácia — não a fairness máxima. Assinar é assumir a proveniência (policy + seed + hash); o override é rastreável, não silencioso." },
  };

  const TOTAL = STATIONS.length;
  const EST_MIN = STATIONS.reduce((s, m) => s + m.estMin, 0);
  function get(n) { return STATIONS.find((s) => s.n === n); }

  return { STATIONS, TOTAL, EST_MIN, get, CONSOLIDATION, SOCRATIC };
})();
