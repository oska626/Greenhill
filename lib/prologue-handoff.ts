import { MISSIONS } from "./city-progression.ts";
import type { GameState } from "./game-engine.ts";

export interface PrologueHandoff {
  version: 1;
  ending: NonNullable<GameState["flags"]["ending"]>;
  summary: string;
}

const OUTCOMES: Record<NonNullable<GameState["flags"]["ending"]>, string> = {
  "守住城西": "你與同門守住城西，玄武樓暫退，城東舊怨卻仍未了結。",
  "城西陷落": "玄武樓逐巷插旗，青鋒堂總壇失守；你與殘存同門帶著傷者撤走。",
  "割地求存": "你與堂主交出地契，換得同門活路；青鋒堂此後受玄武樓節制。",
  "獨自撤走": "你獨自從暗巷逃離，青鋒堂的招牌倒在火中，城西再無舊日依靠。",
};

export function createPrologueHandoff(state: GameState): PrologueHandoff | null {
  const ending = state.flags.ending;
  if (!ending || !Object.hasOwn(OUTCOMES, ending)) return null;
  const leads = state.flags.prologueCompanionLeads || [];
  const help = leads.length ? `仍可能接應你的人有${leads.join("、")}；他們尚未答應同行。` : "眼下沒有可立即接應你的舊識。";
  const clues = MISSIONS.filter((mission) => state.worldFlags.includes(mission.clue)).map((mission) => mission.title);
  const evidence = clues.length ? `你在${clues.join("、")}留下可用線索。` : "你未留下足以倚仗的據點線索。";
  const burdens = [
    state.worldFlags.includes("出賣陸千帆") ? "陸千帆與你決裂" : "",
    state.worldFlags.includes("私吞五十文規費") ? "私吞規費的舊帳仍在" : "",
    state.worldFlags.includes("打斷張斷骨右手") ? "張斷骨記著斷手之仇" : "",
    state.worldFlags.includes("城東記恨暗殺") ? "城東認出了你的暗殺手法" : "",
  ].filter(Boolean);
  const oldDebts = burdens.length ? `此外，${burdens.join("，")}。` : "";
  const summary = `城西序章於第${state.turn}回合收束。${OUTCOMES[ending]}${help}${evidence}${oldDebts}你現有私銀${state.silver}文，氣血${state.playerHp}/${state.maxHp}，內力${state.playerMp}/${state.maxMp}；其餘傷勢、所學、物件與人情仍按存檔延續。`;
  return { version: 1, ending, summary };
}
