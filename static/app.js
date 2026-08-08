// Shared across every page. Kept intentionally small for now --
// this is the spot to hook in cross-page nav (todo/planner) later.

// Bars carry their height as a plain data-pct number (set server-side)
// rather than inline `style="height: {{ ... }}%"` -- keeps templating
// out of CSS values entirely, so editor/linter tooling never tries to
// parse a Jinja expression as a CSS property value.
document.querySelectorAll(".bar[data-pct]").forEach((el) => {
  el.style.height = el.dataset.pct + "%";
});
