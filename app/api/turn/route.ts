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
你係文字冒險遊戲《青山城》的遊戲主持人 (GM)。古代底層江湖背景，冷酷殘酷市井風格，完全禁止現代詞彙。

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

==============================
三、經濟與銀兩規範（嚴禁暗中收支）
==============================
1. 資金劃分：
   - 個人銀兩 (silver)：玩家私有財物。
   - 門派流動金 (factionFunds)：明心閣堂口公款。
2. 嚴禁幽靈變更：
   - 凡有 silverDelta 或 factionFundsDelta 變動，【必須在 narrative 明文交代】！
   - 嚴禁不寫文字卻暗中扣減/增加銀兩。未經交代兩者 Delta 必須為 0。

==============================
四、選項生成與 JSON 規範
==============================
1. 眼見為實：選項必須基於眼前實況。敵人未實體拔刀現身包圍前，嚴禁生成任何戰鬥迎擊選項。
2. 城西邊界鎖定（嚴禁離開）：
   - 活動範圍鎖死在城西（明心閣總壇、容姐茶檔、泥濘市集、聚財坊、黑市武館、仙館、怡紅院）。
   - 匯智樓、官府僅為勢力背景，選項 (A-E) 絕對禁止出現前往外城、離開青山城或攻打外部總壇。
   - 若自訂手段 (F) 企圖強行出城，一律判定為被哨卡或外圍精銳刀手截殺逼退。
3. 每次嚴格生成 A 至 E 共 5 個選項（嚴禁由 AI 生成 F 選項）：
   - A. [正面/硬碰] 正統武功、正面拔刀、直接交涉
   - B. [市井/陰招] 泥漿流下三濫手段（撒沙、撩陰、踩腳、就地取材）
   - C. [交涉/打探] 言語試探、討價還價、恐嚇威逼、觀察破綻
   - D. [身法/觀察/道具] 尋找破綻、走位避險、或使用隨身道具
   - E. [應變/同門]：
  * 只有同伴【實體在場陪同】時（如市集有域卡度在旁），才可生成 [交由同門]。
  * 若身邊冇同伴同行（如茶檔只有你同容姐、或總壇面對何仔），【絕對嚴禁召喚不在場角色】！E 必須轉為 [妥協/隱忍/藉故離開/虛與委蛇]。

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
  "hpDelta": 0,
  "mpDelta": 0,
  "silverDelta": 0,
  "factionFundsDelta": 0,
  "hozaiDefenseDelta": 0
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
    const actionText = action || "環顧四周";

    const updatedState: GameState = {
      ...state,
      turn: isPrologue ? (state.turn || 1) : (state.turn || 1) + 1,
      flags: state.flags ? { ...state.flags } : { tookHerbs: false, visitedYung: false, collectedMarketFee: false, marketAmbushTriggered: false },
      inventory: Array.isArray(state.inventory) ? [...state.inventory] : [],
      worldFlags: Array.isArray(state.worldFlags) ? [...state.worldFlags] : [],
    };

    // ========================================================
    // 狀態機：前 4 幕選項由代碼鎖死，AI 僅負責劇情潤色
    // ========================================================
    let contextGuidance = "";
    let fixedOptions: string[] | null = null;

    // 1. 第一幕：總壇領命
    if (updatedState.questStep === "prologue_briefing") {
      updatedState.currentLocation = "明心閣總壇";

      const isLeaving = actionText.includes("容姐茶檔") || actionText.includes("動身") || actionText.includes("啟程") || actionText.startsWith("A.");
      if (!isPrologue && isLeaving) {
        updatedState.currentLocation = "容姐茶檔";
        updatedState.questStep = "yung_tea_stall";
        if (!updatedState.inventory.includes("【生草藥包】") && updatedState.inventory.length < updatedState.maxInventory) {
          updatedState.inventory.push("【生草藥包】");
        }
        contextGuidance = "玩家抵達容姐茶檔。容姐正用油布抹桌。";
        fixedOptions = [
          "A. [交付藥包] 將生草藥包遞給容姐，換取苦涼茶。",
          "B. [試探口風] 向容姐打聽最近城西有何風吹草動。",
          "C. [查看四周] 觀察茶檔周遭是否有可疑眼線。",
          "D. [歇息喝茶] 討碗粗茶潤喉，稍作調息。",
          "E. [轉身離去] 不多廢話，辦完事即刻動身前往泥濘市集。"
        ];
      } else {
        contextGuidance = `開局第 1 回合。何仔上下打量剛入堂口的你，必須根據你的出身背景「${updatedState.background}」與特質「${updatedState.trait}」，開口譏諷敲打一句，隨即把生草藥包推到案前命令送去容姐茶檔。`;
        fixedOptions = [
          "A. [領命啟程] 接過生草藥包，立即動身前往容姐茶檔。",
          "B. [反唇相譏] 嘲諷何仔的眼光與用人之道。",
          "C. [追問底細] 詢問這包生草藥到底有何名堂。",
          "D. [暗中查看] 趁接過藥包時，掂量其分量與暗記。",
          "E. [虛與委蛇] 躬身稱是，暗中打量總壇四周退路。"
        ];
      }
    }
    // 2. 第二幕：容姐茶檔
    else if (updatedState.questStep === "yung_tea_stall") {
      updatedState.currentLocation = "容姐茶檔";

      const isLeavingToMarket = actionText.includes("泥濘市集") || actionText.includes("市集") || actionText.startsWith("E.") || (actionText.startsWith("A.") && updatedState.inventory.includes("【一壺苦涼茶】"));
      if (isLeavingToMarket) {
        updatedState.currentLocation = "泥濘市集";
        updatedState.questStep = "market_collection";
        contextGuidance = "玩家來到泥濘市集肉檔前。同門域卡度已在等候，張屠戶按著剁骨刀拖欠 50 文規費。";
        fixedOptions = [
          "A. [正面逼索] 亮出明心閣腰牌，要張屠戶立刻交出 50 文規費。",
          "B. [泥漿陰招] 抓起肉攤碎骨或爛泥，冷不防朝張屠戶面門招呼。",
          "C. [言語恐嚇] 搬出何仔手段，威嚇張屠戶後果自負。",
          "D. [審視攤檔] 尋找肉檔錢匣位置，伺機強取。",
          "E. [交由域卡度] 退後一步，示意域卡度拔刀動手。"
        ];
      } else {
        // 交付藥包，換取苦茶
        const herbIdx = updatedState.inventory.indexOf("【生草藥包】");
        if (herbIdx !== -1) updatedState.inventory.splice(herbIdx, 1);
        if (!updatedState.inventory.includes("【一壺苦涼茶】") && updatedState.inventory.length < updatedState.maxInventory) {
          updatedState.inventory.push("【一壺苦涼茶】");
        }
        contextGuidance = "容姐收下藥包，遞出一壺苦涼茶，低聲警告最近匯智樓的人在市集盯得很緊。";
        fixedOptions = [
          "A. [動身啟程] 提起苦涼茶，動身前往泥濘市集與域卡度會合。",
          "B. [追問匯智樓] 問清匯智樓到底派了多少刀手在市集。",
          "C. [仰頭飲茶] 喝下一口苦涼茶，平復內息。",
          "D. [冷眼旁觀] 站在茶棚角落，審視街面動靜。",
          "E. [告辭隱忍] 拱手不語，默默收起涼茶準備出發。"
        ];
      }
    }
    // 3. 第三幕：市集收規
    else if (updatedState.questStep === "market_collection") {
      updatedState.currentLocation = "泥濘市集";

      const feeHandled = actionText.includes("收") || actionText.includes("打") || actionText.includes("規費") || actionText.includes("逼") || actionText.startsWith("A.") || actionText.startsWith("B.") || actionText.startsWith("E.");
      if (feeHandled && !updatedState.flags.collectedMarketFee) {
        updatedState.flags.collectedMarketFee = true;
        updatedState.factionFunds += 50;
        updatedState.questStep = "huizhi_ambush";
        contextGuidance = "50 文規費剛落袋，巷尾驟然傳來拔刀聲。數名匯智樓刀手堵死市集兩頭！";
        fixedOptions = [
          "A. [正面迎敵] 拔出隨身短刀，迎向領頭的匯智樓刀手。",
          "B. [市井爛招] 踢翻旁邊菜筐肉案阻擋刀手，就地抓爛泥撒眼。",
          "C. [呼應同門] 與域卡度背靠背結陣，死守市集狹道。",
          "D. [棄陣突圍] 借屋簷與窄巷地形，施展身法強行破圍。",
          "E. [交由域卡度] 讓域卡度在前頂住刀陣，自己伺機背後突襲。"
        ];
      } else {
        contextGuidance = "泥濘市集張屠戶肉檔前。張屠戶態度蠻橫，域卡度按刀待發。";
        fixedOptions = [
          "A. [強行拔刀] 砍在肉案上，限張屠戶三息內交出 50 文。",
          "B. [市井陰招] 撩陰腿偷襲張屠戶下盤。",
          "C. [談判分肥] 假意寬限兩日，暗中試探張屠戶有何底牌。",
          "D. [搜尋破綻] 觀察張屠戶握刀架勢與周遭逃生路線。",
          "E. [交由域卡度] 讓域卡度上前動粗索款。"
        ];
      }
    }
    // 4. 第四幕：匯智樓伏擊
    else if (updatedState.questStep === "huizhi_ambush") {
      updatedState.currentLocation = "泥濘市集";
      contextGuidance = "市集血戰。短兵相接，刀光混著泥水。此回合戰鬥結束後進入自由江湖。";
      updatedState.questStep = "sandbox"; // 戰鬥結算後直接進入 Sandbox
      fixedOptions = null; // 伏擊戰打完，正式將選項權限交還 AI
    }
    // 5. 第五幕：開放江湖沙盒
    else {
      const LANDMARKS = ["明心閣總壇", "容姐茶檔", "泥濘市集", "聚財坊", "黑市武館", "仙館", "怡紅院"];
      for (const loc of LANDMARKS) {
        if (actionText.includes(loc)) {
          updatedState.currentLocation = loc;
          break;
        }
      }
      contextGuidance = `城西自由沙盒。玩家身處「${updatedState.currentLocation}」。何仔防線: ${updatedState.hozaiDefense}/100。請生成該地標事件與 A-E 抉擇。`;
      fixedOptions = null; // 沙盒由 AI 動態生成
    }


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
- 當前地點: ${updatedState.currentLocation}
- 當前回合: ${updatedState.turn}
- 主線階段: ${updatedState.questStep}
- 行囊 (${updatedState.inventory.length}/${updatedState.maxInventory}): [${updatedState.inventory.join(", ")}]
- 氣血: ${updatedState.playerHp}/${updatedState.maxHp}
- 內力: ${updatedState.playerMp}/${updatedState.maxMp}
- 個人銀兩: ${updatedState.silver} 文
- 門派流動金: ${updatedState.factionFunds} 文
- 何仔防線: ${updatedState.hozaiDefense}/100
- 已記下江湖因果: [${updatedState.worldFlags.join("、 ") || "暫無重大恩怨"}]
- 場景指引: ${contextGuidance}

玩家執行的行動: "${actionText}"

【重要生成要求】
1. 劇情敘事必須 100% 使用第二人稱「你」，嚴禁使用第三人稱代詞！
2. 風格嚴格使用繁體中文冷硬短句書面語，總長度嚴格在 80-120 字以內，兩段為限（\\n\\n）。
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
        temperature: 0.6,
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
    if (isPrologue) {
      if (parsed.customMaxHp && typeof parsed.customMaxHp === "number" && parsed.customMaxHp > 0) {
        updatedState.maxHp = parsed.customMaxHp;
        updatedState.playerHp = parsed.customMaxHp;
      }
      if (parsed.customMaxMp && typeof parsed.customMaxMp === "number" && parsed.customMaxMp > 0) {
        updatedState.maxMp = parsed.customMaxMp;
        updatedState.playerMp = parsed.customMaxMp;
      }
    }

    // 累積江湖因果標籤
    if (parsed.addWorldFlag && typeof parsed.addWorldFlag === "string" && parsed.addWorldFlag.trim() !== "") {
      const flag = parsed.addWorldFlag.trim();
      if (!updatedState.worldFlags.includes(flag)) {
        updatedState.worldFlags.push(flag);
      }
    }

    // 結算常規數值增減
    if (parsed.hpDelta && !isNaN(Number(parsed.hpDelta))) {
      updatedState.playerHp = Math.max(0, Math.min(updatedState.maxHp, updatedState.playerHp + Number(parsed.hpDelta)));
    }
    if (parsed.mpDelta && !isNaN(Number(parsed.mpDelta))) {
      updatedState.playerMp = Math.max(0, Math.min(updatedState.maxMp, updatedState.playerMp + Number(parsed.mpDelta)));
    }
    if (parsed.silverDelta !== undefined && parsed.silverDelta !== null) {
      const sDelta = Number(parsed.silverDelta);
      if (!isNaN(sDelta)) {
        updatedState.silver = Math.max(0, updatedState.silver + sDelta);
      }
    }
    if (parsed.factionFundsDelta !== undefined && parsed.factionFundsDelta !== null) {
      const fDelta = Number(parsed.factionFundsDelta);
      if (!isNaN(fDelta)) {
        updatedState.factionFunds = Math.max(0, updatedState.factionFunds + fDelta);
      }
    }
    if (parsed.hozaiDefenseDelta && !isNaN(Number(parsed.hozaiDefenseDelta))) {
      updatedState.hozaiDefense = Math.max(0, Math.min(100, updatedState.hozaiDefense + Number(parsed.hozaiDefenseDelta)));
    }

    return NextResponse.json({
      narrative: parsed.narrative,
      options: fixedOptions || parsed.options, // 前 4 幕強制使用代碼固定選項，徹底杜絕 AI 幻覺
      state: updatedState,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "發生未知的伺服器錯誤";
    console.error("Turn processing error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
