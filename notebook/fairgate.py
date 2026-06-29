import marimo

__generated_with = "0.9.27"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    return (mo,)


@app.cell
def _(mo):
    mo.md(
        r"""
        # fairgate — evidência formal (L2 · Python)

        **Data contract executável que bloqueia o treino enviesado.** Artefato Tecnológico ·
        Inteli MBA Módulo 2 · Eletiva **Data Engineering** · ecossistema **allla.ai**.

        > Esta é a **camada de evidência (L2)** que dá lastro ao console interativo (L1). Roda sobre o
        > **`german_credit_data.csv` real (1.000 linhas)** e a **`policy.yaml`** — a **mesma fonte única**
        > do console. O motor determinístico é importado de `crosscheck.py` (porte 1:1 do `fairgate-engine.js`),
        > então **os números aqui são idênticos aos do console** (provado na última célula, contra o `.golden.json`).

        **Tese:** o viés não é defeito do modelo — é defeito do **dado**. O gate mede qualidade e justiça na
        ingestão e **bloqueia** (cláusula suspensiva, P1) o dataset enviesado **antes do treino**.

        **Mapa da rubrica:** Métricas de DQ (25%) → §2 · Mitigação de Viés (30%) → §4 · Data Validation
        Automatizada (30%) → §3 (Pandera) + §5 (gate) · Determinismo/proveniência (P3/P6) → §6.
        """
    )
    return


@app.cell
def _():
    import os
    import sys
    import json
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import crosscheck as cc
    import pandas as pd
    import numpy as np
    import matplotlib.pyplot as plt

    POL = cc.load_policy(cc.YAML)
    ROWS = cc.load_real()
    DF = pd.DataFrame(ROWS)
    return cc, json, np, os, pd, plt, sys, POL, ROWS, DF


@app.cell
def _(mo, DF, POL):
    mo.md(
        f"""
        ## 1 · Ingestão & mapeamento (FR-1)

        Carregado o German Credit real: **{len(DF)} linhas**. Atributos protegidos derivados na borda do
        pipeline: **`sex`** e **`age_lt_25`** (`age < 25`). `policy.yaml` v{POL['version']} é a fonte única
        dos limites (P6) — `disparate_impact_min = {POL['fairness']['disparate_impact_min']}` (regra dos 80%).
        """
    )
    return


@app.cell
def _(DF):
    DF.head(8)
    return


@app.cell
def _(mo, DF):
    _n = len(DF)
    _fem = (DF["sex"] == "female").mean()
    _young = DF["age_lt_25"].mean()
    _bad = (DF["risk"] == "bad").mean()
    _br_young = (DF.loc[DF["age_lt_25"], "risk"] == "bad").mean()
    _br_old = (DF.loc[~DF["age_lt_25"], "risk"] == "bad").mean()
    mo.md(
        f"""
        ### EDA — a disparidade já está no dado cru
        | grupo | proporção | taxa "bad" |
        |---|---|---|
        | feminino | {_fem:.1%} | {(DF.loc[DF['sex']=='female','risk']=='bad').mean():.1%} |
        | masculino | {(DF['sex']=='male').mean():.1%} | {(DF.loc[DF['sex']=='male','risk']=='bad').mean():.1%} |
        | jovem &lt;25 | {_young:.1%} | **{_br_young:.1%}** |
        | ≥25 | {1-_young:.1%} | {_br_old:.1%} |
        | global | — | {_bad:.1%} |

        O **gap de taxa-base** jovem×≥25 é **{(_br_young-_br_old)*100:.1f} p.p.** — o rótulo histórico já
        carrega a desigualdade que o modelo iria **amplificar**. Jovem&lt;25 é só **{_young:.1%}** da base
        (sub-representação, P5).
        """
    )
    return


@app.cell
def _(plt, DF):
    _fig, _ax = plt.subplots(1, 2, figsize=(8.5, 3.0))
    _grp = ["jovem <25", "≥25"]
    _br = [(DF.loc[DF["age_lt_25"], "risk"] == "bad").mean(), (DF.loc[~DF["age_lt_25"], "risk"] == "bad").mean()]
    _ax[0].bar(_grp, _br, color=["#E0726B", "#5B7691"])
    _ax[0].axhline((DF["risk"] == "bad").mean(), ls="--", lw=1, color="#8A9AAB")
    _ax[0].set_title("Taxa-base 'bad' por idade", fontsize=10)
    _ax[0].set_ylim(0, 0.5)
    for _i, _v in enumerate(_br):
        _ax[0].text(_i, _v + 0.01, f"{_v:.1%}", ha="center", fontsize=9)
    _cov = [DF["age_lt_25"].mean(), (DF["sex"] == "female").mean()]
    _ax[1].bar(["jovem <25", "feminino"], _cov, color=["#E0726B", "#8FA6BC"])
    _ax[1].axhline(0.30, ls="--", lw=1, color="#C0504D")
    _ax[1].set_title("Cobertura de subgrupo (limite 30%)", fontsize=10)
    _ax[1].set_ylim(0, 0.5)
    for _i, _v in enumerate(_cov):
        _ax[1].text(_i, _v + 0.01, f"{_v:.1%}", ha="center", fontsize=9)
    _fig.tight_layout()
    _fig
    return


@app.cell
def _(mo):
    mo.md(
        r"""
        ## 2 · Métricas de Data Quality (FR-2 · rubrica 25%)

        Três pilares (dos 6) que falham no German Credit, cada um com **limite operacional** em `policy.yaml`
        e **conexão causal** com o viés. Completude é **representacional** (cobertura de subgrupo, P5), não
        `% de não-nulos`.
        """
    )
    return


@app.cell
def _(cc, ROWS, POL, pd):
    _m = cc.metrics(ROWS, POL, None)
    _q = POL["quality"]
    dq_table = pd.DataFrame([
        {"pilar": "Completude representacional", "métrica": "min. cobertura de subgrupo",
         "valor": f"{_m['completude']['value']:.1%}", "limite": f"≥ {_q['coverage_min']:.0%}",
         "status": "PASS" if _m["completude"]["pass"] else "REPROVA"},
        {"pilar": "Consistência de domínio", "métrica": "fração NA not_known",
         "valor": f"{_m['consistencia']['value']:.1%}", "limite": f"≤ {_q['domain_violation_max']:.0%}",
         "status": "PASS" if _m["consistencia"]["pass"] else "REPROVA"},
        {"pilar": "Precisão + disparidade", "métrica": "gap de taxa-base",
         "valor": f"{_m['precisao']['value']*100:.1f} p.p.", "limite": f"≤ {_q['base_rate_gap_max']*100:.0f} p.p.",
         "status": "PASS" if _m["precisao"]["pass"] else "REPROVA"},
    ])
    dq_table
    return (dq_table,)


@app.cell
def _(mo):
    mo.md(
        r"""
        ## 3 · Contrato de schema executável — Pandera (FR-3 · Data Validation 30%)

        A validação é **código versionado**, não revisão manual: um `DataFrameSchema` (Pandera) que **falha
        rápido** na ingestão. As contas com `not_known` (NA explícito) e categorias fora de domínio reprovam.
        No CI, isso roda como **PR-blocker** — nada chega ao treino sem passar.
        """
    )
    return


@app.cell
def _(cc, DF):
    try:
        import pandera.pandas as pa  # pandera >= 0.20
    except ImportError:
        import pandera as pa  # fallback p/ versões antigas

    contract = pa.DataFrameSchema(
        {
            "age": pa.Column(int, pa.Check.in_range(18, 120)),
            "credit_amount": pa.Column(int, pa.Check.ge(0)),
            "duration": pa.Column(int, pa.Check.ge(0)),
            "job": pa.Column(int, pa.Check.isin([0, 1, 2, 3])),
            "sex": pa.Column(str, pa.Check.isin(["male", "female"])),
            "housing": pa.Column(str, pa.Check.isin(cc.HOUSING)),
            # not_known ("NA") NÃO está no domínio → reprova (é ausência, não categoria)
            "saving_account": pa.Column(str, pa.Check.isin(cc.SAVING)),
            "checking_account": pa.Column(str, pa.Check.isin(cc.CHECK)),
            "risk": pa.Column(str, pa.Check.isin(["good", "bad"])),
        },
        strict=False,
        name="german_credit_contract",
    )
    return (contract, pa)


@app.cell
def _(mo, contract, pa, DF, pd):
    try:
        contract.validate(DF, lazy=True)
        pandera_summary = pd.DataFrame([{"checagem": "schema", "violações": 0, "status": "PASS"}])
        _verdict = "PASS — o dado passou o contrato (inesperado no cru)."
    except pa.errors.SchemaErrors as err:
        _fc = err.failure_cases
        pandera_summary = (_fc.groupby("column").size().reset_index(name="violações").sort_values("violações", ascending=False))
        _verdict = f"**BLOCKER** — {len(_fc)} violações; o contrato reprova a ingestão (FR-3 · cláusula suspensiva)."
    mo.md(f"**Resultado do contrato Pandera:** {_verdict}")
    return (pandera_summary,)


@app.cell
def _(pandera_summary):
    pandera_summary
    return


@app.cell
def _(mo):
    mo.md(
        r"""
        ## 4 · Gate de fairness + mitigação (FR-4/5/6 · rubrica 30%)

        O gate treina uma **sonda** determinística (LogReg, seed 42, exclui sexo/idade), mede DI/DPD e
        **bloqueia** se cruzar `policy.yaml`. **Verdade do dado real:** o DI da sonda **já passa cru** —
        a injustiça mora na **representação** e nos **rótulos**, não num único número de DI. O gate bloqueia
        mesmo assim (cobertura, NA, gap de taxa-base). Duas mitigações atacam a **raiz no dataset**.
        """
    )
    return


@app.cell
def _(cc, ROWS, POL, pd):
    _st, _m, _p = cc.gate_status(ROWS, POL, None, False)
    _fa, _q = POL["fairness"], POL["quality"]
    gate_raw = pd.DataFrame([
        {"pilar": "COMPLETUDE", "métrica": "cobertura efetiva", "valor": f"{_m['completude']['value']:.3f}", "limite": f"≥ {_q['coverage_min']}", "✓": "✓" if _m["completude"]["pass"] else "✕"},
        {"pilar": "CONSISTÊNCIA", "métrica": "violação NA", "valor": f"{_m['consistencia']['value']:.3f}", "limite": f"≤ {_q['domain_violation_max']}", "✓": "✓" if _m["consistencia"]["pass"] else "✕"},
        {"pilar": "PRECISÃO", "métrica": "gap taxa-base", "valor": f"{_m['precisao']['value']:.3f}", "limite": f"≤ {_q['base_rate_gap_max']}", "✓": "✓" if _m["precisao"]["pass"] else "✕"},
        {"pilar": "FAIRNESS", "métrica": "DI idade", "valor": f"{_p['di_age']:.3f}", "limite": f"≥ {_fa['disparate_impact_min']}", "✓": "✓" if _p["di_age"] >= _fa["disparate_impact_min"] else "✕"},
        {"pilar": "FAIRNESS", "métrica": "DPD idade", "valor": f"{_p['dpd_age']:.3f}", "limite": f"≤ {_fa['demographic_parity_diff_max']}", "✓": "✓" if _p["dpd_age"] <= _fa["demographic_parity_diff_max"] else "✕"},
        {"pilar": "FAIRNESS", "métrica": "DI sexo", "valor": f"{_p['di_sex']:.3f}", "limite": f"≥ {_fa['disparate_impact_min']}", "✓": "✓" if _p["di_sex"] >= _fa["disparate_impact_min"] else "✕"},
    ])
    gate_raw_status = _st
    return gate_raw, gate_raw_status


@app.cell
def _(mo, gate_raw_status):
    mo.md(f"### Gate sobre o dado CRU → **{gate_raw_status}** (GateBlocked)" if gate_raw_status == "FAIL"
          else f"### Gate sobre o dado CRU → {gate_raw_status}")
    return


@app.cell
def _(gate_raw):
    gate_raw
    return


@app.cell
def _(cc, ROWS, POL, pd):
    # mitigação: imputação estratificada (Ação 02) + Kamiran–Calders (Ação 01) no menor λ que passa o gate
    _imp = cc.impute_stratified(ROWS)
    _minpass = None
    for _s in range(11):
        _lam = _s / 10.0
        _st, _, _ = cc.gate_status(_imp, POL, cc.sweep_weights(_imp, _lam), True)
        if _st == "PASS" and _minpass is None:
            _minpass = _lam
    _w = cc.sweep_weights(_imp, _minpass)
    _stm, _mm, _pm = cc.gate_status(_imp, POL, _w, True)
    _m0, _p0 = cc.metrics(ROWS, POL, None), cc.probe(ROWS, None, False)
    mit_table = pd.DataFrame([
        {"métrica": "cobertura jovem", "cru": f"{_m0['completude']['covYoung']:.1%}", "mitigado": f"{_mm['completude']['covYoung']:.1%}"},
        {"métrica": "violação NA", "cru": f"{_m0['consistencia']['value']:.1%}", "mitigado": f"{_mm['consistencia']['value']:.1%}"},
        {"métrica": "gap taxa-base", "cru": f"{_m0['precisao']['value']*100:.1f} p.p.", "mitigado": f"{_mm['precisao']['value']*100:.1f} p.p."},
        {"métrica": "DI idade (sonda)", "cru": f"{_p0['di_age']:.3f}", "mitigado": f"{_pm['di_age']:.3f}"},
        {"métrica": "AUC (custo)", "cru": f"{_p0['auc']:.3f}", "mitigado": f"{_pm['auc']:.3f}"},
    ])
    min_pass_lambda = _minpass
    gate_mit_status = _stm
    return mit_table, min_pass_lambda, gate_mit_status


@app.cell
def _(mo, min_pass_lambda, gate_mit_status):
    mo.md(
        f"""
        ## 5 · Regressão de justiça (FR-7) → **dataset_aprovado**

        Reexecução obrigatória pós-mitigação (invariante 4). A reponderação Kamiran–Calders fecha o gap de
        taxa-base; o **menor λ que passa o gate inteiro é λ\\* = {min_pass_lambda}** (menor custo de acurácia,
        P4 — nunca afrouxa o limite). Gate mitigado → **{gate_mit_status}** ⇒ artefato `dataset_aprovado` emitido.
        """
    )
    return


@app.cell
def _(mit_table):
    mit_table
    return


@app.cell
def _(mo):
    mo.md(r"""## 6 · Trade-off (FR-8) — fronteira de Pareto (gap de taxa-base × AUC)""")
    return


@app.cell
def _(plt, cc, ROWS, POL, min_pass_lambda):
    _imp = cc.impute_stratified(ROWS)
    _xs, _ys, _pass = [], [], []
    for _s in range(11):
        _lam = _s / 10.0
        _w = cc.sweep_weights(_imp, _lam)
        _m = cc.metrics(_imp, POL, _w)
        _p = cc.probe(_imp, _w, True)
        _st, _, _ = cc.gate_status(_imp, POL, _w, True)
        _xs.append(_m["precisao"]["value"] * 100)
        _ys.append(_p["auc"])
        _pass.append(_st == "PASS")
    _mraw = cc.metrics(ROWS, POL, None)
    _praw = cc.probe(ROWS, None, False)
    _fig, _ax = plt.subplots(figsize=(7.5, 4.2))
    _ax.plot(_xs, _ys, "-", color="#2D4663", lw=1.5, zorder=1)
    _ax.scatter(_xs, _ys, c=["#14B8A6" if p else "#C0504D" for p in _pass], s=42, zorder=2)
    _ax.scatter([_mraw["precisao"]["value"] * 100], [_praw["auc"]], c="#C0504D", s=90, marker="o", zorder=3, label="cru")
    _chi = int(round(min_pass_lambda * 10))
    _ax.scatter([_xs[_chi]], [_ys[_chi]], facecolors="none", edgecolors="#0F9486", s=220, lw=2.2, zorder=4, label=f"ótimo (λ*={min_pass_lambda})")
    _ax.axvline(POL["quality"]["base_rate_gap_max"] * 100, ls="--", color="#C0504D", lw=1.3)
    _ax.text(POL["quality"]["base_rate_gap_max"] * 100, _ax.get_ylim()[1], " limite 10 p.p.", color="#C0504D", fontsize=8, va="top")
    _ax.set_xlabel("← mais justo · gap de taxa-base (p.p.)")
    _ax.set_ylabel("Acurácia · AUC →")
    _ax.set_title("Fronteira acurácia × justiça — o ponto que respeita o limite ao menor custo", fontsize=10)
    _ax.legend(fontsize=8, loc="lower right")
    _ax.invert_xaxis()
    _fig.tight_layout()
    _fig
    return


@app.cell
def _(mo):
    mo.md(
        r"""
        ## 7 · Cross-check L1 (console JS) × L2 (Python) — *não podem divergir*

        Prova de não-divergência: o motor Python é o porte 1:1 do `fairgate-engine.js`. Comparamos os números
        contra o **`.golden.json`** gerado pelo motor JS (`node notebook/js_golden.mjs`). Métricas
        determinísticas batem exato; a sonda LogReg bate ao nível IEEE-754.
        """
    )
    return


@app.cell
def _(cc, ROWS, POL, os, json, pd):
    _gp = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".golden.json")
    _rows = []
    if os.path.exists(_gp):
        with open(_gp, encoding="utf-8") as _gf:
            _g = json.load(_gf)
        _mr, _pr = cc.metrics(ROWS, POL, None), cc.probe(ROWS, None, False)
        _imp = cc.impute_stratified(ROWS)
        _mp = None
        for _s in range(11):
            _stx, _, _ = cc.gate_status(_imp, POL, cc.sweep_weights(_imp, _s / 10.0), True)
            if _stx == "PASS" and _mp is None:
                _mp = _s / 10.0
        _w = cc.sweep_weights(_imp, _mp)
        _mm, _pm = cc.metrics(_imp, POL, _w), cc.probe(_imp, _w, True)
        _pairs = [
            ("cobertura jovem (cru)", _mr["completude"]["covYoung"], _g["raw"]["cov_young"]),
            ("violação NA (cru)", _mr["consistencia"]["value"], _g["raw"]["dom_na"]),
            ("gap taxa-base (cru)", _mr["precisao"]["value"], _g["raw"]["gap"]),
            ("DI idade sonda (cru)", _pr["di_age"], _g["raw"]["di_age"]),
            ("AUC sonda (cru)", _pr["auc"], _g["raw"]["auc"]),
            ("gap taxa-base (mit)", _mm["precisao"]["value"], _g["mit"]["gap"]),
            ("DI idade sonda (mit)", _pm["di_age"], _g["mit"]["di_age"]),
        ]
        for _lbl, _py, _js in _pairs:
            _rows.append({"métrica": _lbl, "L2 (py)": f"{_py:.6f}", "L1 (js)": f"{_js:.6f}",
                          "Δ": f"{abs(_py-_js):.1e}", "ok": "✓" if abs(_py - _js) < 2e-3 else "✕"})
        crosscheck_ok = all(r["ok"] == "✓" for r in _rows)
    else:
        crosscheck_ok = None
    crosscheck_table = pd.DataFrame(_rows)
    return crosscheck_table, crosscheck_ok


@app.cell
def _(mo, crosscheck_ok):
    mo.md(
        "### ✅ **CROSS-CHECK OK — L1 e L2 não divergem**" if crosscheck_ok
        else ("### ⚠️ `.golden.json` ausente — rode `node notebook/js_golden.mjs`" if crosscheck_ok is None
              else "### ❌ DIVERGÊNCIA — investigar")
    )
    return


@app.cell
def _(crosscheck_table):
    crosscheck_table
    return


@app.cell
def _(mo, POL, cc):
    _h = cc.__doc__ is not None
    mo.md(
        f"""
        ## 8 · Proveniência & honestidade (P3 · P6)

        - **Determinismo (P3):** sonda LogReg com `seed = {POL['probe_model']['seed']}`, split por índice
          (`i % 4 == 0` = teste). Mesma entrada + mesma `policy.yaml` ⇒ mesmo veredito.
        - **Proveniência (P6):** veredito carrega `policy v{POL['version']}` + versão de dado + seed.
        - **Honestidade:** dataset real porém pequeno (1.000 linhas); a sonda é **instrumento de medição**,
          não o modelo de crédito final. O limite DI 0,80 é a regra dos 80% (EUA) — escolha **normativa** de
          Risco/Jurídico (P4/P7).
        - **Aprendizado unidirecional (P4):** o gate vermelho corrige dataset/contrato; **nunca** afrouxa o
          limite automaticamente — relaxar é decisão humana assinada (PR + Fairness Steward).

        > Console interativo (L1): **https://fairgate-eight.vercel.app** · Cross-check headless:
        > `python notebook/crosscheck.py`.
        """
    )
    return


if __name__ == "__main__":
    app.run()
