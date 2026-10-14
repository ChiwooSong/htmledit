import { useLocale } from '../i18n/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { previewHtml, TARGET_ATTR, type DocumentSession } from '../model/document';
import InteractivePreview from './InteractivePreview';
import { applyViewState, type ViewState } from '../preview/interaction';

interface Props {
  insertion?: 'before' | 'after' | 'inside' | 'self';
  session: DocumentSession;
  selectedId: string | null;
  mode: 'select' | 'note' | 'interact';
  width: 'desktop' | 'tablet' | 'mobile';
  onSelect: (id: string) => void;
  onNoteTarget: (id: string) => void;
  onMarker: (noteId: string, targetId: string) => void;
  onHistory: (direction: 'undo' | 'redo') => void;
  onTextCommit: (id: string, index: number, text: string) => void;
  onComputedStyle: (style: { color: string; fontSize: string }) => void;
  jump: { id: string; nonce: number } | null;
}
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Edit {
  id: string;
  index: number;
  text: string;
  rect: Rect;
  fontSize: string;
  fontFamily: string;
  lineHeight: string;
}
export default function Preview(props: Props) {
  const { t } = useLocale();
  const frame = useRef<HTMLIFrameElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const cleanup = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(0);
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
  const [markers, setMarkers] = useState<
    { id: string; targetId: string; number: number; rect: Rect; done: boolean }[]
  >([]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const editValue = useRef<Edit | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const interacting = props.mode === 'interact';
  const [hasInteracted, setHasInteracted] = useState(false);
  const [interactionEpoch, setInteractionEpoch] = useState(0);
  const [viewState, setViewState] = useState<ViewState | null>(null);
  const onView = useCallback((state: ViewState) => {
    setViewState((previous) =>
      JSON.stringify(previous) === JSON.stringify(state) ? previous : state,
    );
  }, []);
  useEffect(() => {
    if (interacting) {
      setHasInteracted(true);
      setEdit(null);
      editValue.current = null;
    }
  }, [interacting]);
  const srcDoc = useMemo(
    () => applyViewState(previewHtml(props.session), viewState),
    [props.session.html, viewState],
  );
  const previousSource = useRef(srcDoc);
  const restoreScroll = useRef(0);
  if (previousSource.current !== srcDoc) {
    restoreScroll.current = frame.current?.contentDocument?.scrollingElement?.scrollTop ?? 0;
    previousSource.current = srcDoc;
  }
  const getTarget = (id: string) =>
    frame.current?.contentDocument?.querySelector<HTMLElement>(
      `[${TARGET_ATTR}="${CSS.escape(id)}"]`,
    );
  const measure = useCallback(() => {
    const p = latest.current;
    const doc = frame.current?.contentDocument;
    if (!doc || !wrapper.current || !frame.current) return;
    const frameRect = frame.current.getBoundingClientRect();
    const wrapRect = wrapper.current.getBoundingClientRect();
    const rectOf = (element: Element): Rect => {
      const r = element.getBoundingClientRect();
      return {
        left: r.left + frameRect.left - wrapRect.left,
        top: r.top + frameRect.top - wrapRect.top,
        width: r.width,
        height: r.height,
      };
    };
    const selected = p.selectedId && getTarget(p.selectedId);
    setSelectionRect(selected && selected.getClientRects().length ? rectOf(selected) : null);
    if (selected) {
      const computed = frame.current.contentWindow!.getComputedStyle(selected);
      p.onComputedStyle({ color: computed.color, fontSize: computed.fontSize });
    }
    const positions = new Map<string, number>();
    setMarkers(
      p.session.notes.flatMap((note, index) => {
        const target = getTarget(note.targetId);
        if (!target || !target.getClientRects().length) return [];
        const n = positions.get(note.targetId) ?? 0;
        positions.set(note.targetId, n + 1);
        const rect = rectOf(target);
        rect.left += n * 28;
        return [{ id: note.id, targetId: note.targetId, number: index + 1, rect, done: note.done }];
      }),
    );
  }, []);
  useEffect(() => {
    measure();
  }, [props.selectedId, props.session.notes, props.width, ready, measure]);
  useEffect(() => {
    // Scrolling alone does not change srcDoc, so onLoad will not run when the
    // interactive view hands the same document back to the editing frame.
    if (interacting || !viewState) return;
    frame.current?.contentWindow?.scrollTo(viewState.x, viewState.y);
    for (const [id, view] of Object.entries(viewState.elements)) {
      const target = getTarget(id);
      if (target) {
        target.scrollLeft = view.x;
        target.scrollTop = view.y;
      }
    }
    measure();
  }, [interacting, viewState, ready, measure]);
  useEffect(() => {
    if (props.jump) {
      getTarget(props.jump.id)?.scrollIntoView({ block: 'center', behavior: 'instant' });
      measure();
    }
  }, [props.jump, ready, measure]);
  useEffect(() => {
    editValue.current = edit;
    if (edit) input.current?.focus();
  }, [Boolean(edit)]);
  useEffect(() => () => cleanup.current?.(), []);

  const attach = () => {
    cleanup.current?.();
    setEdit(null);
    editValue.current = null;
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    if (doc.scrollingElement) doc.scrollingElement.scrollTop = restoreScroll.current;
    if (viewState) {
      frame.current?.contentWindow?.scrollTo(viewState.x, viewState.y);
      for (const [id, view] of Object.entries(viewState.elements)) {
        const target = getTarget(id);
        if (target) {
          target.scrollLeft = view.x;
          target.scrollTop = view.y;
        }
      }
    }
    const select = (event: MouseEvent) => {
      event.preventDefault();
      const target = event.target as Element;
      const element = target.closest?.(`[${TARGET_ATTR}]`);
      if (!element) return;
      const id = element.getAttribute(TARGET_ATTR)!;
      if (latest.current.mode === 'note') latest.current.onNoteTarget(id);
      else latest.current.onSelect(id);
    };
    const dblclick = (event: MouseEvent) => {
      event.preventDefault();
      if (latest.current.mode !== 'select') return;
      // Edit one text node only. This preserves links, emphasis and all nested markup.
      const pointDoc = doc as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      const node =
        pointDoc.caretPositionFromPoint?.(event.clientX, event.clientY)?.offsetNode ??
        pointDoc.caretRangeFromPoint?.(event.clientX, event.clientY)?.startContainer;
      if (!node || node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return;
      const parent = node.parentElement;
      if (
        !parent ||
        !parent.hasAttribute(TARGET_ATTR) ||
        ['script', 'style', 'textarea', 'option'].includes(parent.tagName.toLowerCase())
      )
        return;
      const range = doc.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      const f = frame.current!.getBoundingClientRect();
      const w = wrapper.current!.getBoundingClientRect();
      const style = frame.current!.contentWindow!.getComputedStyle(parent);
      const value: Edit = {
        id: parent.getAttribute(TARGET_ATTR)!,
        index: Array.from(parent.childNodes).indexOf(node as ChildNode),
        text: node.textContent,
        rect: {
          left: r.left + f.left - w.left,
          top: r.top + f.top - w.top,
          width: Math.max(r.width, 100),
          height: Math.max(r.height, 38),
        },
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight,
      };
      editValue.current = value;
      setEdit(value);
      latest.current.onSelect(value.id);
    };
    const prevent = (event: Event) => event.preventDefault();
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        latest.current.onHistory(
          event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo',
        );
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
    };
    let pending = 0;
    const schedule = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(measure);
    };
    doc.addEventListener('click', select, true);
    doc.addEventListener('dblclick', dblclick, true);
    doc.addEventListener('submit', prevent, true);
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('scroll', schedule, true);
    doc.addEventListener('load', schedule, true);
    doc.addEventListener('mouseover', schedule, true);
    doc.fonts?.addEventListener('loadingdone', schedule);
    void doc.fonts?.ready.then(schedule);
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(wrapper.current!);
    cleanup.current = () => {
      cancelAnimationFrame(pending);
      observer.disconnect();
      doc.removeEventListener('click', select, true);
      doc.removeEventListener('dblclick', dblclick, true);
      doc.removeEventListener('submit', prevent, true);
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('scroll', schedule, true);
      doc.removeEventListener('load', schedule, true);
      doc.removeEventListener('mouseover', schedule, true);
      doc.fonts?.removeEventListener('loadingdone', schedule);
      window.removeEventListener('resize', schedule);
    };
    setReady((value) => value + 1);
    schedule();
  };
  const finish = (save: boolean) => {
    const current = editValue.current;
    editValue.current = null;
    setEdit(null);
    if (save && current) props.onTextCommit(current.id, current.index, current.text);
  };
  return (
    <div className={`preview-stage ${props.width}`}>
      {(interacting || hasInteracted) && (
        <div className="interaction-bar">
          <span>
            {interacting
              ? t('useMenusAndButtonsToNavigateThen')
              : t('youAreEditingTheCurrentScreenUse')}
          </span>
          <button
            className="button"
            onClick={() => {
              setViewState(null);
              setInteractionEpoch((value) => value + 1);
            }}
          >
            {t('backToFirstScreen')}
          </button>
        </div>
      )}
      <div
        ref={wrapper}
        className="frame-wrap"
        style={{ width: props.width === 'mobile' ? 390 : props.width === 'tablet' ? 768 : '100%' }}
      >
        <iframe
          ref={frame}
          title={t('documentPreview')}
          sandbox="allow-same-origin"
          hidden={interacting}
          srcDoc={srcDoc}
          onLoad={attach}
        />
        {(hasInteracted || interacting) && (
          <InteractivePreview
            key={interactionEpoch}
            session={props.session}
            active={interacting}
            onView={onView}
          />
        )}
        <div className="overlay-layer" aria-hidden="true" hidden={interacting}>
          {selectionRect && (
            <div
              className={`selection-outline ${props.insertion ? 'image-insertion-outline' : ''}`}
              style={
                props.insertion && props.insertion !== 'self'
                  ? {
                      ...selectionRect,
                      height: 3,
                      top:
                        selectionRect.top +
                        (props.insertion === 'before' ? 0 : selectionRect.height),
                    }
                  : selectionRect
              }
            >
              <span>{t(props.insertion ? 'imagePreview' : 'selected')}</span>
            </div>
          )}
        </div>
        <div className="marker-layer" hidden={interacting}>
          {markers
            .filter(
              (marker) =>
                marker.rect.top >= -20 && marker.rect.top < (wrapper.current?.clientHeight ?? 1000),
            )
            .map((marker) => (
              <button
                className={`note-marker ${marker.done ? 'done' : ''}`}
                key={marker.id}
                style={{
                  left: Math.max(0, marker.rect.left - 9),
                  top: Math.max(2, marker.rect.top - 10),
                }}
                title={t('noteNumber', { number: marker.number })}
                aria-label={t('noteLocation', { number: marker.number })}
                onClick={() => props.onMarker(marker.id, marker.targetId)}
              >
                {marker.number}
              </button>
            ))}
        </div>
        {edit && !interacting && (
          <div
            className="inline-edit"
            style={{ ...edit.rect, minWidth: 130, height: Math.max(edit.rect.height, 46) }}
          >
            <textarea
              ref={input}
              data-htmledit-inline-editor="true"
              aria-label={t('inlineTextEditor')}
              value={edit.text}
              style={{
                fontSize: edit.fontSize,
                fontFamily: edit.fontFamily,
                lineHeight: edit.lineHeight,
              }}
              onChange={(event) => {
                const next = { ...edit, text: event.target.value };
                editValue.current = next;
                setEdit(next);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Escape') finish(false);
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) finish(true);
              }}
            />
            <div className="inline-actions">
              <button onClick={() => finish(false)}>{t('cancel')}</button>
              <button onClick={() => finish(true)}>{t('apply')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
