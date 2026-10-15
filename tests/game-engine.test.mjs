import assert from "node:assert/strict";
import test from "node:test";
import { aptitude, availableOptions, getPseudoRandom, PROLOGUE_LANDMARKS, normalizeState, OPENING_CITY_NARRATION, STARTING_FACTION_FUNDS, resolveClinicInquiry, resolveOpeningKnifeRequest, resolveSocialIntent, resolveTurn } from "../lib/game-engine.ts";
import { NPC_VOICES, hasSectAddressViolation, npcVoiceGuide, renameLegacyWorldNames, repeatedNpcLine, sectMemberAddress } from "../lib/npc-voices.ts";
import { createCombat, resolveCombatRound, trainMove } from "../lib/combat-engine.ts";
import { ENDING_OPTIONS, MISSIONS, ROAD_ADJACENCY, guardLayersForLifeline, travelChoices } from "../lib/city-progression.ts";
import { companionLeads, newRelationships } from "../lib/companion-relations.ts";
import { PACKED_MEDICINE, USE_PACKED_MEDICINE } from "../lib/recovery.ts";
import { actionEnergyCost, FATIGUE_THRESHOLD, MAX_ENERGY } from "../lib/energy.ts";
import { darkHandCount } from "../lib/dirty-hand.ts";
import { objectStatus, sceneFacts } from "../lib/scene-state.ts";
import { appendRelationshipFeedback, containsSettlementLog, hardboiledFallback, validHardboiledNarrative, withoutSettlementLog } from "../lib/narrative-style.ts";
import { appendDangerCue, resolveActionSequence } from "../lib/action-sequence.ts";
import { hasOffSceneDirectSpeech, localNpcReply, localSpeaker, socialTargets } from "../lib/social-influence.ts";
import { drawEncounter, encounterOptions, ENCOUNTERS } from "../lib/encounters.ts";
import { NPC_TRAITS } from "../lib/npc-traits.ts";
import { npcPromptContext } from "../lib/npc-prompt-context.ts";
import { playerStatusContext } from "../lib/player-status-context.ts";
import { carriedSelfCareOption, hasOffSceneActionReference, unneededSelfCare } from "../lib/custom-action.ts";
import { lastTurnContext } from "../lib/last-turn-context.ts";
import { checkContent, containsGraphicWording, GRAPHIC_ACTION_FALLBACK, screenCustomAction } from "../lib/content-filter.ts";

function newGame() {
  const stats = aptitude("阿七", "賭坊收帳人", "察言觀色");
  return {
    turn: 1, playerName: "阿七", background: "賭坊收帳人", trait: "察言觀色",
    currentLocation: "青鋒堂總壇", inventory: ["【灌鉛假骰】", "【生石灰包】"], maxInventory: 4,
    playerHp: stats.hp, maxHp: stats.hp, hpScaleVersion: 2, playerMp: stats.mp, maxMp: stats.mp,
    silver: 0, factionFunds: STARTING_FACTION_FUNDS, sectLifeline: 60, worldFlags: [], relationships: newRelationships(),
    questStep: "prologue_briefing",
    flags: { tookHerbs: false, visitedYung: false, collectedMarketFee: false, marketAmbushTriggered: false,
      darkHandInitialized: true },
  };
}

test("bare Cantonese question at clinic gets a grounded answer without forcing travel", () => {
  const clinic = normalizeState({ ...newGame(), questStep: "kuyan_medicine", currentLocation: "苦煙館" });
  const turn = resolveClinicInquiry(clinic, "「近排有冇生面口嘅人出沒?」");
  assert.ok(turn);
  assert.equal(turn.state.turn, clinic.turn + 1);
  assert.equal(turn.state.playerMp, clinic.playerMp - actionEnergyCost(clinic, "B. [追問刀手]"));
  assert.equal(turn.state.currentLocation, "苦煙館");
  assert.equal(turn.state.questStep, "kuyan_medicine");
  assert.ok(turn.state.worldFlags.includes("認清刀手裝束"));
  assert.match(turn.npcReply?.line, /生面口.*灰線/);
  assert.equal(clinic.worldFlags.includes("認清刀手裝束"), false);
  assert.equal(resolveClinicInquiry(clinic, "我唔問生面口嘅人有冇出沒"), null);
  assert.equal(resolveClinicInquiry(clinic, "如果有生面口嘅人出沒會點?"), null);
});

function finishCombat(turn) {
  for (let round = 0; round < 5 && turn.state.combat; round++) turn = resolveTurn(turn.state, turn.options[0], false);
  assert.equal(turn.state.combat, undefined, "combat must resolve within four rounds");
  return turn;
}

function walkTo(state, destination) {
  let current = state;
  for (let step = 0; step < 12 && current.currentLocation !== destination; step++) {
    const queue = [[current.currentLocation]];
    let path;
    while (queue.length && !path) {
      const candidate = queue.shift();
      if (candidate.at(-1) === destination) { path = candidate; break; }
      for (const next of ROAD_ADJACENCY[candidate.at(-1)] || [])
        if (!candidate.includes(next)) queue.push([...candidate, next]);
    }
    assert.ok(path, `No path to ${destination}`);
    const route = travelChoices(current, path[1]).find((choice) => choice.kind === "road");
    assert.ok(route, `No road from ${current.currentLocation} to ${path[1]}`);
    const before = current.turn;
    current = resolveTurn(current, route.label, false).state;
    assert.equal(current.turn, before + 1);
  }
  assert.equal(current.currentLocation, destination);
  return current;
}

function settlePending(state) {
  if (!state.flags.pendingIncident) return state;
  const scene = state.flags.pendingIncident === "market_raid" && state.currentLocation !== "黑泥街"
    ? walkTo(state, "黑泥街") : state;
  const option = availableOptions(scene).find((choice) => !choice.startsWith("F."));
  assert.ok(option, "incident must have a local resolution");
  return resolveTurn(scene, option, false).state;
}

test("state hash is bounded, replayable, and sensitive to resources and location", () => {
  const state = normalizeState({ ...newGame(), questStep: "sandbox", turn: 12 });
  const roll = getPseudoRandom(state);
  assert.ok(Number.isInteger(roll) && roll >= 0 && roll < 100);
  assert.equal(getPseudoRandom(normalizeState(JSON.parse(JSON.stringify(state)))), roll);
  assert.ok([1, 2, 3, 4, 5].some((amount) => getPseudoRandom({ ...state, silver: state.silver + amount }) !== roll));
  assert.ok(["晚秋茶寮", "黑泥街", "苦煙館"].some((location) =>
    getPseudoRandom({ ...state, currentLocation: location }) !== roll));
});

test("incident timing changes with saved state, respects cooldown, and has a cap", () => {
  const base = normalizeState({ ...newGame(), questStep: "sandbox", turn: 7 });
  const outcomes = new Set();
  for (let silver = 0; silver < 100; silver++) {
    const replay = { ...base, silver };
    const first = resolveTurn(replay, "C. [盤點] 清點堂口帳目。", false);
    const again = resolveTurn(replay, "C. [盤點] 清點堂口帳目。", false);
    assert.equal(first.state.flags.pendingIncident, again.state.flags.pendingIncident);
    outcomes.add(Boolean(first.state.flags.pendingIncident));
  }
  assert.deepEqual([...outcomes].sort(), [false, true]);
  const cooling = resolveTurn({ ...base, turn: 8, flags: { ...base.flags, lastIncidentTurn: 7 } },
    "C. [盤點] 清點堂口帳目。", false);
  assert.equal(cooling.state.flags.pendingIncident, undefined);
  const overdue = resolveTurn({ ...base, turn: 17, flags: { ...base.flags, lastIncidentTurn: 8 } },
    "C. [盤點] 清點堂口帳目。", false);
  assert.equal(overdue.state.flags.pendingIncident, "market_raid");
});

test("seven local encounters use bounded choices and obey the state-hash cooldown", () => {
  assert.equal(ENCOUNTERS.length, 7);
  assert.deepEqual(new Set(ENCOUNTERS.map((encounter) => encounter.location)), new Set(PROLOGUE_LANDMARKS));
  for (const encounter of ENCOUNTERS) {
    for (const option of encounterOptions(encounter.id)) {
      const body = option.replace(/^[A-Z]\. \[[^\]]+\]\s*/, "");
      assert.ok(Array.from(body).filter((letter) => /[\u3400-\u9fff]/u.test(letter)).length <= 12, option);
    }
    const candidate = Array.from({ length: 100 }, (_, silver) => normalizeState({ ...newGame(),
      questStep: "sandbox", currentLocation: encounter.location, turn: 20, lastEncounterTurn: 17, silver }))
      .find((state) => getPseudoRandom(state) < 20);
    assert.ok(candidate, `${encounter.id}: no state-hash trigger found`);
    assert.equal(drawEncounter(candidate)?.id, encounter.id);
    assert.equal(drawEncounter({ ...candidate, lastEncounterTurn: 18 }), undefined);
  }
});

test("encounter decisions settle resources and never leave an empty choice list", () => {
  const cases = [
    ["hall_dispute", "A.", 20, 18, 64],
    ["tea_tail", "B.", 25, 18, 60],
    ["market_pickpocket", "A.", 26, 19, 60],
    ["dice_debt", "A.", 10, 20, 60],
    ["arena_blockade", "A.", 20, 19, 60],
    ["clinic_patron", "B.", 10, 20, 62],
    ["tower_drunk", "B.", 20, 20, 59],
  ];
  for (const [id, prefix, silver, energy, lifeline] of cases) {
    const encounter = ENCOUNTERS.find((item) => item.id === id);
    const state = normalizeState({ ...newGame(), questStep: "sandbox", currentLocation: encounter.location,
      turn: 20, lastEncounterTurn: 20, pendingEncounter: id, silver: 20, playerMp: 20,
      flags: { ...newGame().flags, lastIncidentTurn: 20 } });
    assert.deepEqual(availableOptions(state), encounterOptions(id));
    const chosen = availableOptions(state).find((option) => option.startsWith(prefix));
    const result = resolveTurn(state, chosen, false);
    assert.equal(result.state.pendingEncounter, undefined, id);
    assert.equal(result.state.turn, 21, id);
    assert.equal(result.state.silver, silver, id);
    assert.equal(result.state.playerMp, energy, id);
    assert.equal(result.state.sectLifeline, lifeline, id);
    assert.ok(result.options.length > 0, id);
  }
  const poor = normalizeState({ ...newGame(), questStep: "sandbox", currentLocation: "鬼骰坊",
    turn: 20, lastEncounterTurn: 20, pendingEncounter: "dice_debt", silver: 0 });
  const refusal = resolveTurn(poor, encounterOptions("dice_debt")[0], false);
  assert.equal(refusal.state.silver, 0);
  assert.match(refusal.event, /私銀不足十文/);
  const exhausted = normalizeState({ ...newGame(), questStep: "sandbox", currentLocation: "裂石擂",
    turn: 20, lastEncounterTurn: 20, pendingEncounter: "arena_blockade", playerMp: 0 });
  assert.equal(availableOptions(exhausted).length, 2);
  assert.ok(resolveTurn(exhausted, availableOptions(exhausted)[0], false).state.turn > exhausted.turn);
});

test("all named NPC scores initialize, clamp and survive save normalization", () => {
  const initial = normalizeState(newGame());
  assert.equal(Object.keys(NPC_TRAITS).length, 13);
  assert.deepEqual(Object.keys(NPC_TRAITS).sort(), Object.keys(NPC_VOICES).sort());
  for (const [name, trait] of Object.entries(NPC_TRAITS))
    assert.equal(initial.relationshipScores[name], trait.initial, name);
  assert.equal(initial.relationships["陸千帆"].trust, 0, "legacy companion state remains separate");
  const restored = normalizeState({ ...initial, relationshipScores: {
    ...initial.relationshipScores, "何不歸": 99, "霍破陣": -99 } });
  assert.equal(restored.relationshipScores["何不歸"], 50);
  assert.equal(restored.relationshipScores["霍破陣"], -50);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(restored))).relationshipScores, restored.relationshipScores);
});

test("NPC prompt context uses current local scores and excludes off-scene people", () => {
  const base = normalizeState(newGame());
  const tea = normalizeState({ ...base, currentLocation: "晚秋茶寮", relationshipScores: {
    ...base.relationshipScores, "容晚秋": -5, "祁觀衡": 15 } });
  const teaContext = npcPromptContext(tea);
  assert.match(teaContext, /^<Context>\n\[當前位置\]: 晚秋茶寮/m);
  assert.match(teaContext, /容晚秋 \(關係度: -5\)/);
  assert.doesNotMatch(teaContext, /祁觀衡 \(關係度:/);
  assert.match(teaContext, /關係度 < 0|關係度 0~19|關係度 >= 20/);
  assert.match(teaContext, /02_characters\.md/);
  assert.match(teaContext, /威懾、制伏、逼退/);
  assert.match(teaContext, /合理性判定/);
  assert.match(teaContext, /禁止報數/);
  assert.match(teaContext, /具象描寫代替數值/);
  assert.match(teaContext, /動態開場對白（首回合專用）/);
  assert.match(teaContext, /特質專屬敘事（常駐）/);
  assert.match(teaContext, /特質只作文字包裝，絕不可據此豁免代價/);

  const arena = npcPromptContext(normalizeState({ ...base, currentLocation: "裂石擂" }));
  assert.match(arena, /衛沉岳 \(關係度: 15\)/);
  assert.match(arena, /霍破陣 \(關係度: 20\)/);
  const dock = npcPromptContext({ ...base, currentLocation: "碼頭" });
  assert.match(dock, /無具名 NPC 在場/);
  assert.doesNotMatch(dock, /容晚秋 \(關係度:/);
});

test("player status prompt binds current vitals, inventory and displayed weapon", () => {
  const state = { ...newGame(), playerHp: 17, maxHp: 30, playerMp: 9, maxMp: 50,
    inventory: ["【止血膏藥】", "【行醫薄刃】"], equippedWeapon: "medical_blade" };
  const context = playerStatusContext(state);
  assert.match(context, /^<PlayerStatus>\n\[玩家當前狀態\]/);
  assert.match(context, /氣血: 17 \/ 30/);
  assert.match(context, /精力: 9 \/ 50/);
  assert.match(context, /行囊物品: 【止血膏藥】, 【行醫薄刃】/);
  assert.match(context, /裝備兵器: 行醫薄刃/);
  assert.match(context, /\[玩家人物設定\]\n出身背景: 賭坊收帳人\n特質: 察言觀色/);
  assert.match(playerStatusContext({ ...state, inventory: [], equippedWeapon: "fists" }), /行囊物品: 無\n裝備兵器: 徒手/);
  assert.match(playerStatusContext({ ...state, background: "", trait: "", skill: "", personality: "" }), /出身背景: 未設定\n特質: 未設定/);
  assert.match(playerStatusContext({ ...state, background: "自定義市井流民", trait: "辨藥", skill: "辨藥", personality: "嘴硬心軟" }), /特質: 辨藥, 嘴硬心軟/);
});

test("free self-treatment uses carried medicine and rejects an absent item", () => {
  const state = { ...newGame(), questStep: "sandbox", currentLocation: "晚秋茶寮",
    playerHp: 10, inventory: ["【止血膏藥】"] };
  assert.equal(hasOffSceneActionReference(normalizeState(state), "我拿出止血膏藥處理傷口"), false);
  const action = carriedSelfCareOption(state, "我拿出止血膏藥處理傷口", availableOptions(state));
  assert.match(action, /\[自敷止血膏藥\]/);
  const turn = resolveTurn(state, action, false);
  assert.equal(turn.state.playerHp, 14);
  assert.equal(turn.state.inventory.includes("【止血膏藥】"), false);
  assert.match(turn.event, /止血膏藥.*敷在傷口/);
  assert.equal(carriedSelfCareOption(turn.state, "我拿出止血膏藥處理傷口", availableOptions(turn.state)), undefined);
  assert.equal(carriedSelfCareOption(state, "我不拿出止血膏藥處理傷口", availableOptions(state)), undefined);
});

test("Edge Case: 日常江湖用語通過，具象血腥詞組仍被攔截", () => {
  const legitimate = "我查看氣血，並敷上止血膏藥";
  const graphic = "我一刀砍斷他的手，血肉模糊，鮮血狂噴";
  assert.equal(containsGraphicWording(legitimate), false);
  assert.equal(screenCustomAction(legitimate), undefined);
  assert.equal(containsGraphicWording("你取出止血膏藥，敷妥傷處後呼吸漸穩。"), false);
  assert.equal(containsGraphicWording("張斷骨欠堂口五十文規費。"), false);
  for (const ordinary of ["我退到死角，判斷形勢", "殺價之後照價交數", "先尋死路旁的退路", "收起殺氣，果斷抽身", "你打斷張斷骨右手。", "水從破管狂噴出來"]) {
    assert.equal(checkContent(ordinary), true, ordinary);
    assert.equal(screenCustomAction(ordinary), undefined, ordinary);
  }
  for (const graphicPhrase of ["血肉模糊", "鮮血直噴", "血肉橫飛", "斬首", "砍頭", "斷肢", "分屍", "肢解", "爆頭", "屠殺"]) {
    assert.equal(checkContent(graphicPhrase), false, graphicPhrase);
    assert.equal(containsGraphicWording(graphicPhrase), true, graphicPhrase);
  }

  const state = normalizeState({ ...newGame(), questStep: "sandbox", currentLocation: "晚秋茶寮",
    playerHp: 10, inventory: ["【止血膏藥】"] });
  const action = carriedSelfCareOption(state, legitimate, availableOptions(state));
  assert.match(action, /\[自敷止血膏藥\]/);
  const turn = resolveTurn(state, action, false);
  assert.equal(turn.state.playerHp, 14);
  assert.equal(turn.state.inventory.includes("【止血膏藥】"), false);
  assert.match(turn.event, /敷在傷口/);

  assert.equal(containsGraphicWording(graphic), true);
  assert.equal(containsGraphicWording("我敷上止血膏藥，卻見鮮血狂噴"), true);
  assert.equal(screenCustomAction(graphic), GRAPHIC_ACTION_FALLBACK);
  assert.doesNotMatch(GRAPHIC_ACTION_FALLBACK, /[殺死砍血斷]/u);
});

test("Edge Case: 滿血狀態下使用止血膏藥", () => {
  const state = normalizeState({ ...newGame(), questStep: "sandbox", currentLocation: "晚秋茶寮",
    maxHp: 20, playerHp: 20, hpScaleVersion: 2, inventory: ["【止血膏藥】"],
    flags: { ...newGame().flags, darkHandInitialized: true } });
  const text = "拿出止血膏藥敷藥";
  assert.equal(unneededSelfCare(state, text), true);
  assert.equal(carriedSelfCareOption(state, text, availableOptions(state)), undefined);
  assert.equal(availableOptions(state).some((option) => option.includes("[自敷止血膏藥]")), false);
  const attempted = resolveTurn(state, "W. [自敷止血膏藥] 用一回合將隨身膏藥敷在自己的傷口。", false);
  assert.equal(attempted.state.turn, state.turn);
  assert.equal(attempted.state.playerHp, state.maxHp);
  assert.deepEqual(attempted.state.inventory, state.inventory);
});

test("encounter action tags score local personalities with deterministic feedback", () => {
  const hall = normalizeState({ ...newGame(), questStep: "sandbox", turn: 20,
    pendingEncounter: "hall_dispute", lastEncounterTurn: 20 });
  const assertRoute = (option) => resolveTurn(hall, encounterOptions("hall_dispute")[option], false);
  const force = assertRoute(0);
  assert.equal(force.state.relationshipScores["何不歸"], 23);
  assert.equal(force.state.relationshipScores["霍破陣"], 22);
  assert.match(force.event, /霍破陣對你的狠辣表示讚賞/);
  assert.match(force.event, /何不歸對你的惹是生非感到頭痛/);
  assert.match(hardboiledFallback(force.event, force.state), /霍破陣對你的狠辣表示讚賞/);
  assert.equal(appendRelationshipFeedback("你拍裂桌面。", force.event).match(/霍破陣對你的狠辣表示讚賞/g)?.length, 1);
  assert.deepEqual(assertRoute(0).state.relationshipScores, force.state.relationshipScores);
  const ignore = assertRoute(1);
  assert.equal(ignore.state.relationshipScores["何不歸"], 27);
  assert.equal(ignore.state.relationshipScores["霍破陣"], 16);

  const dice = normalizeState({ ...newGame(), questStep: "sandbox", currentLocation: "鬼骰坊",
    turn: 20, pendingEncounter: "dice_debt", lastEncounterTurn: 20, silver: 10 });
  const paid = resolveTurn(dice, encounterOptions("dice_debt")[0], false);
  assert.equal(paid.state.relationshipScores["祁觀衡"], -4);
  const refused = resolveTurn({ ...dice, silver: 0 }, encounterOptions("dice_debt")[0], false);
  assert.equal(refused.state.relationshipScores["祁觀衡"], 0);
  assert.doesNotMatch(refused.event, /祁觀衡對你/);

  const capped = resolveTurn({ ...hall, relationshipScores: {
    ...hall.relationshipScores, "何不歸": -50, "霍破陣": 50 } }, encounterOptions("hall_dispute")[0], false);
  assert.equal(capped.state.relationshipScores["何不歸"], -50);
  assert.equal(capped.state.relationshipScores["霍破陣"], 50);
});

test("a hash-triggered encounter blocks travel until resolved", async () => {
  const base = normalizeState({ ...newGame(), questStep: "sandbox", turn: 19,
    flags: { ...newGame().flags, lastIncidentTurn: 19 } });
  const seed = Array.from({ length: 100 }, (_, silver) => ({ ...base, silver }))
    .find((state) => Boolean(resolveTurn(state, "C. [盤點] 清點堂口帳目。", false).state.pendingEncounter));
  assert.ok(seed);
  const first = resolveTurn(seed, "C. [盤點] 清點堂口帳目。", false);
  const replay = resolveTurn(seed, "C. [盤點] 清點堂口帳目。", false);
  assert.equal(first.state.pendingEncounter, replay.state.pendingEncounter);
  assert.equal(first.state.lastEncounterTurn, first.state.turn);
  assert.equal(normalizeState(JSON.parse(JSON.stringify(first.state))).pendingEncounter, first.state.pendingEncounter);
  assert.deepEqual(first.options, encounterOptions(first.state.pendingEncounter));
  const sequence = await resolveActionSequence(seed, ["C. [盤點] 清點堂口帳目。", "B. [捐銀固防] 捐銀加固堂口"],
    async (state, step) => resolveTurn(state, step, false));
  assert.equal(sequence.sceneChanged, true);
  assert.deepEqual(sequence.pending, ["B. [捐銀固防] 捐銀加固堂口"]);
  const rejected = resolveTurn(first.state, "F. [明路前往] 前往晚秋茶寮", false);
  assert.equal(rejected.state.turn, first.state.turn);
  const settled = resolveTurn(first.state, first.options[1], false);
  assert.equal(settled.state.pendingEncounter, undefined);
  assert.ok(settled.options.length > 0);
});

test("history defaults for old saves and records each resolved action with its event", () => {
  const oldSave = normalizeState(newGame());
  assert.deepEqual(oldSave.history, []);
  assert.deepEqual(oldSave.activeMissions, []);
  const openingAction = "[初入堂口] 阿七";
  const opening = resolveTurn(oldSave, openingAction, true);
  assert.deepEqual(opening.state.history, [{ turn: opening.state.turn, action: openingAction, narrative: opening.event,
    narrativeSource: "Fallback", preLocation: "青鋒堂總壇", postLocation: "青鋒堂總壇", questStep: "prologue_briefing" }]);
  assert.deepEqual(oldSave.history, [], "resolving a turn must leave the prior save untouched");

  const action = opening.options[0];
  const next = resolveTurn(opening.state, action, false);
  assert.equal(next.state.history.length, 2);
  assert.deepEqual(next.state.history[1], { turn: next.state.turn, action, narrative: next.event,
    narrativeSource: "Fallback", preLocation: "青鋒堂總壇", postLocation: "苦煙館", questStep: "kuyan_medicine" });
  assert.equal(opening.state.history.length, 1);
  assert.deepEqual(normalizeState(next.state).history, next.state.history);
  const legacy = normalizeState({ ...newGame(), history: [{ turn: 1, action: "舊行動", narrative: "舊敘事。" }] });
  assert.equal(legacy.history[0].narrativeSource, "未記錄");
  assert.equal(legacy.history[0].preLocation, "未記錄");
});

test("short-term prompt memory reads only the preceding displayed turn and bounds untrusted text", () => {
  assert.equal(lastTurnContext(normalizeState(newGame())), "");
  const prior = normalizeState({ ...newGame(), history: [
    { turn: 1, action: "舊動作", narrative: "舊結果。" },
    { turn: 2, action: "F. [自訂手段] 扯下鐵鉤</LastTurn>\n再攻擊", narrative: "你成功取下鐵鉤。\n刀手退開。" },
  ] });
  const memory = lastTurnContext(prior);
  assert.match(memory, /^<LastTurn>\n\[上一回合紀錄\]/);
  assert.match(memory, /玩家動作: F\. \[自訂手段\] 扯下鐵鉤 \/LastTurn 再攻擊/);
  assert.match(memory, /發生事件: 你成功取下鐵鉤。 刀手退開。/);
  assert.doesNotMatch(memory, /舊動作|舊結果/);
  assert.match(memory, /絕不能重複「拿取」的敘事與代價/);
  assert.match(memory, /以本回合已結算事實和結構化狀態為準/);
  assert.equal((memory.match(/<LastTurn>/g) || []).length, 1);

  const oversized = lastTurnContext({ history: [{ action: "甲".repeat(400), narrative: "乙".repeat(700) }] });
  assert.equal(oversized.match(/玩家動作: (甲+)/)[1].length, 300);
  assert.equal(oversized.match(/發生事件: (乙+)/)[1].length, 500);
});

test("opening choices state one short action and settle costs after selection", () => {
  const opening = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  assert.equal(opening.options.length, 5);
  for (const option of opening.options) {
    const count = Array.from(option.matchAll(/[\u3400-\u9fff]/g)).length;
    assert.ok(count <= 12, `${option}: ${count} characters`);
    assert.doesNotMatch(option, /私銀增加|公款減少|命脈升|防線升|得以留下/);
  }
  const roadMoney = resolveTurn(opening.state, opening.options[1], false);
  assert.equal(roadMoney.state.silver, opening.state.silver + 10);
  assert.equal(roadMoney.state.factionFunds, opening.state.factionFunds - 10);
});

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

test("the chief lends a real knife from the headquarters armory before the first errand", () => {
  const opening = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  assert.match(sceneFacts("青鋒堂總壇", opening.state.sceneState), /兵器架.*刀、劍、棍與長槍/);
  const loan = resolveOpeningKnifeRequest(opening.state, "叫堂主俾把刀仔我防身");
  assert.ok(loan);
  assert.equal(loan.state.questStep, "prologue_briefing");
  assert.equal(loan.state.currentLocation, "青鋒堂總壇");
  assert.equal(loan.state.inventory.filter((item) => item === "【牛肉刀】").length, 1);
  assert.equal(loan.state.equippedWeapon, "beef_knife");
  assert.equal(loan.state.weaponDurability, 4);
  assert.equal(objectStatus(loan.state.sceneState, "牛肉刀").holder, "玩家");
  assert.equal(objectStatus(loan.state.sceneState, "牛肉刀").reach, "near");
  assert.match(sceneFacts("青鋒堂總壇", loan.state.sceneState), /堂主已借出，現由玩家攜帶/);
  assert.equal(normalizeState(loan.state).inventory.includes("【牛肉刀】"), true);
  assert.equal(loan.state.worldFlags.includes("堂主借出牛肉刀"), true);
  const again = resolveOpeningKnifeRequest(loan.state, "再問堂主借把短刀");
  assert.equal(again.state.inventory.filter((item) => item === "【牛肉刀】").length, 1);
});

test("asking about, declining or lacking room for a knife cannot create one", () => {
  const opening = resolveTurn(newGame(), "[初入堂口] 阿七", true).state;
  assert.equal(resolveOpeningKnifeRequest(opening, "如果叫堂主借把刀仔會點？"), null);
  assert.equal(resolveOpeningKnifeRequest(opening, "我唔要堂主俾把刀仔"), null);
  const full = { ...opening, inventory: [...opening.inventory, "【止血散】", "【金創散】"] };
  const denied = resolveOpeningKnifeRequest(full, "叫堂主俾把刀仔我防身");
  assert.ok(denied);
  assert.equal(denied.state.inventory.includes("【牛肉刀】"), false);
  assert.equal(objectStatus(denied.state.sceneState, "牛肉刀").holder, undefined);
});

test("an older borrowed short knife save becomes a beef knife without duplicating gear", () => {
  const old = { ...newGame(), equippedWeapon: "rusty_knife", weaponDurability: 2,
    inventory: ["【生鏽鐵刀】", "【生石灰包】"],
    sceneState: { objectHolders: { "堂口備用短刀": "玩家" }, movedObjects: { "堂口備用短刀": "玩家腰間" } } };
  const migrated = normalizeState(old);
  assert.equal(migrated.inventory.includes("【牛肉刀】"), true);
  assert.equal(migrated.inventory.includes("【生鏽鐵刀】"), false);
  assert.equal(migrated.equippedWeapon, "beef_knife");
  assert.equal(migrated.weaponDurability, 2);
  assert.equal(migrated.sceneState.objectHolders["牛肉刀"], "玩家");
});

test("a starting blade is removed when its final durability is spent in combat", () => {
  const state = normalizeState({ ...newGame(), questStep: "huizhi_ambush", currentLocation: "黑泥街",
    inventory: ["【行醫薄刃】", "【生石灰包】"], equippedWeapon: "medical_blade",
    weaponDurability: 1, combat: createCombat("market_ambush", false) });
  const attack = availableOptions(state).find((option) => option.startsWith("A."));
  const result = resolveTurn(state, attack, false);
  assert.match(result.event, /行醫薄刃當場折斷/);
  assert.equal(result.state.equippedWeapon, "fists");
  assert.equal(result.state.inventory.includes("【行醫薄刃】"), false);
});

test("a member can borrow the headquarters beef knife on a later visit", () => {
  const scene = { ...newGame(), questStep: "sandbox", turn: 12 };
  const result = resolveOpeningKnifeRequest(scene, "向堂主借把牛肉刀防身");
  assert.ok(result);
  assert.equal(result.state.questStep, "sandbox");
  assert.equal(result.state.turn, 13);
  assert.equal(result.state.equippedWeapon, "beef_knife");
});

test("all opening choices enter the clinic in one camera beat without a stat log", () => {
  const opening = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  const variants = new Set();
  for (const option of opening.options) {
    const turn = resolveTurn(opening.state, option, false);
    assert.equal(turn.state.questStep, "kuyan_medicine");
    const prose = hardboiledFallback(turn.event, turn.state, turn.npcReply);
    variants.add(prose);
    assert.equal(validHardboiledNarrative(prose), true, prose);
    assert.match(prose, /你踏進苦煙館/);
    assert.match(prose, /顧忘生把膏藥封口/);
    assert.equal(prose.includes("何不歸"), false);
    assert.equal(containsSettlementLog(prose), false);
    assert.doesNotMatch(prose, /防線|升四|公款|私銀|你領命後立即動身/);
    assert.doesNotMatch(prose, /腳步聲|傷藥還未送到/);
    const fullNarrative = appendDangerCue(prose, turn.state);
    assert.equal(fullNarrative.match(/腳步聲/g)?.length, 1);
    assert.equal(fullNarrative.match(/傷藥還未送到/g)?.length, 1);
  }
  assert.equal(variants.size, opening.options.length);
  assert.equal(containsSettlementLog("何不歸留下補強守備，防線升四。"), true);
});

test("all clinic choices open on the Blackmud stall without shifting the camera back", () => {
  const opening = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  const clinic = resolveTurn(opening.state, opening.options[0], false);
  for (const option of clinic.options) {
    const turn = resolveTurn(clinic.state, option, false);
    assert.equal(turn.state.currentLocation, "黑泥街");
    const prose = hardboiledFallback(turn.event, turn.state, turn.npcReply);
    assert.equal(validHardboiledNarrative(prose), true, prose);
    const [medicine, stall] = prose.split("\n\n");
    assert.ok(medicine && stall, prose);
    assert.match(medicine, /^懷裡的膏藥/);
    assert.doesNotMatch(prose, /苦煙館裡|顧忘生遞來膏藥|你帶藥趕到/);
    assert.match(stall, /^肉檔前，陸千帆.*張斷骨.*五十文規費。$/);
    assert.equal(containsSettlementLog(prose), false);
    if (option.includes("追問刀手")) assert.match(medicine, /灰線刀手/);
  }
});

test("tea stall handoff keeps the Blackmud camera on the meat stall", () => {
  const tea = { ...newGame(), questStep: "yung_tea_stall", currentLocation: "晚秋茶寮" };
  for (const option of availableOptions(tea)) {
    const turn = resolveTurn(tea, option, false);
    assert.equal(turn.state.currentLocation, "黑泥街");
    assert.match(turn.event, /^你趕到黑泥街市集肉檔/);
    const prose = hardboiledFallback(turn.event, turn.state, turn.npcReply);
    assert.equal(validHardboiledNarrative(prose), true, prose);
    assert.match(prose, /^袖裡的金創散/);
    assert.doesNotMatch(prose, /茶寮裡|容晚秋(?:說|派人|教你)/);
  }
});

test("distant incident reports arrive at the current landmark without remote dialogue", () => {
  const base = newGame();
  const scene = { ...base, questStep: "sandbox", currentLocation: "苦煙館", turn: 9,
    flags: { ...base.flags, lastIncidentTurn: 0, incidentCount: 1 } };
  const turn = resolveTurn(scene, availableOptions(scene)[0], false);
  assert.equal(turn.state.currentLocation, "苦煙館");
  assert.equal(turn.state.flags.pendingIncident, "missing_ledger");
  assert.match(turn.event, /^你在苦煙館收到堂口遞來的缺頁帳目/);
  assert.equal(turn.npcReply, undefined);
});

test("small health scale preserves the injury ratio of old saves once", () => {
  assert.equal(aptitude("阿七", "賭坊收帳人", "察言觀色").hp, 20);
  assert.equal(aptitude("阿七", "落魄武館棄徒", "皮糙肉厚").hp, 28);
  assert.equal(aptitude("阿七", "黑市醫道學徒", "辨毒識藥").hp, 16);
  const legacy = { ...newGame(), questStep: "sandbox", hpScaleVersion: undefined,
    maxHp: 102, playerHp: 51 };
  const migrated = normalizeState(legacy);
  assert.equal(migrated.maxHp, 20);
  assert.equal(migrated.playerHp, 10);
  assert.equal(normalizeState(migrated).playerHp, 10);
});

test("starting backgrounds give usable gear and scene knowledge", () => {
  assert.equal(darkHandCount(newGame().inventory), 2);
  const ghost = { ...newGame(), questStep: "sandbox", currentLocation: "鬼骰坊",
    inventory: ["【開鎖鐵線】", "【生石灰包】"] };
  const entry = availableOptions(ghost).find((option) => option.includes("[查賬房雜物]"));
  assert.ok(entry);
  const unlocked = resolveTurn(ghost, entry, false);
  assert.ok(unlocked.state.sceneState.openedEntrances.includes("鬼骰坊"));
  assert.match(unlocked.event, /鐵線/);

  const medic = { ...newGame(), questStep: "sandbox", currentLocation: "苦煙館",
    background: "黑市醫道學徒", trait: "辨毒識藥" };
  const identify = availableOptions(medic).find((option) => option.includes("[辨無名藥粉]"));
  assert.ok(identify);
  const identified = resolveTurn(medic, identify, false);
  assert.equal(identified.state.sceneState.medicineIdentified, true);
  assert.equal(objectStatus(identified.state.sceneState, "無名藥粉瓷瓶").holder, "顧忘生");

  const bleeding = { ...medic, playerHp: 10, inventory: ["【止血散】", "【生石灰包】"] };
  const bandage = availableOptions(bleeding).find((option) => option.includes("[敷止血散]"));
  assert.ok(bandage);
  const treated = resolveTurn(bleeding, bandage, false);
  assert.equal(treated.state.playerHp, 14);
  assert.equal(treated.state.inventory.includes("【止血散】"), false);
});

test("wounded martial dropout starts below maximum but hits harder barehanded", () => {
  const dropout = { ...newGame(), background: "落魄武館棄徒", trait: "皮糙肉厚" };
  const opened = resolveTurn(dropout, "[初入堂口] 阿七", true);
  assert.equal(opened.state.maxHp, 28);
  assert.equal(opened.state.playerHp, 26);
  const fight = { combat: createCombat("arena"), action: "A. [正面進擊]",
    playerHp: 28, playerMp: 50, weapon: "fists", weaponDurability: 0, knownMoves: {} };
  const ordinary = resolveCombatRound(fight);
  const trained = resolveCombatRound({ ...fight, background: "落魄武館棄徒" });
  assert.equal(trained.combat.enemyHp, ordinary.combat.enemyHp - 2);
  const protectedRound = resolveCombatRound({ ...fight, armGuard: true });
  assert.equal(protectedRound.playerHp, ordinary.playerHp + 1);
});

test("older saves keep their energy ratio when normalized to the shared maximum", () => {
  const old = { ...newGame(), questStep: "sandbox", maxHp: 100, maxMp: 75, playerMp: 30, playerHp: 47 };
  const migrated = normalizeState(old);
  assert.equal(migrated.maxMp, MAX_ENERGY);
  assert.equal(migrated.playerMp, 20);
  assert.equal(migrated.playerHp, 47);
  assert.equal(normalizeState(migrated).playerMp, 20);
});

test("fatigue raises investigation cost, while exhaustion leaves basic action, travel and rest possible", () => {
  const base = { ...newGame(), questStep: "sandbox", currentLocation: "黑泥街", maxHp: 100, playerHp: 50, playerMp: FATIGUE_THRESHOLD, turn: 2 };
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
  const route = travelChoices(empty, "裂石擂")[0];
  assert.equal(route.turns, 1);
  const travelled = resolveTurn(empty, route.label, false);
  assert.equal(travelled.state.currentLocation, "裂石擂");
  assert.equal(travelled.state.turn, 3);
  assert.equal(travelled.state.playerHp, 48);
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
    maxHp: 100, playerHp: 50, playerMp: 0, combat: createCombat("arena") };
  const options = availableOptions(scene);
  assert.equal(options.some((option) => option.startsWith("A. [正面進擊]")), true);
  assert.equal(options.some((option) => option.startsWith("C. [借地形]")), false);
  const fought = resolveTurn(scene, options[0], false);
  assert.equal(fought.state.playerMp, 0);
  assert.ok(fought.state.playerHp < scene.playerHp);
  assert.equal(containsSettlementLog(fought.event), false);
  const refused = resolveTurn(scene, "C. [借地形]", false);
  assert.equal(refused.state.turn, scene.turn);
  assert.equal(refused.state.playerHp, scene.playerHp);
  assert.equal(refused.state.playerMp, scene.playerMp);
});

test("opening hands mission facts to narration without a profile-based script", () => {
  const profiles = [
    ["賭坊收帳人", "察言觀色"],
    ["城西街童扒手", "手疾眼快"],
    ["落魄武館棄徒", "皮糙肉厚"],
    ["黑市醫道學徒", "辨毒識藥"],
    ["自定義市井流民", "見風使舵"],
  ];
  for (const [background, trait] of profiles) {
    const opening = resolveTurn({ ...newGame(), background, trait }, "[初入堂口] 阿七", true);
    assert.match(opening.event, /青鋒堂總壇.*何不歸在場.*任務目標/);
    assert.match(opening.event, /苦煙館找顧忘生.*黑泥街市集救陸千帆.*五十文/);
    assert.equal(opening.npcReply, undefined);
    assert.doesNotMatch(opening.event, /你說會|至於|骰繭|後門|藥色/);
    assert.match(playerStatusContext(opening.state), new RegExp(`出身背景: ${background}\\n特質: ${trait}`));
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

test("custom opening preserves profile for AI narration without authored dialogue", () => {
  const profiles = [
    { gender: "女", skill: "開鎖", personality: "多疑" },
    { gender: "男子", skill: "使短刀", personality: "脾氣暴躁" },
    { gender: "非二元", skill: "辨藥", personality: "嘴硬心軟" },
  ];
  for (const profile of profiles) {
    const state = normalizeState({ ...newGame(), background: "自定義市井流民", trait: profile.skill, ...profile });
    const opening = resolveTurn(state, "[初入堂口] 阿七", true);
    assert.equal(opening.state.gender, profile.gender);
    assert.equal(opening.state.skill, profile.skill);
    assert.equal(opening.state.personality, profile.personality);
    assert.equal(opening.npcReply, undefined);
    assert.match(playerStatusContext(opening.state), new RegExp(`特質: ${profile.skill}, ${profile.personality}`));
    assert.match(opening.event, /陸千帆.*五十文/);
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
      assert.equal(containsSettlementLog(turn.event), false, `${location}: ${option}: ${turn.event}`);
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

test("story channel drops legacy settlement logs while state keeps the actual cost", () => {
  assert.equal(withoutSettlementLog("你踉蹌半步，氣血減2；對手氣血減6。"), "你踉蹌半步，你強忍痛楚；對手攻勢一滯。");
  const state = { ...newGame(), questStep: "sandbox", currentLocation: "裂石擂",
    maxHp: 100, playerHp: 50, playerMp: 0, combat: createCombat("arena") };
  const turn = resolveTurn(state, availableOptions(state)[0], false);
  assert.ok(turn.state.playerHp < state.playerHp);
  assert.equal(turn.state.playerMp, 0);
  assert.equal(containsSettlementLog(turn.event), false);
  assert.match(turn.event, /踉蹌|劇痛|氣喘/);
});

test("tutorial choices advance one scene while preserving their different costs", () => {
  const opening = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  assert.equal(opening.state.turn, 1);
  assert.match(opening.event, /苦煙館找顧忘生領止血膏藥.*黑泥街市集救陸千帆/);
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
      assert.equal(market.npcReply?.speaker, "陸千帆");
      for (const [index, marketChoice] of market.options.entries()) {
        const first = resolveTurn(market.state, marketChoice, false);
        assert.equal(first.state.factionFunds, market.state.factionFunds + [0, 50, 0, 20, 0][index]);
        assert.equal(first.state.inventory.includes("【止血膏藥】"), index !== 0);
        assert.equal(first.state.questStep, ["market_collection", "huizhi_ambush", "market_collection", "huizhi_ambush", "sandbox"][index]);
        if (index === 4) {
          assert.equal(first.state.flags.alleyEscape, true);
          continue;
        }
        const ambush = index === 0 || index === 2
          ? resolveTurn(first.state, first.options.find((option) => option.startsWith("B.")), false) : first;
        assert.equal(ambush.state.questStep, "huizhi_ambush");
        assert.equal(ambush.state.factionFunds, market.state.factionFunds + (index === 3 ? 20 : 50));
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
  assert.equal(allowance.state.factionFunds, STARTING_FACTION_FUNDS - 10);

  const informed = resolveTurn(opening.state, opening.options[2], false);
  const ordinaryTea = resolveTurn(direct.state, direct.options[0], false);
  const informedTea = resolveTurn(informed.state, informed.options[0], false);
  const ordinaryMarket = resolveTurn(ordinaryTea.state, ordinaryTea.options[0], false);
  const informedMarket = resolveTurn(informedTea.state, informedTea.options[0], false);
  const ordinaryAid = resolveTurn(ordinaryMarket.state, ordinaryMarket.options[0], false);
  const informedAid = resolveTurn(informedMarket.state, informedMarket.options[0], false);
  const ordinaryAmbush = resolveTurn(ordinaryAid.state, ordinaryAid.options.find((option) => option.startsWith("B.")), false);
  const informedAmbush = resolveTurn(informedAid.state, informedAid.options.find((option) => option.startsWith("B.")), false);
  assert.ok(informedAmbush.state.combat.preparedDefense > ordinaryAmbush.state.combat.preparedDefense);
  assert.ok(informedAmbush.state.worldFlags.includes("問清刀手兵刃"));
});

test("ambush tactics have distinct costs and a saved game receives current options", () => {
  const ambush = { ...newGame(), questStep: "huizhi_ambush", currentLocation: "黑泥街" };
  const outcomes = availableOptions(ambush).map((option) => resolveTurn(ambush, option, false));
  assert.ok(new Set(outcomes.map((result) => `${result.state.playerHp}:${result.state.playerMp}`)).size >= 5);
  assert.ok(availableOptions(ambush).some((option) => option.includes("[撒生石灰]")));
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

test("market actions charge only their stated fee and preserve outstanding debt", () => {
  let turn = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, turn.options[0], false);
  const fees = [0, 50, 0, 20, 0];
  const outcomes = turn.options.map((option, index) => {
    const result = resolveTurn(turn.state, option, false);
    assert.equal(result.state.factionFunds, turn.state.factionFunds + fees[index]);
    return result;
  });
  assert.ok(outcomes[2].state.worldFlags.includes("已察覺巷口伏兵"));
  assert.ok(outcomes[3].state.worldFlags.includes("張斷骨欠費三十文"));
  assert.ok(outcomes[4].state.worldFlags.includes("張斷骨規費未收"));
  assert.equal(outcomes[0].state.worldFlags.includes("陸千帆已敷藥"), true);
  for (const index of [3]) {
    let aftermath = finishCombat(outcomes[index]);
    if (aftermath.state.flags.alleyEscape)
      aftermath = resolveTurn(aftermath.state, aftermath.options.find((option) => option.includes("[踩籮翻牆]")), false);
    if (aftermath.state.flags.marketAftermath)
      aftermath = resolveTurn(aftermath.state, aftermath.options.find((option) => option.includes("[安頓收隊]")), false);
    assert.match(aftermath.options[0], /追收張斷骨所欠/);
    const before = aftermath.state.factionFunds;
    aftermath = resolveTurn(aftermath.state, aftermath.options[0], false);
    assert.equal(aftermath.state.factionFunds, before + 50 - fees[index]);
    assert.ok(aftermath.state.worldFlags.includes("張斷骨舊費已清"));
  }
});

test("sandbox clues improve later incidents without a repeatable wager", () => {
  const baseline = { ...newGame(), questStep: "sandbox", currentLocation: "鬼骰坊", turn: 5, silver: 20 };
  assert.equal(availableOptions(baseline).some((option) => option.includes("[押小]")), false);

  for (const [incident, clue, option, expected] of [
    ["market_raid", "街面有備", "C. [設局取證] 記下刀手勒索攤販的證詞。", 2],
    ["market_raid", "擊退伏擊刀手", "C. [設局取證] 記下刀手勒索攤販的證詞。", 2],
    ["missing_ledger", "帳目有據", "A. [查賭檔] 到鬼骰坊核對缺失的規費帳。", 10],
    ["tainted_medicine", "傷藥有據", "A. [封存藥包] 封住來歷不明的傷藥。", 2],
    ["tainted_medicine", "辨清傷藥封口", "A. [封存藥包] 封住來歷不明的傷藥。", 2],
  ]) {
    const state = { ...newGame(), questStep: "sandbox", currentLocation: incident === "market_raid" ? "黑泥街" : incident === "missing_ledger" ? "鬼骰坊" : "青鋒堂總壇",
      flags: { ...newGame().flags, pendingIncident: incident } };
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
  assert.equal(turn.state.factionFunds, STARTING_FACTION_FUNDS);
  assert.ok(turn.state.inventory.includes("【止血膏藥】"));
  assert.equal(turn.state.worldFlags.includes("陸千帆已敷藥"), false);
  assert.equal(turn.state.sectLifeline, defenseBeforeTheft - 10);
  assert.ok(turn.state.worldFlags.includes("私吞五十文規費"));
  assert.ok(turn.event.includes("五十文"));
});

test("betrayal and maiming alter later options and encounters", () => {
  let turn = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, turn.options[0], false);
  const market = turn.state;
  const combined = resolveTurn(market, "F. [自訂手段] 出賣陸千帆，打斷張斷骨右手", false);
  assert.equal(combined.state.turn, market.turn);
  const betrayal = resolveTurn(market, "F. [自訂手段] 出賣陸千帆", false);
  assert.ok(betrayal.state.worldFlags.includes("出賣陸千帆"));
  assert.ok(betrayal.state.inventory.includes("【止血膏藥】"));
  assert.ok(betrayal.options.every((option) => !option.includes("陸千帆")));
  assert.equal(betrayal.state.combat.allyPresent, false);
  assert.equal(betrayal.state.factionFunds, market.factionFunds);
  turn = resolveTurn(market, "F. [自訂手段] 打斷張斷骨右手", false);
  assert.ok(turn.state.worldFlags.includes("打斷張斷骨右手"));
  assert.equal(turn.state.factionFunds, market.factionFunds);
  assert.ok(turn.state.inventory.includes("【止血膏藥】"));
  turn = finishCombat(turn);
  if (turn.state.flags.marketAftermath)
    turn = resolveTurn(turn.state, turn.options.find((option) => option.includes("[安頓收隊]")), false);
  turn = resolveTurn(turn.state, travelChoices(turn.state, "晚秋茶寮")[0].label, false);
  turn = { state: walkTo(turn.state, "黑泥街") };
  turn = resolveTurn(turn.state, availableOptions(turn.state)[0], false);
  assert.ok(turn.state.worldFlags.includes("屠戶避讓"));
  assert.ok(turn.options.some((option) => option.includes("找陸千帆")));
});

test("sandbox travel stays inside seven landmarks and resources have a ledger", () => {
  const start = { ...newGame(), questStep: "sandbox" };
  assert.equal(resolveTurn(start, "F. [前往] 裂石擂", false).state.turn, start.turn);
  let turn = { state: walkTo(start, "裂石擂") };
  assert.equal(turn.state.currentLocation, "裂石擂");
  const travelEarnings = turn.state.silver;
  turn = resolveTurn(turn.state, availableOptions(turn.state)[0], false);
  assert.equal(turn.state.combat.scenario, "arena");
  turn = finishCombat(turn);
  assert.equal(turn.state.silver, travelEarnings + 20);
  assert.ok(turn.moneyNote.includes("私銀增加20文"));
  for (let attempt = 0; attempt < 20; attempt++) {
    if (turn.state.pendingEncounter) turn = resolveTurn(turn.state, availableOptions(turn.state)[0], false);
    else if (turn.state.flags.pendingIncident) turn = { state: settlePending(turn.state) };
    else if (turn.state.currentLocation !== "晚秋茶寮") turn = { state: walkTo(turn.state, "晚秋茶寮") };
    else break;
  }
  const beforeMessage = turn.state.silver;
  const buyMessage = availableOptions(turn.state).find((option) => option.startsWith("A. [買消息]"));
  assert.ok(buyMessage, JSON.stringify({ turn: turn.state.turn, location: turn.state.currentLocation,
    incident: turn.state.flags.pendingIncident, encounter: turn.state.pendingEncounter, options: availableOptions(turn.state) }));
  turn = resolveTurn(turn.state, buyMessage, false);
  assert.equal(turn.state.silver, beforeMessage - 10);
  assert.ok(turn.moneyNote.includes("私銀減少10文"));
  turn = { state: settlePending(turn.state) };
  const rejected = resolveTurn(turn.state, "F. [自訂手段] 前往城東玄武樓總壇", false);
  assert.equal(rejected.state.currentLocation, turn.state.currentLocation);
  const question = resolveTurn(turn.state, "F. [自訂手段] 問何不歸官府近況", false);
  assert.ok(!question.event.includes("城西邊界"));
  const naturalTravel = resolveTurn(turn.state, "F. [自訂手段] 走到晚秋茶寮", false);
  assert.equal(naturalTravel.state.currentLocation, turn.state.currentLocation);
});

test("absurd custom actions lose health and malformed numeric state is normalized", () => {
  const state = normalizeState({ ...newGame(), silver: "999", factionFunds: Number.NaN, playerHp: "80" });
  assert.ok(state);
  assert.equal(state.silver, 0);
  assert.equal(state.factionFunds, STARTING_FACTION_FUNDS);
  assert.equal(state.playerHp, state.maxHp);
  const turn = resolveTurn(state, "F. [自訂手段] 拿機關槍射擊", false);
  assert.equal(turn.state.playerHp, state.maxHp - 4);
});

test("sandbox incident follows the finished market ambush", () => {
  let turn = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  for (let index = 0; index < 3; index++) turn = resolveTurn(turn.state, turn.options[0], false);
  turn = resolveTurn(turn.state, turn.options.find((option) => option.startsWith("B.")), false);
  assert.equal(turn.state.questStep, "huizhi_ambush");
  turn = finishCombat(turn);
  assert.equal(turn.state.questStep, "sandbox");
  for (let index = 0; index < 4 && !turn.state.flags.pendingIncident; index++) turn = resolveTurn(turn.state, turn.options[2], false);
  assert.ok(turn.state.turn >= 8);
  assert.equal(turn.state.flags.pendingIncident, "market_raid");
  assert.match(turn.event, /插旗/);
  if (turn.state.currentLocation !== "黑泥街") turn = { state: walkTo(turn.state, "黑泥街") };
  assert.match(availableOptions(turn.state)[0], /護住攤販/);
  const settled = resolveTurn(normalizeState(turn.state), availableOptions(turn.state)[0], false);
  assert.equal(settled.state.flags.pendingIncident, undefined);
  assert.ok(settled.state.worldFlags.includes("市集守住"));
  assert.match(settled.event, /街坊守住肉檔/);
  assert.match(settled.options[0], /巡街收規/);
});

test("a market raid stays pending until each road edge reaches the meat stall", () => {
  const base = { ...newGame(), questStep: "sandbox", currentLocation: "青鋒堂總壇", silver: 20,
    flags: { ...newGame().flags, pendingIncident: "market_raid" } };
  assert.ok(availableOptions(base).every((option) => option.startsWith("F.")));
  const atMarket = walkTo(base, "黑泥街");
  assert.equal(atMarket.turn, base.turn + 2);
  assert.equal(atMarket.flags.pendingIncident, "market_raid");
  for (const option of availableOptions(atMarket).filter((choice) => !choice.startsWith("F."))) {
    const turn = resolveTurn(atMarket, option, false);
    assert.equal(turn.state.currentLocation, "黑泥街");
    assert.equal(turn.state.flags.pendingIncident, undefined);
  }
});

test("only people at the current scene may receive direct dialogue", () => {
  const market = { ...newGame(), questStep: "sandbox", currentLocation: "黑泥街" };
  assert.equal(localNpcReply(market, { speaker: "顧忘生", line: "遠處說話" }), undefined);
  assert.equal(localSpeaker(market, "顧忘生"), "張斷骨");
  assert.ok(socialTargets(market).includes("陸千帆"));
  assert.doesNotMatch(hardboiledFallback("你在肉檔前看清巷口。", market,
    { speaker: "顧忘生", line: "遠處說話" }), /顧忘生：「/);
  assert.equal(hasOffSceneDirectSpeech(market, "顧忘生低聲說：「你走慢了。」"), true);
  assert.equal(hasOffSceneDirectSpeech(market, "陸千帆：「刀手還在。」"), false);
  assert.doesNotMatch(hardboiledFallback("顧忘生：「你走慢了。」你在肉檔前看清巷口。", market), /顧忘生：「/);
  const alley = { ...market, flags: { ...market.flags, alleyEscape: true, alleyWall: true } };
  assert.equal(localNpcReply(alley, { speaker: "張斷骨", line: "肉檔說話" }), undefined);
  assert.ok(socialTargets(alley).includes("刀手"));
  const abandoned = { ...market, worldFlags: ["棄下陸千帆"] };
  assert.ok(!availableOptions(abandoned).some((option) => option.includes("[找陸千帆]")));
  const scout = resolveTurn(abandoned, availableOptions(abandoned).find((option) => option.includes("[盯梢]")), false);
  assert.notEqual(scout.npcReply?.speaker, "陸千帆");
});

test("unaccompanied market combat never gives the absent chief a reply", () => {
  let state = { ...newGame(), questStep: "huizhi_ambush", currentLocation: "黑泥街",
    worldFlags: ["出賣陸千帆"], combat: createCombat("market_ambush", false) };
  for (let round = 0; round < 6; round++) {
    const option = availableOptions(state)[0];
    const turn = resolveTurn(state, option, false);
    if (turn.npcReply) assert.ok(socialTargets(turn.state).includes(turn.npcReply.speaker), turn.npcReply.speaker);
    assert.notEqual(turn.npcReply?.speaker, "何不歸");
    state = turn.state;
    if (!state.combat) break;
  }
});

test("crisis options and turn resolution reject travel and daily work", () => {
  const base = { ...newGame(), questStep: "sandbox", currentLocation: "黑泥街" };
  const states = [
    { ...base, combat: createCombat("arena", false), currentLocation: "裂石擂" },
    { ...base, flags: { ...base.flags, alleyEscape: true } },
    { ...base, flags: { ...base.flags, alleyWall: true } },
    { ...base, flags: { ...base.flags, marketAftermath: true } },
    { ...base, flags: { ...base.flags, finalCrisis: true } },
  ];
  for (const raw of states) {
    const current = normalizeState(raw);
    const options = availableOptions(current);
    assert.ok(options.length > 0);
    assert.ok(options.every((option) => !/\[(?:搬貨|買消息|前往|明路前往|暗道前往)\]/.test(option)));
    const before = current.turn;
    for (const action of ["F. [前往] 苦煙館", travelChoices(current, "裂石擂")[0]?.label,
      "B. [搬貨] 替商販搬貨照料騾車；每隔三回合可賺六文私銀。"] ) {
      if (!action) continue;
      const rejected = resolveTurn(current, action, false);
      assert.equal(rejected.state.turn, before);
      assert.equal(rejected.state.currentLocation, current.currentLocation);
    }
  }
  const incident = normalizeState({ ...base, currentLocation: "青鋒堂總壇",
    flags: { ...base.flags, pendingIncident: "missing_ledger" } });
  assert.ok(availableOptions(incident).some((option) => option.includes("[明路前往]")));
  assert.equal(walkTo(incident, "鬼骰坊").flags.pendingIncident, "missing_ledger");
  assert.equal(resolveOpeningKnifeRequest(incident, "向何不歸討一把牛肉刀"), null);
  assert.equal(resolveTurn(incident, "F. [自訂手段] 問何不歸借刀", false).state.turn, incident.turn);
  const social = { target: "何不歸", goal: "help", subject: "協助玩家", tactic: "reason",
    quality: "coherent", method: "請堂主幫忙" };
  assert.equal(resolveSocialIntent(incident, social).state.turn, incident.turn);
});

test("old checkpoint state keeps crisis flags and reanchors its physical scene", () => {
  const base = newGame();
  const oldCheckpoint = JSON.parse(JSON.stringify({ ...base, questStep: "sandbox", currentLocation: "青鋒堂總壇",
    flags: { ...base.flags, alleyWall: true, checkpointReady: true, incidentCount: 3 },
    worldFlags: ["擊退伏擊刀手"] }));
  const restored = normalizeState(oldCheckpoint);
  assert.equal(restored.currentLocation, "黑泥街");
  assert.equal(restored.flags.alleyEscape, true);
  assert.equal(restored.flags.alleyWall, true);
  assert.equal(restored.flags.checkpointReady, true);
  assert.equal(restored.flags.incidentCount, 3);
  assert.deepEqual(restored.worldFlags, ["擊退伏擊刀手"]);
  assert.ok(availableOptions(restored).every((option) => !option.includes("[搬貨]")));
  const conflicting = normalizeState({ ...base, questStep: "sandbox", currentLocation: "鬼骰坊",
    combat: createCombat("arena", false), flags: { ...base.flags, marketAftermath: true } });
  assert.equal(conflicting.currentLocation, "裂石擂");
  assert.equal(conflicting.flags.marketAftermath, false);
  assert.ok(conflicting.combat);
  assert.ok(availableOptions(conflicting).every((option) => !option.includes("[搬貨]")));
});

test("later incidents change options and preserve resource consequences", () => {
  let state = { ...newGame(), turn: 12, questStep: "sandbox", silver: 20, factionFunds: 30 };
  state.flags = { ...state.flags, incidentCount: 1, lastIncidentTurn: 2 };
  let turn = resolveTurn(state, "C. [盤點] 清點堂口帳目。", false);
  assert.equal(turn.state.flags.pendingIncident, "missing_ledger");
  assert.ok(turn.options.every((option) => !option.includes("[查賭檔]")));
  turn = resolveTurn(turn.state, turn.options.find((option) => option.includes("[補帳]")), false);
  assert.equal(turn.state.factionFunds, 30);
  assert.equal(turn.state.silver, 10);
  assert.ok(turn.moneyNote.includes("私銀減少10文"));
  state = { ...turn.state, turn: turn.state.flags.lastIncidentTurn + 9 };
  turn = resolveTurn(state, travelChoices(state, "晚秋茶寮")[0].label, false);
  assert.equal(turn.state.flags.pendingIncident, "tainted_medicine");
  assert.match(turn.options[0], /封存藥包/);
  turn = resolveTurn(turn.state, turn.options.find((option) => option.includes("[救治傷者]")), false);
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
  assert.ok(turn.options.every((option) => !option.includes("[護住攤販]")));
  assert.ok(turn.options.some((option) => option.includes("[明路前往]")));
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
  assert.match(hardboiledFallback(refused.event, refused.state), /私銀不足十文.*沒有收錢/);
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
  assert.equal(travelChoices(routePaid.state, "夜雨樓").some((choice) => choice.kind === "shortcut"), false);
  assert.equal(availableOptions(routePaid.state).some((option) => option.includes("[移開灶底石板]")), true);
  const opened = resolveTurn(routePaid.state,
    availableOptions(routePaid.state).find((option) => option.includes("[移開灶底石板]")), false);
  assert.equal(opened.state.currentLocation, "晚秋茶寮");
  assert.match(hardboiledFallback(opened.event, opened.state), /露出向下的暗道.*仍站在灶旁/);
  const routeRepeated = resolveTurn(routePaid.state, availableOptions(routePaid.state).find((option) => option.startsWith("B. [買暗道]")), false);
  assert.equal(routeRepeated.state.silver, 0);
  assert.match(hardboiledFallback(routeRepeated.event, routeRepeated.state), /你已知道.*沒有再收私銀/);
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
    maxHp: 100, playerHp: 50, playerMp: 10, silver: 20 };
  const buy = availableOptions(clinic).find((option) => option.includes("[買藥帶走]"));
  const stocked = resolveTurn(clinic, buy, false);
  assert.equal(stocked.state.silver, 10);
  assert.equal(stocked.state.inventory.includes(PACKED_MEDICINE), true);
  assert.equal(stocked.state.inventory.length, clinic.inventory.length + 1);
  assert.equal(stocked.state.playerHp, 50);
  const medicine = stocked.options.find((option) => option.startsWith("H. [服用療傷藥]"));
  assert.ok(medicine);
  const healed = resolveTurn(stocked.state, medicine, false);
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
  const state = { ...newGame(), questStep: "sandbox", turn: 13, silver: 10,
    flags: { ...newGame().flags, pendingIncident: "missing_ledger" } };
  const atDice = walkTo(state, "鬼骰坊");
  assert.equal(resolveTurn(atDice, availableOptions(atDice).find((option) => option.includes("[查賭檔]")), false).npcReply.speaker, "祁觀衡");
  const atTea = walkTo(state, "晚秋茶寮");
  assert.equal(resolveTurn(atTea, availableOptions(atTea).find((option) => option.includes("[買帳頁線索]")), false).npcReply.speaker, "容晚秋");
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
  assert.equal(donor.state.factionFunds, STARTING_FACTION_FUNDS + 20);
  assert.equal(donor.state.sectLifeline, 70);
});

test("roads cost time and discovered shortcuts carry risk", () => {
  const state = { ...newGame(), questStep: "sandbox", turn: 2 };
  assert.equal(travelChoices(state, "黑泥街").length, 0);
  assert.deepEqual(ROAD_ADJACENCY["青鋒堂總壇"], ["晚秋茶寮", "鬼骰坊", "堂口舊賬房"]);
  const discovered = { ...state, worldFlags: ["熟記市集暗巷"] };
  const shortcut = travelChoices(discovered, "黑泥街")[0];
  assert.equal(shortcut.turns, 1);
  const trip = resolveTurn(discovered, shortcut.label, false);
  assert.equal(trip.state.currentLocation, "黑泥街");
  assert.equal(trip.state.turn, 3);
  const outcomes = new Set();
  for (let silver = 0; silver < 100; silver++) {
    const start = { ...discovered, silver };
    const first = resolveTurn(start, shortcut.label, false);
    const replay = resolveTurn(start, shortcut.label, false);
    assert.equal(first.state.playerHp, replay.state.playerHp);
    outcomes.add(first.state.playerHp);
  }
  assert.deepEqual([...outcomes].sort((a, b) => a - b), [state.playerHp - 6, state.playerHp]);
  const roadTrip = walkTo(state, "黑泥街");
  assert.equal(roadTrip.turn, 4);
  assert.equal(roadTrip.sectLifeline, 60);
});

test("ordinary road choices include the three investigation sites", () => {
  const expected = {
    "青鋒堂總壇": ["晚秋茶寮", "鬼骰坊", "堂口舊賬房"],
    "晚秋茶寮": ["青鋒堂總壇", "苦煙館", "黑泥街"],
    "鬼骰坊": ["青鋒堂總壇", "苦煙館", "夜雨樓", "堂口舊賬房", "醉春樓後巷"],
    "苦煙館": ["晚秋茶寮", "鬼骰坊", "裂石擂", "夜雨樓"],
    "黑泥街": ["晚秋茶寮", "裂石擂", "廢棄更樓"],
    "裂石擂": ["黑泥街", "苦煙館", "廢棄更樓"],
    "夜雨樓": ["鬼骰坊", "苦煙館", "醉春樓後巷"],
    "堂口舊賬房": ["青鋒堂總壇", "鬼骰坊"],
    "廢棄更樓": ["黑泥街", "裂石擂"],
    "醉春樓後巷": ["夜雨樓", "鬼骰坊"],
  };
  assert.deepEqual(ROAD_ADJACENCY, expected);
  for (const [from, neighbors] of Object.entries(expected)) {
    const state = { ...newGame(), questStep: "sandbox", currentLocation: from, turn: 2 };
    for (const destination of Object.keys(expected)) {
      const road = travelChoices(state, destination).find((choice) => choice.kind === "road");
      assert.equal(Boolean(road), neighbors.includes(destination), `${from} → ${destination}`);
      if (!road) continue;
      const moved = resolveTurn(state, road.label, false);
      assert.equal(moved.state.currentLocation, destination);
      assert.equal(moved.state.turn, state.turn + 1);
      assert.equal(moved.state.playerMp, state.playerMp - 1);
    }
  }
});

test("old landmark errands are absent from current choices", () => {
  assert.equal(MISSIONS.length, PROLOGUE_LANDMARKS.length);
  assert.deepEqual(MISSIONS.map(({ origin, target, title, clue }) => [origin, target, title, clue]), [
    ["青鋒堂總壇", "黑泥街", "守街名冊", "同門守街名冊"],
    ["晚秋茶寮", "夜雨樓", "失蹤腳夫", "刀手進城路線"],
    ["黑泥街", "晚秋茶寮", "雙重勒索", "街坊願意守街"],
    ["鬼骰坊", "苦煙館", "查扣假帳", "假借據完成"],
    ["苦煙館", "裂石擂", "送猛藥", "拳手暗傷底細"],
    ["裂石擂", "鬼骰坊", "買定離手", "擂台賭盤走勢"],
    ["夜雨樓", "青鋒堂總壇", "城主府密報", "城東記恨暗殺"],
  ]);
  for (const mission of MISSIONS) {
    const origin = { ...newGame(), questStep: "sandbox", currentLocation: mission.origin };
    assert.ok(!availableOptions(origin).some((option) => /\[(?:領差|辦差|速辦)\]/.test(option)));
    assert.ok(!availableOptions({ ...origin, currentLocation: mission.target }).some((option) => /\[(?:領差|辦差|速辦)\]/.test(option)));
  }
});

test("old mission acceptance and completion flags load without offering errands", () => {
  const accepted = normalizeState({ ...newGame(), questStep: "sandbox", currentLocation: "苦煙館",
    worldFlags: ["換封傷藥已領"] });
  assert.deepEqual(accepted.activeMissions, ["tainted_medicine"]);
  assert.ok(!availableOptions({ ...accepted, currentLocation: "裂石擂" }).some((option) => /\[(?:領差|辦差|速辦)\]/.test(option)));
  const complete = normalizeState({ ...newGame(), questStep: "sandbox", currentLocation: "夜雨樓",
    activeMissions: ["hidden_spy"], worldFlags: ["陌生恩客完成"] });
  assert.deepEqual(complete.activeMissions, []);
  assert.ok(!availableOptions(complete).some((option) => option.includes("城主府密報")));
  const oldClue = normalizeState({ ...newGame(), questStep: "sandbox", currentLocation: "鬼骰坊",
    worldFlags: ["城東假契證據", "假借據完成"] });
  assert.ok(oldClue.worldFlags.includes("假借據完成"));
  assert.ok(!availableOptions(oldClue).some((option) => option.includes("查扣假帳")));
  const midgame = normalizeState({ ...newGame(), questStep: "sandbox", turn: 25,
    worldFlags: ["市集殘局已定", "同門守街名冊"] });
  assert.ok(midgame.worldFlags.includes("何不歸密令暗查內鬼"));
  assert.ok(availableOptions({ ...midgame, currentLocation: "青鋒堂總壇" }).some((option) => option.includes("[指認內鬼]")));
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
  const prepared = { ...newGame(), questStep: "sandbox", turn: 69, sectLifeline: 0,
    worldFlags: MISSIONS.slice(0, 3).map((mission) => mission.clue) };
  const crisis = resolveTurn(prepared, "C. [盤點] 清點堂口帳目。", false);
  assert.equal(crisis.state.sectLifeline, 0);
  assert.equal(crisis.state.flags.finalCrisis, true);
  assert.equal(crisis.options.length, 3);
  const collapse = resolveTurn(crisis.state, crisis.options[0], false);
  assert.equal(collapse.state.flags.ending, "城西陷落");
  assert.match(collapse.event, /據名冊封死黑泥街暗巷/);
  assert.equal(collapse.options.length, 1);
  assert.match(collapse.options[0], /回顧結局/);
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

test("rescuing Lu opens exploration with Ho's nightfall deadline", () => {
  const base = newGame();
  const aftermath = { ...base, questStep: "sandbox", currentLocation: "黑泥街", turn: 8,
    worldFlags: ["救下陸千帆", "擊退伏擊刀手"],
    flags: { ...base.flags, marketAftermath: true, marketAftermathKind: "victory", lastIncidentTurn: 8 } };
  const settled = resolveTurn(aftermath,
    availableOptions(aftermath).find((option) => option.includes("[安頓收隊]")), false);
  assert.equal(settled.state.flags.marketAftermath, false);
  assert.match(settled.event, /何不歸的密信/);
  assert.match(settled.event, /暗查陳彪、老馬與白冷/);
  assert.ok(settled.state.worldFlags.includes("何不歸密令暗查內鬼"));
  assert.equal(hasOffSceneDirectSpeech(settled.state, settled.event), false);
});

test("spy investigation distinguishes rumors from evidence and resolves the accusation", () => {
  const base = newGame();
  const active = { ...base, questStep: "sandbox", currentLocation: "青鋒堂總壇", turn: 12,
    worldFlags: ["何不歸密令暗查內鬼"], flags: { ...base.flags, lastIncidentTurn: 12 } };
  assert.equal(travelChoices(active, "碼頭").length, 0);
  assert.ok(travelChoices(active, "堂口舊賬房").length);
  let state = { ...active, currentLocation: "苦煙館" };
  const shallow = availableOptions(state).find((option) => option.includes("[速查] 驗傷者兵刃"));
  const rumor = resolveTurn(state, shallow, false);
  assert.match(rumor.event, /陳彪/);
  assert.equal(rumor.state.worldFlags.includes("軟筋散調撥總哨"), false);
  state = { ...rumor.state, pendingEncounter: undefined, lastEncounterTurn: rumor.state.turn,
    flags: { ...rumor.state.flags, pendingIncident: undefined, lastIncidentTurn: rumor.state.turn } };
  const clinic = resolveTurn(state, availableOptions(state).find((option) => option.includes("[細查] 驗傷者兵刃")), false);
  assert.ok(clinic.state.worldFlags.includes("軟筋散調撥總哨"));
  state = { ...clinic.state, currentLocation: "黑泥街", pendingEncounter: undefined,
    flags: { ...clinic.state.flags, pendingIncident: undefined, lastIncidentTurn: clinic.state.turn } };
  state = resolveTurn(state, availableOptions(state).find((option) => option.includes("[細查] 追問撤哨命令")), false).state;
  state = { ...state, currentLocation: "醉春樓後巷", pendingEncounter: undefined,
    flags: { ...state.flags, pendingIncident: undefined, lastIncidentTurn: state.turn } };
  state = resolveTurn(state, availableOptions(state).find((option) => option.includes("[細查] 截玄武樓線人")), false).state;
  state = { ...state, currentLocation: "青鋒堂總壇" };
  const accused = resolveTurn(state, availableOptions(state).find((option) => option.includes("[指認內鬼] 向何不歸指認白冷")), false);
  assert.equal(accused.state.flags.spyExposed, true);
  assert.ok(accused.state.worldFlags.includes("陳彪與老馬洗清嫌疑"));
  const wrong = resolveTurn({ ...active, currentLocation: "青鋒堂總壇" },
    availableOptions({ ...active, currentLocation: "青鋒堂總壇" }).find((option) => option.includes("指認老馬")), false);
  assert.equal(wrong.state.flags.spyExposed, false);
  assert.match(wrong.event, /白冷趁亂撤走城門暗哨/);
});

test("spy evidence survives saves and an unexposed spy makes the night assault harder", () => {
  const base = newGame();
  const state = { ...base, questStep: "sandbox", currentLocation: "青鋒堂總壇", turn: 69,
    sectLifeline: 80, worldFlags: ["何不歸密令暗查內鬼", "軟筋散調撥總哨", "黑泥街總哨撤令", "總哨城防盲區圖"],
    flags: { ...base.flags, lastIncidentTurn: 69 } };
  const saved = normalizeState(state);
  assert.ok(saved.worldFlags.includes("總哨城防盲區圖"));
  const exposed = resolveTurn(saved, availableOptions(saved).find((option) => option.includes("指認白冷")), false);
  assert.equal(exposed.state.flags.spyExposed, true);
  assert.equal(exposed.state.flags.finalCrisis, true);
  const defended = resolveTurn(exposed.state, exposed.options.find((option) => option.includes("[固守城西]")), false);
  const noAccusation = resolveTurn({ ...state, turn: 70, flags: { ...state.flags, finalCrisis: true } }, ENDING_OPTIONS[0], false);
  assert.equal(defended.state.flags.ending, "守住城西");
  assert.equal(noAccusation.state.flags.spyExposed, false);
  assert.match(noAccusation.event, /白冷入夜時撤走暗哨/);
  assert.ok(noAccusation.state.sectLifeline < defended.state.sectLifeline);
});

test("the final battle report follows secured support and names missing defenses", () => {
  const base = { ...newGame(), questStep: "sandbox", turn: 70,
    flags: { ...newGame().flags, finalCrisis: true } };
  const clues = ["同門守街名冊", "假借據完成", "拳手暗傷底細"];
  const won = resolveTurn({ ...base, sectLifeline: 60, worldFlags: clues }, ENDING_OPTIONS[0], false);
  assert.equal(won.state.flags.ending, "守住城西");
  assert.equal(won.state.flags.finalSupport, 3);
  assert.match(won.event, /據名冊封死黑泥街暗巷/);
  assert.match(won.event, /揚出假帳.*臨陣退縮/);
  assert.match(won.event, /猛藥來源.*避開了毒害/);
  assert.match(won.event, /裴無鋒並未現身/);
  assert.doesNotMatch(won.event, /未能掌握街區暗巷/);

  const lost = resolveTurn({ ...base, sectLifeline: 59,
    worldFlags: ["刀手進城路線", "假借據完成", "拳手暗傷底細"] }, ENDING_OPTIONS[0], false);
  assert.equal(lost.state.flags.ending, "城西陷落");
  assert.equal(lost.state.sectLifeline, 34);
  assert.match(lost.event, /未能掌握街區暗巷.*撕破防線/);
  assert.doesNotMatch(lost.event, /假帳未查清|猛藥來源未查明/);
});

test("successive road edges can pass turn seventy before the crisis opens", () => {
  const state = { ...newGame(), questStep: "sandbox", turn: 68, sectLifeline: 80 };
  const first = resolveTurn(state, travelChoices(state, "鬼骰坊")[0].label, false);
  assert.equal(first.state.turn, 69);
  const arrival = resolveTurn(first.state, travelChoices(first.state, "夜雨樓")[0].label, false);
  assert.equal(arrival.state.turn, 70);
  assert.equal(arrival.state.flags.finalCrisis, true);
});

test("saving Lu Qianfan changes trust, injury, and help in the prologue", () => {
  const scene = { ...newGame(), questStep: "market_collection", currentLocation: "黑泥街",
    inventory: ["【金創散】"] };
  const choices = availableOptions(scene);
  const first = choices.map((choice) => resolveTurn(scene, choice, false).state);
  assert.deepEqual(first.map((state) => state.relationships["陸千帆"].trust), [1, 0, 0, 0, 1]);
  assert.equal(first[1].relationships["陸千帆"].wounded, true);
  const ambush = resolveTurn(first[0], availableOptions(first[0]).find((option) => option.startsWith("B.")), false);
  const guard = availableOptions(ambush.state).find((option) => option.startsWith("B. [護住同門]"));
  assert.ok(guard);
  const guarded = resolveTurn(ambush.state, guard, false);
  assert.equal(guarded.state.relationships["陸千帆"].trust, 2);
  assert.ok(guarded.state.worldFlags.includes("伏擊中護住陸千帆"));
  const betrayed = resolveTurn(scene, "F. [自訂手段] 出賣陸千帆", false).state;
  assert.equal(betrayed.relationships["陸千帆"].estranged, true);
  assert.equal(betrayed.relationships["陸千帆"].trust, -3);
  assert.ok(!availableOptions({ ...betrayed, questStep: "sandbox", combat: undefined }).some((option) => option.includes("雙重勒索")));

  const trusted = { ...guarded.state, questStep: "sandbox", combat: undefined };
  const directions = availableOptions(trusted).find((option) => option.startsWith("M. [請陸千帆指路]"));
  assert.ok(directions);
  const guided = resolveTurn(trusted, directions, false);
  assert.ok(guided.state.worldFlags.includes("熟記市集暗巷"));
  assert.ok(!availableOptions(guided.state).some((option) => option.startsWith("M. [請陸千帆指路]")));

  const wounded = { ...first[1], questStep: "sandbox", combat: undefined, currentLocation: "苦煙館", silver: 10 };
  const medicine = availableOptions(wounded).find((option) => option.startsWith("M. [為陸千帆求藥]"));
  assert.ok(medicine);
  const healed = resolveTurn(wounded, medicine, false);
  assert.equal(healed.state.currentLocation, "苦煙館");
  assert.match(healed.event, /^你在苦煙館/);
  assert.match(healed.event, /回信報陸千帆/);
  assert.equal(healed.state.silver, 0);
  assert.equal(healed.state.relationships["陸千帆"].wounded, false);
  assert.equal(healed.state.relationships["陸千帆"].trust, 1);
});

test("landmark choices prepare different NPCs and survive old saves", () => {
  const complete = (missionId, careful) => {
    const mission = MISSIONS.find((item) => item.id === missionId);
    return normalizeState({ ...newGame(), relationships: undefined,
      worldFlags: [`${mission.title}完成`, ...(careful ? [mission.clue] : [])] });
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

test("repeatable money jobs and old errand contracts are unavailable", () => {
  const market = { ...newGame(), questStep: "sandbox", currentLocation: "黑泥街", turn: 3 };
  const qualified = { ...newGame(), questStep: "sandbox", currentLocation: "夜雨樓", turn: 4,
    knownMoves: { short_punch: 2 }, worldFlags: MISSIONS.slice(0, 3).map((mission) => `${mission.title}完成`) };
  for (const state of [market, { ...market, currentLocation: "鬼骰坊" }, qualified])
    assert.equal(availableOptions(state).some((option) => /\[(?:搬貨|押小|私銀放貸|收回私貸|領追債令|和談追債|強追欠款|接暗殺令)\]/.test(option)), false);
  const rejected = resolveTurn(market, "B. [搬貨] 替商販搬貨照料騾車", false);
  assert.equal(rejected.state.turn, market.turn);
  assert.equal(rejected.state.silver, market.silver);
  const oldLoan = normalizeState({ ...newGame(), silver: 0,
    flags: { ...newGame().flags, loanDueTurn: 20 } });
  assert.equal(oldLoan.silver, 20);
  assert.equal(oldLoan.flags.loanDueTurn, 0);
  assert.equal(normalizeState(oldLoan).silver, 20);
});
