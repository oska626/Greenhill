import type { GameState, Landmark } from "./game-engine.ts";
import { LANDMARK_SCENES, normalizeSceneState, objectStatus } from "./scene-state.ts";
import { inferSocialIntent, SOCIAL_GOALS, SOCIAL_TACTICS, socialTargets, type SocialIntent } from "./social-influence.ts";

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
export const MARKET_APPROACHES = ["救護", "查探", "交涉", "施壓", "借物", "脫身", "進擊", "防守", "奪械"] as const;
export type MarketApproach = typeof MARKET_APPROACHES[number];
export type MarketIntent = { approach: MarketApproach; target: string; object?: string; method: string };
// The effect is a bounded consequence channel, not a list of permitted moves.
// The player supplies the method; the model only extracts the attempted effect.
export const SCENE_EFFECTS = ["harm", "protect", "disrupt", "seize", "move", "inspect"] as const;
export type SceneEffect = typeof SCENE_EFFECTS[number];
export type SceneAttempt = { effect: SceneEffect; target: string; object?: string; method: string; gesture?: string };
export function isDisarmAttemptText(text: string): boolean {
  const attempt = /空手入白刃|(?:奪|搶|卸|繳)(?:走|下|過)?[^，。！？?]{0,8}(?:刀|武器|兵器|械)/.test(text);
  return attempt && !/(?:唔|不|別|沒有|未曾)[^，。！？?]{0,5}(?:奪|搶|卸|繳)/.test(text)
    && !/如果|假如|假設|會點|可唔可以|能否/.test(text);
}
export function isMarketIntentScene(state: GameState): boolean {
  return state.currentLocation === "黑泥街" && (state.questStep === "market_collection"
    || state.combat?.scenario === "market_ambush" || Boolean(state.flags.alleyEscape) || Boolean(state.flags.marketAftermath));
}

// Clear handling of a named, reachable prop can use the deterministic physical
// rules directly. The model remains responsible for less explicit free actions.
export function interpretGroundedObjectHandling(state: GameState, playerText: string): CustomDecision | null {
  if (!isMarketIntentScene(state) || !/(?:取下|取出|扯下|摘下|拿下|解下|拿起|拎起|拾起|抄起)/.test(playerText)
    || /(?:如果|假如|假設|會點|可唔可以|能否)/.test(playerText)) return null;
  const active = playerText.split(/(?:反而|改為|改用|但係|但是|不過)/).at(-1)?.trim() || "";
  if (/(?:唔|不|別|不要|唔好|未|冇|沒有)[^，、。]{0,8}(?:取下|取出|扯下|摘下|拿下|解下|拿起|拎起|拾起|抄起)/.test(active)) return null;
  const decision = interpretMarketText(state, playerText);
  if (decision.kind !== "market_intent" || decision.plan.approach !== "借物" || !decision.plan.object)
    return null;
  const status = objectStatus(normalizeSceneState(state.sceneState, state.worldFlags), decision.plan.object);
  return status?.visibility === "visible" && status.reach === "near" && !status.holder
    && !state.sceneState?.movedObjects?.[decision.plan.object]
    ? decision : null;
}
export function marketIntentTargets(state: GameState): string[] {
  const behindWall = state.flags.marketAftermathKind === "escape" && state.flags.marketAftermath;
  const alley = Boolean(state.flags.alleyEscape || behindWall);
  const targets = behindWall ? ["自己", "巷口"]
    : alley ? ["自己", "巷口", "刀手"]
    : state.combat ? ["自己", "街口", "肉檔", "刀手"]
      : state.flags.marketAftermath ? ["自己", "街口", "肉檔", "張斷骨"]
        : ["自己", "街口", "肉檔", "刀手", "張斷骨"];
  if (!state.relationships["陸千帆"].estranged && (state.questStep === "market_collection" || state.flags.alleyAllyPresent || state.combat?.allyPresent))
    targets.push("陸千帆");
  return targets;
}
export function marketIntentObjects(state: GameState): string[] {
  const alley = Boolean(state.flags.alleyEscape || state.flags.marketAftermathKind === "escape");
  const objects = state.flags.marketAftermath && state.flags.marketAftermathKind === "escape" ? ["廢竹籮"]
    : state.flags.marketAftermath ? ["碎骨片"]
    : alley ? state.flags.alleyWall ? ["廢竹籮"] : ["廢竹籮", "餿水桶"]
    : ["懸肉鐵鉤", "厚砧板", "剁骨刀"];
  return [...objects, ...state.inventory.map((item) => item.replace(/^【|】$/g, ""))];
}
export function sceneAttemptObjects(state: GameState): string[] {
  return [...marketIntentObjects(state), ...(state.combat?.scenario === "market_ambush" || state.questStep === "market_collection"
    ? ["刀手短刀"] : []), ...(!state.flags.alleyEscape && !state.flags.marketAftermath
    && (state.combat?.scenario === "market_ambush" || state.questStep === "market_collection")
      ? ["半扇懸掛生豬胴體", "排污水溝爛木蓋板"] : [])];
}
export type CustomDecision =
  | { kind: "option"; option: string }
  | { kind: "creative"; plan: CreativeAction }
  | { kind: "market_intent"; plan: MarketIntent }
  | { kind: "scene_attempt"; plan: SceneAttempt }
  | { kind: "social_intent"; plan: SocialIntent }
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
  if (value.kind === "scene_attempt" && isMarketIntentScene(state)
    && SCENE_EFFECTS.some((effect) => effect === value.effect)
    && typeof value.target === "string" && marketIntentTargets(state).includes(value.target)
    && (value.object === undefined || value.object === null
      || typeof value.object === "string" && sceneAttemptObjects(state).includes(value.object))) {
    const object = typeof value.object === "string" ? value.object : undefined;
    const aliases: Record<string, string[]> = {
      "厚砧板": ["砧板", "肉案"], "懸肉鐵鉤": ["鐵鉤", "肉鉤"], "剁骨刀": ["骨刀"],
      "廢竹籮": ["竹籮"], "生石灰包": ["石灰"], "碎骨片": ["碎骨"],
      "刀手短刀": ["短刀", "刀手手上武器", "刀手手上兵器", "刀手的刀"],
    };
    if (object && ![object, ...(aliases[object] || [])].some((name) => playerText.includes(name)))
      return { kind: "reject", reason: "unclear" };
    if (/如果|假如|假設|會點|可唔可以|能否/.test(playerText)) return { kind: "reject", reason: "unclear" };
    const activeClause = playerText.split(/(?:反而|改為|改用|但係|但是|不過)/).at(-1)?.trim() || "";
    if (/^(?:我|你)?(?:唔|不|別|不要|唔好|沒有|未曾)/.test(activeClause))
      return { kind: "reject", reason: "unclear" };
    // Never let model-authored prose replace the player's actual attempt.
    const gesture = typeof value.gesture === "string" && value.gesture.length <= 32
      && activeClause.includes(value.gesture) ? value.gesture : undefined;
    if (/(?:我|你)?(?:唔|不|別|不要|唔好|沒有|未曾)/.test(playerText) && !gesture)
      return { kind: "reject", reason: "unclear" };
    return { kind: "scene_attempt", plan: { effect: value.effect as SceneEffect, target: value.target,
      ...(object ? { object } : {}), method: playerText.slice(0, 100), ...(gesture ? { gesture } : {}) } };
  }
  if (value.kind === "social_intent" && typeof value.target === "string" && socialTargets(state).includes(value.target)
    && SOCIAL_GOALS.some((goal) => goal === value.goal) && SOCIAL_TACTICS.some((tactic) => tactic === value.tactic)
    && typeof value.subject === "string" && value.subject.length > 0 && value.subject.length <= 40
    && typeof value.method === "string" && value.method.length > 0 && value.method.length <= 100) {
    const inferred = inferSocialIntent(state, playerText);
    if (!inferred || inferred.target !== value.target || inferred.goal !== value.goal) return { kind: "reject", reason: "unclear" };
    const quality = value.quality === "weak" || value.quality === "coherent" || value.quality === "grounded"
      ? value.quality : inferred.quality;
    return { kind: "social_intent", plan: { ...inferred, quality } };
  }
  if (value.kind === "market_intent" && isMarketIntentScene(state) && typeof value.approach === "string"
    && MARKET_APPROACHES.some((approach) => approach === value.approach)
    && typeof value.target === "string" && marketIntentTargets(state).includes(value.target)
    && typeof value.method === "string" && value.method.length > 0 && value.method.length <= 100
    && (value.object === undefined || value.object === null || (typeof value.object === "string" && marketIntentObjects(state).includes(value.object)))) {
    const object = typeof value.object === "string" ? value.object : undefined;
    const aliases: Record<string, string[]> = {
      "厚砧板": ["砧板", "肉案"], "懸肉鐵鉤": ["鐵鉤", "肉鉤"], "剁骨刀": ["骨刀"],
      "廢竹籮": ["竹籮"], "生石灰包": ["石灰"], "碎骨片": ["碎骨"], "爐灰包": ["爐灰"],
    };
    if (object && ![object, ...(aliases[object] || [])].some((name) => playerText.includes(name)))
      return { kind: "reject", reason: "unclear" };
    if (value.approach === "奪械" && (value.target !== "刀手" || object || !isDisarmAttemptText(playerText)))
      return { kind: "reject", reason: "unclear" };
    if (object === "剁骨刀" && !["施壓", "進擊", "借物"].includes(value.approach))
      return { kind: "reject", reason: "impossible" };
    return { kind: "market_intent", plan: { approach: value.approach as MarketApproach, target: value.target,
      object, method: value.method.slice(0, 100) } };
  }
  if (value.kind === "option" && typeof value.option === "string" && options.includes(value.option))
    return { kind: "option", option: value.option };
  if (value.kind === "creative" && state.questStep === "sandbox" && !state.combat && !state.flags.pendingIncident
    && !state.flags.alleyEscape && !state.flags.marketAftermath
    && CREATIVE_GOALS.some((goal) => goal === value.goal) && typeof value.anchor === "string"
    && sceneAnchors(state).includes(value.anchor)
    && (value.goal !== "交涉" || ["何不歸", "容晚秋", "陸千帆", "張斷骨", "祁觀衡", "衛沉岳", "霍破陣", "顧忘生", "柳照霜"].includes(value.anchor)))
    return { kind: "creative", plan: { goal: value.goal as CreativeGoal, anchor: value.anchor } };
  if (value.kind === "special" && state.questStep === "market_collection" && !negatesIrreversibleAction(playerText)
    && !/如果|假如|會點|點樣|可唔可以|是否可以/.test(playerText)
    && Array.isArray(value.specials) && value.specials.length > 0) {
    const specials = value.specials.filter((item): item is string => typeof item === "string");
    if (specials.length !== 1 || specials.length !== value.specials.length || specials.some((item) => !["betray", "embezzle", "maim"].includes(item)))
      return { kind: "reject", reason: "unclear" };
    if (specials.includes("betray") && !/(?:出賣|背叛|不救)陸千帆/.test(playerText)) return { kind: "reject", reason: "unclear" };
    if (specials.includes("embezzle") && !/私吞|昧起|袋起|自己收/.test(playerText)) return { kind: "reject", reason: "unclear" };
    if (specials.includes("maim") && !/(?:打斷|致殘|廢了)張斷骨/.test(playerText)) return { kind: "reject", reason: "unclear" };
    return { kind: "special", action: `F. [自訂手段] ${specials.map((item) =>
      item === "betray" ? "出賣陸千帆" : item === "embezzle" ? "私吞五十文規費" : "打斷張斷骨右手").join("，")}` };
  }
  return { kind: "reject", reason: value.kind === "reject" && value.reason === "impossible" ? "impossible" : "unclear" };
}

// Offline fallback for common physical actions in the Blackmud pilot. It never
// decides an outcome; the same scene validator and engine still do that work.
export function interpretMarketText(state: GameState, playerText: string): CustomDecision {
  if (!isMarketIntentScene(state)) return { kind: "reject", reason: "unavailable" };
  const text = playerText.split(/(?:反而|但係|但是|不過)/).at(-1)?.trim() || "";
  if (!text || /^(?:唔|不|別|不要|唔好)/.test(text)) return { kind: "reject", reason: "unclear" };
  const aliases: Record<string, string[]> = {
    "厚砧板": ["砧板", "肉案"], "懸肉鐵鉤": ["鐵鉤", "肉鉤"], "剁骨刀": ["骨刀"],
    "廢竹籮": ["竹籮"], "生石灰包": ["石灰"], "碎骨片": ["碎骨"], "爐灰包": ["爐灰"],
  };
  const object = marketIntentObjects(state).find((name) => [name, ...(aliases[name] || [])].some((word) => text.includes(word)));
  const approach: MarketApproach | undefined = isDisarmAttemptText(text) ? "奪械"
    : /敷|上藥|包紮|止血|救|療傷/.test(text) ? "救護"
    : /撤|逃|脫身|翻牆|離開/.test(text) ? "脫身"
      : object && /推|踢|扯|撒|擲|丟|拿|拎|奪|拾|抄|取下|取出|摘下|解下/.test(text) && !/護住陸千帆|護住千帆/.test(text) ? "借物"
      : /護|擋|守住|護住/.test(text) ? "防守"
        : /問|追問|打聽|談|勸|說服/.test(text) ? "交涉"
          : /查|看|盯|觀察|聽|探/.test(text) ? "查探"
            : /逼|威嚇|勒索/.test(text) ? "施壓"
                : /打|撞|斬|刺|攻|揍/.test(text) ? "進擊" : undefined;
  if (!approach) return { kind: "reject", reason: "unclear" };
  const targets = marketIntentTargets(state);
  const namedTarget = /陸千帆|千帆|同門/.test(text) ? "陸千帆"
    : /張斷骨|張屠戶|屠戶/.test(text) ? "張斷骨"
      : /刀手|追兵|伏兵/.test(text) ? "刀手"
        : /巷口/.test(text) ? targets.includes("巷口") ? "巷口" : "街口"
          : /街口/.test(text) ? "街口" : undefined;
  const inferred = approach === "救護" ? "陸千帆"
    : approach === "脫身" ? /帶|扶|拽/.test(text) && targets.includes("陸千帆") ? "陸千帆" : "自己"
      : approach === "交涉" || approach === "施壓" ? "張斷骨"
        : approach === "查探" ? targets.includes("巷口") ? "巷口" : "街口"
          : approach === "防守" ? targets.includes("陸千帆") ? "陸千帆" : "自己"
            : approach === "借物" && /備戰|戒備|準備迎敵/.test(text) ? targets.includes("肉檔") ? "肉檔" : "自己"
              : approach === "借物" || approach === "進擊" || approach === "奪械" ? targets.includes("刀手") ? "刀手" : "街口" : "自己";
  const target = namedTarget || inferred;
  return validateCustomDecision({ kind: "market_intent", approach, target, ...(object ? { object } : {}), method: text.slice(0, 100) },
    state, [], playerText);
}
