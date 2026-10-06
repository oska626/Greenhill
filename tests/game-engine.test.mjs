import assert from "node:assert/strict";
import test from "node:test";
import { aptitude, LANDMARKS, normalizeState, resolveTurn } from "../lib/game-engine.ts";
import { NPC_VOICES, npcVoiceGuide, repeatedNpcLine } from "../lib/npc-voices.ts";

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

test("opening gives each created background a concrete character detail", () => {
  const portraits = [
    ["爛賭收數佬", "察言觀色", "骰繭"],
    ["城西街童扒手", "手疾眼快", "退路"],
    ["濕鳩武館棄徒", "皮糙肉厚", "舊傷"],
    ["黑市醫道學徒", "辨毒識藥", "藥色"],
    ["自定義市井流民", "見風使舵", "何仔的臉色"],
  ];
  for (const [background, trait, detail] of portraits) {
    const opening = resolveTurn({ ...newGame(), background, trait }, "[初入堂口] 阿七", true);
    assert.ok(opening.event.includes(detail), `${background} should show ${detail}`);
    assert.ok(opening.event.startsWith("你踩過城西泥巷"), "city overview should precede Ho Zai");
    assert.equal(opening.npcReply.speaker, "何仔");
    assert.ok(opening.npcReply.line.includes("阿七，你"), `${background} needs Ho Zai's assessment`);
    assert.ok(opening.npcReply.line.includes("域卡度是自家人，挨了匯智樓一刀"));
    assert.ok(opening.npcReply.line.includes("五十文"));
    assert.ok(!opening.event.includes("打量你的出身"));
  }
});

test("custom opening turns profile details into Ho Zai's judgement rather than a checklist", () => {
  const profiles = [
    { gender: "女", skill: "開鎖", personality: "多疑", address: "阿七姑娘", skillCue: "鎖眼", personalityCue: "防人" },
    { gender: "男子", skill: "使短刀", personality: "脾氣暴躁", address: "阿七兄弟", skillCue: "護人", personalityCue: "脾氣" },
    { gender: "非二元", skill: "辨藥", personality: "嘴硬心軟", address: "阿七", skillCue: "認得藥", personalityCue: "心軟" },
  ];
  for (const profile of profiles) {
    const state = normalizeState({ ...newGame(), background: "自定義市井流民", trait: profile.skill, ...profile });
    const opening = resolveTurn(state, "[初入堂口] 阿七", true);
    assert.equal(opening.state.gender, profile.gender);
    assert.equal(opening.state.skill, profile.skill);
    assert.equal(opening.state.personality, profile.personality);
    assert.ok(opening.npcReply.line.startsWith(profile.address));
    assert.ok(opening.npcReply.line.includes(profile.skillCue));
    assert.ok(opening.npcReply.line.includes(profile.personalityCue));
    assert.ok(!opening.npcReply.line.includes("性子"));
    assert.ok(opening.npcReply.line.includes("域卡度"));
    assert.ok(opening.npcReply.line.includes("五十文"));
    assert.equal(opening.state.maxHp, aptitude("阿七", "自定義市井流民", profile.skill).hp);
  }
  assert.ok(aptitude("阿七", "自定義市井流民", "辨藥").hp < aptitude("阿七", "自定義市井流民", "摸鎖").hp);
  assert.ok(aptitude("阿七", "自定義市井流民", "摸鎖").hp < aptitude("阿七", "自定義市井流民", "使短刀").hp);
});

test("every sandbox choice has a distinct event and NPC reply", () => {
  for (const location of LANDMARKS) {
    const state = { ...newGame(), questStep: "sandbox", currentLocation: location, silver: 100, factionFunds: 100 };
    const options = resolveTurn(state, `F. [前往] ${location}`, false).options;
    const events = new Set();
    for (const option of options) {
      const turn = resolveTurn(state, option, false);
      assert.ok(!turn.event.includes("照自己的意思行事"), `${location}: ${option}`);
      assert.ok(turn.npcReply?.line, `${location}: ${option} needs a reply`);
      events.add(turn.event);
    }
    assert.equal(events.size, options.length, `${location} should react differently to each choice`);
  }
  const market = { ...newGame(), questStep: "sandbox", currentLocation: "泥濘市集" };
  const injury = resolveTurn(market, "C. [找域卡度] 問域卡度傷勢。", false);
  assert.match(injury.event, /刀口卻未合/);
  assert.equal(injury.npcReply.speaker, "域卡度");
});

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
    if (turn.state.flags.pendingIncident) turn = resolveTurn(turn.state, turn.options[0], false);
    turn = resolveTurn(turn.state, `F. [前往] ${place}`, false);
    assert.equal(turn.state.currentLocation, place);
  }
  if (turn.state.flags.pendingIncident) turn = resolveTurn(turn.state, turn.options[0], false);
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

test("turn eight interrupts the sandbox with a new choice and resolves its consequence", () => {
  let turn = resolveTurn(newGame(), "[初入堂口] 阿七", true);
  for (let index = 0; index < 4; index++) turn = resolveTurn(turn.state, turn.options[0], false);
  assert.equal(turn.state.turn, 5);
  for (let index = 0; index < 3; index++) turn = resolveTurn(turn.state, turn.options[2], false);
  assert.equal(turn.state.turn, 8);
  assert.equal(turn.state.flags.pendingIncident, "market_raid");
  assert.match(turn.event, /插旗/);
  assert.match(turn.options[0], /護住攤販/);
  const settled = resolveTurn(normalizeState(turn.state), turn.options[0], false);
  assert.equal(settled.state.flags.pendingIncident, undefined);
  assert.ok(settled.state.worldFlags.includes("市集守住"));
  assert.match(settled.event, /街坊守住肉檔/);
  assert.match(settled.options[0], /巡街收規/);
});

test("later incidents change options and preserve resource consequences", () => {
  let state = { ...newGame(), turn: 12, questStep: "sandbox", silver: 20, factionFunds: 30 };
  state.flags = { ...state.flags, incidentCount: 1, lastIncidentTurn: 8 };
  let turn = resolveTurn(state, "C. [盤點] 清點堂口帳目。", false);
  assert.equal(turn.state.flags.pendingIncident, "missing_ledger");
  assert.match(turn.options[0], /查賭檔/);
  turn = resolveTurn(turn.state, turn.options[3], false);
  assert.equal(turn.state.factionFunds, 20);
  assert.ok(turn.moneyNote.includes("公款減少10文"));
  state = { ...turn.state, turn: 17 };
  turn = resolveTurn(state, "F. [前往] 容姐茶檔", false);
  assert.equal(turn.state.flags.pendingIncident, "tainted_medicine");
  assert.match(turn.options[0], /封存藥包/);
  turn = resolveTurn(turn.state, turn.options[3], false);
  assert.equal(turn.state.silver, 10);
  assert.ok(turn.state.worldFlags.includes("可疑傷藥已處置"));
});

test("repeated inquiries acknowledge that no new lead was found", () => {
  let turn = resolveTurn({ ...newGame(), questStep: "sandbox", currentLocation: "容姐茶檔", turn: 5 }, "B. [打探] 問容姐城西傳聞。", false);
  const firstReply = turn.npcReply.line;
  turn = resolveTurn(turn.state, "B. [打探] 問容姐城西傳聞。", false);
  assert.match(turn.event, /沒有新的線索/);
  assert.notEqual(turn.npcReply.line, firstReply);
  assert.equal(turn.state.flags.repeatedActionCount, 1);
});

test("an older sandbox save past turn eight receives the first incident on its next turn", () => {
  const oldSave = { ...newGame(), turn: 9, questStep: "sandbox" };
  const restored = normalizeState(oldSave);
  const turn = resolveTurn(restored, "C. [盤點] 清點堂口帳目。", false);
  assert.equal(turn.state.flags.pendingIncident, "market_raid");
  assert.match(turn.options[0], /護住攤販/);
});

test("named NPCs have distinct guidance and repeat replies", () => {
  const names = ["何仔", "容姐", "域卡度", "奇仕", "衛林", "佚名", "玉樺", "阿黃", "張屠戶"];
  assert.deepEqual(Object.keys(NPC_VOICES), names);
  assert.equal(new Set(names.map((name) => npcVoiceGuide(name))).size, names.length);
  assert.equal(new Set(names.map((name) => repeatedNpcLine(name, 1))).size, names.length);
  assert.match(npcVoiceGuide("衛林"), /短句/);
  assert.match(npcVoiceGuide("奇仕"), /帳房/);
});

test("incident replies use the speaker involved in each branch", () => {
  const state = { ...newGame(), questStep: "sandbox", turn: 13, flags: { ...newGame().flags, pendingIncident: "missing_ledger" } };
  assert.equal(resolveTurn(state, "A. [查賭檔] 到聚財坊核對缺失的規費帳。", false).npcReply.speaker, "奇仕");
  assert.equal(resolveTurn(state, "B. [問容姐] 問容姐誰曾帶走帳簿。", false).npcReply.speaker, "容姐");
  assert.equal(resolveTurn(state, "E. [告知何仔] 把帳目破綻交給何仔處置。", false).npcReply.speaker, "何仔");
});
