import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAAME_GATE_FILENAME, MAAME_GATE_VERSION } from './maame-gate';

const lua = readFileSync(join(__dirname, '../main/lua-scripts', MAAME_GATE_FILENAME), 'utf8');

describe('bundled Maame gate', () => {
  it('is the version the app expects and registers PIG_VER', () => {
    expect(lua).toMatch(new RegExp(`^local GATE_VERSION = ${MAAME_GATE_VERSION}$`, 'm'));
    expect(lua).toContain('param:add_table(PARAM_TABLE_KEY, "PIG_", 1)');
  });
  it('still fails safe: the marker param is registered after the aux auth id', () => {
    expect(lua.indexOf('get_aux_auth_id')).toBeLessThan(lua.indexOf('add_table'));
  });
});
