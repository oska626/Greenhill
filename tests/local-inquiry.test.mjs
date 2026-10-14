import assert from "node:assert/strict";
import test from "node:test";
import { normalizeState, resolveTurn, availableOptions } from "../lib/game-engine.ts";
import { newRelationships } from "../lib/companion-relations.ts";
import { resolveLocalInquiry } from "../lib/local-inquiry.ts";
import { hasOffSceneActionReference } from "../lib/custom-action.ts";

function scene(currentLocation = "青鋒堂總壇", questStep = "sandbox") {
  return normalizeState({ turn: 12, playerName: "阿七", background: "賭坊收帳人", trait: "察言觀色",
    currentLocation, questStep, inventory: [], maxInventory: 4, playerHp: 20, maxHp: 20,
    playerMp: 50, maxMp: 50, silver: 20, factionFunds: 10, sectLifeline: 60,
    worldFlags: [], relationships: newRelationships(), flags: {} });
}

test("local stranger questions work across single-speaker landmarks without invented results", () => {
  for (const [location, speaker] of [["青鋒堂總壇", "何不歸"], ["晚秋茶寮", "容晚秋"],
    ["鬼骰坊", "祁觀衡"], ["苦煙館", "顧忘生"], ["夜雨樓", "柳照霜"]]) {
    const before = scene(location);
    const result = resolveLocalInquiry(before, "「近排有冇生面口嘅人出沒?」");
    assert.ok(result, location);
    assert.equal(result.npcReply?.speaker, speaker);
    assert.equal(result.state.currentLocation, location);
    assert.equal(result.state.turn, before.turn + 1);
    assert.equal(result.state.playerMp, before.playerMp - 1);
    assert.equal(result.state.silver, before.silver);
    assert.equal(result.state.inventory.length, before.inventory.length);
    assert.equal(before.turn, 12);
  }
});

test("paid intelligence stays behind its price and ambiguous audiences need a target", () => {
  const tea = resolveLocalInquiry(scene("晚秋茶寮"), "「近排有冇生面口嘅人出沒?」");
  assert.match(tea.npcReply.line, /十文/);
  assert.equal(tea.state.silver, 20);
  assert.equal(tea.state.worldFlags.length, 0);
  for (const location of ["黑泥街", "裂石擂"]) {
    const before = scene(location);
    const result = resolveLocalInquiry(before, "「近排有冇生面口嘅人出沒?」");
    assert.match(result.event, /同時開鑼；想問哪一位/);
    assert.equal(result.state.turn, before.turn);
    assert.equal(result.state.playerMp, before.playerMp);
  }
  const named = resolveLocalInquiry(scene("裂石擂"), "我問霍破陣近排有冇生面口上擂？");
  assert.equal(named.state.turn, 13);
  assert.doesNotMatch(named.event, /同時開鑼/);
});

test("asking to borrow medicine at the clinic gets a price without a free item", () => {
  const before = scene("苦煙館");
  const words = "「可唔可以借我一包藥?」";
  assert.equal(hasOffSceneActionReference(before, words), false);
  assert.equal(hasOffSceneActionReference(before, "「可唔可以借我一包藥?」然後拿起木棍"), true);
  const result = resolveLocalInquiry(before, words);
  assert.match(result.npcReply.line, /十文/);
  assert.equal(result.state.silver, before.silver);
  assert.deepEqual(result.state.inventory, before.inventory);
  assert.equal(result.state.turn, before.turn + 1);
  const tutorial = scene("苦煙館", "kuyan_medicine");
  const missionReply = resolveLocalInquiry(tutorial, words);
  assert.match(missionReply.npcReply.line, /止血膏藥備好/);
  assert.equal(missionReply.state.currentLocation, "苦煙館");
  assert.equal(missionReply.state.inventory.length, tutorial.inventory.length);
});

test("an exact free-form inquiry follows the existing option's clue rules", () => {
  const before = scene("苦煙館");
  const result = resolveLocalInquiry(before, "我問顧忘生黑市傳聞");
  assert.ok(result.state.worldFlags.includes("傷藥有據"));
  assert.equal(result.state.currentLocation, "苦煙館");
  assert.equal(result.state.history.at(-1).action, "F. [自訂手段] 我問顧忘生黑市傳聞");
});

test("tutorial information questions stay in the scene and keep established clue flags", () => {
  const hall = scene("青鋒堂總壇", "prologue_briefing");
  const asked = resolveLocalInquiry(hall, "「刀手用咩兵刃?」");
  assert.equal(asked.state.currentLocation, "青鋒堂總壇");
  assert.equal(asked.state.questStep, "prologue_briefing");
  assert.ok(asked.state.worldFlags.includes("問清刀手兵刃"));
  const tea = scene("晚秋茶寮", "yung_tea_stall");
  const askedTea = resolveLocalInquiry(tea, "「有冇生面口嘅刀手?」");
  assert.equal(askedTea.state.currentLocation, "晚秋茶寮");
  assert.ok(askedTea.state.worldFlags.includes("認清刀手裝束"));
});

test("hypotheticals, negated questions, unrelated requests and chained acts are not swallowed", () => {
  const before = scene("苦煙館");
  for (const text of ["如果近排有生面口出沒會點?", "我唔問有冇可疑客人",
    "「可唔可以借我把刀?」", "我問顧忘生有冇陌生客，順手攞走藥瓶",
    "「有冇生面口？」然後偷藥", "「你點睇我?」"]) {
    assert.equal(resolveLocalInquiry(before, text), null, text);
  }
});

test("chapter questions advance chapter pressure instead of becoming free information", () => {
  const ended = { ...scene(), questStep: "sandbox", turn: 70,
    flags: { ending: "守住城西", finalCrisis: true } };
  const first = resolveTurn(ended, availableOptions(ended)[0], false).state;
  assert.equal(first.questStep, "chapter_one");
  const result = resolveLocalInquiry(first, "「近排有冇生面口嘅人出沒?」");
  assert.equal(result.state.turn, first.turn + 1);
  assert.equal(result.state.flags.chapterOne.turns, first.flags.chapterOne.turns + 1);
  assert.equal(resolveLocalInquiry({ ...first, flags: { ...first.flags, pendingIncident: "market_raid" } },
    "「近排有冇生面口嘅人出沒?」"), null);
  const dock = normalizeState({ ...first, currentLocation: "碼頭", flags: { ...first.flags,
    chapterOne: { ...first.flags.chapterOne, stage: "dock" } } });
  const ambiguous = resolveLocalInquiry(dock, "「近排有冇生面口嘅人出沒?」");
  assert.match(ambiguous.event, /船工、碼頭守衛/);
  assert.equal(ambiguous.state.turn, dock.turn);
  const named = resolveLocalInquiry(dock, "我問船工近排有冇生面口喺碼頭出沒？");
  assert.equal(named.npcReply.speaker, "船工");
  assert.equal(named.state.turn, dock.turn + 1);
});
