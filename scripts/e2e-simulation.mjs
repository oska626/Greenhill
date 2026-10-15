import assert from "node:assert/strict";
import { aptitude, availableOptions, LANDMARKS, normalizeState, STARTING_FACTION_FUNDS, resolveTurn } from "../lib/game-engine.ts";
import { newRelationships } from "../lib/companion-relations.ts";
import { hasOffSceneDirectSpeech, socialTargets } from "../lib/social-influence.ts";
import { MISSIONS, ROAD_ADJACENCY, travelChoices } from "../lib/city-progression.ts";
import { hardboiledFallback } from "../lib/narrative-style.ts";
import { ENCOUNTERS, encounterOptions } from "../lib/encounters.ts";
import { SPY_CASE_FLAG } from "../lib/spy-investigation.ts";

// Deterministic engine-level journeys. No network narration is involved.
const visited = new Set();
const branches = new Set();
const findings = new Map();
const terminal = (state) => Boolean(state.flags.chapterOne &&
  ["complete", "failed"].includes(state.flags.chapterOne.stage));
const fail = (kind, detail) => findings.set(`${kind}: ${detail}`, { kind, detail });
const optionKey = (option) => option.match(/^\w\. \[([^\]]+)\]/)?.[1] || option;
function assertValidOptionsLength(state) {
  for (const option of availableOptions(state)) {
    if (/^F\. \[(?:自由行動|自訂手段)\]/.test(option)) continue;
    const body = option.replace(/^[A-Z]\. \[[^\]]+\]\s*/, "");
    const chineseLength = Array.from(body).filter((character) => /[\u3400-\u9fff]/u.test(character)).length;
    assert.ok(chineseLength <= 12, `${state.questStep}/${state.currentLocation}: ${option} (${chineseLength} 字)`);
  }
}
const pick = (state, marker) => {
  const option = availableOptions(state).find((candidate) => candidate.includes(marker));
  if (!option && marker.startsWith("F. [自訂手段]")) return marker;
  if (!option && marker.startsWith("[明路前往] "))
    return travelChoices(state, marker.slice("[明路前往] ".length)).find((choice) => choice.kind === "road")?.label;
  assert.ok(option, `Missing ${marker} at ${state.questStep}/${state.currentLocation}: ${availableOptions(state).join(" | ")}`);
  return option;
};

function inspect(state, route) {
  const options = availableOptions(state);
  assertValidOptionsLength(state);
  assert.equal(new Set(options).size, options.length, `Duplicate choices at ${state.questStep}/${state.currentLocation}`);
  visited.add(`${route}|${state.questStep}|${state.currentLocation}|${state.pendingEncounter || ""}|${state.flags.alleyEscape ? "alley" : ""}|${state.flags.alleyWall ? "wall" : ""}|${state.flags.marketAftermath ? "aftermath" : ""}|${state.flags.chapterOne?.stage || ""}`);
  if (options.length === 0 && !terminal(state))
    fail("softlock", `${route} turn ${state.turn} ${state.questStep}/${state.flags.chapterOne?.stage || ""}`);
  if (options.length === 0 && terminal(state))
    fail("terminal-empty", `${route} turn ${state.turn} ${state.questStep}/${state.flags.chapterOne.stage}`);
  for (const option of options) if (!optionKey(option)) fail("empty-option", route);
}

function step(state, action, route, opening = false) {
  if (state.pendingEncounter && !availableOptions(state).some((option) => option.includes(action)))
    state = step(state, availableOptions(state)[0], route);
  inspect(state, route);
  const chosen = action === "opening" ? `[初入堂口] ${state.playerName}` : pick(state, action);
  branches.add(`${state.questStep}|${state.pendingEncounter || ""}|${state.flags.alleyEscape ? "alley" : ""}|${state.flags.alleyWall ? "wall" : ""}|${state.flags.marketAftermath ? "aftermath" : ""}|${optionKey(chosen)}`);
  const result = resolveTurn(state, chosen, opening);
  assert.ok(result.state.turn > state.turn || opening || terminal(state)
    || !state.flags.ending && Boolean(result.state.flags.ending), `Action did not advance: ${chosen}`);
  assert.deepEqual(result.options, availableOptions(result.state), `Stale options after ${chosen}`);
  if (result.npcReply && !socialTargets(result.state).includes(result.npcReply.speaker))
    fail("offstage-speaker", `${route}: ${result.npcReply.speaker} at ${result.state.currentLocation}`);
  const narrative = hardboiledFallback(result.event, result.state, result.npcReply);
  if (hasOffSceneDirectSpeech(result.state, narrative))
    fail("offstage-dialogue", `${route}: ${result.state.currentLocation} / ${narrative.slice(0, 90)}`);
  for (const match of narrative.matchAll(/你(?:在|踏進|抵達)(青鋒堂總壇|晚秋茶寮|黑泥街|鬼骰坊|裂石擂|苦煙館|夜雨樓|碼頭)/g)) {
    if (match[1] !== result.state.currentLocation)
      fail("location", `${route}: ${match[0]} while at ${result.state.currentLocation}`);
  }
  inspect(result.state, route);
  return result.state;
}

function walkTo(state, destination, route) {
  for (let count = 0; count < 40; count++) {
    if (state.pendingEncounter) {
      state = step(state, availableOptions(state)[0], route);
      continue;
    }
    if (state.flags.pendingIncident) {
      const local = availableOptions(state).find((option) => !option.startsWith("F."));
      const payable = local && ((local.includes("[付錢息事]") && state.silver >= 20)
        || (local.includes("[買帳頁線索]") && state.silver >= 10)
        || (local.includes("[自掏補帳]") && state.silver >= 10));
      if (local && (!/\[(?:付錢息事|買帳頁線索|自掏補帳)\]/.test(local) || payable)) {
        state = step(state, local.match(/\[[^\]]+\]/)?.[0], route); continue;
      }
    }
    if (state.currentLocation === destination && !state.flags.pendingIncident && !state.pendingEncounter) return state;
    const nextDestination = state.flags.pendingIncident === "market_raid" ? "黑泥街" : destination;
    const queue = [[state.currentLocation]];
    let path;
    while (queue.length) {
      const candidate = queue.shift();
      if (candidate.at(-1) === nextDestination) { path = candidate; break; }
      for (const next of ROAD_ADJACENCY[candidate.at(-1)] || [])
        if (!candidate.includes(next)) queue.push([...candidate, next]);
    }
    assert.ok(path, `${route}: no road to ${nextDestination}`);
    const next = path[1];
    assert.ok(ROAD_ADJACENCY[state.currentLocation].includes(next));
    state = step(state, `[明路前往] ${next}`, route);
  }
  assert.equal(state.currentLocation, destination);
  return state;
}

function settlePending(state, route) {
  if (!state.flags.pendingIncident) return state;
  if (state.flags.pendingIncident === "market_raid" && state.currentLocation !== "黑泥街")
    state = walkTo(state, "黑泥街", route);
  if (state.flags.pendingIncident === "missing_ledger" && state.currentLocation !== "青鋒堂總壇")
    state = walkTo(state, "青鋒堂總壇", route);
  if (!state.flags.pendingIncident) return state;
  const preferred = state.flags.pendingIncident === "market_raid" ? "[設局取證]"
    : state.flags.pendingIncident === "missing_ledger" ? "[告知堂主]" : "[封存藥包]";
  const local = availableOptions(state).find((option) => option.includes(preferred));
  assert.ok(local, `${route}: no local incident response at ${state.currentLocation}`);
  return step(state, local.match(/\[[^\]]+\]/)?.[0], route);
}

function createCharacter({ inventory = ["【灌鉛假骰】", "【生石灰包】"], mp } = {}) {
  const stats = aptitude("阿七", "賭坊收帳人", "察言觀色");
  return normalizeState({
    turn: 1, playerName: "阿七", background: "賭坊收帳人", trait: "察言觀色",
    currentLocation: "青鋒堂總壇", inventory, maxInventory: 4,
    playerHp: stats.hp, maxHp: stats.hp, hpScaleVersion: 2,
    playerMp: mp ?? stats.mp, maxMp: stats.mp,
    silver: 0, factionFunds: STARTING_FACTION_FUNDS, sectLifeline: 60, worldFlags: [], relationships: newRelationships(),
    questStep: "prologue_briefing",
    flags: { tookHerbs: false, visitedYung: false, collectedMarketFee: false,
      marketAmbushTriggered: false, darkHandInitialized: true },
  });
}

function reachMarket(route, config = {}) {
  let state = createCharacter(config);
  state = step(state, "opening", route, true);
  state = step(state, "[即刻領命]", route);
  assert.equal(state.questStep, "kuyan_medicine");
  assert.equal(state.currentLocation, "苦煙館");
  state = step(state, "[急取膏藥]", route);
  assert.equal(state.questStep, "market_collection");
  assert.equal(state.currentLocation, "黑泥街");
  assert.ok(state.sceneState);
  return state;
}

function finishAmbush(state, route) {
  for (let round = 0; round < 12 && state.combat; round++) {
    const choice = availableOptions(state).find((option) => option.startsWith("A.")) || availableOptions(state)[0];
    state = step(state, optionKey(choice) === choice ? choice : `[${optionKey(choice)}]`, route);
  }
  assert.equal(state.combat, undefined, `${route}: combat did not finish`);
  return state;
}

function settle(state, route) {
  assert.equal(state.flags.marketAftermath, true);
  const before = state.turn;
  state = step(state, state.flags.marketAftermathKind === "escape" ? "[離巷收隊]" : "[安頓收隊]", route);
  assert.equal(state.flags.marketAftermath, false);
  assert.equal(state.flags.alleyEscape, false);
  assert.equal(state.worldFlags.filter((flag) => flag === "市集殘局已定").length, 1);
  assert.ok(state.turn > before);
  assert.ok(availableOptions(state).some((option) => option.includes("[巡街收規]")));
  return state;
}

function reachChapter(state, route) {
  const runAt = (place, marker) => {
    for (let i = 0; i < 20; i++) {
      if (state.flags.pendingIncident) state = settlePending(state, route);
      else if (state.currentLocation !== place) state = walkTo(state, place, route);
      else { state = step(state, marker, route); return; }
    }
    assert.fail(`Could not perform ${marker} at ${place}`);
  };
  if (state.worldFlags.includes(SPY_CASE_FLAG)) {
    runAt("苦煙館", "[細查] 驗傷者兵刃");
    runAt("黑泥街", "[細查] 追問撤哨命令");
    runAt("醉春樓後巷", "[細查] 截玄武樓線人");
    assert.ok(["軟筋散調撥總哨", "黑泥街總哨撤令", "總哨城防盲區圖"].every((flag) => state.worldFlags.includes(flag)));
    runAt("青鋒堂總壇", "指認白冷");
    assert.equal(state.flags.spyExposed, true);
  } else {
    runAt("青鋒堂總壇", "[領差] 守街名冊");
    runAt("黑泥街", "[辦差] 守街名冊");
    runAt("黑泥街", "[領差] 雙重勒索");
    runAt("晚秋茶寮", "[辦差] 雙重勒索");
    runAt("晚秋茶寮", "[領差] 失蹤腳夫");
    runAt("夜雨樓", "[辦差] 失蹤腳夫");
    assert.ok(["同門守街名冊", "街坊願意守街", "刀手進城路線"].every((flag) => state.worldFlags.includes(flag)));
  }
  for (let i = 0; i < 90 && !state.flags.finalCrisis; i++) {
    if (state.flags.pendingIncident) state = settlePending(state, route);
    else if (state.currentLocation !== "青鋒堂總壇") state = walkTo(state, "青鋒堂總壇", route);
    else state = step(state, "[休整]", route);
  }
  assert.equal(state.flags.finalCrisis, true, `${route}: final crisis never opened`);
  state = step(state, "[固守城西]", route);
  assert.equal(state.flags.ending, "守住城西");
  state = step(state, "[踏入第一章]", route);
  assert.equal(state.questStep, "chapter_one");
  for (let i = 0; i < 3 && state.flags.chapterOne.stage === "rest"; i++)
    state = step(state, "[核對貨帳]", route);
  assert.equal(state.flags.chapterOne.stage, "shortage");
  while (state.playerMp < 10) state = step(state, "[總壇休養]", route);
  state = walkTo(state, state.flags.chapterOne.affectedBusiness, route);
  state = step(state, `[查${state.flags.chapterOne.affectedBusiness}]`, route);
  assert.equal(state.currentLocation, state.flags.chapterOne.affectedBusiness);
  assert.equal(state.flags.chapterOne.stage, "shortage");
  assert.equal(state.flags.chapterOne.foundShortageLocation, true);
  state = walkTo(state, "青鋒堂總壇", route);
  state = step(state, "[交斷貨帳]", route);
  assert.equal(state.flags.chapterOne.stage, "dock");
  while (state.playerMp < 12) state = step(state, "[總壇休養]", route);
  state = step(state, "[明路前往] 碼頭", route);
  state = step(state, "[查碼頭貨單]", route);
  state = step(state, "[夜探碼頭]", route);
  state = step(state, "[硬奪碼頭]", route);
  assert.equal(state.flags.chapterOne.stage, "complete");
  assert.ok(state.worldFlags.includes("第一章碼頭復航"));
  return state;
}

function main() {
  let standard = reachMarket("standard");
  standard = step(standard, "[救護同門]", "standard");
  assert.ok(standard.worldFlags.includes("救下陸千帆"));
  standard = step(standard, "[催收規費]", "standard");
  assert.equal(standard.questStep, "huizhi_ambush");
  standard = finishAmbush(standard, "standard");
  assert.equal(standard.flags.marketAftermath, true);
  standard = settle(standard, "standard");
  standard.silver = 20;
  reachChapter(standard, "standard");

  for (const exit of ["[踢翻餿水桶]", "[踩籮翻牆]"]) {
    const route = `alley/${exit}`;
    let state = reachMarket(route);
    state = step(state, "[護人撤離]", route);
    if (state.questStep === "huizhi_ambush") state = step(state, "[撤入死巷]", route);
    assert.equal(state.flags.alleyEscape, true);
    state = step(state, exit, route);
    if (state.flags.alleyWall) {
      assert.ok(state.sceneState.depletedSources.includes("餿水桶"));
      state = step(state, "[借牆脫身]", route);
    }
    assert.equal(state.flags.marketAftermathKind, "escape");
    settle(state, route);
  }
  {
    const route = "combat-retreat";
    let state = reachMarket(route);
    state = step(state, "[救護同門]", route);
    state = step(state, "[催收規費]", route);
    state = step(state, "[護人撤離]", route);
    assert.equal(state.flags.alleyEscape, true);
    state = step(state, "[踢翻餿水桶]", route);
    state = step(state, "[借牆脫身]", route);
    settle(state, route);
  }

  for (const [route, action, flag] of [
    ["betrayal", "F. [自訂手段] 出賣陸千帆", "出賣陸千帆"],
    ["embezzle", "F. [自訂手段] 私吞規費", "私吞五十文規費"],
  ]) {
    let state = reachMarket(route);
    const startingSilver = state.silver;
    const startingLifeline = state.sectLifeline;
    state = step(state, action, route);
    assert.ok(state.worldFlags.includes(flag));
    assert.equal(state.questStep, "huizhi_ambush");
    if (route === "betrayal") {
      assert.equal(state.relationships["陸千帆"].estranged, true);
      assert.equal(state.sectLifeline, startingLifeline - 15);
    } else {
      assert.equal(state.silver, startingSilver + 50);
      assert.equal(state.sectLifeline, startingLifeline - 10);
      assert.equal(state.flags.collectedMarketFee, true);
    }
    state = finishAmbush(state, route);
    if (state.flags.marketAftermath) state = settle(state, route);
    if (route === "embezzle") {
      state = walkTo(state, "青鋒堂總壇", route);
      assert.ok(state.worldFlags.includes("何不歸查出私吞"));
    } else assert.equal(state.relationships["陸千帆"].estranged, true);
  }

  let exhausted = reachMarket("no-medicine/zero-energy/no-lime", { inventory: [], mp: 0 });
  exhausted.inventory = exhausted.inventory.filter((item) => !/藥|石灰/.test(item));
  exhausted.playerMp = 0;
  assert.equal(exhausted.playerMp, 0);
  exhausted = step(exhausted, "[救護同門]", "no-medicine/zero-energy/no-lime");
  assert.ok(exhausted.worldFlags.includes("救下陸千帆"));
  exhausted.inventory = exhausted.inventory.filter((item) => !/藥|石灰/.test(item));
  assert.ok(availableOptions(exhausted).length > 0);
  assert.ok(!availableOptions(exhausted).some((option) => /\[袖藏暗手\]|\[全力陰手\]/.test(option)));
  exhausted = step(exhausted, "[催收規費]", "no-medicine/zero-energy/no-lime");
  assert.ok(availableOptions(exhausted).length > 0);
  assert.ok(availableOptions(exhausted).some((option) => option.startsWith("A.")));
  finishAmbush(exhausted, "no-medicine/zero-energy/no-lime");

  const opened = step(createCharacter(), "opening", "branch-matrix", true);
  let matrixCases = 0;
  for (const hallAction of availableOptions(opened)) {
    const clinicState = step(opened, hallAction, "branch-matrix");
    for (const clinicAction of availableOptions(clinicState)) {
      const marketState = step(clinicState, clinicAction, "branch-matrix");
      for (const marketAction of availableOptions(marketState)) {
        let state = step(marketState, marketAction, "branch-matrix");
        matrixCases++;
        if (state.questStep === "market_collection") state = step(state, "[催收規費]", "branch-matrix");
        if (state.combat) state = finishAmbush(state, "branch-matrix");
        if (state.flags.alleyEscape) {
          state = step(state, "[踩籮翻牆]", "branch-matrix");
          if (state.flags.alleyWall) state = step(state, "[借牆脫身]", "branch-matrix");
        }
        if (state.flags.marketAftermath) state = settle(state, "branch-matrix");
        assert.equal(state.questStep, "sandbox");
        assert.equal(state.flags.marketAftermath, false);
      }
    }
  }

  const sandboxSeed = createCharacter();
  for (const encounter of ENCOUNTERS) {
    for (const choice of encounterOptions(encounter.id)) {
      const route = `encounter-${encounter.id}`;
      const state = normalizeState({ ...sandboxSeed, questStep: "sandbox", currentLocation: encounter.location,
        turn: 20, lastEncounterTurn: 20, pendingEncounter: encounter.id, silver: 20,
        flags: { ...sandboxSeed.flags, lastIncidentTurn: 20 } });
      assert.deepEqual(availableOptions(state), encounterOptions(encounter.id));
      const settled = step(state, choice, route);
      assert.equal(settled.pendingEncounter, undefined, route);
    }
  }
  for (const mission of MISSIONS) {
    const state = normalizeState({ ...sandboxSeed, questStep: "sandbox", currentLocation: mission.origin, turn: 2 });
    assert.ok(!availableOptions(state).some((option) => /\[(?:領差|辦差|速辦)\]/.test(option)));
    assert.ok(!availableOptions({ ...state, currentLocation: mission.target }).some((option) => /\[(?:領差|辦差|速辦)\]/.test(option)));
  }
  for (const place of LANDMARKS.filter((landmark) => landmark !== "碼頭")) {
    inspect(normalizeState({ ...sandboxSeed, questStep: "sandbox", currentLocation: place, turn: 12 }),
      "all-landmarks");
    for (const incident of ["market_raid", "missing_ledger", "tainted_medicine"])
      inspect(normalizeState({ ...sandboxSeed, questStep: "sandbox", currentLocation: place, turn: 12,
        flags: { ...sandboxSeed.flags, pendingIncident: incident } }), "all-incidents");
  }

  const finalClues = ["同門守街名冊", "假借據完成", "拳手暗傷底細"];
  const endingSeed = normalizeState({ ...sandboxSeed, questStep: "sandbox", turn: 70,
    sectLifeline: 60, worldFlags: finalClues,
    flags: { ...sandboxSeed.flags, finalCrisis: true } });
  for (const [route, action, expected] of [
    ["ending-success", "[固守城西]", "守住城西"],
    ["ending-cede", "[割地求存]", "割地求存"],
    ["ending-leave", "[獨自撤走]", "獨自撤走"],
  ]) {
    const ended = step(endingSeed, action, route);
    assert.equal(ended.flags.ending, expected, route);
    if (expected === "守住城西") {
      const chapter = step(ended, "[踏入第一章]", route);
      assert.equal(chapter.flags.chapterOne.stage, "rest", route);
    } else assert.ok(availableOptions(ended)[0].includes("[回顧結局]"), route);
  }
  const failedStand = step(normalizeState({ ...endingSeed, sectLifeline: 59,
    worldFlags: ["刀手進城路線", "假借據完成", "拳手暗傷底細"] }),
  "[固守城西]", "ending-failure");
  assert.equal(failedStand.flags.ending, "城西陷落");
  assert.ok(availableOptions(failedStand)[0].includes("[回顧結局]"));

  const byKind = [...findings.values()].reduce((groups, item) => {
    (groups[item.kind] ||= []).push(item);
    return groups;
  }, {});
  console.log(JSON.stringify({ matrixCases, branches: branches.size, states: visited.size,
    findings: Object.fromEntries(Object.entries(byKind).map(([kind, items]) =>
      [kind, { count: items.length, examples: items.slice(0, 5).map((item) => item.detail) }])) }, null, 2));
  if (findings.size) process.exitCode = 1;
}

main();
