import assert from "node:assert/strict";
import test from "node:test";
import { availableOptions, normalizeState, recordMarketNpcReply, resolveMarketDialogue,
  resolveMarketIntent, resolveSocialIntent, resolveTurn } from "../lib/game-engine.ts";
import { newRelationships } from "../lib/companion-relations.ts";
import { interpretMarketText, isMarketIntentScene, validateCustomDecision } from "../lib/custom-action.ts";
import { createCombat } from "../lib/combat-engine.ts";
import { inferSocialIntent, marketDialogueTarget } from "../lib/social-influence.ts";

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
  assert.match(prepared.options.find((option) => option.startsWith("D.")), /肉案已歪/);
  const rescue = resolveMarketIntent(prepared.state, { approach: "救護", target: "陸千帆", method: "敷藥扶起陸千帆" });
  assert.equal(rescue.state.questStep, "huizhi_ambush");
  assert.equal(rescue.state.combat.preparedDefense >= 1, true);
  assert.equal(rescue.state.inventory.includes("【金創散】"), false);
  assert.equal(rescue.state.factionFunds, scene.factionFunds);
  assert.equal(rescue.state.customActionUses, 0);
  const defended = resolveMarketIntent(rescue.state, { approach: "防守", target: "陸千帆", method: "卡在陸千帆前面接刀" });
  assert.equal(defended.state.customActionUses, 0);
  assert.equal(defended.state.turn, rescue.state.turn + 1);
  assert.equal(defended.state.flags.marketIntentHistory.length, 3);
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

test("using a carried dark hand before the ambush spends it and exposes the knife men", () => {
  const scene = { ...state(), inventory: ["【生石灰包】"], customActionUses: 0 };
  const turn = resolveMarketIntent(scene, { approach: "借物", target: "刀手", object: "生石灰包", method: "撒石灰逼刀手現身" });
  assert.equal(turn.state.inventory.includes("【生石灰包】"), false);
  assert.equal(turn.state.questStep, "huizhi_ambush");
  assert.equal(turn.state.customActionUses, 0);
  assert.match(turn.event, /石灰|暗手/);
});

test("repeated preparation makes the waiting knife men strike on the third turn", () => {
  const scene = { ...state(), customActionUses: 0 };
  const first = resolveMarketIntent(scene, { approach: "查探", target: "街口", method: "看巷口腳印" });
  const second = resolveMarketIntent(first.state, { approach: "交涉", target: "陸千帆", method: "跟陸千帆對手勢" });
  assert.equal(second.state.questStep, "market_collection");
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

test("mission rewards no longer advertise obsolete free-action charges", () => {
  const hall = { ...state(), questStep: "sandbox", currentLocation: "青鋒堂總壇", customActionUses: 0 };
  const offer = availableOptions(hall).find((option) => option.includes("守街名冊") && option.startsWith("G. [領差]"));
  assert.ok(offer);
  const accepted = resolveTurn(hall, offer, false);
  assert.equal(accepted.state.customActionUses, 0);
  const target = { ...accepted.state, currentLocation: "黑泥街" };
  const finish = availableOptions(target).find((option) => option.includes("守街名冊") && option.startsWith("G. [辦差]"));
  assert.ok(finish);
  assert.doesNotMatch(finish, /機變/);
  const done = resolveTurn(target, finish, false);
  assert.equal(done.state.customActionUses, 1);
  const fullTarget = { ...target, customActionUses: 2 };
  const fullFinish = availableOptions(fullTarget).find((option) => option.includes("守街名冊") && option.startsWith("G. [辦差]"));
  assert.doesNotMatch(fullFinish, /機變/);
  const fullDone = resolveTurn(fullTarget, fullFinish, false);
  assert.equal(fullDone.state.customActionUses, 2);
});
