# Eli's Organiser

Three pages, one Flask app: **To-do** (default page), **Planner**, and
**Finances**. Everything lives in a single `data.json` file — no database.

## Run it locally (dev)

```
pip install flask
python app.py
```

Then open http://127.0.0.1:5000

## What it does

- **To-do** (`/`) — every day from the original planner sheet, grouped into
  collapsible months. Check off tasks, add new ones, optional due dates. An
  "Unfinished" panel at the top collects every undone past/today task in one
  place. A live done/total counter sits in the hero, "Jump to today" scrolls
  straight there, and a button at the bottom adds the next month when needed.
- **Planner** (`/planner`) — this week and next week, 6am–midnight split into
  hourly blocks per day. Each block is a dropdown (Work / Chill / Food /
  Travelling / Other, plus one per module), colour-coded, with a per-day pie
  chart showing the split. Each day also has a free-text notes box and that
  day's to-dos embedded directly (add/check/delete without leaving the page).
  Per-day buttons let you **copy a day's whole schedule to the rest of that
  week**, **copy it to the same day next week**, or **clear a day** back to
  all-Chill.
- **Finances** (`/finances`) — a card per year with income/essentials/leftover
  totals, editable line-item tables, payment schedules, and an "Add a year"
  card.

## Where your data lives

Everything is stored in `data.json` next to `app.py`. It's **gitignored on
purpose** — it holds live, day-to-day data (ticked-off tasks, planner
selections, notes, expenses) that a code deploy should never overwrite. It
only exists on the VM (and optionally a local copy for dev) — back it up
occasionally by copying it off the VM somewhere safe:
```powershell
scp -i "C:\Users\natas\Downloads\ssh-key-2026-08-05.key" ubuntu@84.8.146.230:~/custom_organiser/data.json .
```

## Running permanently on the VM

The live copy runs on an Oracle Cloud "Always Free" VM (Ubuntu 24.04,
`VM.Standard.E2.1.Micro`), IP `84.8.146.230`, kept alive by a systemd service
so it survives reboots and restarts itself if it crashes.

### SSH in

```powershell
ssh -i "C:\Users\natas\Downloads\ssh-key-2026-08-05.key" ubuntu@84.8.146.230
```

### One-time VM setup (already done, kept here for reference / a rebuild)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install python3-pip git iptables-persistent -y
pip install flask --break-system-packages
cd ~
git clone https://github.com/edwardiancrows/custom_organiser.git
```
`data.json` isn't in the repo (it's gitignored) — copy your backup onto the
VM afterwards:
```powershell
scp -i "C:\Users\natas\Downloads\ssh-key-2026-08-05.key" data.json ubuntu@84.8.146.230:~/custom_organiser/data.json
```

If `git pull` on the VM ever complains about divergent branches (only needed
once):
```bash
git config pull.rebase false
```

### systemd service

`/etc/systemd/system/organiser.service`:
```ini
[Unit]
Description=Eli's Organiser (Flask app)
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/custom_organiser
ExecStart=/usr/bin/python3 app.py
Restart=always
RestartSec=3
User=ubuntu

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now organiser
```

`app.py`'s last line is `app.run(host="0.0.0.0", port=5000)` — no
`debug=True`, since that's a real security risk on anything internet-facing.

### Opening port 5000 (needed in two places)

**Oracle console**: instance → Subnet link → Security Lists → default list →
Add Ingress Rule:
- Source CIDR: `0.0.0.0/0`
- IP Protocol: TCP
- Source Port Range: `All`
- Destination Port Range: `5000`

**On the VM itself**:
```bash
sudo iptables -I INPUT -p tcp --dport 5000 -j ACCEPT
sudo netfilter-persistent save
```
(the rule must sit *above* the default `REJECT` rule at the bottom of the
chain — `-I` inserts at the top, so this is fine as long as you don't add
other rules with `-A` afterwards; check with `sudo iptables -L INPUT -n
--line-numbers` if in doubt)

### Access

`http://84.8.146.230:5000` — bookmarked / added to phone home screen as a
PWA (manifest + icons in `static/`), so it opens full-screen with its own
icon, no address bar.

### Useful commands on the VM

```bash
sudo systemctl status organiser     # check it's running
sudo systemctl restart organiser    # after pulling new code
sudo journalctl -u organiser -f     # live logs
curl http://localhost:5000          # sanity check the app itself is up
```

## Deploying changes

Code lives in a public GitHub repo
(`https://github.com/edwardiancrows/custom_organiser`); `data.json` is
gitignored and stays only on the VM, so pulling code never touches live data.

**On your PC**, after editing (repo lives at
`C:\Users\natas\OneDrive\Documents\custom_organiser`):
```powershell
cd C:\Users\natas\OneDrive\Documents\custom_organiser
git add .
git commit -m "describe the change"
git push
```

**On the VM**:
```bash
ssh -i "C:\Users\natas\Downloads\ssh-key-2026-08-05.key" ubuntu@84.8.146.230
cd ~/custom_organiser
git pull
sudo systemctl restart organiser
```

(the `ssh` line above is run from PowerShell on your PC — once you're in,
the `cd` / `git pull` / `sudo systemctl restart` lines run on the VM itself)

## Icons / home screen shortcut

`static/manifest.json` plus the `<link rel="manifest">`, `apple-touch-icon`,
and `favicon` tags in `templates/base.html` control the icon shown when the
app is added to a phone's home screen or a browser's bookmark bar. Icon
files live in `static/`. If you ever swap the artwork, update the `src` /
`sizes` fields in the manifest to match the real filenames and dimensions,
then **delete and re-add** the home screen shortcut — existing shortcuts
don't pick up manifest changes automatically.

## One deliberate change from the original spreadsheet

The original spreadsheet rounded a couple of monthly figures by hand rather
than computing them (e.g. the "estimate groceries" row showed £100/month
even though £800/yr ÷ 12 = £66.67). This app always computes monthly figures
from the yearly amount, so numbers stay internally consistent instead of
silently drifting apart — yearly totals for all three years still match the
spreadsheet exactly.