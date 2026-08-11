import json
import os
import calendar
from datetime import date, datetime, timedelta
from threading import Lock

from flask import Flask, jsonify, render_template, request, abort

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")

app = Flask(__name__)
_lock = Lock()  # guards read-modify-write of the JSON file


# --------------------------------------------------------------------------
# Storage helpers
# --------------------------------------------------------------------------
def load_data():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    tmp_path = DATA_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, DATA_FILE)


def next_id(data):
    data["next_id"] += 1
    return data["next_id"]


def find_year(data, year_id):
    for y in data["years"]:
        if y["id"] == year_id:
            return y
    return None


def find_item(items, item_id):
    for it in items:
        if it["id"] == item_id:
            return it
    return None


def find_day(data, day_id):
    for d in data.setdefault("todo_days", []):
        if d["id"] == day_id:
            return d
    return None


def find_task(day, task_id):
    for t in day["tasks"]:
        if t["id"] == task_id:
            return t
    return None


def find_day_and_task(data, task_id):
    for d in data.setdefault("todo_days", []):
        t = find_task(d, task_id)
        if t is not None:
            return d, t
    return None, None


# --------------------------------------------------------------------------
# Calculations (kept in one place so the dashboard, the API, and the year
# page all agree on the numbers)
# --------------------------------------------------------------------------
def summarize_year(year):
    income_yr = round(sum(i["amount_yr"] for i in year["income"]), 2)
    expenses_yr = round(sum(e["amount_yr"] for e in year["expenses"]), 2)
    leftover_yr = round(income_yr - expenses_yr, 2)

    # Matches the original spreadsheet's approach: each line's monthly figure
    # is rounded to the penny first, then those are summed -- rather than
    # rounding the yearly total once. The two can differ by a few pence.
    income_month = round(sum(round(i["amount_yr"] / 12, 2) for i in year["income"]), 2)
    expenses_month = round(sum(round(e["amount_yr"] / 12, 2) for e in year["expenses"]), 2)
    leftover_month = round(income_month - expenses_month, 2)

    # The original sheet used a rough "leftover per week" = monthly / 5,
    # not a real 52-week division. Kept as-is so the numbers still match
    # what the spreadsheet's owner was already used to seeing.
    leftover_week = round(leftover_month / 5, 2)

    return {
        "income_yr": income_yr,
        "income_month": income_month,
        "expenses_yr": expenses_yr,
        "expenses_month": expenses_month,
        "leftover_yr": leftover_yr,
        "leftover_month": leftover_month,
        "leftover_week": leftover_week,
    }


def year_with_summary(year):
    y = dict(year)
    y["summary"] = summarize_year(year)
    for i in y["income"]:
        i["amount_month"] = round(i["amount_yr"] / 12, 2)
    for e in y["expenses"]:
        e["amount_month"] = round(e["amount_yr"] / 12, 2)
    return y


MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def compute_next_month_start(days):
    if not days:
        today = date.today()
        return date(today.year, today.month, 1)
    last_date = datetime.strptime(days[-1]["date"], "%Y-%m-%d").date()
    if last_date.month == 12:
        return date(last_date.year + 1, 1, 1)
    return date(last_date.year, last_date.month + 1, 1)


def build_month_days(start_date, data):
    year, month = start_date.year, start_date.month
    num_days = calendar.monthrange(year, month)[1]
    new_days = []
    for day_num in range(1, num_days + 1):
        d = date(year, month, day_num)
        new_days.append({
            "id": next_id(data),
            "date": d.isoformat(),
            "day_name": d.strftime("%a").lower(),
            "theme": None,
            "tasks": [],
        })
    return new_days


def group_days_by_month(days):
    """Group todo days into month buckets, each with its own progress."""
    months = []
    current = None
    for d in days:
        y, m, _ = d["date"].split("-")
        key = f"{y}-{m}"
        if current is None or current["key"] != key:
            current = {
                "key": key,
                "label": f"{MONTH_NAMES[int(m) - 1]} {y}",
                "days": [],
            }
            months.append(current)
        current["days"].append(d)
    for month in months:
        total = sum(len(d["tasks"]) for d in month["days"])
        done = sum(1 for d in month["days"] for t in d["tasks"] if t["done"])
        month["total_tasks"] = total
        month["done_tasks"] = done
    return months


def todo_summary(data):
    days = data.get("todo_days", [])
    total = sum(len(d["tasks"]) for d in days)
    done = sum(1 for d in days for t in d["tasks"] if t["done"])
    return {"total_tasks": total, "done_tasks": done}


# --------------------------------------------------------------------------
# Planner: categories, block helpers, and data lookups
# --------------------------------------------------------------------------
CATEGORIES = [
    {"id": "work",        "label": "Work",                        "color": "#F2A65A"},
    {"id": "chill",        "label": "Chill",                       "color": "#2a2e37"},  # close to bg
    {"id": "food",         "label": "Food",                        "color": "#E85D75"},
    {"id": "travelling",   "label": "Travelling",                  "color": "#4FB0C6"},
    {"id": "other",        "label": "Other",                       "color": "#8A8F98"},
    {"id": "aero_prop",    "label": "Aero Prop",                   "color": "#FF6B6B"},
    {"id": "managing_eng", "label": "Managing Eng",                "color": "#C77DFF"},
    {"id": "dynamics",     "label": "Aircraft Dynamics & Control",  "color": "#56CFE1"},
    {"id": "antennas",     "label": "Antennas & Radar",             "color": "#72EFDD"},
    {"id": "design",       "label": "Aircraft Design",              "color": "#80FFDB"},
    {"id": "accounting",   "label": "Accounting & Law",             "color": "#FFD166"},
    {"id": "aerodynamics", "label": "Aerodynamics",                 "color": "#06D6A0"},
    {"id": "space",        "label": "Space Systems",                "color": "#118AB2"},
    {"id": "ssc",          "label": "State Space Control",          "color": "#EF476F"},
    {"id": "dissertation", "label": "Dissertation",                 "color": "#9D4EDD"},
]
CATEGORY_IDS = {c["id"] for c in CATEGORIES}
PLANNER_HOURS = list(range(6, 24))  # 06:00 .. 23:00 -> 18 one-hour blocks


def build_day_blocks(day_id, saved=None):
    # NB: default was `saved={}` before -- a mutable default argument, which
    # Python only evaluates ONCE at function-definition time. Every call that
    # didn't pass `saved` explicitly would have shared and mutated the same
    # dict, silently leaking one day's block choices into another.
    saved = saved or {}
    blocks = []
    for hour in PLANNER_HOURS:
        block_id = f"{day_id}-{hour}"
        blocks.append({
            "id": block_id,
            "hour": hour,
            "label": f"{hour:02d}:00",
            "category_id": saved.get(block_id, "chill"),
        })
    return blocks


def find_todo_day_by_date(data, date_iso):
    for d in data.setdefault("todo_days", []):
        if d["date"] == date_iso:
            return d
    return None


def get_or_create_todo_day(data, the_date):
    """Look up (or lazily create) the todo day for a given date so the
    planner can always show/add tasks even for dates outside the
    originally-imported spreadsheet range."""
    date_iso = the_date.isoformat()
    day = find_todo_day_by_date(data, date_iso)
    if day is None:
        day = {
            "id": next_id(data),
            "date": date_iso,
            "day_name": the_date.strftime("%a").lower(),
            "theme": None,
            "tasks": [],
        }
        data.setdefault("todo_days", []).append(day)
    return day


def find_planner_day_by_date(data, date_iso):
    for d in data.setdefault("planner_days", []):
        if d["date"] == date_iso:
            return d
    return None


def find_planner_day(data, day_id):
    for d in data.setdefault("planner_days", []):
        if d["id"] == day_id:
            return d
    return None


def find_planner_day_by_block_id(data, block_id):
    # block ids look like "<planner_day_id>-<hour>", e.g. "104-6"
    try:
        day_id_str, _hour = block_id.rsplit("-", 1)
        day_id = int(day_id_str)
    except (ValueError, AttributeError):
        return None
    return find_planner_day(data, day_id)


def get_or_create_planner_day(data, the_date):
    date_iso = the_date.isoformat()
    day = find_planner_day_by_date(data, date_iso)
    if day is None:
        day = {
            "id": next_id(data),
            "date": date_iso,
            "notes": "",
            "block_categories": {},
        }
        data.setdefault("planner_days", []).append(day)
    return day


# --------------------------------------------------------------------------
# Page routes
# --------------------------------------------------------------------------
@app.route("/")
def todo_page():
    data = load_data()
    days = data.get("todo_days", [])
    months = group_days_by_month(days)
    today = date.today().isoformat()
    next_start = compute_next_month_start(days)
    next_month_label = f"{MONTH_NAMES[next_start.month - 1]} {next_start.year}"
    outstanding = [
        {"day": d, "task": t}
        for d in days
        for t in d["tasks"]
        if not t["done"] and d["date"] <= today
    ]
    return render_template(
        "todo.html",
        months=months,
        summary=todo_summary(data),
        today=today,
        next_month_label=next_month_label,
        outstanding=outstanding,
    )


@app.route("/finances")
def index():
    data = load_data()
    years = [year_with_summary(y) for y in data["years"]]
    return render_template("index.html", years=years)


@app.route("/year/<int:year_id>")
def year_page(year_id):
    data = load_data()
    year = find_year(data, year_id)
    if year is None:
        abort(404)
    return render_template("year.html", year=year_with_summary(year), all_years=data["years"])


@app.route("/planner")
def planner_page():
    with _lock:
        data = load_data()
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        weeks = []
        for w in range(2):
            week_start = monday + timedelta(days=7 * w)
            days = []
            for d in range(7):
                the_date = week_start + timedelta(days=d)
                todo_day = get_or_create_todo_day(data, the_date)
                planner_day = get_or_create_planner_day(data, the_date)
                days.append({
                    "id": planner_day["id"],
                    "date": the_date.isoformat(),
                    "day_name": the_date.strftime("%A"),
                    "is_today": the_date == today,
                    "notes": planner_day.get("notes", ""),
                    "blocks": build_day_blocks(
                        planner_day["id"], saved=planner_day.get("block_categories", {})
                    ),
                    "todos": todo_day["tasks"],
                    "todo_day_id": todo_day["id"],
                })
            weeks.append({"label": "This week" if w == 0 else "Next week", "days": days})
        # get_or_create_* above may have just created new todo/planner days
        # (e.g. the first time this week is viewed) -- persist those.
        save_data(data)

    return render_template("planner.html", categories=CATEGORIES, weeks=weeks)


# --------------------------------------------------------------------------
# API: years
# --------------------------------------------------------------------------
@app.route("/api/years", methods=["POST"])
def create_year():
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip() or "New Year"
    with _lock:
        data = load_data()
        year = {
            "id": next_id(data),
            "name": name,
            "income": [],
            "expenses": [],
            "schedules": {
                "accommodation_payments": [],
                "maintenance_loan_in": [],
                "scholarship_in": [],
            },
            "scholarship_note": "",
            "notes": [],
        }
        data["years"].append(year)
        save_data(data)
    return jsonify(year_with_summary(year)), 201


@app.route("/api/years/<int:year_id>", methods=["PATCH"])
def rename_year(year_id):
    body = request.get_json(force=True) or {}
    with _lock:
        data = load_data()
        year = find_year(data, year_id)
        if year is None:
            abort(404)
        if "name" in body:
            year["name"] = body["name"].strip() or year["name"]
        save_data(data)
    return jsonify(year_with_summary(year))


@app.route("/api/years/<int:year_id>", methods=["DELETE"])
def delete_year(year_id):
    with _lock:
        data = load_data()
        year = find_year(data, year_id)
        if year is None:
            abort(404)
        data["years"].remove(year)
        save_data(data)
    return "", 204


# --------------------------------------------------------------------------
# API: income / expense line items
# --------------------------------------------------------------------------
def _items_key(kind):
    if kind not in ("income", "expenses"):
        abort(404)
    return kind


@app.route("/api/years/<int:year_id>/<kind>", methods=["POST"])
def add_item(year_id, kind):
    key = _items_key(kind)
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip()
    try:
        amount_yr = round(float(body.get("amount_yr", 0)), 2)
    except (TypeError, ValueError):
        return jsonify({"error": "amount_yr must be a number"}), 400
    if not name:
        return jsonify({"error": "name is required"}), 400

    with _lock:
        data = load_data()
        year = find_year(data, year_id)
        if year is None:
            abort(404)
        item = {"id": next_id(data), "name": name, "amount_yr": amount_yr}
        if key == "expenses":
            item["note"] = (body.get("note") or None)
        year[key].append(item)
        save_data(data)
        summary = summarize_year(year)
    item["amount_month"] = round(amount_yr / 12, 2)
    return jsonify({"item": item, "summary": summary}), 201


@app.route("/api/years/<int:year_id>/<kind>/<int:item_id>", methods=["PUT"])
def update_item(year_id, kind, item_id):
    key = _items_key(kind)
    body = request.get_json(force=True) or {}
    with _lock:
        data = load_data()
        year = find_year(data, year_id)
        if year is None:
            abort(404)
        item = find_item(year[key], item_id)
        if item is None:
            abort(404)
        if "name" in body and body["name"].strip():
            item["name"] = body["name"].strip()
        if "amount_yr" in body:
            try:
                item["amount_yr"] = round(float(body["amount_yr"]), 2)
            except (TypeError, ValueError):
                return jsonify({"error": "amount_yr must be a number"}), 400
        if key == "expenses" and "note" in body:
            item["note"] = body["note"] or None
        save_data(data)
        summary = summarize_year(year)
    item["amount_month"] = round(item["amount_yr"] / 12, 2)
    return jsonify({"item": item, "summary": summary})


@app.route("/api/years/<int:year_id>/<kind>/<int:item_id>", methods=["DELETE"])
def delete_item(year_id, kind, item_id):
    key = _items_key(kind)
    with _lock:
        data = load_data()
        year = find_year(data, year_id)
        if year is None:
            abort(404)
        item = find_item(year[key], item_id)
        if item is None:
            abort(404)
        year[key].remove(item)
        save_data(data)
        summary = summarize_year(year)
    return jsonify({"summary": summary})


# --------------------------------------------------------------------------
# API: payment schedules (accommodation / maintenance loan / scholarship)
# --------------------------------------------------------------------------
SCHEDULE_KEYS = ("accommodation_payments", "maintenance_loan_in", "scholarship_in")


@app.route("/api/years/<int:year_id>/schedule/<sched_key>", methods=["POST"])
def add_schedule_line(year_id, sched_key):
    if sched_key not in SCHEDULE_KEYS:
        abort(404)
    body = request.get_json(force=True) or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    with _lock:
        data = load_data()
        year = find_year(data, year_id)
        if year is None:
            abort(404)
        year["schedules"].setdefault(sched_key, []).append(text)
        save_data(data)
    return jsonify({"lines": year["schedules"][sched_key]}), 201


@app.route("/api/years/<int:year_id>/schedule/<sched_key>/<int:index>", methods=["DELETE"])
def delete_schedule_line(year_id, sched_key, index):
    if sched_key not in SCHEDULE_KEYS:
        abort(404)
    with _lock:
        data = load_data()
        year = find_year(data, year_id)
        if year is None:
            abort(404)
        lines = year["schedules"].get(sched_key, [])
        if index < 0 or index >= len(lines):
            abort(404)
        lines.pop(index)
        save_data(data)
    return jsonify({"lines": year["schedules"][sched_key]})


# --------------------------------------------------------------------------
# API: to-do list (days + tasks)
# --------------------------------------------------------------------------
@app.route("/api/todo/days/<int:day_id>/tasks", methods=["POST"])
def add_task(day_id):
    body = request.get_json(force=True) or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    due = (body.get("due") or "").strip() or None

    with _lock:
        data = load_data()
        day = find_day(data, day_id)
        if day is None:
            abort(404)
        task = {"id": next_id(data), "text": text, "due": due, "done": False}
        day["tasks"].append(task)
        save_data(data)
        summary = todo_summary(data)
    return jsonify({"task": task, "summary": summary}), 201


@app.route("/api/todo/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    body = request.get_json(force=True) or {}
    with _lock:
        data = load_data()
        day, task = find_day_and_task(data, task_id)
        if task is None:
            abort(404)
        if "text" in body and body["text"].strip():
            task["text"] = body["text"].strip()
        if "due" in body:
            task["due"] = (body["due"] or "").strip() or None
        if "done" in body:
            task["done"] = bool(body["done"])
        save_data(data)
        summary = todo_summary(data)
    return jsonify({"task": task, "summary": summary})


@app.route("/api/todo/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    with _lock:
        data = load_data()
        day, task = find_day_and_task(data, task_id)
        if task is None:
            abort(404)
        day["tasks"].remove(task)
        save_data(data)
        summary = todo_summary(data)
    return jsonify({"summary": summary})


@app.route("/api/todo/months", methods=["POST"])
def add_month():
    with _lock:
        data = load_data()
        days = data.setdefault("todo_days", [])
        start = compute_next_month_start(days)
        new_days = build_month_days(start, data)
        days.extend(new_days)
        save_data(data)
    return jsonify({"added": len(new_days)}), 201


# --------------------------------------------------------------------------
# API: planner
# --------------------------------------------------------------------------
@app.route("/api/planner/blocks/<block_id>", methods=["PUT"])
def update_planner_block(block_id):
    body = request.get_json(force=True) or {}
    category_id = body.get("category_id")
    if category_id not in CATEGORY_IDS:
        return jsonify({"error": "invalid category_id"}), 400

    with _lock:
        data = load_data()
        planner_day = find_planner_day_by_block_id(data, block_id)
        if planner_day is None:
            abort(404)
        planner_day.setdefault("block_categories", {})[block_id] = category_id
        save_data(data)

    return jsonify({"ok": True})


@app.route("/api/planner/days/<int:day_id>/notes", methods=["PUT"])
def update_planner_day_notes(day_id):
    body = request.get_json(force=True) or {}
    notes = body.get("notes", "")

    with _lock:
        data = load_data()
        planner_day = find_planner_day(data, day_id)
        if planner_day is None:
            abort(404)
        planner_day["notes"] = notes
        save_data(data)

    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)