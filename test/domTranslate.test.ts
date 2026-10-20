import { describe, expect, it } from 'vitest';
import { translateString } from '../src/i18n/domTranslate';
import { JA_DICTIONARY } from '../src/i18n/ja';

describe('translateString', () => {
  it('swaps an exact entry and keeps the surrounding whitespace', () => {
    expect(translateString(JA_DICTIONARY, '  Pass ')).toBe('  パス ');
  });

  it('fills a pattern from the captured numbers', () => {
    expect(translateString(JA_DICTIONARY, 'Move 2 of 10')).toBe('2手目 / 全10手');
    expect(translateString(JA_DICTIONARY, '5 kyu')).toBe('5級');
  });

  it('leaves text it has no entry for alone', () => {
    expect(translateString(JA_DICTIONARY, 'Q16')).toBeNull();
    expect(translateString(JA_DICTIONARY, '   ')).toBeNull();
    // Already translated: the observer sees its own write and must not loop.
    expect(translateString(JA_DICTIONARY, 'パス')).toBeNull();
  });
});
