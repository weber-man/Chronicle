import test from 'node:test';
import assert from 'node:assert/strict';
import { createI18n } from 'vue-i18n';
import en from '../src/i18n/en';
import de from '../src/i18n/de';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || typeof value === 'function') {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, `${prefix}${prefix ? '.' : ''}${key}`));
}

test('en and de locale files expose the same translation keys', () => {
  const enKeys = flattenKeys(en);
  const deKeys = flattenKeys(de);

  const missingInDe = enKeys.filter((key) => !deKeys.includes(key));
  const missingInEn = deKeys.filter((key) => !enKeys.includes(key));

  assert.deepEqual(missingInDe, [], 'Keys present in en but missing in de');
  assert.deepEqual(missingInEn, [], 'Keys present in de but missing in en');
  assert.ok(enKeys.length >= 300, 'Translation catalog should be substantial');
});

for (const [locale, messages] of Object.entries({ en, de })) {
  test(`${locale} messages compile and render without syntax errors`, () => {
    const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } });
    for (const key of flattenKeys(messages)) {
      assert.doesNotThrow(() => i18n.global.t(key), `${locale}.${key}`);
    }
    assert.equal(i18n.global.t('login.phEmail'), locale === 'de' ? 'du@example.com' : 'you@example.com');
  });

  test(`${locale} renders singular and plural counts`, () => {
    const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } });
    for (const count of [0, 1, 2]) {
      const entry = locale === 'de' ? (count === 1 ? 'Eintrag' : 'Einträge') : (count === 1 ? 'entry' : 'entries');
      assert.equal(i18n.global.t('eventList.count', { count }), `${count} ${entry}`);
      assert.equal(i18n.global.t('eventList.countFound', { count }), `${count} ${entry} ${locale === 'de' ? 'gefunden' : 'found'}`);
      assert.equal(
        i18n.global.t('modelPicker.shownOf', { shown: count, total: count, count }),
        locale === 'de' ? `${count} von ${count} ${count === 1 ? 'Modell' : 'Modellen'}` : `${count} of ${count} ${count === 1 ? 'model' : 'models'}`,
      );
      assert.equal(
        i18n.global.t('toast.importSome', { imported: count, count }),
        locale === 'de' ? `${count} ${count === 1 ? 'Ereignis' : 'Ereignisse'} importiert.` : `${count} ${count === 1 ? 'event' : 'events'} imported.`,
      );
    }
  });
}
