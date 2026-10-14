import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../i18n/react';
import { describeError, message, type DisplayMessage } from '../i18n';
import { assertHtmlSize, readImageFile, readImageUrl } from '../io/files';
import {
  exportDocument,
  imageDetails,
  imagePositions,
  insertImage,
  listElements,
  newId,
  replaceImage,
  updateImagePresentation,
  type DocumentSession,
  type ImagePosition,
  type ImagePresentation,
} from '../model/document';

export interface ImageRequest {
  base: DocumentSession;
  targetId: string;
  kind: 'insert' | 'replace' | 'properties';
}
export interface ImagePreview {
  session: DocumentSession;
  id: string;
  position: ImagePosition | 'self';
}
interface Props {
  request: ImageRequest;
  onPreview: (preview: ImagePreview | null) => void;
  onApply: (session: DocumentSession, id: string) => void;
  onCancel: () => void;
}
export default function ImagePanel({ request, onPreview, onApply, onCancel }: Props) {
  const { t, format } = useLocale();
  const { base, targetId, kind } = request;
  const positions = useMemo(() => imagePositions(base, targetId), [base, targetId]);
  const details = useMemo(
    () => (kind === 'insert' ? undefined : imageDetails(base, targetId)),
    [base, targetId, kind],
  );
  const [id] = useState(newId);
  const [position, setPosition] = useState<ImagePosition>(() =>
    listElements(base).find((e) => e.id === targetId)?.tag === 'body' ? 'inside' : 'after',
  );
  const [data, setData] = useState('');
  const [url, setUrl] = useState('');
  const [options, setOptions] = useState<ImagePresentation>(
    details ?? { width: 'original', align: 'left', alt: '' },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DisplayMessage>('');
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  const acquire = async (read: (signal: AbortSignal) => Promise<string>) => {
    const run = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true);
    setError('');
    setData('');
    try {
      const value = await read(controller.current.signal);
      if (generation.current === run) setData(value);
    } catch (error) {
      if (generation.current === run) setError(describeError(error));
    } finally {
      if (generation.current === run) setLoading(false);
    }
  };
  const acceptFiles = (files: File[]) => {
    if (files.length !== 1) {
      setError(message('imageOneOnly'));
      return;
    }
    void acquire(() => readImageFile(files[0]));
  };
  const candidate = useMemo(() => {
    if (kind !== 'properties' && !data) return { preview: null, error: '' };
    try {
      const result =
        kind === 'insert'
          ? insertImage(base, targetId, position, data, options, id)
          : {
              session:
                kind === 'replace'
                  ? replaceImage(base, targetId, data)
                  : updateImagePresentation(base, targetId, options),
              id: targetId,
            };
      assertHtmlSize(exportDocument(result.session, 'review'));
      return { preview: { ...result, position: 'self' as const }, error: '' };
    } catch (error) {
      return { preview: null, error: describeError(error) };
    }
  }, [base, targetId, kind, data, options, position, id]);
  useEffect(() => {
    onPreview(
      candidate.preview ??
        (kind === 'insert' && positions.includes(position)
          ? { session: base, id: targetId, position }
          : null),
    );
    return () => onPreview(null);
  }, [candidate, onPreview, base, kind, position, positions, targetId]);
  const source = data || details?.src;
  return (
    <section
      className="image-panel"
      aria-label={t(
        kind === 'insert' ? 'imageInsert' : kind === 'replace' ? 'replaceImage' : 'imageProperties',
      )}
    >
      <h3>
        {t(
          kind === 'insert'
            ? 'imageInsert'
            : kind === 'replace'
              ? 'replaceImage'
              : 'imageProperties',
        )}
      </h3>
      {kind === 'insert' && (
        <>
          <label>
            {t('imagePosition')}
            <select
              aria-label={t('imagePosition')}
              data-testid="image-position"
              value={position}
              onChange={(e) => setPosition(e.target.value as ImagePosition)}
            >
              {(['before', 'after', 'inside'] as const).map((p) => (
                <option key={p} value={p} disabled={!positions.includes(p)}>
                  {t(p === 'inside' ? 'imageInsideLast' : p)}
                </option>
              ))}
            </select>
          </label>
          {!positions.includes(position) && <p role="alert">{t('imageInvalidPosition')}</p>}
        </>
      )}
      {kind !== 'properties' && (
        <>
          <input
            ref={fileInput}
            data-testid="image-file"
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              acceptFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <button className="button full-width" onClick={() => fileInput.current?.click()}>
            {t('imageChooseFile')}
          </button>
          <div
            className="image-paste"
            data-testid="image-paste"
            role="group"
            tabIndex={0}
            aria-label={t('imageDropPaste')}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              acceptFiles(Array.from(e.dataTransfer.files));
            }}
            onPaste={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const files = Array.from(e.clipboardData.files);
              if (!files.length) setError(message('imagePasteFile'));
              else acceptFiles(files);
            }}
          >
            {t('imageDropPaste')}
          </div>
          <label>
            {t('imageUrl')}
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <button
            className="button full-width"
            disabled={!url.trim()}
            onClick={() => void acquire((signal) => readImageUrl(url.trim(), signal))}
          >
            {t('imageFetch')}
          </button>
          <p className="field-hint">{t('imageEmbeddedHint')}</p>
        </>
      )}
      {loading && <p role="status">{t('loading')}</p>}
      {source && (
        <div className="image-thumbnail">
          <img src={source} alt={options.alt} />
        </div>
      )}
      {kind !== 'replace' && (
        <>
          <label>
            {t('imageSizing')}
            <select
              aria-label={t('imageSizing')}
              value={options.width === 'original' ? 'original' : 'percent'}
              onChange={(e) =>
                setOptions((o) => ({
                  ...o,
                  width: e.target.value === 'original' ? 'original' : 100,
                }))
              }
            >
              <option value="original">{t('imageOriginal')}</option>
              <option value="percent">{t('imagePercent')}</option>
            </select>
          </label>
          {options.width !== 'original' && (
            <label>
              {t('imageWidth')}
              <input
                type="number"
                min="1"
                max="100"
                value={Number.isNaN(options.width) ? '' : options.width}
                onChange={(e) => setOptions((o) => ({ ...o, width: e.target.valueAsNumber }))}
              />
            </label>
          )}
          <label>
            {t('imageAlignment')}
            <select
              aria-label={t('imageAlignment')}
              value={options.align}
              onChange={(e) =>
                setOptions((o) => ({ ...o, align: e.target.value as ImagePresentation['align'] }))
              }
            >
              <option value="left">{t('imageLeft')}</option>
              <option value="center">{t('imageCenter')}</option>
              <option value="right">{t('imageRight')}</option>
            </select>
          </label>
          <label>
            {t('imageAlt')}
            <input
              value={options.alt}
              onChange={(e) => setOptions((o) => ({ ...o, alt: e.target.value }))}
            />
          </label>
        </>
      )}
      <p className="field-hint">{t('imagePreview')}</p>
      {(error || candidate.error) && (
        <p className="image-error" role="alert">
          {format(error || candidate.error)}
        </p>
      )}
      <div className="image-actions">
        <button className="button" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button
          className="button primary"
          disabled={loading || !candidate.preview}
          onClick={() =>
            candidate.preview && onApply(candidate.preview.session, candidate.preview.id)
          }
        >
          {t('imageApply')}
        </button>
      </div>
    </section>
  );
}
