(function () {
  const root = document.querySelector(".planner-page");
  if (!root) return;

  const categories = JSON.parse(document.getElementById("planner-categories").textContent);
  const colorMap = {};
  categories.forEach((c) => { colorMap[c.id] = c.color; });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- block colour swatches ------------------------------------------
  function applySwatch(select) {
    const swatch = select.parentElement.querySelector(".planner-block-swatch");
    const color = colorMap[select.value] || "transparent";
    if (swatch) swatch.style.backgroundColor = color;
    select.style.borderColor = color;
  }

  document.querySelectorAll(".planner-block-select").forEach((select) => {
    applySwatch(select);
    // colour the options themselves -- most browsers respect this on <option>
    Array.from(select.options).forEach((opt) => {
      opt.style.backgroundColor = colorMap[opt.value] || "";
    });
  });

  document.addEventListener("change", async (e) => {
    if (!e.target.classList.contains("planner-block-select")) return;
    const select = e.target;
    const blockId = select.dataset.blockId;
    const categoryId = select.value;

    applySwatch(select);
    updatePieForDay(select.closest(".planner-day"));

    const res = await fetch(`/api/planner/blocks/${blockId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId }),
    });
    if (!res.ok) {
      console.error("Failed to save planner block", blockId);
    }
  });

  // ---- per-day pie chart + legend (pure CSS conic-gradient, no libs) --
  function updatePieForDay(dayEl) {
    if (!dayEl) return;
    const selects = dayEl.querySelectorAll(".planner-block-select");
    const counts = {};
    selects.forEach((s) => {
      counts[s.value] = (counts[s.value] || 0) + 1;
    });
    const total = selects.length || 1;

    const gradientParts = [];
    let cursor = 0;
    categories.forEach((c) => {
      const n = counts[c.id] || 0;
      if (!n) return;
      const pct = (n / total) * 100;
      gradientParts.push(`${c.color} ${cursor}% ${cursor + pct}%`);
      cursor += pct;
    });

    const pieEl = dayEl.querySelector(".planner-pie");
    if (pieEl) {
      pieEl.style.background = gradientParts.length
        ? `conic-gradient(${gradientParts.join(", ")})`
        : "var(--planner-pie-empty, #2a2e37)";
    }

    const legendEl = dayEl.querySelector(".planner-pie-legend");
    if (legendEl) {
      legendEl.innerHTML = categories
        .filter((c) => counts[c.id])
        .map(
          (c) => `
            <li>
              <span class="planner-legend-dot" style="background:${c.color}"></span>
              <span class="planner-legend-label">${escapeHtml(c.label)}</span>
              <span class="mono">${counts[c.id]}h</span>
            </li>`
        )
        .join("");
    }
  }

  document.querySelectorAll(".planner-day").forEach(updatePieForDay);

  // ---- notes ------------------------------------------------------------
  document.querySelectorAll(".planner-notes-input").forEach((textarea) => {
    textarea.addEventListener("change", async () => {
      const dayId = textarea.dataset.dayId;
      const res = await fetch(`/api/planner/days/${dayId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: textarea.value }),
      });
      if (!res.ok) console.error("Failed to save notes for day", dayId);
    });
  });

  // ---- embedded to-dos: toggle / delete / add ---------------------------
  document.addEventListener("change", async (e) => {
    if (!e.target.classList.contains("todo-done-toggle")) return;
    const li = e.target.closest(".planner-todo-list .todo-task");
    if (!li) return;
    const checkbox = e.target;
    const taskId = li.dataset.taskId;
    const done = checkbox.checked;

    const res = await fetch(`/api/todo/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    if (!res.ok) {
      checkbox.checked = !done;
      return;
    }
    li.classList.toggle("done", done);
  });

  document.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("todo-task-delete")) return;
    const li = e.target.closest(".planner-todo-list .todo-task");
    if (!li) return;
    const taskId = li.dataset.taskId;
    const res = await fetch(`/api/todo/tasks/${taskId}`, { method: "DELETE" });
    if (!res.ok) return;
    li.remove();
  });

  document.querySelectorAll(".planner-add-task-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const dayId = form.dataset.dayId;
      const text = form.text.value.trim();
      const due = form.due.value.trim();
      if (!text) return;

      const res = await fetch(`/api/todo/days/${dayId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, due }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const task = data.task;
      const list = form.previousElementSibling; // .planner-todo-list

      const li = document.createElement("li");
      li.className = "todo-task";
      li.dataset.taskId = task.id;
      li.innerHTML = `
        <label class="todo-check">
          <input type="checkbox" class="todo-done-toggle">
          <span class="todo-task-text">${escapeHtml(task.text)}</span>
        </label>
        ${task.due ? `<span class="todo-due mono">due ${escapeHtml(task.due)}</span>` : ""}
        <button class="row-delete todo-task-delete" title="Remove">&times;</button>
      `;
      list.appendChild(li);
      form.reset();
    });
  });

  // ---- week tabs ----------------------------------------------------------
  const weekTabs = document.querySelectorAll(".planner-week-tabs .tab");
  const weekPanels = document.querySelectorAll(".planner-week");
  weekTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const idx = tab.dataset.weekIndex;
      weekTabs.forEach((t) => t.classList.toggle("active", t === tab));
      weekPanels.forEach((p) => {
        p.hidden = p.dataset.weekIndex !== idx;
      });
    });
  });

  // ---- per-day actions: copy to rest of week / copy to next week / clear -
  function setSelectValue(dayEl, hour, categoryId) {
    const select = dayEl.querySelector(`.planner-block-select[data-block-id$="-${hour}"]`);
    if (!select) return;
    select.value = categoryId;
    applySwatch(select);
  }

  function applyDayUpdate(update) {
    const dayEl = document.querySelector(`.planner-day[data-day-id="${update.day_id}"]`);
    if (!dayEl) return false;
    Object.entries(update.categories).forEach(([hour, categoryId]) => {
      setSelectValue(dayEl, hour, categoryId);
    });
    updatePieForDay(dayEl);
    return true;
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".planner-day-action");
    if (!btn) return;
    const dayEl = btn.closest(".planner-day");
    const dayId = dayEl.dataset.dayId;
    const action = btn.dataset.action;

    if (action === "copy-week" || action === "copy-next-week") {
      const target = action === "copy-week" ? "week" : "next_week";
      const label = target === "week" ? "the rest of this week" : "the same day next week";
      if (!confirm(`Copy this day's selections to ${label}? This overwrites whatever is already there.`)) return;

      const res = await fetch(`/api/planner/days/${dayId}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) {
        console.error("Failed to copy planner day", dayId);
        return;
      }
      // Reload rather than patch the DOM in place: a "copy to next week"
      // from a day that's already in the "next week" tab targets a day
      // two weeks out, which isn't rendered on this page at all -- reload
      // is the simple, always-correct way to pick that up (and everything
      // else) consistently.
      window.location.reload();
      return;
    }

    if (action === "clear") {
      if (!confirm("Clear all selections for this day?")) return;
      const res = await fetch(`/api/planner/days/${dayId}/clear`, { method: "POST" });
      if (!res.ok) {
        console.error("Failed to clear planner day", dayId);
        return;
      }
      const data = await res.json();
      data.updates.forEach(applyDayUpdate);
    }
  });
})();