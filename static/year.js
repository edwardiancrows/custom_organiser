(function () {
  const detail = document.querySelector(".year-detail");
  if (!detail) return;
  const yearId = detail.dataset.yearId;

  const fmt = (n) => "£" + Number(n).toFixed(2);

  function applySummary(summary) {
    document.querySelectorAll("[data-summary]").forEach((el) => {
      const key = el.dataset.summary;
      if (summary[key] === undefined) return;
      const suffix = key.endsWith("_month") ? "/mo" : key.endsWith("_week") ? "/wk (rough)" : "";
      // leftover cells wrap the mono value in their own span without suffix text,
      // so only append suffix for the standalone summary-sub spans.
      if (el.classList.contains("summary-value")) {
        el.textContent = fmt(summary[key]);
      } else {
        el.textContent = fmt(summary[key]);
      }
    });
  }

  // ---- inline editing of income / expense rows -------------------------
  detail.querySelectorAll(".ledger-panel").forEach((panel) => {
    const kind = panel.dataset.kind;
    const body = panel.querySelector("tbody");

    body.addEventListener("change", async (e) => {
      const input = e.target;
      if (!input.classList.contains("cell-input")) return;
      const row = input.closest("tr");
      const itemId = row.dataset.itemId;
      const field = input.dataset.field;
      const payload = {};
      payload[field] = input.value;

      const res = await fetch(`/api/years/${yearId}/${kind}/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      const data = await res.json();
      row.querySelector('[data-field="amount_month"]').textContent = fmt(data.item.amount_month);
      applySummary(data.summary);
    });

    body.addEventListener("click", async (e) => {
      if (!e.target.classList.contains("row-delete")) return;
      const row = e.target.closest("tr");
      const itemId = row.dataset.itemId;
      const res = await fetch(`/api/years/${yearId}/${kind}/${itemId}`, { method: "DELETE" });
      if (!res.ok) return;
      const data = await res.json();
      row.remove();
      applySummary(data.summary);
    });

    const addForm = panel.querySelector(".add-row-form");
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = addForm.name.value.trim();
      const amount_yr = addForm.amount_yr.value;
      if (!name || amount_yr === "") return;

      const res = await fetch(`/api/years/${yearId}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount_yr }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const item = data.item;

      const tr = document.createElement("tr");
      tr.dataset.itemId = item.id;
      tr.innerHTML = `
        <td><input class="cell-input" data-field="name" value="${escapeHtml(item.name)}"></td>
        <td><input class="cell-input mono" data-field="amount_yr" type="number" step="0.01" value="${item.amount_yr}"></td>
        <td class="mono readonly-cell" data-field="amount_month">${fmt(item.amount_month)}</td>
        <td><button class="row-delete" title="Remove">&times;</button></td>
      `;
      body.appendChild(tr);
      applySummary(data.summary);
      addForm.reset();
    });
  });

  // ---- schedule lists (accommodation / maintenance loan / scholarship) -
  detail.querySelectorAll(".schedule-panel").forEach((panel) => {
    const schedKey = panel.dataset.sched;
    const list = panel.querySelector(".schedule-list");

    list.addEventListener("click", async (e) => {
      if (!e.target.classList.contains("row-delete")) return;
      const li = e.target.closest("li");
      const index = Array.from(list.children).indexOf(li);
      const res = await fetch(`/api/years/${yearId}/schedule/${schedKey}/${index}`, { method: "DELETE" });
      if (!res.ok) return;
      li.remove();
      // re-index remaining items so future deletes target the right line
      Array.from(list.children).forEach((child, i) => (child.dataset.index = i));
    });

    const form = panel.querySelector(".add-schedule-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = form.text.value.trim();
      if (!text) return;
      const res = await fetch(`/api/years/${yearId}/schedule/${schedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const li = document.createElement("li");
      li.dataset.index = list.children.length;
      li.innerHTML = `<span>${escapeHtml(text)}</span><button class="row-delete">&times;</button>`;
      list.appendChild(li);
      form.reset();
    });
  });

  // ---- year rename / delete ---------------------------------------------
  const nameInput = document.getElementById("year-name");
  nameInput.addEventListener("change", async () => {
    await fetch(`/api/years/${yearId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameInput.value }),
    });
    document.title = nameInput.value + " · Uni Finance Ledger";
    const activeTab = document.querySelector(".year-tabs .tab.active");
    if (activeTab) activeTab.textContent = nameInput.value;
  });

  document.getElementById("delete-year").addEventListener("click", async () => {
    if (!confirm("Delete this year and everything in it? This can't be undone.")) return;
    const res = await fetch(`/api/years/${yearId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) window.location.href = "/";
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
