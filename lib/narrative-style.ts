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
  return /(?:氣血|精力|命脈|防線|守備|私銀|公款)(?:減|升|回復|增加|減少|餘|淨增)[零一二三四五六七八九十百千\d]+|\d+\s*(?:點|文)(?:氣血|精力|命脈|防線|守備)/.test(text);
}

function stripSettlement(event: string): string {
  return event
    .replace(/你沿明路費[零一二三四五六七八九十\d]+回合趕到/g, "你沿明路趕到")
    .replace(/你走(暗道|明路)，費了[零一二三四五六七八九十\d]+回合抵達/g, "你走$1抵達")
    .replace(/玄武樓趁這(?:一|[零一二三四五六七八九十\d]+)回合向城西施壓[；，]?(?:青鋒堂)?命脈減[零一二三四五六七八九十\d]+[。]?/g, "玄武樓的人又逼近城西。")
    .replace(/(?:青鋒堂)?(?:氣血|精力|命脈|防線|守備|私銀|公款)(?:減少|增加|回復|淨增|減|升|餘)[零一二三四五六七八九十百千\d]+(?:點|文)?[；，。]?/g, "")
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
  if (end < characters.length) {
    const prefix = characters.slice(0, end);
    const boundary = prefix.findLastIndex((character) => /[，；。！？]/.test(character));
    if (boundary >= 6) end = boundary;
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
  if (state.questStep === "market_collection" && state.currentLocation === "黑泥街"
    && event.includes("你從顧忘生手中領了止血膏藥，趕到黑泥街市集肉檔")) {
    const clinic = event.includes("顧忘生遣人通知堂口")
      ? "苦煙館裡，顧忘生遣人傳信，遞來膏藥，低聲道"
      : event.includes("顧忘生說有袖口繫灰線的刀手")
        ? "苦煙館裡，顧忘生說起灰線刀手，遞來膏藥，低聲道"
        : event.includes("你在藥煙散去的窗邊調勻氣息")
          ? "苦煙館裡，你調勻氣息，顧忘生遞來膏藥，低聲道"
          : event.includes("顧忘生教你認清膏藥封口")
            ? "苦煙館裡，你認清封口，顧忘生遞來膏藥，低聲道"
            : "苦煙館裡，顧忘生遞來膏藥，低聲道";
    return `${clinic}：「先壓住千帆的傷口。」\n\n你帶藥趕到黑泥街肉檔。陸千帆仍帶傷，張斷骨隔著肉案拒交規費。`;
  }
  if (state.questStep === "kuyan_medicine" && state.currentLocation === "苦煙館"
    && event.includes("你到苦煙館見顧忘生")) {
    const arrival = event.includes("你向何不歸討路費") ? "你踏進苦煙館，腰間新添的銅錢輕響。"
      : event.includes("你問清刀手路線") ? "你踏進苦煙館，還記著堂主說過的短刀。"
        : event.includes("你記下陸千帆傷口") ? "你踏進苦煙館，先把陸千帆的傷口說清。"
          : event.includes("你認清通往市集的暗巷") ? "你踏進苦煙館，鞋底仍沾著暗巷的泥。"
            : "你踏進苦煙館，袖口的雨還未乾。";
    return `${arrival}顧忘生把膏藥封口轉到燈下，指著繩結叫你辨清；藥煙貼著桌面，藥罐仍開著。`;
  }
  if (state.flags.alleyWall && state.currentLocation === "黑泥街") {
    return /早有防備|偏頭躲開/.test(event)
      ? "暗手落空，刀手偏頭避開。你被逼回牆頭，追兵踩著竹籮爬上來；牆背的刀手還守著落腳處，眼前只剩半步可挪。"
      : "餿水桶翻倒，追兵腳下一滑。你借竹籮蹬上矮牆，手背又添刀痕；牆背另一名刀手卡住落腳處，身後的人正踩著竹籮追上來。";
  }
  if (state.flags.alleyEscape && state.currentLocation === "黑泥街") {
    return state.flags.alleyAllyPresent
      ? "刀口擦過後頸，血滴進泥裡。你拽陸千帆退入死巷，刀手封住肉檔前的路。陸千帆抓住你：「他媽的，先翻牆，回頭剁了那幫狗！」"
      : "刀口擦過後頸，血滴進泥裡。你獨自退入死巷，刀手封住肉檔前的路；餿水桶和廢竹籮堵在巷尾，追兵正踏進泥水。";
  }
  if (state.flags.marketAftermath && state.currentLocation === "黑泥街") {
    if (state.flags.marketAftermathKind === "escape") {
      return state.flags.alleyAllyPresent
        ? "你翻到牆背，刀手沒能跟進後巷。血沿手背滴下，陸千帆的傷也未止住；牆那邊仍有腳步，先收拾傷口，再離開黑泥街。"
        : "你翻到牆背，刀手沒能跟進後巷。血沿手背滴下，牆那邊仍有腳步；你得先裹住刀口，封好退路，才能走出黑泥街。";
    }
    const brokenStick = /木棍.*(?:折斷|打裂)/.test(event) ? "案邊木棍裂開，" : "";
    const opening = /傳出的信帶來接應/.test(event)
      ? "接應的人趕到巷口，刀手退入暗巷。"
      : /刀手退入暗巷/.test(event) ? "你撞開刀手重奪街口，追兵退入暗巷。"
      : "刀手倒在肉案前，街口的腳步終於散了。";
    return state.flags.alleyAllyPresent
      ? `${brokenStick}${opening}陸千帆按住肋下，看著肉檔：「街口先守住。眼線還在，收拾這攤血帳！」`
      : `${brokenStick}${opening}你踩過肉檔前的血水，見張斷骨還躲在案後；巷口眼線未散，街坊仍不敢走近。`;
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
