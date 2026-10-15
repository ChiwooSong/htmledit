// Safari blocks even parent-context listeners in a script-disabled frame.
// Probe the actual document rather than weakening its sandbox or sniffing UA.
export function allowsParentEvents(doc: Document): boolean {
  let delivered = false;
  const listener = () => {
    delivered = true;
  };
  doc.addEventListener('htmledit-event-probe', listener);
  doc.dispatchEvent(new Event('htmledit-event-probe'));
  doc.removeEventListener('htmledit-event-probe', listener);
  return delivered;
}

// Forward scrolling from the parent surface, respecting nested scroll areas
// and chaining to the document only when the inner area reaches its boundary.
export function scrollPreview(doc: Document, target: Element | null, dx: number, dy: number) {
  const root = doc.scrollingElement;
  for (let element = target; element; element = element.parentElement) {
    const style = doc.defaultView!.getComputedStyle(element);
    const scroll = (axis: 'x' | 'y', delta: number) => {
      if (!delta) return 0;
      const overflow = axis === 'x' ? style.overflowX : style.overflowY;
      if (element !== root && !['auto', 'scroll'].includes(overflow)) return delta;
      const key = axis === 'x' ? 'scrollLeft' : 'scrollTop';
      const before = element![key];
      // Safari wraps very large scroll values instead of clamping them.
      // Keep Home/End within actual bounds; negative x supports RTL scrolling.
      const extent = axis === 'x' ? element!.scrollWidth : element!.scrollHeight;
      element![key] = Math.max(-extent, Math.min(extent, before + delta));
      return delta - (element![key] - before);
    };
    dx = scroll('x', dx);
    dy = scroll('y', dy);
    if (!dx && !dy) break;
  }
}
