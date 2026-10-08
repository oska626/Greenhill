import assert from "node:assert/strict";
import test from "node:test";
import { availableOptions, normalizeState, resolveTurn } from "../lib/game-engine.ts";
import { newRelationships } from "../lib/companion-relations.ts";
import { CHAPTER_OPENING, GRATITUDE_DUES, resolveChapterPetition } from "../lib/chapter-one.ts";
import { shouldCapturePrologueCheckpoint } from "../lib/prologue-checkpoint.ts";

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

test("evidence and a companion can restore dock logistics", () => {
  let turn = inspectAffected(calmToShortage().state);
  turn = choose(turn.state, "B");
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
  const won = choose(turn.state, "E");
  assert.equal(won.state.flags.chapterOne.result, "奪回碼頭");
  assert.match(won.event, /船工沿備好的水路接走/);
  assert.doesNotMatch(won.event, /同伴接住/);
});

test("a grounded F petition can gain conditional city intervention", () => {
  let turn = inspectAffected(calmToShortage().state);
  turn = choose(turn.state, "A");
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
  turn = choose(turn.state, "A");
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
