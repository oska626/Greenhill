import type { GameState } from "./game-engine.ts";
import { WEAPONS } from "./combat-engine.ts";

// Saves contain player supplied inventory labels; keep each label on one line of the prompt.
const promptLabel = (value: string): string => value.replace(/[\r\n<>]/g, " ").slice(0, 80);

export function playerStatusContext(state: GameState): string {
  const inventory = state.inventory.length
    ? state.inventory.map(promptLabel).join(", ") : "無";
  const weapon = WEAPONS[state.equippedWeapon || "fists"].name;
  // Character creation and saved games store the profile as flat GameState fields.
  const background = state.background?.trim() ? promptLabel(state.background) : "未設定";
  const traits = Array.from(new Set([state.trait, state.skill, state.personality]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map(promptLabel)));
  return `<PlayerStatus>
[玩家當前狀態]
氣血: ${state.playerHp} / ${state.maxHp}
精力: ${state.playerMp} / ${state.maxMp}
行囊物品: ${inventory}
裝備兵器: ${weapon}

[玩家人物設定]
出身背景: ${background}
特質: ${traits.join(", ") || "未設定"}
</PlayerStatus>`;
}
