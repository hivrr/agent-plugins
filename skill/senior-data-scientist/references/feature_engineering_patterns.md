# Feature Engineering Patterns

Patterns for building production-grade feature pipelines and evaluating predictive models.

---

## Scikit-learn Feature Pipeline

```python
import pandas as pd
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.compose import ColumnTransformer

def build_feature_pipeline(numeric_cols, categorical_cols):
    """
    Returns a fitted-ready ColumnTransformer for structured tabular data.
    """
    numeric_pipeline = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale",  StandardScaler()),
    ])
    categorical_pipeline = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("encode", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    transformers = [
        ("num", numeric_pipeline, numeric_cols),
        ("cat", categorical_pipeline, categorical_cols),
    ]
    return ColumnTransformer(transformers, remainder="drop")
```

**Checklist:**
1. Never fit transformers on the full dataset — fit on train, transform test
2. Log-transform right-skewed numeric features before scaling
3. For high-cardinality categoricals (>50 levels), use target encoding or embeddings
4. Generate lag/rolling features BEFORE the train/test split to avoid leakage
5. Document each feature's business meaning alongside its code

---

## Time & Cyclical Features

```python
def add_time_features(df, date_col):
    """Extract cyclical and lag features from a datetime column."""
    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col])
    df["dow_sin"]    = np.sin(2 * np.pi * df[date_col].dt.dayofweek / 7)
    df["dow_cos"]    = np.cos(2 * np.pi * df[date_col].dt.dayofweek / 7)
    df["month_sin"]  = np.sin(2 * np.pi * df[date_col].dt.month / 12)
    df["month_cos"]  = np.cos(2 * np.pi * df[date_col].dt.month / 12)
    df["is_weekend"] = (df[date_col].dt.dayofweek >= 5).astype(int)
    return df

def add_lag_features(df, col, lags, group_col=None):
    """Add lag and rolling window features, grouped if specified."""
    df = df.copy()
    for lag in lags:
        if group_col:
            df[f"{col}_lag_{lag}"] = df.groupby(group_col)[col].shift(lag)
        else:
            df[f"{col}_lag_{lag}"] = df[col].shift(lag)
    return df
```

---

## Target Encoding (High-Cardinality Categoricals)

```python
from sklearn.base import BaseEstimator, TransformerMixin

class TargetEncoder(BaseEstimator, TransformerMixin):
    """
    Target encoding with smoothing to prevent leakage on small groups.
    k: minimum group size for full target mean (smoothing parameter)
    """

    def __init__(self, cols, k=20):
        self.cols = cols
        self.k = k
        self.global_mean_ = None
        self.mapping_ = {}

    def fit(self, X, y):
        self.global_mean_ = y.mean()
        for col in self.cols:
            stats = pd.DataFrame({"y": y, "x": X[col]}).groupby("x")["y"].agg(["mean", "count"])
            # Smoothed estimate: weight toward global mean for small groups
            stats["encoded"] = (
                (stats["count"] * stats["mean"] + self.k * self.global_mean_)
                / (stats["count"] + self.k)
            )
            self.mapping_[col] = stats["encoded"].to_dict()
        return self

    def transform(self, X):
        X = X.copy()
        for col in self.cols:
            X[col] = X[col].map(self.mapping_[col]).fillna(self.global_mean_)
        return X
```

---

## Model Training, Evaluation & Logging

```python
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.metrics import make_scorer, roc_auc_score, average_precision_score
import xgboost as xgb
import mlflow

SCORERS = {
    "roc_auc":  make_scorer(roc_auc_score, needs_proba=True),
    "avg_prec": make_scorer(average_precision_score, needs_proba=True),
}

def evaluate_model(model, X, y, cv=5):
    """
    Cross-validate and return mean ± std for each scorer.
    Use StratifiedKFold for classification to preserve class balance.
    """
    cv_results = cross_validate(
        model, X, y,
        cv=StratifiedKFold(n_splits=cv, shuffle=True, random_state=42),
        scoring=SCORERS,
        return_train_score=True,
    )
    summary = {}
    for metric in SCORERS:
        test_scores = cv_results[f"test_{metric}"]
        summary[metric] = {"mean": test_scores.mean(), "std": test_scores.std()}
        # Flag overfitting: large gap between train and test score
        train_mean = cv_results[f"train_{metric}"].mean()
        summary[metric]["overfit_gap"] = train_mean - test_scores.mean()
    return summary

def train_and_log(model, X_train, y_train, X_test, y_test, run_name):
    """Train model and log all artefacts to MLflow."""
    with mlflow.start_run(run_name=run_name):
        model.fit(X_train, y_train)
        proba = model.predict_proba(X_test)[:, 1]
        metrics = {
            "roc_auc":  roc_auc_score(y_test, proba),
            "avg_prec": average_precision_score(y_test, proba),
        }
        mlflow.log_params(model.get_params())
        mlflow.log_metrics(metrics)
        mlflow.sklearn.log_model(model, "model")
        return metrics
```

**Model evaluation checklist:**
1. Always run a `DummyClassifier` baseline and verify the model beats it
2. Always report AUC-PR alongside AUC-ROC for imbalanced datasets
3. Flag `overfit_gap > 0.05` as a warning sign of overfitting
4. Calibrate probabilities (Platt scaling / isotonic) before production use
5. Compute SHAP values to validate feature importance makes business sense
6. Log every run to MLflow — never rely on notebook output for comparison

---

## SHAP Feature Importance

```python
import shap

def explain_model(model, X_train, X_test, feature_names):
    """
    Compute and plot SHAP values for tree-based models.
    Use TreeExplainer for XGBoost/LightGBM/RandomForest.
    """
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_test)

    # Global importance
    shap.summary_plot(shap_values, X_test, feature_names=feature_names)

    # Single prediction explanation
    shap.force_plot(
        explainer.expected_value,
        shap_values[0],
        X_test.iloc[0],
        feature_names=feature_names
    )

    # Return mean absolute SHAP per feature
    importance = pd.DataFrame({
        "feature": feature_names,
        "mean_shap": np.abs(shap_values).mean(axis=0),
    }).sort_values("mean_shap", ascending=False)
    return importance
```

---

## Probability Calibration

```python
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
import matplotlib.pyplot as plt

def calibrate_model(model, X_train, y_train, method="isotonic"):
    """
    Calibrate model probabilities post-hoc.
    method: 'sigmoid' (Platt scaling, few samples) or 'isotonic' (more data)
    """
    calibrated = CalibratedClassifierCV(model, cv=5, method=method)
    calibrated.fit(X_train, y_train)
    return calibrated

def plot_calibration(model, X_test, y_test, n_bins=10):
    """Reliability diagram to assess calibration quality."""
    prob_pred = model.predict_proba(X_test)[:, 1]
    fraction_pos, mean_pred = calibration_curve(y_test, prob_pred, n_bins=n_bins)
    plt.plot(mean_pred, fraction_pos, marker="o", label="Model")
    plt.plot([0, 1], [0, 1], linestyle="--", label="Perfect calibration")
    plt.xlabel("Mean predicted probability")
    plt.ylabel("Fraction of positives")
    plt.legend()
    plt.title("Calibration Curve")
```

---

## Encoding Decision Guide

| Scenario | Encoder | Notes |
|---|---|---|
| Low cardinality (<10 levels) | OneHotEncoder | Sparse, explainable |
| Medium cardinality (10–50) | OrdinalEncoder + embed | Or OHE if tree model |
| High cardinality (>50) | TargetEncoder | Use smoothing, CV fold |
| Ordered categories | OrdinalEncoder | Map to integers with order |
| Text / free-form | TF-IDF or embedding | Depends on model |
