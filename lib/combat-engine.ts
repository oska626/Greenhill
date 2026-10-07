export const WEAPONS = {
  fists: { name: "徒手", power: 0, maxDurability: 0 },
  wooden_stick: { name: "案邊木棍", power: 2, maxDurability: 2 },
  rusty_knife: { name: "生鏽鐵刀", power: 4, maxDurability: 4 },
} as const;

export type WeaponId = keyof typeof WEAPONS;
export type MoveId = "mud_step" | "short_punch";
export type KnownMoves = Partial<Record<MoveId, number>>;
export type CombatScenario = "market_ambush" | "arena";
export type CombatIntent = "slash" | "flank" | "press" | "jab" | "heavy";
export type CombatOutcome = "ongoing" | "won" | "fled" | "lost";

export interface CombatState {
  scenario: CombatScenario;
  round: number;
  enemyHp: number;
  enemyGuard: number;
  enemyIntent: CombatIntent;
  opening: number;
  preparedDefense: number;
  allyPresent: boolean;
  allyWounded: boolean;
}

export interface CombatInput {
  combat: CombatState;
  action: string;
  playerHp: number;
  playerMp: number;
  weapon: WeaponId;
  weaponDurability: number;
  knownMoves: KnownMoves;
  canTakeStick?: boolean;
}

export interface CombatResolution {
  combat: CombatState;
  outcome: CombatOutcome;
  event: string;
  playerHp: number;
  playerMp: number;
  weapon: WeaponId;
  weaponDurability: number;
}

const INTENT_WORDS: Record<CombatIntent, string> = {
  slash: "刀手壓低肩頭，短刀直取你的胸口",
  flank: "刀手繞向陸千帆，想從你的身側穿過",
  press: "刀手收緊步子，要把你逼到肉案旁",
  jab: "對手以短拳試探你的門戶",
  heavy: "對手沉肩蓄力，下一拳要取你的肋下",
};

function intentAt(scenario: CombatScenario, round: number, allyPresent: boolean): CombatIntent {
  if (scenario === "arena") return round % 2 === 0 ? "heavy" : "jab";
  const sequence: CombatIntent[] = allyPresent ? ["slash", "flank", "press", "slash"] : ["slash", "press", "slash", "press"];
  return sequence[(round - 1) % sequence.length];
}

export function createCombat(scenario: CombatScenario, allyPresent = false): CombatState {
  return {
    scenario, round: 1, enemyHp: scenario === "arena" ? 18 : 19,
    enemyGuard: scenario === "arena" ? 1 : 2,
    enemyIntent: intentAt(scenario, 1, allyPresent), opening: 0, preparedDefense: 0,
    allyPresent, allyWounded: false,
  };
}

export function normalizeCombat(raw: unknown): CombatState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<CombatState>;
  if (value.scenario !== "market_ambush" && value.scenario !== "arena") return undefined;
  const round = typeof value.round === "number" && Number.isFinite(value.round) ? Math.max(1, Math.min(4, Math.trunc(value.round))) : 1;
  const allyPresent = value.scenario === "market_ambush" && value.allyPresent === true;
  return {
    scenario: value.scenario, round,
    enemyHp: typeof value.enemyHp === "number" && Number.isFinite(value.enemyHp) ? Math.max(1, Math.min(30, Math.trunc(value.enemyHp))) : value.scenario === "arena" ? 18 : 19,
    enemyGuard: typeof value.enemyGuard === "number" && Number.isFinite(value.enemyGuard) ? Math.max(0, Math.min(5, Math.trunc(value.enemyGuard))) : value.scenario === "arena" ? 1 : 2,
    enemyIntent: intentAt(value.scenario, round, allyPresent),
    opening: typeof value.opening === "number" && Number.isFinite(value.opening) ? Math.max(0, Math.min(3, Math.trunc(value.opening))) : 0,
    preparedDefense: typeof value.preparedDefense === "number" && Number.isFinite(value.preparedDefense) ? Math.max(0, Math.min(5, Math.trunc(value.preparedDefense))) : 0,
    allyPresent, allyWounded: value.allyWounded === true,
  };
}

export function combatOptions(combat: CombatState, weapon: WeaponId, knownMoves: KnownMoves, mp: number, canTakeStick = true): string[] {
  const shortPunch = weapon === "fists" && (knownMoves.short_punch || 0) > 0 && mp >= 4;
  const mudStep = (knownMoves.mud_step || 0) > 0 && mp >= 3;
  const terrain = combat.scenario === "market_ambush"
    ? weapon === "fists" && canTakeStick ? "抄起案邊木棍，擾亂刀手步子" : "借肉案擾亂刀手步子"
    : "借圍欄擾亂對手步子";
  return [
    shortPunch ? "A. [裂石短拳] 耗四點內力逼退對手；進攻時仍會露出空門。"
      : `A. [正面進擊] 以${WEAPONS[weapon].name}進攻；可傷敵，也須承受還擊。`,
    mudStep ? "B. [泥鰍步] 耗三點內力護住要害，借勢還擊。"
      : combat.allyPresent ? "B. [護住同門] 擋在陸千帆身前，少受傷，暫難擊退刀手。"
        : "B. [沉身守勢] 護住要害，少受傷，暫難擊退對手。",
    `C. [借地形] ${terrain}；最多耗二點內力。`,
    "D. [佯攻破綻] 最多耗四點內力搶出破綻；下一擊更重，自身也會露空門。",
    combat.allyPresent ? "E. [護人撤離] 帶陸千帆退出肉檔；保住性命，讓出街口。"
      : "E. [抽身退走] 退出這場爭鬥；保住性命，放棄眼前勝負。",
  ];
}

function actionCode(action: string): "A" | "B" | "C" | "D" | "E" {
  const letter = /^[A-E]\./.exec(action)?.[0]?.[0];
  if (letter === "A" || letter === "B" || letter === "C" || letter === "D" || letter === "E") return letter;
  if (/撤退|退回|逃走|逃離|離開|脫身/.test(action)) return "E";
  if (/護|守|擋|閃/.test(action)) return "B";
  if (/泥|灰|桌|案|棍|石|地形/.test(action)) return "C";
  if (/佯|誘|破綻/.test(action)) return "D";
  return "A";
}

export function resolveCombatRound(input: CombatInput): CombatResolution {
  const combat = { ...input.combat };
  const code = actionCode(input.action);
  let hp = Math.max(0, input.playerHp);
  let mp = Math.max(0, input.playerMp);
  let weapon = input.weapon;
  let durability = input.weaponDurability;
  const notes: string[] = [];

  if (code === "E") {
    const graze = Math.min(hp, combat.scenario === "market_ambush" ? 3 : 2);
    hp -= graze;
    notes.push(combat.scenario === "market_ambush"
      ? combat.allyPresent ? "你扶陸千帆退入巷口，刀手奪了肉檔前的路。" : "你獨自退入巷口，刀手奪了肉檔前的路。"
      : "你避開最後一拳，從擂台圍欄旁退走。");
    notes.push(`撤離時氣血減${graze}。`);
    return { combat, outcome: "fled", event: notes.join(""), playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
  }

  let damage = 0;
  let cover = 0;
  let exposure = 0;
  if (code === "A") {
    const rank = weapon === "fists" && mp >= 4 ? Math.max(0, Math.min(3, input.knownMoves.short_punch || 0)) : 0;
    if (rank) { mp -= 4; damage = 8 + rank * 3 + combat.opening; notes.push("你將衛沉岳教的短拳送進對手空門，內力減四。"); }
    else { damage = 8 + WEAPONS[weapon].power + combat.opening; notes.push(weapon === "fists" ? "你迎面揮拳，直取對手門戶。" : `你持${WEAPONS[weapon].name}迎面進擊。`); }
    exposure = 2;
    damage = Math.max(1, damage - combat.enemyGuard);
    combat.opening = 0;
  } else if (code === "B") {
    const rank = mp >= 3 ? Math.max(0, Math.min(3, input.knownMoves.mud_step || 0)) : 0;
    if (rank) { mp -= 3; cover = 7 + rank; damage = 1 + rank; notes.push("你側身踏出何不歸教的泥鰍步，內力減三。"); }
    else { cover = 6; damage = 1; notes.push(combat.allyPresent ? "你守住陸千帆身前的空隙。" : "你沉身護住肋下。"); }
    damage = Math.max(0, damage - combat.enemyGuard);
    combat.enemyGuard = Math.max(0, combat.enemyGuard - 1);
  } else if (code === "C") {
    const spent = Math.min(2, mp);
    mp -= spent;
    damage = 3 + (spent === 2 ? 2 : 0);
    cover = 2;
    combat.enemyGuard = 0;
    if (combat.scenario === "market_ambush" && weapon === "fists" && input.canTakeStick !== false) {
      weapon = "wooden_stick"; durability = WEAPONS.wooden_stick.maxDurability;
      notes.push(`你抄起肉案旁的木棍逼開刀手，內力減${spent}。`);
    } else notes.push(`你借地形撞開對手的守勢，內力減${spent}。`);
  } else {
    const spent = Math.min(4, mp);
    mp -= spent;
    damage = 4 + (spent === 4 ? 2 : 0) + combat.opening;
    combat.enemyGuard = 0;
    combat.opening = spent === 4 ? 3 : 1;
    exposure = 1;
    notes.push(`你佯攻搶出破綻，內力減${spent}。`);
  }

  if ((code === "A" || code === "D") && weapon !== "fists") {
    durability = Math.max(0, durability - 1);
    if (durability === 0) {
      notes.push(`${WEAPONS[weapon].name}當場折斷。`);
      weapon = "fists";
    }
  }
  const dealt = Math.min(combat.enemyHp, damage);
  combat.enemyHp -= dealt;
  notes.push(`對手氣血減${dealt}。`);
  if (combat.enemyHp <= 0) {
    notes.push(combat.scenario === "arena" ? "對手倒退撞上圍欄，衛沉岳抬手止鬥。" : "刀手踉蹌倒地，肉檔前終於空出一條路。");
    return { combat, outcome: "won", event: notes.join(""), playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
  }

  if (combat.enemyIntent === "flank" && combat.allyPresent) {
    if (code === "B" || code === "C") notes.push("你截住刀手，陸千帆沒有再受傷。");
    else { combat.allyWounded = true; notes.push("刀手從側面劃開陸千帆的舊傷。"); }
  }
  const attack = combat.enemyIntent === "heavy" ? 9 : combat.enemyIntent === "press" ? 6 : combat.enemyIntent === "flank" ? 4 : combat.enemyIntent === "jab" ? 6 : 8;
  const taken = Math.min(hp, Math.max(0, attack + exposure - cover - combat.preparedDefense));
  hp -= taken;
  notes.push(`你氣血減${taken}。`);
  if (hp === 0 || combat.round >= 4) {
    notes.push(combat.scenario === "arena" ? "你已無力再戰，衛沉岳喝止對手。" : "刀手乘隙封住街口，這一仗已守不下去。");
    return { combat, outcome: "lost", event: notes.join(""), playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
  }
  combat.round += 1;
  combat.enemyIntent = intentAt(combat.scenario, combat.round, combat.allyPresent);
  notes.push(`${INTENT_WORDS[combat.enemyIntent]}。`);
  return { combat, outcome: "ongoing", event: notes.join(""), playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
}

export function trainMove(rank: number, mp: number, silver: number) {
  const level = Math.max(0, Math.min(3, Math.trunc(rank)));
  if (level >= 3) return { success: false, rank: level, mpCost: 0, silverCost: 0, reason: "這一招已練到眼下的極限。" };
  const mpCost = [4, 6, 8][level];
  const silverCost = [0, 10, 20][level];
  if (mp < mpCost) return { success: false, rank: level, mpCost: 0, silverCost: 0, reason: "你氣力不足，勉強運招只會傷身。" };
  if (silver < silverCost) return { success: false, rank: level, mpCost: 0, silverCost: 0, reason: `往上練須備${silverCost}文私銀買藥護傷，你一時拿不出來。` };
  return { success: true, rank: level + 1, mpCost, silverCost, reason: "" };
}
