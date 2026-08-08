(function () {
  const root = document.querySelector(".todo-months");
  if (!root) return;

  const doneCountEl = document.getElementById("todo-done-count");
  const totalCountEl = document.getElementById("todo-total-count");

  function applyGlobalSummary(summary) {
    if (summary.done_tasks !== undefined) doneCountEl.textContent = summary.done_tasks;
    if (summary.total_tasks !== undefined) totalCountEl.textContent = summary.total_tasks;
  }

  function shiftGlobalCounts(doneDelta, totalDelta) {
    doneCountEl.textContent = Number(doneCountEl.textContent) + doneDelta;
    totalCountEl.textContent = Number(totalCountEl.textContent) + totalDelta;
  }

  function monthProgressEl(dayEl) {
    const details = dayEl.closest(".todo-month");
    return details ? details.querySelector(".todo-month-progress") : null;
  }

  function shiftMonthCounts(dayEl, doneDelta, totalDelta) {
    const el = monthProgressEl(dayEl);
    if (!el) return;
    const [done, total] = el.textContent.split("/").map(Number);
    el.textContent = `${done + doneDelta}/${total + totalDelta}`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  root.querySelectorAll(".todo-day").forEach((dayEl) => {
    const dayId = dayEl.dataset.dayId;
    const list = dayEl.querySelector(".todo-task-list");

    list.addEventListener("change", async (e) => {
      if (!e.target.classList.contains("todo-done-toggle")) return;
      const checkbox = e.target;
      const li = checkbox.closest(".todo-task");
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
      const data = await res.json();
      li.classList.toggle("done", done);
      shiftMonthCounts(dayEl, done ? 1 : -1, 0);
      applyGlobalSummary(data.summary);
    });

    list.addEventListener("click", async (e) => {
      if (!e.target.classList.contains("todo-task-delete")) return;
      const li = e.target.closest(".todo-task");
      const taskId = li.dataset.taskId;
      const wasDone = li.classList.contains("done");

      const res = await fetch(`/api/todo/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) return;
      li.remove();
      shiftMonthCounts(dayEl, wasDone ? -1 : 0, -1);
      const data = await res.json();
      applyGlobalSummary(data.summary);
    });

    const addForm = dayEl.querySelector(".add-task-form");
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
      li.innerHTML = `
        <label class="todo-check">
          <input type="checkbox" class="todo-done-toggle">
          <span class="todo-task-text">${escapeHtml(task.text)}</span>
        </label>
        ${task.due ? `<span class="todo-due mono">due ${escapeHtml(task.due)}</span>` : ""}
        <button class="row-delete todo-task-delete" title="Remove">&times;</button>
      `;
      list.appendChild(li);
      shiftMonthCounts(dayEl, 0, 1);
      applyGlobalSummary(data.summary);
      addForm.reset();
    });
  });

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
})();
