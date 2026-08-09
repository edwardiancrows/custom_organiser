(function () {
  const doneCountEl = document.getElementById("todo-done-count");
  const totalCountEl = document.getElementById("todo-total-count");

  function applyGlobalSummary(summary) {
    if (summary.done_tasks !== undefined) doneCountEl.textContent = summary.done_tasks;
    if (summary.total_tasks !== undefined) totalCountEl.textContent = summary.total_tasks;
  }

  function monthProgressElForDay(dayId) {
    const dayEl = document.querySelector(`.todo-day[data-day-id="${dayId}"]`);
    if (!dayEl) return null;
    const details = dayEl.closest(".todo-month");
    return details ? details.querySelector(".todo-month-progress") : null;
  }

  function shiftMonthCounts(dayId, doneDelta, totalDelta) {
    const el = monthProgressElForDay(dayId);
    if (!el) return;
    const [done, total] = el.textContent.split("/").map(Number);
    el.textContent = `${done + doneDelta}/${total + totalDelta}`;
  }

  function updateOutstandingCount(delta) {
    const el = document.querySelector(".outstanding-count");
    if (!el) return;
    el.textContent = Number(el.textContent) + delta;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- toggling done, wherever the checkbox lives (day card or outstanding list) ----
  document.addEventListener("change", async (e) => {
    if (!e.target.classList.contains("todo-done-toggle")) return;
    const checkbox = e.target;
    const li = checkbox.closest(".todo-task");
    const taskId = li.dataset.taskId;
    const dayId = li.dataset.dayId;
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
    const data = await res.json();

    document.querySelectorAll(`.todo-task[data-task-id="${taskId}"]`).forEach((el) => {
      el.classList.toggle("done", done);
      const cb = el.querySelector(".todo-done-toggle");
      if (cb) cb.checked = done;
    });

    if (done) {
      const outstandingItem = document.querySelector(
        `.outstanding-list .todo-task[data-task-id="${taskId}"]`
      );
      if (outstandingItem) {
        outstandingItem.remove();
        updateOutstandingCount(-1);
      }
    }

    if (dayId) shiftMonthCounts(dayId, done ? 1 : -1, 0);
    applyGlobalSummary(data.summary);
  });

  // ---- deleting a task, from either list ----
  document.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("todo-task-delete")) return;
    const li = e.target.closest(".todo-task");
    const taskId = li.dataset.taskId;
    const dayId = li.dataset.dayId;
    const wasDone = li.classList.contains("done");
    const inOutstanding = li.closest(".outstanding-list") !== null;

    const res = await fetch(`/api/todo/tasks/${taskId}`, { method: "DELETE" });
    if (!res.ok) return;

    document.querySelectorAll(`.todo-task[data-task-id="${taskId}"]`).forEach((el) => el.remove());
    if (inOutstanding && !wasDone) updateOutstandingCount(-1);
    if (dayId) shiftMonthCounts(dayId, wasDone ? -1 : 0, -1);
    const data = await res.json();
    applyGlobalSummary(data.summary);
  });

  // ---- add-task forms (one per day) ----
  document.querySelectorAll(".add-task-form").forEach((addForm) => {
    const dayEl = addForm.closest(".todo-day");
    const dayId = dayEl.dataset.dayId;
    const list = dayEl.querySelector(".todo-task-list");

    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = addForm.text.value.trim();
      const due = addForm.due.value.trim();
      if (!text) return;

      const res = await fetch(`/api/todo/days/${dayId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, due }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const task = data.task;

      const li = document.createElement("li");
      li.className = "todo-task";
      li.dataset.taskId = task.id;
      li.dataset.dayId = dayId;
      li.innerHTML = `
        <label class="todo-check">
          <input type="checkbox" class="todo-done-toggle">
          <span class="todo-task-text">${escapeHtml(task.text)}</span>
        </label>
        ${task.due ? `<span class="todo-due mono">due ${escapeHtml(task.due)}</span>` : ""}
        <button class="row-delete todo-task-delete" title="Remove">&times;</button>
      `;
      list.appendChild(li);
      shiftMonthCounts(dayId, 0, 1);
      applyGlobalSummary(data.summary);
      addForm.reset();
    });
  });

  // ---- jump to today ----
  const jump = document.querySelector(".jump-today");
  if (jump) {
    jump.addEventListener("click", (e) => {
      const target = document.getElementById("today");
      if (!target) return;
      e.preventDefault();
      const details = target.closest("details.todo-month");
      if (details) details.open = true;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // ---- add a new month ----
  const addMonthForm = document.getElementById("add-month-form");
  if (addMonthForm) {
    addMonthForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const res = await fetch("/api/todo/months", { method: "POST" });
      if (!res.ok) return;
      window.location.reload();
    });
  }
})();