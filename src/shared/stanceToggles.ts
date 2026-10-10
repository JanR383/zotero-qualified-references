import { STANCE_GLYPH, STANCE_ORDER } from "../modules/stanceMeta";
import type { Stance } from "../modules/types";
import { create } from "./dom";

/**
 * Stance filter shared by the graph and list windows: one toggle button per
 * stance, all on initially. Off is shown by fading and a dashed outline, not by
 * colour alone (styles in qref.css). `color` gives the pill background.
 */
export function buildStanceToggles(
  labels: Record<Stance, string>,
  shown: Set<Stance>,
  color: (stance: Stance) => string,
  onChange: () => void,
): HTMLElement {
  const wrap = create("span");
  wrap.className = "qref-stance-toggles";
  for (const stance of STANCE_ORDER) {
    const button = create("button");
    button.className = "qref-stance-toggle";
    button.style.background = color(stance);
    button.textContent = STANCE_GLYPH[stance];
    button.title = labels[stance];
    button.setAttribute("aria-pressed", String(shown.has(stance)));
    button.addEventListener("click", () => {
      if (shown.has(stance)) shown.delete(stance);
      else shown.add(stance);
      button.setAttribute("aria-pressed", String(shown.has(stance)));
      onChange();
    });
    wrap.appendChild(button);
  }
  return wrap;
}
