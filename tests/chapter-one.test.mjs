import assert from "node:assert/strict";
import test from "node:test";
import { availableOptions, normalizeState, resolveSocialIntent, resolveTurn } from "../lib/game-engine.ts";
import { newRelationships } from "../lib/companion-relations.ts";
import { CHAPTER_OPENING, GRATITUDE_DUES, MAX_LOST_LANDMARKS, RAID_UNREST_THRESHOLD, chapterPressureForecast, resolveChapterPetition } from "../lib/chapter-one.ts";
import { PACKED_MEDICINE, USE_PACKED_MEDICINE } from "../lib/recovery.ts";
import { shouldCapturePrologueCheckpoint } from "../lib/prologue-checkpoint.ts";
import { ENDING_OPTIONS, MISSIONS, ROAD_ADJACENCY, travelChoices } from "../lib/city-progression.ts";
import { inferSocialIntent } from "../lib/social-influence.ts";

function finished(ending = "守住城西") {
  return {
    turn: 70, playerName: "阿七", background: "賭坊收帳人", trait: "察言觀色",
    currentLocation: "青鋒堂總壇", inventory: [], maxInventory: 4,
    playerHp: 75, maxHp: 100, hpScaleVersion: 2, playerMp: 35, maxMp: 50,
    silver: 30, customActionUses: 0, factionFunds: 12, sectLifeline: 12,
    worldFlags: ["帳目有據", "刀手進城路線"], relationships: newRelationships(), questStep: "sandbox",
    flags: { tookHerbs: true, visitedYung: true, collectedMarketFee: true, marketAmbushTriggered: true,
      ending, finalCrisis: true, prologueCompanionLeads: ["容晚秋"] },
  };
}

function choose(state, letter) {
  const action = availableOptions(state).find((option) => option.startsWith(`${letter}.`));
  assert.ok(action, `${letter} should be offered`);
  return resolveTurn(state, action, false);
}

function chooseCompanion(state, name) {
  const action = availableOptions(state).find((option) => option.startsWith(`B. [選同伴：${name}]`));
  assert.ok(action, `${name} should be available`);
  return resolveTurn(state, action, false);
}

function travelTo(state, destination) {
  const action = availableOptions(state).find((option) => option === `F. [明路前往] 前往${destination}`);
  assert.ok(action, `${destination} should be reachable`);
  return resolveTurn(state, action, false);
}

function walkTo(state, destination) {
  for (let step = 0; step < 40; step++) {
    if (state.pendingEncounter) {
      state = resolveTurn(state, availableOptions(state)[0], false).state;
      continue;
    }
    if (state.flags.pendingIncident) {
      const local = availableOptions(state).find((option) => !option.includes("[明路前往]"));
      if (local) { state = resolveTurn(state, local, false).state; continue; }
    }
    if (state.currentLocation === destination && !state.flags.pendingIncident && !state.pendingEncounter) return state;
    const nextDestination = state.flags.pendingIncident === "market_raid" ? "黑泥街" : destination;
    const queue = [[state.currentLocation]];
    let path;
    while (queue.length) {
      const candidate = queue.shift();
      if (candidate.at(-1) === nextDestination) { path = candidate; break; }
      for (const next of ROAD_ADJACENCY[candidate.at(-1)] || [])
        if (!candidate.includes(next)) queue.push([...candidate, next]);
    }
    assert.ok(path, `No road from ${state.currentLocation} to ${nextDestination}`);
    state = travelTo(state, path[1]).state;
  }
  assert.equal(state.currentLocation, destination);
  return state;
}

function calmToShortage(state = finished()) {
  let turn = choose(state, "A");
  for (let i = 0; i < 3; i++) turn = choose(turn.state, "C");
  return turn;
}

function inspectAffected(state) {
  state = walkTo(state, state.flags.chapterOne.affectedBusiness);
  const letter = { 黑泥街: "A", 鬼骰坊: "B", 苦煙館: "C", 夜雨樓: "D" }[state.flags.chapterOne.affectedBusiness];
  const found = choose(state, letter);
  assert.equal(found.state.currentLocation, state.flags.chapterOne.affectedBusiness);
  assert.equal(found.state.flags.chapterOne.foundShortageLocation, true);
  state = walkTo(found.state, "青鋒堂總壇");
  return resolveTurn(state, availableOptions(state).find((option) => option.includes("[交斷貨帳]")), false);
}

test("only the successful prologue ending unlocks the authored chapter opening", () => {
  for (const ending of ["城西陷落", "割地求存", "獨自撤走"])
    assert.match(availableOptions(finished(ending))[0], /回顧結局/);
  const start = choose(finished(), "A");
  assert.equal(start.event, CHAPTER_OPENING);
  assert.match(start.event, /^你回到青鋒堂總壇/);
  assert.match(start.event, /裴無鋒始終沒有現身/);
  assert.equal(start.state.questStep, "chapter_one");
  assert.equal(start.state.flags.chapterOne.stage, "rest");
  assert.equal(start.state.factionFunds, 12 + GRATITUDE_DUES);
  assert.equal(start.state.flags.treasuryChange.reason, "市販自願加繳半個月規費");
  assert.equal(start.state.customActionUses, 2);
  assert.equal(availableOptions(start.state).length, 5);
  assert.equal(resolveTurn(start.state, "A. [踏入第一章]", false).state.factionFunds, start.state.factionFunds);
});

test("Edge Case: 瀕死狀態通關序章的狀態繼承", () => {
  const inventory = ["【行醫薄刃】", "【止血膏藥】"];
  const finalCrisis = normalizeState({ ...finished(), playerHp: 1, playerMp: 0,
    inventory, equippedWeapon: "medical_blade", weaponDurability: 2,
    sectLifeline: 50, worldFlags: MISSIONS.slice(0, 4).map((mission) => mission.clue),
    flags: { ...finished().flags, ending: undefined, finalCrisis: true, darkHandInitialized: true } });
  assert.equal(finalCrisis.turn, 70);
  assert.equal(finalCrisis.playerHp, 1);

  const ending = resolveTurn(finalCrisis, ENDING_OPTIONS[0], false);
  assert.equal(ending.state.flags.ending, "守住城西");
  assert.equal(ending.state.sectLifeline + ending.state.flags.finalSupport * 10, 65);
  assert.equal(ending.state.playerHp, 1);

  const startOption = availableOptions(ending.state).find((option) => option.includes("[踏入第一章]"));
  assert.ok(startOption);
  const chapter = resolveTurn(ending.state, startOption, false).state;
  assert.equal(chapter.questStep, "chapter_one");
  assert.equal(chapter.flags.chapterOne.stage, "rest");
  assert.equal(chapter.playerHp, 1);
  assert.equal(chapter.playerMp, 0);
  assert.deepEqual(chapter.inventory, inventory);
  assert.equal(chapter.equippedWeapon, "medical_blade");
  assert.equal(chapter.weaponDurability, 2);

  const reloaded = normalizeState(JSON.parse(JSON.stringify(chapter)));
  assert.equal(reloaded.playerHp, 1);
  assert.deepEqual(reloaded.inventory, inventory);
  assert.equal(reloaded.equippedWeapon, "medical_blade");
  assert.equal(reloaded.weaponDurability, 2);
});

test("chapter shortage draw replays from the same state", () => {
  const saved = finished();
  const first = choose(saved, "A");
  const replay = choose(JSON.parse(JSON.stringify(saved)), "A");
  assert.equal(first.state.flags.chapterOne.affectedBusiness, replay.state.flags.chapterOne.affectedBusiness);
});

test("three calm turns lead to a fixed saved business loss", () => {
  const shortage = calmToShortage();
  assert.equal(shortage.state.flags.chapterOne.stage, "shortage");
  assert.equal(shortage.state.flags.chapterOne.turns, 3);
  assert.equal(shortage.state.flags.chapterOne.deficitStreak, 1);
  assert.match(shortage.event, /玄武樓.*碼頭/);
  const restored = normalizeState(JSON.parse(JSON.stringify(shortage.state)));
  assert.equal(restored.flags.chapterOne.affectedBusiness, shortage.state.flags.chapterOne.affectedBusiness);
  const wrongPlace = ["黑泥街", "鬼骰坊", "苦煙館", "夜雨樓"].find((place) => place !== restored.flags.chapterOne.affectedBusiness);
  const wrongState = walkTo(restored, wrongPlace);
  const missed = choose(wrongState, { 黑泥街: "A", 鬼骰坊: "B", 苦煙館: "C", 夜雨樓: "D" }[wrongPlace]);
  assert.equal(missed.state.flags.chapterOne.stage, "shortage");
  const found = inspectAffected(missed.state);
  assert.equal(found.state.flags.chapterOne.stage, "dock");
  assert.match(found.event, /^你把.*斷貨帳拍在堂主桌上/);
  assert.ok(found.state.worldFlags.includes(`第一章${found.state.flags.chapterOne.affectedBusiness}斷貨已查`));
  assert.ok(found.state.sectLifeline < restored.sectLifeline, "three deficit turns damage lifeline");
});

test("shortage investigation requires presence and a road journey back to headquarters", () => {
  const shortage = calmToShortage().state;
  assert.equal(availableOptions(shortage).some((option) => /\[查(?:黑泥街|鬼骰坊|苦煙館|夜雨樓)\]/.test(option)), false);
  const onSite = walkTo(shortage, shortage.flags.chapterOne.affectedBusiness);
  const rejected = resolveTurn(onSite, "A. [交斷貨帳] 向堂主呈交斷貨帳", false);
  assert.equal(rejected.state.turn, onSite.turn);
  const action = availableOptions(onSite).find((option) => option.includes(`[查${shortage.flags.chapterOne.affectedBusiness}]`));
  assert.ok(action);
  const found = resolveTurn(onSite, action, false);
  assert.equal(found.state.currentLocation, shortage.flags.chapterOne.affectedBusiness);
  assert.equal(found.state.flags.chapterOne.stage, "shortage");
  assert.equal(found.state.flags.chapterOne.foundShortageLocation, true);
  const returned = walkTo(found.state, "青鋒堂總壇");
  assert.equal(returned.flags.chapterOne.stage, "shortage");
  assert.equal(choose(returned, "A").state.flags.chapterOne.stage, "dock");
});

test("chapter tea intelligence charges once and refuses an unfunded purchase", () => {
  const base = { ...calmToShortage().state, currentLocation: "晚秋茶寮", silver: 20 };
  const action = availableOptions(base).find((option) => option.includes("[買斷貨訊]"));
  assert.ok(action);
  const bought = resolveTurn(base, action, false);
  assert.equal(bought.state.silver, 10);
  assert.ok(bought.state.worldFlags.includes("第一章茶寮貨訊已買"));
  const repeated = resolveTurn(bought.state, action, false);
  assert.equal(repeated.state.silver, 10);
  const poor = resolveTurn({ ...base, silver: 5 }, action, false);
  assert.equal(poor.state.silver, 5);
  assert.match(poor.event, /私銀不足十文/);
});

test("chapter shortage retains missions and gives urgent incidents priority", () => {
  const base = calmToShortage().state;
  const mission = availableOptions(base).find((option) => option.includes("[領差] 守街名冊"));
  assert.ok(mission);
  const accepted = resolveTurn(base, mission, false);
  assert.ok(accepted.state.activeMissions.includes("roll_call"));
  const atMarket = walkTo(accepted.state, "黑泥街");
  const handoff = availableOptions(atMarket).find((option) => option.includes("[辦差] 守街名冊"));
  assert.ok(handoff);
  assert.ok(resolveTurn(atMarket, handoff, false).state.worldFlags.includes("同門守街名冊"));

  const urgent = { ...base, currentLocation: "晚秋茶寮", flags: { ...base.flags, pendingIncident: "tainted_medicine" } };
  const urgentOptions = availableOptions(urgent);
  assert.ok(urgentOptions.some((option) => option.includes("[封存藥包]")));
  assert.equal(urgentOptions.some((option) => option.includes("[買斷貨訊]")), false);
  const resolved = resolveTurn(urgent, urgentOptions.find((option) => option.includes("[封存藥包]")), false);
  assert.equal(resolved.state.flags.pendingIncident, undefined);
  assert.equal(resolved.state.flags.chapterOne.turns, urgent.flags.chapterOne.turns + 1);

  const ambushed = { ...base, currentLocation: "晚秋茶寮", pendingEncounter: "tea_tail" };
  assert.ok(availableOptions(ambushed).some((option) => option.includes("[繞路甩開]")));
  const encounter = resolveTurn(ambushed, availableOptions(ambushed)[0], false);
  assert.equal(encounter.state.pendingEncounter, undefined);
  assert.equal(encounter.state.flags.chapterOne.turns, ambushed.flags.chapterOne.turns + 1);
});

test("dock logistics enforce payment and expose a distinct solo approach", () => {
  const dock = inspectAffected(calmToShortage().state).state;
  const unfunded = { ...dock, factionFunds: 14 };
  const hire = availableOptions(unfunded).find((option) => option.includes("[僱船工]"));
  assert.ok(hire);
  const refused = resolveTurn(unfunded, hire, false);
  assert.equal(refused.state.factionFunds, 10);
  assert.equal(refused.state.flags.chapterOne.crewHired, false);
  assert.match(refused.event, /公款不足十五文/);
  const funded = resolveTurn({ ...dock, factionFunds: 30 }, hire, false);
  assert.equal(funded.state.factionFunds, 11);
  assert.equal(funded.state.flags.chapterOne.crewHired, true);

  const noSilver = { ...dock, silver: 9 };
  assert.equal(availableOptions(noSilver).some((option) => option.includes("[選同伴：容晚秋]")), false);
  const withSilver = { ...dock, silver: 10 };
  const rong = availableOptions(withSilver).find((option) => option.includes("[選同伴：容晚秋]"));
  assert.ok(rong);
  assert.equal(resolveTurn(withSilver, rong, false).state.silver, 0);

  const atDock = travelTo(dock, "碼頭").state;
  assert.ok(availableOptions(atDock).some((option) => option.includes("[隻身硬闖]")));
});

test("the dock unlocks as a chapter landmark and travel advances pressure and tribute", () => {
  assert.deepEqual(travelChoices(finished(), "碼頭"), []);
  assert.equal(normalizeState({ ...finished(), currentLocation: "碼頭" }).currentLocation, "青鋒堂總壇");
  const opening = choose(finished(), "A");
  assert.deepEqual(travelChoices(opening.state, "碼頭"), []);

  const found = inspectAffected(calmToShortage().state);
  assert.equal(found.state.currentLocation, "青鋒堂總壇");
  assert.equal(availableOptions(found.state).some((option) => option.startsWith("A. [查碼頭貨單]")), false);
  const route = travelChoices(found.state, "碼頭")[0];
  assert.equal(route.turns, 3);
  assert.equal(availableOptions(found.state).includes(route.label), true);
  const arrived = travelTo(found.state, "碼頭");
  assert.equal(arrived.state.currentLocation, "碼頭");
  assert.equal(arrived.state.turn, found.state.turn + 3);
  assert.equal(arrived.state.flags.chapterOne.turns, found.state.flags.chapterOne.turns + 3);
  assert.equal(arrived.state.playerMp, found.state.playerMp - 3);
  assert.equal(arrived.state.factionFunds, Math.max(0, found.state.factionFunds - 12));
  assert.equal(arrived.state.flags.chapterOne.tribute, found.state.flags.chapterOne.tribute);
  assert.equal(normalizeState(arrived.state).currentLocation, "碼頭");
  assert.equal(availableOptions(arrived.state).some((option) => option.startsWith("A. [查碼頭貨單]")), true);
  assert.equal(availableOptions(arrived.state).some((option) => option.startsWith("C. [僱船工]")), false);
  assert.equal(resolveChapterPetition(arrived.state, "我向城主呈上貨單與貢款帳，請他查玄武樓截貨碼頭").state.turn,
    arrived.state.turn);
  const returned = travelTo(arrived.state, "青鋒堂總壇");
  assert.equal(returned.state.currentLocation, "青鋒堂總壇");
  assert.equal(availableOptions(returned.state).some((option) => option.startsWith("C. [僱船工]")), true);
});

test("chapter-one rest restores twenty percent of both maximums", () => {
  const start = choose(finished(), "A");
  const rest = choose(start.state, "A");
  assert.equal(rest.state.turn, start.state.turn + 1);
  assert.equal(rest.state.playerHp, 95);
  assert.equal(rest.state.playerMp, 45);
});

test("one named companion is locked in and old multi-ally saves can choose again", () => {
  const state = { ...finished(), flags: { ...finished().flags,
    prologueCompanionLeads: ["陸千帆", "祁觀衡", "衛沉岳"] } };
  const start = choose(state, "A");
  const joined = chooseCompanion(start.state, "陸千帆");
  assert.equal(joined.state.flags.chapterOne.selectedCompanion, "陸千帆");
  assert.equal(joined.state.flags.chapterOne.allies, 1);
  assert.equal(joined.state.flags.chapterOne.dockRouteKnown, true);
  assert.equal(availableOptions(joined.state).some((option) => option.startsWith("B. [選同伴")), false);
  const old = { ...joined.state, flags: { ...joined.state.flags, chapterOne: {
    ...joined.state.flags.chapterOne, selectedCompanion: undefined, allies: 3 } } };
  const migrated = normalizeState(old);
  assert.equal(migrated.flags.chapterOne.selectedCompanion, undefined);
  assert.equal(migrated.flags.chapterOne.allies, 0);
  assert.equal(availableOptions(migrated).some((option) => option.startsWith("B. [選同伴：祁觀衡]")), true);
});

test("companions contribute different strengths and costs", () => {
  const leads = ["容晚秋", "祁觀衡", "衛沉岳", "霍破陣", "顧忘生", "柳照霜"];
  const startState = { ...finished(), flags: { ...finished().flags, prologueCompanionLeads: leads } };
  const start = choose(startState, "A");
  const rong = chooseCompanion(start.state, "容晚秋");
  assert.equal(rong.state.silver, start.state.silver - 10);
  assert.equal(rong.state.flags.chapterOne.dockRouteKnown, true);
  const rongShortage = choose(choose(rong.state, "C").state, "C");
  assert.match(rongShortage.event, new RegExp(rongShortage.state.flags.chapterOne.affectedBusiness));

  const qi = chooseCompanion(start.state, "祁觀衡");
  let qiTurn = choose(qi.state, "C");
  qiTurn = choose(qiTurn.state, "C");
  const qiEvidence = inspectAffected(qiTurn.state);
  assert.equal(qiEvidence.state.flags.chapterOne.evidence, 5);
  const qiDock = { ...qiEvidence.state, currentLocation: "碼頭", flags: { ...qiEvidence.state.flags, chapterOne: {
    ...qiEvidence.state.flags.chapterOne, evidence: 2, manifestFound: false } } };
  assert.equal(choose(qiDock, "A").state.flags.chapterOne.evidence, 4);

  const wei = chooseCompanion(start.state, "衛沉岳");
  assert.equal(wei.state.flags.chapterOne.dockRouteKnown, false);
  const huo = chooseCompanion(start.state, "霍破陣");
  assert.equal(huo.state.flags.chapterOne.allies, 1);

  const gu = chooseCompanion(start.state, "顧忘生");
  assert.equal(gu.state.flags.chapterOne.dockRouteKnown, false);
  const guDock = { ...gu.state, currentLocation: "碼頭", flags: { ...gu.state.flags, chapterOne: {
    ...gu.state.flags.chapterOne, stage: "dock", turns: 4, evidence: 2 } } };
  assert.equal(choose(guDock, "D").state.playerHp, gu.state.playerHp - 4);
  const liu = chooseCompanion(start.state, "柳照霜");
  assert.equal(liu.state.flags.chapterOne.dockRouteKnown, false);
});

test("Wei holds a failed charge while Huo can force a costly early victory", () => {
  const start = choose({ ...finished(), flags: { ...finished().flags,
    prologueCompanionLeads: ["衛沉岳", "霍破陣"] } }, "A");
  const dockState = (name) => ({ ...start.state, currentLocation: "碼頭", factionFunds: 40,
    flags: { ...start.state.flags, chapterOne: { ...start.state.flags.chapterOne,
      stage: "dock", turns: 4, evidence: 2, allies: 1, selectedCompanion: name,
      dockRouteKnown: false } } });
  const wei = choose(dockState("衛沉岳"), "E");
  assert.equal(wei.state.flags.chapterOne.stage, "dock");
  assert.equal(wei.state.playerHp, start.state.playerHp - 3);
  const huo = choose(dockState("霍破陣"), "E");
  assert.equal(huo.state.flags.chapterOne.result, "奪回碼頭");
  assert.match(huo.event, /貨箱撞裂/);
  assert.equal(huo.state.factionFunds, 40 + 8 - 6 - 4);
});

test("energy buys safer reconnaissance and a cleaner dock victory", () => {
  const start = choose(finished(), "A");
  const dockState = { ...start.state, currentLocation: "碼頭", factionFunds: 40,
    flags: { ...start.state.flags, chapterOne: { ...start.state.flags.chapterOne,
      stage: "dock", turns: 4, evidence: 3, dockRouteKnown: false } } };
  const cautious = choose(dockState, "D");
  const focusedScout = choose(dockState, "I");
  assert.equal(cautious.state.playerMp, dockState.playerMp - 2);
  assert.equal(focusedScout.state.playerMp, dockState.playerMp - 4);
  assert.equal(focusedScout.state.playerHp, cautious.state.playerHp + 4);

  const ready = { ...dockState, flags: { ...dockState.flags, chapterOne: {
    ...dockState.flags.chapterOne, dockRouteKnown: true } } };
  const hard = choose(ready, "E");
  const focused = choose(ready, "G");
  assert.equal(hard.state.flags.chapterOne.result, "奪回碼頭");
  assert.equal(focused.state.flags.chapterOne.result, "奪回碼頭");
  assert.equal(focused.state.playerMp, ready.playerMp - 6);
  assert.equal(hard.state.playerMp, ready.playerMp - 2);
  assert.equal(focused.state.playerHp, ready.playerHp);
  assert.equal(hard.state.playerHp, ready.playerHp - 4);
  assert.equal(focused.state.factionFunds, hard.state.factionFunds + 4);

  const exhausted = { ...ready, playerMp: 0 };
  assert.equal(availableOptions(exhausted).some((option) => option.startsWith("G.")), false);
  assert.equal(availableOptions({ ...dockState, playerMp: 0 }).some((option) => option.startsWith("I.")), false);
});

test("Liu can persuade the city with two grounded evidence points and paid tribute", () => {
  const start = choose({ ...finished(), flags: { ...finished().flags,
    prologueCompanionLeads: ["柳照霜"] } }, "A");
  const dock = { ...start.state, customActionUses: 1, factionFunds: 30,
    flags: { ...start.state.flags, chapterOne: { ...start.state.flags.chapterOne,
      stage: "dock", turns: 6, evidence: 2, allies: 1,
      selectedCompanion: "柳照霜", tribute: "pending" } } };
  const petition = "我向城主呈上貨單與貢款帳，請他查玄武樓截貨碼頭";
  const withoutLiu = structuredClone(dock);
  withoutLiu.flags.chapterOne.selectedCompanion = undefined;
  const heard = resolveChapterPetition(dock, petition);
  assert.equal(heard.state.flags.chapterOne.result, "城主有條件介入");
  const rejected = resolveChapterPetition(withoutLiu, petition);
  assert.equal(rejected.state.flags.chapterOne.result, undefined);
});

test("carried medicine remains usable during shortage and counts as a pressured turn", () => {
  const shortage = calmToShortage();
  const before = { ...shortage.state, inventory: [PACKED_MEDICINE], playerHp: 30, playerMp: 5 };
  const medicine = availableOptions(before).find((option) => option.startsWith("H. [服用療傷藥]"));
  assert.ok(medicine);
  const healed = resolveTurn(before, medicine, false);
  assert.equal(healed.state.turn, before.turn + 1);
  assert.equal(healed.state.playerHp, Math.min(before.maxHp, before.playerHp + 35));
  assert.equal(healed.state.playerMp, Math.min(before.maxMp, before.playerMp + 18));
  assert.equal(healed.state.inventory.includes(PACKED_MEDICINE), false);
  assert.equal(healed.state.factionFunds, before.factionFunds - 6);
  assert.equal(healed.state.flags.chapterOne.turns, before.flags.chapterOne.turns + 1);
});

test("the shortage and dock can recover at zero energy while public funds keep falling", () => {
  const shortage = { ...calmToShortage().state, playerMp: 0, playerHp: 40 };
  const recover = availableOptions(shortage).find((option) => option.startsWith("R. [總壇休養]"));
  assert.ok(recover);
  assert.equal(availableOptions(shortage).some((option) => option.startsWith("A. [查黑泥街]")), false);
  const rested = resolveTurn(shortage, recover, false);
  assert.equal(rested.state.playerMp, 10);
  assert.equal(rested.state.playerHp, 60);
  assert.equal(rested.state.factionFunds, shortage.factionFunds - 6);
  assert.equal(rested.state.flags.chapterOne.turns, shortage.flags.chapterOne.turns + 1);

  const dock = { ...rested.state, playerMp: 0, flags: { ...rested.state.flags,
    chapterOne: { ...rested.state.flags.chapterOne, stage: "dock", evidence: 3, dockRouteKnown: true } } };
  assert.equal(availableOptions(dock).some((option) => option.startsWith("G. [運勁奪港]")), false);
  const dockRest = choose(dock, "R");
  assert.equal(dockRest.state.playerMp, 10);
  assert.equal(dockRest.state.factionFunds, dock.factionFunds - 4);
});

test("chapter pressure forecast shows escalating unrest and tribute deadline", () => {
  const start = choose(finished(), "A");
  assert.deepEqual(chapterPressureForecast(start.state), { loss: 0, tributeIn: 7, tributeCost: 20, unrestGain: 0 });
  const afterTwo = choose(choose(start.state, "C").state, "C");
  assert.deepEqual(chapterPressureForecast(afterTwo.state), { loss: 6, tributeIn: 5, tributeCost: 20, unrestGain: 1 });
  const shortage = choose(afterTwo.state, "C");
  assert.deepEqual(chapterPressureForecast(shortage.state), { loss: 6, tributeIn: 4, tributeCost: 20, unrestGain: 1 });
});

test("hunger raises unrest, then crowds overrun landmarks without a fixed turn limit", () => {
  const start = inspectAffected(calmToShortage().state).state;
  const oldLongSave = structuredClone(start);
  oldLongSave.flags.chapterOne.turns = 30;
  assert.equal(normalizeState(oldLongSave).flags.chapterOne.stage, "dock");
  oldLongSave.flags.chapterOne.stage = "failed";
  oldLongSave.flags.chapterOne.result = "城西斷供";
  oldLongSave.worldFlags.push("第一章城西斷供");
  const revived = normalizeState(oldLongSave);
  assert.equal(revived.flags.chapterOne.stage, "dock");
  assert.equal(revived.flags.chapterOne.result, undefined);
  assert.equal(revived.worldFlags.includes("第一章城西斷供"), false);
  const beforeRaid = { ...start, flags: { ...start.flags, chapterOne: {
    ...start.flags.chapterOne, foodShortageDays: 7, unrest: RAID_UNREST_THRESHOLD - 2 } } };
  const raided = choose(beforeRaid, "C");
  assert.deepEqual(raided.state.flags.chapterOne.lostLandmarks, [start.flags.chapterOne.affectedBusiness]);
  assert.match(raided.event, /街坊等糧等不到/);
  assert.ok(raided.state.sectLifeline <= start.sectLifeline - 8);
  const saved = normalizeState(JSON.parse(JSON.stringify(raided.state)));
  assert.deepEqual(saved.flags.chapterOne.lostLandmarks, raided.state.flags.chapterOne.lostLandmarks);
});

test("dispatching guards costs funds and delays a crowd attack", () => {
  const start = inspectAffected(calmToShortage().state).state;
  const tense = { ...start, factionFunds: 30, flags: { ...start.flags, chapterOne: {
    ...start.flags.chapterOne, foodShortageDays: 7, unrest: RAID_UNREST_THRESHOLD - 2 } } };
  const guarded = choose(tense, "G");
  assert.equal(guarded.state.factionFunds, 30 - 8 - 4);
  assert.deepEqual(guarded.state.flags.chapterOne.lostLandmarks, []);
  assert.ok(guarded.state.flags.chapterOne.unrest < RAID_UNREST_THRESHOLD);
});

test("three lost landmarks end the chapter, including midway through travel", () => {
  const start = inspectAffected(calmToShortage().state).state;
  const doomed = { ...start, sectLifeline: 60, flags: { ...start.flags, chapterOne: {
    ...start.flags.chapterOne, foodShortageDays: 7, unrest: RAID_UNREST_THRESHOLD - 2,
    lostLandmarks: [start.flags.chapterOne.affectedBusiness, "晚秋茶寮"] } } };
  const loss = choose(structuredClone(doomed), "C");
  assert.equal(loss.state.flags.chapterOne.stage, "failed");
  assert.equal(loss.state.flags.chapterOne.result, "城西地標陷落");
  assert.equal(loss.state.flags.chapterOne.lostLandmarks.length, MAX_LOST_LANDMARKS);
  assert.match(availableOptions(loss.state)[0], /回顧結局/);
  const travelling = travelTo(structuredClone(doomed), "碼頭");
  assert.equal(travelling.state.currentLocation, "青鋒堂總壇");
  assert.equal(travelling.state.flags.chapterOne.stage, "failed");
  assert.match(travelling.event, /前路未到/);
});

test("restoring dock logistics wins even when unrest triggers a raid that turn", () => {
  const start = inspectAffected(calmToShortage().state).state;
  const ready = { ...start, currentLocation: "碼頭", sectLifeline: 60,
    flags: { ...start.flags, chapterOne: { ...start.flags.chapterOne,
      evidence: 3, dockRouteKnown: true, foodShortageDays: 7,
      unrest: RAID_UNREST_THRESHOLD - 2,
      lostLandmarks: ["晚秋茶寮", "裂石擂"] } } };
  const won = choose(ready, "E");
  assert.equal(won.state.flags.chapterOne.stage, "complete");
  assert.equal(won.state.flags.chapterOne.result, "奪回碼頭");
});

test("evidence and a companion can restore dock logistics", () => {
  let turn = inspectAffected(calmToShortage().state);
  turn = choose(turn.state, "B");
  turn = travelTo(turn.state, "碼頭");
  const won = choose(turn.state, "E");
  assert.equal(won.state.flags.chapterOne.stage, "complete");
  assert.equal(won.state.flags.chapterOne.result, "奪回碼頭");
  assert.ok(won.state.worldFlags.includes("第一章碼頭復航"));
  assert.equal(won.options.length, 1);
  assert.match(won.options[0], /回顧結局/);
  const recap = resolveTurn(won.state, won.options[0], false);
  assert.equal(recap.state.turn, won.state.turn);
  assert.match(recap.event, /奪回碼頭/);
});

test("a prepared water route restores the dock without inventing a companion", () => {
  const start = { ...finished(), flags: { ...finished().flags, prologueCompanionLeads: [] } };
  let turn = inspectAffected(calmToShortage(start).state);
  turn = choose({ ...turn.state, factionFunds: 40 }, "C");
  turn = travelTo(turn.state, "碼頭");
  const won = choose(turn.state, "E");
  assert.equal(won.state.flags.chapterOne.result, "奪回碼頭");
  assert.match(won.event, /船工沿備好的水路接走/);
  assert.doesNotMatch(won.event, /同伴接住/);
});

test("a grounded F petition can gain conditional city intervention", () => {
  let turn = inspectAffected(calmToShortage().state);
  turn = travelTo(turn.state, "碼頭");
  turn = choose(turn.state, "A");
  turn = travelTo(turn.state, "青鋒堂總壇");
  turn = choose(turn.state, "B");
  const before = turn.state.turn;
  const rejected = resolveChapterPetition(turn.state, "我不向城主呈交貨單",);
  assert.equal(rejected.state.turn, before);
  const heard = resolveChapterPetition(turn.state, "我向城主呈上貨單與貢款帳，請他查玄武樓截貨碼頭");
  assert.equal(heard.state.flags.chapterOne.tribute, "paid");
  assert.equal(heard.state.flags.chapterOne.result, "城主有條件介入");
  assert.ok(heard.state.worldFlags.includes("第一章城主介入復航"));
  assert.equal(heard.state.customActionUses, 2);
});

test("persuading dock workers costs pressured turns and can win voluntary support", () => {
  let scene = { ...travelTo(inspectAffected(calmToShortage().state).state, "碼頭").state, factionFunds: 40 };
  const firstText = "我同船工講：因為斷貨會令你哋家人挨餓，幫我守住糧藥。";
  const first = resolveSocialIntent(scene, inferSocialIntent(scene, firstText));
  assert.equal(first.state.flags.chapterOne.crewHired, false);
  assert.equal(first.state.flags.chapterOne.turns, scene.flags.chapterOne.turns + 1);
  scene = first.state;
  const secondText = "我同船工講：我願替你們守住跳板，請你們幫我運糧藥。";
  const second = resolveSocialIntent(scene, inferSocialIntent(scene, secondText));
  assert.equal(second.state.flags.chapterOne.crewHired, true);
  assert.equal(second.state.flags.chapterOne.dockRouteKnown, true);
  assert.ok(second.state.factionFunds < scene.factionFunds);
});

test("a persuaded dock guard can defect and reveal the watch route", () => {
  const arrived = travelTo(inspectAffected(calmToShortage().state).state, "碼頭").state;
  const scene = { ...arrived, socialMemory: { "碼頭守衛": { stance: "wary", beliefs: [],
    topics: { "defect:轉投玩家": { progress: 4, resistance: 0, tactics: ["evidence", "interest"],
      arguments: ["舊帳", "保命"], lastTurn: arrived.turn - 1 } } } } };
  const text = "我同碼頭守衛講：因為玄武樓斷糧也害了你的家，倒戈幫我把糧藥放行。";
  const turn = resolveSocialIntent(scene, inferSocialIntent(scene, text));
  assert.equal(turn.state.socialMemory["碼頭守衛"].stance, "ally");
  assert.equal(turn.state.flags.chapterOne.dockRouteKnown, true);
  assert.equal(turn.state.flags.chapterOne.evidence, arrived.flags.chapterOne.evidence + 1);
  assert.ok(turn.state.worldFlags.includes("碼頭守衛轉向玩家"));
});

test("a petition cites the evidence actually held in the save", () => {
  const start = { ...finished(), worldFlags: [] };
  let turn = inspectAffected(calmToShortage(start).state);
  turn = travelTo(turn.state, "碼頭");
  turn = choose(turn.state, "A");
  turn = travelTo(turn.state, "青鋒堂總壇");
  turn = choose(turn.state, "B");
  const heard = resolveChapterPetition(turn.state, "我向城主呈上貨單與貢款帳，請他查玄武樓截貨碼頭");
  assert.equal(heard.state.flags.chapterOne.result, "城主有條件介入");
  assert.match(heard.event, /船次與玄武樓報帳不符的證據/);
  assert.doesNotMatch(heard.event, /城東耳目線索/);
});

test("checkpoint is captured once after the first three incidents, before a crisis", () => {
  const before = { ...finished(), turn: 20, questStep: "sandbox", flags: { ...finished().flags,
    ending: undefined, finalCrisis: false, checkpointReady: true, midpointBriefed: false, lastIncidentTurn: 20 } };
  const action = availableOptions(before).find((option) => option.startsWith("O. [向堂主交代]"));
  assert.ok(action);
  const meeting = resolveTurn(before, action, false);
  const after = meeting.state;
  assert.equal(after.flags.midpointBriefed, true);
  assert.match(meeting.event, /何不歸為你倒了杯茶/);
  assert.equal(shouldCapturePrologueCheckpoint(before, after), true);
  assert.equal(shouldCapturePrologueCheckpoint({ ...before, flags: { ...before.flags, midpointBriefed: true } }, after), false);
  assert.equal(shouldCapturePrologueCheckpoint(before, { ...after, flags: { ...after.flags, finalCrisis: true } }), false);
});
