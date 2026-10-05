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
  worldFlags: string[];
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
背景為古代中原底層江湖，冷酷殘酷市井風格，完全禁止現代詞彙（如槍械、摩天樓、科技）。

==============================
一、文風與排版規範（冷硬短句）
==============================
1. 文風：使用繁體中文標準書面語。風格仿冷硬古龍武俠，多用短句、動詞與名詞白描，句式凌厲短促，留白營造壓迫感，嚴禁冗長抒情與繁複修飾。
2. 視角：100% 使用【第二人稱「你」】。嚴禁使用第三人稱代詞或玩家名號做旁白主語（玩家名號僅限 NPC 開口對話時使用）。
3. 排版與篇幅：
   - 全篇 narrative 總字數嚴格控制在【80 至 120 字以內】，嚴格以【兩段為限】（中間以 \\n\\n 分隔）。
   - 第一段：承接你的動作與 NPC 即時反應（原地交涉嚴禁描寫桌椅、樑柱、燈籠等環境；僅切換新地標首回合可用半句交代氣候）。
   - 第二段：局勢最新變化與 NPC 話語（NPC 對話獨立起行）。

==============================
二、TRPG 機制裁決與因果
==============================
1. 第一回合資質裁決：
   - 第 1 回合依據玩家名號、出身與特質，在 JSON 輸出 customMaxHp 與 customMaxMp（總點數平衡在 140-170）：
     * 肉搏/神力/皮厚型：氣血 120-145，內力 20-35。
     * 靈巧/身法/扒手型：氣血 80-95，內力 55-70。
     * 毒醫/術士/病骨型：氣血 70-85，內力 70-90。
     * 凡夫均勻型：氣血 100，內力 50。
   - 非第 1 回合一律填 0。
2. 自訂手段 (F) 邏輯審查與懲罰：
   - 合理市井手段（撒沙、掀桌、逃跑、裝死）：正常依據特質判定成敗。
   - 荒唐/超現實行為（自稱超人、掏出火器、發射激光、神仙一擊）：
     * 判定為【當場出醜 / 腦中發熱 / 服用劣質黑市丹藥產生妄想】。
     * 行動必定失敗，強制扣減氣血（hpDelta: -10 至 -20），何仔防線受損（hozaiDefenseDelta: -5 至 -10）。
3. 江湖因果 (worldFlags)：
   - 產生重大永久影響時（重傷他人、得罪 NPC、私吞公款），在 addWorldFlag 回傳 4-10 字簡短標籤（例如 "打斷張屠戶右手"、"私吞十文規費"）。無重大影響則留空 ""。
   - 審查傳入的【已記下江湖因果】，令 NPC 態度與局勢產生實質反應。
4. 任務道具唯一性：
   - 任務道具（如【生草藥包】、【一壺苦涼茶】）不可重複發放。若玩家已有，何仔不可再給，acquiredItem 留空 ""。

==============================
三、時空鎖與主線狀態機 (questStep)
==============================
1. 地點時空鎖定：
   - 何仔只在「明心閣總壇」；容姐只在「容姐茶檔」；域卡度與張屠戶只在「泥濘市集」。
   - 嚴禁當前地點與 NPC 脫節。只有玩家選擇「動身前往 [地點]」時方可更新 locationUpdate。
2. 線性推進與轉場判定：
   - "prologue_briefing"（總壇領命）：玩家選擇動身去茶檔時，強制回傳 locationUpdate: "容姐茶檔", acquiredItem: "【生草藥包】", nextQuestStep: "yung_tea_stall"。原地交涉則停留本階段。
   - "yung_tea_stall"（茶檔交藥）：交付藥包換茶後，玩家選擇動身去市集時，強制回傳 locationUpdate: "泥濘市集", consumedItem: "【生草藥包】", acquiredItem: "【一壺苦涼茶】", nextQuestStep: "market_collection"。
   - "market_collection"（市集收規）：向張屠戶討回 50 文規費（或動手打服）後，強制回傳 silverDelta: 50, nextQuestStep: "huizhi_ambush"。在此之前【匯智樓刀手絕對不可現身】。
   - "huizhi_ambush"（伏擊戰）：匯智樓刀手突襲殺入。戰鬥結算後，強制回傳 nextQuestStep: "sandbox"。
   - "sandbox"（自由市井）：引導至城西各據點（聚財坊、黑市武館、怡紅院、回總壇），依據防線與因果自由發展。

==============================
四、選項生成與 JSON 規範
==============================
1. 眼見為實：選項必須基於眼前實況。敵人未實體拔刀現身包圍前，嚴禁生成任何戰鬥迎擊選項。
2. 每次嚴格生成 A 至 E 共 5 個選項（嚴禁由 AI 生成 F 選項）：
   - A. [正面/硬碰] 正統武功、正面拔刀、直接交涉
   - B. [市井/陰招] 泥漿流下三濫手段（撒沙、撩陰、踩腳、就地取材）
   - C. [交涉/打探] 言語試探、討價還價、恐嚇威逼、觀察破綻
   - D. [身法/觀察/道具] 尋找破綻、走位避險、或使用隨身道具
   - E. [交由同門] 推給在場同門出面頂上（何仔/容姐/域卡度）

必須以繁體中文輸出合規的 JSON：
{
  "narrative": "場景描寫與對話（第二人稱『你』，冷硬短句，嚴格兩段以\\n\\n分隔，80-120字）",
  "options": [
    "A. [行動名稱] 具體說明",
    "B. [行動名稱] 具體說明",
    "C. [行動名稱] 具體說明",
    "D. [行動名稱] 具體說明",
    "E. [交由同門] 具體說明"
  ],
  "customMaxHp": 0,
  "customMaxMp": 0,
  "addWorldFlag": "產生的重大因果標籤（若無則為空字串）",
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

==============================
五、經濟與銀兩規範（嚴禁暗中收支）
==============================
1. 資金劃分：
   - 個人銀兩 (silver)：玩家私有財物。用於買藥、飲茶、行賄、聚財坊賭博、黑市消費。
   - 門派流動金 (factionFunds)：明心閣堂口公款。用於總壇修繕、防線加固、兄弟月餉。
2. 嚴禁幽靈變更：
   - 凡有 silverDelta 或 factionFundsDelta 變動，【必須在 narrative 明文交代】！
   - 嚴禁不寫文字卻暗中扣減/增加銀兩。
   - 第一幕何仔交代任務時，若未明確給予盤纏，兩者 Delta 必須為 0！
3. 收規歸屬：
   - 第三幕向張屠戶收回 50 文規費，正常應繳納堂口（factionFundsDelta: 50）。
   - 只有玩家明確選擇「私吞/中飽私囊」時，方可轉為個人銀兩（silverDelta: 50），並必須回傳 addWorldFlag: "私吞堂口規費"。
`;

export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: "前端傳送的資料格式錯誤" }, { status: 400 });
    }

    const { action, state }: { action?: string; state?: GameState } = body;

    if (!state) {
      return NextResponse.json({ error: "遺失遊戲狀態 (State is required)" }, { status: 400 });
    }

    const isPrologue = action?.includes("[初入堂口]");

    const updatedState: GameState = {
      ...state,
      turn: isPrologue ? (state.turn || 1) : (state.turn || 1) + 1,
      flags: state.flags ? { ...state.flags } : { tookHerbs: false, visitedYung: false, collectedMarketFee: false, marketAmbushTriggered: false },
      inventory: Array.isArray(state.inventory) ? [...state.inventory] : [],
      worldFlags: Array.isArray(state.worldFlags) ? [...state.worldFlags] : [],
    };

    const apiKey =
      process.env.AZURE_OPENAI_API_KEY ||
      process.env.AZURE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Vercel 遺失 AZURE_OPENAI_API_KEY。請確認環境變數已設置。" },
        { status: 500 }
      );
    }

    const rawEndpoint = (
      process.env.AZURE_OPENAI_ENDPOINT ||
      process.env.AZURE_ENDPOINT ||
      ""
    ).trim();

    const deployment = (
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME ||
      process.env.AZURE_OPENAI_DEPLOYMENT ||
      process.env.AZURE_DEPLOYMENT_NAME ||
      "gpt-4o"
    ).trim();

    if (!rawEndpoint) {
      return NextResponse.json(
        { error: "Vercel 缺少 AZURE_OPENAI_ENDPOINT。" },
        { status: 500 }
      );
    }

    let azureUrl = rawEndpoint;
    if (azureUrl.includes("/openai/v1/responses")) {
      azureUrl = azureUrl.replace("/openai/v1/responses", "/openai/v1/chat/completions");
    } else if (azureUrl.includes("/responses")) {
      azureUrl = azureUrl.replace("/responses", "/chat/completions");
    } else if (azureUrl.endsWith("/openai/v1")) {
      azureUrl = `${azureUrl}/chat/completions`;
    } else if (!azureUrl.includes("/chat/completions")) {
      const base = azureUrl.replace(/\/$/, "");
      if (base.includes("services.ai.azure.com")) {
        azureUrl = `${base}/openai/v1/chat/completions`;
      } else {
        const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
        azureUrl = `${base}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
      }
    }

    const prompt = `
當前玩家狀態：
- 玩家名號: ${updatedState.playerName || "無名氏"} (${updatedState.background || "流民"})
- 核心特質: ${updatedState.trait || "草莽之軀"}
- 當前地點: ${updatedState.currentLocation || "明心閣總壇"}
- 當前回合: ${updatedState.turn}
- 主線階段: ${updatedState.questStep || "prologue_briefing"}
- 行囊 (${updatedState.inventory.length}/${updatedState.maxInventory}): [${updatedState.inventory.join(", ")}]
- 氣血: ${updatedState.playerHp}/${updatedState.maxHp}
- 內力: ${updatedState.playerMp}/${updatedState.maxMp}
- 個人銀兩: ${updatedState.silver} 文
- 門派流動金: ${updatedState.factionFunds} 文
- 何仔防線: ${updatedState.hozaiDefense}/100
- 已記下江湖因果: [${updatedState.worldFlags.join("、 ") || "暫無重大恩怨"}]

玩家執行的行動: "${action || "環顧四周"}"

【重要生成要求】
1. 劇情敘事必須 100% 使用第二人稱「你」，嚴禁使用第三人稱！
2. 風格使用繁體中文冷硬短句書面語，總長度嚴格在 80-120 字以內，兩段為限（\\n\\n）。
3. 若為第 1 回合，依據出身背景與特質裁決 customMaxHp 與 customMaxMp。
4. 審視傳入的「江湖因果」，保持局勢連貫反饋。
5. 嚴格輸出 A 至 E 共 5 個選項（不要生成 F）。
6. 必須嚴格輸出合規 JSON。
`;

    const response = await fetch(azureUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: deployment,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Azure OpenAI 錯誤:", errorText);
      return NextResponse.json(
        {
          error: `Azure OpenAI 調用失敗 (HTTP ${response.status})。\n請求網址: ${azureUrl}\n詳細回報: ${errorText}`
        },
        { status: 500 }
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      return NextResponse.json({ error: "無法解析 Azure OpenAI 回傳內容" }, { status: 500 });
    }

    let resultText = data.choices?.[0]?.message?.content;
    if (!resultText) {
      return NextResponse.json({ error: "AI 未能產生內容，請重試行動" }, { status: 500 });
    }

    resultText = resultText.replace(/```json\n?/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(resultText);
    } catch (parseError) {
      console.error("JSON 解析失敗:", resultText);
      return NextResponse.json({ error: "AI 輸出格式異常，請重試行動" }, { status: 500 });
    }

    // 第一回合動態裁決氣血與內力上限
    if (parsed.customMaxHp && typeof parsed.customMaxHp === "number" && parsed.customMaxHp > 0) {
      updatedState.maxHp = parsed.customMaxHp;
      updatedState.playerHp = parsed.customMaxHp;
    }
    if (parsed.customMaxMp && typeof parsed.customMaxMp === "number" && parsed.customMaxMp > 0) {
      updatedState.maxMp = parsed.customMaxMp;
      updatedState.playerMp = parsed.customMaxMp;
    }

    // 累積江湖因果標籤
    if (parsed.addWorldFlag && typeof parsed.addWorldFlag === "string" && parsed.addWorldFlag.trim() !== "") {
      const flag = parsed.addWorldFlag.trim();
      if (!updatedState.worldFlags.includes(flag)) {
        updatedState.worldFlags.push(flag);
      }
    }

    // 結算常規數值增減
    if (parsed.hpDelta) updatedState.playerHp = Math.max(0, Math.min(updatedState.maxHp, updatedState.playerHp + parsed.hpDelta));
    if (parsed.mpDelta) updatedState.playerMp = Math.max(0, Math.min(updatedState.maxMp, updatedState.playerMp + parsed.mpDelta));
    // 安全結算個人銀兩（防止字串拼接或 NaN）
    if (parsed.silverDelta !== undefined && parsed.silverDelta !== null) {
      const sDelta = Number(parsed.silverDelta);
      if (!isNaN(sDelta)) {
        updatedState.silver = Math.max(0, updatedState.silver + sDelta);
      }
    }
    // 安全結算門派流動金（防止字串拼接或 NaN）
    if (parsed.factionFundsDelta !== undefined && parsed.factionFundsDelta !== null) {
      const fDelta = Number(parsed.factionFundsDelta);
      if (!isNaN(fDelta)) {
        updatedState.factionFunds = Math.max(0, updatedState.factionFunds + fDelta);
      }
    }
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

    // 防重複發放任務道具
    const acquiredItem = parsed.acquiredItem;
    if (acquiredItem && typeof acquiredItem === "string" && acquiredItem.trim() !== "") {
      const itemTrimmed = acquiredItem.trim();
      const alreadyHas = updatedState.inventory.some(
        (invItem) => invItem.includes(itemTrimmed) || itemTrimmed.includes(invItem)
      );

      if (!alreadyHas && updatedState.inventory.length < updatedState.maxInventory) {
        updatedState.inventory.push(itemTrimmed);
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
