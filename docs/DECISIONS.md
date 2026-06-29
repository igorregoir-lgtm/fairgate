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
