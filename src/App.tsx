import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  Check,
  CheckCheck,
  ChevronRight,
  CodeXml,
  Download,
  FileCode2,
  FolderOpen,
  ImagePlus,
  Info,
  Laptop,
  MessageSquarePlus,
  Monitor,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Undo2,
  Upload,
  X,
  Copy,
  AlertTriangle,
  CircleHelp,
  Hand,
} from 'lucide-react';
import Preview from './components/Preview';
import { EXAMPLE_HTML } from './example';
import {
  addNote,
  changeStyle,
  changeText,
  deleteElement,
  exportDocument,
  exportName,
  handoffMessage,
  listElements,
  readDocument,
  rebindNote,
  replaceImage,
  RELATIONS,
  updateNote,
  type DocumentSession,
  type Note,
  type Relation,
} from './model/document';
import { commit, createHistory, redo, undo, type History } from './model/history';
import { deleteDraft, loadDraft, saveDraft, type Draft } from './io/drafts';
import { assertHtmlSize, downloadHtml, readHtmlFile, readImageFile } from './io/files';
import {
  connectionToken,
  localRequest,
  ConnectionError,
  type LocalDocument,
  type LocalDraft,
} from './io/connection';

type Mode = 'select' | 'note' | 'interact';
type Tab = 'edit' | 'notes';
function rgbToHex(color: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const rgb = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  return rgb?.length === 3
    ? `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`
    : '#343e33';
}
const time = (value: number) =>
  new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

export default function App() {
  const [token] = useState(connectionToken);
  const [connected, setConnected] = useState<LocalDocument | null>(null);
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const [connectionStatus, setConnectionStatus] = useState(token ? '작업 파일에 연결 중…' : '');
  const [conflict, setConflict] = useState(false);
  const [localDraft, setLocalDraft] = useState<LocalDraft | null>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const copyingRef = useRef(false);
  const [copying, setCopying] = useState(false);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const leavingRef = useRef(false);
  const [history, setHistory] = useState<History<DocumentSession> | null>(null);
  const session = history?.present ?? null;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [documentEpoch, setDocumentEpoch] = useState(0);
  const [tab, setTab] = useState<Tab>('edit');
  const [width, setWidth] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [noteText, setNoteText] = useState('');
  const [relation, setRelation] = useState<Relation>('self');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [rebindId, setRebindId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const [jump, setJump] = useState<{ id: string; nonce: number } | null>(null);
  const [color, setColor] = useState('#343e33');
  const [fontSize, setFontSize] = useState('16');
  const [textEdits, setTextEdits] = useState<Record<number, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftStatus, setDraftStatus] = useState('임시 저장 준비');
  const [exportStatus, setExportStatus] = useState('HTML 저장 전');
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [modal, setModal] = useState<{
    title: string;
    message: string;
    action: string;
    run: () => void;
    secondary?: { label: string; run: () => void };
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [help, setHelp] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const savedSignature = useRef('');
  const autosaveGeneration = useRef(0);
  const lastComputed = useRef<{ id: string | null; color: string; fontSize: string } | null>(null);
  const elements = useMemo(() => (session ? listElements(session) : []), [session?.html]);
  const elementMap = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  );
  const selected = selectedId ? elementMap.get(selectedId) : undefined;
  const openCount = session?.notes.filter((note) => !note.done).length ?? 0;
  const dirty = session ? JSON.stringify(session) !== savedSignature.current : false;
  const handoffText = session
    ? connected
      ? `HTMLEdit 작업 파일 ${connected.file}의 미완료 메모를 반영해줘. htmledit 스킬의 checkout/apply 절차로 수정하고 완료한 메모만 표시해줘.`
      : handoffMessage(session)
    : '';
  const pendingInput = useRef(false);
  pendingInput.current = Boolean(noteText || Object.keys(textEdits).length);
  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);
  const change = useCallback(
    (transform: (current: DocumentSession) => DocumentSession) => {
      const current = sessionRef.current;
      if (!current) return false;
      try {
        const next = transform(current);
        // Every accepted edit must still round-trip through the supported input size.
        if (!next.metadataIssue) assertHtmlSize(exportDocument(next, 'review'));
        sessionRef.current = next;
        setHistory((h) => (h ? commit(h, next) : h));
        return true;
      } catch (error) {
        notify(error instanceof Error ? error.message : '변경을 적용하지 못했습니다.', true);
        return false;
      }
    },
    [notify],
  );
  useEffect(() => {
    if (token) return;
    loadDraft()
      .then(setDraft)
      .catch(() => setDraftStatus('임시 저장 공간을 읽을 수 없습니다'));
  }, []);
  useEffect(() => {
    const generation = ++autosaveGeneration.current;
    if (!session) return;
    if (token && JSON.stringify(session) === savedSignature.current) return;
    setDraftStatus('임시 저장 중…');
    const timer = window.setTimeout(() => {
      const connection = connectedRef.current;
      const persist =
        token && connection
          ? Promise.resolve()
              .then(() =>
                localRequest<{ savedAt: number }>(token, 'draft', 'PUT', {
                  html: exportDocument(session, 'review'),
                  revision: connection.revision,
                }),
              )
              .then((value) => value.savedAt)
          : saveDraft(session);
      persist
        .then((savedAt) => {
          if (generation === autosaveGeneration.current) {
            setDraftStatus(`임시 저장 ${time(savedAt)}`);
            setDraft({ session, savedAt });
          }
        })
        .catch(() => {
          if (generation === autosaveGeneration.current)
            setDraftStatus('임시 저장 실패 · HTML 파일을 저장해 주세요');
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [session, connected?.revision, token]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setTextEdits({});
  }, [selectedId, session?.html]);
  useEffect(() => {
    if (selectedId && !elementMap.has(selectedId)) setSelectedId(null);
  }, [elementMap, selectedId]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty && !leavingRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input,textarea,select') || target.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setHistory((h) => (h ? (event.shiftKey ? redo(h) : undo(h)) : h));
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        setHistory((h) => (h ? redo(h) : h));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const openSession = (next: DocumentSession, recovered = false) => {
    setDocumentEpoch((value) => value + 1);
    sessionRef.current = next;
    setHistory(createHistory(next));
    setSelectedId(null);
    setEditingNoteId(null);
    setRebindId(null);
    setNoteText('');
    setMode('select');
    setTab('edit');
    setExportStatus('HTML 저장 전');
    savedSignature.current = recovered ? '' : JSON.stringify(next);
  };
  const acceptLocal = (value: LocalDocument) => {
    connectedRef.current = value;
    setConnected(value);
    openSession(readDocument(value.html, value.fileName));
    setConflict(false);
    setConnectionStatus('작업 파일 연결됨');
    setExportStatus('작업 파일과 동기화됨');
  };
  const acceptLocalRef = useRef(acceptLocal);
  acceptLocalRef.current = acceptLocal;
  useEffect(() => {
    if (!token) return;
    let disposed = false;
    let polling = false;
    const initial = async () => {
      try {
        const value = await localRequest<LocalDocument>(token, 'document');
        if (disposed) return;
        acceptLocalRef.current(value);
        const stored = await localRequest<LocalDraft | null>(token, 'draft');
        if (
          !disposed &&
          stored &&
          stored.html !== exportDocument(readDocument(value.html, value.fileName), 'review')
        )
          setLocalDraft(stored);
      } catch (error) {
        if (!disposed) setConnectionStatus(error instanceof Error ? error.message : '연결 실패');
      }
    };
    void initial();
    const timer = setInterval(async () => {
      const current = connectedRef.current;
      if (disposed || polling || savingRef.current || openingRef.current || !current) return;
      polling = true;
      try {
        const status = await localRequest<{ revision: string }>(token, 'status');
        if (disposed || savingRef.current || openingRef.current) return;
        if (status.revision !== connectedRef.current?.revision) {
          const activeFrame = document.querySelector<HTMLIFrameElement>(
            'iframe[sandbox="allow-same-origin"]',
          );
          const inlineEditing = Boolean(
            activeFrame?.contentDocument?.querySelector('[contenteditable="true"]'),
          );
          if (
            pendingInput.current ||
            inlineEditing ||
            JSON.stringify(sessionRef.current) !== savedSignature.current
          ) {
            setConflict(true);
            setConnectionStatus('외부 변경 발견 · 내 작업을 보존한 뒤 다시 열어 주세요');
          } else {
            const value = await localRequest<LocalDocument>(token, 'document');
            if (
              !disposed &&
              !savingRef.current &&
              !openingRef.current &&
              !pendingInput.current &&
              JSON.stringify(sessionRef.current) === savedSignature.current
            )
              acceptLocalRef.current(value);
          }
        } else setConnectionStatus('작업 파일 연결됨');
      } catch {
        if (!disposed)
          setConnectionStatus('서버 연결 끊김 · 파일을 다시 열거나 현재 작업을 다운로드하세요');
      } finally {
        polling = false;
      }
    }, 1500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [token]);
  const reloadLocal = async () => {
    if (!token) return;
    try {
      const value = await localRequest<LocalDocument>(token, 'document');
      acceptLocal(value);
      void localRequest(token, 'draft', 'PUT', {
        html: value.html,
        revision: value.revision,
      }).catch(() => {});
      setLocalDraft(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : '다시 열기 실패', true);
    }
  };
  const replaceSession = (next: DocumentSession) => {
    if (session && dirty)
      setModal({
        title: '다른 문서를 여시겠어요?',
        message:
          '현재 작업을 파일로 저장했는지 확인해 주세요. 새 문서는 최근 임시 작업을 대체합니다.',
        action: '문서 열기',
        run: () => openSession(next),
      });
    else if (!session && draft)
      setModal({
        title: '최근 임시 작업을 대체할까요?',
        message:
          '아직 복구하지 않은 임시 작업이 있습니다. 새 문서를 열면 최근 임시 작업이 대체됩니다.',
        action: '새 문서 열기',
        run: () => openSession(next),
      });
    else openSession(next);
  };
  const openFile = async (file: File) => {
    if (token) {
      notify('연결 모드에서는 상단의 ‘다른 문서 열기’로 파일을 선택해 주세요.', true);
      return;
    }
    if (reading) return;
    setReading(true);
    try {
      replaceSession(readDocument(await readHtmlFile(file), file.name));
    } catch (error) {
      notify(error instanceof Error ? error.message : '파일을 열 수 없습니다.', true);
    } finally {
      setReading(false);
    }
  };
  const select = useCallback((id: string) => setSelectedId(id), []);
  const selectNoteTarget = useCallback((id: string) => {
    setSelectedId(id);
    setTab('notes');
    setTimeout(() => noteInput.current?.focus(), 0);
  }, []);
  const computed = useCallback(
    (style: { color: string; fontSize: string }) => {
      const previous = lastComputed.current;
      if (previous?.id !== selectedId || previous.color !== style.color)
        setColor(rgbToHex(style.color));
      if (previous?.id !== selectedId || previous.fontSize !== style.fontSize)
        setFontSize(String(Math.round(parseFloat(style.fontSize) * 10) / 10));
      lastComputed.current = { id: selectedId, ...style };
    },
    [selectedId],
  );
  const textCommit = useCallback(
    (id: string, index: number, value: string) =>
      change((current) => changeText(current, id, index, value)),
    [change],
  );
  const storeNote = () => {
    if (!noteText.trim() || (!editingNoteId && !selected)) return;
    const saved = change((current) =>
      editingNoteId
        ? updateNote(current, editingNoteId, { text: noteText, relation })
        : addNote(current, selected!.id, relation, noteText),
    );
    if (!saved) return;
    setNoteText('');
    setEditingNoteId(null);
    setRelation('self');
    notify('수정 요청을 저장했습니다.');
  };
  const save = async (kind: 'review' | 'clean', downloadOnly = false) => {
    if (!session) return false;
    try {
      if (token && connected && kind === 'review' && !downloadOnly) {
        if (savingRef.current) return false;
        savingRef.current = true;
        setSaving(true);
        const signature = JSON.stringify(session);
        const value = await localRequest<LocalDocument>(token, 'document', 'PUT', {
          html: exportDocument(session, 'review'),
          revision: connected.revision,
        });
        connectedRef.current = value;
        setConnected(value);
        savedSignature.current = signature;
        void localRequest(token, 'draft', 'PUT', {
          html: value.html,
          revision: value.revision,
        }).catch(() => {});
        setConflict(false);
        setLocalDraft(null);
        setExportStatus(`작업 파일 저장 ${time(Date.now())}`);
        notify('작업 파일을 저장했습니다. AI 대화에 “메모 반영해줘”라고 요청하세요.');
        return true;
      }
      downloadHtml(exportDocument(session, kind), exportName(session.fileName, kind));
      if (!token) savedSignature.current = JSON.stringify(session);
      setExportStatus(`${kind === 'review' ? 'AI 전달용' : '완성본'} 저장 ${time(Date.now())}`);
      notify(`${exportName(session.fileName, kind)} 파일을 저장했습니다.`);
      return true;
    } catch (error) {
      if (error instanceof ConnectionError && error.code === 'CONFLICT') setConflict(true);
      notify(error instanceof Error ? error.message : '저장하지 못했습니다.', true);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const chooseLocalDocument = async (saveFirst: boolean) => {
    if (!token || openingRef.current || savingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    try {
      if (saveFirst && !(await save('review'))) return;
      const result = await localRequest<{ url: string } | null>(token, 'open-document', 'POST', {});
      if (!result) {
        notify('파일 선택을 취소했습니다. 현재 문서를 계속 편집할 수 있습니다.');
        return;
      }
      const url = new URL(result.url);
      if (url.origin === location.origin) {
        notify('현재 편집 중인 문서입니다. 작업을 그대로 유지합니다.');
        return;
      }
      if (
        url.protocol !== 'http:' ||
        url.hostname !== '127.0.0.1' ||
        url.username ||
        url.password ||
        !/^#htmledit=[a-f0-9]{64}$/.test(url.hash)
      )
        throw new Error('새 문서 연결 주소를 확인할 수 없습니다.');
      // Persist a recovery copy before leaving, including on the discard path.
      // A picker cancellation or failure never clears the current history.
      const current = sessionRef.current;
      const connection = connectedRef.current;
      if (current && connection && JSON.stringify(current) !== savedSignature.current)
        await localRequest(token, 'draft', 'PUT', {
          html: exportDocument(current, 'review'),
          revision: connection.revision,
        });
      leavingRef.current = true;
      window.location.assign(url.href);
    } catch (error) {
      leavingRef.current = false;
      notify(
        error instanceof Error
          ? error.message
          : '새 문서를 열지 못했습니다. 현재 작업은 유지됩니다.',
        true,
      );
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };
  const openAnotherDocument = () => {
    if (!token) {
      fileInput.current?.click();
      return;
    }
    if (pendingInput.current || document.querySelector('[aria-label="문구 직접 편집"]')) {
      notify('작성 중인 문구나 메모를 먼저 적용하거나 취소한 뒤 다른 문서를 열어 주세요.', true);
      return;
    }
    if (dirty)
      setModal({
        title: '현재 작업을 저장할까요?',
        message:
          '아직 작업 파일에 저장하지 않은 변경이 있습니다. 저장 여부를 선택한 다음 Windows 파일 선택 창에서 다른 HTML을 고르세요. 파일 선택을 취소하면 현재 문서는 유지됩니다.',
        action: '저장 후 문서 선택',
        run: () => void chooseLocalDocument(true),
        secondary: { label: '저장하지 않고 문서 선택', run: () => void chooseLocalDocument(false) },
      });
    else void chooseLocalDocument(false);
  };
  const copy = async () => {
    if (!session || copyingRef.current || savingRef.current || openingRef.current) return;
    if (pendingInput.current || document.querySelector('[aria-label="문구 직접 편집"]')) {
      notify('작성 중인 문구나 메모를 먼저 적용하거나 취소한 뒤 AI 요청을 복사해 주세요.', true);
      return;
    }
    if (session.metadataIssue || conflict || (token && !connected)) return;
    copyingRef.current = true;
    setCopying(true);
    const signature = JSON.stringify(session);
    try {
      if (!(await save('review'))) return;
      if (
        JSON.stringify(sessionRef.current) !== signature ||
        pendingInput.current ||
        document.querySelector('[aria-label="문구 직접 편집"]')
      ) {
        notify('저장 중 작업이 변경됐습니다. 변경을 적용한 뒤 AI 요청을 다시 복사해 주세요.', true);
        return;
      }
      await navigator.clipboard.writeText(handoffText);
      notify(
        connected
          ? '작업 파일을 저장하고 AI 요청을 복사했습니다. AI 대화에 붙여넣으세요.'
          : '전달용 HTML 다운로드를 시작하고 AI 요청을 복사했습니다. 파일을 함께 첨부해 주세요.',
      );
    } catch {
      notify(
        '작업은 저장됐지만 자동 복사하지 못했습니다. 사용 방법에서 전달 문구를 복사해 주세요.',
        true,
      );
      setHelp(true);
    } finally {
      copyingRef.current = false;
      setCopying(false);
    }
  };
  const editNote = (note: Note) => {
    setEditingNoteId(note.id);
    setNoteText(note.text);
    setRelation(note.relation);
    setTab('notes');
    setTimeout(() => noteInput.current?.focus(), 0);
  };
  const jumpTo = (id: string) => {
    setSelectedId(id);
    setJump({ id, nonce: Date.now() });
  };
  const marker = (noteId: string, targetId: string) => {
    setSelectedId(targetId);
    setTab('notes');
    setFilter('all');
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-note-id="${CSS.escape(noteId)}"]`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
  };
  const removeSelected = () => {
    if (!selected) return;
    setModal({
      title: '선택한 요소를 삭제할까요?',
      message: `〈${selected.tag}〉 ${selected.excerpt || '선택 영역'}와 그 안의 내용이 삭제됩니다. 연결된 메모는 유지되며 실행 취소로 복원할 수 있습니다.`,
      action: '요소 삭제',
      run: () => change((current) => deleteElement(current, selected.id)),
    });
  };
  const discardBadMetadata = () =>
    setModal({
      title: '읽을 수 없는 메모를 제외할까요?',
      message:
        '불러온 원본 파일을 보관해 주세요. 문서 디자인과 내용은 유지하며, 읽을 수 없는 메모를 제외한 새 파일을 저장할 수 있게 됩니다.',
      action: '메모 제외',
      run: () => change((current) => ({ ...current, metadataIssue: undefined })),
    });

  return (
    <div
      className="app"
      inert={opening}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes('Files')) setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const files = event.dataTransfer.files;
        if (files.length !== 1) notify('HTML 파일 한 개를 놓아 주세요.', true);
        else void openFile(files[0]);
      }}
    >
      <input
        ref={fileInput}
        data-testid="html-file"
        type="file"
        accept=".html,.htm,text/html"
        hidden
        onChange={(event) => {
          if (event.target.files?.[0]) void openFile(event.target.files[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={imageInput}
        data-testid="image-file"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          const id = selectedId;
          const captured = sessionRef.current;
          if (!file || !id) return;
          try {
            const data = await readImageFile(file);
            if (sessionRef.current !== captured)
              throw new Error('문서가 변경되었습니다. 이미지를 다시 선택해 주세요.');
            change((current) => replaceImage(current, id, data));
          } catch (error) {
            notify(error instanceof Error ? error.message : '이미지를 교체하지 못했습니다.', true);
          }
        }}
      />
      <header className="app-header">
        <div className="logo">
          <span className="logo-symbol">
            <CodeXml size={21} />
          </span>
          <span>
            HTML<span className="logo-light">Edit</span>
            <small>LOCAL WORKSPACE</small>
          </span>
        </div>
        <div className="header-center">
          <span className="status-dot" />내 PC에서 편집
        </div>
        <button className="help-button" onClick={() => setHelp(true)}>
          <CircleHelp size={16} />
          사용 방법
        </button>
      </header>
      <div className="toolbar">
        <button
          className="button"
          onClick={openAnotherDocument}
          disabled={reading || opening || saving || copying || (Boolean(token) && !connected)}
        >
          <FolderOpen size={16} />
          {reading ? '불러오는 중…' : token ? '다른 문서 열기' : 'HTML 열기'}
        </button>
        <span className="toolbar-divider" />
        <div className="mode-switch" aria-label="편집 모드">
          <button
            className={mode === 'interact' ? 'active' : ''}
            disabled={!session}
            onClick={() => {
              setMode('interact');
              setSelectedId(null);
              setTab('edit');
            }}
          >
            <Hand size={15} />
            문서 조작
          </button>
          <button
            className={mode === 'select' ? 'active' : ''}
            disabled={!session}
            onClick={() => {
              setMode('select');
              setTab('edit');
            }}
          >
            <MousePointer2 size={15} />
            직접 편집
          </button>
          <button
            className={mode === 'note' ? 'active' : ''}
            disabled={!session}
            onClick={() => {
              setMode('note');
              setTab('notes');
            }}
          >
            <MessageSquarePlus size={15} />
            메모 남기기
          </button>
        </div>
        <div className="history-controls">
          <button
            className="icon-button"
            aria-label="실행 취소"
            title="실행 취소 Ctrl+Z"
            disabled={!history?.past.length}
            onClick={() => setHistory((h) => (h ? undo(h) : h))}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="다시 실행"
            title="다시 실행 Ctrl+Shift+Z"
            disabled={!history?.future.length}
            onClick={() => setHistory((h) => (h ? redo(h) : h))}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <div className="toolbar-spacer" />
        <button
          className="button secondary"
          disabled={!session || Boolean(session.metadataIssue) || copying}
          onClick={() => save('clean')}
        >
          <Download size={15} />
          완성본 저장
        </button>
        <button
          className="button primary"
          disabled={!session || Boolean(session.metadataIssue) || saving || copying || conflict}
          onClick={() => save('review')}
        >
          <Sparkles size={15} />
          {token ? (saving ? '저장 중…' : '작업 파일 저장') : 'AI 전달용 저장'}
        </button>
      </div>
      {token && (
        <div className={`connection-bar ${conflict ? 'conflict' : ''}`} role="status">
          <div>
            <strong>{connectionStatus}</strong>
            {connected && <small title={connected.file}>{connected.file}</small>}
          </div>
          <div className="connection-actions">
            {session && (
              <button className="button" onClick={() => save('review', true)}>
                내 작업 별도 저장
              </button>
            )}
            {conflict && (
              <button
                className="button"
                onClick={() =>
                  setModal({
                    title: '디스크 버전을 다시 열까요?',
                    message: '미저장 변경은 대체됩니다. 필요한 작업은 먼저 별도 파일로 저장하세요.',
                    action: '디스크 버전 다시 열기',
                    run: () => void reloadLocal(),
                  })
                }
              >
                디스크 버전 다시 열기
              </button>
            )}
            {localDraft && (
              <button
                className="button"
                onClick={() => {
                  if (!connected) return;
                  try {
                    openSession(readDocument(localDraft.html, connected.fileName), true);
                    setConflict(localDraft.revision !== connected.revision);
                    setConnected({ ...connected, revision: localDraft.revision });
                    setLocalDraft(null);
                  } catch {
                    notify('임시 작업을 복구할 수 없습니다.', true);
                  }
                }}
              >
                연결 작업 복구
              </button>
            )}
          </div>
        </div>
      )}
      {!session ? (
        <main className="welcome">
          <div className="welcome-label">
            <span />
            FROM AI TO YOUR HANDS
          </div>
          <h1>
            화면에서 고치고,
            <br />
            <span>메모로 전달하세요.</span>
          </h1>
          <p className="welcome-intro">
            AI가 만든 HTML, 이제 원하는 곳을 직접 짚어보세요.
            <br />
            간단한 수정은 손으로, 다음 작업은 그 자리에 메모로.
          </p>
          <div className={`dropzone ${dragOver ? 'dragging' : ''}`}>
            <div className="upload-symbol">
              <Upload size={28} strokeWidth={1.5} />
            </div>
            <h2>HTML 파일을 여기에 놓아주세요</h2>
            <p>.html · .htm / 파일 하나로 시작합니다</p>
            <button className="button primary" onClick={() => fileInput.current?.click()}>
              <FolderOpen size={16} />
              파일 선택
            </button>
            <small>문서 처리는 이 브라우저 안에서 이루어집니다.</small>
          </div>
          <button
            className="example-button"
            onClick={() => replaceSession(readDocument(EXAMPLE_HTML, 'onyu-studio.html'))}
          >
            <FileCode2 size={17} />
            <span>
              파일이 없다면, <strong>예제 문서로 둘러보기</strong>
            </span>
            <ChevronRight size={16} />
          </button>
          {draft && (
            <div className="draft-card">
              <RotateCcw size={18} />
              <div>
                <strong>최근 임시 작업이 있어요</strong>
                <span>
                  {draft.session.fileName} · {new Date(draft.savedAt).toLocaleString('ko-KR')}
                </span>
              </div>
              <button
                className="button"
                onClick={() => {
                  openSession(draft.session, true);
                  notify('최근 임시 작업을 복구했습니다.');
                }}
              >
                복구하기
              </button>
              <button
                className="icon-button"
                aria-label="임시 작업 삭제"
                onClick={() =>
                  setModal({
                    title: '임시 작업을 삭제할까요?',
                    message:
                      '이 브라우저에 저장된 최근 임시 작업을 삭제합니다. 저장한 HTML 파일은 영향을 받지 않습니다.',
                    action: '임시 작업 삭제',
                    run: () => {
                      void deleteDraft()
                        .then(() => {
                          setDraft(null);
                          notify('임시 작업을 삭제했습니다.');
                        })
                        .catch(() => notify('임시 작업을 삭제하지 못했습니다.', true));
                    },
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
          {!draft && draftStatus.includes('읽을 수') && (
            <p className="error-text">{draftStatus} · HTML 파일로 작업을 보관해 주세요.</p>
          )}
          <div className="welcome-steps">
            <span>
              <MousePointer2 size={17} />
              <strong>직접 고치기</strong>
              <small>문구와 이미지, 글자 스타일</small>
            </span>
            <span>
              <MessageSquarePlus size={17} />
              <strong>위치에 메모하기</strong>
              <small>설명 대신, 원하는 곳을 짚어서</small>
            </span>
            <span>
              <Sparkles size={17} />
              <strong>AI에게 전달하기</strong>
              <small>수정 요청까지 담긴 HTML 하나</small>
            </span>
          </div>
        </main>
      ) : (
        <main className="workspace">
          <section className="document-pane">
            <div className="document-bar">
              <div className="document-name">
                <FileCode2 size={16} />
                <strong>{session.fileName}</strong>
                {dirty && <span className="unsaved-dot" title="파일 저장 전 변경 내용" />}
              </div>
              <div className="viewport-switch">
                <button
                  className={width === 'desktop' ? 'active' : ''}
                  onClick={() => setWidth('desktop')}
                  aria-label="데스크톱 너비"
                  title="데스크톱"
                >
                  <Monitor size={15} />
                </button>
                <button
                  className={width === 'tablet' ? 'active' : ''}
                  onClick={() => setWidth('tablet')}
                  aria-label="태블릿 너비"
                  title="태블릿 768px"
                >
                  <Tablet size={15} />
                </button>
                <button
                  className={width === 'mobile' ? 'active' : ''}
                  onClick={() => setWidth('mobile')}
                  aria-label="모바일 너비"
                  title="모바일 390px"
                >
                  <Smartphone size={15} />
                </button>
              </div>
            </div>
            {session.metadataIssue && (
              <div className="metadata-alert">
                <AlertTriangle size={16} />
                <span>
                  메모를 읽을 수 없습니다: {session.metadataIssue} 원본을 보관한 뒤 선택해 주세요.
                </span>
                <button onClick={discardBadMetadata}>읽을 수 없는 메모 제외</button>
              </div>
            )}
            {session.warnings.length > 0 && (
              <details className="document-warnings">
                <summary>
                  <Info size={14} />
                  문서 표시 안내 {session.warnings.length}개
                </summary>
                <ul>
                  {session.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            <Preview
              key={documentEpoch}
              session={session}
              selectedId={selectedId}
              mode={mode}
              width={width}
              onSelect={select}
              onNoteTarget={selectNoteTarget}
              onMarker={marker}
              onHistory={(direction) =>
                setHistory((h) => (h ? (direction === 'undo' ? undo(h) : redo(h)) : h))
              }
              onTextCommit={textCommit}
              onComputedStyle={computed}
              jump={jump}
            />
            <div className="document-footer">
              <span>
                <MousePointer2 size={13} />
                {mode === 'interact'
                  ? '메뉴·탭을 눌러 화면 이동 → 직접 편집 또는 메모 남기기'
                  : mode === 'select'
                    ? '요소 클릭으로 선택 · 문구 더블클릭으로 수정'
                    : '메모를 남길 요소를 클릭하세요'}
              </span>
              <span>
                {width === 'desktop' ? '데스크톱' : width === 'tablet' ? '768 px' : '390 px'}
              </span>
            </div>
          </section>
          <aside className="sidebar">
            <div className="sidebar-tabs">
              <button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>
                요소 편집
              </button>
              <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
                수정 메모 <span>{session.notes.length}</span>
              </button>
            </div>
            <div className="sidebar-scroll">
              {tab === 'edit' ? (
                <>
                  {selected ? (
                    <>
                      <div className="section-caption">선택한 요소</div>
                      <div className="selected-card">
                        <span className="tag-name">{selected.tag}</span>
                        <p>{selected.excerpt || '텍스트가 없는 요소'}</p>
                        <button
                          className="text-button"
                          disabled={!selected.parentId}
                          onClick={() => selected.parentId && jumpTo(selected.parentId)}
                        >
                          <ArrowUp size={13} />
                          상위 요소 선택
                        </button>
                      </div>
                      <div className="section-caption">글자 스타일</div>
                      <label className="field-label">글자색</label>
                      <div className="color-field">
                        <input
                          aria-label="글자색 선택"
                          type="color"
                          value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#343e33'}
                          onChange={(event) => setColor(event.target.value)}
                        />
                        <input
                          aria-label="글자색 코드"
                          value={color}
                          onChange={(event) => setColor(event.target.value)}
                          maxLength={7}
                        />
                        <button
                          className="small-button"
                          onClick={() =>
                            change((current) => changeStyle(current, selected.id, 'color', color))
                          }
                        >
                          적용
                        </button>
                      </div>
                      <label className="field-label" htmlFor="font-size">
                        글자 크기
                      </label>
                      <div className="number-field">
                        <input
                          id="font-size"
                          type="number"
                          min="1"
                          max="256"
                          step="0.5"
                          value={fontSize}
                          onChange={(event) => setFontSize(event.target.value)}
                        />
                        <span>px</span>
                        <button
                          className="small-button"
                          onClick={() =>
                            change((current) =>
                              changeStyle(current, selected.id, 'font-size', `${fontSize}px`),
                            )
                          }
                        >
                          적용
                        </button>
                      </div>
                      {selected.textParts.length > 0 && (
                        <>
                          <div className="section-caption">문구 수정</div>
                          {selected.textParts.map((part, index) => (
                            <div className="text-part" key={part.index}>
                              <label className="sr-only" htmlFor={`text-${part.index}`}>
                                문구 {index + 1}
                              </label>
                              <textarea
                                id={`text-${part.index}`}
                                value={textEdits[part.index] ?? part.value}
                                onChange={(event) =>
                                  setTextEdits((values) => ({
                                    ...values,
                                    [part.index]: event.target.value,
                                  }))
                                }
                              />
                              <button
                                className="small-button"
                                onClick={() =>
                                  textCommit(
                                    selected.id,
                                    part.index,
                                    textEdits[part.index] ?? part.value,
                                  )
                                }
                              >
                                문구 적용
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      {selected.tag === 'img' && (
                        <>
                          <div className="section-caption">이미지</div>
                          <button
                            className="button full-width"
                            onClick={() => imageInput.current?.click()}
                          >
                            <ImagePlus size={15} />
                            이미지 교체
                          </button>
                          <p className="field-hint">
                            PNG · JPEG · WebP · GIF / 최대 10MB
                            <br />새 이미지는 저장하는 HTML에 포함됩니다.
                          </p>
                        </>
                      )}
                      <div className="element-actions">
                        <button
                          className="button full-width"
                          onClick={() => {
                            setTab('notes');
                            setMode('note');
                            setTimeout(() => noteInput.current?.focus(), 0);
                          }}
                        >
                          <MessageSquarePlus size={15} />이 요소에 메모 남기기
                        </button>
                        <button
                          className="danger-button"
                          disabled={selected.tag === 'body'}
                          onClick={removeSelected}
                        >
                          <Trash2 size={14} />
                          선택 요소 삭제
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="sidebar-empty">
                      <MousePointer2 size={28} strokeWidth={1.3} />
                      <h3>
                        {mode === 'interact'
                          ? '원하는 화면으로 이동하세요'
                          : '수정할 곳을 클릭하세요'}
                      </h3>
                      <p>
                        {mode === 'interact' ? (
                          <>
                            문서의 메뉴와 버튼이 동작합니다.
                            <br />
                            수정할 화면에서 직접 편집을 누르세요.
                          </>
                        ) : (
                          <>
                            문구, 이미지 또는 카드 영역을
                            <br />
                            선택하면 여기서 수정할 수 있어요.
                          </>
                        )}
                      </p>
                      <div className="tip-card">
                        <strong>작은 팁</strong>
                        <p>
                          {mode === 'interact' ? (
                            <>
                              편집 모드로 바꿔도
                              <br />
                              현재 화면이 유지됩니다.
                            </>
                          ) : (
                            <>
                              문구를 더블클릭하면 화면에서
                              <br />
                              바로 고칠 수 있습니다.
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="sidebar-bottom-tip">
                    <Info size={14} />
                    <p>
                      새 요소 추가나 복잡한 배치 변경은
                      <br />그 자리에 메모로 남겨주세요.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="note-summary">
                    <div>
                      <strong>{openCount}</strong>
                      <span>개의 요청이 기다리고 있어요</span>
                    </div>
                    <small>
                      전체 {session.notes.length} · 완료 {session.notes.length - openCount}
                    </small>
                  </div>
                  {rebindId && (
                    <div className="rebind-box">
                      <p>문서에서 새 대상을 선택한 뒤 연결하세요.</p>
                      <button
                        className="button primary full-width"
                        disabled={!selected}
                        onClick={() => {
                          change((current) => rebindNote(current, rebindId, selected!.id));
                          setRebindId(null);
                          notify('메모 대상을 다시 연결했습니다.');
                        }}
                      >
                        선택한 요소에 연결
                      </button>
                      <button className="text-button" onClick={() => setRebindId(null)}>
                        취소
                      </button>
                    </div>
                  )}
                  <div className="note-composer">
                    <div className="section-caption">
                      {editingNoteId ? '메모 수정' : '새 수정 요청'}
                    </div>
                    <div className="composer-target">
                      <span className="status-dot" />
                      <span>
                        {editingNoteId
                          ? '기존 메모의 대상'
                          : selected
                            ? `〈${selected.tag}〉 ${selected.excerpt || '선택 요소'}`
                            : '문서에서 대상을 먼저 선택하세요'}
                      </span>
                    </div>
                    <label className="field-label" htmlFor="note-relation">
                      요청할 위치
                    </label>
                    <select
                      id="note-relation"
                      value={relation}
                      onChange={(event) => setRelation(event.target.value as Relation)}
                    >
                      {Object.entries(RELATIONS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      ref={noteInput}
                      aria-label="수정 요청"
                      placeholder="예: 이 제목 앞에 집 모양 아이콘을 넣어주세요."
                      value={noteText}
                      maxLength={20_000}
                      onChange={(event) => setNoteText(event.target.value)}
                    />
                    <button
                      className="button primary full-width"
                      disabled={!noteText.trim() || (!editingNoteId && !selected)}
                      onClick={storeNote}
                    >
                      <Plus size={15} />
                      {editingNoteId ? '메모 수정 저장' : '메모 추가'}
                    </button>
                    {editingNoteId && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setEditingNoteId(null);
                          setNoteText('');
                        }}
                      >
                        수정 취소
                      </button>
                    )}
                  </div>
                  <div className="note-filters">
                    {(
                      [
                        ['all', '전체'],
                        ['open', '미완료'],
                        ['done', '완료'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        className={filter === value ? 'active' : ''}
                        key={value}
                        onClick={() => setFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="note-list">
                    {session.notes
                      .map((note, index) => ({ note, index }))
                      .filter(
                        ({ note }) =>
                          filter === 'all' || (filter === 'done' ? note.done : !note.done),
                      )
                      .map(({ note, index }) => {
                        const exists = elementMap.has(note.targetId);
                        return (
                          <article
                            key={note.id}
                            className={`note-card ${note.done ? 'complete' : ''}`}
                            data-testid="note-card"
                            data-note-id={note.id}
                          >
                            <div className="note-card-top">
                              <button
                                className="note-number"
                                disabled={!exists}
                                onClick={() => jumpTo(note.targetId)}
                              >
                                {index + 1}
                              </button>
                              <span>
                                {exists
                                  ? `〈${note.target.tag}〉 ${RELATIONS[note.relation]}`
                                  : '대상 없음'}
                              </span>
                              <button
                                className="icon-button"
                                aria-label={`메모 ${index + 1} 삭제`}
                                onClick={() => {
                                  change((current) => ({
                                    ...current,
                                    notes: current.notes.filter((item) => item.id !== note.id),
                                  }));
                                  if (editingNoteId === note.id) {
                                    setEditingNoteId(null);
                                    setNoteText('');
                                  }
                                  if (rebindId === note.id) setRebindId(null);
                                }}
                              >
                                <X size={13} />
                              </button>
                            </div>
                            <p className="note-content">{note.text}</p>
                            <small className="target-excerpt">
                              {note.target.excerpt || note.target.tag}
                            </small>
                            <div className="note-card-actions">
                              <button
                                onClick={() =>
                                  change((current) =>
                                    updateNote(current, note.id, { done: !note.done }),
                                  )
                                }
                              >
                                {note.done ? <RotateCcw size={12} /> : <Check size={12} />}
                                {note.done ? '다시 열기' : '완료'}
                              </button>
                              <button onClick={() => editNote(note)}>수정</button>
                              <button
                                onClick={() => {
                                  setRebindId(note.id);
                                  setMode('select');
                                }}
                              >
                                대상 재지정
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    {session.notes.length === 0 && (
                      <div className="no-notes">
                        <MessageSquarePlus size={23} strokeWidth={1.4} />
                        <p>
                          아직 남긴 메모가 없어요.
                          <br />
                          화면에서 원하는 위치를 짚어보세요.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="sidebar-footer">
              <button
                className="button full-width"
                onClick={() => void copy()}
                disabled={
                  saving ||
                  copying ||
                  opening ||
                  conflict ||
                  Boolean(session.metadataIssue) ||
                  (Boolean(token) && !connected)
                }
              >
                <Copy size={14} />
                {copying ? '저장하고 복사 중…' : '저장하고 AI 요청 복사'}
              </button>
              <p>
                {token
                  ? '현재 수정과 메모를 저장한 뒤 요청을 복사합니다.'
                  : '전달용 HTML을 내려받고 요청을 복사합니다. 파일도 함께 첨부하세요.'}
              </p>
            </div>
          </aside>
        </main>
      )}
      <footer className="app-footer">
        <span>
          <Laptop size={13} />
          {token ? '내 PC의 작업 파일에 연결되어 있습니다' : '문서는 브라우저 안에서 처리됩니다'}
        </span>
        <div>
          <span>{session ? draftStatus : '정적 HTML 문서 편집기'}</span>
          {session && (
            <>
              <span className="footer-separator">·</span>
              <span>
                {exportStatus}
                {dirty && exportStatus !== 'HTML 저장 전' ? ' · 추가 변경 있음' : ''}
              </span>
            </>
          )}
        </div>
      </footer>
      {dragOver && (
        <div className="drag-overlay">
          <Upload size={40} />
          <h2>HTML 파일을 놓아주세요</h2>
          <p>문서 한 개를 열어 편집합니다.</p>
        </div>
      )}
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`toast ${toast.error ? 'error' : ''}`}
        >
          {toast.error ? <AlertTriangle size={17} /> : <CheckCheck size={17} />}
          <span>{toast.text}</span>
          <button className="icon-button" aria-label="알림 닫기" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal.title}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{modal.title}</h2>
            <p>{modal.message}</p>
            <div className="modal-actions">
              <button className="button" onClick={() => setModal(null)}>
                취소
              </button>
              {modal.secondary && (
                <button
                  className="button"
                  onClick={() => {
                    const action = modal.secondary!.run;
                    setModal(null);
                    action();
                  }}
                >
                  {modal.secondary.label}
                </button>
              )}
              <button
                className="button primary"
                onClick={() => {
                  const action = modal.run;
                  setModal(null);
                  action();
                }}
              >
                {modal.action}
              </button>
            </div>
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="사용 방법"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="사용 방법 닫기"
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </button>
            <span className="section-caption">HTML EDIT · QUICK GUIDE</span>
            <h2>원하는 곳을 짚어서, 더 쉽게.</h2>
            <ol>
              <li>
                <strong>HTML을 열어주세요.</strong>
                <p>CSS와 이미지가 포함된 단일 HTML 문서를 권장합니다.</p>
              </li>
              <li>
                <strong>간단한 수정은 직접 하세요.</strong>
                <p>
                  요소를 클릭해 선택하거나 문구를 더블클릭하세요. 문구 입력 중 Ctrl+Enter로 적용하고
                  Esc로 취소합니다. 카드 전체는 ‘상위 요소 선택’으로 지정하세요.
                </p>
              </li>
              <li>
                <strong>복잡한 작업은 메모로 남기세요.</strong>
                <p>원하는 요소를 선택하고 앞·뒤·안쪽 등 위치와 요청을 입력하세요.</p>
              </li>
              <li>
                <strong>파일 하나로 AI에게 전달하세요.</strong>
                <p>
                  {token
                    ? '‘저장하고 AI 요청 복사’를 누르면 현재 수정과 메모가 작업 파일에 저장됩니다. 복사한 요청을 AI 대화에 붙여넣으세요. AI가 반영한 결과는 열린 편집기에 자동으로 표시됩니다.'
                    : '‘저장하고 AI 요청 복사’를 누르면 메모를 포함한 HTML을 내려받고 요청을 복사합니다. 파일과 요청을 함께 AI에게 전달하세요.'}
                </p>
              </li>
            </ol>
            <div className="help-note">
              임시 저장은 이 브라우저의 최근 작업 하나를 보관합니다. 장기 보관은 HTML 파일로
              저장하세요. 완성본에는 수정 메모가 포함되지 않습니다.
            </div>
            {session && (
              <textarea
                className="handoff-text"
                aria-label="AI 전달 설명"
                readOnly
                value={handoffText}
              />
            )}
            <button className="button primary" onClick={() => setHelp(false)}>
              알겠습니다
            </button>
          </section>
        </div>
      )}
      {opening &&
        createPortal(
          <div className="modal-backdrop">
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="다른 문서 연결 중"
            >
              <h2>다른 문서 열기</h2>
              <p>
                Windows 파일 선택 창에서 HTML 문서를 선택하거나 취소해 주세요. 저장과 새 문서 연결이
                끝날 때까지 현재 작업을 유지합니다.
              </p>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
