import assert from "node:assert/strict";
import test from "node:test";
import { availableOptions, normalizeState, resolveTurn } from "../lib/game-engine.ts";
import { newRelationships } from "../lib/companion-relations.ts";
import { CHAPTER_OPENING, GRATITUDE_DUES, MAX_LOST_LANDMARKS, RAID_UNREST_THRESHOLD, chapterPressureForecast, resolveChapterPetition } from "../lib/chapter-one.ts";
import { PACKED_MEDICINE, USE_PACKED_MEDICINE } from "../lib/recovery.ts";
import { shouldCapturePrologueCheckpoint } from "../lib/prologue-checkpoint.ts";
import { travelChoices } from "../lib/city-progression.ts";

function finished(ending = "守住城西") {
  return {
    turn: 70, playerName: "阿七", background: "賭坊收帳人", trait: "察言觀色",
    currentLocation: "青鋒堂總壇", inventory: [], maxInventory: 4,
    playerHp: 75, maxHp: 100, playerMp: 35, maxMp: 50,
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
  const action = availableOptions(state).find((option) => option.startsWith(`F. [明路前往] ${destination}（`));
  assert.ok(action, `${destination} should be reachable`);
  return resolveTurn(state, action, false);
}

function calmToShortage(state = finished()) {
  let turn = choose(state, "A");
  for (let i = 0; i < 3; i++) turn = choose(turn.state, "C");
  return turn;
}

function inspectAffected(state) {
  const letter = { 黑泥街: "A", 鬼骰坊: "B", 苦煙館: "C", 夜雨樓: "D" }[state.flags.chapterOne.affectedBusiness];
  return choose(state, letter);
}

test("only the successful prologue ending unlocks the authored chapter opening", () => {
  for (const ending of ["城西陷落", "割地求存", "獨自撤走"])
    assert.deepEqual(availableOptions(finished(ending)), []);
  const start = choose(finished(), "A");
  assert.equal(start.event, CHAPTER_OPENING);
  assert.equal(start.state.questStep, "chapter_one");
  assert.equal(start.state.factionFunds, 12 + GRATITUDE_DUES);
  assert.equal(start.state.flags.treasuryChange.reason, "市販自願加繳半個月規費");
  assert.equal(start.state.customActionUses, 2);
  assert.equal(availableOptions(start.state).length, 5);
  assert.equal(resolveTurn(start.state, "A. [踏入第一章]", false).state.factionFunds, start.state.factionFunds);
});

test("three calm turns lead to a fixed saved business loss", () => {
  const shortage = calmToShortage();
  assert.equal(shortage.state.flags.chapterOne.stage, "shortage");
  assert.equal(shortage.state.flags.chapterOne.turns, 3);
  assert.equal(shortage.state.flags.chapterOne.deficitStreak, 1);
  assert.match(shortage.event, /玄武樓.*碼頭/);
  const restored = normalizeState(JSON.parse(JSON.stringify(shortage.state)));
  assert.equal(restored.flags.chapterOne.affectedBusiness, shortage.state.flags.chapterOne.affectedBusiness);
  const wrong = ["A", "B", "C", "D"].find((letter) => letter !== {
    黑泥街: "A", 鬼骰坊: "B", 苦煙館: "C", 夜雨樓: "D",
  }[restored.flags.chapterOne.affectedBusiness]);
  const missed = choose(restored, wrong);
  assert.equal(missed.state.flags.chapterOne.stage, "shortage");
  const found = inspectAffected(missed.state);
  assert.equal(found.state.flags.chapterOne.stage, "dock");
  assert.ok(found.state.worldFlags.includes(`第一章${found.state.flags.chapterOne.affectedBusiness}斷貨已查`));
  assert.ok(found.state.sectLifeline < restored.sectLifeline, "three deficit turns damage lifeline");
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
  assert.equal(arrived.state.factionFunds, found.state.factionFunds - 12 - 20);
  assert.equal(arrived.state.flags.chapterOne.tribute, "paid");
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
  assert.equal(wei.state.playerHp, start.state.playerHp - 5);
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
  assert.equal(availableOptions(before).includes(USE_PACKED_MEDICINE), true);
  const healed = resolveTurn(before, USE_PACKED_MEDICINE, false);
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
  assert.equal(raided.state.sectLifeline, start.sectLifeline - 8 - 3);
  const saved = normalizeState(JSON.parse(JSON.stringify(raided.state)));
  assert.deepEqual(saved.flags.chapterOne.lostLandmarks, raided.state.flags.chapterOne.lostLandmarks);
});

test("dispatching guards costs funds and delays a crowd attack", () => {
  const start = inspectAffected(calmToShortage().state).state;
  const tense = { ...start, flags: { ...start.flags, chapterOne: {
    ...start.flags.chapterOne, foodShortageDays: 7, unrest: RAID_UNREST_THRESHOLD - 2 } } };
  const guarded = choose(tense, "G");
  assert.equal(guarded.state.factionFunds, start.factionFunds - 8 - 4);
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
  assert.deepEqual(availableOptions(loss.state), []);
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
  assert.deepEqual(won.options, []);
});

test("a prepared water route restores the dock without inventing a companion", () => {
  const start = { ...finished(), flags: { ...finished().flags, prologueCompanionLeads: [] } };
  let turn = inspectAffected(calmToShortage(start).state);
  turn = choose(turn.state, "C");
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
  assert.equal(heard.state.customActionUses, 1);
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
  const after = resolveTurn(before, action, false).state;
  assert.equal(after.flags.midpointBriefed, true);
  assert.equal(shouldCapturePrologueCheckpoint(before, after), true);
  assert.equal(shouldCapturePrologueCheckpoint({ ...before, flags: { ...before.flags, midpointBriefed: true } }, after), false);
  assert.equal(shouldCapturePrologueCheckpoint(before, { ...after, flags: { ...after.flags, finalCrisis: true } }), false);
});
