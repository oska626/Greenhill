import type { GameState } from "./game-engine.ts";
import { LANDMARK_SCENES } from "./scene-state.ts";

export const NARRATIVE_MIN = 40;
export const NARRATIVE_MAX = 60;

export function chineseLength(text: string): number {
  return Array.from(text.matchAll(/[\u3400-\u9fff]/g)).length;
}

export function narrativeSentenceCount(text: string): number {
  return (text.match(/[。！？!]/g) || []).length;
}

export function containsSettlementLog(text: string): boolean {
  return /(?:氣血|精力|命脈|私銀|公款)(?:減|升|回復|增加|減少|餘|淨增)[零一二三四五六七八九十百千\d]+|\d+\s*(?:點|文)(?:氣血|精力|命脈)/.test(text);
}

function stripSettlement(event: string): string {
  return event
    .replace(/你沿明路費[零一二三四五六七八九十\d]+回合趕到/g, "你沿明路趕到")
    .replace(/你走(暗道|明路)，費了[零一二三四五六七八九十\d]+回合抵達/g, "你走$1抵達")
    .replace(/玄武樓趁這(?:一|[零一二三四五六七八九十\d]+)回合向城西施壓[；，]?(?:青鋒堂)?命脈減[零一二三四五六七八九十\d]+[。]?/g, "玄武樓的人又逼近城西。")
    .replace(/(?:青鋒堂)?(?:氣血|精力|命脈|私銀|公款)(?:減少|增加|回復|淨增|減|升|餘)[零一二三四五六七八九十百千\d]+(?:點|文)?[；，。]?/g, "")
    .replace(/(?:氣血|精力|命脈|私銀|公款)(?:都)?(?:已滿|不足|未動)[；，。]?/g, "")
    .replace(/[零一二三四五六七八九十百千\d]+(?:點|文)(?:精力|氣血|命脈)?/g, "")
    .replace(/[；，]{2,}/g, "，")
    .replace(/^[；，。\s]+|[；，。\s]+$/g, "");
}

function head(text: string, maximum: number): string {
  const characters = Array.from(text);
  let count = 0;
  let end = characters.length;
  for (let index = 0; index < characters.length; index++) {
    if (/[\u3400-\u9fff]/.test(characters[index])) count++;
    if (count >= maximum) { end = index + 1; break; }
  }
  return characters.slice(0, end).join("").replace(/[，；：、\s]+$/g, "");
}

function oneSentence(text: string): string {
  return text.replace(/[。！？!]+/g, "，").replace(/[，；：\s]+$/g, "");
}

export function validHardboiledNarrative(value: unknown): value is string {
  return typeof value === "string"
    && chineseLength(value) >= NARRATIVE_MIN && chineseLength(value) <= NARRATIVE_MAX
    && narrativeSentenceCount(value) >= 2 && narrativeSentenceCount(value) <= 3
    && !containsSettlementLog(value)
    && !/[0-9０-９]/.test(value)
    && !/[嘅咗喺啲唔冇嚟咁佢畀睇]/.test(value);
}

export function hardboiledFallback(event: string, state: GameState, reply?: { speaker: string; line: string }): string {
  if (state.flags.alleyEscape && state.currentLocation === "黑泥街") {
    return state.flags.alleyAllyPresent
      ? "刀口擦過後頸，血滴進泥裡。你拽陸千帆退入死巷，刀手封住肉檔前的路。陸千帆抓住你：「他媽的，先翻牆，回頭剁了那幫狗！」"
      : "刀口擦過後頸，血滴進泥裡。你獨自退入死巷，刀手封住肉檔前的路。你踢開餿水桶，踩著竹籮攀上牆頭，身後刀聲又近了一步。";
  }
  const clean = stripSettlement(event);
  const beats = clean.split(/[。！？!]+/).map((beat) => oneSentence(beat.trim())).filter(Boolean);
  const first = head(beats[0] || `你在${state.currentLocation}動了手`, 26);
  const last = beats.length > 1 ? head(beats[beats.length - 1], 22) : "";
  const speaker = reply?.speaker;
  const line = reply?.line ? head(oneSentence(reply.line), 20) : "";
  const dialogue = speaker && line ? `${speaker}：「${line}！」` : "";
  let sentences = [first, last].filter(Boolean).map((beat) => `${beat}。`);
  if (dialogue) sentences.push(dialogue);
  if (sentences.length < 2) {
    const locationBeat = head(LANDMARK_SCENES[state.currentLocation].routes.replace(/[。；]/g, "，"), 18);
    sentences.push(`${locationBeat}。`);
  }
  if (sentences.length > 3) sentences = [sentences[0], sentences.at(-2)!, sentences.at(-1)!];
  let result = sentences.join("");
  if (chineseLength(result) < NARRATIVE_MIN) {
    const extra = beats.slice(1, -1).find((beat) => !result.includes(beat));
    const addition = extra || LANDMARK_SCENES[state.currentLocation].conditions.replace(/[。；]/g, "，");
    const needed = Math.min(20, NARRATIVE_MIN - chineseLength(result) + 2);
    if (dialogue) sentences[0] = `${sentences[0].slice(0, -1)}，${head(addition, needed)}。`;
    else sentences[1] = `${sentences[1].slice(0, -1)}，${head(addition, needed)}。`;
    result = sentences.join("");
  }
  if (chineseLength(result) < NARRATIVE_MIN) {
    const extra = "你收住腳步，聽見街口有人踩過泥水，手仍按在袖邊";
    if (sentences.length < 3) sentences.push(`${extra}。`);
    else sentences[1] = `${sentences[1].slice(0, -1)}，${extra}。`;
    result = sentences.join("");
  }
  if (chineseLength(result) > NARRATIVE_MAX) {
    const excess = chineseLength(result) - NARRATIVE_MAX;
    sentences[0] = `${head(sentences[0].slice(0, -1), Math.max(12, chineseLength(sentences[0]) - excess))}。`;
    result = sentences.join("");
  }
  return result;
}
