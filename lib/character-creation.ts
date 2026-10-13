import { STARTING_DARK_HAND } from "./dirty-hand.ts";
import type { WeaponId } from "./combat-engine.ts";

export const STARTING_ITEMS_BY_BACKGROUND = {
  debt_collector: ["【灌鉛假骰】", "【催債短棍】", "【開鎖鐵線】", "【止血散】"],
  doc_assistant: ["【止血散】", "【行醫薄刃】", "【艾草藥條】", "【粗鐵護腕】"],
  pickpocket: ["【開鎖鐵線】", "【割包小薄刀】", "【爛布蒙面巾】", "【止血散】"],
  martial_dropout: ["【粗鐵護腕】", "【破舊纏手布】", "【行氣散】", "【開鎖鐵線】"],
  custom: ["【開鎖鐵線】", "【止血散】", "【粗鐵護腕】", "【灌鉛假骰】"],
} as const;

export type BackgroundId = keyof typeof STARTING_ITEMS_BY_BACKGROUND;

export const STARTING_WEAPON_BY_ITEM = {
  "【催債短棍】": "debt_baton",
  "【行醫薄刃】": "medical_blade",
  "【割包小薄刀】": "pickpocket_knife",
} as const satisfies Record<string, WeaponId>;

export function startingWeaponForInventory(inventory: readonly string[]): WeaponId {
  for (const item of inventory) {
    const weapon = STARTING_WEAPON_BY_ITEM[item as keyof typeof STARTING_WEAPON_BY_ITEM];
    if (weapon) return weapon;
  }
  return "fists";
}

export function startingWeaponItem(weapon: WeaponId): string | undefined {
  return Object.entries(STARTING_WEAPON_BY_ITEM).find(([, id]) => id === weapon)?.[0];
}

export function startingItemOptions(backgroundId: BackgroundId): readonly string[] {
  return STARTING_ITEMS_BY_BACKGROUND[backgroundId];
}

export function startingInventory(backgroundId: BackgroundId, selectedItem: string): string[] {
  const choices = startingItemOptions(backgroundId);
  const chosen = choices.includes(selectedItem) ? selectedItem : choices[0];
  return [STARTING_DARK_HAND, chosen];
}
