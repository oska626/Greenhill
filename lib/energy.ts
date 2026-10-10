import type { GameState } from "./game-engine.ts";

export const MAX_ENERGY = 50;
export const FATIGUE_THRESHOLD = 10;

const tagOf = (action: string) => /^\w\. \[([^\]]+)\]/.exec(action)?.[1] || "";

export function actionEnergyCost(state: GameState, action: string, turns = 1): number {
  if (action.startsWith("[初入堂口]") || action.startsWith("A. [踏入第一章]")) return 0;
  const tag = tagOf(action);
  if (/休整|療傷調息|總壇休養|買藥療傷|服用療傷藥/.test(tag)) return 0;
  if (/^(明路前往|暗道前往|前往)$/.test(tag)) return turns;

  let cost = 1;
  if (state.questStep === "chapter_one") {
    if (/^(核對貨帳|巡視街口|查黑泥街|查鬼骰坊|查苦煙館|查夜雨樓|查碼頭貨單|夜探碼頭|硬奪碼頭|向城主呈報)$/.test(tag)) cost = 2;
    if (tag === "運步夜探") cost = 4;
    if (tag === "運勁奪港") cost = 6;
  } else if (state.combat || state.questStep === "huizhi_ambush") {
    if (tag === "袖藏暗手") cost = 1;
    if (tag === "全力陰手") cost = 2;
    if (tag === "借地形") cost = 2;
    if (tag === "辨穴陰招" || tag === "佯攻破綻" || tag === "裂石短拳") cost = 4;
    if (/泥鰍卸力|卸力手|泥鰍步/.test(tag)) cost = 3;
  } else {
    if (tag === "全力陰手") cost = 2;
    if (tag === "踩籮翻牆" || tag === "踢翻餿水桶" || tag === "硬闖街口") cost = 2;
    if (/查|核|探|追|盯|盤點|巡視|搬貨|做工|牽制|辨認|記住暗巷|問清敵情|詳問傷勢|辦差|速辦/.test(tag)) cost = 2;
    if (tag === "暗查巷口") cost = 3;
    if (/^習/.test(tag)) {
      const rank = tag === "習泥鰍步" ? state.knownMoves?.mud_step || 0
        : tag === "習裂石短拳" ? state.knownMoves?.short_punch || 0
          : tag === "習卸力手" ? state.knownMoves?.soft_parry || 0 : state.knownMoves?.point_strike || 0;
      cost = rank >= 3 ? 1 : [4, 6, 8][rank];
    }
    if (tag === "斷開跟梢") cost = 4;
    if (action.startsWith("F. [自訂手段]")) cost = /做工|牽制/.test(action) ? 3 : /查線索|護人/.test(action) ? 2 : 1;
  }
  if (state.playerMp <= FATIGUE_THRESHOLD && /查|核|探|追|盯|問清|詳問|呈報|交涉|和談|買消息|買暗道|辨|盤點|領差|辦差|速辦/.test(tag)) cost += 1;
  return cost;
}

export function canAffordEnergy(state: GameState, cost: number, action = ""): boolean {
  return cost <= 1 || /\[(?:明路前往|暗道前往|前往)\]/.test(action) || state.playerMp >= cost;
}

export function spendEnergy(state: GameState, cost: number, alreadySpent = 0, travel = false): string {
  const remaining = Math.max(0, cost - alreadySpent);
  if (remaining === 0) return "";
  if (state.playerMp >= remaining) {
    state.playerMp -= remaining;
    return `精力減${remaining}。`;
  }
  if ((cost === 1 && state.playerMp === 0) || travel) {
    const energyUsed = Math.min(state.playerMp, remaining);
    state.playerMp -= energyUsed;
    const before = state.playerHp;
    state.playerHp = Math.max(1, before - 2 * (remaining - energyUsed));
    return `精力耗盡，你勉強${travel ? "走完路程" : "行動"}，氣血減${before - state.playerHp}。`;
  }
  return "";
}

export function availableWithEnergy(state: GameState, options: string[]): string[] {
  return options.filter((option) => canAffordEnergy(state, actionEnergyCost(state, option,
    Number(/(?:共)?(\d+)回合/.exec(option)?.[1] || 1)), option));
}
