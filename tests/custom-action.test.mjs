import assert from "node:assert/strict";
import test from "node:test";
import { availableOptions, normalizeState, recordMarketNpcReply, resolveMarketDialogue,
  resolveMarketIntent, resolveSceneAttempt, resolveSocialIntent, resolveTurn } from "../lib/game-engine.ts";
import { newRelationships } from "../lib/companion-relations.ts";
import { claimsUnacquiredObject, hasOffSceneActionReference, interpretGroundedObjectHandling, interpretMarketText, isMarketIntentScene, sceneAnchors, unavailableCarriedItem, validateCustomDecision } from "../lib/custom-action.ts";
import { playerStatusContext } from "../lib/player-status-context.ts";
import { lastTurnContext } from "../lib/last-turn-context.ts";
import { createCombat } from "../lib/combat-engine.ts";
import { inferSocialIntent, marketDialogueTarget } from "../lib/social-influence.ts";
import { objectStatus, sceneFacts } from "../lib/scene-state.ts";
import { appendDangerCue, explicitActionSteps, resolveActionSequence, sceneDangerCue, validatedActionSteps } from "../lib/action-sequence.ts";
import { hardboiledFallback } from "../lib/narrative-style.ts";

function state() {
  return {
    turn: 4, playerName: "阿七", background: "賭坊收帳人", trait: "察言觀色",
    currentLocation: "黑泥街", inventory: ["【金創散】"], maxInventory: 4,
    playerHp: 100, maxHp: 100, hpScaleVersion: 2, playerMp: 50, maxMp: 50,
    silver: 0, factionFunds: 10, sectLifeline: 60, worldFlags: [], relationships: newRelationships(),
    questStep: "market_collection",
    flags: { tookHerbs: true, visitedYung: true, collectedMarketFee: false, marketAmbushTriggered: false },
  };
}

test("ordered tasks stay separate while a single combat maneuver stays together", () => {
  const [first, second] = explicitActionSteps("先把金創散敷在陸千帆傷口，再向張斷骨談規費");
  assert.equal(first, "把金創散敷在陸千帆傷口");
  assert.equal(second, "向張斷骨談規費");
  const decision = interpretMarketText(state(), first);
  assert.equal(decision.kind, "market_intent");
  assert.equal(decision.plan.approach, "救護");
  assert.deepEqual(explicitActionSteps("左手以砧板擋刀，右手迎擊刀手"), ["左手以砧板擋刀，右手迎擊刀手"]);
  assert.deepEqual(explicitActionSteps("問堂主借刀，再送藥到苦煙館"), ["問堂主借刀", "送藥到苦煙館"]);
});

test("ordered Blackmud actions settle against the updated scene and stop at the ambush", async () => {
  const words = "先替陸千帆敷金創散，再逼張斷骨交規費，然後查看巷口";
  const steps = explicitActionSteps(words);
  assert.deepEqual(steps, ["替陸千帆敷金創散", "逼張斷骨交規費", "查看巷口"]);
  assert.deepEqual(validatedActionSteps(words, steps), steps);
  assert.equal(validatedActionSteps(words, [steps[0]]), null);
  assert.deepEqual(explicitActionSteps("左手舉砧板擋刀，右手迎擊刀手"), ["左手舉砧板擋刀，右手迎擊刀手"]);
  const outcome = await resolveActionSequence(state(), steps, async (current, step) => {
    const target = marketDialogueTarget(current, step);
    if (target) return resolveMarketDialogue(current, target, step,
      { reaction: "consider", reason: "尚未同意", memory: "" });
    const decision = interpretMarketText(current, step);
    return decision.kind === "market_intent" ? resolveMarketIntent(current, decision.plan) : null;
  });
  assert.equal(outcome.state.worldFlags.includes("陸千帆已敷藥"), true);
  assert.equal(outcome.state.inventory.includes("【金創散】"), false);
  assert.equal(outcome.state.questStep, "huizhi_ambush");
  assert.deepEqual(outcome.pending, ["查看巷口"]);
  assert.equal(outcome.state.flags.collectedMarketFee, true);
  assert.match(appendDangerCue(outcome.events.join(""), outcome.state), /\n\n（.*刀手.+）$/);
});

test("taking down the meat hook to prepare after treating Lu is one grounded action", () => {
  const aid = resolveTurn(state(), availableOptions(state()).find((option) => option.startsWith("A. [救護同門]")), false);
  assert.equal(aid.state.worldFlags.includes("陸千帆已敷藥"), true);
  const words = "慢慢將鐵鉤取下、備戰";
  assert.deepEqual(explicitActionSteps(words), [words]);
  assert.equal(validatedActionSteps(words, ["慢慢將鐵鉤取下", "備戰"]), null);
  const fullWords = "我靠近肉架，小心取下懸肉鐵鉤，準備用它防備巷口刀手。";
  assert.deepEqual(explicitActionSteps(fullWords), [fullWords]);
  assert.equal(validatedActionSteps(fullWords,
    ["靠近肉架", "小心取下懸肉鐵鉤", "準備用它防備巷口刀手"]), null);
  const fullDecision = interpretGroundedObjectHandling(aid.state, fullWords);
  assert.equal(fullDecision.kind, "market_intent");
  assert.equal(fullDecision.plan.approach, "借物");
  assert.equal(fullDecision.plan.target, "肉檔");
  assert.equal(fullDecision.plan.object, "懸肉鐵鉤");
  assert.equal(interpretGroundedObjectHandling(aid.state, "我不將鐵鉤取下、備戰"), null);
  assert.equal(interpretGroundedObjectHandling(aid.state, "如果將鐵鉤取下備戰會點？"), null);
  const decision = interpretGroundedObjectHandling(aid.state, words);
  assert.ok(decision);
  assert.equal(decision.kind, "market_intent");
  assert.equal(decision.plan.approach, "借物");
  assert.equal(decision.plan.object, "懸肉鐵鉤");
  assert.equal(decision.plan.target, "肉檔");
  const result = resolveMarketIntent(aid.state, decision.plan);
  assert.match(result.event, /扯下肉架鐵鉤/);
  assert.equal(result.state.worldFlags.includes("肉檔鐵鉤已移位"), true);
  assert.equal(result.state.flags.marketIntentHistory.length, 2);
  assert.equal(interpretGroundedObjectHandling(result.state, words), null);
  const board = interpretGroundedObjectHandling(aid.state, "抄起厚砧板備戰");
  assert.equal(board.kind, "market_intent");
  assert.equal(board.plan.object, "厚砧板");
});

test("Edge Case: 動作判定失敗後的短期記憶繼承", () => {
  const scene = normalizeState({ ...state(), playerMp: 0 });
  const firstText = "扯下肉架鐵鉤";
  const firstDecision = interpretGroundedObjectHandling(scene, firstText);
  assert.equal(firstDecision.kind, "market_intent");
  const first = resolveMarketIntent(scene, firstDecision.plan);
  assert.equal(first.state.turn, scene.turn);
  assert.equal(first.state.playerMp, 0);
  assert.equal(first.state.playerHp, scene.playerHp);
  assert.match(first.event, /精力不足.*鐵鉤仍掛在肉架/);
  assert.equal(first.state.sceneState.movedObjects["懸肉鐵鉤"], undefined);
  assert.equal(first.state.worldFlags.includes("肉檔鐵鉤已移位"), false);

  const afterFailure = { ...first.state, history: [{ turn: first.state.turn,
    action: `F. [自訂手段] ${firstText}`, narrative: first.event,
    narrativeSource: "Fallback", preLocation: "黑泥街", postLocation: "黑泥街", questStep: "market_collection" }] };
  const memory = lastTurnContext(afterFailure);
  assert.match(memory, /玩家動作: .*扯下肉架鐵鉤/);
  assert.match(memory, /發生事件: .*精力不足.*鐵鉤仍掛在肉架/);
  assert.match(memory, /玩家動作只代表嘗試，不能當作成功事實/);

  const secondText = "用剛才拿到的鐵鉤攻擊刀手";
  assert.equal(claimsUnacquiredObject(afterFailure, secondText), true);
  const secondDecision = validateCustomDecision({ kind: "scene_attempt", effect: "harm", target: "刀手",
    object: "懸肉鐵鉤", method: secondText }, afterFailure, availableOptions(afterFailure), secondText);
  assert.deepEqual(secondDecision, { kind: "reject", reason: "impossible" });
  const second = resolveSceneAttempt(afterFailure, { effect: "harm", target: "刀手",
    object: "懸肉鐵鉤", method: secondText });
  assert.equal(second.state.turn, afterFailure.turn);
  assert.equal(second.state.sceneState.movedObjects["懸肉鐵鉤"], undefined);
  assert.equal(second.state.combat, undefined);
  assert.match(second.event, /沒有拿到鐵鉤/);

  const prepared = normalizeState({ ...state(), playerMp: 2 });
  const taken = resolveMarketIntent(prepared, interpretGroundedObjectHandling(prepared, firstText).plan);
  assert.equal(taken.state.worldFlags.includes("肉檔鐵鉤已移位"), true);
  assert.equal(claimsUnacquiredObject(taken.state, secondText), false);
});

test("a combat exchange interrupts later instructions even when the fight continues", async () => {
  const opening = { ...state(), questStep: "huizhi_ambush", combat: createCombat("market_ambush", true) };
  const steps = ["擋住刀手", "轉身離開"];
  const outcome = await resolveActionSequence(opening, steps, async (current, step) => {
    const decision = interpretMarketText(current, step);
    return decision.kind === "market_intent" ? resolveMarketIntent(current, decision.plan) : null;
  });
  assert.deepEqual(outcome.attempted, ["擋住刀手"]);
  assert.deepEqual(outcome.pending, ["轉身離開"]);
});

test("a scene change leaves later tasks pending and rejects invented planner steps", async () => {
  assert.equal(validatedActionSteps("先查貨單，再問船工", ["查貨單", "取出不存在的密信"]), null);
  assert.equal(validatedActionSteps("先查貨單，再問船工", ["問船工", "查貨單"]), null);
  assert.equal(validatedActionSteps("先打，再跑", ["跑"]), null);
  const opening = { ...state(), currentLocation: "苦煙館", questStep: "kuyan_medicine" };
  const outcome = await resolveActionSequence(opening, ["趕往市集", "追問張斷骨"], async (current) => {
    current.currentLocation = "黑泥街";
    current.questStep = "market_collection";
    current.turn += 1;
    return { state: current, options: [], event: "你趕到黑泥街。", moneyNote: "" };
  });
  assert.deepEqual(outcome.attempted, ["趕往市集"]);
  assert.deepEqual(outcome.pending, ["追問張斷骨"]);
  assert.equal(outcome.sceneChanged, true);
});

test("a rejected step is distinguished from later unattempted steps", async () => {
  const outcome = await resolveActionSequence(state(), ["取下眼前物件", "再向張斷骨問話"], async (current) =>
    ({ state: current, options: [], event: "眼前沒有這件物事。", moneyNote: "" }));
  assert.deepEqual(outcome.attempted, []);
  assert.equal(outcome.blockedStep, "取下眼前物件");
  assert.deepEqual(outcome.pending, ["再向張斷骨問話"]);
  assert.deepEqual(outcome.events, ["眼前沒有這件物事。"]);
});

test("chapter pressure is shown as a concrete scene cue without a turn countdown", () => {
  const scene = { ...state(), questStep: "chapter_one", currentLocation: "碼頭",
    flags: { ...state().flags, chapterOne: { stage: "shortage", unrest: 17 } } };
  const cue = sceneDangerCue(scene);
  assert.match(cue, /求糧的人群/);
  assert.doesNotMatch(cue, /回合|剩餘/);
  assert.match(appendDangerCue("你查過貨單。", scene), /\n\n（.+）$/);
});

test("negation and hypothetical wording cannot authorize irreversible acts", () => {
  const scene = state();
  const raw = { kind: "special", specials: ["betray"] };
  assert.equal(validateCustomDecision(raw, scene, availableOptions(scene), "我唔會出賣陸千帆，反而護住佢").kind, "reject");
  assert.equal(validateCustomDecision(raw, scene, availableOptions(scene), "如果我出賣陸千帆會點？").kind, "reject");
  const affirmative = validateCustomDecision(raw, scene, availableOptions(scene), "我出賣陸千帆");
  assert.equal(affirmative.kind, "special");
  assert.equal(validateCustomDecision({ kind: "special", specials: ["betray", "maim"] },
    scene, availableOptions(scene), "出賣陸千帆，打斷張斷骨右手").kind, "reject");
  const direct = resolveTurn(scene, "F. [自訂手段] 我唔會出賣陸千帆", false);
  assert.ok(!direct.state.worldFlags.includes("出賣陸千帆"));
});

test("Blackmud free intent persists preparation and reaches combat without spending a charge", () => {
  const scene = { ...state(), customActionUses: 0 };
  assert.equal(isMarketIntentScene(scene), true);
  const raw = { kind: "market_intent", approach: "借物", target: "街口", object: "厚砧板", method: "推歪厚砧板擋住巷口" };
  const parsed = validateCustomDecision(raw, scene, availableOptions(scene), "我推歪厚砧板擋住巷口");
  assert.equal(parsed.kind, "market_intent");
  assert.equal(validateCustomDecision({ ...raw, object: "餿水桶" }, scene, availableOptions(scene), "推翻餿水桶").kind, "reject");
  const prepared = resolveMarketIntent(scene, parsed.plan);
  assert.equal(prepared.state.turn, scene.turn + 1);
  assert.equal(prepared.state.customActionUses, 0);
  assert.equal(prepared.state.sceneState.movedObjects["厚砧板"].includes("傾斜"), true);
  assert.equal(normalizeState(JSON.parse(JSON.stringify(prepared.state))).flags.marketIntentHistory.length, 1);
  assert.equal(prepared.state.questStep, "market_collection");
  const impossibleKnife = resolveMarketIntent(scene, { approach: "進擊", target: "刀手", object: "剁骨刀", method: "隔街搶刀" });
  assert.equal(impossibleKnife.state.turn, scene.turn);
  assert.match(impossibleKnife.event, /不能隔空/);
  assert.match(prepared.state.sceneState.movedObjects["厚砧板"], /傾斜/);
  const rescue = resolveMarketIntent(prepared.state, { approach: "救護", target: "陸千帆", object: "金創散", method: "把金創散敷在陸千帆傷口" });
  assert.equal(rescue.state.questStep, "market_collection");
  assert.equal(rescue.state.inventory.includes("【金創散】"), false);
  assert.equal(rescue.state.worldFlags.includes("陸千帆已敷藥"), true);
  assert.equal(rescue.state.factionFunds, scene.factionFunds);
  assert.equal(rescue.state.customActionUses, 0);
  const collection = resolveTurn(rescue.state, rescue.options.find((option) => option.startsWith("B.")), false);
  assert.equal(collection.state.questStep, "huizhi_ambush");
  assert.equal(collection.state.combat.preparedDefense >= 1, true);
  const defended = resolveMarketIntent(collection.state, { approach: "防守", target: "陸千帆", method: "卡在陸千帆前面接刀" });
  assert.equal(defended.state.customActionUses, 0);
  assert.equal(defended.state.turn, collection.state.turn + 1);
  assert.equal(defended.state.flags.marketIntentHistory.length, 4);
});

test("using a butcher's board during ambush does not invent a carried wooden stick", () => {
  const scene = { ...state(), questStep: "huizhi_ambush", combat: createCombat("market_ambush", true),
    customActionUses: 0 };
  const turn = resolveMarketIntent(scene, { approach: "借物", target: "刀手", object: "厚砧板", method: "推砧板擋刀" });
  assert.match(turn.event, /厚砧板/);
  assert.doesNotMatch(turn.event, /抄起肉案旁的木棍/);
  assert.equal(turn.state.equippedWeapon, "fists");
  assert.equal(turn.state.customActionUses, 0);
});

test("free combat intent still consumes the actual dirty-hand item", () => {
  const scene = { ...state(), questStep: "huizhi_ambush", combat: createCombat("market_ambush", true),
    inventory: ["【生石灰包】"], customActionUses: 0 };
  const raw = { kind: "market_intent", approach: "借物", target: "刀手", object: "生石灰包", method: "撒石灰迷眼" };
  const decision = validateCustomDecision(raw, scene, availableOptions(scene), "撒石灰迷住刀手眼睛");
  assert.equal(decision.kind, "market_intent");
  const turn = resolveMarketIntent(scene, decision.plan);
  assert.equal(turn.state.inventory.includes("【生石灰包】"), false);
  assert.equal(turn.state.customActionUses, 0);
  assert.equal(turn.state.turn, scene.turn + 1);
});

test("Edge Case: 連續消耗同一物品直至無中生有", () => {
  const scene = normalizeState({ ...state(), inventory: ["【生石灰包】"],
    flags: { ...state().flags, darkHandInitialized: true } });
  const text = "對刀手撒出生石灰包";
  const firstAction = interpretMarketText(scene, text);
  assert.equal(firstAction.kind, "market_intent");
  const first = resolveMarketIntent(scene, firstAction.plan);
  assert.deepEqual(first.state.inventory, []);
  assert.match(playerStatusContext(first.state), /行囊物品: 無/);
  assert.equal(first.state.turn, scene.turn + 1);
  assert.equal(unavailableCarriedItem(first.state, text), true);
  const secondAction = validateCustomDecision({ kind: "market_intent", approach: "借物",
    target: "刀手", object: "生石灰包", method: text }, first.state, availableOptions(first.state), text);
  assert.deepEqual(secondAction, { kind: "reject", reason: "impossible" });
  const second = resolveMarketIntent(first.state, firstAction.plan);
  assert.equal(second.state.turn, first.state.turn);
  assert.deepEqual(second.state.inventory, []);
  assert.equal(second.state.playerHp, first.state.playerHp);
  assert.equal(second.state.playerMp, first.state.playerMp);
  assert.equal(second.state.sectLifeline, first.state.sectLifeline);
  assert.equal(availableOptions(second.state).some((option) => option.includes("[撒生石灰]")), false);
});

test("using a carried dark hand before the ambush spends it and exposes the knife men", () => {
  const scene = { ...state(), inventory: ["【生石灰包】"], customActionUses: 0 };
  const turn = resolveMarketIntent(scene, { approach: "借物", target: "刀手", object: "生石灰包", method: "撒石灰逼刀手現身" });
  assert.equal(turn.state.inventory.includes("【生石灰包】"), false);
  assert.equal(turn.state.questStep, "huizhi_ambush");
  assert.equal(turn.state.customActionUses, 0);
  assert.match(turn.event, /石灰|暗手/);
});

test("barehanded disarm is an attempted grapple, not an impossible scene object", () => {
  const scene = state();
  const text = "空手入白刃, 搶走刀手手上武器";
  const decision = interpretMarketText(scene, text);
  assert.equal(decision.kind, "market_intent");
  assert.equal(decision.plan.approach, "奪械");
  assert.equal(decision.plan.target, "刀手");
  assert.equal(decision.plan.object, undefined);
  const attempted = resolveMarketIntent(scene, decision.plan);
  assert.equal(attempted.state.turn, scene.turn + 1);
  assert.equal(attempted.state.questStep, "huizhi_ambush");
  assert.ok(attempted.state.playerHp < scene.playerHp);
  assert.equal(attempted.state.inventory.includes("【奪來短刀】"), false);
  assert.match(attempted.event, /刀仍在他掌中/);
  assert.equal(interpretMarketText(scene, "我唔搶走刀手手上武器").kind, "reject");
  assert.equal(interpretMarketText(scene, "如果我搶走刀手手上武器會點?").kind, "reject");
});

test("unlisted body tactics advance combat without turning into a preset move", () => {
  const scene = { ...state(), questStep: "huizhi_ambush", combat: createCombat("market_ambush", true) };
  const raw = { kind: "scene_attempt", effect: "disrupt", target: "刀手", gesture: "踩刀手腳背" };
  const parsed = validateCustomDecision(raw, scene, availableOptions(scene), "我踩刀手腳背，叫佢失平衡");
  assert.equal(parsed.kind, "scene_attempt");
  const first = resolveSceneAttempt(scene, parsed.plan);
  assert.equal(first.state.turn, scene.turn + 1);
  assert.ok(first.state.combat.opening > scene.combat.opening);
  assert.match(first.event, /踩刀手腳背/);
  assert.doesNotMatch(first.event, /木棍|佯攻搶出/);
  assert.equal(first.state.flags.marketIntentHistory.at(-1).approach, "自訂");
  const second = resolveSceneAttempt(first.state, { effect: "protect", target: "陸千帆", method: "咬住刀手袖口擋佢", gesture: "咬住刀手袖口" });
  assert.equal(second.state.turn, first.state.turn + 1);
  assert.ok(second.state.playerMp < first.state.playerMp);
});

test("generic scene gate respects possession, weight, and real disarm risk", () => {
  const scene = state();
  const unknown = validateCustomDecision({ kind: "scene_attempt", effect: "disrupt", target: "刀手", object: "手機" },
    scene, availableOptions(scene), "用手機掟刀手");
  assert.equal(unknown.kind, "reject");
  const tooHeavy = resolveSceneAttempt(scene, { effect: "harm", target: "刀手", object: "厚砧板", method: "掟厚砧板打刀手" });
  assert.equal(tooHeavy.state.turn, scene.turn);
  assert.match(tooHeavy.event, /沉重/);
  const wrongHolder = resolveSceneAttempt(scene, { effect: "seize", target: "刀手", object: "剁骨刀", method: "搶剁骨刀" });
  assert.equal(wrongHolder.state.turn, scene.turn);
  assert.match(wrongHolder.event, /張斷骨/);
  const grabbed = resolveSceneAttempt(scene, { effect: "seize", target: "刀手", object: "刀手短刀", method: "抓刀手手上武器" });
  assert.equal(grabbed.state.turn, scene.turn + 1);
  assert.ok(grabbed.state.playerHp < scene.playerHp);
  assert.match(grabbed.event, /刀仍在他掌中/);
});

test("butcher knife ownership and position agree across free-action routes and saves", () => {
  const generic = resolveSceneAttempt(state(), { effect: "seize", target: "張斷骨",
    object: "剁骨刀", method: "扣住張斷骨手腕，震落剁骨刀" });
  const legacy = resolveMarketIntent(state(), { approach: "借物", target: "張斷骨",
    object: "剁骨刀", method: "扣住張斷骨手腕，震落剁骨刀" });
  for (const turn of [generic, legacy]) {
    assert.equal(objectStatus(turn.state.sceneState, "剁骨刀").holder, "");
    assert.equal(objectStatus(turn.state.sceneState, "剁骨刀").reach, "move");
    assert.match(turn.state.sceneState.movedObjects["剁骨刀"], /肉案下/);
    assert.equal(turn.state.worldFlags.includes("張斷骨失刀"), true);
    assert.doesNotMatch(sceneFacts("黑泥街", turn.state.sceneState), /由張斷骨持有/);
    const resumed = normalizeState(JSON.parse(JSON.stringify(turn.state)));
    assert.equal(objectStatus(resumed.sceneState, "剁骨刀").holder, "");
    const blocked = resolveSceneAttempt(resumed, { effect: "seize", target: "刀手",
      object: "剁骨刀", method: "交手中再撿剁骨刀" });
    assert.equal(blocked.state.turn, resumed.turn);
    assert.match(blocked.event, /碰不到/);
  }
  const olderSave = normalizeState({ ...state(), sceneState: undefined, worldFlags: ["張斷骨失刀"] });
  assert.equal(objectStatus(olderSave.sceneState, "剁骨刀").holder, "");
});

test("generic attempts follow the positive clause and retreat into the actual alley", () => {
  const scene = state();
  const raw = { kind: "scene_attempt", effect: "harm", target: "刀手", gesture: "踩刀手腳背" };
  assert.equal(validateCustomDecision(raw, scene, availableOptions(scene), "我唔踩刀手腳背").kind, "reject");
  const switched = validateCustomDecision({ ...raw, effect: "protect", target: "陸千帆", gesture: "護住陸千帆" },
    scene, availableOptions(scene), "我唔踩刀手腳背，反而護住陸千帆");
  assert.equal(switched.kind, "scene_attempt");
  const retreated = resolveSceneAttempt(scene, { effect: "move", target: "陸千帆", method: "扶陸千帆退入巷尾" });
  assert.equal(retreated.state.combat, undefined);
  assert.equal(retreated.state.flags.alleyEscape, true);
  assert.equal(retreated.state.questStep, "sandbox");
  assert.doesNotMatch(retreated.options.join(" "), /巡街收規|搬貨/);
});

test("a barehanded rescue creates no phantom board and medicine is spent", () => {
  const scene = state();
  const bare = resolveSceneAttempt(scene, { effect: "protect", target: "陸千帆", method: "用肩頂住陸千帆" });
  assert.equal(bare.state.worldFlags.includes("肉案已作遮掩"), false);
  assert.equal(bare.state.worldFlags.includes("救下陸千帆"), true);
  const treated = resolveSceneAttempt(scene, { effect: "protect", target: "陸千帆", object: "金創散", method: "把金創散按上陸千帆傷口" });
  assert.equal(treated.state.inventory.includes("【金創散】"), false);
  assert.equal(treated.state.relationships["陸千帆"].wounded, false);
});

test("free treatment and preset collection share one medicine state", () => {
  const scene = { ...state(), inventory: ["【金創散】", "【止血散】"] };
  const free = resolveSceneAttempt(scene, { effect: "protect", target: "陸千帆",
    object: "金創散", method: "把金創散按上陸千帆傷口" });
  assert.equal(free.state.inventory.includes("【金創散】"), false);
  assert.equal(free.state.inventory.includes("【止血散】"), true);
  assert.equal(free.state.worldFlags.includes("陸千帆已敷藥"), true);
  assert.match(free.event, /金創散按在陸千帆傷口/);
  assert.doesNotMatch(free.event, /挪動金創散/);
  assert.equal(free.options.some((option) => option.includes("[救護同門]")), false);
  assert.equal(free.options.some((option) => option.startsWith("B.")), true);
  const resumed = normalizeState(JSON.parse(JSON.stringify(free.state)));
  assert.equal(availableOptions(resumed).some((option) => option.includes("[救護同門]")), false);
  const stale = resolveTurn(free.state, availableOptions(scene).find((option) => option.startsWith("A.")), false);
  assert.equal(stale.state.turn, free.state.turn);
  const repeated = resolveSceneAttempt(free.state, { effect: "protect", target: "陸千帆",
    object: "止血散", method: "再敷止血散" });
  assert.equal(repeated.state.turn, free.state.turn);
  assert.equal(repeated.state.inventory.includes("【止血散】"), true);

  const collected = resolveTurn(free.state, free.options.find((option) => option.startsWith("B.")), false);
  assert.equal(collected.state.factionFunds, scene.factionFunds + 50);
  assert.equal(collected.state.inventory.includes("【止血散】"), true);
  assert.equal(collected.state.worldFlags.includes("陸千帆已敷藥"), true);
  assert.doesNotMatch(collected.event, /敷上|金創散/);

  const preset = resolveTurn(scene, availableOptions(scene).find((option) => option.startsWith("A.")), false);
  assert.equal(preset.state.factionFunds, scene.factionFunds);
  assert.equal(preset.state.worldFlags.includes("陸千帆已敷藥"), true);
  assert.equal(preset.state.inventory.includes("【金創散】"), false);
  assert.equal(preset.state.inventory.includes("【止血散】"), true);
  const presetCollected = resolveTurn(preset.state, preset.options.find((option) => option.startsWith("B.")), false);
  assert.equal(collected.state.relationships["陸千帆"].trust, presetCollected.state.relationships["陸千帆"].trust);
  assert.equal(collected.state.factionFunds, presetCollected.state.factionFunds);
});

test("market collection without medicine does not invent a treatment item", () => {
  const scene = { ...state(), inventory: [] };
  const option = availableOptions(scene).find((item) => item.startsWith("A."));
  assert.match(option, /撕布壓住/);
  const turn = resolveTurn(scene, option, false);
  assert.doesNotMatch(turn.event, /金創散|止血膏藥|敷藥/);
  assert.equal(turn.state.worldFlags.includes("陸千帆已敷藥"), false);
});

test("a prepared disarm can win the knife, but a full bag leaves it on the ground", () => {
  const scene = { ...state(), questStep: "huizhi_ambush", combat: createCombat("market_ambush", true),
    flags: { ...state().flags, marketAmbushTriggered: true } };
  const feint = availableOptions(scene).find((option) => option.startsWith("D."));
  const opened = resolveTurn(scene, feint, false);
  assert.ok(opened.state.combat.opening >= 3);
  const plan = { approach: "奪械", target: "刀手", method: "空手入白刃，奪他手上短刀" };
  const seized = resolveMarketIntent(opened.state, plan);
  assert.equal(seized.state.combat, undefined);
  assert.equal(seized.state.equippedWeapon, "captured_knife");
  assert.ok(seized.state.inventory.includes("【奪來短刀】"));
  assert.ok(normalizeState(seized.state).inventory.includes("【奪來短刀】"));
  const fullBag = { ...opened.state, inventory: ["一", "二", "三", "四"] };
  const knockedAway = resolveMarketIntent(fullBag, plan);
  assert.equal(knockedAway.state.inventory.length, 4);
  assert.equal(knockedAway.state.equippedWeapon, "fists");
  assert.equal(knockedAway.state.sceneState.movedObjects["刀手短刀"], "黑泥街肉案下");
});

test("repeated preparation makes the waiting knife men strike on the third turn", () => {
  const scene = { ...state(), customActionUses: 0 };
  const first = resolveMarketIntent(scene, { approach: "查探", target: "街口", method: "看巷口腳印" });
  const second = resolveMarketIntent(first.state, { approach: "交涉", target: "陸千帆", method: "跟陸千帆對手勢" });
  assert.equal(second.state.questStep, "market_collection");
  assert.match(second.event, /巷口灰衣人已逼到肉檔邊/);
  const third = resolveMarketIntent(second.state, { approach: "查探", target: "刀手", method: "再看刀手袖口" });
  assert.equal(third.state.questStep, "huizhi_ambush");
  assert.match(third.event, /刀手已等不下去/);
});

test("asking Zhang about the knife men does not silently become debt collection", () => {
  const scene = state();
  const asked = resolveMarketIntent(scene, { approach: "交涉", target: "張斷骨", method: "問張斷骨巷口刀手係邊個" });
  assert.equal(asked.state.questStep, "market_collection");
  assert.equal(asked.state.factionFunds, scene.factionFunds);
  assert.equal(asked.state.worldFlags.includes("張斷骨避談眼線"), true);
});

test("offline Blackmud wording resolves a grounded action and respects negation", () => {
  const scene = state();
  const board = interpretMarketText(scene, "我推歪厚砧板擋住巷口");
  assert.equal(board.kind, "market_intent");
  assert.equal(board.plan.object, "厚砧板");
  assert.equal(interpretMarketText(scene, "我唔會出賣陸千帆").kind, "reject");
  const medicine = interpretMarketText(scene, "我先替陸千帆敷上金創散");
  assert.equal(medicine.kind, "market_intent");
  assert.equal(medicine.plan.approach, "救護");
});

test("offsite people and absent props cannot be silently changed into local actions", () => {
  const market = state();
  assert.equal(hasOffSceneActionReference(market, "我問顧忘生可有膏藥"), true);
  assert.equal(interpretMarketText(market, "我問顧忘生可有膏藥").kind, "reject");
  assert.equal(hasOffSceneActionReference(market, "我用木棍打刀手"), true);
  assert.equal(interpretMarketText(market, "我用木棍打刀手").kind, "reject");
  assert.equal(interpretMarketText(market, "我用神器打刀手").kind, "reject");
  assert.equal(interpretMarketText(market, "我用拳頭打刀手").kind, "market_intent");
  assert.equal(validateCustomDecision({ kind: "scene_attempt", effect: "harm", target: "刀手",
    gesture: "用木棍打刀手" }, market, [], "我用木棍打刀手").kind, "reject");
  assert.equal(hasOffSceneActionReference(market, "我記著顧忘生的話，推厚砧板擋刀"), false);
  const hall = { ...market, questStep: "sandbox", currentLocation: "青鋒堂總壇" };
  assert.equal(hasOffSceneActionReference(hall, "我拿茶寮的沸水大銅壺砸人"), true);
  assert.equal(hasOffSceneActionReference(hall, "我用神器查帳"), true);
  const alley = { ...market, questStep: "sandbox", flags: { ...market.flags, alleyEscape: true } };
  assert.ok(!sceneAnchors(alley).includes("張斷骨"));
  const incident = { ...market, questStep: "sandbox", flags: { ...market.flags, pendingIncident: "market_raid" } };
  assert.equal(marketDialogueTarget(incident, "張斷骨，我問你一件事"), undefined);
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
  assert.equal(first.state.sectLifeline, 62);
  assert.ok(first.state.worldFlags.includes("黑泥街機變查線索"));
  const second = resolveTurn(first.state, action, false, { goal: "查線索", anchor: "肉案" });
  assert.equal(second.state.sectLifeline, 62);
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
  const steady = { ...first.state, pendingEncounter: undefined, lastEncounterTurn: first.state.turn };
  const crisis = resolveTurn(steady, "D. [盯梢] 留意玄武樓眼線。", false);
  assert.equal(crisis.state.turn, 70);
  assert.equal(crisis.state.flags.finalCrisis, true);
  assert.equal(crisis.state.flags.customEchoes.length, 0);
});

test("free actions remain available after old custom charges are exhausted", () => {
  const fresh = state();
  assert.equal(normalizeState({ ...fresh, customActionUses: 9 }).customActionUses, 2);
  const empty = { ...fresh, questStep: "sandbox", currentLocation: "青鋒堂總壇", customActionUses: 0, silver: 50 };
  assert.ok(!availableOptions(empty).some((option) => option.startsWith("N. [請堂主授機變]")));
  const used = resolveTurn(empty, "F. [自訂手段] 翻帳簿查錯漏", false,
    { goal: "查線索", anchor: "帳簿" }, false);
  assert.equal(used.state.turn, empty.turn + 1);
  assert.equal(used.state.customActionUses, 0);
  assert.equal(used.state.silver, 50);
});

test("a bare order cannot convert an NPC, but varied grounded arguments can", () => {
  let scene = { ...state(), questStep: "sandbox", turn: 14, silver: 10,
    worldFlags: ["帳目有據"] };
  const speeches = [
    "我叫張斷骨信耶穌。",
    "我同張斷骨講：我有帳簿作證，耶穌教人不要賣友求財。",
    "我同張斷骨講：我曾親身見過人因信耶穌而放下舊仇。",
    "我同張斷骨講：因為耶穌教人守信，街坊先敢再來買肉。",
    "我同張斷骨講：我願替你向街坊作保，你試信耶穌。",
    "我同張斷骨講：如果你信耶穌，先向被你欺負的街坊道歉，明天照樣開檔。",
  ];
  const first = resolveSocialIntent(scene, inferSocialIntent(scene, speeches[0]));
  assert.deepEqual(first.state.socialMemory["張斷骨"].beliefs, []);
  assert.equal(first.state.turn, 15);
  scene = first.state;
  for (const speech of speeches.slice(1)) scene = resolveSocialIntent(scene, inferSocialIntent(scene, speech)).state;
  assert.deepEqual(scene.socialMemory["張斷骨"].beliefs, ["基督信仰"]);
  assert.deepEqual(normalizeState(scene).socialMemory["張斷骨"].beliefs, ["基督信仰"]);
});

test("repeated pressure hardens resistance and absent NPCs cannot be addressed", () => {
  let scene = { ...state(), questStep: "sandbox", turn: 14, worldFlags: ["帳目有據"] };
  const speech = "我同張斷骨講：帳簿作證，你應該倒戈幫我。";
  scene = resolveSocialIntent(scene, inferSocialIntent(scene, speech)).state;
  scene = resolveSocialIntent(scene, inferSocialIntent(scene, speech)).state;
  const topic = scene.socialMemory["張斷骨"].topics["defect:轉投玩家"];
  assert.equal(topic.progress, 2);
  assert.equal(topic.resistance, 1);
  assert.equal(validateCustomDecision({ kind: "social_intent", target: "柳照霜", goal: "belief",
    subject: "基督信仰", tactic: "assertion", method: "說服" }, scene, [], "我叫柳照霜信耶穌").kind, "reject");
  assert.equal(inferSocialIntent(scene, "如果我叫張斷骨信耶穌會點？"), undefined);
});

test("an AI-rated weak argument cannot win influence through keywords alone", () => {
  const scene = { ...state(), questStep: "sandbox", turn: 14, worldFlags: ["帳目有據"] };
  const text = "我同張斷骨講：帳簿作證，你應該倒戈幫我。";
  const decision = validateCustomDecision({ kind: "social_intent", target: "張斷骨", goal: "defect",
    subject: "轉投玩家", tactic: "evidence", quality: "weak", method: text }, scene, [], text);
  assert.equal(decision.kind, "social_intent");
  const turn = resolveSocialIntent(scene, decision.plan);
  assert.equal(turn.state.socialMemory["張斷骨"].topics["defect:轉投玩家"].progress, 0);
  assert.notEqual(turn.state.socialMemory["張斷骨"].stance, "ally");
});

test("speaking to an active knife man consumes a guarded combat round", () => {
  const scene = { ...state(), questStep: "huizhi_ambush", turn: 6,
    combat: createCombat("market_ambush", true), flags: { ...state().flags, marketAmbushTriggered: true } };
  const speech = "我同刀手講：若果你收刀，我放你一條生路。";
  const result = resolveSocialIntent(scene, inferSocialIntent(scene, speech));
  assert.equal(result.state.turn, scene.turn + 1);
  assert.ok(result.state.playerHp < scene.playerHp || result.state.playerMp < scene.playerMp);
  assert.notEqual(result.state.socialMemory["刀手"].stance, "ally");
});

test("combat inquiry and negotiation do not become feint attacks", () => {
  const scene = { ...state(), questStep: "huizhi_ambush", combat: createCombat("market_ambush", true) };
  for (const approach of ["查探", "交涉"]) {
    const result = resolveMarketIntent(scene, { approach, target: "刀手", method: `${approach}刀手動靜` });
    assert.equal(result.state.combat.enemyHp, scene.combat.enemyHp);
    assert.equal(result.state.questStep, "huizhi_ambush");
    assert.doesNotMatch(result.event, /佯攻|攻勢一滯/);
  }
});

test("a specific dark hand in free combat intent spends that item", () => {
  const scene = { ...state(), questStep: "huizhi_ambush", combat: createCombat("market_ambush", true),
    inventory: ["【生石灰包】", "【飛蝗石】"] };
  const result = resolveMarketIntent(scene, { approach: "借物", target: "刀手", object: "飛蝗石",
    method: "擲飛蝗石攻刀手" });
  assert.match(result.event, /飛蝗石/);
  assert.deepEqual(result.state.inventory, ["【生石灰包】"]);
});

test("alley attack with lime leaves an opening without moving the player", () => {
  const scene = { ...state(), questStep: "sandbox", playerHp: 10,
    flags: { ...state().flags, alleyEscape: true, alleyAllyPresent: false },
    inventory: ["【生石灰包】"] };
  const attack = resolveMarketIntent(scene, { approach: "借物", target: "刀手", object: "生石灰包",
    method: "撒生石灰攻刀手" });
  assert.equal(attack.state.flags.alleyEscape, true);
  assert.equal(attack.state.flags.marketAftermath, false);
  assert.equal(attack.state.flags.alleyOpening, true);
  assert.deepEqual(attack.state.inventory, []);
  const escape = resolveTurn(attack.state, availableOptions(attack.state).find((option) => option.includes("[硬闖街口]")), false);
  assert.equal(escape.state.playerHp, attack.state.playerHp - 2);
});

test("wall inquiry fallback reports the inquiry without inventing a bucket kick", () => {
  const scene = { ...state(), questStep: "sandbox", flags: { ...state().flags,
    alleyEscape: true, alleyWall: true, alleyAllyPresent: false } };
  const result = resolveMarketIntent(scene, { approach: "查探", target: "刀手", method: "查探牆背刀手" });
  const prose = hardboiledFallback(result.event, result.state);
  assert.match(prose, /伏在牆頭看清後巷/);
  assert.doesNotMatch(prose, /餿水桶翻倒|腳下一滑/);
});

test("a knife man's accepted cooperation ends the hostile combat state", () => {
  const prior = [1, 2].map((turn) => ({ turn, target: "刀手", player: "我提出收刀的條件。",
    reply: "再說。", reaction: "consider", memory: "談過收刀" }));
  const scene = { ...state(), questStep: "huizhi_ambush", combat: createCombat("market_ambush", true),
    flags: { ...state().flags, marketNpcHistory: prior } };
  const result = resolveMarketDialogue(scene, "刀手", "刀手，我有證據，可保你性命，請你收刀。",
    { reaction: "cooperate", reason: "接受條件", memory: "同意收刀" });
  assert.equal(result.state.combat, undefined);
  assert.equal(result.state.flags.marketAftermathKind, "truce");
  assert.equal(result.state.questStep, "sandbox");
  assert.ok(availableOptions(result.state).some((option) => option.includes("[盤問刀手]")));
});

test("a negotiated truce ends combat instead of granting only defense", () => {
  const scene = { ...state(), questStep: "huizhi_ambush", combat: createCombat("market_ambush", true),
    socialMemory: { "刀手": { stance: "hostile", beliefs: [], topics: {
      "truce:眼前停手": { progress: 3, resistance: 0, tactics: [], arguments: [], lastTurn: 0 },
    } } } };
  const speech = "我同刀手講：因為玄武樓會棄你不顧，現在收刀保命。";
  const result = resolveSocialIntent(scene, inferSocialIntent(scene, speech));
  assert.equal(result.state.combat, undefined);
  assert.equal(result.state.flags.marketAftermathKind, "truce");
  assert.match(result.event, /暫且收手/);
});

test("free inquiry during a truce questions the knife man", () => {
  const scene = { ...state(), questStep: "sandbox", combat: undefined,
    flags: { ...state().flags, marketAftermath: true, marketAftermathKind: "truce" } };
  const result = resolveMarketIntent(scene, { approach: "查探", target: "刀手", method: "問刀手誰叫他守住肉檔" });
  assert.match(result.event, /你問刀手誰叫他守住肉檔/);
  assert.equal(result.state.flags.marketAftermath, false);
  assert.doesNotMatch(result.event, /伏巷警戒|無法用這件物事/);
});

test("an unaddressed spoken line reaches the knife man during combat", () => {
  const scene = { ...state(), questStep: "huizhi_ambush", turn: 5,
    combat: createCombat("market_ambush", true), flags: { ...state().flags, marketAmbushTriggered: true } };
  const speech = "大家何必動武,兄弟你多年來都辛苦了,爸媽還好嗎?";
  assert.equal(marketDialogueTarget(scene, speech), "刀手");
  const result = resolveMarketDialogue(scene, "刀手", speech,
    { reaction: "talk", reason: "刀手聽到問候，但仍然出刀", memory: "玩家問過他的家人" });
  assert.equal(result.state.turn, scene.turn + 1);
  assert.equal(result.state.flags.marketNpcHistory.at(-1).player, speech);
  assert.ok(result.state.playerHp < scene.playerHp || result.state.playerMp < scene.playerMp);
  assert.equal(marketDialogueTarget(scene, "如果我翻牆會點?"), undefined);
});

test("Blackmud NPC keeps an open conversation without a fixed persuasion goal", () => {
  const scene = { ...state(), questStep: "sandbox", turn: 14 };
  const text = "張斷骨，我今日實在難受，只想同你講兩句。";
  assert.equal(marketDialogueTarget(scene, text), "張斷骨");
  const turn = resolveMarketDialogue(scene, "張斷骨", text,
    { reaction: "talk", reason: "他肯聽但仍守著肉檔", memory: "玩家曾向他傾訴難處" });
  recordMarketNpcReply(turn.state, "張斷骨", "有話就講。肉檔仲要開門，我只能聽一陣。");
  assert.equal(turn.state.turn, scene.turn + 1);
  assert.equal(turn.state.flags.marketNpcHistory[0].reply.includes("有話就講"), true);
  assert.equal(normalizeState(turn.state).flags.marketNpcHistory[0].memory, "玩家曾向他傾訴難處");
  assert.equal(marketDialogueTarget(scene, "我同容晚秋講兩句"), undefined);
});

test("Blackmud dialogue cannot instantly force a new belief or allegiance", () => {
  let scene = { ...state(), questStep: "sandbox", turn: 14 };
  const convert = { reaction: "adopt_belief", belief: "基督信仰", reason: "願意接受",
    memory: "玩家談及耶穌" };
  const first = resolveMarketDialogue(scene, "張斷骨", "我叫張斷骨信耶穌。", convert);
  assert.equal(first.reaction, "consider");
  assert.deepEqual(first.state.socialMemory["張斷骨"].beliefs, []);
  scene = first.state;
  const second = resolveMarketDialogue(scene, "張斷骨", "我同張斷骨講耶穌與守信的道理。", convert);
  assert.equal(second.reaction, "consider");
  scene = second.state;
  const third = resolveMarketDialogue(scene, "張斷骨", "我再同張斷骨講耶穌，問他願不願試著相信。", convert);
  assert.equal(third.reaction, "adopt_belief");
  assert.deepEqual(third.state.socialMemory["張斷骨"].beliefs, ["基督信仰"]);
  const bareDefection = resolveMarketDialogue({ ...state(), questStep: "sandbox", turn: 14 }, "張斷骨",
    "我叫張斷骨倒戈幫我。", { reaction: "defect", reason: "突發奇想", memory: "" });
  assert.equal(bareDefection.reaction, "consider");
});

test("Blackmud long conversation is interrupted when the waiting knife men strike", () => {
  let scene = state();
  for (const words of ["我同張斷骨講今日的事。", "我再同張斷骨講街坊的事。", "我同張斷骨講你可否先聽我講完。"])
    scene = resolveMarketDialogue(scene, "張斷骨", words,
      { reaction: "talk", reason: "他仍在聽", memory: "玩家沒有處理巷口威脅" }).state;
  assert.equal(scene.questStep, "huizhi_ambush");
  assert.equal(scene.flags.marketNpcHistory.length, 3);
  assert.equal(availableOptions(scene).some((option) => /搬貨|領差/.test(option)), false);
});

test("retired errands do not gate free actions", () => {
  const hall = { ...state(), questStep: "sandbox", currentLocation: "青鋒堂總壇", customActionUses: 0 };
  assert.equal(availableOptions(hall).some((option) => /\[(?:領差|辦差|速辦)\]/.test(option)), false);
  const free = resolveTurn(hall, "F. [自訂手段] 查堂口舊帳", false,
    { goal: "查線索", anchor: "帳簿" });
  assert.equal(free.state.turn, hall.turn + 1);
  assert.ok(free.state.worldFlags.includes("青鋒堂總壇機變查線索"));
});
