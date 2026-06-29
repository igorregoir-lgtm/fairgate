# SPEC — fairgate · Console do Operador

> Especificação do Artefato Tecnológico (Inteli MBA · Módulo 2 · Eletiva Data Engineering).
> Fonte do design: handoff Claude Design `fairgate - Console do Operador.dc.html` (allla).
> Status: **implementado** (standalone HTML/CSS/JS · dados reais embutidos).

## 1. Objetivo
Demonstrar, sobre o **German Credit real**, um **data contract executável** que mede **qualidade** e
**justiça** na ingestão e **bloqueia** (cláusula suspensiva) o dataset enviesado **antes do treino**,
emitindo um artefato `dataset_aprovado` com **proveniência** apenas após reexecução verde.

## 2. Requisitos funcionais (FR) ↔ estações
- **FR-1 · Ingestão & mapeamento** — carregar o dataset, derivar atributos protegidos (`sex`, `age_lt_25`),
 expor a disparidade de taxa-base no dado cru.
- **FR-2 · Métricas de Data Quality** (rubrica 25%) — 3 dos 6 pilares (Aula 4): **Completude**
 representacional (cobertura de subgrupo, P5), **Consistência** de domínio (NA `not_known`), **Precisão**
 (gap de taxa-base + DI). Cada métrica tem **limite operacional** em `policy.yaml`.
- **FR-3 · Contrato de schema executável** — 7 checagens versionadas (Pandera), dois níveis
 (WARNING registra/segue · BLOCKER reprova/interrompe no CI como PR-blocker).
- **FR-4 · Gate de fairness** (a espinha) — 3 camadas (L1 contrato · L2 fairness · L3 regressão); treina
 uma **sonda** determinística (LogReg, seed 42) que **exclui** os atributos protegidos; mede DI/DPD e
 bloqueia se cruzar o limite. **Veredito determinístico** (P3).
- **FR-5/6 · Mitigação** (rubrica 30%) — (Ação 02) **imputação estratificada** por subgrupo + flag
 `missingness-as-signal`; (Ação 01) **reponderação Kamiran–Calders** `w(g,y)=P(g)P(y)/P(g,y)`. A **ordem
 importa**: corrigir representação antes de reponderar.
- **FR-7 · Regressão de justiça** — re-medição **obrigatória**; `dataset_aprovado` só é emitido se o gate
 voltar verde (invariante 4).
- **FR-8 · Trade-off** — **fronteira de Pareto** acurácia × justiça; o ponto escolhido respeita o limite
 com a **menor perda de acurácia**.

## 3. Política (`policy.yaml`, default)
```
version: 1
protected_attributes: [sex, age_lt_25]
quality: { coverage_min: 0.30, domain_violation_max: 0.05, base_rate_gap_max: 0.10 }
fairness: { disparate_impact_min: 0.80, demographic_parity_diff_max: 0.10 }
probe_model: { seed: 42, test_size: 0.25 }
```
`disparate_impact_min` é **editável** no console (estação 4): decisão normativa registrada (P4).

## 4. Invariantes (P1–P7)
- **P1** cláusula suspensiva — o gate **bloqueia**, não recomenda.
- **P3** diagnóstico pode ser heurístico; o **veredito é determinístico** (Python puro sobre `policy.yaml`).
- **P4** aprendizado **unidirecional** — a divergência (gate vermelho) corrige **dataset/contrato**, nunca
 afrouxa o limite; relaxar limite = decisão humana (PR + assinatura do Fairness Steward).
- **P6** veredito sem **proveniência** (`policy#hash · data#hash · seed`) é inválido.
- **P7** subgrupos **nomeáveis** (não idade contínua) para o veredito ser legível.

## 5. Verdade dos dados reais (German Credit, n=1000)
- bad global 30,0% · feminino 31% · jovem<25 14,9%.
- bad jovem<25 **40,9%** vs ≥25 **28,1%** → gap **12,8 p.p.** (> 10).
- NA (saving+checking) **28,8%** (> 5%). cobertura jovem<25 **14,9%** (< 30%).
- DI do probe **passa cru** (0,966) — a sonda exclui sexo/idade; a injustiça está na representação e nos
 rótulos. **Arco**: cru → FAIL ; mitigado (impute + reweigh @λ mínimo que passa o gate) → PASS.

## 6. Pedagogia (Trilha)
Por estação: **Bloom** (eyebrow) · **objetivo** · **instrução** com *scaffolding decrescente* (detalhada
1–2, enxuta 6–7) · **check formativo predict-first** (1 pergunta, opções com feedback, sem punição) ·
**aprofundar** (camada de fundo) · **4 movimentos** (porquê+trade-off · alternativa · conexão longitudinal ·
pergunta provocativa). **Progresso** em `sessionStorage` (degrada sem quebrar). **Modo tour** percorre as
estações em ordem. **Capstone** = certificado `dataset_aprovado` imprimível (`@media print`).

## 7. Contratos do motor (`window.FairgateEngine`)
- `dataset(source, seed, n)` — `"real"` (default, base embutida) | `"synthetic"` (estresse-de-viés).
- `metrics(rows, policy, weights)` → `{ completude, consistencia, precisao }` (value/limit/pass/detail).
- `probe(rows, weights, useMissingFlags)` → `{ auc, sr, di_age, di_sex, dpd_age, dpd_sex }` (determinística).
- `imputeStratified(rows)` · `coverageWeights` · `mitigationWeights` (KC×cobertura) · `sweepWeights(rows, λ)`.
- `runGate(rows, policy, state)` → `{ status, checks[6], failures, metrics, probe, provenance }`.
- `tradeoff(rows, policy, rawRows, steps)` → `{ points[], raw, chosen }` onde **`chosen` = menor λ que passa
 o gate INTEIRO** (não só DI/DPD) — P4.

## 8. Edge cases
- `sessionStorage` indisponível (modo privado/SSR) → `try/catch`, progresso vira no-op, nunca quebra.
- base embutida ausente → `loadReal()` retorna null → `dataset()` cai no sintético (fallback).
- `?trilha` / λ inválidos, listas vazias → zeros/[], sem `NaN` vazando para a UI.
- gate em execução (`running`) → cliques repetidos no "rodar" são ignorados (debounce por estado).
- troca de fonte ou de DI → reboot completo do estado de mitigação/gate (veredito anterior invalidado).

## 9. Não-escopo (YAGNI)
Sem login/servidor/persistência remota; sem treinar o modelo de crédito final; sem gamificação pesada;
capstone = certificado imprimível (sem PDF server-side); pt-BR apenas.
