import type { GameState, Landmark } from "./game-engine.ts";
import { CUSTOM_ACTION_MAX } from "./custom-action.ts";
import { applyMissionRelationship, companionLeads } from "./companion-relations.ts";
import { normalizeSceneState, revealEntrance } from "./scene-state.ts";
import { conciseOption } from "./option-text.ts";

type Route = { from: Landmark; to: Landmark; turns: number };
// Ordinary streets are traversed one edge at a time. Hidden passages below are separate, unlockable edges.
export const ROAD_ADJACENCY: Readonly<Record<Exclude<Landmark, "碼頭">, readonly Landmark[]>> = {
  "青鋒堂總壇": ["晚秋茶寮", "鬼骰坊"],
  "晚秋茶寮": ["青鋒堂總壇", "苦煙館", "黑泥街"],
  "鬼骰坊": ["青鋒堂總壇", "苦煙館", "夜雨樓"],
  "苦煙館": ["晚秋茶寮", "鬼骰坊", "裂石擂", "夜雨樓"],
  "黑泥街": ["晚秋茶寮", "裂石擂"],
  "裂石擂": ["黑泥街", "苦煙館"],
  "夜雨樓": ["鬼骰坊", "苦煙館"],
};
const ROADS: Route[] = [
  { from: "青鋒堂總壇", to: "晚秋茶寮", turns: 1 },
  { from: "青鋒堂總壇", to: "鬼骰坊", turns: 1 },
  { from: "晚秋茶寮", to: "黑泥街", turns: 1 },
  { from: "晚秋茶寮", to: "苦煙館", turns: 1 },
  { from: "鬼骰坊", to: "苦煙館", turns: 1 },
  { from: "鬼骰坊", to: "夜雨樓", turns: 1 },
  { from: "苦煙館", to: "夜雨樓", turns: 1 },
  { from: "苦煙館", to: "裂石擂", turns: 1 },
  { from: "黑泥街", to: "裂石擂", turns: 1 },
  { from: "黑泥街", to: "碼頭", turns: 1 },
];
const SHORTCUTS: (Route & { flag: string; danger: string; riskPeriod: number; riskDamage: number; riskLifeline: number })[] = [
  { from: "青鋒堂總壇", to: "黑泥街", turns: 1, flag: "熟記市集暗巷", danger: "玄武樓刀手可能埋伏", riskPeriod: 3, riskDamage: 6, riskLifeline: 0 },
  { from: "晚秋茶寮", to: "鬼骰坊", turns: 1, flag: "地底暗網", danger: "賬房活門可能有人守", riskPeriod: 4, riskDamage: 0, riskLifeline: 2 },
  { from: "鬼骰坊", to: "夜雨樓", turns: 1, flag: "地底暗網", danger: "酒窖可能有人巡看", riskPeriod: 4, riskDamage: 0, riskLifeline: 2 },
  { from: "晚秋茶寮", to: "夜雨樓", turns: 1, flag: "茶寮暗道已知", danger: "經賭坊樞紐，容易被尾隨", riskPeriod: 4, riskDamage: 0, riskLifeline: 3 },
  { from: "鬼骰坊", to: "裂石擂", turns: 1, flag: "賭坊後巷已知", danger: "暗巷有攔路客", riskPeriod: 2, riskDamage: 8, riskLifeline: 0 },
];
export const ROAD_LINKS: readonly Route[] = ROADS;
export const SECRET_LINKS: readonly (Route & { flag: string; danger: string })[] = SHORTCUTS;

export function shortcutKnown(state: GameState, route: Route & { flag: string }): boolean {
  if (route.flag === "地底暗網") return Boolean(state.sceneState?.openedEntrances?.includes(route.from as "晚秋茶寮" | "鬼骰坊" | "夜雨樓")
    && state.sceneState.openedEntrances?.includes(route.to as "晚秋茶寮" | "鬼骰坊" | "夜雨樓"));
  if (route.flag === "茶寮暗道已知") return state.sceneState
    ? Boolean(state.sceneState.openedEntrances?.includes("晚秋茶寮") && state.sceneState.openedEntrances?.includes("夜雨樓"))
    : state.worldFlags.includes(route.flag);
  return state.worldFlags.includes(route.flag);
}

export type TravelChoice = { destination: Landmark; kind: "road" | "shortcut"; turns: number; label: string; danger: string; riskPeriod: number; riskDamage: number; riskLifeline: number };
export function travelChoices(state: GameState, destination: Landmark): TravelChoice[] {
  if (destination === state.currentLocation) return [];
  if (state.questStep === "chapter_one") {
    if (state.flags.chapterOne?.stage === "shortage") {
      if (destination === "碼頭" || state.currentLocation === "碼頭"
        || !ROAD_ADJACENCY[state.currentLocation as Exclude<Landmark, "碼頭">]?.includes(destination)) return [];
      return [{ destination, kind: "road", turns: 1,
        label: `F. [明路前往] 前往${destination}`, danger: "", riskPeriod: 0, riskDamage: 0, riskLifeline: 0 }];
    }
    if (state.flags.chapterOne?.stage !== "dock"
      || !["青鋒堂總壇", "碼頭"].includes(destination)
      || !["青鋒堂總壇", "碼頭"].includes(state.currentLocation)) return [];
    // The chapter's escorted supply expedition follows headquarters → tea stall → Blackmud → dock.
    return [{ destination, kind: "road", turns: 3,
      label: `F. [明路前往] 前往${destination}`, danger: "", riskPeriod: 0, riskDamage: 0, riskLifeline: 0 }];
  }
  if (destination === "碼頭" || state.currentLocation === "碼頭") return [];
  const roadConnected = ROAD_ADJACENCY[state.currentLocation as Exclude<Landmark, "碼頭">]?.includes(destination) || false;
  const choices: TravelChoice[] = roadConnected ? [{ destination, kind: "road", turns: 1,
    label: `F. [明路前往] 前往${destination}`, danger: "", riskPeriod: 0, riskDamage: 0, riskLifeline: 0 }] : [];
  const shortcut = SHORTCUTS.find((route) =>
    ((route.from === state.currentLocation && route.to === destination) || (route.to === state.currentLocation && route.from === destination))
    && shortcutKnown(state, route));
  if (shortcut) choices.push({ destination, kind: "shortcut", turns: shortcut.turns,
    label: `F. [暗道前往] 潛往${destination}`, danger: shortcut.danger,
    riskPeriod: shortcut.riskPeriod, riskDamage: shortcut.riskDamage, riskLifeline: shortcut.riskLifeline });
  return choices;
}

export const MISSIONS = [
  { id: "roll_call", title: "守街名冊", giver: "何不歸", origin: "青鋒堂總壇", target: "黑泥街", pay: 12,
    clue: "同門守街名冊", good: "你逐戶查實守街人手，記下誰仍願替青鋒堂守街。", bad: "你草草抄下幾個名字，名冊有了，卻未能查出誰已離心。" },
  { id: "missing_courier", title: "失蹤腳夫", giver: "容晚秋", origin: "晚秋茶寮", target: "夜雨樓", pay: 15,
    clue: "刀手進城路線", good: "你在夜雨樓酒窖找到失蹤腳夫，撬開他攥著的送貨單，查出刀手入城的路。", bad: "你在夜雨樓取走腳夫藏的送貨單，卻讓他落在刀手手裡。" },
  { id: "double_dues", title: "雙重勒索", giver: "陸千帆", origin: "黑泥街", target: "晚秋茶寮", pay: 12,
    clue: "街坊願意守街", good: "你請容晚秋作證，攤販免交第二份例錢，肯替青鋒堂報信。", bad: "你向攤販強收欠款，青鋒堂進了帳，街坊卻關門避你。" },
  { id: "forged_deed", title: "查扣假帳", giver: "祁觀衡", origin: "鬼骰坊", target: "苦煙館", pay: 15,
    clue: "假借據完成", good: "你在苦煙館核對藥材入帳，從假簽押裡拆出偽造的借據。", bad: "你扣下假帳，卻沒查清誰替城東落了押。" },
  { id: "tainted_medicine", title: "送猛藥", giver: "顧忘生", origin: "苦煙館", target: "裂石擂", pay: 14,
    clue: "拳手暗傷底細", good: "你把猛藥送到裂石擂，按住拳手舊傷驗藥，問出他替誰帶傷上場。", bad: "你把猛藥交到裂石擂，拳手服下便上場，暗傷來歷仍沒查清。" },
  { id: "arena_probe", title: "買定離手", giver: "衛沉岳", origin: "裂石擂", target: "鬼骰坊", pay: 18,
    clue: "擂台賭盤走勢", good: "你在鬼骰坊查出壓注暗帳，摸清誰在操弄裂石擂的勝負。", bad: "你拿到鬼骰坊賭盤，卻沒查出莊家背後的人。" },
  { id: "hidden_spy", title: "城主府密報", giver: "柳照霜", origin: "夜雨樓", target: "青鋒堂總壇", pay: 16,
    clue: "城東記恨暗殺", good: "你把城主府密報送到總壇，何不歸看出城東刺客盯上的名字。", bad: "你把密報丟上總壇桌案，刺客名單少了關鍵一頁。" },
] as const satisfies readonly { id: string; title: string; giver: string; origin: Landmark; target: Landmark; pay: number; clue: string; good: string; bad: string }[];
export type MissionId = typeof MISSIONS[number]["id"];
type Mission = typeof MISSIONS[number];
const missionFlag = (mission: Mission, stage: "已領" | "完成") => `${mission.title}${stage}`;
const legacyTitles: Partial<Record<MissionId, string>> = {
  forged_deed: "假借據", arena_probe: "踢館試探", tainted_medicine: "換封傷藥", hidden_spy: "陌生恩客",
};
export function missionCompleted(state: GameState, mission: Mission): boolean {
  return missionDone(state.worldFlags, mission);
}

export function missionDone(worldFlags: readonly string[], mission: Mission): boolean {
  return worldFlags.includes(mission.clue) || worldFlags.includes(missionFlag(mission, "完成"))
    || Boolean(legacyTitles[mission.id] && worldFlags.includes(`${legacyTitles[mission.id]}完成`));
}

export function acceptedMissionIds(worldFlags: readonly string[]): MissionId[] {
  return MISSIONS.filter((mission) => !missionDone(worldFlags, mission)
    && (worldFlags.includes(missionFlag(mission, "已領"))
      || Boolean(legacyTitles[mission.id] && worldFlags.includes(`${legacyTitles[mission.id]}已領`))))
    .map((mission) => mission.id);
}

export function missionOptions(state: GameState): string[] {
  const options: string[] = [];
  for (const mission of MISSIONS) {
    if (mission.id === "double_dues" && state.relationships["陸千帆"].estranged) continue;
    if (missionCompleted(state, mission)) continue;
    const accepted = state.activeMissions?.includes(mission.id) || acceptedMissionIds(state.worldFlags).includes(mission.id);
    if (!accepted && state.currentLocation === mission.origin) {
      options.push(`G. [領差] ${mission.title}`);
    } else if (accepted && state.currentLocation === mission.target) {
      options.push(`G. [辦差] ${mission.title}`);
      options.push(`H. [速辦] ${mission.title}`);
    }
  }
  return options;
}

export function resolveMission(state: GameState, action: string): { event: string; speaker: string; line: string } | undefined {
  const allowed = missionOptions(state);
  action = allowed.find((option) => option === action || conciseOption(option) === action) || "";
  if (!action) return undefined;
  const mission = MISSIONS.find((item) => action.includes(item.title));
  if (!mission) return undefined;
  if (action.startsWith("G. [領差]")) {
    state.activeMissions.push(mission.id);
    state.worldFlags.push(missionFlag(mission, "已領"));
    return { event: `${mission.giver}把「${mission.title}」拍到你手上，要你親自走到${mission.target}辦妥；賞錢${mission.pay}文。`,
      speaker: mission.giver, line: "親自走一趟。辦妥再領錢。" };
  }
  const careful = action.startsWith("G. [辦差]");
  state.activeMissions = state.activeMissions.filter((id) => id !== mission.id);
  state.worldFlags.push(missionFlag(mission, "完成"));
  if (careful) state.worldFlags.push(mission.clue);
  state.silver += mission.pay;
  state.customActionUses = Math.min(CUSTOM_ACTION_MAX, state.customActionUses + 1);
  if (careful) state.sectLifeline = Math.min(100, state.sectLifeline + 5);
  else state.sectLifeline = Math.max(0, state.sectLifeline - 3);
  if (mission.id === "double_dues" && !careful) state.factionFunds += 10;
  if (mission.id === "missing_courier" && careful) {
    state.worldFlags.push("茶寮暗道已知");
    state.sceneState = normalizeSceneState(state.sceneState, state.worldFlags);
    revealEntrance(state.sceneState, "晚秋茶寮");
    revealEntrance(state.sceneState, "夜雨樓");
  }
  if (mission.id === "hidden_spy" && careful) state.worldFlags.push("賭坊後巷已知");
  applyMissionRelationship(state.relationships, mission.id, careful);
  const contact: Partial<Record<Landmark, string>> = { "青鋒堂總壇": "何不歸", "晚秋茶寮": "容晚秋",
    "黑泥街": state.relationships["陸千帆"].estranged ? "張斷骨" : "陸千帆", "鬼骰坊": "祁觀衡",
    "苦煙館": "顧忘生", "裂石擂": "衛沉岳", "夜雨樓": "柳照霜" };
  return { event: `${careful ? mission.good : mission.bad}你在${mission.target}收妥賞錢。${mission.id === "double_dues" && !careful ? "另有規費記入公帳。" : ""}`,
    speaker: contact[mission.target] || mission.giver, line: careful ? "這事辦得實在。日後用得上。" : "眼前過得去，後頭的帳還得算。" };
}

export const ENDING_OPTIONS = [
  "A. [固守城西] 召集同門與街坊守住七處據點；至少要有三項終局支援，命脈六十起每十點多一層守備。",
  "B. [割地求存] 向玄武樓交出城西產業，保住殘存同門。",
  "C. [獨自撤走] 放下青鋒堂，自城西暗巷逃生。",
];

export function guardLayersForLifeline(lifeline: number): number {
  return Math.max(0, Math.min(5, Math.floor((lifeline - 50) / 10)));
}

export function resolveEnding(state: GameState, action: string): string {
  const secured = MISSIONS.filter((mission) => state.worldFlags.includes(mission.clue));
  const support = secured.length;
  if (action.startsWith("B.")) {
    state.flags.ending = "割地求存";
    state.flags.prologueCompanionLeads = companionLeads(state.relationships, state.flags.ending);
    return "你與何不歸交出地契，換得同門一條生路。玄武樓的旗插遍城西，青鋒堂從此受人節制。";
  }
  if (action.startsWith("C.")) {
    state.flags.ending = "獨自撤走";
    state.flags.prologueCompanionLeads = companionLeads(state.relationships, state.flags.ending);
    return "你從暗巷逃離，身後的青鋒堂招牌在火裏倒下。你活了下來，城西卻失去最後一道守護。";
  }
  const guardLayers = guardLayersForLifeline(state.sectLifeline);
  const damageBlocked = guardLayers * 5;
  const assaultDamage = 25 - damageBlocked;
  state.sectLifeline = Math.max(0, state.sectLifeline - assaultDamage);
  state.flags.finalGuardLayers = guardLayers;
  state.flags.finalSupport = support;
  const battleReport = `玄武樓攻勢原可削去二十五點命脈；守備${guardLayers}層抵銷${damageBlocked}點，戰後命脈餘${state.sectLifeline}點。`;
  state.flags.ending = support >= 3 && state.sectLifeline + support * 10 >= 65 ? "守住城西" : "城西陷落";
  state.flags.prologueCompanionLeads = companionLeads(state.relationships, state.flags.ending);
  const supportReports: Record<MissionId, string> = {
    roll_call: "你據名冊封死黑泥街暗巷，令偷襲部隊撲空。",
    missing_courier: "腳夫指出刀手入城的窄巷，同門趕在敵人前頭設伏。",
    double_dues: "受過你照應的攤販敲鑼報信，守街同門及時趕到。",
    forged_deed: "你揚出假帳，玄武樓外圍刀手畏懼清算，臨陣退縮。",
    arena_probe: "鬼骰坊賭盤暗帳揭出裂石擂的假賽，敵人安插的拳手被認了出來。",
    tainted_medicine: "提前查清的猛藥來源，讓堂口兄弟避開了毒害。",
    hidden_spy: "城主府密報指出刺客盯上的人，何不歸提前封住總壇側門。",
  };
  const missingReports: Record<MissionId, string> = {
    roll_call: "由於未能掌握街區暗巷，玄武樓刀手輕易從後方撕破防線。",
    missing_courier: "送茶腳夫未能指出刀手進城的路，守街同門趕不及堵住窄巷。",
    double_dues: "攤販沒有答應報信，街口告急時無人及時敲鑼。",
    forged_deed: "假帳未查清，玄武樓外圍刀手沒有顧忌，繼續壓向總壇。",
    arena_probe: "賭盤暗帳未能揭出假賽，敵人安插的拳手混進了守街人群。",
    tainted_medicine: "猛藥來源未查明，堂口兄弟用上被換過封口的傷藥，守勢漸亂。",
    hidden_spy: "城主府密報未能送到，刺客從總壇側門闖入。",
  };
  const aid = secured.map((mission) => supportReports[mission.id]).join("");
  return state.flags.ending === "守住城西"
    ? `玄武樓刀手衝進城西。${aid}${battleReport}你滿身血污立於街頭，玄武樓的刀手如退潮般散去。城西暫時守住了，但裴無鋒並未現身。何不歸帶同門回總壇休整，街口短暫安靜下來。`
    : `你召集僅餘的人守街。${aid}${MISSIONS.filter((mission) => !state.worldFlags.includes(mission.clue)).map((mission) => missingReports[mission.id]).join("")}${battleReport}玄武樓逐巷插旗，城西陷落。何不歸帶著傷者撤走，青鋒堂的基業在這一夜散盡。`;
}
