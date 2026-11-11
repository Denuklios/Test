// Vollbild-Ebenen (Betrachter, Spiele, Diashow …) mit Zurück-Taste und Esc.
import { icon } from './icons.js';
import { el } from './util.js';

const stack = [];
/** wird aufgerufen, wenn die letzte Ebene geschlossen wurde */
export const afterAllClosed = new Set();

window.addEventListener('popstate', () => {
  const top = stack[stack.length - 1];
  if (top && !top.closing) top.close(true);
});

window.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top || document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') { top.close(); return; }
  top.onKey?.(e);
});

/** Öffnet eine Ebene. Gibt { layer, close, isTop } zurück. */
export function openLayer({ className = '', title = '', buttons = [], onClose, onKey } = {}) {
  const titleEl = el('div', { class: 'title' }, title);
  const top = el('div', { class: 'layer-top' },
    el('button', { class: 'icon-btn', title: 'Schließen (Esc)', onclick: () => api.close() }, icon('close')),
    titleEl, ...buttons);
  const layer = el('div', { class: 'layer ' + className }, top);
  document.body.append(layer);
  document.body.style.overflow = 'hidden';
  history.pushState({ layer: stack.length + 1 }, '');

  const api = {
    layer, top, titleEl, onKey, closing: false,
    isTop: () => stack[stack.length - 1] === api,
    /** schließen; navigateTo: danach zu dieser Adresse wechseln */
    close(fromPop = false, navigateTo = null) {
      if (api.closing) return;
      api.closing = true;
      stack.splice(stack.indexOf(api), 1);
      layer.remove();
      onClose?.();
      if (!stack.length) { document.body.style.overflow = ''; afterAllClosed.forEach((fn) => fn()); }
      if (navigateTo) {
        // Eintrag dieser Ebene durch das Ziel ersetzen
        stack.forEach((s) => { s.closing = true; s.layer.remove(); });
        stack.length = 0;
        document.body.style.overflow = '';
        history.replaceState(null, '', navigateTo);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } else if (!fromPop) history.back();
    },
  };
  stack.push(api);
  return api;
}

export const anyLayerOpen = () => stack.length > 0;
