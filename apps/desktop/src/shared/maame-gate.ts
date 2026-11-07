/**
 * The Maame Pi arming gate bundled with this build (main/lua-scripts/maame_pi_gate.lua,
 * copied from maame-autonomous-drone/ardupilot/scripts - that repo is the source).
 * The running gate reports its version in the PIG_VER parameter.
 */
export const MAAME_GATE_FILENAME = 'maame_pi_gate.lua';
/** Must equal GATE_VERSION in the bundled Lua (checked by maame-gate.test.ts). */
export const MAAME_GATE_VERSION = 2;
export const MAAME_GATE_PARAM = 'PIG_VER';
