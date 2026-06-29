# fairgate — Console do Operador · Plano de Construção

> Artefato Tecnológico · Inteli MBA Módulo 2 (Eletiva **Data Engineering**) · ecossistema **allla.ai**.
> Stack: **página única HTML/CSS/JS standalone** (abre por duplo-clique; deploy estático trivial).
> Dados: **german_credit_data.csv real (1000 linhas)** embutido como JS no build.
> Motor: `fairgate-engine.js` (determinístico, sem deps) — reusado e adaptado.
> Loop de excelência: planeje → verifique → implemente → observe → critique → repita (alvo god-mode/tesla).

## Tese (inviolável)
"O viés não é defeito do modelo — é defeito do **dado**." Um **data contract executável** (gate)
que **bloqueia** o treino enviesado na ingestão — não recomenda, **bloqueia** (cláusula suspensiva).

## Verdade dos dados reais (verificada via `_handoff_ref/fairgate-engine.js`)
- N=1000 · bad global 30,0% · feminino 31% · jovem<25 14,9%.
- bad jovem<25 **40,9%** vs ≥25 **28,1%** → gap **12,8 p.p.** (> limite 10).
- NA saving+checking **28,8%** (> limite 5%). cobertura jovem<25 **14,9%** (< 30%).
- DI do probe **já passa cru** (0,966 ≥ 0,80): o probe exclui sexo/idade; nos dados reais a
  injustiça mora na **representação** e nos **rótulos**, não num único número de DI. ← lição mais forte.
- **Arco**: cru → FAIL (completude · consistência · precisão) ; mitigado → PASS.
- **Mitigação**: imputação estratificada (zera NA, +flag) + cobertura (jovem→31%) + reponderação
  Kamiran–Calders. O gap de taxa-base cai monotônico com λ; **λ mínimo que passa o gate inteiro = 0,30**
  (AUC 0,762 — menor custo). → corrigir `chosen` para "min λ que passa TODO o gate" (P4: nunca afrouxar limite).

## As 7 estações (a Trilha · Data Engineering)
1. **Ingestão & mapeamento** (FR-1) — deriva sexo · idade<25; disparidade na taxa-base crua.
2. **Métricas de Data Quality** (FR-2, 25%) — 3 dos 6 pilares (Completude · Consistência · Precisão).
3. **Contrato de schema executável** (FR-3) — Pandera, 7 checagens versionadas, WARNING/BLOCKER, CI.
4. **Gate de fairness** (FR-4, espinha) — 3 camadas (contrato · fairness · regressão); veredito determinístico.
5. **Mitigação de viés** (FR-5/6, 30%) — 2 ações + trade-off; a ordem importa.
6. **Regressão de justiça** (FR-7) — verde só após reexecutar; aprendizado unidirecional (P4).
7. **Trade-off** (FR-8) — fronteira de Pareto acurácia × justiça (clicável).

## Pedagogia (copiada e aprimorada do Vitaliza — `lib/trilha` + `components/trilha`)
- **Taxonomia de Bloom** por estação (Entender→Analisar→Aplicar→Avaliar→Criar).
- **Scaffolding decrescente** (muito apoio no começo, menos no fim).
- **Check formativo predict-first** por estação (múltipla escolha + feedback por opção, sem punição).
- **Progresso** em `sessionStorage` (degrada sem quebrar) + **modo tour** + **"aprofundar"** por estação.
- **Capstone** = certificado `dataset_aprovado` **imprimível** com proveniência (policy#hash · seed · DI · DPD · AUC).
- Painel direito "A trilha ensina · 4 movimentos" (porquê+trade-off · alternativa · conexão longitudinal · pergunta provocativa).

## Princípios de arquitetura (P1–P7, do design)
- P1 cláusula suspensiva (bloqueia, não recomenda) · P3 diagnóstico heurístico, **veredito determinístico** ·
  P4 aprendizado unidirecional (divergência corrige dado/contrato, nunca o limite) ·
  P6 veredito sem proveniência é inválido · P7 subgrupos nomeáveis para veredito legível.

## Estrutura de arquivos (alvo)
```
Artefatos/
  index.html              # console (recria o .dc.html em DOM real)
  app.js                  # render + interação (substitui DCLogic) — globais, sem módulos (file://)
  fairgate-engine.js      # motor determinístico (reusado + real-data + chosen corrigido + domínios reais)
  data/german-credit.js   # window.GERMAN_CREDIT = 1000 linhas reais (gerado do CSV)
  styles/fairgate.css      # estilos do console
  styles/tokens/*.css       # tokens allla (colors/fonts/typography/spacing)
  trilha/missions.js       # 7 estações: Bloom + objetivo + instrução + check (fonte única)
  tests/engine.test.mjs    # testes do motor (arco, determinismo, métricas) — node --test
  docs/PLAN.md · docs/SPEC.md · docs/DECISIONS.md
  scripts/build-data.mjs   # CSV real -> data/german-credit.js
  README.md
```

## Slices (cada uma: plano→implementa→verifica) — STATUS
- **S0 Fundação** ✅ skeleton, base real embutida, motor adaptado, 6 testes verdes (arco/determinismo).
- **S1 Console** ✅ index.html + app.js recriando o design; 7 estações; arco BLOCKED→APPROVED verificado via DOM.
- **S2 Pedagogia** ✅ Bloom, scaffolding, station-checks predict-first (modal), progresso (sessionStorage), tour, aprofundar.
- **S3 Capstone** ✅ certificado `dataset_aprovado` imprimível + @media print.
- **S4 God-mode** ✅ reduced-motion, a11y inicial (aria/foco/Esc), responsivo, toggle Real↔Sintético, controle de DI editável; header 107→62px.
- **S5 Verificar** ✅ testes 6/6 ✓; docs+ADRs+README ✓; **2 revisões adversariais aplicadas** (0 CRITICAL;
  HIGH/MEDIUM/LOW válidos corrigidos — guarda modal, fallback base vazia, a11y: foco/teclado/landmarks/SVG/
  contraste). Gap pedagógico corrigido: `instruction` (guide-rail) agora surfaçada + adaptativa à fonte.

## Retomada (decisões consolidadas) — STATUS
- **Rubrica primeiro** ✅ lida (Barema Excelência: DQ 25% · Mitigação 30% · Validation 30% · Formatação 15%);
  mapa em `docs/RUBRICA.md`; 3 inconsistências dos slides flagradas (jovem 19%→14,9% · pesos · limites).
- **Fonte única** ✅ `policy.yaml` → `data/policy.js` (L1) + leitura direta (L2); teste de cross-check no `node --test`.
- **L2 Marimo** ✅ `notebook/fairgate.py` (EDA + Pandera + gate + mitigação) + `crosscheck.py` (L1==L2 **bit-idêntico**)
  + `js_golden.mjs` + `fairgate.html` exportado + venv.
- **Tutor 3 camadas** ✅ `api/tutor.js` (DeepSeek **ao vivo** server-side + fallback) + cliente (offline). P3 respeitado.
- **GitHub** ✅ https://github.com/igorregoir-lgtm/fairgate · **Vercel** ✅ https://fairgate-eight.vercel.app (tutor LLM live).
- **Fix λ** ✅ minPassLambda=0.30 (harness + golden).

## Estado: convergido (nível tesla/god-mode), dual-layer + tutor + repo público
## Pendências (recomendadas)
- **Rotacionar a chave DeepSeek** (foi exposta) e atualizar a env var na Vercel.
- **Alinhar os 3 slides** ao dado real (14,9%) e aos pesos da rubrica (25/30/30/15) — ver `docs/RUBRICA.md`.
- Screenshot do preview travou nesta sessão (limitação da ferramenta — validado por medição/eval).

## Honestidade (sem overclaim)
- Dataset real, porém pequeno (1000); o probe é uma **sonda** (LogReg), não o modelo final.
- Limite DI 0,80 = "regra dos 80%" (EUA) — escolha normativa de Risco/Jurídico (pergunta provocativa).
- Veredito determinístico; diagnóstico pode ser heurístico (P3).
```
