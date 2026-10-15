import { useLocale, LanguageSelect } from './i18n/react';
import { message, MessageError, describeError, type DisplayMessage } from './i18n';
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
import ImagePanel, { type ImageRequest, type ImagePreview } from './components/ImagePanel';
import { exampleHtml } from './example';
import {
  addNote,
  changeStyle,
  changeText,
  deleteElements,
  noteTargets,
  exportDocument,
  exportName,
  handoffMessage,
  listElements,
  readDocument,
  rebindNote,
  RELATIONS,
  updateNote,
  type DocumentSession,
  type Note,
  type Relation,
} from './model/document';
import { commit, createHistory, redo, undo, type History } from './model/history';
import { deleteDraft, loadDraft, saveDraft, type Draft } from './io/drafts';
import { assertHtmlSize, downloadHtml, readHtmlFile } from './io/files';
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

export default function App() {
  const { t, format, locale } = useLocale();
  const [token] = useState(connectionToken);
  const [connected, setConnected] = useState<LocalDocument | null>(null);
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const [connectionStatus, setConnectionStatus] = useState<DisplayMessage>(
    token ? message('connectingToTheWorkingFile') : '',
  );
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.at(-1) ?? null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
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
  const [draftStatus, setDraftStatus] = useState<DisplayMessage>(message('draftReady'));
  const [exportStatus, setExportStatus] = useState<DisplayMessage>(message('htmlNotSavedYet'));
  const [toast, setToast] = useState<{ text: DisplayMessage; error?: boolean } | null>(null);
  const [modal, setModal] = useState<{
    title: DisplayMessage;
    message: DisplayMessage;
    action: DisplayMessage;
    run: () => void;
    secondary?: { label: DisplayMessage; run: () => void };
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [help, setHelp] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [imageRequest, setImageRequest] = useState<ImageRequest | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const closeImage = useCallback(() => {
    setImageRequest(null);
    setImagePreview(null);
  }, []);
  const startImage = (kind: ImageRequest['kind']) => {
    if (selectedIds.length > 1) {
      notify(message('selectSingleElement'), true);
      return;
    }
    if (!session || !selected) {
      notify(message('imageSelectTarget'), true);
      return;
    }
    setMode('select');
    setTab('edit');
    setDragOver(false);
    setImagePreview(null);
    setImageRequest({ base: session, targetId: selected.id, kind });
  };
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
  const multiple = selectedIds.length > 1;
  const selectionSummary = selectedIds
    .map((id) => {
      const element = elementMap.get(id);
      return element ? `〈${element.tag}〉 ${element.excerpt || t('elementWithoutText')}` : '';
    })
    .join('\n');
  const canDelete =
    selectedIds.length > 0 &&
    selectedIds.every((id) => {
      const element = elementMap.get(id);
      return element && !['html', 'head', 'body'].includes(element.tag);
    });
  const openCount = session?.notes.filter((note) => !note.done).length ?? 0;
  const dirty = session ? JSON.stringify(session) !== savedSignature.current : false;
  const handoffText = session
    ? connected
      ? t('connectedHandoff', { file: connected.file }) +
        (session.notes.some((note) => note.targets) ? '\n' + t('jointNoteHandoff') : '')
      : handoffMessage(session, locale)
    : '';
  const pendingInput = useRef(false);
  pendingInput.current = Boolean(noteText || Object.keys(textEdits).length || imageRequest);
  const notify = useCallback(
    (text: DisplayMessage, error = false) => setToast({ text, error }),
    [],
  );
  useEffect(() => {
    if (
      imageRequest &&
      (session !== imageRequest.base ||
        selectedId !== imageRequest.targetId ||
        mode !== 'select' ||
        tab !== 'edit')
    ) {
      closeImage();
      notify(message('theDocumentChangedSelectTheImageAgain'), true);
    }
  }, [session, selectedId, mode, tab, imageRequest, closeImage, notify]);
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
        notify(
          error instanceof Error ? describeError(error) : message('couldNotApplyTheChange'),
          true,
        );
        return false;
      }
    },
    [notify],
  );
  const removeSelected = useCallback(() => {
    if (
      !canDelete ||
      mode === 'interact' ||
      modal ||
      help ||
      imageRequest ||
      opening ||
      reading ||
      document.querySelector('[data-htmledit-inline-editor]')
    )
      return;
    change((current) => deleteElements(current, selectedIds));
  }, [canDelete, mode, modal, help, imageRequest, opening, reading, change, selectedIds]);
  useEffect(() => {
    if (token) return;
    loadDraft()
      .then(setDraft)
      .catch(() => setDraftStatus(message('couldNotReadDraftStorage')));
  }, []);
  useEffect(() => {
    const generation = ++autosaveGeneration.current;
    if (!session) return;
    if (token && JSON.stringify(session) === savedSignature.current) return;
    setDraftStatus(message('savingDraft'));
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
            setDraftStatus(message('draftSavedAt', { time: savedAt }));
            setDraft({ session, savedAt });
          }
        })
        .catch(() => {
          if (generation === autosaveGeneration.current)
            setDraftStatus(message('draftSaveFailedSaveAnHtmlFile'));
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
    setSelectedIds((ids) =>
      ids.every((id) => elementMap.has(id)) ? ids : ids.filter((id) => elementMap.has(id)),
    );
  }, [elementMap]);
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
      if (
        event.isComposing ||
        modal ||
        help ||
        opening ||
        imageRequest ||
        target.closest('input,textarea,select,[contenteditable="true"]') ||
        target.isContentEditable
      )
        return;
      if (
        event.key === 'Delete' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat
      ) {
        event.preventDefault();
        removeSelected();
        return;
      }
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
  }, [removeSelected, modal, help, opening, imageRequest]);
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
    setExportStatus(message('htmlNotSavedYet'));
    savedSignature.current = recovered ? '' : JSON.stringify(next);
  };
  const acceptLocal = (value: LocalDocument) => {
    connectedRef.current = value;
    setConnected(value);
    openSession(readDocument(value.html, value.fileName));
    setConflict(false);
    setConnectionStatus(message('workingFileConnected'));
    setExportStatus(message('syncedWithWorkingFile'));
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
        if (!disposed)
          setConnectionStatus(
            error instanceof Error ? describeError(error) : message('connectionFailed'),
          );
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
            setConnectionStatus(message('externalChangesDetectedSaveYourEditsSeparately'));
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
        } else setConnectionStatus(message('workingFileConnected'));
      } catch {
        if (!disposed) setConnectionStatus(message('disconnectedReopenTheFileOrDownloadYour'));
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
      notify(
        error instanceof Error ? describeError(error) : message('couldNotReopenTheFile'),
        true,
      );
    }
  };
  const replaceSession = (next: DocumentSession) => {
    if (session && dirty)
      setModal({
        title: message('openAnotherDocument'),
        message: message('makeSureYouSavedYourWorkTo'),
        action: message('openDocument'),
        run: () => openSession(next),
      });
    else if (!session && draft)
      setModal({
        title: message('replaceTheLatestDraft'),
        message: message('thereIsADraftYouHaveNot'),
        action: message('openNewDocument'),
        run: () => openSession(next),
      });
    else openSession(next);
  };
  const openFile = async (file: File) => {
    if (token) {
      notify(message('useOpenAnotherDocumentInTheToolbar'), true);
      return;
    }
    if (reading) return;
    setReading(true);
    try {
      replaceSession(readDocument(await readHtmlFile(file), file.name));
    } catch (error) {
      notify(error instanceof Error ? describeError(error) : message('couldNotOpenTheFile'), true);
    } finally {
      setReading(false);
    }
  };
  const select = useCallback((id: string, additive = false) => {
    setSelectedIds((ids) =>
      additive ? (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]) : [id],
    );
  }, []);
  const selectNoteTarget = useCallback(
    (id: string, additive = false) => {
      select(id, additive);
      setTab('notes');
      if (!additive) setTimeout(() => noteInput.current?.focus(), 0);
    },
    [select],
  );
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
        : addNote(current, selectedIds, relation, noteText),
    );
    if (!saved) return;
    setNoteText('');
    setEditingNoteId(null);
    setRelation('self');
    notify(message('noteSaved'));
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
        setExportStatus(message('workingSavedAt', { time: Date.now() }));
        notify(message('workingFileSavedAskYourAiTo'));
        return true;
      }
      downloadHtml(exportDocument(session, kind), exportName(session.fileName, kind));
      if (!token) savedSignature.current = JSON.stringify(session);
      setExportStatus(
        message(kind === 'review' ? 'reviewSavedAt' : 'finalSavedAt', { time: Date.now() }),
      );
      notify(message('fileSaved', { file: exportName(session.fileName, kind) }));
      return true;
    } catch (error) {
      if (error instanceof ConnectionError && error.code === 'CONFLICT') setConflict(true);
      notify(error instanceof Error ? describeError(error) : message('couldNotSave'), true);
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
        notify(message('fileSelectionCancelledYouCanKeepEditing'));
        return;
      }
      const url = new URL(result.url);
      if (url.origin === location.origin) {
        notify(message('thisDocumentIsAlreadyOpenYourWork'));
        return;
      }
      if (
        url.protocol !== 'http:' ||
        url.hostname !== '127.0.0.1' ||
        url.username ||
        url.password ||
        !/^#htmledit=[a-f0-9]{64}$/.test(url.hash)
      )
        throw new MessageError(message('couldNotVerifyTheNewDocumentConnection'));
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
        error instanceof Error ? describeError(error) : message('couldNotOpenTheNewDocumentYour'),
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
    if (pendingInput.current || document.querySelector('[data-htmledit-inline-editor]')) {
      notify(message('applyOrCancelTheTextOrNote'), true);
      return;
    }
    if (dirty)
      setModal({
        title: message('saveYourCurrentWork'),
        message: message('thereAreUnsavedChangesChooseWhetherTo'),
        action: message('saveAndChooseDocument'),
        run: () => void chooseLocalDocument(true),
        secondary: {
          label: message('chooseWithoutSaving'),
          run: () => void chooseLocalDocument(false),
        },
      });
    else void chooseLocalDocument(false);
  };
  const copy = async () => {
    if (!session || copyingRef.current || savingRef.current || openingRef.current) return;
    if (pendingInput.current || document.querySelector('[data-htmledit-inline-editor]')) {
      notify(message('applyOrCancelTheTextOrNote34'), true);
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
        document.querySelector('[data-htmledit-inline-editor]')
      ) {
        notify(message('yourWorkChangedWhileSavingApplyThe'), true);
        return;
      }
      await navigator.clipboard.writeText(handoffText);
      notify(
        connected
          ? message('workingFileSavedAndAiRequestCopied')
          : message('reviewHtmlDownloadStartedAndAiRequest'),
      );
    } catch {
      notify(message('yourWorkWasSavedButCopyingFailed'), true);
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
    const note = session?.notes.find((note) => note.id === noteId);
    setSelectedIds(
      note
        ? noteTargets(note)
            .map((target) => target.id)
            .filter((id) => elementMap.has(id))
        : [targetId],
    );
    setTab('notes');
    setFilter('all');
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-note-id="${CSS.escape(noteId)}"]`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
  };
  const discardBadMetadata = () =>
    setModal({
      title: message('excludeUnreadableNotes'),
      message: message('keepTheOriginalFileThisPreservesIts'),
      action: message('excludeNotes'),
      run: () => change((current) => ({ ...current, metadataIssue: undefined })),
    });

  return (
    <div
      className="app"
      inert={opening}
      onDragOver={(event) => {
        event.preventDefault();
        if (imageRequest) return;
        if (event.dataTransfer.types.includes('Files')) setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const files = event.dataTransfer.files;
        if (files.length !== 1) notify(message('dropOneHtmlFile'), true);
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
      <header className="app-header">
        <div className="logo">
          <span className="logo-symbol">
            <CodeXml size={21} />
          </span>
          <span>
            HTML<span className="logo-light">Edit</span>
            <small>{t('localWorkspace')}</small>
          </span>
        </div>
        <div className="header-center">
          <span className="status-dot" />
          {t('editOnYourComputer')}
        </div>
        <LanguageSelect />
        <button className="help-button" onClick={() => setHelp(true)}>
          <CircleHelp size={16} />
          {t('howToUse')}
        </button>
      </header>
      <div className="toolbar">
        <button
          className="button"
          onClick={openAnotherDocument}
          disabled={reading || opening || saving || copying || (Boolean(token) && !connected)}
        >
          <FolderOpen size={16} />
          {reading ? t('loading') : token ? t('openAnotherDocument50') : t('openHtml')}
        </button>
        <button
          className="button"
          disabled={!session || mode === 'interact'}
          onClick={() => startImage('insert')}
        >
          <ImagePlus size={16} />
          {t('imageInsert')}
        </button>
        <span className="toolbar-divider" />
        <div className="mode-switch" aria-label={t('editingMode')}>
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
            {t('interact')}
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
            {t('editDirectly')}
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
            {t('addNotes')}
          </button>
        </div>
        <div className="history-controls">
          <button
            className="icon-button"
            aria-label={t('undo')}
            title={t('undoCtrlZ')}
            disabled={!history?.past.length}
            onClick={() => setHistory((h) => (h ? undo(h) : h))}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t('redo')}
            title={t('redoCtrlShiftZ')}
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
          {t('saveFinalHtml')}
        </button>
        <button
          className="button primary"
          disabled={!session || Boolean(session.metadataIssue) || saving || copying || conflict}
          onClick={() => save('review')}
        >
          <Sparkles size={15} />
          {token ? (saving ? t('saving') : t('saveWorkingFile')) : t('saveReviewHtml')}
        </button>
      </div>
      {token && (
        <div className={`connection-bar ${conflict ? 'conflict' : ''}`} role="status">
          <div>
            <strong>{format(connectionStatus)}</strong>
            {connected && <small title={connected.file}>{connected.file}</small>}
          </div>
          <div className="connection-actions">
            {session && (
              <button className="button" onClick={() => save('review', true)}>
                {t('saveMyEditsSeparately')}
              </button>
            )}
            {conflict && (
              <button
                className="button"
                onClick={() =>
                  setModal({
                    title: message('reopenTheDiskVersion'),
                    message: message('unsavedChangesWillBeReplacedSaveAny'),
                    action: message('reopenDiskVersion'),
                    run: () => void reloadLocal(),
                  })
                }
              >
                {t('reopenDiskVersion')}
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
                    notify(message('couldNotRestoreTheDraft'), true);
                  }
                }}
              >
                {t('restoreConnectedDraft')}
              </button>
            )}
          </div>
        </div>
      )}
      {!session ? (
        <main className="welcome">
          <div className="welcome-label">
            <span />
            {t('fromAi')}
          </div>
          <h1>
            {t('editItOnScreen')}
            <br />
            <span>{t('passItOnWithNotes')}</span>
          </h1>
          <p className="welcome-intro">
            {t('pointToExactlyWhatYouWantTo')}
            <br />
            {t('makeSmallEditsYourselfLeaveANote')}
          </p>
          <div className={`dropzone ${dragOver ? 'dragging' : ''}`}>
            <div className="upload-symbol">
              <Upload size={28} strokeWidth={1.5} />
            </div>
            <h2>{t('dropYourHtmlFileHere')}</h2>
            <p>{t('htmlHtmStartWithOneFile')}</p>
            <button className="button primary" onClick={() => fileInput.current?.click()}>
              <FolderOpen size={16} />
              {t('chooseFile')}
            </button>
            <small>{t('documentsAreProcessedInThisBrowser')}</small>
          </div>
          <button
            className="example-button"
            onClick={() => replaceSession(readDocument(exampleHtml(locale), 'onyu-studio.html'))}
          >
            <FileCode2 size={17} />
            <span>
              {t('noFileYet')}
              <strong>{t('tryAnExampleDocument')}</strong>
            </span>
            <ChevronRight size={16} />
          </button>
          {draft && (
            <div className="draft-card">
              <RotateCcw size={18} />
              <div>
                <strong>{t('youHaveARecentDraft')}</strong>
                <span>
                  {draft.session.fileName} · {new Date(draft.savedAt).toLocaleString(locale)}
                </span>
              </div>
              <button
                className="button"
                onClick={() => {
                  openSession(draft.session, true);
                  notify(message('recentDraftRestored'));
                }}
              >
                {t('restore')}
              </button>
              <button
                className="icon-button"
                aria-label={t('deleteDraft')}
                onClick={() =>
                  setModal({
                    title: message('deleteTheDraft'),
                    message: message('thisDeletesTheLatestDraftInThis'),
                    action: message('deleteDraft'),
                    run: () => {
                      void deleteDraft()
                        .then(() => {
                          setDraft(null);
                          notify(message('draftDeleted'));
                        })
                        .catch(() => notify(message('couldNotDeleteTheDraft'), true));
                    },
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
          {!draft &&
            typeof draftStatus !== 'string' &&
            draftStatus.key === 'couldNotReadDraftStorage' && (
              <p className="error-text">
                {format(draftStatus)} {t('saveAnHtmlFileToKeepYour')}
              </p>
            )}
          <div className="welcome-steps">
            <span>
              <MousePointer2 size={17} />
              <strong>{t('editDirectly90')}</strong>
              <small>{t('textImagesAndTypography')}</small>
            </span>
            <span>
              <MessageSquarePlus size={17} />
              <strong>{t('leaveNotesInContext')}</strong>
              <small>{t('pointInsteadOfDescribingTheLocation')}</small>
            </span>
            <span>
              <Sparkles size={17} />
              <strong>{t('sendToYourAi')}</strong>
              <small>{t('oneHtmlFileWithYourChangeRequests')}</small>
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
                {dirty && <span className="unsaved-dot" title={t('changesNotYetSavedToFile')} />}
              </div>
              <div className="viewport-switch">
                <button
                  className={width === 'desktop' ? 'active' : ''}
                  onClick={() => setWidth('desktop')}
                  aria-label={t('desktopWidth')}
                  title={t('desktop')}
                >
                  <Monitor size={15} />
                </button>
                <button
                  className={width === 'tablet' ? 'active' : ''}
                  onClick={() => setWidth('tablet')}
                  aria-label={t('tabletWidth')}
                  title={t('tablet768px')}
                >
                  <Tablet size={15} />
                </button>
                <button
                  className={width === 'mobile' ? 'active' : ''}
                  onClick={() => setWidth('mobile')}
                  aria-label={t('mobileWidth')}
                  title={t('mobile390px')}
                >
                  <Smartphone size={15} />
                </button>
              </div>
            </div>
            {session.metadataIssue && (
              <div className="metadata-alert">
                <AlertTriangle size={16} />
                <span>{t('metadataDetails', { detail: format(session.metadataIssue) })}</span>
                <button onClick={discardBadMetadata}>{t('excludeUnreadableNotes105')}</button>
              </div>
            )}
            {session.warnings.length > 0 && (
              <details className="document-warnings">
                <summary>
                  <Info size={14} />
                  {t('noticesCount', { count: session.warnings.length })}
                </summary>
                <ul>
                  {session.warnings.map((warning) => (
                    <li key={JSON.stringify(warning)}>{format(warning)}</li>
                  ))}
                </ul>
              </details>
            )}
            <Preview
              key={documentEpoch}
              session={imagePreview?.session ?? session}
              selectedId={imagePreview?.id ?? selectedId}
              selectedIds={imagePreview ? [imagePreview.id] : selectedIds}
              insertion={imageRequest ? imagePreview?.position : undefined}
              mode={mode}
              width={width}
              onSelect={(id, additive) => {
                if (imageRequest) {
                  if (!elementMap.has(id)) return;
                  closeImage();
                }
                select(id, additive);
              }}
              onDelete={removeSelected}
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
                  ? t('useMenusAndTabsThenChooseEdit')
                  : mode === 'select'
                    ? t('selectionShortcuts')
                    : t('noteSelectionShortcuts')}
              </span>
              <span>
                {width === 'desktop' ? t('desktop') : width === 'tablet' ? '768 px' : '390 px'}
              </span>
            </div>
          </section>
          <aside className="sidebar">
            <div className="sidebar-tabs">
              <button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>
                {t('elementEditor')}
              </button>
              <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
                {t('reviewNotes')}
                <span>{session.notes.length}</span>
              </button>
            </div>
            <div className="sidebar-scroll">
              {imageRequest ? (
                <ImagePanel
                  key={imageRequest.targetId + imageRequest.kind}
                  request={imageRequest}
                  onPreview={setImagePreview}
                  onCancel={closeImage}
                  onApply={(next, id) => {
                    if (sessionRef.current !== imageRequest.base) {
                      closeImage();
                      notify(message('theDocumentChangedSelectTheImageAgain'), true);
                      return;
                    }
                    if (change(() => next)) {
                      closeImage();
                      setSelectedId(id);
                      setJump({ id, nonce: Date.now() });
                    }
                  }}
                />
              ) : tab === 'edit' ? (
                <>
                  {multiple ? (
                    <div className="selected-card">
                      <strong>{t('selectedElementsCount', { count: selectedIds.length })}</strong>
                      <p className="selection-summary">{selectionSummary}</p>
                      <p className="field-hint">{t('multiSelectionHelp')}</p>
                      <button
                        className="button full-width"
                        onClick={() => {
                          setTab('notes');
                          setMode('note');
                          setTimeout(() => noteInput.current?.focus(), 0);
                        }}
                      >
                        {t('addGroupNote')}
                      </button>
                      <button
                        className="danger-button"
                        disabled={!canDelete}
                        onClick={removeSelected}
                      >
                        <Trash2 size={14} />
                        {t('deleteSelectedElements')}
                      </button>
                    </div>
                  ) : selected ? (
                    <>
                      <div className="section-caption">{t('selectedElement')}</div>
                      <div className="selected-card">
                        <span className="tag-name">{selected.tag}</span>
                        <p>{selected.excerpt || t('elementWithoutText')}</p>
                        <button
                          className="text-button"
                          disabled={!selected.parentId}
                          onClick={() => selected.parentId && jumpTo(selected.parentId)}
                        >
                          <ArrowUp size={13} />
                          {t('selectParentElement')}
                        </button>
                      </div>
                      <div className="section-caption">{t('textStyle')}</div>
                      <label className="field-label">{t('textColor')}</label>
                      <div className="color-field">
                        <input
                          aria-label={t('chooseTextColor')}
                          type="color"
                          value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#343e33'}
                          onChange={(event) => setColor(event.target.value)}
                        />
                        <input
                          aria-label={t('textColorCode')}
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
                          {t('apply')}
                        </button>
                      </div>
                      <label className="field-label" htmlFor="font-size">
                        {t('fontSize')}
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
                          {t('apply')}
                        </button>
                      </div>
                      {selected.textParts.length > 0 && (
                        <>
                          <div className="section-caption">{t('editText')}</div>
                          {selected.textParts.map((part, index) => (
                            <div className="text-part" key={part.index}>
                              <label className="sr-only" htmlFor={`text-${part.index}`}>
                                {t('textPart', { number: index + 1 })}
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
                                {t('applyText')}
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      {selected.tag === 'img' && (
                        <>
                          <div className="section-caption">{t('image')}</div>
                          <button
                            className="button full-width"
                            onClick={() => startImage('replace')}
                          >
                            <ImagePlus size={15} />
                            {t('replaceImage')}
                          </button>
                          <button
                            className="button full-width"
                            onClick={() => startImage('properties')}
                          >
                            {t('imageProperties')}
                          </button>
                          <p className="field-hint">
                            {t('pngJpegWebpGifUpTo10mb')}
                            <br />
                            {t('theNewImageIsEmbeddedInThe')}
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
                          <MessageSquarePlus size={15} />
                          {t('addANoteToThisElement')}
                        </button>
                        <button
                          className="danger-button"
                          disabled={!canDelete}
                          onClick={removeSelected}
                        >
                          <Trash2 size={14} />
                          {t('deleteSelectedElement')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="sidebar-empty">
                      <MousePointer2 size={28} strokeWidth={1.3} />
                      <h3>
                        {mode === 'interact'
                          ? t('navigateToTheScreenYouWant')
                          : t('clickWhatYouWantToChange')}
                      </h3>
                      <p>
                        {mode === 'interact' ? (
                          <>
                            {t('theDocumentMenusAndButtonsAreActive')}
                            <br />
                            {t('chooseEditDirectlyWhenYouReachThe')}
                          </>
                        ) : (
                          <>{t('selectTextAnImageOrACard')}</>
                        )}
                      </p>
                      <div className="tip-card">
                        <strong>{t('quickTip')}</strong>
                        <p>
                          {mode === 'interact' ? (
                            <>{t('yourCurrentScreenStaysInPlaceWhen')}</>
                          ) : (
                            <>{t('doubleClickTextToEditItOn')}</>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="sidebar-bottom-tip">
                    <Info size={14} />
                    <p>{t('leaveANoteForNewElementsOr')}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="note-summary">
                    <div>
                      <span>
                        {t(
                          new Intl.PluralRules(locale).select(openCount) === 'one'
                            ? 'pendingOne'
                            : 'pendingOther',
                          { count: openCount },
                        )}
                      </span>
                    </div>
                    <small>
                      {t('noteSummary', {
                        total: session.notes.length,
                        done: session.notes.length - openCount,
                      })}
                    </small>
                  </div>
                  {rebindId && (
                    <div className="rebind-box">
                      <p>{t('selectANewTargetInTheDocument')}</p>
                      <button
                        className="button primary full-width"
                        disabled={!selected}
                        onClick={() => {
                          if (change((current) => rebindNote(current, rebindId, selectedIds))) {
                            setRebindId(null);
                            notify(message('noteTargetReassigned'));
                          }
                        }}
                      >
                        {t('connectToSelectedElement')}
                      </button>
                      <button className="text-button" onClick={() => setRebindId(null)}>
                        {t('cancel')}
                      </button>
                    </div>
                  )}
                  <div className="note-composer">
                    <div className="section-caption">
                      {editingNoteId ? t('editNote') : t('newChangeRequest')}
                    </div>
                    <div className="composer-target">
                      <span className="status-dot" />
                      <span>
                        {editingNoteId
                          ? t('existingNoteTarget')
                          : multiple
                            ? t('selectedElementsCount', { count: selectedIds.length })
                            : selected
                              ? `〈${selected.tag}〉 ${selected.excerpt || t('selectedElement')}`
                              : t('selectATargetInTheDocumentFirst')}
                      </span>
                    </div>
                    {multiple && !editingNoteId && (
                      <p className="selection-summary">{selectionSummary}</p>
                    )}
                    <p className="field-hint">{t('noteSelectionShortcuts')}</p>
                    <label className="field-label" htmlFor="note-relation">
                      {t('requestedPosition')}
                    </label>
                    <select
                      id="note-relation"
                      value={relation}
                      onChange={(event) => setRelation(event.target.value as Relation)}
                    >
                      {Object.entries(RELATIONS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {format(label)}
                        </option>
                      ))}
                    </select>
                    <textarea
                      ref={noteInput}
                      aria-label={t('changeRequest')}
                      placeholder={t('exampleAddAHomeIconBeforeThis')}
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
                      {editingNoteId ? t('saveNoteChanges') : t('addNote')}
                    </button>
                    {editingNoteId && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setEditingNoteId(null);
                          setNoteText('');
                        }}
                      >
                        {t('cancelEditing')}
                      </button>
                    )}
                  </div>
                  <div className="note-filters">
                    {(
                      [
                        ['all', t('all')],
                        ['open', t('pending')],
                        ['done', t('completed')],
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
                        const targets = noteTargets(note);
                        const existing = targets.filter((target) => elementMap.has(target.id));
                        const exists = existing.length === targets.length;
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
                                disabled={!existing.length}
                                onClick={() => {
                                  marker(note.id, existing[0].id);
                                  setJump({ id: existing[0].id, nonce: Date.now() });
                                }}
                              >
                                {index + 1}
                              </button>
                              <span>
                                {targets.length > 1
                                  ? t('noteTargetsCount', {
                                      count: targets.length,
                                      missing: targets.length - existing.length,
                                    })
                                  : exists
                                    ? `〈${note.target.tag}〉 ${format(RELATIONS[note.relation])}`
                                    : t('targetMissing')}
                              </span>
                              <button
                                className="icon-button"
                                aria-label={t('deleteNote', { number: index + 1 })}
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
                            {targets.length > 1 && (
                              <div className="note-target-list">
                                {targets.map((target) => (
                                  <button
                                    key={target.id}
                                    disabled={!elementMap.has(target.id)}
                                    onClick={() => {
                                      marker(note.id, target.id);
                                      setJump({ id: target.id, nonce: Date.now() });
                                    }}
                                  >
                                    〈{target.tag}〉 {target.excerpt || t('elementWithoutText')}
                                    {!elementMap.has(target.id) && ` — ${t('targetMissing')}`}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="note-card-actions">
                              <button
                                onClick={() =>
                                  change((current) =>
                                    updateNote(current, note.id, { done: !note.done }),
                                  )
                                }
                              >
                                {note.done ? <RotateCcw size={12} /> : <Check size={12} />}
                                {note.done ? t('reopen') : t('completed')}
                              </button>
                              <button onClick={() => editNote(note)}>{t('edit')}</button>
                              <button
                                onClick={() => {
                                  setRebindId(note.id);
                                  setMode('select');
                                }}
                              >
                                {t('reassignTarget')}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    {session.notes.length === 0 && (
                      <div className="no-notes">
                        <MessageSquarePlus size={23} strokeWidth={1.4} />
                        <p>
                          {t('noNotesYet')}
                          <br />
                          {t('pointToALocationOnTheScreen')}
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
                {copying ? t('savingAndCopying') : t('saveAndCopyAiRequest')}
              </button>
              <p>
                {token
                  ? t('savesYourEditsAndNotesThenCopies')
                  : t('downloadsReviewHtmlAndCopiesTheRequest')}
              </p>
            </div>
          </aside>
        </main>
      )}
      <footer className="app-footer">
        <span>
          <Laptop size={13} />
          {token ? t('connectedToAWorkingFileOnYour') : t('documentsAreProcessedInYourBrowser')}
        </span>
        <div>
          <span>{session ? format(draftStatus) : t('staticHtmlEditor')}</span>
          {session && (
            <>
              <span className="footer-separator">·</span>
              <span>
                {format(exportStatus)}
                {dirty &&
                (typeof exportStatus === 'string' || exportStatus.key !== 'htmlNotSavedYet')
                  ? t('additionalUnsavedChanges')
                  : ''}
              </span>
            </>
          )}
        </div>
      </footer>
      {dragOver && (
        <div className="drag-overlay">
          <Upload size={40} />
          <h2>{t('dropAnHtmlFile')}</h2>
          <p>{t('openOneDocumentToEdit')}</p>
        </div>
      )}
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`toast ${toast.error ? 'error' : ''}`}
        >
          {toast.error ? <AlertTriangle size={17} /> : <CheckCheck size={17} />}
          <span>{format(toast.text)}</span>
          <button
            className="icon-button"
            aria-label={t('dismissNotification')}
            onClick={() => setToast(null)}
          >
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
            aria-label={format(modal.title)}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{format(modal.title)}</h2>
            <p>{format(modal.message)}</p>
            <div className="modal-actions">
              <button className="button" onClick={() => setModal(null)}>
                {t('cancel')}
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
                  {format(modal.secondary.label)}
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
                {format(modal.action)}
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
            aria-label={t('howToUse')}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label={t('closeHelp')}
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </button>
            <span className="section-caption">{t('quickGuide')}</span>
            <h2>{t('pointToItMakeItEasier')}</h2>
            <ol>
              <li>
                <strong>{t('openYourHtml')}</strong>
                <p>{t('aSingleHtmlFileWithEmbeddedCss')}</p>
              </li>
              <li>
                <strong>{t('makeSimpleEditsYourself')}</strong>
                <p>{t('clickAnElementOrDoubleClickText')}</p>
              </li>
              <li>
                <strong>{t('leaveNotesForComplexChanges')}</strong>
                <p>{t('selectAnElementAndDescribeTheChange')}</p>
              </li>
              <li>
                <strong>{t('sendOneFileToYourAi')}</strong>
                <p>
                  {token
                    ? t('saveAndCopyAiRequestSavesYour')
                    : t('saveAndCopyAiRequestDownloadsHtml')}
                </p>
              </li>
            </ol>
            <div className="help-note">{t('draftStorageKeepsYourLatestWorkSave')}</div>
            {session && (
              <textarea
                className="handoff-text"
                aria-label={t('aiHandoffRequest')}
                readOnly
                value={handoffText}
              />
            )}
            <button className="button primary" onClick={() => setHelp(false)}>
              {t('gotIt')}
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
              aria-label={t('connectingAnotherDocument')}
            >
              <h2>{t('openAnotherDocument50')}</h2>
              <p>{t('selectAnHtmlDocumentInTheWindows')}</p>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
