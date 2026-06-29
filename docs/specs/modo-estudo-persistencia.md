# Spec — "Modo Estudo": persistência local (DESENHO revisado, pré-implementação)

> Status: **APROVADO e IMPLEMENTADO** (2026-06-29) — versão completa (Leitner), conforme escolha do dono.
> Ver ADR-018 em `../DECISIONS.md`, `study.js` (lógica pura) e `tests/study.test.mjs`. Decisão: memória **só no
> dispositivo** (localStorage, anônimo, offline), **modo estudo opt-in coexistindo** com a demo reset-on-load.
> **Revisão adversarial (3 lentes)** concluiu: desenho sólido, mas **simplificar primeiro** — o agendador
> espaçado (Leitner) é superdimensionado para uma demo de sessão única e re-mostrar a MESMA múltipla escolha
> é reconhecimento, não recall. Esta versão reflete o desenho revisado.

## 1. A decisão (proposta de ADR-018)
**Contexto.** A Trilha esquece tudo a cada carga, de propósito (demo-honesto). Isso bloqueia o aluno que
**volta** de reencontrar onde parou e a própria Escalada. A revisão espaçada (Dunlosky — alta utilidade) só
rende com retorno multi-dia, que é a minoria numa demo; e exigiria recall generativo, não a MC fixa.
**Decisão.** **Fase 1 — persistência simples opt-in.** Sob opt-in, o site lembra **neste dispositivo** o que o
aluno **já fez** (estações concluídas + a calibração da Escalada), e o reencontra ao voltar. Sem agendador,
sem caixas, sem prazos. A demo (padrão) continua resetando — banca vê limpo.
**Stack.** `localStorage`, chave versionada `fairgate:estudo:v1`, **anônimo**. **Zero PII no servidor.**
**Consequência.** Reverte "session-only" **só para quem opta**; demo-honesto intacto; offline-first e gate
determinístico preservados. **Fase 2 (Leitner espaçado) fica DIFERIDA e condicional** — só se houver evidência
de retorno multi-dia, e então com recall generativo + 2–3 caixas (não a MC fixa, não 5 caixas).

## 2. O que é persistido (Fase 1)
Chave `localStorage["fairgate:estudo:v1"]` = JSON:
```js
{
  schema: 1,
  enabled: true,               // o aluno optou pelo modo estudo
  completed: [1,2,3],          // estações com check respondido (espelha S.completed)
  calib: { "1": {correct:true, conf:"alta"}, ... },   // a Escalada (confiança×acerto)
  jaConsolidouAntes: false,    // FATO HISTÓRICO neutro — NÃO é o veredito verde (ver §3)
  updatedAt: <epoch ms>
}
```
Não se persiste texto livre de auto-explicação (continua efêmero — privacidade). Todo valor lido do save é
**input não-confiável** (o usuário pode editar o localStorage): validar shape no boundary (ver §4).

## 3. Contratos de invariante (TESTÁVEIS — não prosa) — o coração da revisão
1. **Canais separados, demo-honesto à prova de código.** `loadProgress()` (sessionStorage `fairgate:trilha:v1`)
   **não é modificado** nem lê a chave nova. O modo estudo usa **só** `localStorage fairgate:estudo:v1`. Um nunca
   deriva do outro. Sem opt-in, o boot é **byte-a-byte** o atual (reseta, `S.completed=∅`, `S.learnCert=false`).
2. **Nada escreve sem opt-in.** Um guard único `persistStudy()` é **no-op** quando `!save.enabled`. Em modo demo,
   `closeCheck`/`markComplete` continuam efêmeros (só `S.calib` em memória). **Teste:** `enabled:false` ⇒ responder
   um check **não cria nem altera** `fairgate:estudo:v1`.
3. **Gate honesto preservado (o achado mais importante).** Restaurar progresso **NÃO** pode pintar verde sem
   reexecução:
   - os `completed`/`calib` restaurados alimentam **só** a Escalada e o "continuar de onde parou" — **nunca**
     semeiam `S.completed` para **destravar a Prova de Consolidação** nem marcam `S.learnCert`.
   - **`S.learnCert` começa sempre `false`** na sessão; só vira `true` quando uma **prova viva passa nesta sessão**.
   - `jaConsolidouAntes:true` é exibido como **nota neutra** ("você já consolidou antes — refaça para reemitir"),
     nunca como o selo verde. Paridade com `dataset_aprovado` (não se declara verde sem reexecução · app.js l.199).
4. **Gate determinístico intacto.** `consolNext` calcula `passed` puramente sobre as respostas do modal — não lê
   o save. A persistência não toca a matemática M/M nem o motor (L1≡L2).
5. **P3 intacto.** O modo estudo não toca o tutor nem o veredito.

## 4. Robustez no boundary (localStorage é hostil)
- `loadStudy()`: `try/catch` em `getItem`+`JSON.parse`; valida shape (objeto; `schema` number; `completed` array
  de inteiros 1..7; `calib` mapa '1'..'7'→{correct boolean, conf ∈ {alta,media,baixa}}); **corrupção ⇒ tratar
  como ausente** (caminho demo), **não apagar** (pode ser save de versão futura); `schema` > atual ⇒ ignorar.
- **Probe de disponibilidade** no boot: se `localStorage` indisponível (Safari privado, quota, `SecurityError`),
  o toggle aparece **desabilitado** com microtexto honesto ("seu navegador bloqueia memória local") — em vez de
  fingir que salvou.
- Nada do save entra em `innerHTML` sem `escHtml` (já existe, l.50).

## 5. UX (Fase 1, sem fricção)
1. **Ativar:** no rail, opção discreta "Modo estudo: lembrar meu progresso neste aparelho" (off por padrão).
   Liga → grava `enabled:true` + o estado atual.
2. **Voltar:** se `enabled`, o site restaura a Escalada e marca as estações já feitas; uma nota "bem-vindo de
   volta — seu progresso está aqui". Se `jaConsolidouAntes`, nota neutra convidando a refazer a prova.
3. **Sair/limpar:** botão "Esquecer meu progresso" apaga a chave (controle total do aluno).

## 6. Contrato de teste
- Demo intacta: sem opt-in (ou `enabled:false`), comportamento **idêntico** ao atual; **nenhuma** escrita na chave.
- Isolamento de canal: `loadProgress` não lê/escreve `fairgate:estudo:v1`.
- **Gate honesto:** restaurar `completed`/`calib`/`jaConsolidouAntes` **não** marca `passed`/`learnCert` nem
  destrava a prova por si só; `S.learnCert` só vira true após prova viva.
- Boundary: save corrompido/parse-error/shape inválido ⇒ caminho demo (sem crash); `box`/índices coeridos e clampeados.
- Opt-out apaga 100% (nenhum resíduo), inclusive em writes subsequentes da mesma sessão.

## 7. Esforço e faseamento
- **Fase 1 (esta, recomendada):** ~30–50 linhas JS + testes. Sem `schedule()`/caixas/prazos. Reusa `STATIONS`/`S.calib`.
  Entrega ~80% do valor percebido (o aluno que volta não perde a Escalada) e elimina a maior superfície de bug
  (sanitização de wall-clock, 5 caixas, "vencidos").
- **Fase 2 (DIFERIDA, condicional):** revisão espaçada — **só após evidência de retorno multi-dia**, e então com
  **recall generativo** (não a MC fixa) + 2–3 caixas + `computeDue(save, now)` defensivo a relógio retrocedido/
  saltado (cap de vencidos por sessão, `now < updatedAt` ⇒ não inundar). Registrada como gatilho de graduação.

> **Resumo do desenho revisado:** Fase 1 = persistência simples opt-in (estações + Escalada), local no
> dispositivo, **sem agendador**, com os invariantes virados **contratos testáveis** — em especial o **gate
> honesto** (progresso restaurado nunca pinta verde sem reexecução). Leitner espaçado vira Fase 2 condicional.
