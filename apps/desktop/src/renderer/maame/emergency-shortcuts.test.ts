import { describe, expect, it } from 'vitest';
import { COPTER_MODE } from './MaameFlightCard';
import { shortcutMode } from './MaameEmergencyBar';

const key = (k: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: k, shiftKey: true, ctrlKey: false, metaKey: false, altKey: false, ...mods,
});
const typing = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;

describe('Maame emergency shortcuts', () => {
  it('maps Shift+P/A/R/L to BRAKE/AUTO/RTL/LAND', () => {
    expect(shortcutMode(key('P'), null)).toBe(COPTER_MODE.BRAKE);
    expect(shortcutMode(key('a'), null)).toBe(COPTER_MODE.AUTO);
    expect(shortcutMode(key('R'), null)).toBe(COPTER_MODE.RTL);
    expect(shortcutMode(key('L'), null)).toBe(COPTER_MODE.LAND);
  });
  it('ignores plain letters, Ctrl/Cmd combos, typing in fields, and has no kill key', () => {
    expect(shortcutMode(key('P', { shiftKey: false }), null)).toBeNull();
    expect(shortcutMode(key('L', { metaKey: true }), null)).toBeNull();
    expect(shortcutMode(key('R'), typing)).toBeNull();
    expect(shortcutMode(key('K'), null)).toBeNull();
  });
});
