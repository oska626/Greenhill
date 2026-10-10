import assert from "node:assert/strict";
import test from "node:test";
import { availableOptions, normalizeState, resolveTurn } from "../lib/game-engine.ts";
import { createCombat } from "../lib/combat-engine.ts";
import { newRelationships } from "../lib/companion-relations.ts";
import { darkHandCount, dirtyHandTier, rollD20 } from "../lib/dirty-hand.ts";
import { hardboiledFallback, validHardboiledNarrative } from "../lib/narrative-style.ts";
import { LANDMARK_SCENES, normalizeSceneState, objectStatus, openEntrance, revealEntrance, sceneFacts } from "../lib/scene-state.ts";
import { travelChoices } from "../lib/city-progression.ts";

function game(overrides = {}) {
  return {
    turn: 5, playerName: "阿七", background: "賭坊收帳人", trait: "察言觀色",
    currentLocation: "黑泥街", inventory: ["【生石灰包】"], maxInventory: 4,
    playerHp: 50, maxHp: 50, playerMp: 40, maxMp: 50,
    silver: 20, factionFunds: 10, sectLifeline: 60, worldFlags: [], relationships: newRelationships(),
    questStep: "sandbox", flags: { tookHerbs: true, visitedYung: true, collectedMarketFee: false,
      marketAmbushTriggered: true, darkHandInitialized: true }, ...overrides,
  };
}

test("market retreat stays in a dead alley until an actual escape", () => {
  const starting = game({ questStep: "huizhi_ambush", combat: createCombat("market_ambush", true) });
  const retreat = availableOptions(starting).find((option) => option.startsWith("E."));
  const trapped = resolveTurn(starting, retreat, false);
  assert.equal(trapped.state.flags.alleyEscape, true);
  assert.equal(trapped.state.currentLocation, "黑泥街");
  assert.equal(trapped.options.some((option) => /搬貨|領差|習武|習泥鰍/.test(option)), false);
  assert.equal(trapped.options.some((option) => option.includes("[踩籮翻牆]")), true);
  const invalid = resolveTurn(trapped.state, "B. [搬貨] 替商販搬貨", false);
  assert.equal(invalid.state.turn, trapped.state.turn);
  const oldTravel = resolveTurn(trapped.state, "F. [前往] 晚秋茶寮", false);
  assert.equal(oldTravel.state.turn, trapped.state.turn);
  assert.equal(oldTravel.state.flags.alleyEscape, true);
  assert.equal(oldTravel.state.currentLocation, "黑泥街");
  const escape = resolveTurn(trapped.state, trapped.options.find((option) => option.includes("[踩籮翻牆]")), false);
  assert.equal(escape.state.flags.alleyEscape, false);
  assert.equal(escape.state.worldFlags.includes("黑泥街巷尾脫險"), true);
});

test("active arena combat and city incidents hide ordinary jobs", () => {
  const arena = game({ currentLocation: "裂石擂", combat: createCombat("arena") });
  assert.equal(availableOptions(arena).some((option) => /搬貨|領差/.test(option)), false);
  const incident = game({ flags: { ...game().flags, pendingIncident: "market_raid" } });
  assert.equal(availableOptions(incident).some((option) => /搬貨|領差/.test(option)), false);
});

test("dark hand is physical, limited, consumed and has a paid guarantee", () => {
  const base = game({ currentLocation: "青鋒堂總壇" });
  const purchase = availableOptions(base).find((option) => option.includes("[買飛蝗石]"));
  const bought = resolveTurn(base, purchase, false);
  assert.equal(bought.state.silver, 15);
  assert.equal(darkHandCount(bought.state.inventory), 2);
  assert.equal(availableOptions(bought.state).some((option) => option.includes("[買石灰包]")), false);
  assert.equal(dirtyHandTier(1, 0, false), "failed");
  assert.equal(dirtyHandTier(1, 0, true), "ordinary");
  assert.equal(dirtyHandTier(18, 0, true), "great");
  assert.equal(rollD20(base, "暗手"), rollD20(base, "暗手"));
  const fighting = game({ questStep: "huizhi_ambush", combat: createCombat("market_ambush", true) });
  const trick = availableOptions(fighting).find((option) => option.includes("[全力陰手]"));
  const outcome = resolveTurn(fighting, trick, false);
  assert.equal(darkHandCount(outcome.state.inventory), 0);
  assert.equal(outcome.state.playerMp, 38);
  assert.equal(outcome.state.combat, undefined);
});

test("three passage entrances connect only after discovery", () => {
  const scene = normalizeSceneState(undefined);
  assert.equal(Object.keys(LANDMARK_SCENES).length, 8);
  const base = game({ currentLocation: "晚秋茶寮", sceneState: scene });
  assert.equal(travelChoices(base, "鬼骰坊").some((choice) => choice.kind === "shortcut"), false);
  revealEntrance(scene, "晚秋茶寮");
  revealEntrance(scene, "鬼骰坊");
  assert.equal(travelChoices(base, "鬼骰坊").some((choice) => choice.kind === "shortcut"), false);
  openEntrance(scene, "晚秋茶寮");
  openEntrance(scene, "鬼骰坊");
  assert.equal(travelChoices(base, "鬼骰坊").some((choice) => choice.kind === "shortcut"), true);
  assert.equal(travelChoices(base, "夜雨樓").some((choice) => choice.kind === "shortcut"), false);
  revealEntrance(scene, "夜雨樓");
  assert.equal(travelChoices(base, "夜雨樓").some((choice) => choice.kind === "shortcut"), false);
  openEntrance(scene, "夜雨樓");
  assert.equal(travelChoices(base, "夜雨樓").some((choice) => choice.kind === "shortcut"), true);
  const teaClue = normalizeSceneState({ discoveredEntrances: ["晚秋茶寮", "夜雨樓"], openedEntrances: [] });
  const tower = game({ currentLocation: "夜雨樓", sceneState: teaClue, worldFlags: ["陌生恩客完成"] });
  assert.equal(availableOptions(tower).some((option) => option.includes("[查酒窖巨桶]")), true);
});

test("objects keep access, control and unknown medicine separate", () => {
  const scene = normalizeSceneState(undefined);
  assert.equal(objectStatus(scene, "剁骨刀").holder, "張斷骨");
  assert.equal(objectStatus(scene, "無名藥粉瓷瓶").handling, "unknown");
  assert.equal(scene.medicineKind, "散氣粉");
  const clinic = game({ currentLocation: "苦煙館", sceneState: scene });
  const blind = availableOptions(clinic).find((option) => option.includes("[盲用藥粉]"));
  const used = resolveTurn(clinic, blind, false);
  assert.equal(used.state.sceneState.medicineUsed, true);
  assert.equal(used.state.sceneState.medicineKind, "散氣粉");
  assert.equal(used.state.playerHp, 48);
  assert.equal(availableOptions(used.state).some((option) => option.includes("[盲用藥粉]")), false);
  assert.equal(sceneFacts("苦煙館", used.state.sceneState).includes("無名藥粉瓷瓶"), false);
  const trusted = game({ currentLocation: "苦煙館", relationships: newRelationships() });
  trusted.relationships["顧忘生"].trust = 1;
  const identify = availableOptions(trusted).find((option) => option.includes("[辨無名藥粉]"));
  const identified = resolveTurn(trusted, identify, false);
  assert.equal(identified.state.sceneState.medicineIdentified, true);
  assert.equal(sceneFacts("苦煙館", identified.state.sceneState).includes("已辨為散氣粉"), true);
});

test("scavenging takes a turn, has a cost and cannot be repeated", () => {
  const base = game({ inventory: [] });
  const scavenge = availableOptions(base).find((option) => option.includes("[拾碎骨]"));
  const found = resolveTurn(base, scavenge, false);
  assert.equal(found.state.inventory.includes("【碎骨片】"), true);
  assert.equal(found.state.playerHp, 48);
  assert.equal(availableOptions(found.state).some((option) => option.includes("[拾碎骨]")), false);
  assert.equal(found.state.turn, base.turn + 1);
});

test("retreat prose stays short and contains no settlement log", () => {
  const trapped = normalizeState(game({ flags: { ...game().flags, alleyEscape: true, alleyAllyPresent: true } }));
  const prose = hardboiledFallback("精力減一。撤離時氣血減3。", trapped);
  assert.equal(validHardboiledNarrative(prose), true, prose);
  assert.equal(/精力|氣血|命脈|\d/.test(prose), false);
  const solo = hardboiledFallback("撤離時氣血減3。", { ...trapped, flags: { ...trapped.flags, alleyAllyPresent: false } });
  assert.equal(validHardboiledNarrative(solo), true, solo);
  assert.equal(solo.includes("陸千帆"), false);
  const ordinary = hardboiledFallback("你付十文私銀買下藥包。顧忘生把藥遞給你。",
    { ...trapped, currentLocation: "苦煙館", flags: { ...trapped.flags, alleyEscape: false } });
  assert.equal(validHardboiledNarrative(ordinary), true, ordinary);
});

test("twenty consecutive turns keep fallback narration within the hardboiled limit", () => {
  let state = game();
  for (let turn = 0; turn < 20; turn++) {
    const option = availableOptions(state)[0];
    assert.ok(option, `missing option at ${turn}`);
    const result = resolveTurn(state, option, false);
    const narration = hardboiledFallback(result.event, result.state, result.npcReply);
    assert.equal(validHardboiledNarrative(narration), true, `turn ${turn + 1}: ${narration}`);
    state = result.state;
  }
});
