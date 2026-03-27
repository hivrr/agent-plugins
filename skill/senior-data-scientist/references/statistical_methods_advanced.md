# Statistical Methods Advanced

Advanced statistical methods for causal inference and observational data analysis.

---

## Difference-in-Differences (DiD)

```python
import statsmodels.formula.api as smf

def diff_in_diff(df, outcome, treatment_col, post_col, controls=None):
    """
    Estimate ATT via OLS DiD with optional covariates.
    df must have: outcome, treatment_col (0/1), post_col (0/1).
    Returns the interaction coefficient (treatment × post) and its p-value.
    """
    covariates = " + ".join(controls) if controls else ""
    formula = (
        f"{outcome} ~ {treatment_col} * {post_col}"
        + (f" + {covariates}" if covariates else "")
    )
    result = smf.ols(formula, data=df).fit(cov_type="HC3")
    interaction = f"{treatment_col}:{post_col}"
    return {
        "att":     result.params[interaction],
        "p_value": result.pvalues[interaction],
        "ci_95":   result.conf_int().loc[interaction].tolist(),
        "summary": result.summary(),
    }
```

**DiD checklist:**
1. Validate parallel trends in the pre-period before trusting estimates
2. Use HC3 robust standard errors to handle heteroskedasticity
3. For panel data, cluster SEs at the unit level (add `groups=` param to `.fit()`)
4. Consider propensity score matching if groups differ at baseline
5. Report the ATT with confidence interval, not just statistical significance

**Parallel trends test:**

```python
def test_parallel_trends(df, outcome, treatment_col, time_col, pre_periods):
    """
    Regress outcome on treatment × time dummies in pre-period only.
    Significant interactions indicate pre-trend violation.
    """
    pre_df = df[df[time_col].isin(pre_periods)].copy()
    pre_df["time_num"] = pre_df[time_col].map({t: i for i, t in enumerate(pre_periods)})
    formula = f"{outcome} ~ {treatment_col} * C(time_num)"
    result = smf.ols(formula, data=pre_df).fit(cov_type="HC3")
    interaction_terms = [c for c in result.pvalues.index if ":" in c]
    return {
        "interaction_pvalues": result.pvalues[interaction_terms].to_dict(),
        "trends_parallel": all(p > 0.05 for p in result.pvalues[interaction_terms]),
    }
```

---

## Propensity Score Matching (PSM)

```python
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
import pandas as pd
import numpy as np

def propensity_score_matching(df, treatment_col, covariate_cols, caliper=0.05):
    """
    1-to-1 nearest-neighbour PSM with caliper.
    Returns matched dataset with balance on covariates.
    """
    # Estimate propensity scores
    X = StandardScaler().fit_transform(df[covariate_cols])
    y = df[treatment_col]
    lr = LogisticRegression(max_iter=1000).fit(X, y)
    df = df.copy()
    df["pscore"] = lr.predict_proba(X)[:, 1]

    treated = df[df[treatment_col] == 1].copy()
    control = df[df[treatment_col] == 0].copy()

    matched_pairs = []
    used_controls = set()

    for _, t_row in treated.iterrows():
        # Find nearest control within caliper
        diffs = (control["pscore"] - t_row["pscore"]).abs()
        eligible = diffs[~diffs.index.isin(used_controls)]
        if eligible.empty or eligible.min() > caliper:
            continue
        best_match_idx = eligible.idxmin()
        matched_pairs.append((t_row.name, best_match_idx))
        used_controls.add(best_match_idx)

    treated_ids = [p[0] for p in matched_pairs]
    control_ids = [p[1] for p in matched_pairs]
    return df.loc[treated_ids + control_ids]


def check_balance(df, treatment_col, covariate_cols):
    """Standardised mean differences — target |SMD| < 0.1 after matching."""
    results = []
    for col in covariate_cols:
        t = df[df[treatment_col] == 1][col]
        c = df[df[treatment_col] == 0][col]
        smd = (t.mean() - c.mean()) / np.sqrt((t.var() + c.var()) / 2)
        results.append({"covariate": col, "smd": smd, "balanced": abs(smd) < 0.1})
    return pd.DataFrame(results)
```

---

## Regression Discontinuity (RDD)

```python
def regression_discontinuity(df, outcome, running_var, cutoff, bandwidth=None):
    """
    Sharp RDD: estimate treatment effect at the discontinuity.
    bandwidth: window around cutoff (None = use full data with polynomial)
    """
    df = df.copy()
    df["above_cutoff"] = (df[running_var] >= cutoff).astype(int)
    df["centered"]     = df[running_var] - cutoff

    if bandwidth:
        df = df[df["centered"].abs() <= bandwidth]

    # Local linear regression on each side
    formula = f"{outcome} ~ above_cutoff * centered"
    result = smf.ols(formula, data=df).fit(cov_type="HC3")

    return {
        "effect":  result.params["above_cutoff"],
        "p_value": result.pvalues["above_cutoff"],
        "ci_95":   result.conf_int().loc["above_cutoff"].tolist(),
        "n":       len(df),
        "summary": result.summary(),
    }

# Validity checks:
# 1. McCrary density test: no manipulation of running variable at cutoff
# 2. Covariate smoothness: pre-treatment covariates continuous at cutoff
# 3. Placebo cutoffs: no discontinuity at arbitrary thresholds
```

---

## Instrumental Variables (IV)

```python
from linearmodels.iv import IV2SLS

def iv_estimate(df, outcome, treatment, instrument, controls=None):
    """
    Two-Stage Least Squares (2SLS) IV estimation.
    instrument must be: correlated with treatment, uncorrelated with outcome residual.
    """
    control_str = " + ".join(controls) if controls else "1"
    formula = f"{outcome} ~ [{treatment} ~ {instrument}] + {control_str}"
    result = IV2SLS.from_formula(formula, data=df).fit(cov_type="robust")

    # First-stage F-statistic (weak instrument test: target F > 10)
    first_stage = result.first_stage
    return {
        "effect":         result.params[treatment],
        "p_value":        result.pvalues[treatment],
        "ci_95":          result.conf_int().loc[treatment].tolist(),
        "first_stage_f":  first_stage.diagnostics["f.stat"].values[0],
        "weak_instrument": first_stage.diagnostics["f.stat"].values[0] < 10,
    }
```

---

## Synthetic Control

```python
from scipy.optimize import minimize
import numpy as np

def synthetic_control(treated_pre, donor_pre, treated_post, donor_post):
    """
    Construct synthetic control as convex combination of donor units.
    treated_pre: (T_pre,) array for treated unit
    donor_pre:   (T_pre, N_donors) array for donor pool
    """
    n_donors = donor_pre.shape[1]

    def loss(w):
        synthetic = donor_pre @ w
        return np.sum((treated_pre - synthetic) ** 2)

    # Constrain weights to simplex
    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    bounds = [(0, 1)] * n_donors
    result = minimize(loss, x0=np.ones(n_donors) / n_donors,
                      method="SLSQP", bounds=bounds, constraints=constraints)
    weights = result.x

    # Estimate treatment effect in post-period
    synthetic_post = donor_post @ weights
    att_series = treated_post - synthetic_post

    return {
        "weights":        weights,
        "att_series":     att_series,
        "att_mean":       att_series.mean(),
        "pre_fit_rmse":   np.sqrt(loss(weights) / len(treated_pre)),
    }
```

---

## Uplift Modelling

```python
from sklearn.base import clone

class TwoModelUplift:
    """
    Two-model (T-learner) uplift model.
    Estimates Individual Treatment Effect (ITE) = P(Y|T=1,X) - P(Y|T=0,X)
    """

    def __init__(self, base_model):
        self.model_t = clone(base_model)
        self.model_c = clone(base_model)

    def fit(self, X, y, treatment):
        self.model_t.fit(X[treatment == 1], y[treatment == 1])
        self.model_c.fit(X[treatment == 0], y[treatment == 0])
        return self

    def predict_uplift(self, X):
        p_t = self.model_t.predict_proba(X)[:, 1]
        p_c = self.model_c.predict_proba(X)[:, 1]
        return p_t - p_c  # Estimated ITE

# Evaluation: Qini curve and Qini coefficient
def qini_coefficient(y, treatment, uplift_scores):
    """Higher Qini = better separation of high/low uplift individuals."""
    df = pd.DataFrame({"y": y, "t": treatment, "score": uplift_scores})
    df = df.sort_values("score", ascending=False).reset_index(drop=True)
    df["cum_treated"] = (df["t"] == 1).cumsum()
    df["cum_control"] = (df["t"] == 0).cumsum()
    df["cum_uplift"] = df["y"] * df["t"] - df["y"] * df["t"].mean() * df["cum_control"] / max(df["cum_control"].max(), 1)
    return df["cum_uplift"].sum() / len(df)
```

---

## Method Selection Guide

| Question | Method | Key requirement |
|---|---|---|
| Did the intervention work? (RCT available) | Two-proportion z-test / t-test | Randomisation |
| Did the intervention work? (no RCT, pre/post data) | Difference-in-Differences | Parallel trends |
| Did the intervention work? (eligibility threshold) | Regression Discontinuity | Continuity at cutoff |
| Did the intervention work? (instrument available) | Instrumental Variables | Valid instrument |
| Did the intervention work? (single treated unit) | Synthetic Control | Good donor pool |
| Who benefits most from treatment? | Uplift Modelling | Sufficient treated/control overlap |
| Running many tests simultaneously | Bonferroni / BH correction | Independence (Bonferroni) or FDR control (BH) |
