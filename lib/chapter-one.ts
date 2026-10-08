import { CUSTOM_ACTION_MAX } from "./custom-action.ts";
import type { GameState, Landmark, TurnResult } from "./game-engine.ts";

export type ChapterOneStage = "rest" | "shortage" | "dock" | "complete";
export type Business = "黑泥街" | "鬼骰坊" | "苦煙館" | "夜雨樓";
export interface ChapterOneState {
  stage: ChapterOneStage;
  turns: number;
  evidence: number;
  allies: number;
  affectedBusiness: Business;
  deficitStreak: number;
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
const BUSINESS_HINTS: Record<Business, string> = {
  黑泥街: "市集糧袋遲遲未到，肉檔旁的米價先漲了。",
  鬼骰坊: "賭坊的運費帳多了一筆空車錢，客人卻少了。",
  苦煙館: "藥館封口空袋堆在門後，傷藥價一天比一天高。",
  夜雨樓: "樓裏的酒車沒來，夜裏的燈也早早熄了。",
};
const REST_OPTIONS = [
  "A. [療傷調息] 在總壇休整一回合，回復氣血與內力。",
  "B. [會見同伴] 與仍願接應的同伴談近況，為後事留人手。",
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
const finishTurn = (state: GameState, event: string): TurnResult => ({ state, event, options: chapterOneOptions(state), moneyNote: "" });

export function chapterOneOptions(state: GameState): string[] {
  if (state.questStep !== "chapter_one") return state.flags.ending === "守住城西" ? [CHAPTER_START] : [];
  const chapter = state.flags.chapterOne;
  if (!chapter || chapter.stage === "complete") return [];
  if (chapter.stage === "rest") return REST_OPTIONS;
  if (chapter.stage === "shortage") return SHORTAGE_OPTIONS;
  return [
    `A. [查碼頭貨單] 核對被扣糧藥車數；目前證據${chapter.evidence}點，首次查可多得一點。`,
    "B. [召集接應] 找仍願協助的同伴與腳夫，準備運回被扣貨物。",
    "C. [僱船工] 請堂主從公款支十五文僱船工，摸清可通碼頭的水路。",
    "D. [夜探碼頭] 冒受傷風險探明守衛換班，找出進港路線。",
    `E. [奪回碼頭] 率人奪回貨路；須有三點證據，並有同伴或已備路線。目前證據${chapter.evidence}點、接應${chapter.allies}人。`,
  ];
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
      affectedBusiness: drawBusiness(), deficitStreak: 0, tribute: "pending" };
    state.customActionUses = CUSTOM_ACTION_MAX;
    state.sectLifeline = Math.min(100, Math.max(10, state.sectLifeline + 8));
    addFunds(state, GRATITUDE_DUES, "市販自願加繳半個月規費");
    remember(state, "第一章市販加繳規費");
    return finishTurn(state, CHAPTER_OPENING);
  }
  const chapter = state.flags.chapterOne;
  if (!chapter) return finishTurn(state, "第一章狀態無效，請載入較早的存檔。");
  const choice = action.charCodeAt(0) - 65;
  state.turn += 1;
  chapter.turns += 1;
  let event = "";
  if (chapter.stage === "rest") {
    if (choice === 0) { state.playerHp = Math.min(state.maxHp, state.playerHp + 8); state.playerMp = Math.min(state.maxMp, state.playerMp + 8); event = "你在總壇換藥調息，氣血與內力各回復至多八點。"; }
    if (choice === 1) { chapter.allies += state.flags.prologueCompanionLeads?.length ? 1 : 0; event = chapter.allies ? "你與仍願接應的舊識談妥，若城西再有事，他們肯替你傳信。" : "你問過幾位舊識，眼下尚無人答應跟你走下一趟。"; }
    if (choice === 2) { chapter.evidence += 1; event = "你對照城西貨帳，記下糧米與傷藥應到的日期。"; }
    if (choice === 3) { if (state.factionFunds >= 5) { addFunds(state, -5, "堂主撥公款照料傷者"); state.sectLifeline = Math.min(100, state.sectLifeline + 2); event = "何不歸從公款撥出五文照料傷者，街坊見青鋒堂仍肯護人，命脈升二。"; } else event = "堂口一時拿不出五文，何不歸只得先把現有傷藥分給街坊。"; }
    if (choice === 4) { chapter.evidence += 1; event = "你巡過城西街口，記下兩輛本該入城的糧車尚未出現。"; }
    if (chapter.turns >= 3) {
      chapter.stage = "shortage";
      event += `玄武樓趁城西休整，奪下青山城碼頭並扣住送往城西的糧藥。${BUSINESS_HINTS[chapter.affectedBusiness]}`;
      event += collectPressure(state, chapter, 6);
      event += "\n\n市販見貨車不來，開始問青鋒堂能否再護住生意。你須查出哪處地標先受衝擊，才能追到截貨的路。";
    } else event += "\n\n城西今日尚能開市，茶寮也肯替傷者留藥。你趁這幾日喘息，仍可再作準備。";
  } else if (chapter.stage === "shortage") {
    const chosen = choice < 4 ? BUSINESSES[choice] : undefined;
    const pressure = collectPressure(state, chapter, 6);
    const tribute = settleTribute(state, chapter);
    if (chosen === chapter.affectedBusiness) {
      state.currentLocation = chosen as Landmark;
      chapter.evidence += 2;
      chapter.stage = "dock";
      remember(state, `第一章${chosen}斷貨已查`);
      event = `你在${chosen}查出帳目異常，貨不是走丟，而是被玄武樓從碼頭扣下。${BUSINESS_HINTS[chosen]}${pressure}${tribute}`;
      event += "\n\n你帶著貨帳返回堂口，腳夫願說出碼頭的守衛換班。若要讓城西重新有貨，須準備接應並奪回貨路。";
    } else if (chosen) {
      state.currentLocation = chosen as Landmark;
      event = `你在${chosen}核對帳目，這裏的虧空尚不足以解釋整筆斷貨。${pressure}${tribute}\n\n線索仍指向另一處地標，碼頭的貨卻還在玄武樓手上。`;
    } else {
      const help = state.flags.prologueCompanionLeads?.length || 0;
      event = `${help ? `接應你的同伴指出${chapter.affectedBusiness}的入帳最不對勁。` : "你暫時找不到肯替你查帳的舊識，只能再核對各地標的貨運記錄。"}${pressure}${tribute}\n\n城西的糧藥仍未到，你須親自去查出缺口。`;
    }
  } else if (chapter.stage === "dock") {
    const pressure = collectPressure(state, chapter, 4);
    if (choice === 0) { if (!chapter.manifestFound) { chapter.evidence += 1; chapter.manifestFound = true; event = "你查到碼頭貨單上的船次與玄武樓所報不符，留下一份可對質的證據。"; } else event = "你重查貨單，沒有找到新船次。"; }
    if (choice === 1) { const leads = state.flags.prologueCompanionLeads?.length || 0; if (leads && chapter.allies < leads) { chapter.allies += 1; event = "你請一名仍願接應的同伴聯絡腳夫，約定奪回貨車後的接力路線。"; } else event = "你已問過能找到的舊識，眼下沒有更多人肯入局。"; }
    if (choice === 2) { if (!chapter.crewHired && state.factionFunds >= 15) { addFunds(state, -15, "堂主僱船工查碼頭水路"); chapter.crewHired = true; chapter.dockRouteKnown = true; event = "你向堂主呈上帳目，何不歸從公款支十五文僱船工，摸清通向碼頭的水路。"; } else event = chapter.crewHired ? "船工已在碼頭外候命，重付錢也不會多一條路。" : "堂口公款不足十五文，何不歸暫無法僱船工。"; }
    if (choice === 3) { if (!chapter.dockRouteKnown) { state.playerHp = Math.max(1, state.playerHp - 8); chapter.dockRouteKnown = true; chapter.evidence += 1; event = "你夜探碼頭，記下玄武樓守衛換班，肩頭卻挨了一記，氣血減八。"; } else event = "你再探同一條水路，守衛位置沒有新變化。"; }
    if (choice === 4) {
      if (chapter.evidence >= 3 && (chapter.allies > 0 || chapter.dockRouteKnown)) {
        chapter.stage = "complete"; chapter.result = "奪回碼頭"; chapter.deficitStreak = 0;
        remember(state, "第一章碼頭復航");
        addFunds(state, 12, "碼頭復航後首批地標收入");
        event = `你按查明的船次與換班時刻帶人入港，${chapter.allies > 0 ? "同伴接住被扣的糧藥" : "船工沿備好的水路接走被扣的糧藥"}。玄武樓刀手失去貨單遮掩，只得退開碼頭。首批貨送回城西，公款回收十二文。`;
      } else { state.playerHp = Math.max(1, state.playerHp - 10); event = "你未摸清船次與退路便衝向碼頭，被守衛逼退；氣血減十。貨仍被扣住，你還須補足證據與接應。"; }
    }
    event += pressure + settleTribute(state, chapter);
    event += chapter.stage === "complete"
      ? "\n\n糧藥重新上岸，城西各處生意終於能開門。碼頭暫由青鋒堂與腳夫共同看守，玄武樓的舊帳仍待清算。"
      : "\n\n碼頭仍被玄武樓把持。你可以繼續查證、尋人與探路；城主會否出手，還要看你拿得出甚麼憑據。";
  }
  return finishTurn(state, event);
}

export function resolveChapterPetition(state: GameState, playerText: string): TurnResult {
  const chapter = state.flags.chapterOne;
  if (state.questStep !== "chapter_one" || !chapter || chapter.stage !== "dock")
    return finishTurn(state, "眼下仍須先查清碼頭與斷貨的來龍去脈。");
  const proposal = /(?:城主|燕鎮嶽|官府)/.test(playerText) && /(?:請|求|呈|交|上書|稟)/.test(playerText)
    && /(?:貨單|帳|證據|人證)/.test(playerText) && /(?:碼頭|截貨|玄武樓)/.test(playerText);
  const negated = /(?:不|唔|無|冇|別|毋|未)(?:向|去|會|要|打算|想|請|求|呈|交|上書|稟)?[^，。；]{0,12}(?:城主|官府|燕鎮嶽)/.test(playerText);
  if (!proposal || negated || /如果|假如|會點|點樣|可唔可以|是否可以/.test(playerText)
    || /槍械|手槍|步槍|機關槍|超人|神仙|飛天|激光|雷射|核彈|手機|電腦|修仙|法術/.test(playerText))
    return finishTurn(state, "請說清實際打算如何向城主呈報截貨證據；否定與假設不會替你執行行動。");
  if (state.customActionUses === 0) return finishTurn(state, "機變次數已用盡，先處理碼頭手上的線索。");
  state.customActionUses -= 1;
  state.turn += 1;
  chapter.turns += 1;
  const pressure = collectPressure(state, chapter, 4);
  const tribute = settleTribute(state, chapter);
  if (chapter.evidence >= 3 && chapter.tribute === "paid"
    && (state.worldFlags.includes("城東耳目已識破") || state.worldFlags.includes("刀手進城路線") || chapter.manifestFound)) {
    chapter.stage = "complete"; chapter.result = "城主有條件介入"; chapter.deficitStreak = 0;
    remember(state, "第一章城主介入復航");
    addFunds(state, 8, "城主派員督促碼頭復航後收入");
    const leverage = state.worldFlags.includes("城東耳目已識破") ? "城東耳目線索"
      : state.worldFlags.includes("刀手進城路線") ? "刀手進城路線" : "船次與玄武樓報帳不符的證據";
    return finishTurn(state, `${pressure}${tribute}你託堂主把貨單、${leverage}與已繳貢款的帳遞到城主案前。玄武樓截貨已妨礙城主稅收，燕鎮嶽派人到碼頭查驗，命貨船復航；青鋒堂須容官府核對其後每筆運費。\n\n糧藥重回城西，公款回收八文，碼頭仍有官府的人盯著。你換來一條貨路，也欠下日後受查的代價。`);
  }
  chapter.petitionHeard = chapter.evidence >= 2;
  return finishTurn(state, `${pressure}${tribute}${chapter.petitionHeard ? "城主的書吏收下貨單，答應查問碼頭，卻未肯調兵放貨。" : "城主的書吏認為貨單與人證不足，將呈報退回。"}\n\n你仍須補足證據與貢款安排，或靠同伴自行奪回碼頭。`);
}
