import { en } from './en';
import ko from './ko';
import es from './es';
import ja from './ja';
import pt from './pt-BR';
import type { Arguments, Catalog, DisplayMessage, Message, MessageKey } from './types';
export type { DisplayMessage, Message, MessageKey } from './types';
export const locales = ['ko', 'en', 'es', 'ja', 'pt-BR'] as const;
export type Locale = (typeof locales)[number];
export type LanguagePreference = Locale | 'auto';
export const languageNames: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  es: 'Español',
  ja: '日本語',
  'pt-BR': 'Português (Brasil)',
};
export const catalogs: Record<Locale, Catalog> = { en, ko, es, ja, 'pt-BR': pt };
export function isPreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || locales.includes(value as Locale);
}
export function normalizeLocale(value: string): Locale | undefined {
  const base = value.trim().replaceAll('_', '-').split(/[.-]/)[0].toLowerCase();
  return base === 'pt' ? 'pt-BR' : locales.find((locale) => locale === base);
}
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const found = normalizeLocale(language);
    if (found) return found;
  }
  return 'en';
}
export function acceptLanguage(header: string | undefined): Locale {
  return detectLocale(
    (header ?? '')
      .split(',')
      .map((part, index) => {
        const [language, ...options] = part.trim().split(';');
        const q = options.find((option) => option.trim().startsWith('q='));
        return { language, index, quality: q ? Number(q.trim().slice(2)) : 1 };
      })
      .filter((item) => Number.isFinite(item.quality) && item.quality > 0 && item.quality <= 1)
      .sort((a, b) => b.quality - a.quality || a.index - b.index)
      .map((item) => item.language),
  );
}
export function message<K extends MessageKey>(key: K, ...args: Arguments<K>): Message {
  return { key, params: args[0] ?? {} } as Message;
}
export function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const v = value as { key?: unknown; params?: unknown };
  return (
    typeof v.key === 'string' &&
    Object.hasOwn(en, v.key) &&
    Boolean(v.params) &&
    typeof v.params === 'object' &&
    !Array.isArray(v.params) &&
    Object.values(v.params!).every((p) => typeof p === 'string' || typeof p === 'number')
  );
}
// Recognize known strings in older drafts without interpreting user document text.
export function legacyMessage(value: string): DisplayMessage {
  const key = (Object.keys(en) as MessageKey[]).find(
    (key) => ko[key] === value || en[key] === value,
  );
  return key ? ({ key, params: {} } as Message) : value;
}
export function formatMessage(locale: Locale, value: DisplayMessage): string {
  if (typeof value === 'string') {
    const legacy = legacyMessage(value);
    return typeof legacy === 'string' ? value : formatMessage(locale, legacy);
  }
  const template = catalogs[locale][value.key] ?? en[value.key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const param = (value.params as Record<string, string | number>)[name];
    if (param === undefined) return `{${name}}`;
    if (name === 'time' && typeof param === 'number')
      return new Date(param).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return typeof param === 'number' ? new Intl.NumberFormat(locale).format(param) : param;
  });
}
export function translate<K extends MessageKey>(
  locale: Locale,
  key: K,
  ...args: Arguments<K>
): string {
  return formatMessage(locale, message(key, ...args));
}
export class MessageError extends Error {
  readonly display: DisplayMessage;
  constructor(display: DisplayMessage) {
    super(formatMessage('en', display));
    this.display = display;
  }
}
export function describeError(error: unknown): DisplayMessage {
  if (error instanceof MessageError) return error.display;
  return message('unknownError', {
    detail: error instanceof Error ? error.message : String(error),
  });
}
