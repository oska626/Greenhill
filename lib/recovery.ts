export const PACKED_MEDICINE = "【療傷藥】";
export const USE_PACKED_MEDICINE = "H. [服用療傷藥] 用一回合服藥，氣血與精力各回復上限的35%。";

type Vitals = { playerHp: number; maxHp: number; playerMp: number; maxMp: number };

export function restoreVitals(state: Vitals, percentage: number): { hp: number; mp: number } {
  const hp = Math.min(Math.ceil(state.maxHp * percentage), state.maxHp - state.playerHp);
  const mp = Math.min(Math.ceil(state.maxMp * percentage), state.maxMp - state.playerMp);
  state.playerHp += hp;
  state.playerMp += mp;
  return { hp, mp };
}

export function canUsePackedMedicine(state: Vitals & { inventory: string[] }): boolean {
  return state.inventory.includes(PACKED_MEDICINE)
    && (state.playerHp < state.maxHp || state.playerMp < state.maxMp);
}

export function consumePackedMedicine(state: Vitals & { inventory: string[] }): { hp: number; mp: number } | null {
  if (!canUsePackedMedicine(state)) return null;
  state.inventory.splice(state.inventory.indexOf(PACKED_MEDICINE), 1);
  return restoreVitals(state, 0.35);
}
