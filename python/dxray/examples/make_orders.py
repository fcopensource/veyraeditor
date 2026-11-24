"""Makes examples/orders.csv: a year of shop orders with the usual mess, and a few things worth finding.

Planted on purpose (dxray should find all of them):
- price stored as text with "$" and commas; "N/A" and "-" meaning missing; region spelled "North", "north ", "NORTH"
- 40 exact duplicate rows; a few absurd quantities (9,999); signup dates stored as text
- revenue grows through the year, with a sharp drop in March; Premium customers spend far more
- ad_spend goes with revenue; a few big customers bring most of the revenue (80/20)
- churn depends mostly on support_tickets

    python examples/make_orders.py        # writes examples/orders.csv
"""

from pathlib import Path

import numpy as np
import pandas as pd


def make(n: int = 4000, seed: int = 7) -> pd.DataFrame:
    r = np.random.default_rng(seed)
    days = pd.date_range("2026-01-01", "2026-12-31", freq="D")
    growth = np.linspace(0.7, 1.4, len(days))
    weights = growth.copy()
    weights[(days.month == 3)] *= 0.45  # March slump
    date = r.choice(days, size=n, p=weights / weights.sum())
    customers = [f"C{i:04d}" for i in range(400)]
    pareto = 1 / np.arange(1, 401) ** 1.15
    customer = r.choice(customers, size=n, p=pareto / pareto.sum())
    tier = np.where(r.random(n) < 0.25, "Premium", np.where(r.random(n) < 0.5, "Plus", "Basic"))
    region = r.choice(["North", "South", "East", "West"], size=n, p=[0.4, 0.25, 0.2, 0.15])
    qty = r.integers(1, 6, size=n)
    base = {"Basic": 40, "Plus": 85, "Premium": 210}
    price = np.round(np.array([base[t] for t in tier]) * r.lognormal(0, 0.35, n), 2)
    ad_spend = np.round(price * qty * r.uniform(0.08, 0.14, n) + r.normal(0, 4, n), 2).clip(0)
    revenue = np.round(price * qty, 2)
    tickets = r.poisson(1.2, n)
    churn = (r.random(n) < (0.05 + 0.13 * tickets)).astype(int)
    df = pd.DataFrame({
        "order_id": [f"O{100000 + i}" for i in range(n)],
        "order_date": pd.to_datetime(date),
        "customer": customer,
        "tier": tier,
        "region": region,
        "quantity": qty,
        "price": [f"${p:,.2f}" for p in price],
        "revenue": revenue,
        "ad_spend": ad_spend,
        "support_tickets": tickets,
        "signup_date": pd.to_datetime(date) - pd.to_timedelta(r.integers(10, 900, n), unit="D"),
        "churned": churn,
        "channel": "web",
    })
    df["signup_date"] = df["signup_date"].dt.strftime("%Y-%m-%d")
    # the mess
    idx = r.choice(n, 60, replace=False); df.loc[idx[:30], "price"] = "N/A"; df.loc[idx[30:], "price"] = "-"
    for spelling, k in (("north ", 70), ("NORTH", 40)):
        hit = df.index[df["region"] == "North"][:k] if spelling == "north " else df.index[df["region"] == "North"][-k:]
        df.loc[hit, "region"] = spelling
    df.loc[r.choice(n, 8, replace=False), "quantity"] = 9999
    df.loc[r.choice(n, 120, replace=False), "ad_spend"] = np.nan
    df = pd.concat([df, df.sample(40, random_state=1)], ignore_index=True)
    return df.sort_values("order_date").reset_index(drop=True)


if __name__ == "__main__":
    out = Path(__file__).with_name("orders.csv")
    make().to_csv(out, index=False)
    print(f"wrote {out}")
