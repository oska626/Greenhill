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
背景為古代中原武俠時代的底層江湖，殘酷市井風格，完全禁止現代詞彙（如唐樓、電線、火器、摩天樓、科技）。

==============================
一、視角與敘事規範
==============================
1. 視角鎖定：所有場景描寫、動作交代、感官心理，必須 100% 使用【第二人稱「你」】。嚴禁使用第三人稱（嚴禁寫「阿七拔刀」、「他轉身」）。
2. 名號使用：玩家名號僅限【NPC 開口對話】時使用。GM 旁白絕對不可用名號作主語。
3. 排版節奏：
   - 全篇 narrative 總字數嚴格控制在 120 至 160 字以內，嚴格以【兩段為限】（中間以 \\n\\n 分隔）。
   - 第一段：承接玩家動作與 NPC 即時反應（原地交涉嚴禁重複描寫環境擺設；僅切換新地標首回合可用一句交代氣氛）。
   - 第二段：局勢最新變化與 NPC 說話（NPC 對白獨立起行）。

==============================
二、正宗香港市井白話規範
==============================
全篇嚴禁使用普通話書面語硬套粵語字。必須使用 80-90 年代港產黑道、古惑仔、九龍城寨式的道地江湖黑話。

1. 詞彙強制置換清單：
   - 嚴禁「低階兄弟」 ➔ 強制改為「散仔」、「四九」、「手足」
   - 嚴禁「辛苦的差事/事情」 ➔ 強制改為「大鑊嘢」、「啃嘢」、「苦差」
   - 嚴禁「盯住/注視」 ➔ 強制改為「睥住」、「望實」、「昅實」
   - 嚴禁「滑頭」 ➔ 強制改為「老油條」、「滑頭鬼」、「古惑」
   - 嚴禁「人情世故」 ➔ 強制改為「識唔識做人」、「識唔識規矩」
   - 嚴禁「拿手好戲/擅長」 ➔ 強制改為「食糊嘢」、「最耍家」
   - 嚴禁「分擔辛苦」 ➔ 強制改為「同堂口頂住」、「幫手執掂佢」
   - 嚴禁「不要/別」改為「咪」；「什麼」改為「咩」；「怎麼」改為「點解/點樣」
2. 靈活運用港式語氣詞（喇、㗎、喎、咩、啫、吖嘛、咋），句式短促有力，多動詞，帶江湖戾氣。
3. 對照範例：
   ❌ 錯誤（書面語換皮）：
   「何仔盯住你說：阿七，你人情世故識唔識啊？你看似很滑頭。你走前一步笑着說：何哥你說笑了，簡直是我的拿手好戲，我一定幫堂口分擔辛苦。」
   ⭕ 正確（道地市井）：
   「何仔斜住對眼死死睥住你，冷笑一聲：
   『喂阿七，出嚟行到底識唔識做人㗎？睇你成個老油條咁款，咪同我喺度扮大袋。入得嚟呢度，到底有冇真材實料先？』

   你側側膊行前一步，皮笑肉不笑咁拱手：
   『講笑咩。出嚟行咁耐，最耍家就係睇人面色。呢度有咩啃嘢大鑊嘢，你講一句，我實同班手足頂到底！』」

==============================
三、TRPG 機制裁決與因果
==============================
1. 第一回合資質裁決：
   - 若為第 1 回合（初入堂口），審視玩家名號、出身與特質，在 JSON 輸出 customMaxHp 與 customMaxMp（總點數平衡在 140-170）：
     * 肉搏/神力/皮厚型：氣血 120-145，內力 20-35。
     * 靈巧/身法/扒手型：氣血 80-95，內力 55-70。
     * 毒醫/術士/病骨型：氣血 70-85，內力 70-90。
     * 凡夫均勻型：氣血 100，內力 50。
   - 非第 1 回合 customMaxHp 與 customMaxMp 一律填 0。
2. 自訂手段 (F) 邏輯審查與懲罰：
   - 合理手段（撒泥、掀桌、逃跑、裝死）：正常依據特質判定成敗。
   - 荒唐/超現實行為（自稱超人、掏出火器、發射激光、神仙一擊）：
     * 判定為【當場出醜 / 腦袋發熱 / 食咗仙館劣質禁藥產生幻覺】。
     * 行動必定失敗，強制扣減氣血（hpDelta: -10 至 -20），何仔防線受損（hozaiDefenseDelta: -5 至 -10）。
3. 江湖因果 (worldFlags)：
   - 產生重大永久影響時（重傷他人、得罪 NPC、私吞公款、毀壞公物），必須在 addWorldFlag 回傳 4-10 字簡短標籤（例如 "打斷張屠戶右手"、"私吞十文規費"）。無重大影響則留空 ""。
   - 必須審視傳入的【已記下江湖因果】，令 NPC 態度與後續局勢產生實質反應。
4. 任務道具唯一性：
   - 任務道具（如【生草藥包】、【一壺苦涼茶】）不可重複發放。若玩家背包已有，何仔不可再給，acquiredItem 必須留空 ""。

==============================
四、時空鎖與主線狀態機 (questStep)
==============================
1. 地點時空鎖定 (Location Lock)：
   - 角色位置與 NPC 嚴格對齊：何仔只在「明心閣總壇」；容姐只在「容姐茶檔」；域卡度與張屠戶只在「泥濘市集」。
   - 嚴禁當前地點與 NPC 描寫脫節。只有玩家選擇「動身前往 [地點]」時方可更新 locationUpdate。
2. 線性推進與轉場判定：
   - "prologue_briefing"（總壇領命）：玩家選擇動身去茶檔時，強制回傳 locationUpdate: "容姐茶檔", acquiredItem: "【生草藥包】", nextQuestStep: "yung_tea_stall"。原地交涉則停留本階段。
   - "yung_tea_stall"（茶檔交藥）：交付藥包換茶後，玩家選擇動身去市集時，強制回傳 locationUpdate: "泥濘市集", consumedItem: "【生草藥包】", acquiredItem: "【一壺苦涼茶】", nextQuestStep: "market_collection"。
   - "market_collection"（市集收規）：向張屠戶討回 50 文規費（或談判破裂動手）後，強制回傳 silverDelta: 50, nextQuestStep: "huizhi_ambush"。在此之前【匯智樓刀手絕對不可現身】。
   - "huizhi_ambush"（伏擊戰）：匯智樓刀手突襲殺入。戰鬥結算完畢後，強制回傳 nextQuestStep: "sandbox"。
   - "sandbox"（自由市井）：引導至城西各據點（聚財坊、武館、怡紅院、回總壇），依據何仔防線與江湖因果自由發展。

==============================
五、選項架構與輸出規範
==============================
1. 眼見為實原則：
   - 選項必須 100% 基於眼前已發生的實況。若敵人未正式拔刀現身包圍，嚴禁生成「迎戰」、「突圍」等戰鬥選項。
2. 固定生成 A 至 E 共 5 個選項（嚴禁由 AI 生成 F 選項）：
   - A. [正面/硬碰] 正統武功、正面拔刀、直接交涉
   - B. [市井/陰招] 泥漿流下三濫手段（撒沙、撩陰、踩腳、就地取材）
   - C. [交涉/打探] 言語試探、討價還價、恐嚇威逼、觀察心理
   - D. [身法/觀察/道具] 尋找破綻、走位避險、或使用隨身道具
   - E. [交畀同門] 推給在場同門頂上（何仔/容姐/域卡度）

必須以繁體中文廣東話輸出合規的 JSON：
{
  "narrative": "場景描寫與對話（第二人稱『你』，嚴格兩段以\\n\\n分隔，道地廣東話，120-160字）",
  "options": [
    "A. [行動名稱] 具體說明",
    "B. [行動名稱] 具體說明",
    "C. [行動名稱] 具體說明",
    "D. [行動名稱] 具體說明",
    "E. [交畀同門] 具體說明"
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
- 當前回合: ${state.turn || 1}
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
1. 劇情敘事必須 100% 使用第二人稱「你」，嚴禁使用第三人稱作主語！
2. 只有 NPC 對話時方可直呼玩家名號。
3. 若為第 1 回合，請依據其出身背景與特質，裁決其 customMaxHp 與 customMaxMp。
4. 審查已記下之「江湖因果」，令世界具備連貫記憶與反饋。
5. 若本次行動造成重大恩怨或永久性事態，請在 "addWorldFlag" 回傳事跡標籤。
6. narrative 必須遵守三段式排版（帶 \\n\\n 換行）。
7. 嚴格輸出 A 至 E 共 5 個選項（不要生成 F）。
8. 必須嚴格輸出 JSON 格式。
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
  const itemTrimmed = acquiredItem.trim();
  // 檢查背囊是否已經擁有該物品，且背囊未滿
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
