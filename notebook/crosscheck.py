"""crosscheck.py — porta o fairgate-engine.js (determinístico) para Python puro (stdlib)
e prova que L1 (console JS) e L2 (Python) NÃO divergem sobre o german_credit_data.csv real
e a mesma policy.yaml. Sem dependências. Rode:  python notebook/crosscheck.py

Mesma matemática do motor JS: featurização padronizada, LogReg por gradiente (init=0, lr=0.32,
l2=0.004, 280 iters), split por índice (i%4==0=teste), Kamiran-Calders, imputação estratificada.
"""
import csv, json, math, os, sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, "german_credit_data.csv")
YAML = os.path.join(ROOT, "policy.yaml")

SAVING = ["little", "moderate", "quite_rich", "rich"]
CHECK = ["little", "moderate", "rich"]
HOUSING = ["own", "rent", "free"]
PURPOSE = ["car", "radio/TV", "furniture/equipment", "business", "education", "repairs", "vacation/others", "domestic appliances"]


def sigmoid(z):
    return 1.0 / (1.0 + math.exp(-z))


# ---- policy.yaml (parser mínimo, mesmo subconjunto do build-policy.mjs) ----
def load_policy(path):
    pol, cur = {}, None
    for raw in open(path, encoding="utf-8"):
        line = raw.rstrip("\n")
        line = line.split(" #")[0] if " #" in line else (("" if line.lstrip().startswith("#") else line))
        if line.strip() == "":
            continue
        indent = len(line) - len(line.lstrip())
        t = line.strip()

        def coerce(v):
            v = v.strip()
            if v == "":
                return v
            try:
                return int(v)
            except ValueError:
                pass
            try:
                return float(v)
            except ValueError:
                return v.strip("'\"")
        if indent == 0:
            if ":" in t:
                k, _, v = t.partition(":")
                if v.strip() == "":
                    cur = k.strip(); pol[cur] = {}
                else:
                    pol[k.strip()] = coerce(v); cur = None
        elif cur is not None:
            if t.startswith("- "):
                if not isinstance(pol[cur], list):
                    pol[cur] = []
                pol[cur].append(coerce(t[2:]))
            elif ":" in t:
                if not isinstance(pol[cur], dict):
                    pol[cur] = {}
                k, _, v = t.partition(":")
                pol[cur][k.strip()] = coerce(v)
    return pol


# ---- dados reais ----
def load_real():
    rows = []
    with open(CSV, encoding="utf-8") as f:
        r = csv.reader(f)
        next(r)  # header
        for i, c in enumerate(r):
            if not c:
                continue
            age = int(c[1])
            sav = "quite_rich" if c[5] == "quite rich" else c[5]
            rows.append({
                "id": i, "sex": c[2], "age": age, "age_lt_25": age < 25,
                "job": int(c[3]), "housing": c[4], "saving_account": sav,
                "checking_account": c[6], "credit_amount": int(c[7]),
                "duration": int(c[8]), "purpose": c[9], "risk": c[10],
            })
    return rows


# ---- featurização (idêntica ao JS) ----
def featurize(rows, use_flags):
    cats = {"saving_account": SAVING + ["NA"], "checking_account": CHECK + ["NA"], "housing": HOUSING, "purpose": PURPOSE}
    mean, std = {}, {}
    for k in ("duration", "credit_amount", "job"):
        xs = [r[k] for r in rows]
        m = sum(xs) / len(xs)
        v = sum((x - m) ** 2 for x in xs) / len(xs)
        mean[k] = m; std[k] = math.sqrt(v) or 1.0
    X, y = [], []
    for r in rows:
        f = [(r["duration"] - mean["duration"]) / std["duration"],
             (r["credit_amount"] - mean["credit_amount"]) / std["credit_amount"],
             (r["job"] - mean["job"]) / std["job"]]
        for c in cats:
            for lv in cats[c]:
                f.append(1.0 if r[c] == lv else 0.0)
        if use_flags:
            f.append(1.0 if r.get("saving_was_missing") else 0.0)
            f.append(1.0 if r.get("checking_was_missing") else 0.0)
        X.append(f); y.append(1 if r["risk"] == "good" else 0)
    return X, y


def split(rows):
    tr, te = [], []
    for i in range(len(rows)):
        (te if i % 4 == 0 else tr).append(i)
    return tr, te


def train_logreg(X, y, idx_tr, weights):
    iters, lr, l2 = 280, 0.32, 0.004
    d = len(X[0]); w = [0.0] * d; b = 0.0
    wsum = sum((weights[i] if weights else 1.0) for i in idx_tr)
    for _ in range(iters):
        gw = [0.0] * d; gb = 0.0
        for i in idx_tr:
            sw = weights[i] if weights else 1.0
            xi = X[i]; z = b
            for j in range(d):
                z += w[j] * xi[j]
            err = (sigmoid(z) - y[i]) * sw
            for j in range(d):
                gw[j] += err * xi[j]
            gb += err
        for j in range(d):
            w[j] -= lr * (gw[j] / wsum + l2 * w[j])
        b -= lr * (gb / wsum)
    return w, b


def predict_proba(w, b, xi):
    z = b
    for j in range(len(xi)):
        z += w[j] * xi[j]
    return sigmoid(z)


def auc(scores, labels):
    pos = [s for s, l in zip(scores, labels) if l == 1]
    neg = [s for s, l in zip(scores, labels) if l == 0]
    if not pos or not neg:
        return 0.5
    win = 0.0
    for p in pos:
        for n in neg:
            win += 1.0 if p > n else (0.5 if p == n else 0.0)
    return win / (len(pos) * len(neg))


def probe(rows, weights, use_flags):
    X, y = featurize(rows, use_flags)
    tr, te = split(rows)
    w, b = train_logreg(X, y, tr, weights)
    proba = [predict_proba(w, b, X[i]) for i in range(len(rows))]
    av = auc([proba[i] for i in te], [y[i] for i in te])

    def sel_rate(filt):
        num = den = 0.0
        for i in te:
            if not filt(rows[i]):
                continue
            sw = weights[i] if weights else 1.0
            den += sw
            if proba[i] >= 0.5:
                num += sw
        return num / den if den else 0.0
    sr = {"young": sel_rate(lambda r: r["age_lt_25"]), "old": sel_rate(lambda r: not r["age_lt_25"]),
          "female": sel_rate(lambda r: r["sex"] == "female"), "male": sel_rate(lambda r: r["sex"] == "male")}
    di_age = sr["young"] / sr["old"] if sr["old"] else 0.0
    di_sex = sr["female"] / sr["male"] if sr["male"] else 0.0
    return {"auc": av, "sr": sr, "di_age": di_age, "di_sex": di_sex,
            "dpd_age": abs(sr["old"] - sr["young"]), "dpd_sex": abs(sr["male"] - sr["female"])}


def wshare(rows, weights, filt):
    num = den = 0.0
    for i, r in enumerate(rows):
        w = weights[i] if weights else 1.0
        den += w
        if filt(r):
            num += w
    return num / den if den else 0.0


def bad_rate(rows, weights, filt):
    num = den = 0.0
    for i, r in enumerate(rows):
        if not filt(r):
            continue
        w = weights[i] if weights else 1.0
        den += w
        if r["risk"] == "bad":
            num += w
    return num / den if den else 0.0


def metrics(rows, pol, weights):
    cov_y = wshare(rows, weights, lambda r: r["age_lt_25"])
    cov_f = wshare(rows, weights, lambda r: r["sex"] == "female")
    min_cov = min(cov_y, cov_f)
    viol = sum((1 if r["saving_account"] == "NA" else 0) + (1 if r["checking_account"] == "NA" else 0) for r in rows)
    dom = viol / (len(rows) * 2)
    br_y = bad_rate(rows, weights, lambda r: r["age_lt_25"])
    br_o = bad_rate(rows, weights, lambda r: not r["age_lt_25"])
    q = pol["quality"]
    return {
        "completude": {"value": min_cov, "pass": min_cov >= q["coverage_min"], "covYoung": cov_y, "covFemale": cov_f},
        "consistencia": {"value": dom, "pass": dom <= q["domain_violation_max"], "violations": viol},
        "precisao": {"value": abs(br_y - br_o), "pass": abs(br_y - br_o) <= q["base_rate_gap_max"], "brY": br_y, "brO": br_o},
    }


def reweigh_weights(rows):
    n = len(rows); Pg, Py, Pgy = {}, {}, {}
    gk = lambda r: "Y" if r["age_lt_25"] else "O"
    yk = lambda r: "g" if r["risk"] == "good" else "b"
    for r in rows:
        Pg[gk(r)] = Pg.get(gk(r), 0) + 1
        Py[yk(r)] = Py.get(yk(r), 0) + 1
        Pgy[gk(r) + yk(r)] = Pgy.get(gk(r) + yk(r), 0) + 1
    return [(Pg[gk(r)] * Py[yk(r)]) / (n * Pgy[gk(r) + yk(r)]) for r in rows]


def coverage_weights(rows, target=0.31):
    n = len(rows); s = sum(1 for r in rows if r["age_lt_25"]) / n
    k = (target * (1 - s)) / ((1 - target) * s)
    w = [k if r["age_lt_25"] else 1.0 for r in rows]
    m = sum(w) / n
    return [x / m for x in w]


def mitigation_weights(rows, target=0.31):
    wkc = reweigh_weights(rows); n = len(rows)
    s = sum(1 for r in rows if r["age_lt_25"]) / n
    k = (target * (1 - s)) / ((1 - target) * s)
    w = [wkc[i] * (k if r["age_lt_25"] else 1.0) for i, r in enumerate(rows)]
    m = sum(w) / n
    return [x / m for x in w]


def sweep_weights(rows, lam):
    wc = coverage_weights(rows); wm = mitigation_weights(rows)
    return [c + lam * (wm[i] - c) for i, c in enumerate(wc)]


def impute_stratified(rows):
    def group_mode(col):
        tally = {}
        for r in rows:
            if r[col] == "NA":
                continue
            g = r["sex"] + "|" + ("Y" if r["age_lt_25"] else "O")
            tally.setdefault(g, {})[r[col]] = tally.setdefault(g, {}).get(r[col], 0) + 1
        return {g: max(d, key=d.get) for g, d in tally.items()}
    ms, mc = group_mode("saving_account"), group_mode("checking_account")
    out = []
    for r in rows:
        g = r["sex"] + "|" + ("Y" if r["age_lt_25"] else "O")
        nr = dict(r)
        nr["saving_was_missing"] = r["saving_account"] == "NA"
        nr["checking_was_missing"] = r["checking_account"] == "NA"
        if r["saving_account"] == "NA":
            nr["saving_account"] = ms.get(g, "little")
        if r["checking_account"] == "NA":
            nr["checking_account"] = mc.get(g, "little")
        out.append(nr)
    return out


def gate_status(rows, pol, weights, use_flags):
    m = metrics(rows, pol, weights); p = probe(rows, weights, use_flags)
    fa, qa = pol["fairness"], pol["quality"]
    checks = [
        m["completude"]["pass"], m["consistencia"]["pass"], m["precisao"]["pass"],
        p["di_age"] >= fa["disparate_impact_min"],
        p["dpd_age"] <= fa["demographic_parity_diff_max"],
        p["di_sex"] >= fa["disparate_impact_min"],
    ]
    return ("PASS" if all(checks) else "FAIL"), m, p


def main():
    pol = load_policy(YAML)
    rows = load_real()
    print(f"N={len(rows)}  policy v{pol['version']}  DI_min={pol['fairness']['disparate_impact_min']}")

    st_raw, m_raw, p_raw = gate_status(rows, pol, None, False)
    print(f"\nCRU      gate={st_raw}  cov={m_raw['completude']['value']:.3f}  "
          f"domNA={m_raw['consistencia']['value']:.3f}  gap={m_raw['precisao']['value']:.3f}  "
          f"DI_age={p_raw['di_age']:.3f}  AUC={p_raw['auc']:.3f}")

    imp = impute_stratified(rows)
    min_pass = None  # menor lambda que passa o gate INTEIRO (P4)
    for s in range(11):
        lam = s / 10.0
        st, mm, pp = gate_status(imp, pol, sweep_weights(imp, lam), True)
        if st == "PASS" and min_pass is None:
            min_pass = lam
    w = sweep_weights(imp, min_pass if min_pass is not None else 1.0)
    st_mit, m_mit, p_mit = gate_status(imp, pol, w, True)
    print(f"MITIGADO gate={st_mit}  lambda*={min_pass}  cov={m_mit['completude']['value']:.3f}  "
          f"domNA={m_mit['consistencia']['value']:.3f}  gap={m_mit['precisao']['value']:.3f}  "
          f"DI_age={p_mit['di_age']:.3f}  AUC={p_mit['auc']:.3f}")

    # ---- CROSS-CHECK contra o golden do motor JS (gerado por js_golden.mjs) ----
    gpath = os.path.join(ROOT, "notebook", ".golden.json")
    if not os.path.exists(gpath):
        print("\n[aviso] .golden.json ausente — rode `node notebook/js_golden.mjs` primeiro.")
        sys.exit(2)
    g = json.load(open(gpath, encoding="utf-8"))

    def cmp(label, py, js, tol):
        ok = abs(py - js) <= tol
        print(f"  [{'OK ' if ok else 'XX '}] {label:28s} py={py:.6f}  js={js:.6f}  d={abs(py-js):.2e}")
        return ok

    print("\n==== CROSS-CHECK L1(JS golden) vs L2(Python) ====")
    ok = True
    ok &= (len(rows) == g["n"]); print(f"  [{'OK ' if len(rows)==g['n'] else 'XX '}] N == {g['n']}")
    ok &= (st_raw == g["raw"]["gate"]); print(f"  [{'OK ' if st_raw==g['raw']['gate'] else 'XX '}] gate cru == {g['raw']['gate']}")
    ok &= (st_mit == g["mit"]["gate"]); print(f"  [{'OK ' if st_mit==g['mit']['gate'] else 'XX '}] gate mitigado == {g['mit']['gate']}")
    ok &= (min_pass == g["min_pass_lambda"]); print(f"  [{'OK ' if min_pass==g['min_pass_lambda'] else 'XX '}] minPassLambda == {g['min_pass_lambda']}")
    # métricas determinísticas de dado: igualdade quase-exata
    ok &= cmp("cobertura jovem (cru)", m_raw["completude"]["covYoung"], g["raw"]["cov_young"], 1e-9)
    ok &= cmp("violacao NA (cru)", m_raw["consistencia"]["value"], g["raw"]["dom_na"], 1e-9)
    ok &= cmp("gap taxa-base (cru)", m_raw["precisao"]["value"], g["raw"]["gap"], 1e-9)
    ok &= cmp("cobertura jovem (mit)", m_mit["completude"]["covYoung"], g["mit"]["cov_young"], 1e-6)
    ok &= cmp("gap taxa-base (mit)", m_mit["precisao"]["value"], g["mit"]["gap"], 1e-6)
    # sonda LogReg (mesma matemática): igualdade a ~1e-3
    ok &= cmp("DI_age sonda (cru)", p_raw["di_age"], g["raw"]["di_age"], 2e-3)
    ok &= cmp("AUC sonda (cru)", p_raw["auc"], g["raw"]["auc"], 2e-3)
    ok &= cmp("DI_age sonda (mit)", p_mit["di_age"], g["mit"]["di_age"], 2e-3)
    ok &= cmp("AUC sonda (mit)", p_mit["auc"], g["mit"]["auc"], 2e-3)

    print(f"\n>>> {'CROSS-CHECK OK -- L1 e L2 NAO divergem' if ok else 'DIVERGENCIA -- investigar'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
