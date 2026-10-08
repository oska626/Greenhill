import type { GameState, Landmark } from "./game-engine.ts";
import { CUSTOM_ACTION_MAX } from "./custom-action.ts";
import { applyMissionRelationship, companionLeads } from "./companion-relations.ts";

type Route = { from: Landmark; to: Landmark; turns: number };
const ROADS: Route[] = [
  { from: "青鋒堂總壇", to: "晚秋茶寮", turns: 1 },
  { from: "青鋒堂總壇", to: "鬼骰坊", turns: 1 },
  { from: "晚秋茶寮", to: "黑泥街", turns: 1 },
  { from: "晚秋茶寮", to: "苦煙館", turns: 2 },
  { from: "鬼骰坊", to: "苦煙館", turns: 1 },
  { from: "鬼骰坊", to: "夜雨樓", turns: 2 },
  { from: "苦煙館", to: "夜雨樓", turns: 1 },
  { from: "苦煙館", to: "裂石擂", turns: 2 },
  { from: "黑泥街", to: "裂石擂", turns: 2 },
  { from: "黑泥街", to: "碼頭", turns: 1 },
];
const SHORTCUTS: (Route & { flag: string; danger: string; riskPeriod: number; riskDamage: number; riskLifeline: number })[] = [
  { from: "青鋒堂總壇", to: "黑泥街", turns: 1, flag: "熟記市集暗巷", danger: "玄武樓刀手可能埋伏", riskPeriod: 3, riskDamage: 6, riskLifeline: 0 },
  { from: "晚秋茶寮", to: "夜雨樓", turns: 1, flag: "茶寮暗道已知", danger: "容易被尾隨", riskPeriod: 4, riskDamage: 0, riskLifeline: 3 },
  { from: "鬼骰坊", to: "裂石擂", turns: 1, flag: "賭坊後巷已知", danger: "暗巷有攔路客", riskPeriod: 2, riskDamage: 8, riskLifeline: 0 },
];
export const ROAD_LINKS: readonly Route[] = ROADS;
export const SECRET_LINKS: readonly (Route & { flag: string; danger: string })[] = SHORTCUTS;

function roadDistance(from: Landmark, to: Landmark): number {
  const distances = new Map<Landmark, number>([[from, 0]]);
  const seen = new Set<Landmark>();
  while (true) {
    const next = Array.from(distances).filter(([place]) => !seen.has(place)).sort((a, b) => a[1] - b[1])[0];
    if (!next) return 9;
    const [place, distance] = next;
    if (place === to) return distance;
    seen.add(place);
    for (const road of ROADS) {
      const other = road.from === place ? road.to : road.to === place ? road.from : undefined;
      if (other && distance + road.turns < (distances.get(other) ?? Infinity)) distances.set(other, distance + road.turns);
    }
  }
}

export type TravelChoice = { destination: Landmark; kind: "road" | "shortcut"; turns: number; label: string; danger: string; riskPeriod: number; riskDamage: number; riskLifeline: number };
export function travelChoices(state: GameState, destination: Landmark): TravelChoice[] {
  if (destination === state.currentLocation) return [];
  if (state.questStep === "chapter_one") {
    if (state.flags.chapterOne?.stage !== "dock"
      || !["青鋒堂總壇", "碼頭"].includes(destination)
      || !["青鋒堂總壇", "碼頭"].includes(state.currentLocation)) return [];
  } else if (destination === "碼頭" || state.currentLocation === "碼頭") return [];
  const road = Math.min(3, roadDistance(state.currentLocation, destination));
  const roadNote = state.questStep === "chapter_one"
    ? "斷貨公款每回合最多減4文；貢款期限照走" : "人多較安全";
  const choices: TravelChoice[] = [{ destination, kind: "road", turns: road,
    label: `F. [明路前往] ${destination}（${road}回合；${roadNote}）`, danger: "", riskPeriod: 0, riskDamage: 0, riskLifeline: 0 }];
  const shortcut = SHORTCUTS.find((route) =>
    ((route.from === state.currentLocation && route.to === destination) || (route.to === state.currentLocation && route.from === destination))
    && state.worldFlags.includes(route.flag));
  if (shortcut) choices.push({ destination, kind: "shortcut", turns: shortcut.turns,
    label: `F. [暗道前往] ${destination}（${shortcut.turns}回合；${shortcut.danger}）`, danger: shortcut.danger,
    riskPeriod: shortcut.riskPeriod, riskDamage: shortcut.riskDamage, riskLifeline: shortcut.riskLifeline });
  return choices;
}

export const MISSIONS = [
  { id: "roll_call", title: "守街名冊", giver: "何不歸", origin: "青鋒堂總壇", target: "黑泥街", pay: 12,
    clue: "同門守街名冊", good: "你逐戶查實守街人手，記下誰仍願替青鋒堂守街。", bad: "你草草抄下幾個名字，名冊有了，卻未能查出誰已離心。" },
  { id: "missing_courier", title: "失蹤腳夫", giver: "容晚秋", origin: "晚秋茶寮", target: "黑泥街", pay: 15,
    clue: "刀手進城路線", good: "你循茶寮收據救出送茶腳夫，也問出刀手進城的路。", bad: "你追到腳夫留下的茶擔，先取走他藏的線索，卻讓人被刀手帶走。" },
  { id: "double_dues", title: "雙重勒索", giver: "陸千帆", origin: "黑泥街", target: "晚秋茶寮", pay: 12,
    clue: "街坊願意守街", good: "你請容晚秋作證，攤販免交第二份例錢，肯替青鋒堂報信。", bad: "你向攤販強收欠款，青鋒堂進了帳，街坊卻關門避你。" },
  { id: "forged_deed", title: "假借據", giver: "祁觀衡", origin: "鬼骰坊", target: "青鋒堂總壇", pay: 15,
    clue: "城東假契證據", good: "你在總壇舊帳裏找出印泥破綻，留下一份能駁倒奪鋪契紙的證據。", bad: "你將假借據撕掉，眼前的催債停了，背後落印的人仍未露面。" },
  { id: "arena_probe", title: "踢館試探", giver: "衛沉岳與霍破陣", origin: "裂石擂", target: "黑泥街", pay: 18,
    clue: "前線守備有序", good: "你照衛沉岳的吩咐佈好退路，將踢館者逼出街口。", bad: "你跟霍破陣追著踢館者打，贏了眼前一仗，也惹來更多刀手。" },
  { id: "tainted_medicine", title: "換封傷藥", giver: "顧忘生", origin: "苦煙館", target: "晚秋茶寮", pay: 14,
    clue: "傷藥來源已查", good: "你依顧忘生辨過的封口追問容晚秋，查出在茶寮歇腳的送藥人曾讓誰碰過藥包；傷者不再誤用毒藥。", bad: "你將送藥人遺下的可疑藥包帶回苦煙館銷毀，止住眼前禍患，仍不知誰曾經手。" },
  { id: "hidden_spy", title: "陌生恩客", giver: "柳照霜", origin: "夜雨樓", target: "鬼骰坊", pay: 16,
    clue: "城東耳目已識破", good: "你循賭坊的換錢記錄認出城東耳目，摸清對方盯著哪處據點。", bad: "你當面揭穿耳目，對方逃走，夜雨樓暫時清靜。" },
] as const satisfies readonly { id: string; title: string; giver: string; origin: Landmark; target: Landmark; pay: number; clue: string; good: string; bad: string }[];
export type MissionId = typeof MISSIONS[number]["id"];
type Mission = typeof MISSIONS[number];
const missionFlag = (mission: Mission, stage: "已領" | "完成") => `${mission.title}${stage}`;

export function missionOptions(state: GameState): string[] {
  const options: string[] = [];
  for (const mission of MISSIONS) {
    if (mission.id === "double_dues" && state.relationships["陸千帆"].estranged) continue;
    if (state.worldFlags.includes(missionFlag(mission, "完成"))) continue;
    const accepted = state.worldFlags.includes(missionFlag(mission, "已領"));
    if (!accepted && state.currentLocation === mission.origin) {
      options.push(`G. [領差] ${mission.title}：${mission.giver === "何不歸" ? "堂主" : mission.giver}託你到${mission.target}辦事；酬勞${mission.pay}文私銀。`);
    } else if (accepted && state.currentLocation === mission.target) {
      const chargeNote = state.customActionUses < CUSTOM_ACTION_MAX ? "機變回復一次" : "機變已滿，不另累積";
      options.push(`G. [辦差] ${mission.title}：查清來龍去脈；命脈升五，取得終局支援、${chargeNote}及${mission.pay}文私銀。`);
      options.push(`H. [速辦] ${mission.title}：先解眼前難題；命脈減三，${chargeNote}，取得${mission.pay}文私銀，留下後患。`);
    }
  }
  return options;
}

export function resolveMission(state: GameState, action: string): { event: string; speaker: string; line: string } | undefined {
  const allowed = missionOptions(state);
  if (!allowed.includes(action)) return undefined;
  const mission = MISSIONS.find((item) => action.includes(item.title));
  if (!mission) return undefined;
  if (action.startsWith("G. [領差]")) {
    state.worldFlags.push(missionFlag(mission, "已領"));
    return { event: `${mission.giver}把「${mission.title}」交給你，叫你到${mission.target}查辦。事成可領${mission.pay}文私銀。`,
      speaker: mission.id === "arena_probe" ? "衛沉岳" : mission.giver, line: "先查清楚，再回來說話。" };
  }
  const careful = action.startsWith("G. [辦差]");
  state.worldFlags.push(missionFlag(mission, "完成"));
  if (careful) state.worldFlags.push(mission.clue);
  state.silver += mission.pay;
  const chargeRestored = state.customActionUses < CUSTOM_ACTION_MAX;
  state.customActionUses = Math.min(CUSTOM_ACTION_MAX, state.customActionUses + 1);
  if (careful) state.sectLifeline = Math.min(100, state.sectLifeline + 5);
  else state.sectLifeline = Math.max(0, state.sectLifeline - 3);
  if (mission.id === "double_dues" && !careful) state.factionFunds += 10;
  if (mission.id === "missing_courier" && careful) state.worldFlags.push("茶寮暗道已知");
  if (mission.id === "hidden_spy" && careful) state.worldFlags.push("賭坊後巷已知");
  if (mission.id === "forged_deed" && careful) state.maxInventory = Math.min(6, state.maxInventory + 1);
  applyMissionRelationship(state.relationships, mission.id, careful);
  const contact: Partial<Record<Landmark, string>> = { "青鋒堂總壇": "何不歸", "晚秋茶寮": "容晚秋",
    "黑泥街": state.relationships["陸千帆"].estranged ? "張斷骨" : "陸千帆", "鬼骰坊": "祁觀衡" };
  return { event: `${careful ? mission.good : mission.bad}${careful ? "青鋒堂命脈升五。" : "青鋒堂命脈減三。"}${mission.giver}私下預留在接頭處的錢袋有${mission.pay}文，你照約領作私銀；${chargeRestored ? "機變次數回復一" : "機變已滿兩次，不另累積"}。${mission.id === "double_dues" && !careful ? "另有十文規費記入公帳。" : ""}`,
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
  const support = MISSIONS.filter((mission) => state.worldFlags.includes(mission.clue)).length;
  const help: Record<MissionId, string> = {
    roll_call: "守街名冊讓何不歸召齊仍肯留下的同門",
    missing_courier: "送茶腳夫指出刀手入城的窄巷",
    double_dues: "受過你照應的攤販敲鑼報信",
    forged_deed: "假契證據使城東無法借官印收鋪",
    arena_probe: "裂石擂的人照佈好的退路守住街口",
    tainted_medicine: "驗過的傷藥讓傷者不再倒在後方",
    hidden_spy: "柳照霜識破耳目，提前封住夜雨樓側門",
  };
  const aid = MISSIONS.filter((mission) => state.worldFlags.includes(mission.clue)).map((mission) => help[mission.id]).join("；");
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
  return state.flags.ending === "守住城西"
    ? `玄武樓刀手衝進城西。${battleReport}${aid}。青鋒堂與街坊終將刀手逼退。何不歸守住總壇，城西仍由自己人作主。`
    : `你召集僅餘的人守街。${battleReport}${aid ? `${aid}，仍缺了足夠接應。` : "卻缺了足夠接應。"}玄武樓逐巷插旗，總壇終於失守。何不歸帶著傷者撤走，青鋒堂的基業在這一夜散盡。`;
}
