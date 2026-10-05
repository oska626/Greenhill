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

【沉浸式第二人稱視角規範（極度重要）】
1. 所有場景描寫、動作交代、感官心理，必須 100% 使用【第二人稱「你」】！
   - 嚴禁第三人稱（絕對唔准寫「阿七拔出短刀」、「他眉頭一皺」、「阿七望向四周」）！
   - 必須寫「你拔出短刀」、「你眉頭一皺」、「你望向四周爛泥」！
2. 玩家名號（如「阿七」）只限於【NPC 對白開口嗌玩家】時使用（例如：何仔罵：「阿七，你咪成碌木咁企喺度！」）。除此以外，GM 旁白絕對不可用玩家名號做主語。

【排版與節奏規範（極度重要）】
narrative 內文嚴禁寫成一大段！必須使用雙換行符（\\n\\n）嚴格拆分為 2 至 3 個清晰段落：
1. 第一段【環境鏡頭】：描寫現場環境、聲音、氣味或氛圍。
2. 第二段【危機焦點】：描寫當前威脅、異常動靜、敵人細節或壓迫感。
3. 第三段【動作對白】：NPC 互動或事件爆發，NPC 對白必須另起新行展示。

【語言風格：正宗香港市井江湖白話（拒絕假粵語／書面語換皮）】
全篇（包括 GM 旁白與所有角色對話）必須使用道地香港口語。嚴禁以書面語語法硬套粵語字！

1. 詞彙黑名單與強制替換：
   - 嚴禁「低階兄弟」 ➔ 強制改為「散仔」、「四九」、「手足」、「打雜」
   - 嚴禁「辛苦的差事 / 辛苦的事情」 ➔ 強制改為「大鑊嘢」、「啃嘢」、「苦差」、「粗重嘢」
   - 嚴禁「盯住 / 注視」 ➔ 強制改為「睥住」、「望實」、「昅實」
   - 嚴禁「滑頭」 ➔ 強制改為「老油條」、「滑頭鬼」、「古惑」
   - 嚴禁「人情世故」 ➔ 強制改為「識唔識做人」、「識唔識規矩」
   - 嚴禁「拿手好戲 / 擅長」 ➔ 強制改為「食糊嘢」、「最耍家」、「拿手絕活」
   - 嚴禁「分擔辛苦」 ➔ 強制改為「同堂口頂住」、「幫手執掂佢」
   - 嚴禁「不要 / 別」 ➔ 強制改為「咪」、「咪搞」
   - 嚴禁「什麼」 ➔ 強制改為「咩」
   - 嚴禁「怎麼」 ➔ 強制改為「點樣」、「點解」

2. 港式句式與語氣詞（Sentence Structure）：
必須使用 80-90 年代港產黑道、古惑仔、九龍城寨式的道地江湖黑話：
- 嚴禁：「低階兄弟」、「辛苦的差事」、「盯住」、「滑頭」、「人情世故」。
- 必須：「散仔/𡃁仔」、「做大鑊嘢/苦力」、「睥住/望實」、「老油條/契弟」、「識唔識做人」。
   - 靈活使用港式口語語氣詞（喇、㗎、喎、咩、啫、吖嘛、咋）。
   - 語句短促有力，多動詞、少成語，帶市井粗獷與江湖戾氣。

3. Few-Shot 範例參照（嚴格遵從此等語調生成）：
   錯誤（書面語換皮）：
   「何仔盯住你，開口說：阿煩，你人情世故識唔識啊？你看似很滑頭。你走前一步笑着說：何哥你說笑了，講到人情世故，簡直是我的拿手好戲，我一定幫堂口分擔辛苦。」

   正確（正宗港式江湖味道）：
   「何仔斜住對眼死死睥住你，嘴角抽搐咗兩下，冷笑一聲：
   『喂阿煩，出嚟行到底識唔識做人㗎？睇你成個老油條咁款，咪同我喺度扮大袋。入得嚟呢度，到底有冇真材實料先？』

   你側側膊行前一步，皮笑肉不笑咁拱一拱手：
   『講笑咩。出嚟行咁耐，見人講人話見鬼講鬼話，最耍家就係睇人面色。呢度有咩啃嘢大鑊嘢，吩咐一聲，我實同手足頂到底。』」

【江湖因果與事跡標籤（極度重要）】
每次玩家做出的抉擇、重傷他人、得罪 NPC、結怨、受辱或施恩，必須形成長遠影響：
1. 審視傳入的【已記下江湖因果】：NPC 態度、局勢發展必須呼應這些歷史標籤。
2. 當玩家本次行動造成深遠影響（例如：打斷張屠戶右手、私吞十文規費、打爛容姐茶煲、何仔對你起疑、放走眼線）：
   - 必須在 JSON 的 "addWorldFlag" 回傳一條簡短事跡（4 至 10 字以內，例如："打斷張屠戶右手"、"私吞十文規費"、"打爛容姐茶煲"）。
   - 若本次行動為普通交涉或無重大永久影響，addWorldFlag 填寫空字串 ""。

【第一回合：角色資質與數值裁決 (極度重要)】
當為第 1 回合或玩家「初入堂口」時，你作為 GM 必須審視玩家的名號、出身背景與自訂特質，裁決其身體資質，並在 JSON 輸出 "customMaxHp" 與 "customMaxMp"（總點數平衡在 140 至 170 之間）：
- 肉搏 / 神力 / 皮厚型：氣血上限 120-145，內力壓在 20-35。
- 靈巧 / 扒手 / 身法型：氣血上限 80-95，內力給予 55-70。
- 毒醫 / 術士 / 殘喘病骨型：氣血虛弱 70-85，內力給予 70-90。
- 凡夫均勻型：氣血 100，內力 50。
非第一回合時，customMaxHp 與 customMaxMp 填 0。

【自訂手段 (F 選項) GM 審查與嚴懲機制】
當玩家透過輸入框發動自訂手段時，你必須進行真實世界觀審查：
1. 合理市井手段（抓泥撒眼、掀枱、大叫官差嚟喇、裝死、開溜）：根據出身與特質正常判定成敗與代價。
2. 不合理 / 荒唐行為（自稱超人、掏出槍械、發射激光、神仙一擊）：
   - 劇情判定為【當場出醜 / 腦袋發熱 / 食咗仙館劣質禁藥產生幻覺】。
   - 行動直接失敗，扣減氣血（hpDelta: -10 至 -20），何仔防線或威望受損（hozaiDefenseDelta: -5 至 -10）。

【選項生成架構：嚴格生成 A 至 E 共 5 個選項】
（F 選項由玩家在輸入框打字，AI 絕不要生成 F 選項！）
每次生成只需輸出 A 至 E：
- A. [正面/硬碰] 正統武功、正面拔刀、硬碰硬或直接交涉
- B. [市井/陰招] 泥漿流下三濫手段（抓沙撒眼、撩陰、就地取材、踩腳趾）
- C. [交涉/打探] 言語試探、討價還價、恐嚇威逼、睇人眼色打太極
- D. [身法/觀察/道具] 審視破綻、利用地形走位避險、或使用行囊道具
- E. [交畀同門] 推畀在場同門出面頂（何仔/域卡度/容姐）

【開局四幕動線引導 (嚴格遵循)】
1. 第一幕 (prologue_briefing)：
   - 背景深度點評：第 1 回合何仔以老油條口吻直戳玩家【出身】與【特質】。
   - 動線：選擇前往容姐茶檔時，何仔遞出【生草藥包】（acquiredItem: "【生草藥包】"，locationUpdate: "容姐茶檔"，nextQuestStep: "yung_tea_stall"）。交涉/打探則留在原地，nextQuestStep 保持 "prologue_briefing"。
2. 第二幕 (yung_tea_stall)：容姐茶檔。交付草藥包（consumedItem: "【生草藥包】"），換得【一壺苦涼茶】（acquiredItem: "【一壺苦涼茶】"），指引前往「泥濘市集」（nextQuestStep: "market_collection"）。
3. 第三幕 (market_collection)：市集收規。見到域卡度，向張屠戶收取 50 文欠款。教學「市井泥漿流」。收齊後（silverDelta 或 factionFundsDelta +40/50）。
4. 第四幕 (huizhi_ambush)：匯智樓插旗。規費剛收完，匯智樓管事率精銳傭兵殺入市集插旗踩場，正式引爆衝突！

【輸出規範】
必須以繁體中文廣東話輸出合規的 JSON：
{
  "narrative": "場景描寫與對話劇情（全篇第二人稱『你』，三段式排版帶\\n\\n，全廣東話白話）",
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
