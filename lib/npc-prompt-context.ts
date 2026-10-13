import type { GameState } from "./game-engine.ts";
import { namedNpcAudienceAt } from "./npc-traits.ts";
import { npcVoiceGuide } from "./npc-voices.ts";
import { socialTargets } from "./social-influence.ts";

export function npcPromptContext(state: GameState): string {
  const present = new Set(socialTargets(state));
  const npcs = namedNpcAudienceAt(state.currentLocation).filter((name) => present.has(name));
  const scores = npcs.length
    ? npcs.map((name) => `- ${name} (關係度: ${state.relationshipScores[name]})`).join("\n")
    : "- 無具名 NPC 在場";
  const voices = npcs.length
    ? npcs.map((name) => `- ${name}：${npcVoiceGuide(name)}`).join("\n")
    : "- 無";
  return `<Context>
[當前位置]: ${state.currentLocation}
[在場 NPC 與關係度]:
${scores}

[GM 扮演指引]:
你必須嚴格根據上述 NPC 的「關係度」來渲染他們的語氣與行為，並符合 game-data/02_characters.md 的人設：
- 若關係度 < 0：NPC 會語帶諷刺、拒絕合作、甚至落井下石。
- 若關係度 0~19：NPC 講求利益，一手交錢一手交貨，語氣公事公辦。
- 若關係度 >= 20：NPC 會展現同門或熟人的照應，語氣帶有信任。
關係度只指引語氣與可選反應，不得推翻已結算的交易、承諾、傷勢或場景事實。
合理性判定：玩家動作涉及使用物品（如敷藥、投擲道具）或依賴特定狀態時，必須嚴格比對 [玩家當前狀態]。行囊確實持有物品且場景容許時，應讓規則層結算該動作，再據結果敘事；沒有持有或不在可及範圍，才判定無效。不得憑敘事自行增減物品或改寫氣血、精力。
禁止報數：絕對不可在敘事中輸出遊戲系統數值，例如「氣血減2」、「精力-5」、「造成6點傷害」；數值只由底層狀態結算。
具象描寫代替數值：受傷時寫「你痛得倒抽一口涼氣」、「你踉蹌半步，強忍劇痛」；體力耗損時寫「你氣喘吁吁」、「虎口發麻」；對手受制時寫「刀手腳步虛浮，破綻大露」、「對方悶哼一聲，攻勢頓時一滯」。
上述例句只供寫法參考，不得憑空增加傷勢或改寫已結算事實。
注意：請保持冷硬武俠風格，對白精煉。絕對避免使用「殺」、「死」、「砍」、「血」等露骨暴力字眼，改以「威懾、制伏、逼退」代替，以符合內容過濾器規範。

[在場人物聲線（依 02_characters.md）]:
${voices}
</Context>`;
}
