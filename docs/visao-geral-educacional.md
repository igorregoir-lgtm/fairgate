# fairgate — visão geral do modelo educacional

> Documento de orientação (plain language). Complementa as decisões formais em [DECISIONS.md](DECISIONS.md)
> (ADR-014→017) e a pesquisa/auditorias em [analysis/feynman-trilha.md](analysis/feynman-trilha.md).

## 1. O que é o fairgate

Um **console educacional standalone** (HTML/CSS/JS, sem framework, abre por duplo-clique, funciona offline).
Tem **dois lados**:

- **O domínio que ensina:** antes de um modelo de IA decidir **quem recebe crédito**, é preciso auditar se
  os **dados são justos** com todos os grupos (sem viés por idade, sexo etc.) e **bloquear** a base se houver
  injustiça — em vez de só sinalizar. O coração difícil é um **gate de justiça determinístico** que emite (ou
  não) o artefato `dataset_aprovado`.
- **A camada educacional (a Trilha):** um caminho de **7 estações** que ensina o aluno a fazer essa auditoria.

## 2. A ideia central (a "virada")

O fairgate **gateia o APRENDIZADO do aluno com a mesma disciplina honesta com que gateia o DADO**. Assim como
não deixa dado injusto passar sem prova, não deixa o aluno "aprendeu" sem prova — e usa o **tutor de IA como
multiplicador de ensino, nunca como juiz**. Essa coerência estrutural (dado ↔ aprendizado) é o efeito allla.

## 3. O modelo educacional — os 6 levers (cada um ancorado em evidência)

Cada estação sobe um degrau de **Bloom** (Entender → … → Criar) e tem instrução (que diminui ao longo da
trilha), um check formativo e o tutor.

| # | Lever | O que é | Evidência (fonte reputada) |
|---|---|---|---|
| 1 | **Check predict-first** | Você **aposta** antes de ver a resposta; toda opção tem feedback | Prática de recuperação = alta utilidade (Dunlosky et al. 2013, PSPI) |
| 2 | **Calibração + hipercorreção** | Você declara **confiança** antes de revelar | Erro de alta confiança é onde mais se corrige (Butterfield & Metcalfe 2001) |
| 3 | **Gate de maestria** | Só ganha `aprendizado_consolidado` acertando tudo; errou → bloqueia + refaz | Mastery learning, d≈0,67 |
| 4 | **Auto-explicação** | Você **escreve com suas palavras** e compara com um modelo (sem nota) | Auto-explicação g≈0,55 (Bisra 2018); ilusão de profundidade explicativa (Rozenblit & Keil 2002) |
| 5 | **Tutor multiplicador** | Explica · pergunta (socrático) · reage — **nunca julga** | Tutor 1:1 ≈ maiores ganhos (Bloom 2σ; VanLehn 2011; Kestin 2024; AutoTutor ~0,8σ) |
| 6 | **A Escalada** | Gráfico da sua jornada: confiança × acerto em cada degrau Bloom | Espelho da proveniência do dado, aplicado ao aprendiz |

## 4. O princípio de honestidade (o que blinda tudo) — "quem corrige o quê"

- **O código determinístico corrige o gate** (sabe a resposta certa). **Você se corrige** na auto-explicação.
  **O tutor ensina**, nunca julga — invariante **P3**: o tutor jamais toca o veredito.
- **Texto livre nunca é avaliado por máquina.** Offline, o tutor degrada para texto autorado (nunca finge).
- **Sem exagero:** reivindica-se a **estrutura** (maestria + tutor 1:1), nunca a magnitude ("+2σ" só como
  aspiração, com a ressalva de não-replicação).
- **Invariantes:** offline-first · determinístico · CSP estrita (delegação `data-act`, zero handler inline) ·
  fonte única (`policy.yaml`; L1 console ≡ L2 notebook) · estado de aprendizado só de sessão.

## 5. Mapa de arquitetura (onde cada coisa vive)

| Arquivo | Papel |
|---|---|
| `app.js` | Motor de UI: estado `S`, `render()` por innerHTML, delegação `data-act`; check 3-fases, gate de aprendizado, auto-explicação, tutor (3 modos), A Escalada |
| `trilha/missions.js` | **Fonte única da pedagogia**: `STATIONS`, `CONSOLIDATION` (+`modelAnswer`), `SOCRATIC` |
| `api/tutor.js` | Tutor LLM (3 camadas: LLM → fallback servidor → offline determinístico); modos `socratic`/`react`; P3 inviolável |
| `notebook/` | L2 (Marimo) + `crosscheck.py` (prova bit-a-bit que L1≡L2) |
| `tests/trilha.test.mjs` | Contrato da pedagogia + teste-de-fonte P3 + segurança do escape HTML |
| `docs/DECISIONS.md` | ADRs (decisões); `docs/analysis/feynman-trilha.md` (evidência + auditorias) |

## 6. Como reusar em outro artefato educacional allla

Há um **candidato a standard transversal** destilado (no vault allla, `outputs/reports/`) com a receita
completa de adoção + o contrato de dados. Em uma frase: *defina N estações Bloom; escreva checks predict-first;
adicione calibração; faça a prova de consolidação emitir `<dominio>_consolidado` espelhando o gate de domínio;
ligue o tutor em 3 modos (P3); adicione auto-explicação + A Escalada; nunca avalie texto livre por máquina.*

> **Em uma frase:** uma trilha que **testava reconhecimento** virou uma **máquina de aprendizado que prova
> maestria, faz você produzir, usa o tutor de IA como multiplicador (nunca juiz) e te mostra a sua própria
> escalada cognitiva** — tudo honesto, offline, e provado por auditoria adversarial.
