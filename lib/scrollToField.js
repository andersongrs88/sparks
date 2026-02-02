export function scrollToField(field) {
  if (typeof document === "undefined") return false;
  const byId = document.getElementById(`field-${field}`);
  const el =
    byId ||
    document.querySelector(`[data-field="${field}"]`) ||
    document.querySelector(`#field-${CSS && CSS.escape ? CSS.escape(field) : field}`) ||
    null;

  if (!el) return false;

  try {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {}

  try {
    // Focus only if focusable
    if (typeof el.focus === "function") el.focus({ preventScroll: true });
  } catch {}

  return true;
}
