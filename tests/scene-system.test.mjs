import assert from "node:assert/strict";
import test from "node:test";
import { availableOptions, normalizeState, resolveSceneAttempt, resolveTurn } from "../lib/game-engine.ts";
import { combatOptions, createCombat } from "../lib/combat-engine.ts";
import { newRelationships } from "../lib/companion-relations.ts";
import { darkHandCount, dirtyHandTier, rollD20 } from "../lib/dirty-hand.ts";
import { completeSentences, hardboiledFallback, validHardboiledNarrative } from "../lib/narrative-style.ts";
import { LANDMARK_SCENES, OBJECT_RULES, normalizeSceneState, objectStatus, openEntrance, revealEntrance, sceneFacts } from "../lib/scene-state.ts";
import { sceneAttemptObjects } from "../lib/custom-action.ts";
import { blackmudAnchors, blackmudFocus } from "../lib/blackmud-hud.ts";
import { travelChoices } from "../lib/city-progression.ts";

function game(overrides = {}) {
  return {
    turn: 5, playerName: "阿七", background: "賭坊收帳人", trait: "察言觀色",
    currentLocation: "黑泥街", inventory: ["【生石灰包】"], maxInventory: 4,
    playerHp: 50, maxHp: 50, hpScaleVersion: 2, playerMp: 40, maxMp: 50,
    silver: 20, factionFunds: 10, sectLifeline: 60, worldFlags: [], relationships: newRelationships(),
    questStep: "sandbox", flags: { tookHerbs: true, visitedYung: true, collectedMarketFee: false,
      marketAmbushTriggered: true, darkHandInitialized: true }, ...overrides,
  };
}

test("fallback uses complete sentences and a full default when punctuation is absent", () => {
  const defaultSentence = "你站穩身位，眼前局勢仍待分明。";
  assert.deepEqual(completeSentences("你往巷口走", defaultSentence), [defaultSentence]);
  assert.deepEqual(completeSentences("你站穩。後半句尚未寫完", defaultSentence), ["你站穩。"]);
  const prose = hardboiledFallback("你沿街追了很久卻始終沒有看到巷口任何人影也沒有找到下一步的線索", game());
  assert.equal(validHardboiledNarrative(prose), true, prose);
  assert.equal(prose.includes("你沿街追了很久卻始終沒有看到巷口任何人影"), false);
});

test("all landmark props have physical rules and the new market props are reachable only at the stall", () => {
  const entries = Object.entries(LANDMARK_SCENES);
  assert.equal(entries.length, 11);
  assert.equal(entries.reduce((total, [, scene]) => total + scene.objects.length, 0), 51);
  for (const [place, scene] of entries) {
    const names = scene.objects.map((object) => object.name);
    assert.equal(new Set(names).size, names.length, `${place} contains a duplicate prop`);
    for (const name of names) assert.ok(OBJECT_RULES[name], `${place}: ${name} lacks physical rules`);
  }
  assert.equal(LANDMARK_SCENES["青鋒堂總壇"].objects.some((object) => object.name === "堂口備用短刀"), false);
  assert.ok(LANDMARK_SCENES["青鋒堂總壇"].objects.some((object) => object.name === "牛肉刀"));
  assert.match(sceneFacts("夜雨樓", normalizeSceneState(undefined)), /銅鏡不會碎成玻璃刃/);
  const market = game({ questStep: "market_collection", flags: { ...game().flags, marketAmbushTriggered: false } });
  assert.ok(sceneAttemptObjects(market).includes("半扇懸掛生豬胴體"));
  assert.ok(sceneAttemptObjects(market).includes("排污水溝爛木蓋板"));
  assert.equal(sceneAttemptObjects(game({ ...market, flags: { ...market.flags, alleyEscape: true } })).includes("半扇懸掛生豬胴體"), false);
  assert.match(combatOptions(createCombat("arena"), "beef_knife", {}, 40)[0], /提刀/);
});

test("a heavy hanging carcass can disrupt a knife man but takes extra effort", () => {
  const scene = game({ questStep: "market_collection", combat: createCombat("market_ambush", true),
    flags: { ...game().flags, marketAmbushTriggered: true } });
  const result = resolveSceneAttempt(scene, { effect: "disrupt", target: "刀手",
    object: "半扇懸掛生豬胴體", gesture: "推動生豬胴體", method: "推動半扇懸掛生豬胴體擋刀手" });
  assert.match(result.event, /費力挪動半扇懸掛生豬胴體/);
  assert.equal(result.state.sceneState.movedObjects["半扇懸掛生豬胴體"], "肉架下搖晃，已偏離原位");
  assert.ok(result.state.playerMp < scene.playerMp - 1);
  const drain = resolveSceneAttempt(scene, { effect: "disrupt", target: "刀手",
    object: "排污水溝爛木蓋板", gesture: "掀開爛木蓋板", method: "掀開排污水溝爛木蓋板" });
  assert.equal(blackmudAnchors(drain.state).find((item) => item.name === "排污水溝爛木蓋板").label, "已設陷阱");
});

test("Blackmud HUD shows only reachable scene props and reflects spent alley objects", () => {
  const atStall = game({ questStep: "market_collection" });
  const stall = blackmudAnchors(atStall);
  assert.ok(stall.some((item) => item.name === "懸肉鐵鉤" && item.label === "可及"));
  assert.ok(stall.some((item) => item.name === "剁骨刀" && item.label === "難取"));
  assert.equal(stall.some((item) => item.name === "廢竹籮"), false);
  assert.deepEqual(blackmudFocus(atStall), ["懸肉鐵鉤", "剁骨刀"]);
  assert.deepEqual(blackmudFocus(atStall, "你推動半扇懸掛生豬胴體，刀手退開。"), ["半扇懸掛生豬胴體", "懸肉鐵鉤"]);
  const inAlley = game({ questStep: "huizhi_ambush", flags: { ...game().flags, alleyEscape: true },
    sceneState: { depletedSources: ["餿水桶"], movedObjects: { "餿水桶": "巷口倒翻" } } });
  const alley = blackmudAnchors(inAlley);
  assert.deepEqual(alley.map((item) => item.name), ["廢竹籮", "餿水桶"]);
  assert.equal(alley.find((item) => item.name === "餿水桶").label, "已耗盡");
  assert.equal(alley.some((item) => item.name === "剁骨刀"), false);
});

test("market combat choice names its actual prop and rotates after moving it", () => {
  const scene = game({ questStep: "huizhi_ambush", combat: createCombat("market_ambush", true) });
  const hook = availableOptions(scene).find((option) => option.startsWith("C."));
  assert.match(hook, /\[扯鐵鉤\]/);
  const first = resolveTurn(scene, hook, false);
  assert.match(first.event, /懸肉鐵鉤/);
  assert.equal(validHardboiledNarrative(hardboiledFallback(first.event, first.state)), true);
  assert.ok(first.state.sceneState.movedObjects["懸肉鐵鉤"]);
  assert.match(availableOptions(first.state).find((option) => option.startsWith("C.")), /\[推砧板\]/);
  const board = availableOptions(first.state).find((option) => option.startsWith("C."));
  const second = resolveTurn(first.state, board, false);
  assert.ok(second.state.sceneState.movedObjects["厚砧板"]);
});

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
  assert.equal(escape.state.flags.marketAftermath, true);
  assert.equal(escape.options.some((option) => /搬貨|巡街收規|領差/.test(option)), false);
  const reclaimed = resolveTurn(trapped.state, trapped.options.find((option) => option.includes("[硬闖街口]")), false);
  assert.equal(reclaimed.state.flags.marketAftermathKind, "victory");
  assert.equal(reclaimed.options.some((option) => option.includes("[盤問張斷骨]")), true);
  assert.equal(validHardboiledNarrative(hardboiledFallback(reclaimed.event, reclaimed.state)), true);
});

test("kicking the slop bucket leaves the player on a contested wall", () => {
  const trapped = normalizeState(game({ turn: 8,
    flags: { ...game().flags, alleyEscape: true, alleyAllyPresent: false } }));
  const bucket = resolveTurn(trapped, availableOptions(trapped).find((option) => option.includes("[踢翻餿水桶]")), false);
  assert.equal(bucket.state.flags.alleyEscape, true);
  assert.equal(bucket.state.flags.alleyWall, true);
  assert.equal(bucket.state.flags.marketAftermath, false);
  assert.equal(bucket.options.some((option) => /搬貨|巡街收規|領差|拾碎骨/.test(option)), false);
  assert.equal(bucket.options.some((option) => option.includes("[借牆脫身]")), true);
  assert.equal(bucket.options.some((option) => option.includes("[踢翻餿水桶]")), false);
  assert.equal(blackmudAnchors(bucket.state).find((item) => item.name === "餿水桶").label, "已耗盡");
  const prose = hardboiledFallback(bucket.event, bucket.state);
  assert.equal(validHardboiledNarrative(prose), true, prose);
  assert.match(prose, /牆背仍有刀手/);
  const rejectedJob = resolveTurn(bucket.state, "B. [搬貨] 替商販搬貨", false);
  assert.equal(rejectedJob.state.turn, bucket.state.turn);
  const escaped = resolveTurn(bucket.state, bucket.options.find((option) => option.includes("[借牆脫身]")), false);
  assert.equal(escaped.state.flags.alleyEscape, false);
  assert.equal(escaped.state.flags.marketAftermath, true);
  assert.equal(escaped.state.flags.marketAftermathKind, "escape");
  assert.equal(blackmudAnchors(escaped.state).find((item) => item.name === "廢竹籮").label, "已耗盡");
  assert.equal(blackmudAnchors(escaped.state).find((item) => item.name === "餿水桶").label, "已耗盡");
  assert.equal(escaped.options.some((option) => /搬貨|巡街收規|領差|盤問張斷骨/.test(option)), false);
  assert.equal(validHardboiledNarrative(hardboiledFallback(escaped.event, escaped.state)), true);
  const settled = resolveTurn(escaped.state, escaped.options.find((option) => option.includes("[離巷收隊]")), false);
  assert.equal(settled.state.flags.marketAftermath, false);
  assert.equal(settled.options.some((option) => option.includes("[巡街收規]")), true);
  assert.equal(validHardboiledNarrative(hardboiledFallback(settled.event, settled.state)), true);
});

test("market victory requires one aftermath action before ordinary work resumes", () => {
  const combat = { ...createCombat("market_ambush", true), enemyHp: 1 };
  const fight = game({ turn: 7, questStep: "huizhi_ambush", combat,
    worldFlags: ["苦煙館傳信接應"] });
  const won = resolveTurn(fight, availableOptions(fight).find((option) => option.startsWith("A.")), false);
  assert.equal(won.state.flags.marketAftermath, true);
  assert.equal(won.options.some((option) => /搬貨|巡街收規|領差/.test(option)), false);
  assert.equal(won.options.some((option) => option.includes("[檢視傷勢]")), false);
  assert.equal(won.options.some((option) => option.includes("[伏巷警戒]")), true);
  assert.equal(won.options.some((option) => option.includes("[盤問張斷骨]")), true);
  assert.equal(won.options.some((option) => option.includes("[搜刮殘局]")), true);
  const prose = hardboiledFallback(won.event, won.state, won.npcReply);
  assert.equal(validHardboiledNarrative(prose), true, prose);
  assert.match(prose, /接應|巷口/);
  const blocked = resolveTurn(won.state, "B. [搬貨] 替商販搬貨", false);
  assert.equal(blocked.state.turn, won.state.turn);
  const blockedTravel = resolveTurn(won.state, "F. [前往] 晚秋茶寮", false);
  assert.equal(blockedTravel.state.currentLocation, "黑泥街");
  assert.equal(blockedTravel.state.turn, won.state.turn);
  for (const option of won.options) {
    const outcome = resolveTurn(won.state, option, false);
    assert.equal(outcome.state.flags.marketAftermath, false, option);
    const text = hardboiledFallback(outcome.event, outcome.state, outcome.npcReply);
    assert.equal(validHardboiledNarrative(text), true, `${option}: ${text}`);
  }
  const cleanup = resolveTurn(won.state, won.options.find((option) => option.includes("[搜刮殘局]")), false);
  assert.equal(cleanup.state.flags.marketAftermath, false);
  assert.equal(cleanup.state.inventory.includes("【碎骨片】"), true);
  assert.equal(cleanup.state.playerHp, won.state.playerHp);
  assert.equal(cleanup.state.sceneState.depletedSources.includes("黑泥街碎骨"), true);
  assert.equal(cleanup.options.some((option) => option.includes("[巡街收規]")), true);
  assert.equal(cleanup.state.turn, won.state.turn + 1);
});

test("market defeat requires a retreat aftermath before ordinary work resumes", () => {
  const combat = { ...createCombat("market_ambush", true), round: 4, enemyHp: 20 };
  const fight = game({ turn: 9, questStep: "huizhi_ambush", combat, playerHp: 4 });
  const lost = resolveTurn(fight, availableOptions(fight).find((option) => option.startsWith("A.")), false);
  assert.equal(lost.state.combat, undefined);
  assert.equal(lost.state.flags.marketAftermath, true);
  assert.equal(lost.state.flags.marketAftermathKind, "defeat");
  assert.match(lost.npcReply?.line || "", /退到肉案後/);
  assert.equal(lost.options.some((option) => /領差|搬貨|巡街收規/.test(option)), false);
  assert.match(hardboiledFallback(lost.event, lost.state), /刀手仍守著街口/);
  const blocked = resolveTurn(lost.state, "B. [搬貨] 替商販搬貨", false);
  assert.equal(blocked.state.turn, lost.state.turn);
  const withdrew = resolveTurn(lost.state, lost.options.find((option) => option.includes("[撤離街口]")), false);
  assert.equal(withdrew.state.flags.marketAftermath, false);
  assert.equal(withdrew.state.worldFlags.includes("市集戰敗撤離"), true);
  assert.equal(withdrew.state.currentLocation, "青鋒堂總壇");
  assert.equal(withdrew.options.some((option) => option.includes("[休整]")), true);
});

test("fallback keeps purchase cost, refusal, and combat outcome without filler", () => {
  const scene = game({ currentLocation: "晚秋茶寮" });
  const paid = hardboiledFallback("你付十五文私銀，得知土灶底石板通往酒窖。", scene);
  assert.match(paid, /十五文私銀.*土灶底石板/);
  const refused = hardboiledFallback("私銀不足十五文，容晚秋沒有收錢，也沒有說出暗道入口。", scene);
  assert.match(refused, /私銀不足十五文.*沒有收錢/);
  assert.doesNotMatch(paid + refused, /你看清.*眼前的動靜/);
  const combat = hardboiledFallback("你撞開刀手守勢。刀手乘隙封住街口。", game());
  assert.match(combat, /刀手乘隙封住街口/);
});

test("recent older saves after a market win enter aftermath only once", () => {
  const saved = game({ turn: 8, worldFlags: ["擊退伏擊刀手"], flags: { ...game().flags, alleyAllyPresent: true } });
  const restored = normalizeState(saved);
  assert.equal(restored.flags.marketAftermath, true);
  const prose = hardboiledFallback("你佯攻搶出破綻。顧忘生傳出的信帶來接應。", restored);
  assert.equal(validHardboiledNarrative(prose), true, prose);
  const brokenStick = hardboiledFallback("案邊木棍當場折斷。顧忘生傳出的信帶來接應。", restored);
  assert.equal(validHardboiledNarrative(brokenStick), true, brokenStick);
  assert.match(brokenStick, /木棍裂開/);
  const settled = resolveTurn(restored, availableOptions(restored).find((option) => option.includes("[安頓收隊]")), false);
  assert.equal(settled.state.flags.marketAftermath, false);
  assert.equal(normalizeState(settled.state).flags.marketAftermath, false);
  const solo = normalizeState(game({ turn: 8, worldFlags: ["擊退伏擊刀手"] }));
  assert.equal(validHardboiledNarrative(hardboiledFallback("刀手倒下。", solo)), true);
});

test("active arena combat and city incidents hide ordinary jobs", () => {
  const arena = game({ currentLocation: "裂石擂", combat: createCombat("arena") });
  assert.equal(availableOptions(arena).some((option) => /搬貨|領差/.test(option)), false);
  const incident = game({ flags: { ...game().flags, pendingIncident: "market_raid" } });
  assert.equal(availableOptions(incident).some((option) => /搬貨|領差/.test(option)), false);
});

test("combat choices use scene actions while costs stay in system labels", () => {
  const market = combatOptions(createCombat("market_ambush", true), "fists", {}, 40, true, "【生石灰包】");
  assert.equal(market.length, 6);
  assert.ok(market.some((option) => option.startsWith("I. [撒生石灰]")));
  assert.equal(market.some((option) => option.startsWith("J.")), false);
  assert.ok(market.some((option) => option.includes("案邊木棍")));
  assert.ok(market.some((option) => option.includes("陸千帆")));
  assert.ok(market.some((option) => option.includes("生石灰")));
  assert.ok(market.every((option) => !/精力|耗一件|最多耗|以徒手進攻/.test(option)));
  const arena = combatOptions(createCombat("arena"), "rusty_knife", { soft_parry: 1, point_strike: 1 }, 40, false, "【飛蝗石】");
  assert.ok(arena.some((option) => option.includes("擂台圍繩")));
  assert.ok(arena.some((option) => option.includes("飛蝗石")));
  assert.ok(arena.every((option) => !option.includes("陸千帆") && !option.includes("肉檔")));
  assert.ok(arena.every((option) => !/精力|耗一件|最多耗/.test(option)));
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
  const fighting = game({ questStep: "huizhi_ambush", combat: createCombat("market_ambush", true), playerHp: 10,
    inventory: ["【生石灰包】"] });
  const trick = availableOptions(fighting).find((option) => option.includes("[撒生石灰]"));
  const outcome = resolveTurn(fighting, trick, false);
  assert.equal(darkHandCount(outcome.state.inventory), 0);
  assert.equal(outcome.state.playerMp, 38);
  assert.ok(outcome.state.combat);
  assert.equal(outcome.state.flags.alleyEscape, false);
  assert.ok(outcome.state.combat.opening >= 2);
});

test("turn six lime choice blinds the knife man without silently retreating", () => {
  const fighting = game({ turn: 5, questStep: "huizhi_ambush", combat: createCombat("market_ambush", true),
    playerHp: 10, inventory: ["【生石灰包】"] });
  const choice = availableOptions(fighting).find((option) => option.startsWith("I. [撒生石灰]"));
  const outcome = resolveTurn(fighting, choice, false);
  const prose = hardboiledFallback(outcome.event, outcome.state, outcome.npcReply);
  assert.equal(outcome.state.turn, 6);
  assert.match(outcome.event, /撒石灰迷眼/);
  assert.match(prose, /撒石灰迷眼/);
  assert.doesNotMatch(prose, /退入死巷|翻牆|刀口擦過後頸/);
  assert.equal(outcome.state.questStep, "huizhi_ambush");
  assert.ok(outcome.state.combat);
  assert.equal(outcome.state.flags.alleyEscape, false);
  assert.equal(outcome.state.inventory.includes("【生石灰包】"), false);
});

test("two carried dark hands produce distinct choices and consume the chosen item", () => {
  const fighting = game({ questStep: "huizhi_ambush", combat: createCombat("market_ambush", true),
    inventory: ["【生石灰包】", "【飛蝗石】"], playerHp: 10 });
  const options = availableOptions(fighting);
  assert.ok(options.some((option) => option.startsWith("I. [撒生石灰]")));
  const stone = options.find((option) => option.startsWith("J. [施放暗手]"));
  assert.match(stone, /飛蝗石/);
  const thrown = resolveTurn(fighting, stone, false);
  assert.match(thrown.event, /飛蝗石/);
  assert.deepEqual(thrown.state.inventory, ["【生石灰包】"]);
});

test("restored ambush respects an abandoned companion", () => {
  const restored = normalizeState(game({ questStep: "huizhi_ambush", combat: undefined,
    worldFlags: ["棄下陸千帆"] }));
  assert.equal(restored.combat.allyPresent, false);
  assert.equal(availableOptions(restored).some((option) => option.includes("[護住同門]")), false);
});

test("a full legacy inventory does not gain an extra tutorial medicine", () => {
  const packed = normalizeState(game({ questStep: "kuyan_medicine", currentLocation: "苦煙館",
    inventory: ["【生石灰包】", "【牛肉刀】", "【飛蝗石】", "【粗鐵護腕】", "【灌鉛假骰】", "【開鎖鐵線】"],
    maxInventory: 4 }));
  assert.equal(packed.maxInventory, 6);
  const arrived = resolveTurn(packed, availableOptions(packed)[0], false);
  assert.equal(arrived.state.inventory.length, 6);
  assert.equal(arrived.state.inventory.includes("【止血膏藥】"), false);
  assert.match(arrived.event, /止血膏藥留在苦煙館/);
  assert.doesNotMatch(hardboiledFallback(arrived.event, arrived.state), /膏藥尚未拆封/);
});

test("incident effort is gated and an unfunded payment does not retreat", () => {
  const raid = normalizeState(game({ turn: 20, playerMp: 5, silver: 0,
    flags: { ...game().flags, pendingIncident: "market_raid" } }));
  assert.equal(availableOptions(raid).some((option) => option.includes("[暗巷截路]")), false);
  const pay = resolveTurn(raid, availableOptions(raid).find((option) => option.includes("[付錢息事]")), false);
  assert.match(pay.event, /私銀不足二十文/);
  assert.doesNotMatch(pay.event, /退入窄巷/);
  assert.equal(pay.state.flags.alleyEscape, false);
  assert.equal(pay.state.flags.pendingIncident, "market_raid");
  assert.equal(pay.state.worldFlags.includes("市集守住"), false);
  const ledgerUnfunded = normalizeState(game({ currentLocation: "晚秋茶寮", turn: 20, silver: 0,
    flags: { ...game().flags, pendingIncident: "missing_ledger" } }));
  const refusedTip = resolveTurn(ledgerUnfunded,
    availableOptions(ledgerUnfunded).find((option) => option.includes("[買帳頁線索]")), false);
  assert.equal(refusedTip.state.flags.pendingIncident, "missing_ledger");
  assert.equal(refusedTip.state.worldFlags.includes("規費帳失頁已查"), false);
  const ledger = normalizeState(game({ turn: 20, playerMp: 6,
    flags: { ...game().flags, pendingIncident: "missing_ledger" } }));
  const chase = resolveTurn(ledger, availableOptions(ledger).find((option) => option.includes("[追腳印]")), false);
  assert.match(chase.event, /找回濕透的帳頁/);
  assert.equal(chase.state.playerMp, 0);
});

test("escape aftermath does not invent an untreated companion wound", () => {
  const scene = normalizeState(game({ flags: { ...game().flags, marketAftermath: true,
    marketAftermathKind: "escape", alleyAllyPresent: true } }));
  assert.equal(scene.relationships["陸千帆"].wounded, false);
  assert.equal(availableOptions(scene).some((option) => option.includes("[檢視傷勢]")), false);
  const prose = hardboiledFallback("你翻過巷牆，刀手沒能追上。", scene);
  assert.doesNotMatch(prose, /傷還未止住|先收拾傷口/);
});

test("one combat dark-hand choice switches to a desperate strike at low health", () => {
  const scene = game({ questStep: "huizhi_ambush", combat: createCombat("market_ambush", true),
    inventory: ["【生石灰包】"], playerHp: 30, playerMp: 40 });
  const choice = availableOptions(scene).find((option) => option.startsWith("I. [撒生石灰]"));
  assert.ok(choice);
  assert.equal(availableOptions(scene).filter((option) => /^[IJ]\. /.test(option)).length, 1);
  const ordinary = resolveTurn(scene, choice, false);
  const desperate = resolveTurn({ ...scene, playerHp: 10 }, choice, false);
  assert.equal(ordinary.state.playerMp, 39);
  assert.equal(desperate.state.playerMp, 38);
  assert.equal(ordinary.state.inventory.includes("【生石灰包】"), false);
  assert.equal(desperate.state.inventory.includes("【生石灰包】"), false);
});

test("three passage entrances connect only after discovery", () => {
  const scene = normalizeSceneState(undefined);
  assert.equal(Object.keys(LANDMARK_SCENES).length, 11);
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
  assert.equal(found.state.playerHp, 50);
  assert.equal(found.state.sectLifeline, 59);
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

test("twenty consecutive turns keep factual fallback narration valid", () => {
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
