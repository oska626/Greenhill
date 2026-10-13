import type { GameState } from "./game-engine.ts";
import { WEAPONS } from "./combat-engine.ts";

// Saves contain player supplied inventory labels; keep each label on one line of the prompt.
const promptLabel = (value: string): string => value.replace(/[\r\n<>]/g, " ").slice(0, 80);

export function playerStatusContext(state: GameState): string {
  const inventory = state.inventory.length
    ? state.inventory.map(promptLabel).join(", ") : "無";
  const weapon = WEAPONS[state.equippedWeapon || "fists"].name;
  return `<PlayerStatus>
[玩家當前狀態]
氣血: ${state.playerHp} / ${state.maxHp}
精力: ${state.playerMp} / ${state.maxMp}
行囊物品: ${inventory}
裝備兵器: ${weapon}
</PlayerStatus>`;
}
