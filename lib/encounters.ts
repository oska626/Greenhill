import type { GameState, Landmark } from "./game-engine.ts";
import { getPseudoRandom } from "./state-random.ts";
import type { Option } from "./types.ts";

type EncounterChoice = Option & {
  event: string;
  silver?: number;
  price?: number;
  lifeline?: number;
  refusal?: string;
};
type DynamicEncounter = {
  id: string;
  location: Landmark;
  report: string;
  condition: (state: GameState, loc: Landmark) => boolean;
  choices: readonly EncounterChoice[];
};

export const ENCOUNTERS = [
  { id: "hall_dispute", location: "青鋒堂總壇", report: "兩名幫眾為收規地盤拍案爭吵，手已按上刀柄。",
    condition: (state, loc) => loc === "青鋒堂總壇" && state.turn > state.lastEncounterTurn + 2 && getPseudoRandom(state) < 20,
    choices: [
      { label: "A. [立威] 拍碎木桌鎮住場面", actionTags: ["ruthless", "trouble"], lifeline: 4,
        event: "你一掌拍裂桌面，兩人鬆開刀柄。堂口規矩暫穩。" },
      { label: "B. [無視] 讓堂主親自去頭痛", actionTags: ["cautious", "cowardly"], lifeline: -4,
        event: "你把爭執留給堂主。兩人仍堵在帳房門前。" },
    ] },
  { id: "tea_tail", location: "晚秋茶寮", report: "對面茶桌有人記下你的行蹤，筆尖壓在袖中的紙上。",
    condition: (state, loc) => loc === "晚秋茶寮" && state.turn > state.lastEncounterTurn + 2 && getPseudoRandom(state) < 20,
    choices: [
      { label: "A. [繞路甩開] 耗精力甩脫跟蹤", actionTags: ["cautious"], event: "你繞過茶寮後門，腳步在兩條窄巷間換了三次；暗探跟丟了。" },
      { label: "B. [反制] 奪下對方通報信物", actionTags: ["profitable", "trade"], silver: 5,
        event: "你截住他的手，奪下通報信物；布袋裡另有五文私銀，你收進袖口。" },
    ] },
  { id: "market_pickpocket", location: "黑泥街", report: "有人撞進你懷裡，手指正摸向你的錢袋結。",
    condition: (state, loc) => loc === "黑泥街" && state.turn > state.lastEncounterTurn + 2 && getPseudoRandom(state) < 20,
    choices: [
      { label: "A. [擒拿] 扣住手腕逼他交錢", actionTags: ["protective", "profitable"], silver: 6,
        event: "你反手扣住扒手腕脈，逼他鬆開五指；六文銅錢落進泥水，你逐枚撿起。" },
      { label: "B. [退開] 護住錢袋冷眼放行", actionTags: ["cautious"], event: "你收緊錢袋結，退開半步；扒手見無從下手，混進人群。" },
    ] },
  { id: "dice_debt", location: "鬼骰坊", report: "欠債賭客被莊家按在桌邊，抬頭求你替他墊錢。",
    condition: (state, loc) => loc === "鬼骰坊" && state.turn > state.lastEncounterTurn + 2 && getPseudoRandom(state) < 20,
    choices: [
      { label: "A. [介入] 替他墊付十文私銀", actionTags: ["generous", "rule-breaking"], price: 10,
        event: "你拍下十文私銀。莊家鬆手，賭客抱著欠條退出賭坊。",
        refusal: "私銀不足十文，莊家沒有收錢；你只能看著他把賭客帶出門。" },
      { label: "B. [冷眼] 看他被莊家拖出去", actionTags: ["rules"], event: "你沒有插手。莊家收起欠條，把賭客帶出門。" },
    ] },
  { id: "arena_blockade", location: "裂石擂", report: "輸掉擂台的拳手堵在巷口，伸手討要傷藥費。",
    condition: (state, loc) => loc === "裂石擂" && state.turn > state.lastEncounterTurn + 2 && getPseudoRandom(state) < 20,
    choices: [
      { label: "A. [逼退] 拔出半寸刀鋒嚇退", actionTags: ["brave", "ruthless"], event: "你推開刀鍔半寸，拳手看了眼刀口，收手退到牆邊。" },
      { label: "B. [閃避] 憑身法繞過攔路者", actionTags: ["cautious"], event: "你錯身繞過他的肩頭，從巷壁與貨車間穿了過去。" },
    ] },
  { id: "clinic_patron", location: "苦煙館", report: "一名傷患攥住你的衣袖，指著櫃上的止痛藥，求你替他付帳。",
    condition: (state, loc) => loc === "苦煙館" && state.turn > state.lastEncounterTurn + 2 && getPseudoRandom(state) < 20,
    choices: [
      { label: "A. [震開] 運勁震開他的雙手", actionTags: ["violence"], event: "你運勁抽回衣袖，讓他扶穩藥櫃；顧忘生過來接手。" },
      { label: "B. [讓藥] 扣除私銀替他付帳", actionTags: ["generous", "protective"], price: 10, lifeline: 2,
        event: "你替傷患付了藥錢，顧忘生把藥交到他手裡。",
        refusal: "私銀不足十文，顧忘生沒有收錢；她先讓傷患坐下候藥。" },
    ] },
  { id: "tower_drunk", location: "夜雨樓", report: "醉客攔在樓梯口，握著短刀，酒氣逼得人退開兩步。",
    condition: (state, loc) => loc === "夜雨樓" && state.turn > state.lastEncounterTurn + 2 && getPseudoRandom(state) < 20,
    choices: [
      { label: "A. [奪刀] 奪下短刀將他推開", actionTags: ["brave"], event: "你扣住他的刀腕，取下短刀推到樓梯一側；樓道重新讓出來。" },
      { label: "B. [退讓] 貼牆避開免生事端", actionTags: ["cautious"], lifeline: -1,
        event: "你貼牆讓他過去。幾名看客記下你讓路的樣子。" },
    ] },
] as const satisfies readonly DynamicEncounter[];

export type EncounterId = typeof ENCOUNTERS[number]["id"];

export function encounterOptions(id: EncounterId): string[] {
  return [...(ENCOUNTERS.find((encounter) => encounter.id === id)?.choices || [])].map((choice) => choice.label);
}

export function encounterChoice(id: EncounterId, action: string): EncounterChoice | undefined {
  return ENCOUNTERS.find((encounter) => encounter.id === id)?.choices.find((choice) => choice.label === action);
}

export function drawEncounter(state: GameState): (typeof ENCOUNTERS)[number] | undefined {
  return ENCOUNTERS.find((encounter) => encounter.condition(state, state.currentLocation));
}

export function resolveEncounter(state: GameState, id: EncounterId, action: string): string | undefined {
  const encounter: DynamicEncounter | undefined = ENCOUNTERS.find((item) => item.id === id);
  const choice = encounter?.choices.find((item) => item.label === action);
  if (!choice || encounter?.location !== state.currentLocation) return undefined;
  if (choice.price && state.silver < choice.price) return choice.refusal;
  if (choice.price) state.silver -= choice.price;
  if (choice.silver) state.silver += choice.silver;
  if (choice.lifeline) state.sectLifeline = Math.max(0, Math.min(100, state.sectLifeline + choice.lifeline));
  return choice.event;
}
