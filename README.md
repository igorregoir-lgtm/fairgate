# fairgate — Console do Operador

**Data contract executável que bloqueia o treino enviesado.** Artefato Tecnológico do
**Inteli MBA · Módulo 2 (Eletiva Data Engineering)**, no ecossistema **allla.ai · intelligence applied**.

> **🔗 Site publicado:** https://fairgate-eight.vercel.app

> **Tese:** o viés não é defeito do modelo — é defeito do **dado**. O fairgate é um *gate*
> (cláusula suspensiva) que, na ingestão e **antes do treino**, mede qualidade e justiça sobre o
> **German Credit real (1.000 linhas)** e **bloqueia** o dataset enviesado. Não recomenda — bloqueia.

## Como abrir
Sem instalação, sem build, sem servidor:

1. **Duplo-clique** em `index.html` (abre direto no navegador), **ou**
2. Servidor estático local (recomendado para evitar restrições de `file://` em alguns navegadores):
   ```bash
   node scripts/serve.mjs 4178      # http://localhost:4178
   ```

Funciona offline. Tudo é determinístico (mesma entrada → mesmo veredito).

## O que é
Uma **tela única** (Console do Operador, 1440×900) que percorre a **Trilha de Data Engineering** em
**7 estações**, cada uma ancorada num requisito (FR) e numa aula:

| # | Estação | Bloom | FR | Aula |
|---|---------|-------|----|------|
| 1 | Ingestão & mapeamento | Entender | FR-1 | 1–2 · Pipeline |
| 2 | Métricas de Data Quality | Analisar | FR-2 (25%) | 4 · 6 Pilares |
| 3 | Contrato de schema executável | Aplicar | FR-3 | 7 · Data Validation |
| 4 | **Gate de fairness** (a espinha) | Avaliar | FR-4 | 5–6 · Viés & Fairness |
| 5 | Mitigação de viés | Aplicar | FR-5/6 (30%) | 6 · Mitigação |
| 6 | Regressão de justiça | Avaliar | FR-7 | 7 · Validação contínua |
| 7 | Trade-off (fronteira de Pareto) | Criar | FR-8 | 6 · Pareto |

**Arco**: dado cru → **GATE BLOCKED** (cobertura, consistência e gap de taxa-base reprovam) →
imputação estratificada + reponderação Kamiran–Calders → reexecução → **DATASET APROVADO** (certificado
imprimível com proveniência: `policy#hash · seed · DI · DPD · AUC`).

## Pedagogia (Trilha de Aprendizado)
Copiada e aprimorada da Trilha do produto **Vitaliza** (Módulo 2): **taxonomia de Bloom**,
**scaffolding decrescente**, **check formativo predict-first** (quiz por estação, com feedback por
opção, sem punição), **progresso** (`sessionStorage`), **modo tour**, **"aprofundar"** por estação, e o
**capstone** (certificado `dataset_aprovado`). Painel direito "A trilha ensina · 4 movimentos":
porquê+trade-off · caminho alternativo · conexão longitudinal (FIDC / motor trabalhista allla) ·
pergunta provocativa.

## Verdade dos dados reais (e por que importa)
No **German Credit real**, o **DI do probe já passa cru** (0,966 ≥ 0,80) — porque a sonda **exclui**
sexo/idade. A injustiça mora na **representação** (jovem<25 = 14,9%, abaixo de 30%) e nos **rótulos**
(gap de taxa-base 12,8 p.p.), não num único número de DI. O gate bloqueia mesmo assim — a lição é que
**fairness é multidimensional**. O toggle **REAL ↔ SINTÉTICO** mostra o contraste: no modo
sintético-estresse o NA é proxy forte de idade e o **gate de fairness (DI) reprova** dramaticamente.

## Estrutura
```
index.html              # console (recria o protótipo Claude Design em DOM real)
app.js                  # render + interação (substitui o DCLogic do protótipo)
fairgate-engine.js      # motor determinístico, sem deps (reusado do handoff + adaptado)
data/german-credit.js   # 1.000 linhas reais embutidas (geradas do CSV)
trilha/missions.js      # 7 estações: Bloom + objetivo + scaffolding + check (fonte única)
styles/fairgate.css     # console (tokens allla)
styles/tokens/*.css     # design system allla (colors/fonts/typography/spacing)
tests/engine.test.mjs   # testes do motor (arco, determinismo, métricas) — node --test
scripts/build-data.mjs  # CSV real -> data/german-credit.js
scripts/serve.mjs       # servidor estático mínimo p/ preview
docs/                   # PLAN.md · SPEC.md · DECISIONS.md
```

## Testes
```bash
node --test              # 6 testes: base real, métricas, ARCO, determinismo, proveniência, sintético
node scripts/build-data.mjs   # regenera data/german-credit.js a partir do CSV
```

## Honestidade (sem overclaim)
- Dataset **real**, mas pequeno (1.000 linhas); o probe é uma **sonda** (LogReg determinística), não o
  modelo de crédito final — é o **instrumento de medição** do gate.
- O limite **DI ≥ 0,80** é a "regra dos 80%" (EUA): escolha **normativa** de Risco/Jurídico, editável no
  console (a pergunta provocativa "qual número você assinaria sob LGPD?" é interativa).
- **Diagnóstico** pode ser heurístico; o **veredito é determinístico** (P3) e carrega proveniência (P6).

## Invariantes de arquitetura
P1 cláusula suspensiva (bloqueia, não recomenda) · P3 diagnóstico heurístico, veredito determinístico ·
P4 aprendizado unidirecional (a divergência corrige dado/contrato, **nunca** afrouxa o limite) ·
P6 veredito sem proveniência é inválido · P7 subgrupos nomeáveis para veredito legível.

— Detalhes em [`docs/SPEC.md`](docs/SPEC.md) e [`docs/DECISIONS.md`](docs/DECISIONS.md).
