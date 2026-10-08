import assert from "node:assert/strict";
import test from "node:test";
import { createPrologueHandoff } from "../lib/prologue-handoff.ts";

function finished(ending) {
  return {
    turn: 70, silver: 21, playerHp: 73, maxHp: 100, playerMp: 42, maxMp: 50,
    worldFlags: ["同門守街名冊", "出賣陸千帆"],
    flags: { ending, prologueCompanionLeads: ["容晚秋"] },
  };
}

test("chapter handoff is made only after a prologue ending", () => {
  assert.equal(createPrologueHandoff(finished(undefined)), null);
  for (const ending of ["守住城西", "城西陷落", "割地求存", "獨自撤走"]) {
    const handoff = createPrologueHandoff(finished(ending));
    assert.equal(handoff.version, 1);
    assert.equal(handoff.ending, ending);
    assert.match(handoff.summary, /第70回合/);
  }
});

test("handoff paragraph carries relevant consequences without declaring companions joined", () => {
  const handoff = createPrologueHandoff(finished("守住城西"));
  assert.match(handoff.summary, /玄武樓暫退/);
  assert.match(handoff.summary, /容晚秋；他們尚未答應同行/);
  assert.match(handoff.summary, /守街名冊/);
  assert.match(handoff.summary, /陸千帆與你決裂/);
  assert.match(handoff.summary, /私銀21文，氣血73\/100，精力42\/50/);
  assert.equal(handoff.summary.includes("\n"), false);
});
