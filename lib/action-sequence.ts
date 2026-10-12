import type { GameState, TurnResult } from "./game-engine.ts";

// Only split wording that clearly orders separate tasks. A simultaneous maneuver
// remains one attempt unless the understanding service identifies distinct tasks.
export function explicitActionSteps(text: string): string[] {
  const trimmed = text.trim();
  const parts = trimmed.replace(/^(?:我)?先\s*/, "").split(/[，,；;。]\s*(?:再|然後|跟住|之後)\s*/);
  return parts.length > 1 && parts.length <= 3 && parts.every((part) => part.trim())
    ? parts.map((part) => part.trim()) : [trimmed];
}

export function validatedActionSteps(text: string, proposed: unknown): string[] | null {
  if (!Array.isArray(proposed) || proposed.length < 1 || proposed.length > 3
    || proposed.some((part) => typeof part !== "string" || !part.trim() || part.length > 150)) return null;
  const steps = proposed.map((part: string) => part.trim());
  let cursor = 0;
  for (const step of steps) {
    const index = text.indexOf(step, cursor);
    if (index < cursor) return null;
    const connector = text.slice(cursor, index);
    // A stance after a comma describes how the physical act is done. It is not
    // a separate later task unless the player explicitly orders it afterward.
    if (cursor > 0 && /^(?:備戰|戒備|防備|準備迎敵|作好準備|伺機而動)$/.test(step)
      && !/(?:再|然後|跟住|之後)/.test(connector)) return null;
    cursor = index + step.length;
  }
  // The model may remove connective words, but cannot discard an attempted act.
  const remainder = steps.reduce((rest, step) => rest.replace(step, ""), text)
    .replace(/[\s，,；;。！!？?、]/g, "")
    .replace(/先|再|然後|跟住|之後|同時|並且/g, "");
  return /^(?:我|就|便)*$/.test(remainder) ? steps : null;
}

export type SequenceOutcome = {
  state: GameState;
  events: string[];
  attempted: string[];
  pending: string[];
  sceneChanged: boolean;
  blockedStep?: string;
};

export async function resolveActionSequence(initial: GameState, steps: string[],
  settle: (state: GameState, step: string) => Promise<TurnResult | null>): Promise<SequenceOutcome> {
  let state = initial;
  const events: string[] = [];
  const attempted: string[] = [];
  for (let index = 0; index < steps.length; index++) {
    const before = { turn: state.turn, questStep: state.questStep, location: state.currentLocation,
      chapterStage: state.flags.chapterOne?.stage, incident: state.flags.pendingIncident,
      combat: Boolean(state.combat), alley: Boolean(state.flags.alleyEscape), flags: state.worldFlags.join("|") };
    const result = await settle(state, steps[index]);
    if (!result) return { state, events, attempted, pending: steps.slice(index + 1), sceneChanged: false,
      blockedStep: steps[index] };
    state = result.state;
    events.push(result.event);
    if (state.turn === before.turn && state.questStep === before.questStep && state.worldFlags.join("|") === before.flags)
      return { state, events, attempted, pending: steps.slice(index + 1), sceneChanged: false,
        blockedStep: steps[index] };
    attempted.push(steps[index]);
    if (state.questStep !== before.questStep || state.currentLocation !== before.location
      || state.flags.chapterOne?.stage !== before.chapterStage
      || state.flags.pendingIncident !== before.incident
      || Boolean(state.combat) || before.combat
      || Boolean(state.flags.alleyEscape) || before.alley
      || state.flags.finalCrisis || state.flags.ending)
      return { state, events, attempted, pending: steps.slice(index + 1), sceneChanged: true };
  }
  return { state, events, attempted, pending: [], sceneChanged: false };
}

export function sceneDangerCue(state: GameState): string {
  if (state.currentLocation === "黑泥街") {
    if (state.flags.alleyEscape) return state.flags.alleyWall
      ? "追兵正在巷口尋找翻牆的落腳處。" : "追兵踏入窄巷，巷尾竹籮仍未挪到牆邊。";
    if (state.combat?.scenario === "market_ambush") return "刀手仍守著你的退路，正試著繞到你身側。";
    if (state.questStep === "market_collection") {
      const actions = state.flags.marketIntentHistory?.length || 0;
      return actions >= 2 ? "巷口灰衣人已逼到肉案邊，手按著刀柄。"
        : actions >= 1 ? "巷口灰衣人離開牆邊，沿攤棚向肉案靠近。" : "";
    }
  }
  if (state.combat?.scenario === "arena") return state.combat.enemyIntent === "heavy"
    ? "對手沉肩蓄力，正盯著你的肋側。" : "對手收緊步子，正試探你的門戶。";
  const chapter = state.flags.chapterOne;
  if (state.questStep === "chapter_one" && chapter) {
    if (chapter.stage === "rest" && chapter.turns >= 2)
      return "街口糧車遲遲未到，總壇門外有人打聽米價。";
    if (chapter.stage === "shortage") return chapter.unrest >= 16
      ? "求糧的人群已擠到街口，守街同門快要攔不住。"
      : chapter.unrest >= 8 ? "糧店門外的人群越聚越多，街坊開始爭吵。"
        : "糧車仍未到，街坊提著空袋四處打聽。";
    if (chapter.stage === "dock") return chapter.crewHired
      ? "船工守在岸邊等你的消息，被扣的糧藥仍未放行。"
      : "碼頭守衛看著被扣的糧藥，船工還不敢開船。";
  }
  if (state.questStep === "kuyan_medicine" || state.questStep === "yung_tea_stall")
    return "市集方向傳來急促腳步聲，傷藥還未送到陸千帆手上。";
  return "";
}

export function appendDangerCue(narrative: string, state: GameState): string {
  const cue = sceneDangerCue(state);
  return cue ? `${narrative.trim()}\n\n（${cue}）` : narrative;
}
