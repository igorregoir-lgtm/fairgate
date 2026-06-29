# DECISIONS (ADRs) — fairgate · Console do Operador

Decisões de arquitetura do Artefato Tecnológico. Formato curto: contexto · decisão · consequência.
Algumas herdadas do design (handoff Claude Design); outras tomadas na implementação real.

---

## ADR-001 — Stack: página única HTML/CSS/JS standalone (não Next.js)
**Contexto.** O artefato é uma **tela única** interativa; o `fairgate-engine.js` do handoff já é JS puro,
determinístico e sem dependências. O repositório-irmão (Vitaliza) é Next.js, mas usa Supabase + pipeline
Python que o fairgate não precisa.
**Decisão.** Implementar como **página única standalone** (abre por duplo-clique; deploy estático trivial),
reusando o motor **verbatim**. A consistência com o repositório é mantida onde importa: **design system
allla**, **pedagogia PBL/Bloom** e **rigor** (testes, ADRs, proveniência) — não no stack literal.
**Consequência.** Zero build/deps; determinismo preservado (sem porte para TS); roda offline. Trade-off:
sem reuso literal dos componentes React do Vitaliza (substituído por reuso de padrões/pedagogia).

## ADR-002 — Dados reais embutidos (não gerador sintético por default)
**Contexto.** O motor sintetizava o German Credit (PRNG semeado) calibrado às taxas-base reais. O usuário
tem o `german_credit_data.csv` **real** (1.000 linhas).
**Decisão.** Usar os **dados reais** por default, **embutidos** como JS (`data/german-credit.js`, gerado por
`scripts/build-data.mjs`) para preservar o "abre por duplo-clique" sem servidor (sem `fetch` em `file://`).
Manter o gerador como modo **"sintético-estresse"** (toggle), pois ele exibe o gate de fairness reprovando
dramaticamente — contraste pedagógico.
**Consequência.** Artefato **real**; o build de dados é determinístico e reprodutível. Modos real/sintético
ensinam que fairness é multidimensional.

## ADR-003 — `chosen` = menor λ que passa o GATE INTEIRO (não só DI/DPD)
**Contexto.** No dado **real**, o DI do probe já passa cru; o blocker é o **gap de taxa-base** do rótulo. A
heurística original (`chosen` = 1º λ com DI/DPD ok) escolhia λ=0 (só cobertura) e **não fechava** o gap →
o arco "mitigado → aprovado" quebrava.
**Decisão.** `tradeoff.chosen` = **menor λ cujo gate inteiro passa** (completude · consistência · precisão ·
DI · DPD). A reponderação Kamiran–Calders zera o gap de taxa-base por construção; o gate fecha em λ=0,30
no dado real (AUC 0,762 — **menor custo**), que é exatamente o "ponto de Pareto com menor perda de acurácia".
**Consequência.** Honesto e fiel ao design (P4: não afrouxa o limite; escolhe a **menor mitigação** que
satisfaz toda a política). Verificado em `tests/engine.test.mjs`.

## ADR-004 — Fronteira de Pareto plota base-rate gap × AUC (não DI × AUC)
**Contexto.** O design rotulava o eixo x como "disparate impact". No dado real, DI ∈ [0,96; 0,99] para todo
λ → os pontos colapsam à direita e o limite de 0,80 sai do gráfico; a **restrição que de fato binda** é o
gap de taxa-base.
**Decisão.** Plotar **gap de taxa-base (x, → 0 mais justo) × AUC (y)** com a régua em `base_rate_gap_max`
(10 p.p.), mantendo a estrutura visual do design (zonas pass/fail, ponto "cru", ponto "escolhido",
clicável). DI continua exposto na leitura lateral.
**Consequência.** O gráfico mostra a **decisão real** que o operador navega (justiça do rótulo × acurácia),
e funciona nos dois modos (real/sintético). Desvia do rótulo literal do design em favor da honestidade.

## ADR-005 — Pandera (contrato-como-código), Great Expectations preterido
**Decisão (do design).** Contrato executável leve (Pandera) que falha rápido no núcleo; GE preterido por
overhead de projeto desproporcional ao core demonstrável.
**Consequência.** Determinismo e fail-fast; checagens versionadas em Git como PR-blocker.

## ADR-006 — `raise GateBlocked` (cláusula suspensiva), não "warning e segue"
**Decisão (do design, P1).** O gate **interrompe** (BLOCKER) em vez de só avisar.
**Consequência.** O artefato é um *gate*, não um relatório. WARNING existe para o nível não-bloqueante.

## ADR-007 — Reponderação (Kamiran–Calders), SMOTE preterido
**Decisão (do design).** Reweighing preserva o dado real e desloca a fronteira de forma medível
(fairness↑, AUC↓); SMOTE preterido (pontos sintéticos injetam ruído sobre 1.000 linhas escassas).
**Consequência.** Mitigação interpretável; a flag `missingness-as-signal` contém o risco de codificar o grupo.

## ADR-008 — Render por `innerHTML` + delegação de eventos
**Contexto.** Substituir o `DCLogic` do protótipo por DOM real, sem framework, em `file://`.
**Decisão.** Estado único `S`; `render()` reconstrói `#fg-root` a cada mudança; eventos por **delegação**
(`data-act`) num único listener no contêiner estável. Animações de entrada (fgFade/fgSlam) re-disparam
naturalmente na troca de estação.
**Consequência.** Simples e robusto a bugs de binding; custo de re-render desprezível (tela única). Sliders
contínuos evitados (steppers discretos) para não perder foco no re-render.

## ADR-009 — Acessibilidade (WCAG 2.2 AA) com trade-off de contraste documentado
**Contexto.** Duas revisões adversariais (código + a11y) rodaram sobre o artefato. A revisão de código
não achou CRITICAL; correções aplicadas (guarda de modal, fallback de base vazia, rótulo do Pareto,
robustez E/T, limpeza). A revisão de a11y apontou contrastes abaixo de AA em rótulos pequenos — herança do
tema **escuro editorial** intencional (marca allla: navy quase-monocromático + teal como energia).
**Decisão.** Pass de a11y de alto impacto: foco preso e devolvido no modal; estações bloqueadas como
`disabled` (fora do tab); landmarks rotulados; SVG do Pareto com `role="img"`/`aria-label`/`<title>` e
pontos operáveis por teclado; backdrop `aria-hidden`; alvos de toque ≥24px; `prefers-reduced-motion`
cobrindo animações inline; `role="status"` no loading; indicadores não-só-cor (toggle ativo, details).
**Contraste:** o **texto-corpo** foi elevado a ≥AA (rgba .55–.66 → .72–.82; steel-deep #5B7691 → #7C91A5;
muted #8A9AAB → #67788A / #6B7E90). **Trade-off aceito:** alguns *eyebrows*/rótulos mono de 8–11px em teal
(#14B8A6) permanecem ~3,5:1 — escolha estética da marca, onde o limiar de objeto-gráfico (3:1) é defensável;
a informação essencial nunca depende só desses rótulos.
**Consequência.** Operável por teclado e leitor de tela; legibilidade do conteúdo lido em AA; integridade
da marca preservada. Residual documentado aqui (não é descuido).

## ADR-010 — Tutor com voz (porte do Vitaliza) · dock no rodapé
**Contexto.** O produto-irmão Vitaliza tem um tutor conversacional com **voz** (TTS ElevenLabs + Google +
fallback do navegador) e microfone. Pedido: trazer a mesma funcionalidade ao fairgate, com voz **nativa pt-BR**
(não robotizada) e um tutor sempre acessível.
**Decisão.** Porte sem deps para a stack standalone: `api/tts.js` (1 função serverless) replica o `lib/tts` do
Vitaliza — ordem `TTS_PROVIDER`→fallback→navegador, normalização de fala, status. **Voz primária = Google
`pt-BR-Chirp3-HD-Charon`** (masculina, **nativa pt-BR**, a mais natural do Google; service-account JWT→OAuth).
ElevenLabs (`eleven_multilingual_v2` + voz nativa BR) fica **cabeado** como fallback (requer chave válida; a do
Vitaliza expirou). Navegador (`SpeechSynthesis` pt-BR) é a degradação que **sempre** funciona. Entrada por voz via
`SpeechRecognition` pt-BR. UI = **dock no rodapé** (FAB → painel conversacional), abrível a qualquer momento, com
"explicar esta fase" por estação. O tutor é conversacional (histórico de mensagens).
**Invariante P3 (confirmado em revisão):** o tutor (texto e voz) **só ensina** — não tem acesso ao motor nem ao
estado do gate; o caminho do veredito e o do tutor são disjuntos.
**Segurança.** Segredos só em env var no servidor; `api/tts.js` com rate-limit por IP, cap de input, Content-Type
validado, sanitização de BOM. Os segredos do Vitaliza (Google SA, ElevenLabs, DeepSeek, OpenRouter, Supabase)
foram expostos em chat — **devem ser rotacionados**.
**Consequência.** Voz humana pt-BR ao vivo (Google) + tutor onipresente; funciona offline (voz do navegador).

## ADR-011 — Refinamento de UI/UX (tema claro allla, header institucional, tutor 2-entradas)
**Contexto.** O console nasceu com tema escuro de produto. A direção da marca allla é **clara** (paleta light) e
o repositório-irmão **Vitaliza** estabeleceu padrões de moldura (header dark + título centralizado + banner de
definição) e de acesso ao tutor.
**Decisão.** Converter para a **paleta clara allla** (sem logo wordmark; a marca vira o gráfico de barras dos três
"l", usado em badge e favicon). Adotar o **header institucional dark** com título do sistema centralizado (serif),
**banner de definição** "O que é o fairgate?" no topo (linguagem acessível + rigor técnico, sem anunciar que
simplifica), e organizar o tutor em **duas entradas** — "O Tutor Explica" (fase atual) e "? Pergunte ao Tutor"
(chat). Voz do tutor: **TTS progressivo** (síntese por frase, toca a 1ª e pré-busca o resto → início ~3× mais
rápido). A Trilha **reinicia a cada load** (sem persistir progresso entre reloads — demo-honesto).
**Consequência.** Consistência forte com Vitaliza e a marca allla. Verificação por **auditoria de contraste
programática** (WCAG, todas as telas) no lugar de screenshot. Padrões destilados como aprendizado transversal
(candidato em `Architectus/Knowledge/outputs/reports/aprendizado-craft-refinamento-ui-2026-06-29.md`).

## ADR-012 — Hardening de produção: CSP por-path + headers de segurança (`vercel.json`)
**Contexto.** Endpoints públicos (`/api/tutor`, `/api/tts`) + console interativo, sem nenhum header de segurança.
A app mistura superfícies: console (scripts same-origin), bundle de slides (inline + blob/data) e notebook Marimo
(jsdelivr + WASM).
**Decisão.** `vercel.json` com **CSP escopado por caminho** em 3 blocos mutuamente exclusivos: console **estrito**
(`script-src 'self'` — o único handler inline `onkeydown` foi refatorado p/ delegação), `/slides/` (frouxo o
suficiente p/ o bundle, sem abrir externo) e `/notebook/` (permite jsdelivr + `unsafe-eval` do Marimo). Mais
HSTS (2 anos, preload), `nosniff`, `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `Referrer-Policy`,
`Permissions-Policy` (`microphone=(self)` p/ o tutor; câmera/geo/pagamento off), COOP. As APIs externas
(DeepSeek/Google/ElevenLabs) são **server-side** → o browser só fala com `'self'` (`connect-src 'self'`).
Mantido `vercel.json` (não `vercel.ts`) por coerência com o zero-build/zero-deps do ADR-001.
**Consequência.** Superfície de XSS/clickjacking/sniffing fechada sem quebrar slides/notebook. Alinha às
primitivas de confiança transversais da allla (hardening como gate, ver ADR-013).

## ADR-013 — Gate de submissão contínuo (CI), honesto e sem deps
**Contexto.** O artefato não tinha CI; o diferencial técnico (L1≡L2 bit-idêntico via `crosscheck.py`) era prova
**pontual**, não contínua. O playbook allla [[criterio-de-pronto-e-gate-de-submissao]] define o gate de submissão,
com a falha-reverso a vigiar = **"verde falso"** (gate que exercita só stand-ins).
**Decisão.** GitHub Actions (`gate`) a cada push/PR: `node --check` (sintaxe de todo JS) → `node --test`
(motor + **property-tests do gate**: "qualquer métrica < limite ⟹ bloqueia", em N seeds; + testes herméticos da
API) → **cross-check honesto**: `node notebook/js_golden.mjs` regenera o golden do **motor JS vivo** e
`python notebook/crosscheck.py` prova bit-a-bit que L2 não diverge. **Zero dependências** (sem npm/pip install) —
coerente com `[[offline-local-first]]`. Scripts nomeados em `package.json` (`check`/`test`/`crosscheck`/`verify`).
**Consequência.** A divergência L1↔L2 (`[[conflito-de-fonte-explicito]]`) vira **invariante de pipeline**
verificado em todo commit; o gate corta merge se a prova quebrar. Critério de pronto deste artefato (estágio
"parceiro técnico"): a coisa difícil — o gate de fairness determinístico — roda e é provada ponta-a-ponta.

## ADR-014 — Trilha Educacional god-mode: calibração de confiança + gate de aprendizado
**Contexto.** A Trilha das 7 estações já tinha escalada Bloom, scaffolding decrescente e check **predict-first**
(prever antes de ver). Faltava fechar o laço pedagógico com **evidência de aprendizagem** — não só consumir o
conteúdo, mas **provar** que consolidou. A literatura de extrema reputação aponta o caminho: prática de
**retrieval** e **testes formativos** são técnicas de **alta utilidade** (Dunlosky et al., 2013 · *PSPI*), e o
**efeito de hipercorreção** (Butterfield & Metcalfe, 2001, replicado) mostra que erros de **alta confiança** são
os **mais corrigidos** — a surpresa metacognitiva fixa a versão correta. A pedagogia é, ela própria, fonte única
em `trilha/missions.js` (sem standard de pedagogia no transversal allla — este artefato é candidato a virar um).
**Decisão.** Dois movimentos, ambos espelhando o **gate de dados** do produto. (1) **Calibração de confiança**:
o check vira 3 fases — predizer → **declarar confiança** (baixa/média/alta) *antes* de revelar → revelar com uma
**nota de calibração** adaptativa (erro de alta confiança recebe a nota de hipercorreção, citando a fonte). (2)
**Gate de aprendizado**: uma **prova de consolidação** (`CONSOLIDATION` em `missions.js`) com retrieval
**cumulativo** que cruza as 7 estações; acertar **7/7** emite o artefato **`aprendizado_consolidado`** — espelho
exato do `dataset_aprovado`. Gate **honesto** (`[[criterio-de-pronto-e-gate-de-submissao]]`): **não se declara
verde sem reexecução** (invariante 4) — errar bloqueia e oferece refazer. Contrato da pedagogia coberto por
`tests/trilha.test.mjs` (escalada Bloom, checks bem-formados, consolidação bem-formada), dentro do `npm run verify`.
**Consequência.** O artefato passa a **gatear o aprendizado do mesmo jeito que gateia o dado** — coerência
estrutural que produz o efeito allla. CSP estrito preservado (fluxo por delegação `data-act`, zero handler inline).
Estado de aprendizado é de **sessão** (a Trilha reinicia a cada carga, `[[offline-local-first]]`), sem persistência
entre reloads. Custo: +1 fase no check (mais cliques) — aceito pelo ganho de fixação que a calibração entrega.

## ADR-015 — Trilha como solução de Bloom (maestria + tutor 1:1) + auto-explicação e modo socrático
**Contexto.** Pesquisa ampliada (não só Feynman) sobre ciência da aprendizagem **com IA como multiplicador em
escala** (`docs/analysis/feynman-trilha.md` §6). A síntese: o fairgate **já encarna as DUAS metades da solução
2-sigma de Bloom** — um **gate de maestria** (`aprendizado_consolidado`, mastery learning d≈0,67) **+** um
**tutor 1:1 de IA** (o dock; ITS ≈ tutor humano, VanLehn 2011 d≈0,76 vs 0,79; Kulik & Fletcher +0,66 SD; RCT de
tutor de IA Kestin et al. 2024, *Nature Sci. Reports*) — mas o tutor era usado só em **modo consumo** (responde/
explica), não como multiplicador. Lacunas reais confirmadas no código: o aluno só **reconhece** (nunca produz) e
o tutor nunca **pergunta**.
**Decisão.** Três levers, priorizados por painel adversarial (5 levers + cético + síntese, conf. 0,86), todos
**invariante-seguros**: (A) **carta de auto-explicação** opcional pós-gate 7/7 (textarea → `revealModel` →
resposta-modelo **estática** em `missions.js` p/ autocomparação; auto-explicação, Bisra et al. 2018 g≈0,55); (B)
**modo socrático** que ativa as sementes `SOCRATIC` (o tutor **pergunta** e dá **pista**, online via `mode:"socratic"`,
offline via `follow` autorado — tutoria dialógica, AutoTutor; lição de design do RCT de Kestin); (C) **enquadramento
estrutural** (esta ADR + uma linha no certificado) nomeando a dupla maestria+tutor.
**Consequência.** O artefato passa a **usar o tutor que já tem** como o multiplicador que a evidência associa aos
maiores ganhos. Reivindicamos a **estrutura**, **nunca a magnitude**: o número +2σ de Bloom 1984 é citado só como
**origem aspiracional**, com a ressalva de **não-replicação** (RCTs de campo ~0,3–0,4σ — `[[conflito-de-fonte-explicito]]`
aplicado à evidência pedagógica). A fronteira de honestidade está em **ADR-016**.

## ADR-016 — Fronteira de honestidade pedagógica (auto-explicação e socrático são formativos, nunca gate)
**Contexto.** Os levers A/B de **ADR-015** envolvem **texto livre do aluno** e o **tutor de IA**. A pressão previsível
(de PM, de produto) é "deixa o tutor **corrigir/pontuar** a explicação". Ceder a isso quebraria três invariantes de
uma vez — offline-first, determinismo e o **P3** (o tutor nunca toca o veredito) — e fabricaria um *verde falso*, a
falha-reverso que `[[criterio-de-pronto-e-gate-de-submissao]]` (ADR-013) proíbe.
**Decisão.** Codificar a fronteira: (a) a auto-explicação é **reflexão não-medida** — sem nota, sem correção; só
autocomparação com texto **autorado estático**; (b) o socrático/reação é **formativo-only** e **nunca** muta
`c.results` / `S.learnCert` / nenhum artefato emitido (P3 reafirmado para o caminho de ensino — provado por teste em
`tests/trilha.test.mjs`); (c) texto livre do aluno **jamais** é avaliado por máquina nem alimenta o gate; (d) o
comportamento **offline degrada para texto autorado** — o socrático para a pista `SOCRATIC.follow`, e a reação à
auto-explicação aponta o aprendiz à **resposta-modelo já exibida** (`CONSOLIDATION.modelAnswer`) — nunca
raciocínio simulado pela tabela de 7 regex; (e) **proibido** copy de **+2σ / ganho medido / "IA que se adapta a você"**
(sem instrumento de medição e com estado de sessão, qualquer claim de efeito é inverificável).
**Consequência.** A defesa escrita contra a deriva "deixa o tutor corrigir". O texto livre do aluno é **escapado**
antes de ir ao DOM (XSS). O gate de aprendizado continua sendo **só os 7/7** determinísticos com proveniência; a
produção e o diálogo socrático são **momento de aprendizado**, não artefato — coerentes com `[[offline-local-first]]`.

## ADR-017 — A escalada: proveniência de aprendizado (fecha o espelho dado↔aprendizado)
**Contexto.** Auditoria adversarial god-mode (5 lentes, `docs/analysis/feynman-trilha.md`) classificou a feature
em tier **Tesla (7,8/10)** e apontou o **único** gap para god-mode: o espelho dado↔aprendizado estava
**geometricamente incompleto**. O `dataset_aprovado` carrega proveniência rica (policy #hash + seed + DI/DPD/AUC
multidimensional), mas o `aprendizado_consolidado` derivava sua "proveniência" só de 3 questões. Pior: o estado
`S.calib` — o mapa confiança×acerto coletado nos 7 checks formativos (`closeCheck`) — era **gravado e descartado**
(lido em zero lugares). A coerência estrutural (a tese do artefato) ficava afirmada no texto, não demonstrada no objeto.
**Decisão.** Renderizar **A Escalada** no certificado (ramo `c.passed` de `consolVerdict`): uma faixa de 7 células
na ordem Bloom (Entender→Criar), cor por estado de calibração (acerto-confiante=teal; **erro de alta confiança=âmbar
★**, marcando onde a hipercorreção mais fixa; erro=coral; não-respondida=cinza), reusando a paleta de `calibNote`.
Mais 3 **métricas-espelho** das 3 métricas de DQ do dado: **cobertura** (estações/7), **calibração** (acertos vs
erros de alta confiança), **Bloom máx** com acerto. É **leitura pura** de `S.calib` — nenhum dado novo, nenhuma rede.
**Consequência.** O aprendiz vê, no instante após a Fronteira de Pareto (estação 7, justiça×acurácia), **o mesmo
tipo de gráfico aplicado a si** (confiança×acerto subindo a escala Bloom) — a arbitragem dado↔aprendizado deixa de
ser analogia e vira **mesma estrutura visual**: o passo que separa um artefato que *explica* o efeito de um que o
*produz*. Invariante-seguro: sessão-only (zera no reload), CSP-estrito (sem inline), **P3** (só leitura no render —
provado por teste-slice em `tests/trilha.test.mjs`). Não há gamificação (anti-template): a escalada **revela**
coerência, não premia.
