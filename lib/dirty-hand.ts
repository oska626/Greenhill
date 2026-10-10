import type { GameState } from "./game-engine.ts";

export const STARTING_DARK_HAND = "【生石灰包】";
export const DARK_HAND_LIMIT = 2;
export const DARK_HAND_PRICE = 5;
export const DARK_HAND_ITEMS = ["【生石灰包】", "【飛蝗石】", "【袖藏短刺】", "【碎骨片】", "【爐灰包】"] as const;
export type DarkHandItem = typeof DARK_HAND_ITEMS[number];
export type DirtyHandTier = "great" | "ordinary" | "failed";

export function isDarkHand(item: string): item is DarkHandItem {
  return (DARK_HAND_ITEMS as readonly string[]).includes(item);
}

export function darkHandCount(inventory: readonly string[]): number {
  return inventory.filter(isDarkHand).length;
}

export function readyDarkHand(inventory: readonly string[], closeRange = true): DarkHandItem | undefined {
  return inventory.find((item): item is DarkHandItem => isDarkHand(item)
    && (closeRange || item !== "【袖藏短刺】"));
}

export function dirtyHandVerb(item: DarkHandItem): string {
  return ({
    "【生石灰包】": "撒石灰迷眼",
    "【飛蝗石】": "擲飛蝗石打亂刀勢",
    "【袖藏短刺】": "貼身刺向空門",
    "【碎骨片】": "擲碎骨擾敵",
    "【爐灰包】": "撒爐灰迷眼",
  } satisfies Record<DarkHandItem, string>)[item];
}

// Existing backgrounds and traits are the modifier source; no extra character stat is added.
export function dirtyHandModifier(state: Pick<GameState, "background" | "trait">): number {
  if (/手疾眼快|扒手/.test(`${state.background}${state.trait}`)) return 2;
  if (/察言觀色|賭坊收帳人|辨毒識藥/.test(`${state.background}${state.trait}`)) return 1;
  return 0;
}

// The saved turn and declared action fix the roll. Reloading the same state cannot redraw it.
export function rollD20(state: Pick<GameState, "playerName" | "turn">, action: string): number {
  let hash = 2166136261;
  for (const character of `${state.playerName}:${state.turn}:${action}`) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return (hash >>> 0) % 20 + 1;
}

export function dirtyHandTier(roll: number, modifier: number, guaranteed: boolean): DirtyHandTier {
  const total = roll + modifier;
  if (total >= 18) return "great";
  if (total >= 10 || guaranteed) return "ordinary";
  return "failed";
}

export function darkHandPurchaseOptions(state: Pick<GameState, "inventory" | "maxInventory" | "silver">): string[] {
  if (state.inventory.length >= state.maxInventory || darkHandCount(state.inventory) >= DARK_HAND_LIMIT) return [];
  return [
    "P. [買石灰包] 付五文私銀，備一包袖藏石灰；佔一格行囊。",
    "Q. [買飛蝗石] 付五文私銀，備一枚袖藏飛蝗石；佔一格行囊。",
    "R. [買袖藏短刺] 付五文私銀，備一柄近身短刺；佔一格行囊。",
  ];
}

export const SCAVENGE_SOURCES = {
  "黑泥街": { key: "黑泥街碎骨", item: "【碎骨片】", label: "S. [拾碎骨] 在肉檔拾碎骨備作暗手；耗一回合，挨刀失二氣血。" },
  "晚秋茶寮": { key: "晚秋茶寮爐灰", item: "【爐灰包】", label: "S. [刮爐灰] 趁土灶熄火刮一包爐灰；耗一回合，消息外洩使命脈減一。" },
} as const;
