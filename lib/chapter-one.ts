import { CUSTOM_ACTION_MAX } from "./custom-action.ts";
import { COMPANION_IDS, type CompanionId } from "./companion-relations.ts";
import { PACKED_MEDICINE, USE_PACKED_MEDICINE, canUsePackedMedicine, consumePackedMedicine, restoreVitals } from "./recovery.ts";
import { actionEnergyCost, availableWithEnergy, canAffordEnergy, spendEnergy } from "./energy.ts";
import { travelChoices } from "./city-progression.ts";
import type { GameState, Landmark, TurnResult } from "./game-engine.ts";

export type ChapterOneStage = "rest" | "shortage" | "dock" | "complete" | "failed";
export const RAID_UNREST_THRESHOLD = 20;
export const MAX_LOST_LANDMARKS = 3;
export type Business = "黑泥街" | "鬼骰坊" | "苦煙館" | "夜雨樓";
export interface ChapterOneState {
  stage: ChapterOneStage;
  turns: number;
  evidence: number;
  allies: number;
  selectedCompanion?: CompanionId;
  affectedBusiness: Business;
  deficitStreak: number;
  foodShortageDays: number;
  unrest: number;
  lostLandmarks: Landmark[];
  tribute: "pending" | "paid" | "missed";
  manifestFound?: boolean;
  crewHired?: boolean;
  dockRouteKnown?: boolean;
  petitionHeard?: boolean;
  result?: string;
}

export const CHAPTER_START = "A. [踏入第一章] 回到青鋒堂總壇，與同伴休整並盤點城西生意。";
export const CHAPTER_OPENING = `黑泥街的攤販已重新架設，茶寮亦添了熱茶。昨夜激戰留下的血跡刀痕隨處可見，市販捧著銅錢進入青鋒堂總壇。感念青鋒堂守住家業，眾人自願加繳半個月規費；何不歸當面致謝，逐筆列入公帳。

你看見傷者換藥、腳夫重新推車，城西暫獲喘息。公匣較昨日沉重，城西居民對青鋒堂的信心暫時安定。然而玄武樓的旗幟仍遙遙可見，碼頭貨物終須經此路運送。青鋒堂既能守住此役，是否能應對下一次挑戰？`;
export const GRATITUDE_DUES = 45;
const BUSINESSES: Business[] = ["黑泥街", "鬼骰坊", "苦煙館", "夜雨樓"];
export const RAID_TARGETS = ["黑泥街", "鬼骰坊", "苦煙館", "夜雨樓", "晚秋茶寮", "裂石擂"] as const satisfies readonly Landmark[];
const RAID_SCENES: Record<(typeof RAID_TARGETS)[number], string> = {
  黑泥街: "米攤被飢餓的人群推翻，守街同門擋不住搶糧的街坊。",
  鬼骰坊: "欠糧的賭客砸開後門，搬走帳房僅餘的米袋。",
  苦煙館: "等藥的傷者家眷衝入藥房，顧忘生只來得及護住病人。",
  夜雨樓: "樓外的食客與腳夫堵住大門，逼掌櫃交出囤下的糧。",
  晚秋茶寮: "茶寮成了求糧的人潮聚點，桌椅被推倒，消息線也斷了。",
  裂石擂: "飢餓的打手帶人闖擂，衛沉岳守住傷者，卻守不住整座場子。",
};
const BUSINESS_HINTS: Record<Business, string> = {
  黑泥街: "市集糧袋遲遲未到，肉檔旁的米價先漲了。",
  鬼骰坊: "賭坊的運費帳多了一筆空車錢，客人卻少了。",
  苦煙館: "藥館封口空袋堆在門後，傷藥價一天比一天高。",
  夜雨樓: "樓裏的酒車沒來，夜裏的燈也早早熄了。",
};
const COMPANION_TRADEOFFS: Record<CompanionId, string> = {
  陸千帆: "熟悉退路，可帶你避開碼頭正面守衛；不擅強攻。",
  容晚秋: "熟悉暗道，可帶你摸到碼頭側路；須付十文私銀，不會替你強攻。",
  祁觀衡: "善查貨帳，可多找一點證據；嘴刻薄，不宜由他向城主交涉。",
  衛沉岳: "守陣穩當，可接應正面奪港；不擅追查帳目。",
  霍破陣: "衝鋒得力，兩點證據即可強攻；莽撞會損壞貨物，減少復航收入。",
  顧忘生: "懂藥與傷勢，可減輕夜探受傷；不擅帶路或強攻。",
  柳照霜: "善於交涉，可憑較少證據說動城主書吏；不擅正面奪港。",
};
const companionChoices = (state: GameState): string[] => {
  if (state.flags.chapterOne?.selectedCompanion) return [];
  const leads = state.flags.prologueCompanionLeads || [];
  return COMPANION_IDS.filter((name) => leads.includes(name) && (name !== "容晚秋" || state.silver >= 10))
    .map((name) => `B. [選同伴：${name}] ${COMPANION_TRADEOFFS[name]}`);
};
export function chapterPressureForecast(state: GameState): { loss: number; tributeIn: number | null; tributeCost: number; unrestGain: number } | null {
  const chapter = state.flags.chapterOne;
  if (state.questStep !== "chapter_one" || !chapter || chapter.stage === "complete" || chapter.stage === "failed") return null;
  const loss = chapter.stage === "rest" ? chapter.turns === 2 ? 6 : 0 : chapter.stage === "shortage" ? 6 : 4;
  return { loss,
    tributeIn: chapter.tribute === "pending" ? Math.max(1, 7 - chapter.turns) : null,
    tributeCost: 20, unrestGain: chapter.stage === "rest" && chapter.turns < 2 ? 0
      : 1 + Math.floor(chapter.foodShortageDays / 4) + (state.factionFunds <= loss ? 1 : 0) };
}
const REST_OPTIONS = [
  "A. [療傷調息] 在總壇休整一回合，氣血與精力各回復上限的20%。",
  "C. [核對貨帳] 先看城西貨運帳，記下糧藥應到的日期。",
  "D. [照料街坊] 請堂主從公款撥五文助傷者，鞏固街坊信任。",
  "E. [巡視街口] 看城東來的車有否照常通過，記下異動。",
];
const SHORTAGE_OPTIONS = [
  "A. [查黑泥街] 到市集查受斷貨影響的攤檔。",
  "B. [查鬼骰坊] 到賭坊核對運費與客流。",
  "C. [查苦煙館] 到藥館核對傷藥供應。",
  "D. [查夜雨樓] 到樓內查酒水與來客。",
  "E. [問接應] 請仍願幫忙的同伴指出最可疑的帳目。",
];
const RECOVER_OPTION = "R. [總壇休養] 返回總壇休養一回合，氣血與精力各回復上限的20%；斷貨壓力照常增加。";
const DEFEND_OPTION = "G. [派人守街] 請堂主支八文公款增派守街人手，民怨減八；耗一回合，斷貨壓力照常增加。";

const remember = (state: GameState, flag: string) => {
  if (!state.worldFlags.includes(flag)) state.worldFlags.push(flag);
};
const addFunds = (state: GameState, delta: number, reason: string) => {
  const before = state.factionFunds;
  state.factionFunds = Math.max(0, state.factionFunds + delta);
  const previous = state.flags.treasuryChange?.turn === state.turn ? state.flags.treasuryChange : undefined;
  state.flags.treasuryChange = { delta: (previous?.delta || 0) + state.factionFunds - before,
    reason: previous ? `${previous.reason}；${reason}` : reason, turn: state.turn };
};
const drawBusiness = (): Business => BUSINESSES[Math.floor(Math.random() * BUSINESSES.length)];
const finishTurn = (state: GameState, event: string): TurnResult => {
  const chapter = state.flags.chapterOne;
  if (state.questStep === "chapter_one" && chapter && chapter.stage !== "complete" && chapter.stage !== "failed"
    && (chapter.lostLandmarks.length >= MAX_LOST_LANDMARKS || state.sectLifeline === 0)) {
    chapter.stage = "failed";
    chapter.result = "城西地標陷落";
    if (!state.worldFlags.includes("第一章城西地標陷落")) state.worldFlags.push("第一章城西地標陷落");
    event += "\n\n斷糧引發的衝突已蔓延至多處據點。青鋒堂再無力維持城西貨路與街面秩序。第一章結局：城西地標陷落。";
  }
  return { state, event, options: chapterOneOptions(state), moneyNote: "" };
};

export function chapterOneOptions(state: GameState): string[] {
  if (state.questStep !== "chapter_one") return state.flags.ending === "守住城西" ? [CHAPTER_START] : [];
  const chapter = state.flags.chapterOne;
  if (!chapter || chapter.stage === "complete" || chapter.stage === "failed") return [];
  if (chapter.stage === "rest") return availableWithEnergy(state, [REST_OPTIONS[0], ...companionChoices(state), ...REST_OPTIONS.slice(1),
    ...(canUsePackedMedicine(state) ? [USE_PACKED_MEDICINE] : [])]);
  if (chapter.stage === "shortage") return availableWithEnergy(state, [...SHORTAGE_OPTIONS,
    ...(state.factionFunds >= 8 ? [DEFEND_OPTION] : []), RECOVER_OPTION,
    ...(canUsePackedMedicine(state) ? [USE_PACKED_MEDICINE] : [])]);
  const directAssault = chapter.selectedCompanion === "衛沉岳" || chapter.selectedCompanion === "霍破陣";
  const evidenceNeeded = chapter.selectedCompanion === "霍破陣" ? 2 : 3;
  const readyToRetake = chapter.evidence >= evidenceNeeded && (directAssault || chapter.dockRouteKnown);
  const destination: Landmark = state.currentLocation === "碼頭" ? "青鋒堂總壇" : "碼頭";
  const travel = travelChoices(state, destination).map((route) => route.label);
  if (state.currentLocation !== "碼頭") return availableWithEnergy(state, [
    ...companionChoices(state),
    "C. [僱船工] 請堂主從公款支十五文僱船工，摸清可通碼頭的水路。",
    ...(state.factionFunds >= 8 ? [DEFEND_OPTION] : []),
    RECOVER_OPTION,
    ...travel,
    ...(canUsePackedMedicine(state) ? [USE_PACKED_MEDICINE] : []),
  ]);
  return availableWithEnergy(state, [
    `A. [查碼頭貨單] 核對被扣糧藥車數；目前證據${chapter.evidence}點，首次查可多得一點。`,
    "D. [夜探碼頭] 耗兩點精力，探明進港路線；可能受傷，顧忘生同行可減傷。",
    `E. [硬奪碼頭] 耗兩點精力，勝後受傷並回收八文公款；須有${chapter.selectedCompanion === "霍破陣" ? "兩" : "三"}點證據及接應或路線。目前證據${chapter.evidence}點、同伴${chapter.selectedCompanion || "未選"}。`,
    ...(readyToRetake && state.playerMp >= 6
      ? ["G. [運勁奪港] 耗六點精力穩住陣腳與貨箱；勝後不受傷，回收十二文公款。"] : []),
    ...(!chapter.dockRouteKnown && state.playerMp >= 4
      ? ["I. [運步夜探] 耗四點精力避開刀鋒，探明進港路線並減少受傷。"] : []),
    ...(canUsePackedMedicine(state) ? [USE_PACKED_MEDICINE] : []), ...travel,
  ]);
}

function collectPressure(state: GameState, chapter: ChapterOneState, amount: number): string {
  const oldFunds = state.factionFunds;
  addFunds(state, -amount, "碼頭斷貨，地標生意入帳不足");
  chapter.deficitStreak += 1;
  let report = oldFunds === 0 ? `碼頭斷貨令各地標生意欠收${amount}文，公款已見底。`
    : `碼頭斷貨令各地標生意入帳不足，公款減少${oldFunds - state.factionFunds}文。`;
  if (chapter.deficitStreak >= 3 && chapter.deficitStreak % 3 === 0) {
    const before = state.sectLifeline;
    state.sectLifeline = Math.max(0, before - 3);
    report += `連續${chapter.deficitStreak}回合入不敷支，青鋒堂命脈減少${before - state.sectLifeline}點。`;
  } else if (chapter.deficitStreak === 2) report += "若再拖一回合，欠收便會動搖青鋒堂命脈。";
  chapter.foodShortageDays += 1;
  chapter.unrest += 1 + Math.floor((chapter.foodShortageDays - 1) / 4) + (state.factionFunds === 0 ? 1 : 0);
  while (chapter.unrest >= RAID_UNREST_THRESHOLD && chapter.lostLandmarks.length < MAX_LOST_LANDMARKS) {
    chapter.unrest -= RAID_UNREST_THRESHOLD;
    const target = [chapter.affectedBusiness, ...RAID_TARGETS.filter((place) => place !== chapter.affectedBusiness)]
      .find((place) => !chapter.lostLandmarks.includes(place));
    if (!target) break;
    chapter.lostLandmarks.push(target);
    const before = state.sectLifeline;
    state.sectLifeline = Math.max(0, before - 8);
    report += `街坊等糧等不到，開始怪青鋒堂護不住貨路。${RAID_SCENES[target]}${target}失守，命脈減${before - state.sectLifeline}點。`;
  }
  return report;
}

function settleTribute(state: GameState, chapter: ChapterOneState): string {
  if (chapter.tribute !== "pending" || chapter.turns < 7) return "";
  if (state.factionFunds >= 20) {
    addFunds(state, -20, "向城主繳納本期貢款");
    chapter.tribute = "paid";
    remember(state, "第一章貢款已繳");
    return "堂主從公款繳出二十文貢款，城主收帳，卻尚未答應調停碼頭之爭。";
  }
  chapter.tribute = "missed";
  remember(state, "第一章貢款逾期");
  return "公款不足二十文，青鋒堂未能如期繳納貢款；城主以此為由，拒絕調停碼頭之爭。";
}

function finishRestTurn(state: GameState, chapter: ChapterOneState, event: string): string {
  if (chapter.turns >= 3) {
    chapter.stage = "shortage";
    return `${event}玄武樓趁城西休整，奪下青山城碼頭並扣住送往城西的糧藥。${BUSINESS_HINTS[chapter.affectedBusiness]}`
      + (chapter.selectedCompanion === "容晚秋" ? `容晚秋說${chapter.affectedBusiness}的貨路先斷，叫你從那裏查起。` : "")
      + collectPressure(state, chapter, 6)
      + "\n\n市販見貨車不來，開始問青鋒堂能否再護住生意。你須查出哪處地標先受衝擊，才能追到截貨的路。";
  }
  return `${event}\n\n城西今日尚能開市，苦煙館仍替傷者備藥。你趁這幾日喘息，仍可再作準備。`;
}

function selectCompanion(state: GameState, chapter: ChapterOneState, action: string): string {
  const name = COMPANION_IDS.find((id) => action.startsWith(`B. [選同伴：${id}]`));
  if (!name || chapter.selectedCompanion || !state.flags.prologueCompanionLeads?.includes(name))
    return "這位同伴眼下不能與你同行。";
  if (name === "容晚秋") {
    if (state.silver < 10) return "容晚秋要十文私銀才肯帶路，你眼下付不起。";
    state.silver -= 10;
  }
  chapter.selectedCompanion = name;
  chapter.allies = 1;
  if (name === "陸千帆" || name === "容晚秋") chapter.dockRouteKnown = true;
  return `你決定只帶${name}同行。${name === "容晚秋" ? "你付十文私銀買她的帶路安排。" : ""}${COMPANION_TRADEOFFS[name]}`;
}

export function resolveChapterOne(state: GameState, action: string, spendCustomUse = false): TurnResult {
  const options = chapterOneOptions(state);
  if (!options.includes(action)) return finishTurn(state, "眼前只能從列出的做法中擇一。");
  if (spendCustomUse && state.customActionUses === 0) return finishTurn(state, "機變次數已用盡，先處理眼前的線索。");
  if (spendCustomUse) state.customActionUses -= 1;
  if (state.questStep !== "chapter_one") {
    state.questStep = "chapter_one";
    state.currentLocation = "青鋒堂總壇";
    state.turn += 1;
    state.flags.chapterOne = { stage: "rest", turns: 0, evidence: 0, allies: 0,
      affectedBusiness: drawBusiness(), deficitStreak: 0, foodShortageDays: 0, unrest: 0,
      lostLandmarks: [], tribute: "pending" };
    state.customActionUses = CUSTOM_ACTION_MAX;
    state.sectLifeline = Math.min(100, Math.max(10, state.sectLifeline + 8));
    addFunds(state, GRATITUDE_DUES, "市販自願加繳半個月規費");
    remember(state, "第一章市販加繳規費");
    return finishTurn(state, CHAPTER_OPENING);
  }
  const chapter = state.flags.chapterOne;
  if (!chapter) return finishTurn(state, "第一章狀態無效，請載入較早的存檔。");
  const route = chapter.stage === "dock" ? (["青鋒堂總壇", "碼頭"] as const)
    .flatMap((destination) => travelChoices(state, destination)).find((candidate) => candidate.label === action) : undefined;
  if (route) {
    let travelledTurns = 0;
    let event = `你沿${route.kind === "shortcut" ? "暗道" : "明路"}往${route.destination}走。`;
    for (let turn = 0; turn < route.turns; turn++) {
      state.turn += 1;
      chapter.turns += 1;
      event += collectPressure(state, chapter, 4) + settleTribute(state, chapter);
      travelledTurns += 1;
      if (chapter.lostLandmarks.length >= MAX_LOST_LANDMARKS || state.sectLifeline === 0) break;
    }
    if (travelledTurns === route.turns) state.currentLocation = route.destination;
    event += spendEnergy(state, travelledTurns, 0, true);
    if (travelledTurns < route.turns) return finishTurn(state, `${event}前路未到，街面已經失守。`);
    return finishTurn(state, `${event}\n\n${route.destination === "碼頭"
      ? "被扣的糧藥仍堆在岸邊。你可以核對貨單、摸清守衛換班，再決定如何復航。"
      : "你回到總壇，可以找同伴、請堂主僱船工或休養，碼頭的欠收仍在繼續。"}`);
  }
  const startingEnergy = state.playerMp;
  const energyCost = actionEnergyCost(state, action);
  if (!canAffordEnergy(state, energyCost)) return finishTurn(state, `精力不足，這項行動須${energyCost}點精力。`);
  const choice = action.charCodeAt(0) - 65;
  state.turn += 1;
  chapter.turns += 1;
  let event = "";
  if (action === RECOVER_OPTION) {
    state.currentLocation = "青鋒堂總壇";
    const { hp, mp } = restoreVitals(state, 0.2);
    event = `你返回總壇休養，氣血回復${hp}，精力回復${mp}。`
      + collectPressure(state, chapter, chapter.stage === "shortage" ? 6 : 4)
      + settleTribute(state, chapter);
    return finishTurn(state, event);
  }
  if (action === DEFEND_OPTION) {
    addFunds(state, -8, "增派守街人手安撫飢民");
    chapter.unrest = Math.max(0, chapter.unrest - 8);
    event = "堂主撥出八文公款，讓同門護住米攤與藥車，暫時壓住街口衝突。"
      + collectPressure(state, chapter, chapter.stage === "shortage" ? 6 : 4)
      + settleTribute(state, chapter);
    return finishTurn(state, event + spendEnergy(state, energyCost));
  }
  if (action === USE_PACKED_MEDICINE) {
    const restored = consumePackedMedicine(state);
    if (!restored) return finishTurn(state, "療傷藥已用完，或氣血與精力都已充足。");
    event = `你拆開行囊裏一包${PACKED_MEDICINE}，氣血回復${restored.hp}，精力回復${restored.mp}。`;
    if (chapter.stage === "rest") event = finishRestTurn(state, chapter, event);
    else event += collectPressure(state, chapter, chapter.stage === "shortage" ? 6 : 4)
      + settleTribute(state, chapter);
    return finishTurn(state, event);
  }
  if (chapter.stage === "rest") {
    if (choice === 0) {
      const { hp: hpRestored, mp: mpRestored } = restoreVitals(state, 0.2);
      event = `你在總壇休養調息，氣血回復${hpRestored}，精力回復${mpRestored}。`;
    }
    if (choice === 1) event = selectCompanion(state, chapter, action);
    if (choice === 2) { chapter.evidence += 1; event = "你對照城西貨帳，記下糧米與傷藥應到的日期。"; }
    if (choice === 3) { if (state.factionFunds >= 5) { addFunds(state, -5, "堂主撥公款照料傷者"); state.sectLifeline = Math.min(100, state.sectLifeline + 2); event = "何不歸從公款撥出五文照料傷者，街坊見青鋒堂仍肯護人，命脈升二。"; } else event = "堂口一時拿不出五文，何不歸只得先把現有傷藥分給街坊。"; }
    if (choice === 4) { chapter.evidence += 1; event = "你巡過城西街口，記下兩輛本該入城的糧車尚未出現。"; }
    event = finishRestTurn(state, chapter, event);
  } else if (chapter.stage === "shortage") {
    const chosen = choice < 4 ? BUSINESSES[choice] : undefined;
    const pressure = collectPressure(state, chapter, 6);
    const tribute = settleTribute(state, chapter);
    if (chosen === chapter.affectedBusiness) {
      state.currentLocation = chosen as Landmark;
      chapter.evidence += 2;
      if (chapter.selectedCompanion === "祁觀衡" || (chapter.selectedCompanion === "顧忘生" && chosen === "苦煙館")) {
        chapter.evidence += 1;
        event += chapter.selectedCompanion === "祁觀衡"
          ? "祁觀衡對出多一筆偽造運費，證據再加一點。"
          : "顧忘生認出封口與藥材數目不符，證據再加一點。";
      }
      chapter.stage = "dock";
      state.currentLocation = "青鋒堂總壇";
      remember(state, `第一章${chosen}斷貨已查`);
      event = `你在${chosen}查出帳目異常，貨不是走丟，而是被玄武樓從碼頭扣下。${BUSINESS_HINTS[chosen]}${event}${pressure}${tribute}`;
      event += "\n\n你帶著貨帳返回堂口，腳夫願說出碼頭的守衛換班。若要讓城西重新有貨，須準備接應並奪回貨路。";
    } else if (chosen) {
      state.currentLocation = chosen as Landmark;
      event = `你在${chosen}核對帳目，這裏的虧空尚不足以解釋整筆斷貨。${pressure}${tribute}\n\n線索仍指向另一處地標，碼頭的貨卻還在玄武樓手上。`;
    } else {
      event = `${chapter.selectedCompanion ? `${chapter.selectedCompanion}指出${chapter.affectedBusiness}的入帳最不對勁。` : "你尚未選定同行同伴，只能再核對各地標的貨運記錄。"}${pressure}${tribute}\n\n城西的糧藥仍未到，你須親自去查出缺口。`;
    }
  } else if (chapter.stage === "dock") {
    const pressure = collectPressure(state, chapter, 4);
    if (choice === 0) { if (!chapter.manifestFound) { chapter.evidence += chapter.selectedCompanion === "祁觀衡" ? 2 : 1; chapter.manifestFound = true; event = chapter.selectedCompanion === "祁觀衡" ? "祁觀衡眼快，連貨單上的偽造印記也查出來；船次與玄武樓所報不符，證據增加兩點。" : "你查到碼頭貨單上的船次與玄武樓所報不符，留下一份可對質的證據。"; } else event = "你重查貨單，沒有找到新船次。"; }
    if (choice === 1) event = selectCompanion(state, chapter, action);
    if (choice === 2) { if (!chapter.crewHired && state.factionFunds >= 15) { addFunds(state, -15, "堂主僱船工查碼頭水路"); chapter.crewHired = true; chapter.dockRouteKnown = true; event = "你向堂主呈上帳目，何不歸從公款支十五文僱船工，摸清通向碼頭的水路。"; } else event = chapter.crewHired ? "船工已在碼頭外候命，重付錢也不會多一條路。" : "堂口公款不足十五文，何不歸暫無法僱船工。"; }
    if (choice === 3 || choice === 8) {
      if (!chapter.dockRouteKnown) {
        const focused = choice === 8;
        if (focused) state.playerMp -= 4;
        const beforeHp = state.playerHp;
        const damage = Math.max(0, 8 - (focused ? 4 : 0) - (chapter.selectedCompanion === "顧忘生" ? 4 : 0));
        state.playerHp = Math.max(1, state.playerHp - damage);
        chapter.dockRouteKnown = true;
        chapter.evidence += 1;
        event = `你夜探碼頭，記下玄武樓守衛換班。${focused ? "你耗四點精力輕身避開刀鋒。" : ""}${chapter.selectedCompanion === "顧忘生" ? "顧忘生護住傷處。" : ""}氣血減${beforeHp - state.playerHp}。`;
      } else event = "你再探同一條水路，守衛位置沒有新變化。";
    }
    if (choice === 4 || choice === 6) {
      const focused = choice === 6;
      const guard = chapter.selectedCompanion === "衛沉岳" || chapter.selectedCompanion === "霍破陣";
      if (chapter.evidence >= (chapter.selectedCompanion === "霍破陣" ? 2 : 3) && (guard || chapter.dockRouteKnown)) {
        if (focused) state.playerMp -= 6;
        chapter.stage = "complete"; chapter.result = "奪回碼頭"; chapter.deficitStreak = 0;
        remember(state, "第一章碼頭復航");
        addFunds(state, focused ? 12 : 8, "碼頭復航後首批地標收入");
        const help = chapter.selectedCompanion === "衛沉岳" ? "衛沉岳守住堤口，同你接住被扣的糧藥"
          : chapter.selectedCompanion === "霍破陣" ? "霍破陣衝開刀手，同你接住被扣的糧藥"
            : chapter.selectedCompanion === "陸千帆" ? "陸千帆先認清退路，領腳夫從側巷接走糧藥"
              : chapter.selectedCompanion === "容晚秋" ? "容晚秋領腳夫循暗道接走糧藥"
                : "船工沿備好的水路接走被扣的糧藥";
        const beforeHp = state.playerHp;
        if (!focused) state.playerHp = Math.max(1, state.playerHp - 4);
        event = `你按查明的船次與換班時刻帶人入港，${help}。${focused ? "你耗六點精力穩住陣腳，護好貨箱。" : `你近身硬扛一記，氣血減${beforeHp - state.playerHp}。`}玄武樓刀手失去貨單遮掩，只得退開碼頭。首批貨送回城西，公款回收${focused ? "十二" : "八"}文。`;
        if (chapter.selectedCompanion === "祁觀衡") event += "祁觀衡當場重核貨單，堵住玄武樓再藏一車的破綻。";
        if (chapter.selectedCompanion === "顧忘生") event += "顧忘生留在岸邊照料負傷腳夫，讓卸貨沒有因傷停下。";
        if (chapter.selectedCompanion === "柳照霜") event += "柳照霜說服猶豫的碼頭腳夫繼續卸貨，免得貨船再次空等。";
        if (chapter.selectedCompanion === "霍破陣") { addFunds(state, -6, "霍破陣冒進損壞碼頭貨物"); event += "霍破陣衝得太急，貨箱撞裂，修補耗去六文公款。"; }
      } else { const damage = chapter.selectedCompanion === "衛沉岳" ? 5 : 10; state.playerHp = Math.max(1, state.playerHp - damage); event = `你未摸清船次與退路便衝向碼頭，被守衛逼退；氣血減${damage}。貨仍被扣住，你還須補足證據與接應。`; }
    }
    event += pressure + settleTribute(state, chapter);
    event += chapter.stage === "complete"
      ? "\n\n糧藥重新上岸，城西各處生意終於能開門。碼頭暫由青鋒堂與腳夫共同看守，玄武樓的舊帳仍待清算。"
      : "\n\n碼頭仍被玄武樓把持。你可以繼續查證、尋人與探路；城主會否出手，還要看你拿得出甚麼憑據。";
  }
  return finishTurn(state, event + spendEnergy(state, energyCost, Math.max(0, startingEnergy - state.playerMp)));
}

export function resolveChapterPetition(state: GameState, playerText: string): TurnResult {
  const chapter = state.flags.chapterOne;
  if (state.questStep === "chapter_one" && chapter?.stage === "dock" && state.currentLocation !== "青鋒堂總壇")
    return finishTurn(state, "你須先回總壇，與堂主整理貨單及證詞，再向城主呈報。");
  if (state.questStep !== "chapter_one" || !chapter || chapter.stage !== "dock")
    return finishTurn(state, "眼下仍須先查清碼頭與斷貨的來龍去脈。");
  const proposal = /(?:城主|燕鎮嶽|官府)/.test(playerText) && /(?:請|求|呈|交|上書|稟)/.test(playerText)
    && /(?:貨單|帳|證據|人證)/.test(playerText) && /(?:碼頭|截貨|玄武樓)/.test(playerText);
  const negated = /(?:不|唔|無|冇|別|毋|未)(?:向|去|會|要|打算|想|請|求|呈|交|上書|稟)?[^，。；]{0,12}(?:城主|官府|燕鎮嶽)/.test(playerText);
  if (!proposal || negated || /如果|假如|會點|點樣|可唔可以|是否可以/.test(playerText)
    || /槍械|手槍|步槍|機關槍|超人|神仙|飛天|激光|雷射|核彈|手機|電腦|修仙|法術/.test(playerText))
    return finishTurn(state, "請說清實際打算如何向城主呈報截貨證據；否定與假設不會替你執行行動。");
  if (state.customActionUses === 0) return finishTurn(state, "機變次數已用盡，先處理碼頭手上的線索。");
  const energyCost = actionEnergyCost(state, "F. [向城主呈報]");
  if (!canAffordEnergy(state, energyCost)) return finishTurn(state, `精力不足，呈報須${energyCost}點精力。`);
  state.customActionUses -= 1;
  state.turn += 1;
  chapter.turns += 1;
  const pressure = collectPressure(state, chapter, 4);
  const tribute = settleTribute(state, chapter);
  if (chapter.evidence >= (chapter.selectedCompanion === "柳照霜" ? 2 : 3) && chapter.tribute === "paid"
    && (state.worldFlags.includes("城東耳目已識破") || state.worldFlags.includes("刀手進城路線") || chapter.manifestFound)) {
    chapter.stage = "complete"; chapter.result = "城主有條件介入"; chapter.deficitStreak = 0;
    remember(state, "第一章城主介入復航");
    addFunds(state, 8, "城主派員督促碼頭復航後收入");
    const leverage = state.worldFlags.includes("城東耳目已識破") ? "城東耳目線索"
      : state.worldFlags.includes("刀手進城路線") ? "刀手進城路線" : "船次與玄武樓報帳不符的證據";
    return finishTurn(state, `${pressure}${tribute}你託堂主把貨單、${leverage}與已繳貢款的帳遞到城主案前。${chapter.selectedCompanion === "柳照霜" ? "柳照霜替你向書吏逐項說清截貨與稅收的關係。" : ""}玄武樓截貨已妨礙城主稅收，燕鎮嶽派人到碼頭查驗，命貨船復航；青鋒堂須容官府核對其後每筆運費。\n\n糧藥重回城西，公款回收八文，碼頭仍有官府的人盯著。你換來一條貨路，也欠下日後受查的代價。` + spendEnergy(state, energyCost));
  }
  chapter.petitionHeard = chapter.evidence >= 2;
  return finishTurn(state, `${pressure}${tribute}${chapter.petitionHeard ? "城主的書吏收下貨單，答應查問碼頭，卻未肯調兵放貨。" : "城主的書吏認為貨單與人證不足，將呈報退回。"}\n\n你仍須補足證據與貢款安排，或靠同伴自行奪回碼頭。` + spendEnergy(state, energyCost));
}
