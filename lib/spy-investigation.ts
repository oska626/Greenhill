import type { GameState, Landmark } from "./game-engine.ts";

export const SPY_CASE_FLAG = "何不歸密令暗查內鬼";
export const SPY_SUMMONS_FLAG = "何不歸急召回總壇";
export const SPY_BRIEFING_OPTION = "N. [面見堂主] 聽何不歸交代急召";
export const SPY_SUSPECTS = ["陳彪", "老馬", "白冷"] as const;
export type SpySuspect = typeof SPY_SUSPECTS[number];

type Lead = {
  location: Landmark;
  title: string;
  surface: string;
  rumor: string;
  evidence: string;
  finding: string;
};

export const SPY_LEADS: readonly Lead[] = [
  { location: "苦煙館", title: "驗傷者兵刃", surface: "傷者指認伏兵招式似陳彪。", rumor: "傷者咬定伏兵像陳彪；你尚未驗過兵刃。", evidence: "軟筋散調撥總哨", finding: "顧忘生驗出兵刃上的軟筋散，三日前由堂口發給總哨白冷作夜襲備用。傷者所見只是一個身形相似的刀手。" },
  { location: "堂口舊賬房", title: "核對調撥真帳", surface: "桌上假帳蓋著老馬私章。", rumor: "老馬私章壓在帳面，似乎吞了防禦款；暗格尚未查。", evidence: "物資暗調真單", finding: "你從暗格找出真正調撥單：半個月的兵器與傷藥被轉往城外。桌上的老馬私章帳頁，紙墨與真帳不符。" },
  { location: "黑泥街", title: "追問撤哨命令", surface: "張斷骨說老馬扣了安家費。", rumor: "張斷骨認定老馬扣起安家費，正向攤販急抽規費。", evidence: "黑泥街總哨撤令", finding: "張斷骨承認今夜暗哨忽被撤走，才急著籌錢逃命。撤哨令經總哨專用傳令線送來，老馬無權下令。" },
  { location: "裂石擂", title: "查拳手密令", surface: "拳手說陳彪命他們生死相搏。", rumor: "拳手只見陳彪署名，便以為他要耗盡堂口精銳。", evidence: "偽造堂主密令", finding: "調離精銳的密令假借何不歸名義，火漆封法與巡哨密件相同。陳彪曾催拳手比試，卻未簽這張調令。" },
  { location: "鬼骰坊", title: "查城外運貨簿", surface: "押貨人的當票記著陳彪玉珮。", rumor: "押貨人典當了陳彪的玉珮，似乎替他轉賣堂口兵器。", evidence: "鴞啼接貨暗號", finding: "你從暗帳查到城外接貨記錄：青鋒堂兵器的接頭暗號是兩聲鴞啼。玉珮是押貨人帶來的，尚不能證明陳彪到場。" },
  { location: "廢棄更樓", title: "驗暗哨遺物", surface: "血字只剩半個「馬」字。", rumor: "更樓血字像個「馬」，眾人疑心老馬殺了暗哨。", evidence: "夜行香灰布碎", finding: "暗哨被熟人近身一刀割喉，牆上搏鬥痕跡是事後佈置。布碎沾著白冷慣用的夜行香灰，半個血字不足以指認老馬。" },
  { location: "醉春樓後巷", title: "截玄武樓線人", surface: "分贓承諾寫著老馬與陳彪。", rumor: "線人帶著寫有老馬、陳彪名字的分贓承諾，城防圖卻未搜到。", evidence: "總哨城防盲區圖", finding: "你截下完整城防圖，連白冷昨夜才改過的暗哨盲區也畫在上面。背面分贓承諾只寫老馬與陳彪，像是留給他們互相指責的餌。" },
];

export const SPY_CORE_EVIDENCE = ["軟筋散調撥總哨", "黑泥街總哨撤令", "總哨城防盲區圖"] as const;
export const SPY_EVIDENCE = SPY_LEADS.map((lead) => lead.evidence);
export const spyEvidenceCount = (state: GameState) => SPY_EVIDENCE.filter((clue) => state.worldFlags.includes(clue)).length;
export const hasSpyProof = (state: GameState) => SPY_CORE_EVIDENCE.every((clue) => state.worldFlags.includes(clue));

export function spyOptions(state: GameState): string[] {
  if (state.questStep !== "sandbox" || state.flags.spyAccusation) return [];
  if (!state.worldFlags.includes(SPY_CASE_FLAG)) return state.currentLocation === "青鋒堂總壇"
    && state.worldFlags.includes(SPY_SUMMONS_FLAG) ? [SPY_BRIEFING_OPTION] : [];
  const options: string[] = [];
  const lead = SPY_LEADS.find((item) => item.location === state.currentLocation);
  if (lead && !state.worldFlags.includes(lead.evidence)) {
    const heard = state.worldFlags.includes(`只聞${lead.evidence}`);
    if (!heard) options.push(`P. [速查] ${lead.title}`);
    options.push(`Q. [細查] ${lead.title}`);
  }
  if (state.currentLocation === "青鋒堂總壇") {
    for (const suspect of SPY_SUSPECTS) options.push(`R. [指認內鬼] 向何不歸指認${suspect}`);
  }
  return options;
}

export function resolveSpyAction(state: GameState, action: string): string | undefined {
  if (state.questStep !== "sandbox" || state.flags.spyAccusation || state.turn > 70) return undefined;
  if (action === SPY_BRIEFING_OPTION && state.currentLocation === "青鋒堂總壇"
    && state.worldFlags.includes(SPY_SUMMONS_FLAG) && !state.worldFlags.includes(SPY_CASE_FLAG)) {
    state.worldFlags = state.worldFlags.filter((flag) => flag !== SPY_SUMMONS_FLAG);
    state.worldFlags.push(SPY_CASE_FLAG);
    return "你依急信回到總壇，何不歸先命醫徒替你換藥，讓你坐下喘口氣，才屏退旁人。他攤開城防圖：「堂口有人向玄武樓洩露佈防。我只疑三人：刑堂陳彪、賬房老馬、總哨白冷。你暗中查訪各處，分清傳聞與物證；天黑前帶證據回來，親自向我指認。」";
  }
  if (!state.worldFlags.includes(SPY_CASE_FLAG)) return undefined;
  const allowed = spyOptions(state);
  if (!allowed.includes(action)) return undefined;
  const lead = SPY_LEADS.find((item) => item.location === state.currentLocation);
  if (action.startsWith("P.") && lead) {
    state.worldFlags.push(`只聞${lead.evidence}`);
    return `${lead.surface}${lead.rumor}你把這條未核實的說法記下。`;
  }
  if (action.startsWith("Q.") && lead) {
    state.worldFlags.push(lead.evidence);
    state.sectLifeline = Math.min(100, state.sectLifeline + 3);
    return `${lead.finding}你把物證收好，可回總壇向何不歸交代。`;
  }
  const suspect = SPY_SUSPECTS.find((name) => action.endsWith(name));
  if (!suspect) return undefined;
  state.flags.spyAccusation = suspect;
  state.flags.spyExposed = suspect === "白冷" && hasSpyProof(state);
  if (state.flags.spyExposed) {
    state.worldFlags.push("陳彪與老馬洗清嫌疑");
    state.sectLifeline = Math.min(100, state.sectLifeline + 15);
    return "你把軟筋散調撥、黑泥街撤哨令和昨夜才改的城防盲區圖逐項攤開。何不歸當場截住白冷，收回總哨令牌。陳彪與老馬洗清嫌疑，帶人補回暗哨與物資缺口。";
  }
  return suspect === "白冷"
    ? "你指認白冷，卻未能串起調撥、撤哨與城防圖。白冷趁爭論脫身，總壇未能及時封門。"
    : `你指認${suspect}。堂口忙於扣人查問，白冷趁亂撤走城門暗哨；陳彪與老馬再難同心守城。`;
}
