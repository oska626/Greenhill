import { dirtyHandOptionMove, dirtyHandVerb, type DarkHandItem, type DirtyHandTier } from "./dirty-hand.ts";
import type { SceneAttempt } from "./custom-action.ts";

export const WEAPONS = {
  fists: { name: "徒手", power: 0, maxDurability: 0 },
  wooden_stick: { name: "案邊木棍", power: 2, maxDurability: 2 },
  rusty_knife: { name: "生鏽鐵刀", power: 4, maxDurability: 4 },
  captured_knife: { name: "奪來短刀", power: 3, maxDurability: 3 },
} as const;

export type WeaponId = keyof typeof WEAPONS;
export type MoveId = "mud_step" | "short_punch" | "soft_parry" | "point_strike";
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
  background?: string;
  armGuard?: boolean;
  fatigued?: boolean;
  weapon: WeaponId;
  weaponDurability: number;
  knownMoves: KnownMoves;
  canTakeStick?: boolean;
  terrainObject?: "厚砧板" | "懸肉鐵鉤" | "剁骨刀";
  dirtyHand?: { item: DarkHandItem; tier: DirtyHandTier; guaranteed: boolean };
  disarmAttempt?: boolean;
  canCarryKnife?: boolean;
  freeAttempt?: SceneAttempt;
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

export function combatOptions(combat: CombatState, weapon: WeaponId, knownMoves: KnownMoves, mp: number, canTakeStick = true,
  darkHand?: DarkHandItem): string[] {
  const shortPunch = weapon === "fists" && (knownMoves.short_punch || 0) > 0 && mp >= 4;
  const mudStep = (knownMoves.mud_step || 0) > 0 && mp >= 3;
  const softParry = (knownMoves.soft_parry || 0) > 0 && mp >= 3;
  const pointStrike = (knownMoves.point_strike || 0) > 0 && mp >= 4;
  const atMarket = combat.scenario === "market_ambush";
  const blow = atMarket ? "刀" : "拳";
  const terrain = atMarket
    ? weapon === "fists" && canTakeStick
      ? "抄起案邊木棍橫掃下盤；逼刀手挪步，自己也得貼近刀口"
      : "蹬住肉案斜身撞去；撞亂刀手守位，也把側腹送到刀前"
    : "扯住擂台圍繩借力；撞亂對手腳步，也得防他反手一拳";
  const approach = weapon === "rusty_knife" || weapon === "captured_knife"
    ? "提刀貼身搶攻；刀口要見血，肋下也敞給對手"
    : weapon === "wooden_stick"
      ? `掄起木棍直砸；逼他架住這一棍，自己也可能吃${blow}`
      : `搶步欺身硬撼；拳頭換他一記重手，自己也可能吃${blow}`;
  return [
    shortPunch ? "A. [裂石短拳] 短拳直搗肋下；逼他退步，拳收慢便露空門。"
      : `A. [正面進擊] ${approach}。`,
    softParry && mudStep ? "B. [泥鰍卸力] 錯步讓開來勢，反手卸他一臂；守住身位再搶半步。"
      : softParry ? "B. [卸力手] 貼住來勢撥開臂肘；護住身位，回手直取胸口。"
      : mudStep ? "B. [泥鰍步] 腳下一滑避開正鋒；護住肋下，回身撞他肩頭。"
      : combat.allyPresent ? "B. [護住同門] 橫身卡在陸千帆前頭；替他接住刀勢，寸步不讓。"
        : `B. [沉身守勢] 收肘護住肋下；硬接他這一${blow}，等他手慢半拍。`,
    `C. [借地形] ${terrain}。`,
    pointStrike ? "D. [辨穴陰招] 指尖直探臂肘關節；撬開守勢，下一手才有狠處。"
      : `D. [佯攻破綻] 賣個空門誘他搶攻；下一手照破綻打，自己也得防回${blow}。`,
    combat.allyPresent ? "E. [護人撤離] 架起陸千帆撞入巷口；留得殘命，街口拱手讓人。"
      : atMarket ? "E. [抽身退走] 擦著刀口退入窄巷；命保住，肉檔街口拱手讓人。"
        : "E. [抽身退走] 翻過圍欄滾下擂台；賞錢留給對手，拳腳還追著背影。",
    ...(darkHand && mp >= 1 ? [`I. [袖藏暗手] ${dirtyHandOptionMove(darkHand)}；賭他一瞬失位，落空便吃迎面反擊。`] : []),
    ...(darkHand && mp >= 2 ? [`J. [全力陰手] 拼著掛彩也要${dirtyHandOptionMove(darkHand)}；逼他失位讓路，自己仍可能見血。`] : []),
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

  if (input.dirtyHand) {
    mp = Math.max(0, mp - (input.dirtyHand.guaranteed ? 2 : 1));
    const move = dirtyHandVerb(input.dirtyHand.item);
    const enemy = combat.scenario === "arena" ? "對手" : "刀手";
    const retreat = combat.scenario === "arena" ? "翻過圍欄退出擂台" : "帶人撤進巷口";
    if (input.dirtyHand.tier !== "failed") {
      const great = input.dirtyHand.tier === "great";
      if (!great) hp = Math.max(1, hp - 2);
      return { combat, outcome: "fled", event: great
        ? `你${move}，${enemy}遮眼失步；你趁空檔${retreat}。`
        : `你${move}，${enemy}亂了一步，反手仍劃中你；你${retreat}。`,
        playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
    }
    hp = Math.max(1, hp - 6);
    if (combat.round >= 4) return { combat, outcome: "lost", event: `你${move}，卻被${enemy}架開；${combat.scenario === "arena" ? "你被打下擂台" : "街口失守"}。`,
      playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
    combat.round += 1;
    combat.enemyIntent = intentAt(combat.scenario, combat.round, combat.allyPresent);
    return { combat, outcome: "ongoing", event: `你${move}，${enemy}識破手勢，逼得你後退。${INTENT_WORDS[combat.enemyIntent]}。`,
      playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
  }

  if (input.disarmAttempt && combat.scenario === "market_ambush") {
    const used = Math.min(2, mp);
    mp -= used;
    hp = Math.max(0, hp - 2 * (2 - used));
    const leverage = combat.opening + combat.preparedDefense
      + (input.knownMoves.short_punch ? 1 : 0)
      + (input.background === "落魄武館棄徒" ? 1 : 0)
      - (combat.enemyIntent === "slash" ? 1 : 0);
    const protectedHit = combat.round === 1 && input.armGuard ? 1 : 0;
    const successWound = 2 + (input.fatigued ? 2 : 0) - protectedHit;
    if (leverage >= 3 && hp > successWound) {
      hp -= successWound;
      combat.enemyHp = 0;
      weapon = input.canCarryKnife ? "captured_knife" : "fists";
      durability = weapon === "captured_knife" ? WEAPONS.captured_knife.maxDurability : 0;
      return { combat, outcome: "won", event: input.canCarryKnife
        ? "你趁刀手露空門扣住腕骨，挨了一記肘撞才扭下短刀。同夥見他失刃，退進暗巷。"
        : "你趁刀手露空門扣住腕骨，挨了一記肘撞將短刀甩到肉案下。同夥退進暗巷。",
        playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
    }
    hp = Math.max(0, hp - (4 + (input.fatigued ? 2 : 0) - protectedHit));
    combat.opening = 0;
    if (hp === 0 || combat.round >= 4) return { combat, outcome: "lost",
      event: "你空手搶腕，刀手翻刃割開你的手，逼你跪進泥裡。街口失守。",
      playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
    combat.round += 1;
    combat.enemyIntent = intentAt(combat.scenario, combat.round, combat.allyPresent);
    return { combat, outcome: "ongoing",
      event: `你空手搶腕，刀手抽刃割開你的手；刀仍在他掌中。${INTENT_WORDS[combat.enemyIntent]}。`,
      playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
  }

  if (input.freeAttempt && combat.scenario === "market_ambush") {
    const attempt = input.freeAttempt;
    const spent = Math.min(mp, attempt.effect === "harm" || attempt.effect === "seize" ? 2 : 1);
    mp -= spent;
    let opening = combat.opening;
    let cover = combat.preparedDefense;
    let damage = 0;
    const tool = attempt.object ? `借${attempt.object}` : "徒手";
    const gesture = attempt.gesture ? `你試著${attempt.gesture}` : `你${tool}向${attempt.target}動手`;
    let event = "";
    if (attempt.effect === "harm") {
      damage = Math.max(1, 3 + opening + (attempt.object ? 1 : 0) - combat.enemyGuard);
      combat.opening = 0;
      event = `${gesture}，碰到刀手身上，卻也露出肋下。`;
    } else if (attempt.effect === "disrupt" || attempt.effect === "seize") {
      combat.opening = Math.min(3, opening + (attempt.object ? 2 : 1));
      combat.enemyGuard = Math.max(0, combat.enemyGuard - 1);
      event = `${gesture}，逼得刀手移開半步；兵刃仍在他手上。`;
    } else if (attempt.effect === "protect") {
      cover += attempt.object ? 3 : 2;
      combat.preparedDefense = Math.min(5, combat.preparedDefense + 1);
      event = `${gesture}，你卡住刀勢，身後的人暫時得以退半步。`;
    } else if (attempt.effect === "move") {
      cover += 1;
      combat.opening = Math.min(3, opening + 1);
      event = `${gesture}，只搶出半步身位，刀手仍堵在街口。`;
    } else {
      combat.opening = Math.min(3, opening + 1);
      event = `${gesture}，看清刀手下一步，卻沒能叫他停刀。`;
    }
    combat.enemyHp -= Math.min(combat.enemyHp, damage);
    if (combat.enemyHp <= 0) return { combat, outcome: "won", event: `${event}刀手跌進肉案，同夥退入暗巷。`,
      playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
    const attack = combat.enemyIntent === "flank" ? 3 : combat.enemyIntent === "press" ? 4 : 4;
    const exposure = attempt.effect === "harm" || attempt.effect === "seize" ? 2 : 0;
    const wound = Math.max(0, attack + exposure - cover + (input.fatigued ? 1 : 0) - (input.armGuard && combat.round === 1 ? 1 : 0));
    hp = Math.max(0, hp - wound);
    if (combat.enemyIntent === "flank" && combat.allyPresent && attempt.effect !== "protect") combat.allyWounded = true;
    if (hp === 0 || combat.round >= 4) return { combat, outcome: "lost", event: `${event}刀手反手劃中你，街口失守。`,
      playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
    combat.round += 1;
    combat.enemyIntent = intentAt(combat.scenario, combat.round, combat.allyPresent);
    return { combat, outcome: "ongoing", event: `${event}${wound ? "刀鋒擦過皮肉。" : "刀鋒落空。"}${INTENT_WORDS[combat.enemyIntent]}。`,
      playerHp: hp, playerMp: mp, weapon, weaponDurability: durability };
  }

  const spendBasicEnergy = () => {
    if (mp > 0) { mp -= 1; notes.push("精力減一。"); }
    else { const before = hp; hp = Math.max(1, hp - 2); notes.push(`精力耗盡，你勉強應對，氣血減${before - hp}。`); }
  };

  if (code === "E") {
    spendBasicEnergy();
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
    if (rank) { mp -= 4; damage = 8 + rank * 3 + combat.opening; notes.push("你將衛沉岳教的短拳送進對手空門，精力減四。"); }
    else { spendBasicEnergy(); damage = 8 + WEAPONS[weapon].power + combat.opening; notes.push(weapon === "fists" ? "你迎面揮拳，直取對手門戶。" : `你持${WEAPONS[weapon].name}迎面進擊。`); }
    if (weapon === "fists" && input.background === "落魄武館棄徒") damage += 2;
    exposure = 2;
    damage = Math.max(1, damage - combat.enemyGuard);
    combat.opening = 0;
  } else if (code === "B") {
    const softRank = mp >= 3 ? Math.max(0, Math.min(3, input.knownMoves.soft_parry || 0)) : 0;
    const rank = mp >= 3 ? Math.max(0, Math.min(3, input.knownMoves.mud_step || 0)) : 0;
    if (softRank && rank) { mp -= 3; cover = 7 + rank; damage = 2 + softRank * 2; notes.push("你踏出泥鰍步，再以卸力手化開來勢，精力減三。"); }
    else if (softRank) { mp -= 3; cover = 6 + softRank; damage = 2 + softRank * 2; notes.push("你以柳照霜教的卸力手化開來勢，精力減三。"); }
    else if (rank) { mp -= 3; cover = 7 + rank; damage = 1 + rank; notes.push("你側身踏出何不歸教的泥鰍步，精力減三。"); }
    else { spendBasicEnergy(); cover = 6; damage = 1; notes.push(combat.allyPresent ? "你守住陸千帆身前的空隙。" : "你沉身護住肋下。"); }
    damage = Math.max(0, damage - combat.enemyGuard);
    combat.enemyGuard = Math.max(0, combat.enemyGuard - 1);
  } else if (code === "C") {
    const spent = Math.min(2, mp);
    mp -= spent;
    damage = 3 + (spent === 2 ? 2 : 0);
    cover = 2;
    combat.enemyGuard = 0;
    if (combat.scenario === "market_ambush" && input.terrainObject === "厚砧板") {
      cover += 2;
      notes.push(`你合力推歪厚砧板擋住刀勢，精力減${spent}。`);
    } else if (combat.scenario === "market_ambush" && input.terrainObject === "懸肉鐵鉤") {
      hp = Math.max(1, hp - 1);
      damage += 1;
      notes.push(`你扯住懸肉鐵鉤撥開刀口，掌心被鏽尖劃破，精力減${spent}。`);
    } else if (combat.scenario === "market_ambush" && input.terrainObject === "剁骨刀") {
      hp = Math.max(1, hp - 3);
      notes.push(`你迎著張斷骨的刀口強奪剁骨刀，手背見血，只搶出半步空檔，精力減${spent}。`);
    } else if (combat.scenario === "market_ambush" && weapon === "fists" && input.canTakeStick !== false) {
      weapon = "wooden_stick"; durability = WEAPONS.wooden_stick.maxDurability;
      notes.push(`你抄起肉案旁的木棍逼開刀手，精力減${spent}。`);
    } else notes.push(`你借地形撞開對手的守勢，精力減${spent}。`);
  } else {
    const spent = Math.min(4, mp);
    mp -= spent;
    const rank = spent === 4 ? Math.max(0, Math.min(3, input.knownMoves.point_strike || 0)) : 0;
    damage = 4 + (spent === 4 ? 2 : 0) + combat.opening + rank * 2;
    combat.enemyGuard = 0;
    combat.opening = spent === 4 ? 3 + rank : 1;
    exposure = rank ? 0 : 1;
    notes.push(rank ? `你照祁觀衡所教點破對手穴位，精力減四。` : `你佯攻搶出破綻，精力減${spent}。`);
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
  const attack = combat.enemyIntent === "heavy" ? 5 : combat.enemyIntent === "press" ? 4 : combat.enemyIntent === "flank" ? 3 : 4;
  const normalInjury = Math.max(0, attack + exposure - cover - combat.preparedDefense);
  const taken = Math.min(hp, Math.max(0, normalInjury + (normalInjury > 0 && input.fatigued ? 2 : 0)
    - (combat.round === 1 && input.armGuard && normalInjury > 0 ? 1 : 0)));
  const fatigueInjury = taken - Math.min(hp, normalInjury);
  hp -= taken;
  if (fatigueInjury > 0) notes.push(`精力不足，招架慢了半拍，傷勢多${fatigueInjury}點。`);
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
