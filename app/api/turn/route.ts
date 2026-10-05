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
1. 文風：繁體中文標準書面語。風格仿冷硬古龍武俠，多用動詞與名詞白描，句式短促，嚴禁繁複環境修飾與抒情。
2. 視角：100% 使用【第二人稱「你」】。嚴禁使用第三人稱（嚴禁寫「阿七拔刀」）。名號僅限 NPC 開口對話時使用。
3. 排版與篇幅：
   - 全篇 narrative 總字數嚴格控制在【80 至 120 字以內】，嚴格以【兩段為限】（中間以 \\n\\n 分隔）。
   - 第一段：承接你的動作與 NPC 即時反應（原地交涉嚴禁描寫桌椅、樑柱等環境；僅切換新地標首回合可用半句交代氣候）。
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
   - 荒唐行為（超人、槍械、神仙一擊）：判定為丹藥幻覺或當場出醜，強制扣減氣血（hpDelta: -10 至 -20）。
3. 江湖因果 (worldFlags)：
   - 產生重大影響時在 addWorldFlag 回傳 4-10 字簡短標籤（例如 "打斷張屠戶右手"、"私吞十文規費"）。無重大影響則留空 ""。
4. 城西邊界鎖定：
   - 活動範圍嚴格鎖死在城西（明心閣總壇、容姐茶檔、泥濘市集、聚財坊、黑市武館、仙館、怡紅院）。禁止生成前往外城或外部總壇的選項。

必須以繁體中文輸出合規 JSON：
{
  "narrative": "80-120字冷硬短句，兩段（\\n\\n分隔）",
  "options": ["A. ...", "B. ...", "C. ...", "D. ...", "E. ..."],
  "customMaxHp": 0,
  "customMaxMp": 0,
  "addWorldFlag": "",
  "hpDelta": 0,
  "mpDelta": 0,
  "hozaiDefenseDelta": 0
}
`;

export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
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
    // 確定性主線狀態機（前 4 幕代碼鎖死選項與因果鏈）
    // ========================================================
    let contextGuidance = "";
    let fixedOptions: string[] | null = null;

    // 1. 第一幕：總壇領命（救手足、送藥換藥）
    if (updatedState.questStep === "prologue_briefing") {
      updatedState.currentLocation = "明心閣總壇";

      const isLeaving = actionText.includes("容姐茶檔") || actionText.includes("動身") || actionText.includes("啟程") || actionText.startsWith("A.");
      if (!isPrologue && isLeaving) {
        updatedState.currentLocation = "容姐茶檔";
        updatedState.questStep = "yung_tea_stall";
        if (!updatedState.inventory.includes("【生草藥包】") && updatedState.inventory.length < updatedState.maxInventory) {
          updatedState.inventory.push("【生草藥包】");
        }
        contextGuidance = "玩家攜帶生草藥包剛抵達容姐茶檔。容姐正在擦桌。需將生草藥交給容姐配成金創散。";
        fixedOptions = [
          "A. [交付藥包] 將生草藥包遞給容姐，請她配製金創散送去市集救人。",
          "B. [打探口風] 詢問容姐，匯智樓最近在城西究竟有何異動。",
          "C. [查看四周] 審視茶檔對街，看是否有可疑眼線徘徊。",
          "D. [閉目調息] 坐在竹凳上閉目養神，按刀待發。",
          "E. [無聲催促] 叩響木桌，催促容姐盡快取藥，人命關天。"
        ];
      } else {
        contextGuidance = `開局第 1 回合。何仔打量剛入堂口的你，依據出身背景「${updatedState.background}」與特質「${updatedState.trait}」冷聲嘲弄一句。隨後推出生草藥包交代因果：「域卡度昨夜在泥濘市集被匯智樓的人陰了一刀，如今正帶傷在肉檔逼數。拿這包生草藥去容姐茶檔換金創散，送去市集救他，順便把張屠戶欠的五十文規費帶回來。」`;
        fixedOptions = [
          "A. [領命啟程] 接過生草藥包，立即動身前往容姐茶檔換藥。",
          "B. [冷言反譏] 譏諷堂口收五十文規費竟然要傷號頂在前頭。",
          "C. [追問底細] 詢問匯智樓近來因何事頻頻越界生事。",
          "D. [掂量藥包] 查驗藥包分量與成色，默不作聲。",
          "E. [躬身虛應] 領下差事，暗自打量堂內守備與退路。"
        ];
      }
    }
    // 2. 第二幕：容姐茶檔（取得金創散，獲得伏擊預警）
    else if (updatedState.questStep === "yung_tea_stall") {
      updatedState.currentLocation = "容姐茶檔";

      const isLeavingToMarket = actionText.includes("泥濘市集") || actionText.includes("市集") || actionText.includes("啟程") || actionText.startsWith("A.");
      if (isLeavingToMarket) {
        updatedState.currentLocation = "泥濘市集";
        updatedState.questStep = "market_collection";
        contextGuidance = "玩家懷揣金創散趕到泥濘市集肉檔前。同門域卡度左肋滲血正靠著木柱喘息，肉檔張屠戶按著剁骨刀冷笑拖延，頻頻瞥向巷口。";
        fixedOptions = [
          "A. [先救同門] 將金創散拋給域卡度裹傷，自己拔刀直面張屠戶。",
          "B. [按刀逼索] 跨步上前短刀直抵肉案，限張屠戶三息交出五十文規費。",
          "C. [市井陰招] 腳尖勾起地上的爛泥碎骨，作勢直撩張屠戶雙目。",
          "D. [提防巷口] 察覺張屠戶神色有詐，暗自回頭盯防巷尾動靜。",
          "E. [交由域卡度] 示意域卡度上前施壓，自己在側翼掠陣戒備。"
        ];
      } else {
        // 消耗草藥，換取金創散
        const herbIdx = updatedState.inventory.indexOf("【生草藥包】");
        if (herbIdx !== -1) updatedState.inventory.splice(herbIdx, 1);
        if (!updatedState.inventory.includes("【金創散】") && updatedState.inventory.length < updatedState.maxInventory) {
          updatedState.inventory.push("【金創散】");
        }
        contextGuidance = "容姐迅速將草藥研磨成一包金創散遞給你，低聲警示：「域卡度傷在肋下，硬撐不了多久。還有，今晨有兩個匯智樓刀手在茶檔對街晃悠，肉檔怕是有套，小心點。」";
        fixedOptions = [
          "A. [收藥啟程] 收起金創散，快步趕往泥濘市集與域卡度會合。",
          "B. [追問刀手] 問清對街那兩名匯智樓刀手的兵刃與去向。",
          "C. [討碗烈茶] 仰頭灌下一碗苦茶，借藥力定住心神。",
          "D. [審視街面] 站在茶檔屋簷陰影下，掃視通往市集的石板街。",
          "E. [抱拳別過] 點頭示意明白，不再廢話立即動身。"
        ];
      }
    }
    // 3. 第三幕：市集收規（中圈套，屠戶吹呼哨）
    else if (updatedState.questStep === "market_collection") {
      updatedState.currentLocation = "泥濘市集";

      const feeCollected = actionText.includes("收") || actionText.includes("打") || actionText.includes("逼") || actionText.includes("救") || actionText.startsWith("A.") || actionText.startsWith("B.");
      if (feeCollected && !updatedState.flags.collectedMarketFee) {
        updatedState.flags.collectedMarketFee = true;
        updatedState.factionFunds += 50; // 代碼確定性加公款
        // 若身上有金創散，視為已給域卡度使用
        const drugIdx = updatedState.inventory.indexOf("【金創散】");
        if (drugIdx !== -1) updatedState.inventory.splice(drugIdx, 1);

        updatedState.questStep = "huizhi_ambush";
        contextGuidance = "張屠戶被迫摸出五十文銅錢扔在案上，隨即獰笑著撮唇吹響一聲尖銳呼哨！巷尾刀光暴起，三名持鐵葉短刀的匯智樓灰衣刀手堵死市集兩頭！";
        fixedOptions = [
          "A. [正面迎敵] 短刀出鞘，護住負傷的域卡度，硬接撲來的刀光。",
          "B. [掀翻肉案] 飛起一腳掀翻油膩肉案，將滿案碎骨爛肉砸向刀手。",
          "C. [背水結陣] 與域卡度背靠背緊貼，沉刀死守狹窄巷道。",
          "D. [借勢突圍] 踩上屠攤木柱借力翻上屋簷，伺機脫出重圍。",
          "E. [交由域卡度] 讓域卡度借傷誘敵，自己矮身從側翼抹向刀手下盤。"
        ];
      } else {
        contextGuidance = "泥濘市集肉檔前。域卡度按著傷口喘息，張屠戶握著剔骨刀冷笑拖延，五十文規費遲遲不肯拿出來。";
        fixedOptions = [
          "A. [短刀逼喉] 刀尖前遞三寸逼向張屠戶面門，喝令立刻交錢。",
          "B. [撒沙襲面] 抓起肉案旁的碎骨石灰，作勢朝張屠戶面上招呼。",
          "C. [言語喝破] 當場喝破他頻頻望向街角是在等匯智樓援兵。",
          "D. [審視退路] 觀察肉檔四周退路與域卡度的傷勢深淺。",
          "E. [示意同門] 示意域卡度上前亮堂口腰牌，施加最後通牒。"
        ];
      }
    }
    // 4. 第四幕：匯智樓伏擊戰
    else if (updatedState.questStep === "huizhi_ambush") {
      updatedState.currentLocation = "泥濘市集";
      contextGuidance = "市集血戰。匯智樓刀手步步緊逼，短兵相接。此回合戰鬥突圍後，主線教學結束，正式進入自由沙盒。";
      updatedState.questStep = "sandbox"; // 戰鬥結算後切換至沙盒
      fixedOptions = null; // 交還給 AI 生成沙盒動態選項
    }
    // 5. 第五幕：開放江湖沙盒（7 大地標動態路由）
    else {
      const LANDMARKS = ["明心閣總壇", "容姐茶檔", "泥濘市集", "聚財坊", "黑市武館", "仙館", "怡紅院"];
      for (const loc of LANDMARKS) {
        if (actionText.includes(loc)) {
          updatedState.currentLocation = loc;
          break;
        }
      }
      contextGuidance = `城西自由沙盒。玩家身處「${updatedState.currentLocation}」。何仔防線: ${updatedState.hozaiDefense}/100。請生成該地標專屬事件與 A-E 抉擇。`;
      fixedOptions = null;
    }

    // ==========================================
    // 調用 Azure OpenAI
    // ==========================================
    const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_API_KEY;
    const rawEndpoint = (process.env.AZURE_OPENAI_ENDPOINT || process.env.AZURE_ENDPOINT || "").trim();
    const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o").trim();

    if (!apiKey || !rawEndpoint) {
      return NextResponse.json({ error: "Azure API 配置無效" }, { status: 500 });
    }

    let azureUrl = rawEndpoint;
    if (azureUrl.includes("/openai/v1/responses")) {
      azureUrl = azureUrl.replace("/openai/v1/responses", "/openai/v1/chat/completions");
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
當前狀態：
- 名號: ${updatedState.playerName || "無名氏"} (${updatedState.background || "流民"}) | 特質: ${updatedState.trait || "草莽之軀"}
- 地點: ${updatedState.currentLocation} | 階段: ${updatedState.questStep}
- 氣血: ${updatedState.playerHp}/${updatedState.maxHp} | 內力: ${updatedState.playerMp}/${updatedState.maxMp}
- 個人銀兩: ${updatedState.silver} 文 | 門派金: ${updatedState.factionFunds} 文 | 何仔防線: ${updatedState.hozaiDefense}/100
- 已記江湖因果: [${updatedState.worldFlags.join("、 ") || "無"}]
- 場景指引: ${contextGuidance}

玩家行動: "${actionText}"
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
      return NextResponse.json({ error: `Azure 請求失敗: ${errorText}` }, { status: 500 });
    }

    const data = await response.json();
    let resultText = data.choices?.[0]?.message?.content?.trim() || "";
    resultText = resultText.replace(/```json\n?/g, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(resultText);

    // 第一回合動態資質裁決
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

    // 戰鬥損耗與數值安全結算
    if (parsed.hpDelta && !isNaN(Number(parsed.hpDelta))) {
      updatedState.playerHp = Math.max(0, Math.min(updatedState.maxHp, updatedState.playerHp + Number(parsed.hpDelta)));
    }
    if (parsed.mpDelta && !isNaN(Number(parsed.mpDelta))) {
      updatedState.playerMp = Math.max(0, Math.min(updatedState.maxMp, updatedState.playerMp + Number(parsed.mpDelta)));
    }
    if (parsed.hozaiDefenseDelta && !isNaN(Number(parsed.hozaiDefenseDelta))) {
      updatedState.hozaiDefense = Math.max(0, Math.min(100, updatedState.hozaiDefense + Number(parsed.hozaiDefenseDelta)));
    }

    // 江湖因果標籤去重寫入
    if (parsed.addWorldFlag && typeof parsed.addWorldFlag === "string" && parsed.addWorldFlag.trim() !== "") {
      const flag = parsed.addWorldFlag.trim();
      if (!updatedState.worldFlags.includes(flag)) {
        updatedState.worldFlags.push(flag);
      }
    }

    return NextResponse.json({
      narrative: parsed.narrative,
      options: fixedOptions || parsed.options, // 前 4 幕代碼鎖死選項，沙盒交還 AI
      state: updatedState,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "伺服器內部錯誤";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
