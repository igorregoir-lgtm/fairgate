# RUBRICA → ENTREGÁVEL — fairgate (Data Engineering · Módulo 2)

> Fatia 1 (pré-requisito). Mapa do **Barema (Excelência)** para cada artefato.
> Fontes lidas: `Barema_Eletivas_M2_DE.docx` (rubrica), `spec.md`/`fairgate_PRD.md`/`constitution.md`/`tasks.md`
> (spec-kit do fairgate), os **3 slides graded** (`dq_german_credit.pptx`), "O Artefato deve atender.docx"
> (checklist de entrega), "Avaliação Professor.docx" (feedback do artefato-irmão Vitaliza).

## Rubrica (artefato avaliado = "Plano de Melhoria de Data Quality", 3 slides)
| Dimensão | Peso | Excepcional (9–10) |
|---|---|---|
| **Métricas de Data Quality** | **25%** | 3 métricas exatas de DQ, com impacto **perfeitamente** explicado no modelo de risco de crédito |
| **Mitigação de Viés (Bias)** | **30%** | 2 ações técnicas de engenharia que atacam a **raiz** do viés demográfico **no dataset** |
| **Data Validation Automatizada** | **30%** | arquitetura lógica **brilhante** de validação contínua no pipeline (testes **antes** do treino) |
| **Formatação e Síntese** | **15%** | exatamente **3 slides**, linguagem técnica de Eng. de Dados, postura executiva de "Plano de Ação" |

## Mapa rubrica → estação / notebook / docs
| Dimensão (peso) | Console (L1) | Notebook Marimo (L2 · evidência) | policy.yaml / docs | Slide |
|---|---|---|---|---|
| **DQ 25%** | Estação 2 (Completude · Consistência · Precisão) | EDA + as 3 métricas sobre o CSV real | `quality.*` | 01/03 |
| **Mitigação 30%** | Estação 5 (imputação estratificada + Kamiran–Calders) | impute group-aware + reweigh KC, deltas | — | 02/03 |
| **Validation 30%** | Estação 3 (contrato Pandera) + Estação 4 (gate) | contrato Pandera + gate (raise GateBlocked) | invariantes P1/P3/P4/P6 | 03/03 |
| **Formatação 15%** | — | — | — | 3 slides (`dq_german_credit.pptx`) |

## Checklist de entrega ("O Artefato deve atender") → fairgate
| Requisito (genérico do módulo) | Como o fairgate cumpre |
|---|---|
| Modelo validado, sem overfit/vazamento, métricas | **Sonda** LogReg determinística (seed 42), split por índice; AUC reportado; é instrumento de medição, não o modelo final |
| Explicabilidade + linguagem natural | Veredito **legível** (subgrupo · métrica · valor · limite) + painel "leitura da sonda" |
| Serviço web / serve inferência / deploy | Console publicado na Vercel (`fairgate-eight.vercel.app`) + endpoint `api/tutor` |
| Código fonte (GitHub), pipelines separados, serializado | **GitHub** (a criar); L2 notebook = medição/treino da sonda; L1 engine = gate/inferência; `policy.yaml` = contrato serializado |
| Demonstração funcional (link no ar) | Link vivo (Vercel) — o slide 03 aponta para ele |

## Sinais do avaliador (feedback Vitaliza)
Valoriza: completude técnica, integração tech↔negócio, **evidências formais**, documentação, explicabilidade
individual. → o **notebook L2** é exatamente a "evidência formal"; o veredito legível é a explicabilidade.

## ⚠️ Inconsistências encontradas (slides graded × rubrica × dado real) — a resolver
1. **Slide 01 diz "jovem<25 19%"**; o **dado real = 14,9%** (o console e o notebook usam o real). → atualizar o slide.
2. **Pesos nos slides (30/40/30)** ≠ **rubrica (25/30/30/15)**. → corrigir os rótulos de peso nos 3 slides.
3. **Limites do slide** ("nenhum subgrupo <25%", "≥98% não-nulo") ≠ `policy.yaml` (`coverage_min: 0.30`). →
   **fonte única** = `policy.yaml` + CSV real; alinhar o texto dos slides aos limites versionados.

> **Decisão (fonte única, P6):** `policy.yaml` + `german_credit_data.csv` governam L1 (console) **e** L2 (notebook).
> Nenhum número vive hardcoded divergente; o slide cita o que L2 computa. L1 e L2 **não podem divergir** (teste de cross-check).

## Como cada dimensão atinge "excepcional"
- **DQ (25%)** — 3 métricas com **limite operacional** em `policy.yaml` e **conexão causal** com o viés (P5: completude é representacional, não % de não-nulos). Evidência no notebook.
- **Mitigação (30%)** — 2 ações na **raiz do dataset** (não regra de negócio): imputação group-aware (MNAR) + Kamiran–Calders; **a ordem importa**; trade-off numérico (AUC↓ medível). SMOTE preterido com justificativa.
- **Validation (30%)** — **gate que bloqueia** (cláusula suspensiva, `raise GateBlocked`), contrato Pandera versionado, PR-blocker no CI, RACI, escolha normativa (paridade × calibração) explícita. Determinístico (P3).
- **Formatação (15%)** — 3 slides, tom "Plano de Ação", design system allla.
