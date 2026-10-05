import { NextRequest, NextResponse } from "next/server";

// 遊戲狀態型態定義
export interface GameState {
  turn: number;
  currentLocation: string;
  inventory: string[];
  maxInventory: number;
  playerHp: number;
  maxHp: number;
  playerMp: number;
  maxMp: number;
  silver: number; // 單位：文 (1兩 = 1000文)
  factionFunds: number; // 門派流動金 (文)
  hozaiDefense: number; // 何仔防線 (0-100)
  questStep: "prologue_briefing" | "yung_tea_stall" | "market_collection" | "huizhi_ambush" | "sandbox";
  flags: {
    tookHerbs: boolean;
    visitedYung: boolean;
    collectedMarketFee: boolean;
    marketAmbushTriggered: boolean;
  };
}

// 初始遊戲狀態（連日暴雨初歇，身處明心閣總壇）
const INITIAL_STATE: GameState = {
  turn: 1,
  currentLocation: "明心閣總壇",
  inventory: ["【生草藥包】"],
  maxInventory: 4,
  playerHp: 100,
  maxHp: 100,
  playerMp: 50,
  maxMp: 50,
  silver: 0,
  factionFunds: 10,
  hozaiDefense: 60,
  questStep: "prologue_briefing",
  flags: {
    tookHerbs: true,
    visitedYung: false,
    collectedMarketFee: false,
    marketAmbushTriggered: false,
  },
};

// 武俠世界觀與系統指令 (System Prompt)
const SYSTEM_PROMPT = `
你係文字冒險遊戲《青山城》的遊戲主持人 (GM)。
背景為純正古代中原武俠時代，殘酷市井風格，完全禁止現代詞彙（如唐樓、電線、火器、摩天樓、科技）。

【青山城勢力版圖】
1. 城西（明心閣·何仔）：昔日以鑄神鋒聞名，如今沒落淪為下九流地痞堂口，經營賭檔、暗娼、高利貸、煙館、黑拳與收保護費。
2. 城東（匯智樓·鋒少）：富庶黑道，豢養精銳傭兵刀手，暗中進行人口販賣與邪派活人試藥。
3. 城南（青山資產管理·黃棠）：豪紳巨賈，城主西涼的經濟白手套，手握鐵甲衛與守城機關重弩，以官印地契兼併產業。
4. 城北（官衙·僧臣）：朝廷特派特務，清修僧侶外貌，專門監視西涼與江湖幫派，違者以叛逆罪抄家滅門。
5. 城中（城主府·西涼）：名義最高統治者，挑撥各派互鬥抽成。

【城西七大地標與駐守 NPC】
- 明心閣總壇：何仔（閣主/肉盾打太極，負責主線、休整回血回內）
- 怡紅院：玉樺（青樓管事/武學奇人，打探情報、聽曲留宿、傳授身法暗器）
- 聚財坊：奇仕（地下賭檔/毒舌帳房，博彩借貸、追數捉老千、傳授指法）
- 仙館：佚名（黑市煙檔/禁藥怪醫，黑市毒物交易、護送私貨）
- 武館：衛林 / 阿黃（黑市地下擂台，打黑拳、傳授外門剛猛拳腳硬氣功）
- 泥濘市集：域卡度（巡街壓場、強收保護費/例錢、黑市走私改裝）
- 容姐茶檔：容姐（街角茶檔，平價粗茶草藥補給、打聽市井瑣事八卦）

【開局四幕動線引導 (嚴格遵循)】
1. 第一幕 (prologue_briefing)：何仔派差。暴雨剛停，何仔在古堂將草藥包交給玩家，命令送往「容姐茶檔」，並叮囑之後去「市集」找域卡度收規費。
2. 第二幕 (yung_tea_stall)：容姐茶檔。交付草藥包，換得【一壺苦涼茶】（行囊上限4格），提示市集東邊有匯智樓生面孔出沒。
3. 第三幕 (market_collection)：市集收規。見到域卡度，向張屠戶收取 50 文欠款。教學「市井泥漿流」（抓灰撒眼、撩陰踩腳）。
4. 第四幕 (huizhi_ambush)：匯智樓插旗。規費剛收完，匯智樓管事率精銳傭兵殺入市集插旗踩場，正式引爆衝突！

【輸出規範】
你必須以繁體中文（可帶道地港式江湖市井對白）輸出合規的 JSON，格式如下：
{
  "narrative": "場景描寫與對話劇情",
  "options": [
    "1. [行動名稱] 具體行動說明",
    "2. [行動名稱] 具體行動說明",
    "3. [行動名稱] 具體行動說明"
  ],
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
    const body = await req.json();
    const { action, state }: { action?: string; state?: GameState } = body;

    // 若為無狀態的初次載入，直接回傳第一幕開場
    if (!state) {
      return NextResponse.json({
        narrative:
          "青山城連日暴雨初歇，簷前濁水滴瀝未止。\n\n" +
          "明心閣青瓦古堂內，正廳中央的昔日鑄劍巨爐早已冷透，積滿塵灰。閣主何仔眼圈烏黑，正坐在缺角長木凳上揉著太陽穴，順手將一包粗布紮緊的生草藥拍在滿是茶漬的木几上。\n\n" +
          "「天光喇，雨停咗班刀手就該出動。你新入堂口，咪成日企喺度似碌木。」何仔打了個哈欠，指了指桌上的草藥包：\n" +
          "「拎呢包草藥去巷口交畀容姐煲茶，順便去市集搵域卡度。市集欠咗三日規費，收唔齊返嚟，今晚成個閣嘅手足都要捱餓。」",
        options: [
          "1. [領命出發] 拿起桌上的生草藥包，戴上破斗笠動身前往容姐茶檔。",
          "2. [打探門路] 追問何仔：「如果市集有人耍賴唔交規費，我應該點應付？」",
          "3. [查驗地圖] 掃視堂內牆上的城西羊皮舊圖，確認容姐茶檔與市集的位置。",
        ],
        state: INITIAL_STATE,
      });
    }

    // 複製並推進狀態
    const updatedState: GameState = {
      ...state,
      turn: state.turn + 1,
      flags: { ...state.flags },
      inventory: [...state.inventory],
    };

    // 呼叫 LLM 處理邏輯
    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key not configured" }, { status: 500 });
    }

    const prompt = `
當前玩家狀態：
- 當前地點: ${updatedState.currentLocation}
- 主線階段: ${updatedState.questStep}
- 行囊 (${updatedState.inventory.length}/${updatedState.maxInventory}): [${updatedState.inventory.join(", ")}]
- 氣血: ${updatedState.playerHp}/${updatedState.maxHp}
- 內力: ${updatedState.playerMp}/${updatedState.maxMp}
- 個人銀兩: ${updatedState.silver} 文
- 門派流動金: ${updatedState.factionFunds} 文
- 何仔防線: ${updatedState.hozaiDefense}/100

玩家選擇的行動: "${action || "環顧四周"}"

請根據世界觀、當前階段與玩家行動，產生下一回合的劇情、3-4個選項及數值變更。嚴格遵守 JSON 格式輸出。
`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: SYSTEM_PROMPT }, { text: prompt }] },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(resultText);

    // 處理數值變更
    if (parsed.hpDelta) updatedState.playerHp = Math.max(0, Math.min(updatedState.maxHp, updatedState.playerHp + parsed.hpDelta));
    if (parsed.mpDelta) updatedState.playerMp = Math.max(0, Math.min(updatedState.maxMp, updatedState.playerMp + parsed.mpDelta));
    if (parsed.silverDelta) updatedState.silver = Math.max(0, updatedState.silver + parsed.silverDelta);
    if (parsed.factionFundsDelta) updatedState.factionFunds = Math.max(0, updatedState.factionFunds + parsed.factionFundsDelta);
    if (parsed.hozaiDefenseDelta) updatedState.hozaiDefense = Math.max(0, Math.min(100, updatedState.hozaiDefense + parsed.hozaiDefenseDelta));

    // 處理地點更新
    if (parsed.locationUpdate && parsed.locationUpdate.trim() !== "") {
      updatedState.currentLocation = parsed.locationUpdate.trim();
    }

    // 處理主線階段推進
    if (parsed.nextQuestStep) {
      updatedState.questStep = parsed.nextQuestStep;
    }

    // 處理物品消耗 (修正 item 型態以符合 TypeScript 嚴格檢查)
    const consumedItem = parsed.consumedItem;
    if (consumedItem && typeof consumedItem === "string" && consumedItem.trim() !== "" && Array.isArray(updatedState.inventory)) {
      const target = consumedItem.trim();
      const idx = updatedState.inventory.findIndex((item: string) =>
        item && item.trim() !== "" && (item.includes(target) || target.includes(item))
      );
      if (idx !== -1) {
        updatedState.inventory.splice(idx, 1);
      }
    }

    // 處理物品獲得 (遵守 4 格上限)
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
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    console.error("Turn processing error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
