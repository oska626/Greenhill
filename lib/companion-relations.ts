import type { MissionId } from "./city-progression.ts";

export const COMPANION_IDS = ["陸千帆", "容晚秋", "祁觀衡", "衛沉岳", "霍破陣", "顧忘生", "柳照霜"] as const;
export type CompanionId = typeof COMPANION_IDS[number];
export type CompanionRelationship = { trust: number; wounded: boolean; estranged: boolean };
export type CompanionRelationships = Record<CompanionId, CompanionRelationship>;

export function newRelationships(): CompanionRelationships {
  return Object.fromEntries(COMPANION_IDS.map((name) => [name, { trust: 0, wounded: false, estranged: false }])) as CompanionRelationships;
}

export function normalizeRelationships(raw: unknown): CompanionRelationships {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const relationships = newRelationships();
  for (const name of COMPANION_IDS) {
    const entry = value[name];
    if (!entry || typeof entry !== "object") continue;
    const relation = entry as Partial<CompanionRelationship>;
    relationships[name] = {
      trust: typeof relation.trust === "number" && Number.isFinite(relation.trust)
        ? Math.max(-3, Math.min(3, Math.trunc(relation.trust))) : 0,
      wounded: relation.wounded === true,
      estranged: relation.estranged === true,
    };
  }
  return relationships;
}

export function changeTrust(relationships: CompanionRelationships, name: CompanionId, amount: number): void {
  relationships[name].trust = Math.max(-3, Math.min(3, relationships[name].trust + amount));
}

export function applyMissionRelationship(relationships: CompanionRelationships, missionId: MissionId, careful: boolean): void {
  if (missionId === "roll_call") return;
  if (missionId === "arena_probe") {
    changeTrust(relationships, "衛沉岳", careful ? 1 : -1);
    if (!careful) changeTrust(relationships, "霍破陣", 1);
    return;
  }
  const contact: Record<Exclude<MissionId, "roll_call" | "arena_probe">, CompanionId> = {
    missing_courier: "容晚秋", double_dues: "陸千帆", forged_deed: "祁觀衡",
    tainted_medicine: "顧忘生", hidden_spy: "柳照霜",
  };
  changeTrust(relationships, contact[missionId], careful ? 1 : -1);
}

export function companionLeads(relationships: CompanionRelationships, ending?: string): CompanionId[] {
  if (ending === "獨自撤走") return [];
  return COMPANION_IDS.filter((name) => {
    const relation = relationships[name];
    return relation.trust >= 1 && !relation.wounded && !relation.estranged;
  }).sort((a, b) => relationships[b].trust - relationships[a].trust);
}

export function relationshipLabel(relation: CompanionRelationship): string {
  if (relation.estranged) return "決裂";
  if (relation.trust >= 2) return "信任";
  if (relation.trust >= 1) return "可合作";
  if (relation.trust <= -2) return "疏離";
  if (relation.trust < 0) return "戒備";
  return "觀望";
}
