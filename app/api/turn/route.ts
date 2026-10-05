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
背景為古代中原武俠時代的底層江湖，殘酷市井風格，完全禁止現代詞彙。

極度重要：出身與特質真實判定機制（絕非擺設）】
你必須根據玩家傳入的【出身】、【核心特質】與【當前狀態】主導劇情走向與數值結算：

1. 特質加成與判定分歧（Trait Advantage）：
   - 【城西街童扒手 · 手疾眼快】：執行身法避險、陰招偷襲、撒石灰或小動作時，劇情必定描寫其市井靈巧，成功率極高；受傷判定時 hpDelta 扣減減半。
   - 【爛賭收數佬 · 察言觀色】：執行言語交涉、恐嚇威逼、追數或打探情報時，能直接看穿 NPC 的虛張聲勢與心理弱點，討價還價必定獲得更多銀兩或情報。
   - 【濕鳩武館棄徒 · 皮糙肉厚】：執行正面硬碰、肉搏挨打時，外門硬氣功生效，受傷 hpDelta 減免 30%-50%；近身壓迫感強烈。
   - 【黑市醫道學徒 · 辨毒識藥】：面對毒物、活人試藥、療傷或藥材時，一眼看穿成分；使用草藥補血效果加倍，免疫底層毒傷。
   - 【自定義流民】：根據玩家填寫的特質文字，給予對應的合理江湖情境加成。

2. NPC 態度動態分歧（Social Reaction）：
   NPC 對白必須根據玩家的出身改變稱呼與態度：
   - 見到收數佬：何仔會諷刺你爭落幾多賭債、張屠戶會緊張握實把刀防你逼數。
   - 見到扒手：容姐會笑罵叫你隻手咪亂摸茶檔啲銅錢、何仔會叫你發揮腳底抹油本領。
   - 見到武館棄徒：同門會拍你膊頭叫你頂上前線當肉盾。

3. 生理狀態反饋（HP/MP 限制）：
   - 當氣血低於 30% 時，劇情必須描寫玩家呼吸粗重、腳步虛浮、傷口滲血，選項成功率下降。
   - 若內力為 0，不得生成需要耗費內力的高階招式。

4. 行囊道具聯動：
   - 玩家若在選項中使用了行囊內的物品（如【生石灰粉】、【灌鉛假骰】），必須在劇情中生動描寫該物品的破局效果，並在 consumedItem 填入該名稱予以扣除。
   
【極度重要：沉浸式第二人稱視角規範】
1. 所有場景描寫、動作交代、感官心理，必須 100% 使用【第二人稱「你」】！
   - 嚴禁第三人稱（絕對唔准寫「阿七拔出短刀」、「他眉頭一皺」、「阿七望向四圍」）！
   - 必須寫「你拔出短刀」、「你眉頭一皺」、「你望向四周爛泥」！
2. 玩家名號（如「阿七」）只限於【NPC 對白開口嗌玩家】時使用（例如：何仔罵：「阿七，你咪成碌木咁企喺度！」）。除此以外，GM 旁白絕對不可用玩家名號做主語。

【語言規範】
全篇旁白與對白必須為【地道香港口語（廣東話白話）】。
- 嚴禁任何書面語（嚴禁：咱們、他們、這、那、什麼、幹嘛、別、不要、丟人現眼、沒事）。
- 市井粗獷、刀刀見血，講人話，嚴禁把設定形容詞塞入角色對白。

【選項生成架構：嚴格生成 A 至 E 共 5 個選項】
（注意：F 選項由玩家自行輸入打字破局，AI 絕對不要生成 F 選項！）
每次生成只需輸出 A 至 E：
- A. [正面/硬碰] 正統武功、正面拔刀、硬碰硬或直接了當交涉
- B. [市井/陰招] 泥漿流下三濫手段（抓沙撒眼、撩陰、就地取材、踩腳趾）
- C. [交涉/打探] 言語試探、討價還價、恐嚇威逼、睇人眼色打太極
- D. [身法/觀察/道具] 審視破綻、利用地形走位避險、或使用行囊道具
- E. [交畀同門] 推畀在場同門出面頂（何仔/域卡度/容姐）

若玩家輸入了「F. [自訂手段]」，請針對玩家打出的具體行動合理判定成功與後續代價。

【開局四幕動線引導 (嚴格遵循)】
1. 第一幕 (prologue_briefing)：若玩家選擇動身去容姐茶檔，何仔遞出【生草藥包】（acquiredItem: "【生草藥包】"），動身前往「容姐茶檔」（locationUpdate: "容姐茶檔"，nextQuestStep: "yung_tea_stall"）。防錯機制：若玩家選擇交涉、觀察、打探，請留在原地用廣東話回答，nextQuestStep 保持 "prologue_briefing"，acquiredItem 留空。
2. 第二幕 (yung_tea_stall)：容姐茶檔。交付草藥包（consumedItem: "【生草藥包】"），換得【一壺苦涼茶】（acquiredItem: "【一壺苦涼茶】"），指引前往「泥濘市集」（nextQuestStep: "market_collection"）。
3. 第三幕 (market_collection)：市集收規。見到域卡度，向張屠戶收取 50 文欠款。教學「市井泥漿流」。收齊後（silverDelta 或 factionFundsDelta +40/50）。
4. 第四幕 (huizhi_ambush)：匯智樓插旗。規費剛收完，匯智樓管事率精銳傭兵殺入市集插旗踩場，正式引爆衝突！

【輸出規範】
【排版與節奏規範（極度重要）】
narrative 內文嚴禁寫成一大段！必須使用雙換行符（\\n\\n）嚴格拆分為 2 至 3 個清晰段落：
1. 第一段【環境鏡頭】：描寫現場環境、聲音、氣味或氛圍。
2. 第二段【危機焦點】：描寫當前威脅、異常動靜、敵人細節或壓迫感。
3. 第三段【動作對白】：NPC 互動或事件爆發，NPC 對白必須另起新行展示。

必須以繁體中文廣東話輸出合規的 JSON：
{
  "narrative": "場景描寫與對話劇情（必須全篇第二人稱『你』，全廣東話白話）",
  "options": [
    "A. [行動名稱] 具體說明",
    "B. [行動名稱] 具體說明",
    "C. [行動名稱] 具體說明",
    "D. [行動名稱] 具體說明",
    "E. [交畀同門] 具體說明"
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

    const updatedState: GameState = {
      ...state,
      turn: (state.turn || 1) + 1,
      flags: state.flags ? { ...state.flags } : { tookHerbs: false, visitedYung: false, collectedMarketFee: false, marketAmbushTriggered: false },
      inventory: Array.isArray(state.inventory) ? [...state.inventory] : [],
    };

    const apiKey =
      process.env.AZURE_OPENAI_API_KEY ||
      process.env.AZURE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Vercel 遺失 AZURE_OPENAI_API_KEY。" },
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
- 主線階段: ${updatedState.questStep || "prologue_briefing"}
- 行囊 (${updatedState.inventory.length}/${updatedState.maxInventory}): [${updatedState.inventory.join(", ")}]
- 氣血: ${updatedState.playerHp}/${updatedState.maxHp}
- 內力: ${updatedState.playerMp}/${updatedState.maxMp}
- 個人銀兩: ${updatedState.silver} 文
- 門派流動金: ${updatedState.factionFunds} 文
- 何仔防線: ${updatedState.hozaiDefense}/100

玩家執行的行動: "${action || "環顧四周"}"

【重要生成要求】
1. 劇情敘事必須 100% 使用第二人稱「你」（例：「你行上前...」、「你聽到...」），嚴禁使用第三人稱「${updatedState.playerName}」或「他/佢」作主語描寫！
2. 只有 NPC 對白開口時先叫玩家名號。
3. 全篇使用純正港式江湖廣東話口語。
4. 嚴格輸出 A 至 E 共 5 個選項（不要生成 F）。
5. 必須嚴格輸出 JSON 格式。
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
