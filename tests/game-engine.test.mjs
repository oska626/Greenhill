import assert from "node:assert/strict";
import test from "node:test";
import { aptitude, availableOptions, PROLOGUE_LANDMARKS, normalizeState, OPENING_CITY_NARRATION, resolveTurn } from "../lib/game-engine.ts";
import { NPC_VOICES, hasSectAddressViolation, npcVoiceGuide, renameLegacyWorldNames, repeatedNpcLine, sectMemberAddress } from "../lib/npc-voices.ts";
import { createCombat, resolveCombatRound, trainMove } from "../lib/combat-engine.ts";
import { ENDING_OPTIONS, MISSIONS, guardLayersForLifeline, missionOptions, travelChoices } from "../lib/city-progression.ts";
import { companionLeads, newRelationships } from "../lib/companion-relations.ts";
import { PACKED_MEDICINE, USE_PACKED_MEDICINE } from "../lib/recovery.ts";
import { actionEnergyCost, FATIGUE_THRESHOLD, MAX_ENERGY } from "../lib/energy.ts";

function newGame() {
  const stats = aptitude("阿七", "賭坊收帳人", "察言觀色");
  return {
    turn: 1, playerName: "阿七", background: "賭坊收帳人", trait: "察言觀色",
    currentLocation: "青鋒堂總壇", inventory: ["【灌鉛假骰】"], maxInventory: 4,
    playerHp: stats.hp, maxHp: stats.hp, playerMp: stats.mp, maxMp: stats.mp,
    silver: 0, factionFunds: 10, sectLifeline: 60, worldFlags: [], relationships: newRelationships(),
    questStep: "prologue_briefing",
    flags: { tookHerbs: false, visitedYung: false, collectedMarketFee: false, marketAmbushTriggered: false },
  };
}

function finishCombat(turn) {
  for (let round = 0; round < 5 && turn.state.combat; round++) turn = resolveTurn(turn.state, turn.options[0], false);
  assert.equal(turn.state.combat, undefined, "combat must resolve within four rounds");
  return turn;
}

test("creation varies only health, while every background starts with fifty energy", () => {
  const builds = [
    ["賭坊收帳人", "察言觀色"], ["城西街童扒手", "手疾眼快"],
    ["落魄武館棄徒", "皮糙肉厚"], ["黑市醫道學徒", "辨毒識藥"],
    ["自定義市井流民", "使短刀"],
  ].map(([background, trait]) => aptitude("阿七", background, trait));
  assert.deepEqual(new Set(builds.map((stats) => stats.mp)), new Set([MAX_ENERGY]));
  assert.ok(new Set(builds.map((stats) => stats.hp)).size > 1);
  for (const stats of builds) {
    const opened = resolveTurn({ ...newGame(), maxHp: stats.hp, maxMp: stats.mp }, "[初入堂口] 阿七", true);
    assert.equal(opened.state.playerMp, MAX_ENERGY);
  }
});

test("older saves keep their energy ratio when normalized to the shared maximum", () => {
  const old = { ...newGame(), questStep: "sandbox", maxMp: 75, playerMp: 30, playerHp: 47 };
  const migrated = normalizeState(old);
  assert.equal(migrated.maxMp, MAX_ENERGY);
  assert.equal(migrated.playerMp, 20);
  assert.equal(migrated.playerHp, 47);
  assert.equal(normalizeState(migrated).playerMp, 20);
});

test("fatigue raises investigation cost, while exhaustion leaves basic action, travel and rest possible", () => {
  const base = { ...newGame(), questStep: "sandbox", currentLocation: "黑泥街", playerHp: 50, playerMp: FATIGUE_THRESHOLD, turn: 2 };
  const track = availableOptions(base).find((option) => option.includes("[盯梢]"));
  assert.equal(actionEnergyCost(base, track), 3);
  assert.equal(actionEnergyCost({ ...base, playerMp: FATIGUE_THRESHOLD + 1 }, track), 2);
  assert.equal(resolveTurn(base, track, false).state.playerMp, 7);

  const empty = { ...base, playerMp: 0 };
  assert.equal(availableOptions(empty).some((option) => option.includes("[盯梢]")), false);
  const talk = availableOptions(empty).find((option) => option.includes("[問張斷骨]"));
  const spoken = resolveTurn(empty, talk, false);
  assert.equal(spoken.state.playerHp, 48);
  assert.equal(spoken.state.playerMp, 0);
  const route = travelChoices(empty, "夜雨樓")[0];
  assert.equal(route.turns, 3);
  const travelled = resolveTurn(empty, route.label, false);
  assert.equal(travelled.state.currentLocation, "夜雨樓");
  assert.equal(travelled.state.turn, 5);
  assert.equal(travelled.state.playerHp, 44);
  const hall = { ...empty, currentLocation: "青鋒堂總壇" };
  const rested = resolveTurn(hall, availableOptions(hall)[0], false);
  assert.equal(rested.state.playerMp, 10);
  assert.equal(rested.state.playerHp, 50 + Math.ceil(hall.maxHp * 0.2));
});

test("fatigue adds two injury only when a combat hit lands", () => {
  const combat = createCombat("arena");
  const input = { combat, action: "A. [正面進擊]", playerHp: 80, playerMp: 10,
    weapon: "fists", weaponDurability: 0, knownMoves: {} };
  const normal = resolveCombatRound(input);
  const tired = resolveCombatRound({ ...input, fatigued: true });
  assert.equal(normal.playerMp, 9);
  assert.equal(tired.playerMp, 9);
  assert.equal(tired.playerHp, normal.playerHp - 2);
});

test("zero-energy combat keeps basic moves and invalid commands spend nothing", () => {
  const scene = { ...newGame(), questStep: "sandbox", currentLocation: "裂石擂",
    playerHp: 50, playerMp: 0, combat: createCombat("arena") };
  const options = availableOptions(scene);
  assert.equal(options.some((option) => option.startsWith("A. [正面進擊]")), true);
  assert.equal(options.some((option) => option.startsWith("C. [借地形]")), false);
  const fought = resolveTurn(scene, options[0], false);
  assert.equal(fought.state.playerMp, 0);
  assert.match(fought.event, /精力耗盡.*氣血減2/);
  const refused = resolveTurn(scene, "C. [借地形]", false);
  assert.equal(refused.state.turn, scene.turn);
  assert.equal(refused.state.playerHp, scene.playerHp);
  assert.equal(refused.state.playerMp, scene.playerMp);
});

test("opening gives each created background a concrete character detail", () => {
  const portraits = [
    ["賭坊收帳人", "察言觀色", "骰繭"],
    ["城西街童扒手", "手疾眼快", "後門"],
    ["落魄武館棄徒", "皮糙肉厚", "舊傷"],
    ["黑市醫道學徒", "辨毒識藥", "藥色"],
    ["自定義市井流民", "見風使舵", "何不歸的臉色"],
  ];
  for (const [background, trait, detail] of portraits) {
    const opening = resolveTurn({ ...newGame(), background, trait }, "[初入堂口] 阿七", true);
    assert.ok(opening.event.includes(detail), `${background} should show ${detail}`);
    assert.ok(opening.event.startsWith("你踩過城西泥巷"), "the player enters the hall after the city overview");
    assert.equal(opening.npcReply.speaker, "何不歸");
    assert.ok(opening.npcReply.line.includes("阿七，你"), `${background} needs He Bugui's assessment`);
    assert.ok(opening.npcReply.line.includes("陸千帆那道傷，是玄武樓的人砍的"));
    assert.ok(!opening.npcReply.line.includes("城南金冊莊"), "the city overview stays in narration");
    assert.ok(opening.npcReply.line.includes("黑泥街"));
    assert.ok(opening.npcReply.line.includes("五十文"));
    assert.ok(!opening.event.includes("打量你的出身"));
  }
});

test("opening narration names the five powers and their leaders", () => {
  for (const name of ["燕鎮嶽", "裴無鋒", "黃萬鈞", "何不歸", "玄渡"])
    assert.ok(OPENING_CITY_NARRATION.includes(name));
  assert.equal(OPENING_CITY_NARRATION.split("\n\n").length, 5, "the city introduction gives each region its own paragraph");
  assert.match(OPENING_CITY_NARRATION, /^明末年間/);
  assert.match(OPENING_CITY_NARRATION, /金冊莊莊主黃萬鈞/);
  assert.match(OPENING_CITY_NARRATION, /同門與街坊在此共存/);
});

test("custom opening turns profile details into He Bugui's judgement rather than a checklist", () => {
  const profiles = [
    { gender: "女", skill: "開鎖", personality: "多疑", address: "阿七姑娘", skillCue: "鎖眼", personalityCue: "防人" },
    { gender: "男子", skill: "使短刀", personality: "脾氣暴躁", address: "阿七兄弟", skillCue: "護人", personalityCue: "脾氣" },
    { gender: "非二元", skill: "辨藥", personality: "嘴硬心軟", address: "阿七", skillCue: "認得藥", personalityCue: "心軟" },
  ];
  for (const profile of profiles) {
    const state = normalizeState({ ...newGame(), background: "自定義市井流民", trait: profile.skill, ...profile });
    const opening = resolveTurn(state, "[初入堂口] 阿七", true);
    assert.equal(opening.state.gender, profile.gender);
    assert.equal(opening.state.skill, profile.skill);
    assert.equal(opening.state.personality, profile.personality);
    assert.ok(opening.npcReply.line.startsWith(profile.address));
    assert.ok(opening.npcReply.line.includes(profile.skillCue));
    assert.ok(opening.npcReply.line.includes(profile.personalityCue));
    assert.ok(!opening.npcReply.line.includes("性子"));
    assert.ok(opening.npcReply.line.includes("陸千帆"));
    assert.ok(opening.npcReply.line.includes("五十文"));
    assert.equal(opening.state.maxHp, aptitude("阿七", "自定義市井流民", profile.skill).hp);
  }
  assert.ok(aptitude("阿七", "自定義市井流民", "辨藥").hp < aptitude("阿七", "自定義市井流民", "摸鎖").hp);
  assert.ok(aptitude("阿七", "自定義市井流民", "摸鎖").hp < aptitude("阿七", "自定義市井流民", "使短刀").hp);
});

test("every sandbox choice has a distinct event and NPC reply", () => {
  for (const location of PROLOGUE_LANDMARKS) {
    const state = { ...newGame(), questStep: "sandbox", currentLocation: location, silver: 100, factionFunds: 100 };
    const options = resolveTurn(state, `F. [前往] ${location}`, false).options;
    const events = new Set();
    for (const option of options) {
      const turn = resolveTurn(state, option, false);
      assert.ok(!turn.event.includes("照自己的意思行事"), `${location}: ${option}`);
      assert.ok(turn.npcReply?.line, `${location}: ${option} needs a reply`);
      events.add(turn.event);
    }
    assert.equal(events.size, options.length, `${location} should react differently to each choice`);
  }
  const market = { ...newGame(), questStep: "sandbox", currentLocation: "黑泥街" };
  const injury = resolveTurn(market, "C. [找陸千帆] 問陸千帆傷勢。", false);
  assert.match(injury.event, /刀口卻未合/);
  assert.equal(injury.npcReply.speaker, "陸千帆");
});

test("tutorial choices advance one scene while preserving their different costs", () => {
  const opening = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  assert.equal(opening.state.turn, 1);
  assert.match(opening.npcReply.line, /苦煙館找顧忘生領止血膏藥.*黑泥街市集救陸千帆/);
  for (const prologue of opening.options) {
    const clinic = resolveTurn(opening.state, prologue, false);
    assert.equal(clinic.state.questStep, "kuyan_medicine");
    assert.equal(clinic.state.currentLocation, "苦煙館");
    assert.ok(!clinic.state.inventory.includes("【止血膏藥】"));
    for (const choice of clinic.options) {
      const market = resolveTurn(clinic.state, choice, false);
      assert.equal(market.state.questStep, "market_collection");
      assert.equal(market.state.currentLocation, "黑泥街");
      assert.ok(market.state.inventory.includes("【止血膏藥】"));
      assert.equal(market.state.flags.visitedGu, true);
      assert.equal(market.npcReply?.speaker, "顧忘生");
      for (const [index, marketChoice] of market.options.entries()) {
        const ambush = resolveTurn(market.state, marketChoice, false);
        assert.equal(ambush.state.questStep, "huizhi_ambush");
        assert.equal(ambush.state.factionFunds, market.state.factionFunds + [50, 50, 30, 20, 0][index]);
        assert.equal(ambush.state.flags.collectedMarketFee, index !== 4);
        assert.ok(!ambush.state.inventory.includes("【止血膏藥】"));
        const sandbox = finishCombat(ambush);
        assert.equal(sandbox.state.questStep, "sandbox");
        assert.equal(sandbox.state.currentLocation, "黑泥街");
      }
    }
  }
});

test("a save already at the tea stall can finish the old medicine route", () => {
  const saved = { ...newGame(), questStep: "yung_tea_stall", currentLocation: "晚秋茶寮",
    inventory: ["【生草藥包】"], flags: { ...newGame().flags, tookHerbs: true } };
  const restored = normalizeState(saved);
  const market = resolveTurn(restored, availableOptions(restored)[0], false);
  assert.equal(market.state.questStep, "market_collection");
  assert.ok(market.state.inventory.includes("【金創散】"));
});

test("early choices pay off during the ambush", () => {
  const opening = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  const direct = resolveTurn(opening.state, opening.options[0], false);
  const allowance = resolveTurn(opening.state, opening.options[1], false);
  assert.equal(direct.state.sectLifeline, opening.state.sectLifeline + 4);
  assert.equal(allowance.state.silver, 10);
  assert.equal(allowance.state.factionFunds, 0);

  const informed = resolveTurn(opening.state, opening.options[2], false);
  const ordinaryTea = resolveTurn(direct.state, direct.options[0], false);
  const informedTea = resolveTurn(informed.state, informed.options[0], false);
  const ordinaryMarket = resolveTurn(ordinaryTea.state, ordinaryTea.options[0], false);
  const informedMarket = resolveTurn(informedTea.state, informedTea.options[0], false);
  const ordinaryAmbush = resolveTurn(ordinaryMarket.state, ordinaryMarket.options[0], false);
  const informedAmbush = resolveTurn(informedMarket.state, informedMarket.options[0], false);
  assert.ok(informedAmbush.state.playerHp > ordinaryAmbush.state.playerHp);
  assert.ok(informedAmbush.state.worldFlags.includes("問清刀手兵刃"));
});

test("ambush tactics have distinct costs and a saved game receives current options", () => {
  const ambush = { ...newGame(), questStep: "huizhi_ambush", currentLocation: "黑泥街" };
  const outcomes = availableOptions(ambush).map((option) => resolveTurn(ambush, option, false));
  assert.equal(new Set(outcomes.map((result) => `${result.state.playerHp}:${result.state.playerMp}`)).size, 5);
  assert.ok(outcomes[4].state.worldFlags.includes("市集伏擊撤守"));
  assert.ok(outcomes[4].state.sectLifeline < ambush.sectLifeline);
  const restored = normalizeState({ ...ambush, questStep: "sandbox", worldFlags: ["張斷骨欠費三十文"] });
  assert.match(availableOptions(restored)[0], /追收張斷骨所欠30文/);
});

test("combat calculation is deterministic and guards a threatened ally", () => {
  const combat = createCombat("market_ambush", true);
  const base = { combat, playerHp: 100, playerMp: 50, weapon: "fists", weaponDurability: 0, knownMoves: {} };
  const first = resolveCombatRound({ ...base, action: "A. [正面進擊]" });
  const again = resolveCombatRound({ ...base, action: "A. [正面進擊]" });
  assert.deepEqual(first, again);
  assert.equal(combat.round, 1, "resolver must not mutate its input");
  assert.equal(first.outcome, "ongoing");
  const flank = resolveCombatRound({ ...base, combat: first.combat, action: "A. [正面進擊]" });
  const guarded = resolveCombatRound({ ...base, combat: first.combat, action: "B. [護住同門]" });
  assert.equal(flank.combat.allyWounded, true);
  assert.equal(guarded.combat.allyWounded, false);
  assert.ok(guarded.playerHp > flank.playerHp);
});

test("training, weapon purchase, and wear are settled by rules", () => {
  assert.deepEqual(trainMove(0, 4, 0), { success: true, rank: 1, mpCost: 4, silverCost: 0, reason: "" });
  assert.equal(trainMove(1, 5, 50).success, false);
  assert.equal(trainMove(1, 6, 9).success, false);
  assert.equal(trainMove(3, 50, 50).success, false);
  let hall = resolveTurn({ ...newGame(), questStep: "sandbox", silver: 50 }, "E. [習泥鰍步] 向堂主學保命步法。", false);
  assert.equal(hall.state.knownMoves.mud_step, 1);
  assert.equal(hall.state.playerMp, newGame().playerMp - 4);
  let arena = resolveTurn({ ...hall.state, currentLocation: "裂石擂" }, "B. [習裂石短拳] 向衛沉岳習拳。", false);
  assert.equal(arena.state.knownMoves.short_punch, 1);
  arena = resolveTurn(arena.state, "E. [整備兵器] 買刀。", false);
  assert.equal(arena.state.equippedWeapon, "rusty_knife");
  assert.equal(arena.state.silver, 10);
  assert.ok(arena.state.inventory.includes("【生鏽鐵刀】"));
  arena = resolveTurn(arena.state, arena.options[4], false);
  assert.equal(arena.state.equippedWeapon, "fists");
  assert.equal(arena.state.weaponDurability, 4);
  arena = resolveTurn(arena.state, arena.options[4], false);
  assert.equal(arena.state.equippedWeapon, "rusty_knife");
  assert.equal(arena.state.weaponDurability, 4);
  const breakable = { ...arena.state, combat: createCombat("arena"), weaponDurability: 1 };
  const strike = resolveTurn(breakable, "A. [正面進擊]", false);
  assert.equal(strike.state.equippedWeapon, "fists");
  assert.ok(!strike.state.inventory.includes("【生鏽鐵刀】"));
});

test("market choices create collectible debts instead of identical fees", () => {
  let turn = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, turn.options[0], false);
  const fees = [50, 50, 30, 20, 0];
  const outcomes = turn.options.map((option, index) => {
    const result = resolveTurn(turn.state, option, false);
    assert.equal(result.state.factionFunds, turn.state.factionFunds + fees[index]);
    return result;
  });
  assert.ok(outcomes[1].state.worldFlags.includes("陸千帆傷勢加重"));
  assert.ok(outcomes[2].state.worldFlags.includes("已察覺巷口伏兵"));
  assert.ok(outcomes[3].state.worldFlags.includes("張斷骨欠費三十文"));
  assert.ok(outcomes[4].state.worldFlags.includes("張斷骨規費未收"));
  for (const index of [2, 3, 4]) {
    let aftermath = finishCombat(outcomes[index]);
    assert.match(aftermath.options[0], /追收張斷骨所欠/);
    const before = aftermath.state.factionFunds;
    aftermath = resolveTurn(aftermath.state, aftermath.options[0], false);
    assert.equal(aftermath.state.factionFunds, before + 50 - fees[index]);
    assert.ok(aftermath.state.worldFlags.includes("張斷骨舊費已清"));
  }
});

test("sandbox clues improve later incidents and reading the dice matters", () => {
  const baseline = { ...newGame(), questStep: "sandbox", currentLocation: "鬼骰坊", turn: 5, silver: 20 };
  const read = resolveTurn(baseline, "B. [看盤] 觀察骰盤，尋找莊家的破綻。", false);
  assert.ok(read.state.worldFlags.includes("已看透骰局"));
  const wager = resolveTurn(read.state, "A. [押小] 押十文私銀賭一局。", false);
  assert.equal(wager.state.silver, 30);
  assert.ok(!wager.state.worldFlags.includes("已看透骰局"));

  for (const [incident, clue, option, expected] of [
    ["market_raid", "街面有備", "C. [設局取證] 記下刀手勒索攤販的證詞。", 2],
    ["market_raid", "擊退伏擊刀手", "C. [設局取證] 記下刀手勒索攤販的證詞。", 2],
    ["missing_ledger", "帳目有據", "A. [查賭檔] 到鬼骰坊核對缺失的規費帳。", 10],
    ["tainted_medicine", "傷藥有據", "A. [封存藥包] 封住來歷不明的傷藥。", 2],
    ["tainted_medicine", "辨清傷藥封口", "A. [封存藥包] 封住來歷不明的傷藥。", 2],
  ]) {
    const state = { ...newGame(), questStep: "sandbox", flags: { ...newGame().flags, pendingIncident: incident } };
    const plain = resolveTurn(state, option, false);
    const prepared = resolveTurn({ ...state, worldFlags: [clue] }, option, false);
    const plainValue = incident === "missing_ledger" ? plain.state.factionFunds : plain.state.sectLifeline;
    const preparedValue = incident === "missing_ledger" ? prepared.state.factionFunds : prepared.state.sectLifeline;
    assert.equal(preparedValue - plainValue, expected, `${clue} should change ${incident}`);
  }
});

test("private fee is personal money with a permanent consequence", () => {
  let turn = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, turn.options[0], false);
  const defenseBeforeTheft = turn.state.sectLifeline;
  turn = resolveTurn(turn.state, "F. [自訂手段] 私吞五十文規費", false);
  assert.equal(turn.state.silver, 50);
  assert.equal(turn.state.factionFunds, 10);
  assert.equal(turn.state.sectLifeline, defenseBeforeTheft - 10);
  assert.ok(turn.state.worldFlags.includes("私吞五十文規費"));
  assert.ok(turn.event.includes("五十文"));
});

test("betrayal and maiming alter later options and encounters", () => {
  let turn = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, "F. [自訂手段] 出賣陸千帆，打斷張斷骨右手", false);
  assert.ok(turn.state.worldFlags.includes("出賣陸千帆"));
  assert.ok(turn.state.worldFlags.includes("打斷張斷骨右手"));
  assert.ok(turn.state.inventory.includes("【止血膏藥】"));
  assert.ok(turn.options.every((option) => !option.includes("陸千帆")));
  assert.equal(turn.state.combat.allyPresent, false);
  turn = finishCombat(turn);
  turn = resolveTurn(turn.state, travelChoices(turn.state, "晚秋茶寮")[0].label, false);
  turn = resolveTurn(turn.state, turn.options[0], false);
  assert.ok(turn.state.worldFlags.includes("屠戶避讓"));
  assert.ok(turn.options.every((option) => !option.includes("找陸千帆")));
});

test("sandbox travel stays inside seven landmarks and resources have a ledger", () => {
  let turn = resolveTurn({ ...newGame(), questStep: "sandbox" }, "F. [前往] 裂石擂", false);
  assert.equal(turn.state.currentLocation, "裂石擂");
  const travelEarnings = turn.state.silver;
  turn = resolveTurn(turn.state, turn.options[0], false);
  assert.equal(turn.state.combat.scenario, "arena");
  turn = finishCombat(turn);
  assert.equal(turn.state.silver, travelEarnings + 20);
  assert.ok(turn.moneyNote.includes("私銀增加20文"));
  turn = resolveTurn(turn.state, "F. [前往] 晚秋茶寮", false);
  if (turn.state.flags.pendingIncident) turn = resolveTurn(turn.state, turn.options[0], false);
  if (turn.state.currentLocation !== "晚秋茶寮") turn = resolveTurn(turn.state, "F. [前往] 晚秋茶寮", false);
  const beforeMessage = turn.state.silver;
  turn = resolveTurn(turn.state, availableOptions(turn.state).find((option) => option.startsWith("A. [買消息]")), false);
  assert.equal(turn.state.silver, beforeMessage - 10);
  assert.ok(turn.moneyNote.includes("私銀減少10文"));
  for (const place of PROLOGUE_LANDMARKS) {
    if (turn.state.flags.pendingIncident) turn = resolveTurn(turn.state, turn.options[0], false);
    turn = resolveTurn(turn.state, `F. [前往] ${place}`, false);
    assert.equal(turn.state.currentLocation, place);
  }
  if (turn.state.flags.pendingIncident) turn = resolveTurn(turn.state, turn.options[0], false);
  const rejected = resolveTurn(turn.state, "F. [自訂手段] 前往城東玄武樓總壇", false);
  assert.equal(rejected.state.currentLocation, turn.state.currentLocation);
  const question = resolveTurn(turn.state, "F. [自訂手段] 問何不歸官府近況", false);
  assert.ok(!question.event.includes("城西邊界"));
  const naturalTravel = resolveTurn(turn.state, "F. [自訂手段] 走到晚秋茶寮", false);
  assert.equal(naturalTravel.state.currentLocation, "晚秋茶寮");
});

test("absurd custom actions lose health and malformed numeric state is normalized", () => {
  const state = normalizeState({ ...newGame(), silver: "999", factionFunds: Number.NaN, playerHp: "80" });
  assert.ok(state);
  assert.equal(state.silver, 0);
  assert.equal(state.factionFunds, 10);
  assert.equal(state.playerHp, state.maxHp);
  const turn = resolveTurn(state, "F. [自訂手段] 拿機關槍射擊", false);
  assert.equal(turn.state.playerHp, state.maxHp - 15);
});

test("sandbox incident follows the finished market ambush", () => {
  let turn = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  for (let index = 0; index < 3; index++) turn = resolveTurn(turn.state, turn.options[0], false);
  assert.equal(turn.state.questStep, "huizhi_ambush");
  turn = finishCombat(turn);
  assert.equal(turn.state.questStep, "sandbox");
  for (let index = 0; index < 4 && !turn.state.flags.pendingIncident; index++) turn = resolveTurn(turn.state, turn.options[2], false);
  assert.ok(turn.state.turn >= 8);
  assert.equal(turn.state.flags.pendingIncident, "market_raid");
  assert.match(turn.event, /插旗/);
  assert.match(turn.options[0], /護住攤販/);
  const settled = resolveTurn(normalizeState(turn.state), turn.options[0], false);
  assert.equal(settled.state.flags.pendingIncident, undefined);
  assert.ok(settled.state.worldFlags.includes("市集守住"));
  assert.match(settled.event, /街坊守住肉檔/);
  assert.match(settled.options[0], /巡街收規/);
});

test("later incidents change options and preserve resource consequences", () => {
  let state = { ...newGame(), turn: 12, questStep: "sandbox", silver: 20, factionFunds: 30 };
  state.flags = { ...state.flags, incidentCount: 1, lastIncidentTurn: 8 };
  let turn = resolveTurn(state, "C. [盤點] 清點堂口帳目。", false);
  assert.equal(turn.state.flags.pendingIncident, "missing_ledger");
  assert.match(turn.options[0], /查賭檔/);
  turn = resolveTurn(turn.state, turn.options[3], false);
  assert.equal(turn.state.factionFunds, 30);
  assert.equal(turn.state.silver, 10);
  assert.ok(turn.moneyNote.includes("私銀減少10文"));
  state = { ...turn.state, turn: 17 };
  turn = resolveTurn(state, "F. [前往] 晚秋茶寮", false);
  assert.equal(turn.state.flags.pendingIncident, "tainted_medicine");
  assert.match(turn.options[0], /封存藥包/);
  turn = resolveTurn(turn.state, turn.options[3], false);
  assert.equal(turn.state.silver, 0);
  assert.ok(turn.state.worldFlags.includes("可疑傷藥已處置"));
});

test("repeated inquiries acknowledge that no new lead was found", () => {
  const state = { ...newGame(), questStep: "sandbox", currentLocation: "晚秋茶寮", turn: 5, silver: 20 };
  const action = availableOptions(state).find((option) => option.startsWith("A. [買消息]"));
  let turn = resolveTurn(state, action, false);
  const firstReply = turn.npcReply.line;
  turn = resolveTurn(turn.state, action, false);
  assert.match(turn.event, /暫無新消息/);
  assert.notEqual(turn.npcReply.line, firstReply);
  assert.equal(turn.state.flags.repeatedActionCount, 1);
  assert.equal(turn.state.silver, 10);
});

test("an older sandbox save past turn eight receives the first incident on its next turn", () => {
  const oldSave = { ...newGame(), turn: 9, questStep: "sandbox" };
  const restored = normalizeState(oldSave);
  const turn = resolveTurn(restored, "C. [盤點] 清點堂口帳目。", false);
  assert.equal(turn.state.flags.pendingIncident, "market_raid");
  assert.match(turn.options[0], /護住攤販/);
});

test("older saves keep their location and consequences after the world rename", () => {
  const restored = normalizeState({
    ...newGame(), playerName: "何仔", questStep: "sandbox", currentLocation: "容姐茶檔",
    worldFlags: ["出賣域卡度", "打斷張屠戶右手", "何仔查出私吞"],
    flags: { ...newGame().flags, lastSandboxTag: "容姐茶檔:打探" },
  });
  assert.equal(restored.playerName, "何仔");
  assert.equal(restored.currentLocation, "晚秋茶寮");
  assert.deepEqual(restored.worldFlags, ["出賣陸千帆", "打斷張斷骨右手", "何不歸查出私吞"]);
  assert.equal(restored.flags.lastSandboxTag, "晚秋茶寮:打探");
  assert.equal(renameLegacyWorldNames("何仔叫我去容姐茶檔救域卡度。"), "何不歸叫我去晚秋茶寮救陸千帆。");
  const oldLocations = ["明心閣總壇", "容晚秋茶檔", "泥濘市集", "聚財坊", "黑市武館", "仙館", "怡紅院"];
  for (const [index, oldLocation] of oldLocations.entries()) {
    assert.equal(normalizeState({ ...newGame(), currentLocation: oldLocation }).currentLocation, PROLOGUE_LANDMARKS[index]);
  }
  assert.equal(renameLegacyWorldNames("明心閣與匯智樓爭地，青山資產管理坐收漁利。"),
    "青鋒堂與玄武樓爭地，金冊莊坐收漁利。");
  assert.equal(normalizeState({ ...newGame(), background: "濕鳩武館棄徒" }).background, "落魄武館棄徒");
  assert.equal(normalizeState({ ...newGame(), background: "爛賭收數佬" }).background, "賭坊收帳人");
  const ambush = normalizeState({ ...newGame(), questStep: "huizhi_ambush", worldFlags: ["出賣域卡度"] });
  assert.equal(ambush.combat.scenario, "market_ambush");
  assert.equal(ambush.combat.allyPresent, false);
});

test("named NPCs have distinct guidance and repeat replies", () => {
  const names = ["何不歸", "容晚秋", "陸千帆", "祁觀衡", "衛沉岳", "顧忘生", "柳照霜", "霍破陣", "張斷骨", "裴無鋒", "黃萬鈞", "燕鎮嶽", "玄渡"];
  assert.deepEqual(Object.keys(NPC_VOICES), names);
  assert.equal(new Set(names.map((name) => npcVoiceGuide(name))).size, names.length);
  assert.equal(new Set(names.map((name) => repeatedNpcLine(name, 1))).size, names.length);
  assert.match(npcVoiceGuide("衛沉岳"), /短句/);
  assert.match(npcVoiceGuide("祁觀衡"), /帳房/);
  assert.match(npcVoiceGuide("裴無鋒"), /何堂主.*黃大莊主.*城主大人.*主人/);
});

test("Rong Wanqiu only sells paid street intelligence and a Night Rain Tower shortcut", () => {
  const state = { ...newGame(), questStep: "sandbox", currentLocation: "晚秋茶寮", silver: 0 };
  const options = availableOptions(state).filter((option) => /^[A-E]\./.test(option));
  assert.equal(options.length, 2);
  assert.ok(options.every((option) => /買消息|買暗道/.test(option)));
  const message = options[0];
  const route = options[1];
  const refused = resolveTurn(state, message, false);
  assert.equal(refused.state.silver, 0);
  assert.equal(refused.state.worldFlags.includes("街面有備"), false);
  const paid = resolveTurn({ ...refused.state, silver: 10 }, message, false);
  assert.equal(paid.state.silver, 0);
  assert.equal(paid.state.worldFlags.includes("街面有備"), true);
  const repeated = resolveTurn(paid.state, availableOptions(paid.state).find((option) => option.startsWith("A. [買消息]")), false);
  assert.equal(repeated.state.silver, 0);
  assert.match(repeated.event, /沒有收你的錢/);
  const routeRefused = resolveTurn(state, route, false);
  assert.equal(routeRefused.state.worldFlags.includes("茶寮暗道已知"), false);
  const routePaid = resolveTurn({ ...state, silver: 15 }, route, false);
  assert.equal(routePaid.state.silver, 0);
  assert.equal(routePaid.state.worldFlags.includes("茶寮暗道已知"), true);
  assert.equal(travelChoices(routePaid.state, "夜雨樓").some((choice) => choice.kind === "shortcut"), true);
  const routeRepeated = resolveTurn(routePaid.state, availableOptions(routePaid.state).find((option) => option.startsWith("B. [買暗道]")), false);
  assert.equal(routeRepeated.state.silver, 0);
});

test("daily recovery costs one turn and follows each maximum", () => {
  const base = { ...newGame(), questStep: "sandbox", maxHp: 101, playerHp: 50,
    maxMp: 50, playerMp: 10, silver: 10 };
  const hall = resolveTurn(base, availableOptions(base)[0], false);
  assert.equal(hall.state.turn, base.turn + 1);
  assert.equal(hall.state.silver, 10);
  assert.equal(hall.state.playerHp, 71);
  assert.equal(hall.state.playerMp, 20);

  const clinic = { ...base, currentLocation: "苦煙館" };
  const paid = resolveTurn(clinic, availableOptions(clinic)[0], false);
  assert.equal(paid.state.turn, base.turn + 1);
  assert.equal(paid.state.silver, 0);
  assert.equal(paid.state.playerHp, 86);
  assert.equal(paid.state.playerMp, 28);

  const refused = resolveTurn({ ...clinic, silver: 9 }, availableOptions(clinic)[0], false);
  assert.equal(refused.state.silver, 9);
  assert.equal(refused.state.playerHp, 50);
  assert.equal(refused.state.playerMp, 10);

  const nearFull = { ...clinic, playerHp: 100, playerMp: 49 };
  const capped = resolveTurn(nearFull, availableOptions(nearFull)[0], false);
  assert.equal(capped.state.playerHp, 101);
  assert.equal(capped.state.playerMp, 50);

  const full = { ...clinic, playerHp: 101, playerMp: 50 };
  const unneeded = resolveTurn(full, availableOptions(full)[0], false);
  assert.equal(unneeded.state.silver, 10);
  assert.equal(unneeded.state.playerHp, 101);
  assert.equal(unneeded.state.playerMp, 50);

  for (const [currentLocation, tag] of [["黑泥街", "問張斷骨"], ["夜雨樓", "聽曲"]]) {
    const state = { ...base, currentLocation };
    const option = availableOptions(state).find((text) => text.includes(`[${tag}]`));
    const result = resolveTurn(state, option, false);
    assert.equal(result.state.playerHp, state.playerHp);
    assert.equal(result.state.playerMp, state.playerMp - 1);
  }
});

test("clinic medicine can be carried, consumes a slot, and heals when used", () => {
  const clinic = { ...newGame(), questStep: "sandbox", currentLocation: "苦煙館",
    playerHp: 50, playerMp: 10, silver: 20 };
  const buy = availableOptions(clinic).find((option) => option.includes("[買藥帶走]"));
  const stocked = resolveTurn(clinic, buy, false);
  assert.equal(stocked.state.silver, 10);
  assert.equal(stocked.state.inventory.includes(PACKED_MEDICINE), true);
  assert.equal(stocked.state.inventory.length, clinic.inventory.length + 1);
  assert.equal(stocked.state.playerHp, 50);
  assert.equal(stocked.options.includes(USE_PACKED_MEDICINE), true);
  const healed = resolveTurn(stocked.state, USE_PACKED_MEDICINE, false);
  assert.equal(healed.state.turn, stocked.state.turn + 1);
  assert.equal(healed.state.inventory.includes(PACKED_MEDICINE), false);
  assert.equal(healed.state.playerHp, 50 + Math.ceil(clinic.maxHp * 0.35));
  assert.equal(healed.state.playerMp, 9 + Math.ceil(clinic.maxMp * 0.35));

  const fullBag = { ...clinic, inventory: Array(clinic.maxInventory).fill("【雜物】") };
  const refused = resolveTurn(fullBag, buy, false);
  assert.equal(refused.state.silver, 20);
  assert.equal(refused.state.inventory.includes(PACKED_MEDICINE), false);
});

test("sect members call He Bugui 堂主 while outsiders may use his name", () => {
  assert.equal(sectMemberAddress("霍破陣", "何不歸，守住後面。"), "堂主，守住後面。");
  assert.equal(sectMemberAddress("裴無鋒", "何不歸，交出城西。"), "何不歸，交出城西。");
  assert.equal(hasSectAddressViolation("霍破陣：「何不歸，守住後面。」"), true);
  assert.equal(hasSectAddressViolation("霍破陣：「堂主，守住後面。」"), false);
  assert.equal(hasSectAddressViolation("你：「何不歸，請吩咐。」"), true);
  assert.equal(hasSectAddressViolation("裴無鋒：「何不歸，交出城西。」"), false);
  assert.match(npcVoiceGuide("陸千帆"), /只稱堂主/);
  assert.ok(availableOptions({ ...newGame(), questStep: "sandbox" }).some((option) => option.includes("問堂主")));
});

test("incident replies use the speaker involved in each branch", () => {
  const state = { ...newGame(), questStep: "sandbox", turn: 13, flags: { ...newGame().flags, pendingIncident: "missing_ledger" } };
  assert.equal(resolveTurn(state, "A. [查賭檔] 到鬼骰坊核對缺失的規費帳。", false).npcReply.speaker, "祁觀衡");
  assert.equal(resolveTurn(state, availableOptions(state)[1], false).npcReply.speaker, "容晚秋");
  assert.equal(resolveTurn(state, "E. [告知堂主] 把帳目破綻交給堂主處置。", false).npcReply.speaker, "何不歸");
});

test("legacy defense becomes sect lifeline and a member cannot spend public funds", () => {
  const legacy = { ...newGame(), hozaiDefense: 42 };
  delete legacy.sectLifeline;
  assert.equal(normalizeState(legacy).sectLifeline, 42);
  const poor = resolveTurn({ ...newGame(), questStep: "sandbox", factionFunds: 100 },
    "B. [捐銀固防] 捐二十文私銀入公帳，請何不歸安排固防。", false);
  assert.equal(poor.state.factionFunds, 100);
  assert.match(poor.event, /私銀不足/);
  const donor = resolveTurn({ ...newGame(), questStep: "sandbox", silver: 20 },
    "B. [捐銀固防] 捐二十文私銀入公帳，請何不歸安排固防。", false);
  assert.equal(donor.state.silver, 0);
  assert.equal(donor.state.factionFunds, 30);
  assert.equal(donor.state.sectLifeline, 69);
});

test("roads cost time and discovered shortcuts carry risk", () => {
  const state = { ...newGame(), questStep: "sandbox", turn: 2 };
  assert.equal(travelChoices(state, "黑泥街")[0].turns, 2);
  assert.equal(travelChoices(state, "黑泥街").length, 1);
  const discovered = { ...state, worldFlags: ["熟記市集暗巷"] };
  const shortcut = travelChoices(discovered, "黑泥街")[1];
  assert.equal(shortcut.turns, 1);
  const trip = resolveTurn(discovered, shortcut.label, false);
  assert.equal(trip.state.currentLocation, "黑泥街");
  assert.equal(trip.state.turn, 3);
  assert.equal(trip.state.playerHp, state.playerHp - 6);
  const roadTrip = resolveTurn(state, travelChoices(state, "黑泥街")[0].label, false);
  assert.equal(roadTrip.state.turn, 4);
  assert.equal(roadTrip.state.sectLifeline, 58);
});

test("every landmark mission pays once and careful work helps the finale", () => {
  assert.equal(MISSIONS.length, PROLOGUE_LANDMARKS.length);
  for (const mission of MISSIONS) {
    const origin = { ...newGame(), questStep: "sandbox", currentLocation: mission.origin };
    const offer = missionOptions(origin).find((option) => option.includes(mission.title));
    assert.ok(offer, mission.title);
    const accepted = resolveTurn(origin, offer, false);
    const target = { ...accepted.state, currentLocation: mission.target };
    const careful = missionOptions(target).find((option) => option.startsWith("G. [辦差]") && option.includes(mission.title));
    const done = resolveTurn(target, careful, false);
    assert.equal(done.state.silver, mission.pay);
    assert.ok(done.state.worldFlags.includes(mission.clue));
    assert.ok(!missionOptions(done.state).some((option) => option.includes(mission.title)));
  }
});

test("new martial arts alter existing combat actions", () => {
  const combat = createCombat("arena");
  const base = { combat, playerHp: 80, playerMp: 30, weapon: "fists", weaponDurability: 0, knownMoves: {} };
  const guard = resolveCombatRound({ ...base, action: "B. [沉身守勢]" });
  const parry = resolveCombatRound({ ...base, action: "B. [卸力手]", knownMoves: { soft_parry: 2 } });
  assert.ok(parry.combat.enemyHp < guard.combat.enemyHp);
  const feint = resolveCombatRound({ ...base, action: "D. [佯攻破綻]" });
  const point = resolveCombatRound({ ...base, action: "D. [辨穴陰招]", knownMoves: { point_strike: 2 } });
  assert.ok(point.combat.enemyHp < feint.combat.enemyHp);
});

test("zero lifeline opens a final choice and failed ending closes chapter access", () => {
  const prepared = { ...newGame(), questStep: "sandbox", turn: 69, sectLifeline: 1,
    worldFlags: MISSIONS.slice(0, 3).map((mission) => mission.clue) };
  const crisis = resolveTurn(prepared, "C. [盤點] 清點堂口帳目。", false);
  assert.equal(crisis.state.sectLifeline, 0);
  assert.equal(crisis.state.flags.finalCrisis, true);
  assert.equal(crisis.options.length, 3);
  const collapse = resolveTurn(crisis.state, crisis.options[0], false);
  assert.equal(collapse.state.flags.ending, "城西陷落");
  assert.match(collapse.event, /守街名冊/);
  assert.deepEqual(collapse.options, []);
  const repeated = resolveTurn(collapse.state, "A. [休整]", false);
  assert.equal(repeated.state.turn, collapse.state.turn);
  const lastStand = resolveTurn({ ...crisis.state, worldFlags: MISSIONS.map((mission) => mission.clue) }, crisis.options[0], false);
  assert.equal(lastStand.state.flags.ending, "守住城西");
});

test("high lifeline grants one guard layer per ten points from sixty", () => {
  const clues = MISSIONS.slice(0, 3).map((mission) => mission.clue);
  const endingAt = (lifeline) => resolveTurn({ ...newGame(), questStep: "sandbox", turn: 70, sectLifeline: lifeline,
    worldFlags: clues, flags: { ...newGame().flags, finalCrisis: true } }, ENDING_OPTIONS[0], false);
  const below = endingAt(59);
  const sixty = endingAt(60);
  assert.equal(below.state.flags.finalGuardLayers, 0);
  assert.equal(below.state.sectLifeline, 34);
  assert.equal(below.state.flags.ending, "城西陷落");
  assert.equal(sixty.state.flags.finalGuardLayers, 1);
  assert.equal(sixty.state.sectLifeline, 40);
  assert.equal(sixty.state.flags.ending, "守住城西");
  for (const [lifeline, layers] of [[59, 0], [60, 1], [69, 1], [70, 2], [79, 2],
    [80, 3], [90, 4], [100, 5]]) assert.equal(guardLayersForLifeline(lifeline), layers);
  assert.match(sixty.event, /守備1層抵銷5點/);
  assert.equal(endingAt(60).state.flags.finalSupport, 3);
  const extraHelp = resolveTurn({ ...newGame(), questStep: "sandbox", sectLifeline: 59,
    worldFlags: MISSIONS.slice(0, 4).map((mission) => mission.clue), flags: { ...newGame().flags, finalCrisis: true } },
  ENDING_OPTIONS[0], false);
  assert.equal(extraHelp.state.flags.ending, "守住城西");
  const cede = resolveTurn({ ...newGame(), questStep: "sandbox", sectLifeline: 60,
    flags: { ...newGame().flags, finalCrisis: true } }, ENDING_OPTIONS[1], false);
  assert.equal(cede.state.sectLifeline, 60);
  assert.equal(cede.state.flags.finalGuardLayers, undefined);
});

test("a multi-turn journey may pass turn seventy before the crisis opens", () => {
  const state = { ...newGame(), questStep: "sandbox", turn: 68, sectLifeline: 80 };
  const choice = travelChoices(state, "夜雨樓")[0];
  assert.equal(choice.turns, 3);
  const arrival = resolveTurn(state, choice.label, false);
  assert.equal(arrival.state.turn, 71);
  assert.equal(arrival.state.flags.finalCrisis, true);
});

test("saving Lu Qianfan changes trust, injury, and help in the prologue", () => {
  const scene = { ...newGame(), questStep: "market_collection", currentLocation: "黑泥街",
    inventory: ["【金創散】"] };
  const choices = availableOptions(scene);
  const first = choices.map((choice) => resolveTurn(scene, choice, false).state);
  assert.deepEqual(first.map((state) => state.relationships["陸千帆"].trust), [2, -2, 1, 1, 2]);
  assert.equal(first[1].relationships["陸千帆"].wounded, true);
  const guard = availableOptions(first[0]).find((option) => option.startsWith("B. [護住同門]"));
  assert.ok(guard);
  const guarded = resolveTurn(first[0], guard, false);
  assert.equal(guarded.state.relationships["陸千帆"].trust, 3);
  assert.ok(guarded.state.worldFlags.includes("伏擊中護住陸千帆"));
  const betrayed = resolveTurn(scene, "F. [自訂手段] 出賣陸千帆", false).state;
  assert.equal(betrayed.relationships["陸千帆"].estranged, true);
  assert.equal(betrayed.relationships["陸千帆"].trust, -3);
  assert.ok(!missionOptions({ ...betrayed, questStep: "sandbox", combat: undefined }).some((option) => option.includes("雙重勒索")));

  const trusted = { ...first[0], questStep: "sandbox", combat: undefined };
  const directions = availableOptions(trusted).find((option) => option.startsWith("M. [請陸千帆指路]"));
  assert.ok(directions);
  const guided = resolveTurn(trusted, directions, false);
  assert.ok(guided.state.worldFlags.includes("熟記市集暗巷"));
  assert.ok(!availableOptions(guided.state).some((option) => option.startsWith("M. [請陸千帆指路]")));

  const wounded = { ...first[1], questStep: "sandbox", combat: undefined, currentLocation: "苦煙館", silver: 10 };
  const medicine = availableOptions(wounded).find((option) => option.startsWith("M. [為陸千帆求藥]"));
  assert.ok(medicine);
  const healed = resolveTurn(wounded, medicine, false);
  assert.equal(healed.state.silver, 0);
  assert.equal(healed.state.relationships["陸千帆"].wounded, false);
  assert.equal(healed.state.relationships["陸千帆"].trust, -1);
});

test("landmark choices prepare different NPCs and survive old saves", () => {
  const complete = (missionId, careful) => {
    const mission = MISSIONS.find((item) => item.id === missionId);
    const origin = { ...newGame(), questStep: "sandbox", currentLocation: mission.origin };
    const accepted = resolveTurn(origin, missionOptions(origin).find((option) => option.includes(mission.title)), false);
    const target = { ...accepted.state, currentLocation: mission.target };
    const action = missionOptions(target).find((option) => option.includes(mission.title)
      && option.startsWith(careful ? "G. [辦差]" : "H. [速辦]"));
    return resolveTurn(target, action, false).state;
  };
  assert.equal(complete("missing_courier", true).relationships["容晚秋"].trust, 1);
  assert.equal(complete("missing_courier", false).relationships["容晚秋"].trust, -1);
  assert.equal(complete("arena_probe", true).relationships["衛沉岳"].trust, 1);
  const rushed = complete("arena_probe", false);
  assert.equal(rushed.relationships["衛沉岳"].trust, -1);
  assert.equal(rushed.relationships["霍破陣"].trust, 1);

  const old = { ...newGame(), relationships: undefined,
    worldFlags: ["先救陸千帆", "失蹤腳夫完成", "刀手進城路線"] };
  const restored = normalizeState(old);
  assert.equal(restored.relationships["陸千帆"].trust, 2);
  assert.equal(restored.relationships["容晚秋"].trust, 1);
  const crisis = { ...restored, questStep: "sandbox", flags: { ...restored.flags, finalCrisis: true } };
  const cede = resolveTurn(crisis, ENDING_OPTIONS[1], false);
  assert.deepEqual(cede.state.flags.prologueCompanionLeads, ["陸千帆", "容晚秋"]);
  assert.deepEqual(normalizeState(cede.state).flags.prologueCompanionLeads, ["陸千帆", "容晚秋"]);
  const flee = resolveTurn(crisis, ENDING_OPTIONS[2], false);
  assert.deepEqual(flee.state.flags.prologueCompanionLeads, []);
  assert.equal(flee.state.relationships["陸千帆"].trust, 2);
  const allies = newRelationships();
  allies["陸千帆"].trust = 2;
  allies["陸千帆"].wounded = true;
  assert.deepEqual(companionLeads(allies), []);
  allies["陸千帆"].wounded = false;
  assert.deepEqual(companionLeads(allies), ["陸千帆"]);
  allies["陸千帆"].estranged = true;
  assert.deepEqual(companionLeads(allies), []);
});

test("work, authorized debt collection, contracts, and lending keep accounts separate", () => {
  const market = { ...newGame(), questStep: "sandbox", currentLocation: "黑泥街", turn: 3 };
  const work = resolveTurn(market, "B. [搬貨] 替商販搬貨照料騾車；每隔三回合可賺六文私銀。", false);
  assert.equal(work.state.silver, 6);
  assert.equal(work.state.factionFunds, 10);
  const tooSoon = resolveTurn(work.state, "B. [搬貨] 替商販搬貨照料騾車；每隔三回合可賺六文私銀。", false);
  assert.equal(tooSoon.state.silver, 6);

  const debtBase = { ...newGame(), questStep: "sandbox", currentLocation: "鬼骰坊", worldFlags: ["假借據完成"] };
  const permit = resolveTurn(debtBase, availableOptions(debtBase).find((option) => option.startsWith("K. [領追債令]")), false);
  const collector = { ...permit.state, currentLocation: "黑泥街" };
  const collected = resolveTurn(collector, availableOptions(collector).find((option) => option.startsWith("K. [和談追債]")), false);
  assert.equal(collected.state.factionFunds, 25);
  assert.equal(collected.state.silver, 5);
  assert.ok(!availableOptions(collected.state).some((option) => option.includes("追債")));

  const qualified = { ...newGame(), questStep: "sandbox", currentLocation: "夜雨樓", turn: 4,
    knownMoves: { short_punch: 2 }, worldFlags: MISSIONS.slice(0, 3).map((mission) => `${mission.title}完成`) };
  const contract = resolveTurn(qualified, availableOptions(qualified).find((option) => option.startsWith("J. [接暗殺令]")), false);
  const ambush = { ...contract.state, currentLocation: "黑泥街" };
  const paid = resolveTurn(ambush, availableOptions(ambush).find((option) => option.startsWith("J. [執行暗殺令]")), false);
  assert.equal(paid.state.silver, 40);
  assert.equal(paid.state.factionFunds, 10);
  assert.ok(paid.state.worldFlags.includes("城東記恨暗殺"));

  const lender = { ...qualified, currentLocation: "鬼骰坊", silver: 20 };
  const loan = resolveTurn(lender, availableOptions(lender).find((option) => option.startsWith("J. [私銀放貸]")), false);
  assert.equal(loan.state.silver, 0);
  assert.equal(loan.state.factionFunds, 10);
  const due = { ...loan.state, turn: loan.state.flags.loanDueTurn, flags: { ...loan.state.flags, pendingIncident: undefined } };
  const repaid = resolveTurn(due, availableOptions(due).find((option) => option.startsWith("J. [收回私貸]")), false);
  assert.equal(repaid.state.silver, 26);
  assert.equal(repaid.state.factionFunds, 10);
});
