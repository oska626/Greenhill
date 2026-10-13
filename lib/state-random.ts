import type { GameState } from "./game-engine.ts";

/** Repeatable 0–99 roll from the saved, gameplay-relevant state. */
export function getPseudoRandom(state: GameState): number {
  const signature = [state.turn, state.currentLocation, state.playerHp, state.playerMp,
    state.silver, state.factionFunds, state.sectLifeline, state.flags.incidentCount || 0,
    state.flags.lastIncidentTurn || 0, [...state.worldFlags].sort().join("|")].join(":");
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index++) {
    hash = Math.imul(hash ^ signature.charCodeAt(index), 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return (hash >>> 0) % 100;
}
