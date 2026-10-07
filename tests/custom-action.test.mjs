import assert from "node:assert/strict";
import test from "node:test";
import { availableOptions, normalizeState, resolveTurn } from "../lib/game-engine.ts";
import { newRelationships } from "../lib/companion-relations.ts";
import { validateCustomDecision } from "../lib/custom-action.ts";

function state() {
  return {
    turn: 4, playerName: "阿七", background: "賭坊收帳人", trait: "察言觀色",
    currentLocation: "黑泥街", inventory: ["【金創散】"], maxInventory: 4,
    playerHp: 100, maxHp: 100, playerMp: 50, maxMp: 50,
    silver: 0, factionFunds: 10, sectLifeline: 60, worldFlags: [], relationships: newRelationships(),
    questStep: "market_collection",
    flags: { tookHerbs: true, visitedYung: true, collectedMarketFee: false, marketAmbushTriggered: false },
  };
}

test("negation and hypothetical wording cannot authorize irreversible acts", () => {
  const scene = state();
  const raw = { kind: "special", specials: ["betray"] };
  assert.equal(validateCustomDecision(raw, scene, availableOptions(scene), "我唔會出賣陸千帆，反而護住佢").kind, "reject");
  assert.equal(validateCustomDecision(raw, scene, availableOptions(scene), "如果我出賣陸千帆會點？").kind, "reject");
  const affirmative = validateCustomDecision(raw, scene, availableOptions(scene), "我出賣陸千帆");
  assert.equal(affirmative.kind, "special");
  const direct = resolveTurn(scene, "F. [自訂手段] 我唔會出賣陸千帆", false);
  assert.ok(!direct.state.worldFlags.includes("出賣陸千帆"));
});

test("custom interpretation remains inside the current scene", () => {
  const scene = { ...state(), questStep: "sandbox", inventory: [], currentLocation: "黑泥街" };
  const options = availableOptions(scene);
  assert.equal(validateCustomDecision({ kind: "option", option: "不存在的選項" }, scene, options, "隨便做").kind, "reject");
  assert.equal(validateCustomDecision({ kind: "creative", goal: "查線索", anchor: "肉案" }, scene, options, "翻肉案底查刀痕").kind, "creative");
  assert.equal(validateCustomDecision({ kind: "creative", goal: "交涉", anchor: "肉案" }, scene, options, "同肉案商量").kind, "reject");
  assert.equal(validateCustomDecision({ kind: "creative", goal: "查線索", anchor: "手機" }, scene, options, "用手機查").kind, "reject");
  const estranged = { ...scene, relationships: newRelationships() };
  estranged.relationships["陸千帆"].estranged = true;
  assert.equal(validateCustomDecision({ kind: "creative", goal: "交涉", anchor: "陸千帆" }, estranged, options, "同陸千帆交涉").kind, "reject");
});

test("a grounded creative action has bounded one-time consequences", () => {
  const scene = { ...state(), questStep: "sandbox", inventory: [] };
  const action = "F. [自訂手段] 翻肉案底查刀痕";
  const first = resolveTurn(scene, action, false, { goal: "查線索", anchor: "肉案" });
  assert.equal(first.state.sectLifeline, 61);
  assert.ok(first.state.worldFlags.includes("黑泥街機變查線索"));
  const second = resolveTurn(first.state, action, false, { goal: "查線索", anchor: "肉案" });
  assert.equal(second.state.sectLifeline, 60);
  assert.match(second.event, /沒有新的收穫/);
});

test("a creative action leaves one saved echo that pays off two turns later", () => {
  const scene = { ...state(), questStep: "sandbox", inventory: [], customActionUses: 2 };
  const first = resolveTurn(scene, "F. [自訂手段] 翻肉案底查刀痕", false, { goal: "查線索", anchor: "肉案" });
  assert.equal(first.state.flags.customEchoes.length, 1);
  assert.equal(first.state.flags.customEchoes[0].dueTurn, first.state.turn + 2);
  const saved = normalizeState(JSON.parse(JSON.stringify(first.state)));
  assert.deepEqual(saved.flags.customEchoes, first.state.flags.customEchoes);
  const second = resolveTurn(saved, "D. [盯梢] 留意玄武樓眼線。", false);
  assert.equal(second.state.flags.customEchoes.length, 1);
  const third = resolveTurn(second.state, "D. [盯梢] 留意玄武樓眼線。", false);
  assert.match(third.event, /早前從黑泥街的肉案查到破綻/);
  assert.equal(third.state.flags.customEchoes.length, 0);
  assert.ok(third.state.worldFlags.includes("黑泥街機變查線索已兌現"));
  const fourth = resolveTurn(third.state, "D. [盯梢] 留意玄武樓眼線。", false);
  assert.doesNotMatch(fourth.event, /早前從黑泥街的肉案/);
});

test("creative echoes can repay work or expose a delayed counterattack", () => {
  const scene = { ...state(), questStep: "sandbox", inventory: [], customActionUses: 2 };
  const work = resolveTurn(scene, "F. [自訂手段] 替攤販搬肉案", false, { goal: "做工", anchor: "攤販" });
  const workDue = resolveTurn({ ...work.state, turn: work.state.turn + 1 }, "D. [盯梢] 留意玄武樓眼線。", false);
  assert.equal(workDue.state.silver, 6);
  assert.match(workDue.event, /補付兩文私銀/);
  const distract = resolveTurn(scene, "F. [自訂手段] 借後巷牽制眼線", false, { goal: "牽制", anchor: "後巷" });
  const distractDue = resolveTurn({ ...distract.state, turn: distract.state.turn + 1 }, "D. [盯梢] 留意玄武樓眼線。", false);
  assert.match(distractDue.event, /眼線回頭試探堂口/);
  assert.equal(distractDue.state.flags.customEchoes.length, 0);
});

test("unresolved creative echoes do not leak past the prologue crisis", () => {
  const scene = { ...state(), questStep: "sandbox", inventory: [], turn: 68,
    flags: { ...state().flags, lastIncidentTurn: 68 } };
  const first = resolveTurn(scene, "F. [自訂手段] 翻肉案底查刀痕", false, { goal: "查線索", anchor: "肉案" });
  assert.equal(first.state.flags.customEchoes.length, 1);
  const crisis = resolveTurn(first.state, "D. [盯梢] 留意玄武樓眼線。", false);
  assert.equal(crisis.state.turn, 70);
  assert.equal(crisis.state.flags.finalCrisis, true);
  assert.equal(crisis.state.flags.customEchoes.length, 0);
});

test("custom action charges start at two, spend only on a settled F turn, and can be bought with private silver", () => {
  const fresh = state();
  assert.equal(resolveTurn(fresh, "A. [先救同門]", false).state.customActionUses, 2);
  assert.equal(normalizeState({ ...fresh, customActionUses: 9 }).customActionUses, 2);
  const full = { ...fresh, questStep: "sandbox", currentLocation: "青鋒堂總壇", customActionUses: 2, silver: 50 };
  assert.ok(!availableOptions(full).some((option) => option.startsWith("N. [請堂主授機變]")));
  const refused = resolveTurn(full, "N. [請堂主授機變] 付50文私銀，請堂主補給一次機變；公款不動。", false);
  assert.equal(refused.state.turn, full.turn);
  assert.equal(refused.state.silver, full.silver);
  const empty = { ...fresh, questStep: "sandbox", currentLocation: "青鋒堂總壇", customActionUses: 0, silver: 50 };
  const blocked = resolveTurn(empty, "F. [自訂手段] 翻帳簿查錯漏", false);
  assert.equal(blocked.state.turn, empty.turn);
  assert.equal(blocked.state.customActionUses, 0);
  const purchase = availableOptions(empty).find((option) => option.startsWith("N. [請堂主授機變]"));
  assert.ok(purchase);
  const bought = resolveTurn(empty, purchase, false);
  assert.equal(bought.state.silver, 0);
  assert.equal(bought.state.factionFunds, empty.factionFunds);
  assert.equal(bought.state.customActionUses, 1);
  const used = resolveTurn(bought.state, "A. [休整] 靜坐調息，回復氣血與內力。", false, undefined, true);
  assert.equal(used.state.customActionUses, 0);
});

test("completing a landmark mission restores one custom action charge", () => {
  const hall = { ...state(), questStep: "sandbox", currentLocation: "青鋒堂總壇", customActionUses: 0 };
  const offer = availableOptions(hall).find((option) => option.includes("守街名冊") && option.startsWith("G. [領差]"));
  assert.ok(offer);
  const accepted = resolveTurn(hall, offer, false);
  assert.equal(accepted.state.customActionUses, 0);
  const target = { ...accepted.state, currentLocation: "黑泥街" };
  const finish = availableOptions(target).find((option) => option.includes("守街名冊") && option.startsWith("G. [辦差]"));
  assert.ok(finish);
  const done = resolveTurn(target, finish, false);
  assert.equal(done.state.customActionUses, 1);
  const fullTarget = { ...target, customActionUses: 2 };
  const fullFinish = availableOptions(fullTarget).find((option) => option.includes("守街名冊") && option.startsWith("G. [辦差]"));
  assert.match(fullFinish, /機變已滿，不另累積/);
  const fullDone = resolveTurn(fullTarget, fullFinish, false);
  assert.equal(fullDone.state.customActionUses, 2);
});
