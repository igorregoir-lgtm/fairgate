# Feynman na Trilha Educacional — análise de aplicabilidade (evidência + teste adversarial)

> Pergunta do usuário: os elementos de pedagogia de Feynman (ex.: o artigo da BBC
> `bbc.com/portuguese/articles/cjdnn0r1pmro`) **já estão considerados** na Trilha? São
> **aplicáveis** aqui? Pesquisa em fontes de reputação + **teste adversarial** da hipótese.

## 1. O que é a técnica de Feynman (fonte: BBC + guia de estudos da Univ. de York)

Protocolo de 4 passos:
1. **Escolha um conceito.**
2. **Ensine** — escreva tudo que sabe **como se ensinasse a uma criança**, na linguagem mais
   simples possível. (O jargão cria a *ilusão* de que você entende; a linguagem simples expõe a verdade.)
3. **Volte** — ao tentar explicar, você acha **lacunas**; volte à fonte e preencha; re-explique simples.
4. **Revise e simplifique** — leia em voz alta; crie **analogias** (analogia = sinal de domínio).

Limitação documentada (guia da Univ. de York, citado pela BBC): **não serve** para conceitos simples
nem tópicos de **pura memorização**; **custa tempo e esforço** consideráveis.

## 2. Evidência (apenas fontes de reputação)

| Mecanismo | Fonte reputada | Força | Nota |
|---|---|---|---|
| **A técnica de Feynman em si** | — (só blogs/Quora/Reddit) | **anedótica** | **Sem RCT direto.** A credibilidade é *herdada* dos mecanismos abaixo. |
| **Auto-explicação** (self-explanation) | Bisra et al. 2018, *Educational Psychology Review* (64 estudos, 69 efeitos) | **moderada-forte** | **g ≈ 0,55**. Visible Learning MetaX confirma 0,55. Dunlosky 2013 (PSPI) classifica como utilidade **moderada**. |
| **Aprender ensinando / protégé effect** | Kobayashi meta-análise (*Jpn. Psych. Research* 2019, jpr.12221); Fiorella & Mayer | **moderada** | Ensinar **com interatividade** > só *preparar* para ensinar (PMC6336728). |
| **Ilusão de profundidade explicativa (IOED)** | Rozenblit & Keil 2002, *Cognitive Science* 26(5):521–562 | **forte** | Pessoas **superestimam** o quanto entendem; tentar explicar o **mecanismo** revela a lacuna. É o motor do passo 3 de Feynman. |
| (Comparação) **Prática de recuperação + prática espaçada** | Dunlosky et al. 2013, PSPI | **alta** | Já são os pilares da Trilha (predict-first + consolidação cumulativa). |

**Leitura honesta:** a técnica de Feynman = um *empacotamento* de auto-explicação + geração +
detecção de lacuna via IOED. Mecanismos legítimos, mas de utilidade **moderada** — **abaixo** da
prática de recuperação, que a Trilha já explora.

## 3. O que a Trilha JÁ cobre (mapeamento honesto — não rebobinar o que já existe)

| Elemento Feynman | Já na Trilha? | Onde |
|---|---|---|
| Comprometer-se antes de ver a resposta | **Sim** (parcial) | check **predict-first** + calibração de confiança |
| Confrontar a lacuna metacognitiva (IOED) | **Sim** (parcial) | hipercorreção: erro de alta confiança → nota que fixa a correção |
| Recuperação cumulativa / espaçada | **Sim** (forte) | prova de consolidação cruzando as 7 estações |
| Feedback que ensina pelo erro | **Sim** | feedback por opção |
| **GERAR/PRODUZIR explicação nas próprias palavras** | **NÃO** | *o aluno só SELECIONA opções — nunca produz uma explicação* |

**A lacuna real:** a Trilha testa **reconhecimento** (múltipla escolha), nunca **produção**. O lever
que falta é exatamente o de Feynman: auto-explicação / "explique como se fosse para um leigo".

## 4. Tensão com os invariantes do artefato (o ponto crítico de viabilidade)

O fairgate é **offline-first · determinístico · CSP estrito · gate honesto (P3: tutor nunca toca o
veredito) · fonte única**. Um campo "digite sua explicação" **avaliado por LLM** (`/api/tutor`)
quebraria offline + determinismo + P3. Logo, **a única forma invariante-segura** de trazer Feynman é
**auto-explicação + revelar uma resposta-modelo para autocomparação** (explora a IOED), mantida como
**formativa — nunca um gate duro** (texto livre não é verificável deterministicamente).

## 5. Veredito adversarial

Painel de 4 lentes independentes (cada uma com schema estruturado; o cientista da aprendizagem
**re-verificou** os effect sizes na fonte). **Convergiram** — não se dividiram:

| Lente | Posição | Conf. | Argumento mais forte (resumo) |
|---|---|---|---|
| **Proponente** | conditional | 0,74 | A Trilha é, **pelo próprio código**, um instrumento só de *reconhecimento* (sempre `pick`/`consolPick` → ler feedback autoral). Nunca há **produção**. É exatamente o lever que falta. |
| **Cético** | oppose | 0,72 | A Trilha já gasta os dois levers de utilidade **ALTA** (recuperação + espaçamento). Feynman é só **moderado** (g~0,55) e **sem RCT direto** — risco de scope-creep num artefato coeso e já shipado. |
| **Cientista da aprendizagem** | conditional | 0,83 | Auto-explicação é **aditiva, não redundante**: opera em mecanismo diferente (produção → fura a IOED) do que já existe. Mas fica **um nível abaixo** da recuperação — complementa, não substitui. O *ritual de 4 passos* "Feynman" não agrega nada além do prompt nu de auto-explicação. |
| **Crítico de invariantes** | conditional | 0,83 | É implementável **sem violar invariante**, mas só numa forma: caixa de texto **formativa**, autocomparada com resposta-modelo **estática** do `missions.js`; **nunca** avaliada por máquina, **nunca** alimenta o gate 7/7. Avaliar = só via `/api/tutor` (rede) → quebra offline + determinismo + P3 de uma vez. |

### Síntese — **ADOTAR COM RESTRIÇÕES** (confiança 0,82)

**Bottom line:** adicionar **um** passo de auto-explicação **opcional, não-gating, de sessão**, na camada
de **consolidação** — adotar o **mecanismo** (auto-explicação + ilusão de profundidade explicativa),
**não a marca "Feynman"** (que não tem RCT).

**Por quê:** a lacuna é **real e confirmada no código** — todo interação é seleção; o aluno nunca
**produz** linguagem. Auto-explicação (Bisra 2018, g≈0,55) fura a IOED (Rozenblit & Keil 2002), algo que
recuperação/calibração não alcançam. Mas é utilidade **moderada** (Dunlosky 2013), **abaixo** da
recuperação que a Trilha já tem → **augmenta, não atualiza**.

**O que construir (única forma invariante-segura):** uma carta de auto-explicação **depois** do gate
7/7 já ter emitido `aprendizado_consolidado` (logo, comprovadamente não toca o veredito): textarea
("Explique a um colega de Risco, em uma frase, por que o DI cru de 0,97 não basta") → botão "Revelar
explicação-modelo" **gated em texto não-vazio** (espelha `setConf` gated em `picked!==null`) → revela a
**prosa autoral estática** já em `CONSOLIDATION` para **autocomparação** + cue "onde minha explicação
tinha buracos?". Estado em `S.consol` (morre no reload). Rotulado como **auto-explicação · IOED**, nunca
"Feynman", nunca avaliado.

**O que NÃO fazer:**
- ❌ deixar o texto influenciar o gate 7/7 (seria *verde falso* — viola ADR-013).
- ❌ mandar o texto para `/api/tutor` corrigir (quebra offline + determinismo + P3 de uma vez).
- ❌ adicionar **por estação** (esp. estações 1–2, de recall numérico → limitação de York; estoura o orçamento de ~16 min).
- ❌ vender os "4 passos" como chrome **sem** o passo de geração real (teatro).
- ❌ chamar de "técnica de Feynman" como se fosse comprovada (não há RCT; creditar o mecanismo).
- ❌ substituir qualquer check de múltipla escolha por "explique" (troca lever ALTO por moderado — perda líquida).

**Riscos residuais:** auto-avaliação oca (aluno apressado digita "ok"); pressão futura de PM para "checar" o
texto (precisa de ADR explícito para resistir); o texto evapora no reload (é momento de aprendizado, não
artefato durável); +1 clique (contido por ser pós-gate e opcional).

**Resposta direta à sua pergunta:** sim, os elementos de Feynman são **parcialmente** considerados (predict-first,
hipercorreção/IOED, recuperação cumulativa) — mas **o lever central de Feynman (produção/auto-explicação)
está ausente** e **é aplicável aqui**, na forma restrita acima. A hipótese se confirma — com a ressalva de
adotar o **mecanismo**, não a marca, e mantê-lo **formativo, fora do gate**.

---

## 6. Panorama ampliado — não só Feynman: pedagogias + o Tutor de IA como multiplicador em escala

> Correção de rota do usuário: não considerar **apenas** Feynman; considerar o **conjunto** de pedagogias
> com evidência, em especial as que usam o **Tutor de IA** (que o fairgate já tem) como **multiplicador
> de aprendizado em escala**.

### 6.1 Evidência (fontes de reputação, effect sizes verificados na fonte)

| Lever | Fonte reputada | Efeito | Já na Trilha? |
|---|---|---|---|
| **Aprendizado de maestria** | Visible Learning MetaX (16 meta-análises); Kulik et al. (JSTOR) | **d = 0,67** | ✅ **o gate 7/7 É maestria** (não avança sem prova) |
| **Sistemas Tutores Inteligentes (ITS)** | Kulik & Fletcher, 50 avaliações (DTIC); VanLehn 2011 (*Educ. Psychologist*) | **+0,66 SD; ITS ≈ tutor humano** (d≈0,76 vs 0,79) | ⚠️ tutor existe, mas **só consumo** |
| **Tutor de IA (era gen-AI), RCT** | Kestin, Miller, Klales et al., *Nature Sci. Reports* 2024 | **superou aula ativa; ~2× engajamento** | ⚠️ lição: o **design** pedagógico importa |
| **Tutoria socrática/dialógica** | AutoTutor (Graesser, ScienceDirect/Memphis) | **~0,8σ (0,2–1,5)** | ❌ o tutor responde, nunca **pergunta** |
| **Problema 2-sigma de Bloom** | Bloom 1984 (*Educ. Researcher*, MIT) | **+2σ** | — é a **tese** (com ressalva ↓) |
| **Feedback** | Hattie & Timperley 2007; *Power of Feedback Revisited* (PMC 2024) | entre os mais altos | ✅ feedback por opção + calibNote |
| **Auto-explicação** | Bisra et al. 2018 | g = 0,55 | ❌ a lacuna de Feynman (aprovada §5) |
| (régua) **Recuperação + espaçamento** | Dunlosky et al. 2013 (PSPI) | **ALTA** | ✅ predict-first + consolidação |

**Ressalva honesta sobre o 2σ** (EducationNext, *"science fiction vs fact"*): o número +2σ **raramente
se replica**; RCTs de campo mostram ~0,3–0,4σ. Usar como **aspiração/enquadramento**, nunca promessa.

### 6.2 A virada conceitual ("what the hell" v2)

O fairgate **já possui as DUAS metades da solução 2-sigma de Bloom**: um **gate de maestria** (o
`aprendizado_consolidado`, d≈0,67) **+** um **tutor 1:1 de IA** (o dock, ITS ≈ tutor humano). Só que o
tutor é usado em **modo consumo** (responde perguntas, explica fases) — nunca como **multiplicador**
(não pergunta, não dialoga socraticamente, não reage à produção do aluno). O upgrade god-mode de maior
alavancagem **não é inventar pedagogia nova — é ativar o tutor que já existe** como o multiplicador que
a evidência (VanLehn, Kestin, AutoTutor) diz que ele pode ser. Ativo latente: os `movements` tipo `q`
(perguntas provocativas) já autorados em `missions.js` são **sementes socráticas** que hoje só viram texto.

### 6.3 Roadmap priorizado (corte adversarial — confiança 0,86)

Painel: 5 levers + 1 cético + síntese. Veredito por lever:

| Lever | Evidência | Coberto? | Invariante | Alavanca | Veredito |
|---|---|---|---|---|---|
| **A · Carta de auto-explicação** (Feynman) | forte (g 0,55) | nenhum | **safe** | alta | **build-now** |
| **C · Enquadramento 2-sigma** (estrutura) | moderada | parcial | **safe** | alta | **build-now** |
| **B · Modo socrático** (ativa os `q` mortos) | forte (AutoTutor; Kestin) | parcial | condicional→safe | alta | **build-now** |
| D · Tutor reage ao texto livre | moderada | parcial | condicional | média | **defer** (após A) |
| Espaçamento entre sessões | alta | parcial | — | média | **defer** (bloqueado: estado de sessão) |
| (cético) construir nada além de A | — | — | — | — | **reject** (os `q` são texto morto, não shipados) |

**Build-now, em ordem:**
1. **A — Carta de auto-explicação**: na branch PASS de `consolVerdict()` (pós-7/7), abaixo da proveniência,
   `<textarea>` ("Explique o fairgate como se ensinasse um colega — 2-3 frases") + botão `revealModel` →
   revela `CONSOLIDATION.modelAnswer` (string estática nova em `missions.js`) para **autocomparação**.
   Sessão-only, P3-limpo, CSP-estrito. Microcopy obrigatório: *"Não corrigimos — compare você mesmo."*
2. **C — Enquadramento 2-sigma**: **ADR-015** + **uma** linha estática sob o certificado. Âncora honesta =
   paridade ITS↔tutor humano (VanLehn d≈0,76≈0,79; Kulik & Fletcher 0,66; Kestin 2024). 2σ só como
   **origem aspiracional + ressalva de não-replicação**. Reivindica a **estrutura**, nunca a magnitude.
3. **B — Modo socrático**: ativa os `movements` tipo `q` (hoje texto inerte). Backfill `q` para 7/7 +
   `socraticFollow` (hint autorado, offline-safe); render especial → botão "Topa um desafio?" →
   `socraticStation(n)` abre o dock e empurra a pergunta como turno do tutor; `sendDock` ramifica em
   `mode:"socratic"` (addendum de *pump* socrático em `api/tutor.js`; offline cai no `socraticFollow`).
   **Formativo-only**, P3-disjunto, jamais toca `c.results`/`S.learnCert`.

**ADRs:** **ADR-015** (estrutura 2-sigma: maestria + tutor 1:1; âncora ITS, ressalva 2σ) · **ADR-016**
(fronteira de honestidade pedagógica: auto-explicação não-medida; socrático formativo-only; texto livre
nunca avaliado por máquina; offline degrada para texto autorado — defesa escrita contra "deixa o tutor
corrigir").

**Reject (registrado):** LLM avaliar/pontuar o texto livre e alimentar o gate (anti-P3, é o próprio
distrator da questão de consolidação); qualquer copy de **+2σ / ganho medido / "IA que se adapta a você"**
(sem instrumento de medição, sessão-only → inverificável); socrático offline falso via a tabela de 7 regex.

**Resposta à sua correção:** correto — não é só Feynman. As pedagogias de maior alavancagem aqui são as
de **tutoria** (maestria d≈0,67 já presente; ITS≈tutor humano), e o ganho god-mode é **ativar o tutor
existente como multiplicador** (socrático), não inventar pedagogia nova. Tudo invariante-seguro e com
fonte citável.

---

## 7. Loop god-mode — reação formativa (D) + auditoria adversarial + a escalada

**Lever D (reação formativa do tutor).** A resposta a "se a LLM não corrige, quem corrige?": o tutor
**reage** (ensina), nunca **avalia**. Carta de auto-explicação → "Pedir reação do tutor" → online o LLM
reage (sólido · lacuna · fechamento, `mode:"react"`); offline degrada para a resposta-modelo. P3 intacto
(teste-slice prova que `reactToExplanation` não toca o veredito).

**Auditoria adversarial god-mode (5 lentes + síntese).** Veredito: tier **Tesla (7,8/10)** — o efeito
"what the hell" já presente e **provado por teste**, mas o **espelho dado↔aprendizado geometricamente
incompleto**: `S.calib` (mapa confiança×acerto dos 7 checks) era coletado e **descartado**. Punch-list de
9 defeitos corrigidos: esc HTML unificado (anti-injeção em `value=`), a11y da reação (`role=status`/foco),
`aria-busy`/sr-only no typing, gate da CTA de consolidação por 7/7 checks (P4 na porta), race do `gateTimer`,
preservação de input ao alternar voz/mic, e alinhamento ADR.

**A jogada para god-mode — "A Escalada" (ADR-017).** Renderizar `S.calib` no certificado: faixa de 7
células na escala Bloom (Entender→Criar), cor por calibração (acerto-confiante=teal; **erro de alta
confiança=âmbar ★**; não-respondida=cinza), + 3 métricas-espelho das 3 métricas de DQ do dado (cobertura,
calibração, Bloom máx). O aprendiz vê **o mesmo tipo de gráfico** da Fronteira de Pareto (justiça×acurácia)
aplicado a si — a arbitragem dado↔aprendizado vira **mesma estrutura visual**. Leitura pura, sessão-only,
P3 (teste-slice). É o passo que faz o artefato **produzir** o efeito, não só explicá-lo.
