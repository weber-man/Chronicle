import test from 'node:test';
import assert from 'node:assert/strict';
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
