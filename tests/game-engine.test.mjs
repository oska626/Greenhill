import assert from "node:assert/strict";
import test from "node:test";
import { aptitude, LANDMARKS, normalizeState, resolveTurn } from "../lib/game-engine.ts";

function newGame() {
  const stats = aptitude("阿七", "爛賭收數佬", "察言觀色");
  return {
    turn: 1, playerName: "阿七", background: "爛賭收數佬", trait: "察言觀色",
    currentLocation: "明心閣總壇", inventory: ["【灌鉛假骰】"], maxInventory: 4,
    playerHp: stats.hp, maxHp: stats.hp, playerMp: stats.mp, maxMp: stats.mp,
    silver: 0, factionFunds: 10, hozaiDefense: 60, worldFlags: [],
    questStep: "prologue_briefing",
    flags: { tookHerbs: false, visitedYung: false, collectedMarketFee: false, marketAmbushTriggered: false },
  };
}

test("every tutorial option advances one scene without skipping medicine or fee", () => {
  const opening = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  assert.equal(opening.state.turn, 1);
  for (const prologue of opening.options) {
    const tea = resolveTurn(opening.state, prologue, false);
    assert.equal(tea.state.questStep, "yung_tea_stall");
    assert.equal(tea.state.currentLocation, "容姐茶檔");
    assert.ok(tea.state.inventory.includes("【生草藥包】"));
    for (const choice of tea.options) {
      const market = resolveTurn(tea.state, choice, false);
      assert.equal(market.state.questStep, "market_collection");
      assert.equal(market.state.currentLocation, "泥濘市集");
      assert.ok(market.state.inventory.includes("【金創散】"));
      assert.ok(!market.state.inventory.includes("【生草藥包】"));
      for (const marketChoice of market.options) {
        const ambush = resolveTurn(market.state, marketChoice, false);
        assert.equal(ambush.state.questStep, "huizhi_ambush");
        assert.equal(ambush.state.factionFunds, 60);
        assert.ok(ambush.event.includes("五十文"));
        assert.ok(!ambush.state.inventory.includes("【金創散】"));
        const sandbox = resolveTurn(ambush.state, ambush.options[0], false);
        assert.equal(sandbox.state.questStep, "sandbox");
        assert.equal(sandbox.state.currentLocation, "泥濘市集");
      }
    }
  }
});

test("private fee is personal money with a permanent consequence", () => {
  let turn = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, "F. [自訂手段] 私吞五十文規費", false);
  assert.equal(turn.state.silver, 50);
  assert.equal(turn.state.factionFunds, 10);
  assert.equal(turn.state.hozaiDefense, 50);
  assert.ok(turn.state.worldFlags.includes("私吞五十文規費"));
  assert.ok(turn.event.includes("五十文"));
});

test("betrayal and maiming alter later options and encounters", () => {
  let turn = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, "F. [自訂手段] 出賣域卡度，打斷張屠戶右手", false);
  assert.ok(turn.state.worldFlags.includes("出賣域卡度"));
  assert.ok(turn.state.worldFlags.includes("打斷張屠戶右手"));
  assert.ok(turn.state.inventory.includes("【金創散】"));
  assert.ok(turn.options.every((option) => !option.includes("域卡度")));
  turn = resolveTurn(turn.state, turn.options[0], false);
  assert.ok(turn.event.includes("獨自"));
  turn = resolveTurn(turn.state, "F. [前往] 泥濘市集", false);
  assert.ok(turn.state.worldFlags.includes("屠戶避讓"));
  assert.ok(turn.options.every((option) => !option.includes("找域卡度")));
});

test("sandbox travel stays inside seven landmarks and resources have a ledger", () => {
  let turn = resolveTurn({ ...newGame(), questStep: "sandbox" }, "F. [前往] 黑市武館", false);
  assert.equal(turn.state.currentLocation, "黑市武館");
  turn = resolveTurn(turn.state, turn.options[0], false);
  assert.equal(turn.state.silver, 20);
  assert.ok(turn.moneyNote.includes("私銀增加20文"));
  turn = resolveTurn(turn.state, "F. [前往] 容姐茶檔", false);
  turn = resolveTurn(turn.state, turn.options[0], false);
  assert.equal(turn.state.silver, 10);
  assert.ok(turn.moneyNote.includes("私銀減少10文"));
  for (const place of LANDMARKS) {
    turn = resolveTurn(turn.state, `F. [前往] ${place}`, false);
    assert.equal(turn.state.currentLocation, place);
  }
  const rejected = resolveTurn(turn.state, "F. [自訂手段] 前往城東匯智樓總壇", false);
  assert.equal(rejected.state.currentLocation, turn.state.currentLocation);
  const question = resolveTurn(turn.state, "F. [自訂手段] 問何仔官府近況", false);
  assert.ok(!question.event.includes("城西邊界"));
  const naturalTravel = resolveTurn(turn.state, "F. [自訂手段] 走到容姐茶檔", false);
  assert.equal(naturalTravel.state.currentLocation, "容姐茶檔");
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
