// Remove established game terms and benign idioms before checking graphic phrases.
const safeWords = /氣血|止血膏藥|止血散|止血|張斷骨|殺氣|殺機|殺陣|殺價|生死|死角|死路|死穴|死結|視死如歸|砍價|砍柴|判斷|斷定|斷絕|斷線|恩斷義絕|果斷|心血|血色|熱血|血脈/g;

// Match explicit gore and dismemberment, not single characters used throughout wuxia prose.
const graphicViolence = /血肉模糊|血肉橫飛|鮮血(?:直噴|狂噴|四濺)|噴血|血(?:液|水)?[^，。]{0,4}狂噴|血流成河|斬首|砍頭|斷肢|分屍|碎屍|肢解|爆頭|開膛破肚|殘殺|虐殺|屠殺/u;

export const GRAPHIC_ACTION_FALLBACK = "這一招寫得太狠，說書先生連茶盞都擱下了。換個說法吧：威懾、制伏或逼退，江湖路還長。";

export function checkContent(text: string): boolean {
  return !graphicViolence.test(text.replace(safeWords, ""));
}

export function containsGraphicWording(value: string): boolean {
  return !checkContent(value);
}

export function screenCustomAction(value: string): string | undefined {
  return containsGraphicWording(value) ? GRAPHIC_ACTION_FALLBACK : undefined;
}
