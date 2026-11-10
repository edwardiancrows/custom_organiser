// Shared across every page. Kept intentionally small for now --
// this is the spot to hook in cross-page nav (todo/planner) later.

// Bars carry their height as a plain data-pct number (set server-side)
// rather than inline `style="height: {{ ... }}%"` -- keeps templating
// out of CSS values entirely, so editor/linter tooling never tries to
// parse a Jinja expression as a CSS property value.
document.querySelectorAll(".bar[data-pct]").forEach((el) => {
  el.style.height = el.dataset.pct + "%";
});


// ---------------------------------------------------------------------
// Shared task UI (used by the to-do page and the planner's embedded
// to-dos): the repeat button + pop-out on every add-task form, the
// "just this one / all instances" delete prompt, and one task <li> builder.
// ---------------------------------------------------------------------
window.TaskUI = (function () {
  const REPEAT_OPTIONS = [
    ["", "Doesn\u2019t repeat"],
    ["1:week", "Every week"],
    ["2:week", "Every 2 weeks"],
    ["1:month", "Every month"],
    ["1:year", "Every year"],
  ];

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function buildTaskLi(task, dayId) {
    const li = document.createElement("li");
    li.className = "todo-task";
    li.dataset.taskId = task.id;
    if (dayId !== undefined && dayId !== null) li.dataset.dayId = dayId;
    if (task.series_id) li.dataset.seriesId = task.series_id;
    li.innerHTML = `
      <label class="todo-check">
        <input type="checkbox" class="todo-done-toggle">
        <span class="todo-task-text">${escapeHtml(task.text)}</span>
      </label>
      ${task.series_id ? '<span class="todo-repeat" title="Repeating task">&#8635;</span>' : ""}
      ${task.due ? `<span class="todo-due mono">due ${escapeHtml(task.due)}</span>` : ""}
      <button class="row-delete todo-task-delete" title="Remove">&times;</button>
    `;
    return li;
  }

  // ---- repeat button + pop-out ------------------------------------------
  let popover = null;
  let popoverForm = null;

  function closePopover() {
    if (popover) popover.hidden = true;
    popoverForm = null;
  }

  function ensurePopover() {
    if (popover) return popover;
    popover = document.createElement("div");
    popover.className = "repeat-popover";
    popover.hidden = true;
    popover.innerHTML =
      '<div class="repeat-popover-title">Repeat</div>' +
      REPEAT_OPTIONS.map(
        ([value, label]) => `<button type="button" class="repeat-option" data-value="${value}">${label}</button>`
      ).join("");
    popover.addEventListener("click", (e) => {
      const opt = e.target.closest(".repeat-option");
      if (!opt || !popoverForm) return;
      setRepeat(popoverForm, opt.dataset.value, opt.textContent);
      closePopover();
    });
    document.body.appendChild(popover);
    return popover;
  }

  function setRepeat(form, value, label) {
    const btn = form.querySelector(".repeat-btn");
    if (value) form.dataset.repeat = value;
    else delete form.dataset.repeat;
    if (btn) {
      btn.classList.toggle("active", !!value);
      btn.title = value ? label : "Repeat";
    }
  }

  function openPopover(form, btn) {
    const pop = ensurePopover();
    if (popoverForm === form && !pop.hidden) { closePopover(); return; }
    popoverForm = form;
    const current = form.dataset.repeat || "";
    pop.querySelectorAll(".repeat-option").forEach((o) => {
      o.classList.toggle("selected", o.dataset.value === current);
    });
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8));
    pop.style.left = left + window.scrollX + "px";
    pop.style.top = r.bottom + window.scrollY + 6 + "px";
  }

  document.addEventListener("click", (e) => {
    if (!popover || popover.hidden) return;
    if (e.target.closest(".repeat-popover") || e.target.closest(".repeat-btn")) return;
    closePopover();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePopover(); });

  document.querySelectorAll(".add-task-form").forEach((form) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "repeat-btn";
    btn.title = "Repeat";
    btn.setAttribute("aria-label", "Repeat");
    btn.innerHTML = "&#8635;";
    btn.addEventListener("click", () => openPopover(form, btn));
    const submit = form.querySelector('button[type="submit"]');
    form.insertBefore(btn, submit);
  });

  // "3:week"-style value on the form -> {every, unit} (or null)
  function readRepeat(form) {
    const v = form.dataset.repeat;
    if (!v) return null;
    const [every, unit] = v.split(":");
    return { every: Number(every), unit };
  }

  function resetRepeat(form) { setRepeat(form, "", ""); }

  // ---- delete prompt for repeating tasks ----------------------------------
  let scopeDialog = null;
  function askDeleteScope() {
    if (!scopeDialog) {
      scopeDialog = document.createElement("dialog");
      scopeDialog.className = "category-dialog";
      scopeDialog.innerHTML = `
        <form method="dialog">
          <h4>Delete repeating task</h4>
          <p class="scope-text">This task repeats. What do you want to remove?</p>
          <div class="scope-actions">
            <button value="one">Just this one</button>
            <button value="all" class="scope-danger">All instances</button>
            <button value="">Cancel</button>
          </div>
        </form>`;
      document.body.appendChild(scopeDialog);
    }
    return new Promise((resolve) => {
      scopeDialog.returnValue = "";
      scopeDialog.addEventListener("close", () => resolve(scopeDialog.returnValue || null), { once: true });
      scopeDialog.showModal();
    });
  }

  return { buildTaskLi, readRepeat, resetRepeat, askDeleteScope };
})();