# Experiment Design Frameworks

Frameworks for designing, sizing, and analysing controlled experiments.

---

## A/B Test Design & Analysis

```python
import numpy as np
from scipy import stats

def calculate_sample_size(baseline_rate, mde, alpha=0.05, power=0.8):
    """
    Calculate required sample size per variant.
    baseline_rate: current conversion rate (e.g. 0.10)
    mde: minimum detectable effect (relative, e.g. 0.05 = 5% lift)
    """
    p1 = baseline_rate
    p2 = baseline_rate * (1 + mde)
    effect_size = abs(p2 - p1) / np.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / 2)
    z_alpha = stats.norm.ppf(1 - alpha / 2)
    z_beta = stats.norm.ppf(power)
    n = ((z_alpha + z_beta) / effect_size) ** 2
    return int(np.ceil(n))

def analyze_experiment(control, treatment, alpha=0.05):
    """
    Run two-proportion z-test and return structured results.
    control/treatment: dicts with 'conversions' and 'visitors'.
    """
    p_c = control["conversions"] / control["visitors"]
    p_t = treatment["conversions"] / treatment["visitors"]
    pooled = (control["conversions"] + treatment["conversions"]) / (control["visitors"] + treatment["visitors"])
    se = np.sqrt(pooled * (1 - pooled) * (1 / control["visitors"] + 1 / treatment["visitors"]))
    z = (p_t - p_c) / se
    p_value = 2 * (1 - stats.norm.cdf(abs(z)))
    ci_low = (p_t - p_c) - stats.norm.ppf(1 - alpha / 2) * se
    ci_high = (p_t - p_c) + stats.norm.ppf(1 - alpha / 2) * se
    return {
        "lift": (p_t - p_c) / p_c,
        "p_value": p_value,
        "significant": p_value < alpha,
        "ci_95": (ci_low, ci_high),
    }
```

**Experiment checklist:**
1. Define ONE primary metric and pre-register secondary metrics
2. Calculate sample size BEFORE starting: `calculate_sample_size(0.10, 0.05)`
3. Randomise at the user (not session) level to avoid leakage
4. Run for at least 1 full business cycle (typically 2 weeks)
5. Check for sample ratio mismatch: `abs(n_control - n_treatment) / expected < 0.01`
6. Analyse with `analyze_experiment()` and report lift + CI, not just p-value
7. Apply Bonferroni correction if testing multiple metrics: `alpha / n_metrics`

---

## Multiple Testing Correction

```python
from statsmodels.stats.multitest import multipletests

def correct_pvalues(p_values: list, method: str = "bonferroni") -> dict:
    """
    Apply multiple testing correction.
    method: 'bonferroni', 'fdr_bh' (Benjamini-Hochberg), 'holm'
    """
    reject, pvals_corrected, _, _ = multipletests(p_values, method=method)
    return {
        "reject": reject.tolist(),
        "corrected_pvalues": pvals_corrected.tolist(),
    }

# Bonferroni: strict, controls family-wise error rate
# BH (FDR): less conservative, controls false discovery rate
# Rule of thumb: use Bonferroni for <5 comparisons, BH for many
```

---

## Sequential Testing (Early Stopping)

```python
def sequential_test(control, treatment, alpha=0.05, power=0.8):
    """
    Sequential probability ratio test (SPRT) for early stopping.
    Allows peeking without inflating Type I error.
    """
    p_c = control["conversions"] / control["visitors"]
    p_t = treatment["conversions"] / treatment["visitors"]

    # Likelihood ratio under H1 vs H0
    if p_c == 0 or p_t == 0:
        return {"decision": "continue", "llr": 0}

    llr = (
        control["conversions"] * np.log(p_c / ((p_c + p_t) / 2))
        + treatment["conversions"] * np.log(p_t / ((p_c + p_t) / 2))
        + (control["visitors"] - control["conversions"]) * np.log((1 - p_c) / (1 - (p_c + p_t) / 2))
        + (treatment["visitors"] - treatment["conversions"]) * np.log((1 - p_t) / (1 - (p_c + p_t) / 2))
    )

    # Thresholds
    upper = np.log((1 - alpha) / (1 - power))
    lower = np.log(alpha / power)

    if llr >= upper:
        return {"decision": "reject_null", "llr": llr}
    elif llr <= lower:
        return {"decision": "accept_null", "llr": llr}
    else:
        return {"decision": "continue", "llr": llr}
```

---

## Multi-Armed Bandit (Online Experimentation)

```python
import numpy as np

class ThompsonSamplingBandit:
    """
    Thompson Sampling for online experimentation.
    Balances exploration vs exploitation during the experiment.
    Use when minimising regret matters more than clean causal inference.
    """

    def __init__(self, n_arms: int):
        self.alpha = np.ones(n_arms)   # successes + 1
        self.beta  = np.ones(n_arms)   # failures + 1

    def select_arm(self) -> int:
        """Sample from Beta posterior for each arm, return argmax."""
        samples = [np.random.beta(a, b) for a, b in zip(self.alpha, self.beta)]
        return int(np.argmax(samples))

    def update(self, arm: int, reward: int):
        """Update posterior: reward=1 for success, 0 for failure."""
        self.alpha[arm] += reward
        self.beta[arm]  += 1 - reward

    def best_arm(self) -> int:
        """Return arm with highest posterior mean."""
        means = self.alpha / (self.alpha + self.beta)
        return int(np.argmax(means))

# Use A/B test (fixed horizon) when:
#   - Clean causal inference is required
#   - Regulatory/reporting requirements demand a fixed design
# Use bandit (online) when:
#   - Minimising regret during the experiment matters
#   - Many arms to test (e.g. personalisation)
```

---

## Power Analysis

```python
from scipy.stats import norm

def power_curve(baseline_rate, mde_range, alpha=0.05, n_per_variant=None):
    """
    Plot power across a range of MDEs for a given sample size.
    Useful for understanding the tradeoff before committing to a design.
    """
    results = []
    for mde in mde_range:
        p1 = baseline_rate
        p2 = baseline_rate * (1 + mde)
        pooled = (p1 + p2) / 2
        se = np.sqrt(2 * pooled * (1 - pooled) / n_per_variant) if n_per_variant else None
        if se:
            z_alpha = norm.ppf(1 - alpha / 2)
            ncp = abs(p2 - p1) / se  # Non-centrality parameter
            power = 1 - norm.cdf(z_alpha - ncp) + norm.cdf(-z_alpha - ncp)
        else:
            n = calculate_sample_size(baseline_rate, mde, alpha=alpha)
            power = 0.8  # by definition at target n
        results.append({"mde": mde, "n_per_variant": n_per_variant or n, "power": power})
    return results

# Example: what MDE can we detect with 10k users/variant?
# curve = power_curve(0.05, [0.05, 0.10, 0.15, 0.20], n_per_variant=10000)
```

---

## Quasi-Experimental Designs

When randomisation is not possible, use these in order of preference:

| Design | When to use | Key assumption |
|---|---|---|
| Difference-in-Differences | Pre/post with control group | Parallel trends |
| Regression Discontinuity | Sharp eligibility threshold | Local continuity |
| Instrumental Variables | Instrument correlated with treatment, not outcome | Exclusion restriction |
| Interrupted Time Series | Single group, long pre-period | No confounding trends |
| Synthetic Control | Single treated unit | Convex combination of controls |

→ See [statistical_methods_advanced.md](statistical_methods_advanced.md) for full implementations.
