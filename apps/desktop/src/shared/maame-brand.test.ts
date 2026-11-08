import { describe, expect, it } from 'vitest';
import { maameBrand } from './maame-brand';
import { t } from './i18n';

describe('maameBrand', () => {
  it('renames the product in prose', () => {
    expect(maameBrand('Welcome to ArduDeck.')).toBe('Welcome to MaameDrone-ArduDeck.');
    expect(maameBrand('<b>ArduDeck</b>, (ArduDeck)')).toBe('<b>MaameDrone-ArduDeck</b>, (MaameDrone-ArduDeck)');
    expect(maameBrand('此固件太旧,ArduDeck')).toBe('此固件太旧,MaameDrone-ArduDeck');
  });
  it('leaves paths, identifiers and branded text alone', () => {
    expect(maameBrand('Pictures/ArduDeck')).toBe('Pictures/ArduDeck');
    expect(maameBrand('needsNewerArduDeck')).toBe('needsNewerArduDeck');
    expect(maameBrand('MaameDrone-ArduDeck')).toBe('MaameDrone-ArduDeck');
  });
  it('is applied to translated strings', () => {
    expect(t('layout:appShell.about')).toBe('About MaameDrone-ArduDeck');
  });
});
