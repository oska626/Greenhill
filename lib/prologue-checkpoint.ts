import type { GameState } from "./game-engine.ts";

export function shouldCapturePrologueCheckpoint(before: GameState | null, after: GameState): boolean {
  return before?.questStep === "sandbox" && before.flags.checkpointReady === true
    && before.flags.midpointBriefed !== true && after.questStep === "sandbox"
    && after.flags.midpointBriefed === true && !after.flags.finalCrisis && !after.flags.ending;
}
