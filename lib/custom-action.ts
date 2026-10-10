import type { GameState, Landmark } from "./game-engine.ts";
import { LANDMARK_SCENES, normalizeSceneState, objectStatus } from "./scene-state.ts";

export const CUSTOM_ACTION_MAX = 2;

export const SCENE_ANCHORS: Record<Landmark, readonly string[]> = {
  "青鋒堂總壇": ["帳簿", "門閂", "堂口同門", "何不歸"],
  "晚秋茶寮": ["茶桌", "土灶", "容晚秋"],
  "黑泥街": ["肉案", "後巷", "攤販", "張斷骨", "陸千帆"],
  "鬼骰坊": ["骰桌", "借據", "祁觀衡"],
  "裂石擂": ["圍欄", "衛沉岳", "霍破陣"],
  "苦煙館": ["藥櫃", "藥包", "顧忘生"],
  "夜雨樓": ["側門", "柳照霜"],
  "碼頭": ["貨單", "貨箱", "船工", "碼頭守衛"],
};

export const CREATIVE_GOALS = ["查線索", "護人", "做工", "牽制", "交涉"] as const;
export type CreativeGoal = typeof CREATIVE_GOALS[number];
export type CreativeAction = { goal: CreativeGoal; anchor: string };
export type CustomDecision =
  | { kind: "option"; option: string }
  | { kind: "creative"; plan: CreativeAction }
  | { kind: "special"; action: string }
  | { kind: "reject"; reason: "unclear" | "impossible" | "unavailable" };

export function sceneAnchors(state: GameState): string[] {
  const local = SCENE_ANCHORS[state.currentLocation].filter((anchor) =>
    anchor !== "陸千帆" || !state.relationships["陸千帆"].estranged);
  const scene = normalizeSceneState(state.sceneState, state.worldFlags);
  const objects = LANDMARK_SCENES[state.currentLocation].objects
    .filter((object) => { const status = objectStatus(scene, object.name);
      return status?.visibility === "visible" && status.reach === "near" && !status.holder; })
    .map((object) => object.name);
  const entrance = state.sceneState?.discoveredEntrances.includes(state.currentLocation as "晚秋茶寮" | "鬼骰坊" | "夜雨樓")
    ? ["暗道入口"] : [];
  return Array.from(new Set([...local, ...objects, ...entrance, ...state.inventory]));
}

export function negatesIrreversibleAction(text: string): boolean {
  return /(?:唔會|唔想|唔好|不會|不想|不要|絕不|並不|沒有|未曾|唔|不|別)[^，。；！？]{0,8}(?:出賣|背叛|私吞|打斷|致殘|廢了)/.test(text);
}

export function validateCustomDecision(raw: unknown, state: GameState, options: string[], playerText: string): CustomDecision {
  if (!raw || typeof raw !== "object") return { kind: "reject", reason: "unclear" };
  if (/槍械|手槍|步槍|機關槍|超人|神仙|飛天|激光|雷射|核彈|手機|電腦|修仙|法術/.test(playerText))
    return { kind: "reject", reason: "impossible" };
  const value = raw as Record<string, unknown>;
  if (value.kind === "option" && typeof value.option === "string" && options.includes(value.option))
    return { kind: "option", option: value.option };
  if (value.kind === "creative" && state.questStep === "sandbox" && !state.combat && !state.flags.pendingIncident
    && !state.flags.alleyEscape
    && CREATIVE_GOALS.some((goal) => goal === value.goal) && typeof value.anchor === "string"
    && sceneAnchors(state).includes(value.anchor)
    && (value.goal !== "交涉" || ["何不歸", "容晚秋", "陸千帆", "張斷骨", "祁觀衡", "衛沉岳", "霍破陣", "顧忘生", "柳照霜"].includes(value.anchor)))
    return { kind: "creative", plan: { goal: value.goal as CreativeGoal, anchor: value.anchor } };
  if (value.kind === "special" && state.questStep === "market_collection" && !negatesIrreversibleAction(playerText)
    && !/如果|假如|會點|點樣|可唔可以|是否可以/.test(playerText)
    && Array.isArray(value.specials) && value.specials.length > 0) {
    const specials = value.specials.filter((item): item is string => typeof item === "string");
    if (specials.length !== value.specials.length || specials.some((item) => !["betray", "embezzle", "maim"].includes(item)))
      return { kind: "reject", reason: "unclear" };
    if (specials.includes("betray") && !/(?:出賣|背叛|不救)陸千帆/.test(playerText)) return { kind: "reject", reason: "unclear" };
    if (specials.includes("embezzle") && !/私吞|昧起|袋起|自己收/.test(playerText)) return { kind: "reject", reason: "unclear" };
    if (specials.includes("maim") && !/(?:打斷|致殘|廢了)張斷骨/.test(playerText)) return { kind: "reject", reason: "unclear" };
    return { kind: "special", action: `F. [自訂手段] ${specials.map((item) =>
      item === "betray" ? "出賣陸千帆" : item === "embezzle" ? "私吞五十文規費" : "打斷張斷骨右手").join("，")}` };
  }
  return { kind: "reject", reason: value.kind === "reject" && value.reason === "impossible" ? "impossible" : "unclear" };
}
