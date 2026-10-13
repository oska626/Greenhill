// These are ordinary status and medicine terms, even though they contain 血.
const gameTerms = /氣血|止血膏藥|止血散|止血/g;
const graphicWording = /[殺死砍血斷]/u;

export const GRAPHIC_ACTION_FALLBACK = "眼前局勢緊繃；請用威懾、制伏或逼退描述你的動作。";

export function containsGraphicWording(value: string): boolean {
  return graphicWording.test(value.replace(gameTerms, ""));
}

export function screenCustomAction(value: string): string | undefined {
  return containsGraphicWording(value) ? GRAPHIC_ACTION_FALLBACK : undefined;
}
