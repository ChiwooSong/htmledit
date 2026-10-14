import { parse, serialize, type DefaultTreeAdapterTypes as T } from 'parse5';
import { TARGET_ATTR, walk } from '../model/document';

export interface ElementView {
  attrs: Record<string, string | null>;
  styles: Record<string, { value: string; priority: string }>;
  x: number;
  y: number;
}
export interface ViewState {
  elements: Record<string, ElementView>;
  x: number;
  y: number;
}

// The bridge runs inside an opaque-origin iframe. It can only send view state;
// it cannot access the editor DOM, storage, or canonical document model.
export function interactionBridge(token: string) {
  const targetAttr = 'data-htmledit-id';
  const selector = `[${targetAttr}]`;
  let port: MessagePort | undefined;
  let canonical: Document | undefined;
  let active = true;
  let revision = 0;
  let pending = 0;
  const removed = new Map<string, HTMLElement>();
  const map = (doc: Document) =>
    new Map(
      Array.from(doc.querySelectorAll<HTMLElement>(selector), (el) => [
        el.getAttribute(targetAttr)!,
        el,
      ]),
    );
  const capture = () => {
    if (!port || !canonical) return;
    const originals = map(canonical);
    const elements: Record<string, ElementView> = Object.create(null);
    for (const [id, el] of map(document)) {
      const original = originals.get(id);
      if (!original) continue;
      const attrs: Record<string, string | null> = Object.create(null);
      for (const name of ['class', 'hidden', 'open']) {
        if (el.getAttribute(name) !== original.getAttribute(name))
          attrs[name] = el.getAttribute(name);
      }
      const styles: ElementView['styles'] = Object.create(null);
      for (const name of new Set([...Array.from(original.style), ...Array.from(el.style)])) {
        const value = el.style.getPropertyValue(name);
        const priority = el.style.getPropertyPriority(name);
        if (
          value !== original.style.getPropertyValue(name) ||
          priority !== original.style.getPropertyPriority(name)
        ) {
          styles[name] = { value, priority };
        }
      }
      if (
        Object.keys(attrs).length ||
        Object.keys(styles).length ||
        el.scrollTop ||
        el.scrollLeft
      ) {
        elements[id] = { attrs, styles, x: el.scrollLeft, y: el.scrollTop };
      }
    }
    port.postMessage({ type: 'view', revision, state: { elements, x: scrollX, y: scrollY } });
  };
  const schedule = () => {
    if (!active) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(capture);
  };
  // Patch only user changes. Retain live nodes, event listeners and script variables
  // so a second menu click still knows which screen it needs to hide.
  const sync = (beforeHtml: string, html: string) => {
    const parser = new DOMParser();
    const previous = map(parser.parseFromString(beforeHtml, 'text/html'));
    canonical = parser.parseFromString(html, 'text/html');
    const next = map(canonical);
    const live = map(document);
    const deleting = new Set([...live.keys()].filter((id) => previous.has(id) && !next.has(id)));
    for (const id of deleting) {
      const el = live.get(id)!;
      removed.set(id, el);
      const parentId = el.parentElement?.closest(selector)?.getAttribute(targetAttr);
      if (!parentId || !deleting.has(parentId)) el.remove();
    }
    for (const [id, after] of next) {
      if (previous.has(id) || document.querySelector(`[${targetAttr}="${CSS.escape(id)}"]`))
        continue;
      const parentId = after.parentElement?.getAttribute(targetAttr);
      const parentNode = parentId && live.get(parentId);
      if (!parentNode) continue;
      const revived = removed.get(id) ?? document.importNode(after, true);
      const index = Array.from(after.parentNode!.childNodes).indexOf(after);
      parentNode.insertBefore(revived, parentNode.childNodes[index] ?? null);
      for (const el of [revived, ...Array.from(revived.querySelectorAll<HTMLElement>(selector))])
        live.set(el.getAttribute(targetAttr)!, el);
      removed.delete(id);
    }
    for (const [id, after] of next) {
      const before = previous.get(id);
      const el = live.get(id);
      if (!before || !el || el.tagName !== after.tagName) continue;
      const names = new Set([
        ...Array.from(before.attributes, (a) => a.name),
        ...Array.from(after.attributes, (a) => a.name),
      ]);
      for (const name of names) {
        if (name === 'style') {
          for (const property of new Set([
            ...Array.from(before.style),
            ...Array.from(after.style),
          ])) {
            const value = after.style.getPropertyValue(property);
            const priority = after.style.getPropertyPriority(property);
            if (
              value !== before.style.getPropertyValue(property) ||
              priority !== before.style.getPropertyPriority(property)
            ) {
              if (value) el.style.setProperty(property, value, priority);
              else el.style.removeProperty(property);
            }
          }
        } else if (before.getAttribute(name) !== after.getAttribute(name)) {
          const value = after.getAttribute(name);
          if (value === null) el.removeAttribute(name);
          else el.setAttribute(name, value);
        }
      }
      if (before.childNodes.length === after.childNodes.length) {
        after.childNodes.forEach((node, index) => {
          const old = before.childNodes[index];
          const current = el.childNodes[index];
          if (
            node.nodeType === Node.TEXT_NODE &&
            old.nodeType === Node.TEXT_NODE &&
            current?.nodeType === Node.TEXT_NODE &&
            node.textContent !== old.textContent
          ) {
            current.textContent = node.textContent;
          }
        });
      }
    }
  };
  window.addEventListener('message', (event) => {
    if (
      event.source !== parent ||
      event.data?.type !== 'htmledit-connect' ||
      event.data.token !== token ||
      port ||
      !event.ports[0]
    )
      return;
    port = event.ports[0];
    port.onmessage = ({ data }) => {
      if (
        data?.type === 'sync' &&
        typeof data.html === 'string' &&
        typeof data.beforeHtml === 'string'
      ) {
        sync(data.beforeHtml, data.html);
        revision = data.revision;
        capture();
      } else if (data?.type === 'active') {
        active = data.active === true;
        capture();
      }
    };
    port.start();
  });
  document.addEventListener(
    'click',
    (event) => {
      const anchor = (event.target as Element).closest?.('a');
      if (anchor) {
        // In srcdoc, even a fragment-only URL resolves against the editor URL.
        // Never navigate the sandbox to that URL; handle document anchors locally.
        event.preventDefault();
        const href = anchor.getAttribute('href')?.trim();
        if (href?.startsWith('#')) {
          let name = href.slice(1);
          try {
            name = decodeURIComponent(name);
          } catch {
            // A literal percent sign can be a valid document ID.
          }
          const target =
            document.getElementById(name) ??
            Array.from(document.querySelectorAll('a[name]')).find(
              (element) => element.getAttribute('name') === name,
            );
          if (target) target.scrollIntoView({ block: 'start' });
          else if (!name || name.toLowerCase() === 'top') scrollTo({ top: 0, left: 0 });
        }
      }
      schedule();
    },
    true,
  );
  document.addEventListener('submit', (event) => event.preventDefault(), true);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener(
    'load',
    () => {
      new MutationObserver(schedule).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'open'],
        childList: true,
        subtree: true,
      });
      parent.postMessage({ type: 'htmledit-ready', token }, '*');
    },
    { once: true },
  );
}

// Messages are untrusted even though they come from our frame. Only existing
// target IDs and presentation fields can enter the static preview, never the model.
export function validateViewState(value: unknown, ids: Set<string>): ViewState | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as ViewState;
  if (!input.elements || typeof input.elements !== 'object' || Array.isArray(input.elements))
    return null;
  const coordinate = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(n, 1e7)) : 0;
  const elements: Record<string, ElementView> = Object.create(null);
  for (const [id, raw] of Object.entries(input.elements)) {
    if (!ids.has(id) || !raw || typeof raw !== 'object') continue;
    const attrs: ElementView['attrs'] = Object.create(null);
    const styles: ElementView['styles'] = Object.create(null);
    for (const name of ['class', 'hidden', 'open']) {
      const v = raw.attrs?.[name];
      if (v === null || (typeof v === 'string' && v.length <= 20000)) attrs[name] = v;
    }
    if (raw.styles && typeof raw.styles === 'object') {
      for (const [name, property] of Object.entries(raw.styles)) {
        if (
          /^(?:--)?[a-zA-Z][\w-]{0,100}$/.test(name) &&
          property &&
          typeof property.value === 'string' &&
          property.value.length <= 20000 &&
          ['', 'important'].includes(property.priority)
        )
          styles[name] = { value: property.value, priority: property.priority };
      }
    }
    elements[id] = { attrs, styles, x: coordinate(raw.x), y: coordinate(raw.y) };
  }
  return { elements, x: coordinate(input.x), y: coordinate(input.y) };
}

export function applyViewState(html: string, state: ViewState | null) {
  if (!state) return html;
  const root = parse(html, { scriptingEnabled: false });
  walk(root, (node) => {
    if (!('tagName' in node)) return;
    const id = node.attrs.find((a) => a.name === TARGET_ATTR)?.value;
    const view = id && state.elements[id];
    if (!view) return;
    const set = (name: string, value: string | null) => {
      node.attrs = node.attrs.filter((a) => a.name !== name);
      if (value !== null) node.attrs.push({ name, value });
    };
    Object.entries(view.attrs).forEach(([name, value]) => set(name, value));
    const style = document.createElement('span').style;
    style.cssText = (node as T.Element).attrs.find((a) => a.name === 'style')?.value ?? '';
    for (const [name, property] of Object.entries(view.styles)) {
      if (property.value) style.setProperty(name, property.value, property.priority);
      else style.removeProperty(name);
    }
    if (Object.keys(view.styles).length) set('style', style.cssText);
  });
  return serialize(root);
}
