import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getOpenAIClient() {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const apiKey = process.env.AZURE_OPENAI_API_KEY || 'build-phase-dummy-key';

  return new OpenAI({
    baseURL: endpoint,
    apiKey: apiKey,
    defaultHeaders: {
      'api-key': apiKey,
    },
  });
}

function getMarkdownContext(filename: string) {
  try {
    const filePath = path.join(process.cwd(), 'game-data', filename);
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.warn(`[Warning] 找不到設定檔: ${filename}`);
    return '';
  }
}

export async function POST(req: Request) {
  try {
    const client = getOpenAIClient();
    const { playerState, action, chatHistory } = await req.json();

    let updatedState = { ...playerState };
    const rawAction = (typeof action === 'string' ? action : '').trim();

    // -------------------------------------------------------------
    // 【特殊指令：除錯模式 (DEBUG MODE)】
    // -------------------------------------------------------------
    if (rawAction.includes('30624700')) {
      const isEntering = !updatedState.debug_mode;
      updatedState.debug_mode = isEntering;

      if (isEntering) {
        const debugReport = `[DEBUG MODE: ON — 劇情推演已凍結]

【後台全量結構化數值清單】
- 玩家稱號：${updatedState.identity}
- 氣血：${updatedState.qi_hp} /${updatedState.max_qi_hp} ｜ 內力：${updatedState.neili} /${updatedState.max_neili}
- 機變點數：${updatedState.wit_points} / 2 ｜ 戰鬥輪數：${updatedState.combat_rounds}
- 銅錢：${updatedState.copper} 文 ｜ 碎銀：${updatedState.silver} 兩
- 隨身裝備：${updatedState.weapon}
- 隨身行囊：${JSON.stringify(updatedState.inventory)}
- 何仔防線：${updatedState.ho_defense} / 100
- 轄下街區：${updatedState.controlled_streets} 條

再次輸入「30624700」即可關閉除錯並恢復遊戲。`;

        return NextResponse.json({
          success: true,
          updatedState: updatedState,
          text: debugReport,
          actions: ['A. [除錯] 關閉除錯模式並恢復遊戲 (輸入 30624700)'],
        });
      } else {
        return NextResponse.json({
          success: true,
          updatedState: updatedState,
          text: '[DEBUG MODE: OFF — 遊戲恢復運行]\n\n江湖風雲再起，請下達下一個行動指令。',
          actions: [
            'A. [前往城西街市] 探索周邊環境',
            'B. [打探風聲] 向在場NPC套料',
            'C. [檢視物資] 整理行囊與裝備',
            'D. [交畀同伴] 詢問同門意見',
            'E. [修煉武學] 靜心調息',
            'F. [其他] 自定義行動',
          ],
        });
      }
    }

    // -------------------------------------------------------------
    // 1. 創角數值與自定義物品初始化攔截 (強制進入安全探索期)
    // -------------------------------------------------------------
    let isInitialCreation = false;
    if (rawAction.includes('城西街童扒手')) {
      isInitialCreation = true;
      updatedState = { ...updatedState, identity: '城西街童扒手', qi_hp: 40, max_qi_hp: 40, neili: 5, max_neili: 10, copper: 25, weapon: '磨尖鐵生鏽短錐 (耐久 15)', inventory: ['磨尖鐵生鏽短錐 (耐久 15)', '', '', ''], in_respite: true, combat_rounds: 0 };
    } else if (rawAction.includes('濕鳩武館棄徒')) {
      isInitialCreation = true;
      updatedState = { ...updatedState, identity: '濕鳩武館棄徒', qi_hp: 55, max_qi_hp: 55, neili: 8, max_neili: 15, copper: 0, weapon: '裹布爛鐵條 (耐久 20)', inventory: ['裹布爛鐵條 (耐久 20)', '跌打草藥包', '', ''], in_respite: true, combat_rounds: 0 };
    } else if (rawAction.includes('爛賭收數佬')) {
      isInitialCreation = true;
      updatedState = { ...updatedState, identity: '爛賭收數佬', qi_hp: 45, max_qi_hp: 45, neili: 4, max_neili: 10, copper: 10, weapon: '生鏽碎肉剪刀 (耐久 10)', inventory: ['生鏽碎肉剪刀 (耐久 10)', '灌鉛假骰子', '', ''], in_respite: true, combat_rounds: 0 };
    } else if (rawAction.includes('黑市醫生助手')) {
      isInitialCreation = true;
      updatedState = { ...updatedState, identity: '黑市醫生助手', qi_hp: 42, max_qi_hp: 42, neili: 6, max_neili: 12, copper: 0, weapon: '生鏽放血薄刃 (耐久 12)', inventory: ['生鏽放血薄刃 (耐久 12)', '烈酒半竹筒', '', ''], in_respite: true, combat_rounds: 0 };
    } else if (rawAction.includes('自定義') || rawAction.includes('江湖人')) {
      isInitialCreation = true;
      const rawContent = rawAction.replace(/^[A-Z]\.\s*\[.*?\]\s*/, '').trim();
      const extractedTitle = rawContent.slice(0, 10).split(/[，,。\s]/)[0] || '市井散人';
      const customWeapon = rawContent.includes('刀') ? '生鏽斬骨刀' : rawContent.includes('棍') ? '防身木棍' : '隨身破爛物品';
      updatedState = { ...updatedState, identity: extractedTitle, qi_hp: 45, max_qi_hp: 45, neili: 5, max_neili: 10, copper: 10, weapon: customWeapon, inventory: [customWeapon, '', '', ''], in_respite: true, combat_rounds: 0 };
    }

    // -------------------------------------------------------------
    // 2. 玩家行動機變消耗
    // -------------------------------------------------------------
    if (rawAction.startsWith('F')) updatedState.wit_points = Math.max(0, (updatedState.wit_points ?? 2) - 1);
    if (rawAction.startsWith('B')) updatedState.wit_points = Math.min(2, (updatedState.wit_points ?? 0) + 1);

    // -------------------------------------------------------------
    // 3. 戰鬥與探索循環控制 (放寬探索期限制)
    // -------------------------------------------------------------
    if (!isInitialCreation) {
      if (!updatedState.in_respite) {
        // 戰鬥中：4 回合強制脫險
        updatedState.combat_rounds = (updatedState.combat_rounds ?? 0) + 1;
        if (updatedState.combat_rounds >= 4) {
          updatedState.in_respite = true;
          updatedState.combat_rounds = 0;
          updatedState.wit_points = Math.min(2, (updatedState.wit_points ?? 0) + 1);
        }
      } else {
        // 探索期：不再硬性 2 回合切入戰鬥，改由玩家行為或極端情況觸發
        updatedState.combat_rounds = (updatedState.combat_rounds ?? 0) + 1;
        const isAggressive = rawAction.includes('打') || rawAction.includes('搶') || rawAction.includes('殺') || rawAction.includes('激進');
        if (updatedState.combat_rounds >= 4 && isAggressive) {
          updatedState.in_respite = false;
          updatedState.combat_rounds = 0;
        }
      }
    }

    // -------------------------------------------------------------
    // 4. 動態讀取 4 個 MD 設定檔
    // -------------------------------------------------------------
    const worldLore = getMarkdownContext('01_world_lore.md');
    const characters = getMarkdownContext('02_characters.md');
    const storylines = getMarkdownContext('03_storyline_flags.md');
    const cityMap = getMarkdownContext('04_city_map.md');

    // -------------------------------------------------------------
    // 5. System Prompt (引入城西導覽機制)
    // -------------------------------------------------------------
    const systemPrompt = `你係硬派文字TRPG《明心閣》嘅掌故人（GM）。

【知識庫】
(世界觀)
${worldLore}
(人物群像)
${characters}
(主線進度)
${storylines}
(全城區域)
${cityMap}

【運作原則】
- 100% 香港市井粵語對白，旁白用純白話書面語，零廢話。
- Fail-Forward：玩家動作失敗必須以「局勢惡化、扣減氣血、耗損物資或同門代價」推動劇情。
- 狀態：${updatedState.in_respite ? '【安全探索期】' : `【戰鬥中·第 ${updatedState.combat_rounds} 回合】`}

【探索與導覽機制 (重要！)】
若處於【安全探索期】（特別是剛完成創角）：
1. 何仔必須先點評玩家出身，然後帶領玩家踏出明心閣，走入城西街頭。
2. 透過 NPC 對話與沿路白描，向玩家介紹城西地標（如容姐流動茶檔、通義當、地下拳館、爛尾樓），讓玩家了解青山城運作及各功能區（買賣、補血、接任等）。
3. 嚴禁立刻觸發大規模戰鬥。讓玩家先自由探索、打探情報或與 NPC 建立關係。後續再慢慢引導前往城東/南/北。

【強制輸出格式：JSON】
你必須嚴格以 JSON 格式回覆，絕對不能包含任何 Markdown backticks (\`\`\`)。格式如下：
{
  "narration": "正文白描（120-180字），嚴禁提及具體扣血或扣錢數字，亦嚴禁包含選項文字。",
  "environment": "暗記：(現場環境標註、地標功能提示或潛伏危險)",
  "state_changes": {
    "hp_change": <整數，受傷填負數，包紮/飲茶回血填正數，無變化填 0>,
    "ho_defense_change": <整數，何仔防線變化，無變化填 0>,
    "copper_change": <整數，花錢買茶/情報填負數，搜刮獲利填正數，無變化填 0>,
    "item_consumed": "<若消耗了草藥/烈酒等物品，填寫名稱，否則留空>"
  },
  "options": [
    "A. [探索地標] 前往通義當/茶檔/拳館...",
    "B. [打探風聲] 向NPC詢問江湖規矩...",
    "C. [市井互動] 買賣物品或結交勢力...",
    "D. [交畀同伴] 詢問何仔下一步行動...",
    "E. [跨區移動] 嘗試前往城東/城南(高風險)...",
    "F. [其他] 玩家自定義探索行動..."
  ]
}

【當前數值參考 (供 GM 結算用)】
- 玩家：${updatedState.identity} ｜ 氣血：${updatedState.qi_hp}/${updatedState.max_qi_hp} ｜ 銅錢：${updatedState.copper}文
- 何仔防線：${updatedState.ho_defense}/100 
- 行囊：${JSON.stringify(updatedState.inventory)}
- 玩家最新動作：${rawAction}`;

    const formattedHistory = (Array.isArray(chatHistory) ? chatHistory : []).slice(-3).map((item: any) => ({
      role: (item.role === 'gm' || item.role === 'assistant') ? 'assistant' : 'user',
      content: typeof item === 'string' ? item : item.content || JSON.stringify(item),
    }));

    const response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, ...formattedHistory] as any,
      temperature: 0.6,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const rawText = response.choices[0].message?.content || '{}';
    
    // -------------------------------------------------------------
    // 6. 處理 AI 的 JSON 輸出與數值結算
    // -------------------------------------------------------------
    let aiResponse;
    const FALLBACK_ACTIONS = updatedState.in_respite
      ? ['A. [探索地標] 喺城西四處巡視', 'B. [打探風聲] 搵街坊索取情報', 'C. [市井互動] 檢視攤檔物資', 'D. [交畀同伴] 問何仔青山城規矩', 'E. [跨區移動] 望向城東方向', 'F. [其他] 自定義行動']
      : ['A. [激進介入]', 'B. [息事寧人]', 'C. [市井下三濫]', 'D. [交畀同伴]', 'E. [修煉武學]', 'F. [其他]'];
    
    try {
      aiResponse = JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
      console.error("JSON 解析失敗", rawText);
      aiResponse = {
        narration: "（江湖大霧，局勢一片混沌，請再試一次。）",
        environment: "",
        state_changes: { hp_change: 0, ho_defense_change: 0, copper_change: 0, item_consumed: "" },
        options: FALLBACK_ACTIONS
      };
    }

    const hpChange = aiResponse.state_changes?.hp_change || 0;
    const defenseChange = aiResponse.state_changes?.ho_defense_change || 0;
    const copperChange = aiResponse.state_changes?.copper_change || 0;
    const consumedItem = aiResponse.state_changes?.item_consumed || "";

    updatedState.qi_hp = Math.min(updatedState.max_qi_hp, Math.max(0, (updatedState.qi_hp || 0) + hpChange));
    updatedState.ho_defense = Math.max(0, Math.min(100, (updatedState.ho_defense || 60) + defenseChange));
    updatedState.copper = Math.max(0, (updatedState.copper || 0) + copperChange);

    if (consumedItem && consumedItem.trim() !== "" && Array.isArray(updatedState.inventory)) {
      const target = consumedItem.trim();
      const idx = updatedState.inventory.findIndex(item => 
        item && item.trim() !== "" && (item.includes(target) || target.includes(item))
      );
      if (idx !== -1) {
        updatedState.inventory[idx] = ''; 
      }
    }

    const finalText = aiResponse.environment ? `${aiResponse.narration}\n\n${aiResponse.environment}` : aiResponse.narration;
    const finalActions = Array.isArray(aiResponse.options) && aiResponse.options.length >= 6 
      ? aiResponse.options.slice(0, 6) 
      : FALLBACK_ACTIONS;

    return NextResponse.json({
      success: true,
      updatedState: updatedState,
      text: finalText,
      actions: finalActions,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: `[${error.status || 500}] ${error.message}` }, { status: 500 });
  }
}
