# Uni Finance Ledger

A small Flask app that replaces the `Uni_finance.xlsx` spreadsheet with an
editable, always-recalculating dashboard. All three years of data have
already been pulled in as a starting point.

## Run it

```
pip install flask
python app.py
```

Then open http://127.0.0.1:5000

## What it does

- **Dashboard** — a card per year with income/essentials/leftover totals and
  a quick in-vs-out bar, plus a running total across all years.
- **Year page** — editable tables for income and essential outgoings (add,
  rename, change amounts, delete — the monthly column and every total
  updates live, no formulas to break), plus the accommodation / maintenance
  loan / scholarship payment schedules as simple add/remove lists.
- **Add a year** — the "+ Add a year" card on the dashboard creates a blank
  year to fill in (e.g. once Year 4 numbers firm up).

## Where your data lives

Everything is stored in `data.json` next to `app.py`. It's a plain JSON file
— back it up, put it under git, or just copy it before making big changes.
There's no database to set up.

## One deliberate change from the original sheet

The original spreadsheet rounded a couple of monthly figures by hand rather
than computing them (e.g. the "estimate groceries" row showed £100/month
even though £800/yr ÷ 12 = £66.67). This app always computes monthly figures
from the yearly amount, so numbers stay internally consistent instead of
silently drifting apart — yearly totals for all three years still match the
spreadsheet exactly.

## Next steps (not built yet)

This was "just the finance tracker" as a starting point. The to-do list and
planner mentioned in the brief aren't in here — happy to add them as more
tabs/pages in the same app whenever you want to go further, sharing the same
Flask app and design.