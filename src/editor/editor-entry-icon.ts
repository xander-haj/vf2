/** Creates dependency-free SVG icons that distinguish renderable objects from logic and text data. */

import type { EditorContentKindInfo } from "./editor-content-kind";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Adds one non-filled path to a browser-row SVG using the editor's inherited icon color. */
function addPath(svg: SVGSVGElement, data: string): void {
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", data);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.7");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
}

/** Returns a cube for visual records, connected nodes for logic, or a page for other data. */
export function createEntryIcon(info: EditorContentKindInfo): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.classList.add("browser-entry-icon", `browser-entry-icon-${info.icon}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (info.icon === "object") {
    addPath(svg, "M12 2.5 21 7.4v9.2L12 21.5 3 16.6V7.4Z");
    addPath(svg, "m3.4 7.6 8.6 4.8 8.6-4.8M12 12.4v8.7");
  } else if (info.icon === "logic") {
    addPath(svg, "M6 5h4v4H6zM14 15h4v4h-4zM6 15h4v4H6zM10 7h5v8M10 17h4");
  } else {
    addPath(svg, "M6 2.5h8l4 4v15H6zM14 2.5v5h4M9 12h6M9 16h6");
  }
  return svg;
}
