// @ts-check
// In a page's Markdown twin (and llms-full.txt), a <Diagram> becomes its
// title and the list written inside it, so a reader without the picture
// gets the same steps.
import { GRAPHS } from './graphs.mjs';

/** @param {string} markdown */
export function diagramsAsText(markdown) {
  return markdown
    .replace(/<Diagram\s+id=["']([^"']+)["']\s*>/g, (_, id) => {
      const g = /** @type {Record<string, {title: string}>} */ (GRAPHS)[id];
      if (!g) throw new Error(`<Diagram id="${id}">: no such diagram in lib/diagrams/graphs.mjs`);
      return `**Diagram: ${g.title}**`;
    })
    .replace(/<\/Diagram>\n?/g, '');
}
