import { useEffect, useMemo, useRef, useState } from 'react';
import { listElements, previewHtml, type DocumentSession } from '../model/document';
import { interactionBridge, validateViewState, type ViewState } from '../preview/interaction';

interface Props {
  session: DocumentSession;
  active: boolean;
  onView: (state: ViewState) => void;
}

export default function InteractivePreview(props: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [initial] = useState(() => ({ html: props.session.html, token: crypto.randomUUID() }));
  const [connected, setConnected] = useState(false);
  const [failed, setFailed] = useState(false);
  const port = useRef<MessagePort | null>(null);
  const previousHtml = useRef(initial.html);
  const revision = useRef(0);
  const source = useMemo(
    () =>
      previewHtml(
        { ...props.session, html: initial.html },
        `(${interactionBridge.toString()})(${JSON.stringify(initial.token)});`,
      ),
    [initial],
  );
  const sync = () => {
    if (!port.current) return;
    const html = latest.current.session.html;
    port.current.postMessage({
      type: 'sync',
      beforeHtml: previousHtml.current,
      html,
      revision: ++revision.current,
    });
    previousHtml.current = html;
  };
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== 'htmledit-ready' ||
        event.data.token !== initial.token ||
        port.current
      )
        return;
      const channel = new MessageChannel();
      port.current = channel.port1;
      channel.port1.onmessage = ({ data }) => {
        if (data?.type !== 'view' || data.revision !== revision.current) return;
        const ids = new Set(listElements(latest.current.session).map((el) => el.id));
        const state = validateViewState(data.state, ids);
        if (state) latest.current.onView(state);
      };
      channel.port1.start();
      // Opaque sandbox origins require '*'. Only a port is transferred; subsequent
      // document patches use this channel, which does not follow frame navigation.
      frame.current!.contentWindow!.postMessage(
        { type: 'htmledit-connect', token: initial.token },
        '*',
        [channel.port2],
      );
      sync();
      channel.port1.postMessage({ type: 'active', active: latest.current.active });
      setConnected(true);
      setFailed(false);
    };
    window.addEventListener('message', ready);
    const timeout = window.setTimeout(() => {
      if (!port.current) setFailed(true);
    }, 8000);
    return () => {
      window.removeEventListener('message', ready);
      clearTimeout(timeout);
      port.current?.close();
      port.current = null;
    };
  }, [initial]);
  useEffect(sync, [props.session.html]);
  useEffect(() => {
    port.current?.postMessage({ type: 'active', active: props.active });
  }, [props.active]);
  return (
    <>
      {props.active && !connected && (
        <p className="interaction-status" role="status">
          {failed
            ? '문서 조작을 준비하지 못했습니다. 첫 화면으로 돌아가 다시 시도해 주세요.'
            : '문서 조작 준비 중…'}
        </p>
      )}
      <iframe
        ref={frame}
        title="문서 동작 미리보기"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        hidden={!props.active}
        srcDoc={source}
        onLoad={() => {
          if (port.current) {
            port.current.close();
            port.current = null;
            setConnected(false);
            setFailed(true);
          }
        }}
      />
    </>
  );
}
