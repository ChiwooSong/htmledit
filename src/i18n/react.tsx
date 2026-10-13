import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { connectionToken, localRequest } from '../io/connection';
import {
  detectLocale,
  formatMessage,
  isPreference,
  languageNames,
  locales,
  normalizeLocale,
  translate,
  type LanguagePreference,
  type Locale,
} from './index';
const storageKey = 'htmledit-language';
function initialPreference(): LanguagePreference {
  try {
    const value = localStorage.getItem(storageKey);
    return isPreference(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}
const LocaleContext = createContext({
  locale: 'en' as Locale,
  preference: 'auto' as LanguagePreference,
  choose: (_value: LanguagePreference) => {},
  notice: '',
});
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [token] = useState(connectionToken);
  const [preference, setPreference] = useState<LanguagePreference>(() =>
    token ? 'auto' : initialPreference(),
  );
  const [override, setOverride] = useState(() =>
    normalizeLocale(new URLSearchParams(location.search).get('lang') ?? ''),
  );
  const [notice, setNotice] = useState<'preferencesFailed' | 'preferencesReadFailed' | null>(null);
  const changed = useRef(false);
  const writes = useRef(Promise.resolve());
  const selection = useRef(0);
  const locale =
    override ?? (preference === 'auto' ? detectLocale(navigator.languages) : preference);
  // Requests read this function at call time; locale changes never recreate document state.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, 'appTitle');
  }, [locale]);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    void localRequest<{ language: LanguagePreference }>(token, 'preferences')
      .then((value) => {
        if (alive && !changed.current && isPreference(value.language))
          setPreference(value.language);
      })
      .catch(() => {
        if (alive && !changed.current) setNotice('preferencesReadFailed');
      });
    return () => {
      alive = false;
    };
  }, [token]);
  const choose = (value: LanguagePreference) => {
    changed.current = true;
    const currentSelection = ++selection.current;
    setOverride(undefined);
    setPreference(value);
    setNotice(null);
    const url = new URL(location.href);
    url.searchParams.delete('lang');
    window.history.replaceState(null, '', url.pathname + url.search);
    if (token) {
      writes.current = writes.current
        .catch(() => {})
        .then(async () => {
          try {
            await localRequest(token, 'preferences', 'PUT', { language: value });
          } catch {
            if (selection.current === currentSelection) setNotice('preferencesFailed');
          }
        });
    } else {
      try {
        localStorage.setItem(storageKey, value);
      } catch {
        setNotice('preferencesFailed');
      }
    }
  };
  return (
    <LocaleContext.Provider
      value={{
        locale,
        preference: override ?? preference,
        choose,
        notice: notice ? translate(locale, notice) : '',
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}
export function useLocale() {
  const context = useContext(LocaleContext);
  return {
    ...context,
    t: translate.bind(null, context.locale) as <K extends import('./types').MessageKey>(
      key: K,
      ...args: import('./types').Arguments<K>
    ) => string,
    format: (value: import('./types').DisplayMessage) => formatMessage(context.locale, value),
  };
}
export function LanguageSelect() {
  const { t, preference, choose, notice } = useLocale();
  return (
    <div className="language-control">
      <label>
        <span>{t('language')}</span>
        <select
          aria-label={t('language')}
          data-testid="language-select"
          value={preference}
          onChange={(event) => {
            if (isPreference(event.target.value)) choose(event.target.value);
          }}
        >
          <option value="auto">{t('automatic')}</option>
          {locales.map((locale) => (
            <option key={locale} value={locale}>
              {languageNames[locale]}
            </option>
          ))}
        </select>
      </label>
      {notice && (
        <span className="language-notice" role="alert">
          {notice}
        </span>
      )}
    </div>
  );
}
