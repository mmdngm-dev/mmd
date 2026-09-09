# Mauritania commodity indices — self-updating

Two weighted price indices (top-5 exports, top-5 imports) that update on their
own and stay live even when nobody has the page open. No server to run, no
paid hosting.

```
GitHub cron ── every hour ──▶ fetch prices ──▶ commit JSON ──▶ GitHub Pages serves the page
```

## Files

```
index.html                      the page (reads data/*.json — nothing else)
updater/fetch-prices.mjs        hourly: writes data/prices.json, history.json, base.json
updater/backfill-history.mjs    one-time: seeds real history + anchors the base
.github/workflows/update-prices.yml   the hourly cron
.github/workflows/backfill.yml        one-click history seeding (Actions tab)
data/history.json               starts empty; fills up over time
```

There are no manual price entries and no unit calibration: each commodity anchors
to its own price at the first reading (its "base 100"), in whatever native unit
the feed uses, so the index is always a clean ratio.

---

## Setup — about 10 minutes, done once

**1. Put these files in a new GitHub repository** (keep the folder structure).

**2. Get a data API key.** Sign up at **commoditypriceapi.com** (no credit card
for the trial). Copy your key from the dashboard. It already covers all ten
commodities used here — including iron ore and palm oil, which most feeds lack.

**3. Add the key as a secret.** Repo → **Settings → Secrets and variables →
Actions → New repository secret**. Name it exactly `COMMODITIES_API_KEY`, paste
the key.

**4. Turn on Pages.** Repo → **Settings → Pages** → Source *Deploy from a
branch* → branch `main`, folder `/ (root)`. Your page will be at
`https://<you>.github.io/<repo>/`.

**5. Seed the history (recommended).** Repo → **Actions → Backfill history →
Run workflow**, leave days at `180`. This fills both charts with real past
prices and anchors the index base to the start of that window.

**6. Take the first live snapshot.** Repo → **Actions → Update commodity prices
→ Run workflow**. This writes the first `data/prices.json`.

**7. Open your Pages URL.** You should see live numbers and two filled charts.
From here it refreshes **every hour on weekdays, on its own** — your computer
can be off.

---

## Good to know

**Call budget.** The hourly schedule runs ~330 times/month × 2 requests (ten
symbols in chunks of five) ≈ **660 calls/month** — comfortably inside the
entry-tier allowance. The backfill is a one-off (2 calls). Confirm your plan's
monthly cap and whether the entry tier is free or low-cost when you sign up; if
the cap is tight, widen the cron interval in `update-prices.yml`.

**Change the cadence.** Edit the `cron` line in `.github/workflows/update-prices.yml`.
`0 6-20 * * 1-5` = hourly, 06:00–20:00 UTC, Mon–Fri. Once daily: `0 12 * * *`.
(GitHub's scheduler can lag a few minutes — normal.)

**Weights.** Set in the `CONFIG` block of `index.html`, following Mauritania's
trade shares (United Nations Comtrade / central bank), rescaled to 100% per
basket. Change them there and the page and charts follow.

**Symbols & units.** Mapped in `updater/fetch-prices.mjs` and
`updater/backfill-history.mjs` (`SYMBOLS`). They're verified against
commoditypriceapi.com/symbols. Fishmeal (`FM`) and iron ore (`TIOC`) update on
the provider's own slower cadence (monthly / 10-minute); the fetcher carries the
latest available value forward.

**Re-basing later.** `data/history.json` keeps one row of raw prices per day.
To re-anchor the index to a specific date, re-run **Backfill history** with the
window you want (it re-writes `data/base.json` to the first day of that window),
or edit `data/base.json` by hand.

---

*Indicative market data for reference only. Not an official index, not
investment advice. Prices are aggregated/derived mid-market values, not a direct
exchange feed.*
