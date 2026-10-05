import { NextRequest, NextResponse } from "next/server";

export interface GameState {
  turn: number;
  playerName: string;
  background: string;
  trait: string;
  currentLocation: string;
  inventory: string[];
  maxInventory: number;
  playerHp: number;
  maxHp: number;
  playerMp: number;
  maxMp: number;
  silver: number;
  factionFunds: number;
  hozaiDefense: number;
  questStep: "prologue_briefing" | "yung_tea_stall" | "market_collection" | "huizhi_ambush" | "sandbox";
  flags: {
    tookHerbs: boolean;
    visitedYung: boolean;
    collectedMarketFee: boolean;
    marketAmbushTriggered: boolean;
  };
}

const SYSTEM_PROMPT = `
你係文字冒險遊戲《青山城》的遊戲主持人 (GM)。
背景為純正古代中原武俠時代，殘酷市井風格，完全禁止現代詞彙。

【青山城勢力版圖】
1. 城西（明心閣·何仔）：沒落為下九流地痞堂口，經營賭檔、暗娼、收保護費。
2. 城東（匯智樓·鋒少）：富庶黑道，豢養傭兵刀手，暗中進行邪派活人試藥。
3. 城南（青山資產管理·黃棠）：豪紳巨賈，手握鐵甲衛與守城機關重弩。
4. 城北（官衙·僧臣）：朝廷特派特務，清修僧侶外貌，專門監視江湖幫派。
5. 城中（城主府·西涼）：名義最高統治者，挑撥各派互鬥抽成。

【開局四幕動線引導 (嚴格遵循)】
1. 第一幕 (prologue_briefing)：若玩家選擇「領命出發」，何仔遞出【生草藥包】（acquiredItem: "【生草藥包】"），動身前往「容姐茶檔」（locationUpdate: "容姐茶檔"，nextQuestStep: "yung_tea_stall"）。防錯機制：若玩家選擇「打探」或「查驗地圖」，請留在原地回答，nextQuestStep 保持 "prologue_briefing"，acquiredItem 留空。
2. 第二幕 (yung_tea_stall)：容姐茶檔。交付草藥包（consumedItem: "【生草藥包】"），換得【一壺苦涼茶】（acquiredItem: "【一壺苦涼茶】"），指引前往「泥濘市集」（nextQuestStep: "market_collection"）。
3. 第三幕 (market_collection)：市集收規。見到域卡度，向張屠戶收取 50 文欠款。教學「市井泥漿流」。收齊後（silverDelta 或 factionFundsDelta +40/50）。
4. 第四幕 (huizhi_ambush)：匯智樓插旗。規費剛收完，匯智樓管事率精銳傭兵殺入市集插旗踩場，正式引爆衝突！

【輸出規範】
必須以繁體中文（帶道地江湖市井感）輸出合規的 JSON：
{
  "narrative": "場景描寫與對話劇情",
  "options": ["1. [行動] ...", "2. [行動] ...", "3. [行動] ..."],
  "consumedItem": "使用的物品名稱（若無則為空字串）",
  "acquiredItem": "獲得的物品名稱（若無則為空字串）",
  "locationUpdate": "更新後的當前地點（若無變更則為空字串）",
  "hpDelta": 0,
  "mpDelta": 0,
  "silverDelta": 0,
  "factionFundsDelta": 0,
  "hozaiDefenseDelta": 0,
  "nextQuestStep": "prologue_briefing" | "yung_tea_stall" | "market_collection" | "huizhi_ambush" | "sandbox"
}
`;

export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: "前端傳送的資料格式錯誤 (req.json 解析失敗)" }, { status: 400 });
    }

    const { action, state }: { action?: string; state?: GameState } = body;

    if (!state) {
      return NextResponse.json({ error: "遺失遊戲狀態 (State is required)" }, { status: 400 });
    }

    // 嚴密防護的狀態拷貝，避免任何 undefined 導致 Spread 崩潰
    const updatedState: GameState = {
      ...state,
      turn: (state.turn || 1) + 1,
      flags: state.flags ? { ...state.flags } : { tookHerbs: false, visitedYung: false, collectedMarketFee: false, marketAmbushTriggered: false },
      inventory: Array.isArray(state.inventory) ? [...state.inventory] : [],
    };

    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "伺服器遺失 API Key (GEMINI_API_KEY)。請檢查 Vercel Environment Variables 設定，並確保已 Redeploy 套用。" }, { status: 500 });
    }

    const prompt = `
當前玩家狀態：
- 玩家名號: ${updatedState.playerName || "無名氏"} (${updatedState.background || "流民"})
- 核心特質: ${updatedState.trait || "草莽之軀"}
- 當前地點: ${updatedState.currentLocation || "明心閣"}
- 主線階段: ${updatedState.questStep || "prologue_briefing"}
- 行囊 (${updatedState.inventory.length}/${updatedState.maxInventory}): [${updatedState.inventory.join(", ")}]
- 氣血: ${updatedState.playerHp}/${updatedState.maxHp}
- 內力: ${updatedState.playerMp}/${updatedState.maxMp}
- 個人銀兩: ${updatedState.silver} 文
- 門派流動金: ${updatedState.factionFunds} 文
- 何仔防線: ${updatedState.hozaiDefense}/100

玩家選擇的行動: "${action || "環顧四周"}"

請根據世界觀、當前階段與玩家行動，產生下一回合劇情及選項。嚴格遵守 JSON 格式輸出。
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT }, { text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`LLM API 請求失敗 (Status: ${response.status})`);
    }

    let data;
    try {
      data = await response.json();
    } catch(e) {
      return NextResponse.json({ error: "無法解析 LLM 回傳內容" }, { status: 500 });
    }
    
    let resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resultText) {
      return NextResponse.json({ error: "AI 未能產生回應，請重試行動" }, { status: 500 });
    }

    // 終極 JSON 防禦：清理 LLM 自作聰明加上的 markdown 標籤
    resultText = resultText.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    
    let parsed;
    try {
      parsed = JSON.parse(resultText);
    } catch (parseError) {
      console.error("JSON 解析失敗:", resultText);
      return NextResponse.json({ error: "AI 輸出的劇情格式混亂，無法解析，請點擊重試" }, { status: 500 });
    }

    if (parsed.hpDelta) updatedState.playerHp = Math.max(0, Math.min(updatedState.maxHp, updatedState.playerHp + parsed.hpDelta));
    if (parsed.mpDelta) updatedState.playerMp = Math.max(0, Math.min(updatedState.maxMp, updatedState.playerMp + parsed.mpDelta));
    if (parsed.silverDelta) updatedState.silver = Math.max(0, updatedState.silver + parsed.silverDelta);
    if (parsed.factionFundsDelta) updatedState.factionFunds = Math.max(0, updatedState.factionFunds + parsed.factionFundsDelta);
    if (parsed.hozaiDefenseDelta) updatedState.hozaiDefense = Math.max(0, Math.min(100, updatedState.hozaiDefense + parsed.hozaiDefenseDelta));

    if (parsed.locationUpdate && parsed.locationUpdate.trim() !== "") {
      updatedState.currentLocation = parsed.locationUpdate.trim();
    }

    if (parsed.nextQuestStep) {
      updatedState.questStep = parsed.nextQuestStep;
    }

    const consumedItem = parsed.consumedItem;
    if (consumedItem && typeof consumedItem === "string" && consumedItem.trim() !== "") {
      const target = consumedItem.trim();
      const idx = updatedState.inventory.findIndex((item: string) =>
        item && item.trim() !== "" && (item.includes(target) || target.includes(item))
      );
      if (idx !== -1) {
        updatedState.inventory.splice(idx, 1);
      }
    }

    const acquiredItem = parsed.acquiredItem;
    if (acquiredItem && typeof acquiredItem === "string" && acquiredItem.trim() !== "") {
      if (updatedState.inventory.length < updatedState.maxInventory) {
        updatedState.inventory.push(acquiredItem.trim());
      }
    }

    return NextResponse.json({
      narrative: parsed.narrative,
      options: parsed.options,
      state: updatedState,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "發生未知的伺服器錯誤";
    console.error("Turn processing error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
