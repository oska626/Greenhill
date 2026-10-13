import type { Landmark } from "./game-engine.ts";
import type { ActionTag } from "./types.ts";

type NpcTrait = { initial: number; likes: readonly ActionTag[]; dislikes: readonly ActionTag[] };

export const NPC_TRAITS = {
  "何不歸": { initial: 25, likes: ["cautious", "protective"], dislikes: ["reckless", "trouble"] },
  "霍破陣": { initial: 20, likes: ["ruthless", "brave"], dislikes: ["cautious", "cowardly"] },
  "祁觀衡": { initial: 0, likes: ["profitable", "rules"], dislikes: ["generous", "rule-breaking"] },
  "容晚秋": { initial: 0, likes: ["profitable", "trade"], dislikes: ["trouble", "violence"] },
  "陸千帆": { initial: 5, likes: ["cautious", "protective"], dislikes: ["reckless", "trouble"] },
  "衛沉岳": { initial: 15, likes: ["brave", "protective"], dislikes: ["cowardly", "rule-breaking"] },
  "顧忘生": { initial: 0, likes: ["protective", "observant"], dislikes: ["reckless", "violence"] },
  "柳照霜": { initial: 5, likes: ["observant", "cautious"], dislikes: ["reckless", "trouble"] },
  "張斷骨": { initial: -10, likes: ["profitable", "trade"], dislikes: ["rule-breaking", "trouble"] },
  "裴無鋒": { initial: -20, likes: ["profitable", "ruthless"], dislikes: ["protective", "rule-breaking"] },
  "黃萬鈞": { initial: -15, likes: ["profitable", "rules"], dislikes: ["generous", "rule-breaking"] },
  "燕鎮嶽": { initial: -10, likes: ["cautious", "rules"], dislikes: ["reckless", "trouble"] },
  "玄渡": { initial: -20, likes: ["rules", "observant"], dislikes: ["rule-breaking", "merciful"] },
} as const satisfies Record<string, NpcTrait>;

export type NamedNpc = keyof typeof NPC_TRAITS;
export type RelationshipScores = Record<NamedNpc, number>;

const AUDIENCE: Record<Landmark, readonly NamedNpc[]> = {
  "青鋒堂總壇": ["何不歸", "霍破陣"],
  "晚秋茶寮": ["容晚秋"],
  "黑泥街": ["陸千帆", "張斷骨"],
  "鬼骰坊": ["祁觀衡"],
  "裂石擂": ["衛沉岳", "霍破陣"],
  "苦煙館": ["顧忘生"],
  "夜雨樓": ["柳照霜"],
  "碼頭": [],
};

const PRAISE: Partial<Record<ActionTag, string>> = {
  ruthless: "狠辣表示讚賞", brave: "膽氣表示讚賞", cautious: "謹慎表示認同",
  protective: "護人之舉表示認同", profitable: "識得算帳表示認同",
  rules: "守規矩表示認同", trade: "懂得交易表示認同",
  observant: "眼力表示認同", merciful: "留情表示認同",
};
const DISAPPROVAL: Partial<Record<ActionTag, string>> = {
  trouble: "惹是生非感到頭痛", reckless: "魯莽感到不滿",
  cowardly: "退縮感到不滿", cautious: "畏縮感到不滿",
  generous: "慷慨感到不滿", "rule-breaking": "壞了規矩感到不滿",
  violence: "動用武力感到不滿", protective: "袒護旁人感到不滿",
  merciful: "心軟感到不滿",
};

export function initialRelationshipScores(): RelationshipScores {
  return Object.fromEntries(Object.entries(NPC_TRAITS).map(([name, trait]) => [name, trait.initial])) as RelationshipScores;
}

export function normalizeRelationshipScores(raw: unknown): RelationshipScores {
  const saved = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const scores = initialRelationshipScores();
  for (const name of Object.keys(NPC_TRAITS) as NamedNpc[]) {
    const value = saved[name];
    if (typeof value === "number" && Number.isFinite(value))
      scores[name] = Math.max(-50, Math.min(50, Math.trunc(value)));
  }
  return scores;
}

export function applyActionTags(scores: RelationshipScores, location: Landmark, tags: readonly ActionTag[]): string {
  const feedback: string[] = [];
  for (const name of AUDIENCE[location]) {
    const trait: NpcTrait = NPC_TRAITS[name];
    let delta = 0;
    let reason = "";
    for (const tag of Array.from(new Set(tags))) {
      if (trait.likes.includes(tag)) { delta += 2; reason ||= PRAISE[tag] || "做法表示認同"; }
      if (trait.dislikes.includes(tag)) { delta -= 2; reason ||= DISAPPROVAL[tag] || "做法感到不滿"; }
    }
    const before = scores[name];
    scores[name] = Math.max(-50, Math.min(50, before + delta));
    if (scores[name] !== before) feedback.push(`${name}對你的${reason}`);
  }
  return feedback.length ? `（${feedback.join("；")}）` : "";
}
