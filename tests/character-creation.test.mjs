import test from "node:test";
import assert from "node:assert/strict";
import { STARTING_ITEMS_BY_BACKGROUND, startingInventory, startingItemOptions, startingWeaponForInventory } from "../lib/character-creation.ts";
import { WEAPONS } from "../lib/combat-engine.ts";
import { normalizeState, resolveTurn } from "../lib/game-engine.ts";

const expected = {
  debt_collector: ["【灌鉛假骰】", "【催債短棍】", "【開鎖鐵線】", "【止血散】"],
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

test("selected starting weapons are equipped, displayed by name, and survive the opening turn", () => {
  const selections = [
    ["debt_collector", "【催債短棍】", "debt_baton"],
    ["doc_assistant", "【行醫薄刃】", "medical_blade"],
    ["pickpocket", "【割包小薄刀】", "pickpocket_knife"],
  ];
  for (const [background, selected, expected] of selections) {
    const inventory = startingInventory(background, selected);
    const equippedWeapon = startingWeaponForInventory(inventory);
    assert.equal(equippedWeapon, expected);
    const state = normalizeState({ playerName: "阿七", background: "試玩", trait: "試玩",
      questStep: "prologue_briefing", inventory, equippedWeapon,
      weaponDurability: WEAPONS[equippedWeapon].maxDurability });
    assert.equal(state.equippedWeapon, expected);
    assert.equal(WEAPONS[state.equippedWeapon].name, selected.slice(1, -1));
    assert.equal(state.weaponDurability, WEAPONS[expected].maxDurability);
    const opened = resolveTurn(state, "[初入堂口] 阿七", true);
    assert.equal(opened.state.equippedWeapon, expected);
    assert.ok(opened.state.inventory.includes(selected));
  }
  assert.equal(startingWeaponForInventory(startingInventory("doc_assistant", "【止血散】")), "fists");
});
