/**
 * Maame branding: shows "MaameDrone-ArduDeck" wherever upstream text says
 * "ArduDeck", via one i18next post-processor instead of editing ~180 strings
 * per language (keeps upstream merges clean).
 */
export const MAAME_PRODUCT_NAME = 'MaameDrone-ArduDeck';

// Not after a letter, "/" or "-": leaves folder paths (Pictures/ArduDeck),
// identifiers (needsNewerArduDeck) and already-branded text alone.
const UPSTREAM_NAME = /(?<![A-Za-z0-9_/-])ArduDeck/g;

export function maameBrand(text: string): string {
  return text.replace(UPSTREAM_NAME, MAAME_PRODUCT_NAME);
}

export const maameBrandPostProcessor = {
  type: 'postProcessor' as const,
  name: 'maameBrand',
  process: (value: string) => (typeof value === 'string' ? maameBrand(value) : value),
};
