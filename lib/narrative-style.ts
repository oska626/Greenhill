import type { GameState } from "./game-engine.ts";
import { hasOffSceneDirectSpeech, localNpcReply } from "./social-influence.ts";

export function chineseLength(text: string): number {
  return Array.from(text.matchAll(/[\u3400-\u9fff]/g)).length;
}

export function narrativeSentenceCount(text: string): number {
  return (text.match(/[。！？!]/g) || []).length;
}

export function containsSettlementLog(text: string): boolean {
  return /(?:氣血|精力|命脈|防線|守備|私銀|公款)(?:再)?(?:減|升|回復|增加|減少|餘|淨增|[+＋-－])[零一二三四五六七八九十百千\d]+|[零一二三四五六七八九十百千\d]+\s*(?:點|文)(?:氣血|精力|命脈|防線|守備)|造成[零一二三四五六七八九十百千\d]+點傷害/.test(text);
}

/** Keep authored scene facts while dropping legacy ledger clauses from the story channel. */
export function withoutSettlementLog(text: string): string {
  return text
    .replace(/(?:對手|刀手)氣血(?:減|[－-])[零一二三四五六七八九十百千\d]+(?:點)?/g, "對手攻勢一滯")
    .replace(/(?:你)?氣血(?:減|[－-])[零一二三四五六七八九十百千\d]+(?:點)?/g, "你強忍痛楚")
    .replace(/(?:青鋒堂)?(?:氣血|精力|命脈|防線|守備|私銀|公款)(?:再)?(?:減|升|回復|增加|減少|餘|淨增|[+＋-－])[零一二三四五六七八九十百千\d]+(?:點|文)?/g, "")
    .replace(/(?:耗去|耗費|消耗|傷及|傷了|傷勢多)[零一二三四五六七八九十百千\d]+點(?:氣血|精力)?/g, "")
    .replace(/造成[零一二三四五六七八九十百千\d]+點傷害/g, "")
    .replace(/[；，]\s*[；，。]/g, "。")
    .replace(/。{2,}/g, "。").trim();
}

export function completeSentences(text: string, fallback: string): string[] {
  const sentences = text.match(/[^。！？!]+[。！？!]/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  return sentences.length ? sentences : [fallback];
}

export function appendRelationshipFeedback(narrative: string, event: string): string {
  const feedback = event.match(/（[^（）]*對你的[^（）]*）$/u)?.[0];
  return feedback && !narrative.includes(feedback) ? `${narrative}${feedback}` : narrative;
}

export function validHardboiledNarrative(value: unknown): value is string {
  return typeof value === "string"
    && chineseLength(value) > 0 && narrativeSentenceCount(value) >= 1
    && !/你看清[^。]{0,20}眼前的動靜|微風|落葉|靜謐|平靜/.test(value)
    && !/[嘅咗喺啲唔冇嚟咁佢畀睇]/.test(value);
}

function hardboiledFallbackCore(event: string, state: GameState, reply?: { speaker: string; line: string }): string {
  reply = localNpcReply(state, reply);
  if (state.questStep === "market_collection" && state.currentLocation === "黑泥街"
    && state.flags.visitedGu && event.startsWith("你趕到黑泥街市集肉檔")) {
    if (!state.inventory.includes("【止血膏藥】")) return event.trim();
    const medicineNote = event.includes("顧忘生提過的灰線刀手")
      ? "懷裡的膏藥尚帶餘溫，你也記著顧忘生提過的灰線刀手。"
      : "懷裡的膏藥封口尚未拆開，黑泥街的腥氣已撲面而來。";
    return `${medicineNote}\n\n肉檔前，陸千帆按傷喘息，張斷骨隔著厚砧板冷眼相對，拒交五十文規費。`;
  }
  if (state.questStep === "market_collection" && state.currentLocation === "黑泥街"
    && state.flags.visitedYung && event.startsWith("你趕到黑泥街市集肉檔")) {
    if (!state.inventory.includes("【金創散】")) return event.trim();
    const warning = event.includes("容晚秋提過的灰線刀手")
      ? "袖裡的金創散貼著手腕，容晚秋提過的灰線刀手仍在你心上。"
      : "袖裡的金創散尚未拆封，黑泥街肉檔的腥氣已迎面撲來。";
    return `${warning}\n\n陸千帆扶著肉案站穩，張斷骨隔著厚砧板拒交規費；巷口還有人影。`;
  }
  if (state.questStep === "kuyan_medicine" && state.currentLocation === "苦煙館"
    && event.startsWith("你踏進苦煙館")) {
    const arrival = event.includes("腰間新添的銅錢輕響") ? "你踏進苦煙館，腰間新添的銅錢輕響。"
      : event.includes("堂主說過的短刀") ? "你踏進苦煙館，還記著堂主說過的短刀。"
        : event.includes("陸千帆傷口的深淺") ? "你踏進苦煙館，先把陸千帆的傷口說清。"
          : event.includes("堂主指過的市集暗巷") ? "你踏進苦煙館，記著堂主指過的暗巷。"
            : "你踏進苦煙館，袖口的雨還未乾。";
    return `${arrival}顧忘生把膏藥封口轉到燈下，指著繩結叫你辨清；藥煙貼著桌面，藥罐仍開著。`;
  }
  if (state.flags.alleyWall && state.currentLocation === "黑泥街") {
    return `${event.trim()}牆背仍有刀手守著落腳處，追兵正向牆頭逼近。`;
  }
  if (state.flags.alleyEscape && state.currentLocation === "黑泥街") {
    return `${event.trim()}巷尾竹籮仍未挪到牆邊，刀手守住肉檔前的路。`;
  }
  if (state.flags.marketAftermath && state.currentLocation === "黑泥街") {
    if (state.flags.marketAftermathKind === "truce")
      return `${event.trim()}刀手已收刀，肉檔前仍須收拾。`;
    if (state.flags.marketAftermathKind === "defeat") {
      return `${event.trim()}${state.flags.alleyAllyPresent ? "陸千帆扶著肉案退到你身旁；刀手仍守著街口。" : "刀手仍守著肉檔街口，你只能先沿後巷撤走。"}`;
    }
    if (state.flags.marketAftermathKind === "escape") {
      return `${event.trim()}牆那邊仍有腳步，後巷尚須警戒。`;
    }
    const brokenStick = /木棍.*(?:折斷|打裂)/.test(event) ? "案邊木棍裂開，" : "";
    return `${brokenStick}${event.trim()}${state.flags.alleyAllyPresent
      ? "陸千帆留在肉案旁，盯著尚未散去的巷口眼線。"
      : "張斷骨仍躲在肉案後，巷口眼線未散。"}`;
  }
  const eventSentences = completeSentences(event.trim(), `你仍在${state.currentLocation}，眼前局勢沒有改變。`)
    .filter((sentence) => !hasOffSceneDirectSpeech(state, sentence));
  const account = eventSentences.join("") || `你仍在${state.currentLocation}，眼前局勢沒有改變。`;
  const dialogue = reply?.speaker && reply.line && !account.includes(`${reply.speaker}：「`)
    ? `\n${reply.speaker}：「${reply.line}」` : "";
  return `${account}${dialogue}`;
}

export function hardboiledFallback(event: string, state: GameState, reply?: { speaker: string; line: string }): string {
  return withoutSettlementLog(appendRelationshipFeedback(hardboiledFallbackCore(withoutSettlementLog(event), state, reply), event));
}
