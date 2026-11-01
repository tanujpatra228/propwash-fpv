import { el } from '../core/dom';

/** A small panel in the bottom-left gauge row. */
export function createGaugePanel(parent: HTMLElement, className: string, children: ReadonlyArray<Node | string>): HTMLDivElement {
  const panel = el('div', { class: `panel gauge ${className}` }, children);
  parent.append(panel);
  return panel;
}
