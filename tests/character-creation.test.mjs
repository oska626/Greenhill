import test from "node:test";
import assert from "node:assert/strict";
import { STARTING_ITEMS_BY_BACKGROUND, startingInventory, startingItemOptions } from "../lib/character-creation.ts";

const expected = {
  debt_collector: ["【灌鉛假骰】", "【催債短木令】", "【開鎖鐵線】", "【止血散】"],
  doc_assistant: ["【止血散】", "【行醫薄刃】", "【艾草藥條】", "【粗鐵護腕】"],
  pickpocket: ["【開鎖鐵線】", "【割包小薄刀】", "【爛布蒙面巾】", "【止血散】"],
  martial_dropout: ["【粗鐵護腕】", "【破舊纏手布】", "【行氣散】", "【開鎖鐵線】"],
  custom: ["【開鎖鐵線】", "【止血散】", "【粗鐵護腕】", "【灌鉛假骰】"],
};

test("each background offers four distinct starting items and starts with exactly two inventory slots used", () => {
  assert.deepEqual(STARTING_ITEMS_BY_BACKGROUND, expected);
  for (const backgroundId of Object.keys(expected)) {
    const choices = startingItemOptions(backgroundId);
    assert.equal(new Set(choices).size, 4);
    for (const choice of choices) {
      assert.deepEqual(startingInventory(backgroundId, choice), ["【生石灰包】", choice]);
    }
    assert.deepEqual(startingInventory(backgroundId, "【不在選單的物件】"), ["【生石灰包】", choices[0]]);
  }
});
