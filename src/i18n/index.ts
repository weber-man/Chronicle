import { createI18n } from 'vue-i18n';
import { ApiError } from '../lib/api';
import de from './de';
import en from './en';

export type AppLocale = 'en' | 'de';

export const SUPPORTED_LOCALES: AppLocale[] = ['en', 'de'];

const STORAGE_KEY = 'chronicles.locale';

function detectLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'de') return stored;
  } catch {
    // Storage unavailable; fall back to the browser language.
  }
  const browser = typeof navigator !== 'undefined' ? (navigator.language ?? '').toLowerCase() : '';
  return browser.startsWith('de') ? 'de' : 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, de },
});

export function setLocale(locale: AppLocale) {
  i18n.global.locale.value = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Non-fatal: the locale still applies for the current session.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

export function currentLocale(): AppLocale {
  return i18n.global.locale.value === 'de' ? 'de' : 'en';
}

/**
 * Server responses carry a stable error code plus an English message.
 * Known codes are translated for the current UI language; unknown codes fall
 * back to the English message (system-level) so the UI never shows a raw code.
 */
export function translateApiError(error: unknown): string {
  if (error instanceof ApiError && error.code) {
    const key = `server.${error.code}`;
    if (i18n.global.te(key)) return i18n.global.t(key);
  }
  return error instanceof Error ? error.message : '';
}

setLocale(detectLocale());
