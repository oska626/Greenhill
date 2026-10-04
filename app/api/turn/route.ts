import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 強制為動態路由，防止 Vercel 於 build 階段做靜態預渲染
export const dynamic = 'force-dynamic';

function getOpenAIClient() {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const apiKey = process.env.AZURE_OPENAI_API_KEY || 'build-phase-dummy-key';

  return new OpenAI({
    baseURL: endpoint || 'https://dummy.openai.azure.com',
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
    // 【特殊指令 1：30624700 雙向除錯開關 (DEBUG MODE)】
    // -------------------------------------------------------------
    if (rawAction.includes('30624700')) {
      const isEntering = !updatedState.debug_mode;
      updatedState.debug_mode = isEntering;

      if (isEntering) {
        const debugReport = `[DEBUG MODE: ON — 劇情推演已凍結]

【後台全量結構化數值清單】
- 玩家稱號：${updatedState.identity}
- 氣血：${updatedState.qi_hp} / ${updatedState.max_qi_hp} ｜ 內力：${updatedState.neili} / ${updatedState.max_neili}
- 機變點數：${updatedState.wit_points} / 2 ｜ 戰鬥輪數：${updatedState.combat_rounds}
- 隨身裝備：${updatedState.weapon}
- 隨身行囊：${JSON.stringify(updatedState.inventory)}
- 何仔防線：${updatedState.ho_defense} / 100
- 轄下街區：${updatedState.controlled_streets} 條
- 門派流動金：${updatedState.gang_funds} 文
- 西涼猜忌度：${updatedState.xiliang_suspicion} / 100
- 僧臣罪證度：${updatedState.monk_evidence} / 100
- 安全喘息期：${updatedState.in_respite ? '是' : '否'}

除錯模式已開啟。你可以純技術角度向 GM 查詢機制、或直接下令微調後台數值。再次輸入「30624700」即可關閉除錯並恢復遊戲。`;

        return NextResponse.json({
          success: true,
          newState: updatedState,
          updatedState: updatedState,
          playerState: updatedState,
          text: debugReport,
          aiText: debugReport,
          narration: debugReport,
          actions: ['A. [除錯] 關閉除錯模式並恢復遊戲 (輸入 30624700)'],
        });
      } else {
        return NextResponse.json({
          success: true,
          newState: updatedState,
          updatedState: updatedState,
          playerState: updatedState,
          text: '[DEBUG MODE: OFF — 遊戲恢復運行]\n\n江湖風雲再起，請下達下一個行動指令。',
          aiText: '[DEBUG MODE: OFF — 遊戲恢復運行]\n\n江湖風雲再起，請下達下一個行動指令。',
          narration: '[DEBUG MODE: OFF — 遊戲恢復運行]\n\n江湖風雲再起，請下達下一個行動指令。',
          actions: [
            'A. [激進介入] 把握當前機會搶攻',
            'B. [息事寧人] 暫避鋒芒退讓一步',
            'C. [市井下三濫] 尋找下三濫破局陰招',
            'D. [交畀同伴] 示意在場同門出手',
            'E. [修煉武學] 體悟招式調整氣息',
            'F. [其他] 自定義後續行動',
          ],
        });
      }
    }

    // -------------------------------------------------------------
    // 【特殊指令 2：地圖呼叫指令 (MAP COMMAND)】
    // -------------------------------------------------------------
    if (rawAction.toLowerCase() === '地圖' || rawAction.toLowerCase() === 'map') {
      if (!updatedState.in_respite && updatedState.combat_rounds > 0) {
        updatedState.qi_hp = Math.max(0, updatedState.qi_hp - 5);
        const mapRejection = `何仔一巴星埋嚟，怒吼：「開緊片仲睇地圖？把刀劈到喉嚨喇，睇路呀！」\n\n你分心睇地圖，被對方刀鋒擦過手臂，氣血扣減 5 點！`;
        return NextResponse.json({
          success: true,
          newState: updatedState,
          updatedState: updatedState,
          playerState: updatedState,
          text: mapRejection,
          aiText: mapRejection,
          narration: mapRejection,
          actions: [
            'A. [激進介入] 忍痛揮拳正面硬碰',
            'B. [息事寧人] 縮入八仙桌下避開鋒芒',
            'C. [市井下三濫] 踢翻旁邊熱水壺潑佢隻腳',
            'D. [交畀同伴] 大嗌何仔幫手頂住',
            'E. [修煉武學] 狼狽滾地體悟步法',
            'F. [其他] 嘗試自定義掙脫',
          ],
        });
      }
    }

    // -------------------------------------------------------------
    // 1. 機變與數值核心邏輯
    // -------------------------------------------------------------
    if (rawAction.startsWith('F')) {
      updatedState.wit_points = Math.max(0, (updatedState.wit_points ?? 2) - 1);
    }
    if (rawAction.startsWith('B')) {
      updatedState.wit_points = Math.min(2, (updatedState.wit_points ?? 0) + 1);
      if (rawAction.includes('何仔') || rawAction.includes('認契弟')) {
        updatedState.ho_defense = Math.max(0, (updatedState.ho_defense ?? 60) - 10);
      }
    }
    if (rawAction.startsWith('D')) {
      updatedState.ho_defense = Math.max(0, (updatedState.ho_defense ?? 60) - 8);
    }

    // 回血與物品消耗
    if (
      rawAction.includes('包紮') ||
      rawAction.includes('草藥') ||
      rawAction.includes('烈酒') ||
      rawAction.includes('金創藥')
    ) {
      const healAmount = 15;
      updatedState.qi_hp = Math.min(updatedState.max_qi_hp, (updatedState.qi_hp ?? 0) + healAmount);

      if (Array.isArray(updatedState.inventory)) {
        const itemIdx = updatedState.inventory.findIndex((item: string) =>
          item.includes('草藥') || item.includes('烈酒') || item.includes('金創藥')
        );
        if (itemIdx !== -1) {
          updatedState.inventory[itemIdx] = '';
        }
      }
    } else if (rawAction.includes('茶檔') || rawAction.includes('苦茶')) {
      if ((updatedState.copper ?? 0) >= 5) {
        updatedState.copper -= 5;
        updatedState.qi_hp = Math.min(updatedState.max_qi_hp, (updatedState.qi_hp ?? 0) + 8);
      }
    }

    // -------------------------------------------------------------
    // 2. 創角數值初始化攔截（5 大出身）
    // -------------------------------------------------------------
    let isInitialCreation = false;
    if (rawAction.includes('城西街童扒手')) {
      isInitialCreation = true;
      updatedState = {
        ...updatedState,
        identity: '城西街童扒手',
        qi_hp: 40,
        max_qi_hp: 40,
        neili: 5,
        max_neili: 10,
        copper: 25,
        silver: 0,
        weapon: '磨尖鐵生鏽短錐 (耐久 15)',
        inventory: ['磨尖鐵生鏽短錐 (耐久 15)', '', '', ''],
        companion: '何仔（在場·防線 60/60）',
        combat_rounds: 1,
      };
    } else if (rawAction.includes('濕鳩武館棄徒')) {
      isInitialCreation = true;
      updatedState = {
        ...updatedState,
        identity: '濕鳩武館棄徒',
        qi_hp: 55,
        max_qi_hp: 55,
        neili: 8,
        max_neili: 15,
        copper: 0,
        silver: 0,
        weapon: '裹布爛鐵條 (耐久 20)',
        inventory: ['裹布爛鐵條 (耐久 20)', '跌打草藥包', '', ''],
        companion: '何仔（在場·防線 60/60）',
        combat_rounds: 1,
      };
    } else if (rawAction.includes('爛賭收數佬')) {
      isInitialCreation = true;
      updatedState = {
        ...updatedState,
        identity: '爛賭收數佬',
        qi_hp: 45,
        max_qi_hp: 45,
        neili: 4,
        max_neili: 10,
        copper: 10,
        silver: 0,
        weapon: '生鏽碎肉剪刀 (耐久 10)',
        inventory: ['生鏽碎肉剪刀 (耐久 10)', '灌鉛假骰子', '', ''],
        companion: '何仔（在場·防線 60/60）',
        combat_rounds: 1,
      };
    } else if (rawAction.includes('黑市醫生助手')) {
      isInitialCreation = true;
      updatedState = {
        ...updatedState,
        identity: '黑市醫生助手',
        qi_hp: 42,
        max_qi_hp: 42,
        neili: 6,
        max_neili: 12,
        copper: 0,
        silver: 0,
        weapon: '生鏽放血薄刃 (耐久 12)',
        inventory: ['生鏽放血薄刃 (耐久 12)', '烈酒半竹筒', '', ''],
        companion: '何仔（在場·防線 60/60）',
        combat_rounds: 1,
      };
    } else if (rawAction.includes('自定義') || rawAction.includes('江湖人')) {
      isInitialCreation = true;
      const rawContent = rawAction.replace(/^[A-Z]\.\s*\[.*?\]\s*/, '').trim();
      const extractedTitle = rawContent.slice(0, 10).split(/[，,。\s]/)[0] || '市井散人';
      const customWeapon = rawContent.includes('刀')
        ? '生鏽斬骨刀'
        : rawContent.includes('棍')
        ? '防身木棍'
        : '隨身破爛物品';

      updatedState = {
        ...updatedState,
        identity: extractedTitle,
        qi_hp: 45,
        max_qi_hp: 45,
        neili: 5,
        max_neili: 10,
        copper: 10,
        silver: 0,
        weapon: customWeapon,
        inventory: [customWeapon, '', '', ''],
        companion: '何仔（在場·防線 60/60）',
        combat_rounds: 1,
      };
    }

    // -------------------------------------------------------------
    // 3. 戰鬥上限與喘息循環控制
    // -------------------------------------------------------------
    if (!isInitialCreation && !updatedState.in_respite) {
      updatedState.combat_rounds = (updatedState.combat_rounds ?? 0) + 1;
      if (updatedState.combat_rounds >= 4) {
        updatedState.in_respite = true;
        updatedState.combat_rounds = 0;
        updatedState.wit_points = Math.min(2, (updatedState.wit_points ?? 0) + 1);
      }
    } else if (updatedState.in_respite) {
      updatedState.combat_rounds = (updatedState.combat_rounds ?? 0) + 1;
      if (updatedState.combat_rounds >= 2) {
        updatedState.in_respite = false;
        updatedState.combat_rounds = 0;
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
    // 5. System Prompt
    // -------------------------------------------------------------
    const systemPrompt = `你係硬派文字TRPG《明心閣》嘅掌故人（GM）。

【知識庫與底層設定】
(世界觀)
${worldLore}
(人物群像)
${characters}
(主線進度)
${storylines}
(全城區域)
${cityMap}

【1. 角色定位與運行原則】
- 身份：沉浸式硬派市井文字冒險 GM。行文冷峻、克制、客觀白描，展現杜琪峯電影式的黑色幽默與街頭壓迫感。
- 零廢話準則 (Zero Meta-Talk)：每回合首字必須直接由故事正文開始，嚴禁出現「好的」、「明白」等任何 AI 客套發言。
- Fail-Forward 機制：行動挫敗絕不中斷遊戲，必須以「局勢惡化、負傷、耗損物資或同門代價」推動劇情。
- 特質吸收雙刃劍：嚴格落實玩家出身之正負特質（街童扒手：靈活/體弱；武館棄徒：硬底/招搖；收數佬：老油條/負債；醫生助手：識穴/腥臭）。

【2. 語言規範 (STRICT)】
- 對白：100% 香港市井粵語口語（精練、地道、短促、每段上限 2 句；嚴禁書面語夾雜）。
- 旁白：純白話書面語，零粵語字，具備鏡頭感的冷峻白描，嚴禁文藝腔。
- 嚴禁出現「的、了、嗎、呢、與、看著、走進」，必須全用「嘅、咗、咩、啦、同、望住、行入」。

【3. 戰鬥節奏與喘息循環 (PACING & RESPITE)】
當前狀態：${updatedState.in_respite ? '【安全喘息期】' : `【戰鬥中·第 ${updatedState.combat_rounds} 回合】`}
- 若處於戰鬥第 4 回合，必須判定成功利用掩護或地形脫險，強制轉移場景至安全據點（如天台、容姐茶檔、通義當後巷）！
- 若處於【安全喘息期】，嚴禁空降新敵人，正文轉為整理傷勢、分贓或對話，A-F 選項必須轉化為市井修整動作（包紮傷勢/搜查環境/同伴盤道/茶檔打探/練功）。

【4. 每回合標準輸出規格 (STRICT OUTPUT FORMAT)】
每回合必須依序嚴格輸出以下三部分。
注意：【嚴禁】在正文中輸出 HP、銅錢、行囊等數值面板，所有數值交由後台 UI 處理！

[1] 正文白描（120–180 字）
物理衝突推演與極短對白。禁止出現扣血數值計算。
- 若是第一回合創角剛結束：何仔必須先依據玩家出身作出一句抵死市井點評，接著門外匯智樓刀手踢門踏入，帶出血腥收數清單！
- 若玩家選 D [交畀同伴]：依在場同門性格（何仔打太極認契弟、衛林重拳、阿黃瘋狗撲咬、奇仕毒舌、域卡度摔煙霧）直接接管局勢！

[2] 環境暗記
獨立空一行輸出，格式為：「暗記：(現場環境倒數、潛伏危險或即將發生的物理異動標註)」

[3] 固定 6 選項 (A–F)
必須使用半形方括號 [] 包覆分類，並緊接當前具體行動描述：
A. [激進介入] 
B. [息事寧人] 
C. [市井下三濫] 
D. [交畀同伴] 
E. [修煉武學] 
F. [其他] ${updatedState.wit_points === 0 ? '【機變耗盡，此選項已鎖定】' : ''}

【後台數值參考】
- 玩家：${updatedState.identity} ｜ 氣血：${updatedState.qi_hp}/${updatedState.max_qi_hp} ｜ 機變：${updatedState.wit_points}/2
- 何仔防線：${updatedState.ho_defense}/100 ｜ 轄下街區：${updatedState.controlled_streets}
- 行囊清單：${JSON.stringify(updatedState.inventory)}
- 玩家最新動作：${rawAction}`;

    const formattedHistory = (Array.isArray(chatHistory) ? chatHistory : [])
      .slice(-4)
      .map((item: any) => {
        const content =
          typeof item === 'string'
            ? item
            : item.content || item.text || item.message || JSON.stringify(item);

        let role: 'user' | 'assistant' | 'system' = 'user';
        if (typeof item === 'object' && item.role) {
          const rawRole = String(item.role).toLowerCase();
          if (rawRole === 'gm' || rawRole === 'assistant' || rawRole === 'bot') {
            role = 'assistant';
          } else if (rawRole === 'system') {
            role = 'system';
          } else {
            role = 'user';
          }
        } else {
          role = content.includes('你選擇了') ? 'user' : 'assistant';
        }
        return { role, content };
      });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
    ];

    const response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o',
      messages: messages as any,
      temperature: 0.6,
      max_tokens: 600,
    });

    const rawText = response.choices[0].message?.content || '（江湖沉寂，無事發生）';

    const matchedActions = rawText.match(/[A-F]\.\s*\[.*?\].*/g);
    const cleanText = rawText.replace(/(?:^|\n)\s*(?:[-*]\s*)?[A-F]\.\s*\[.*?\].*/g, '').trim();

    const fallbackActions = updatedState.in_respite
      ? [
          'A. [安全修整] 使用隨身草藥包紮傷口',
          'B. [清點盤道] 搜查四周環境清點物資',
          'C. [同門交流] 與何仔打聽城中近日風聲',
          'D. [暗中打探] 前往容姐茶檔探聽虛實',
          'E. [修煉武學] 靜坐順氣體悟剛才發力',
          'F. [其他] 自定義後續修整動作',
        ]
      : [
          'A. [激進介入] 正面硬碰搶先出招',
          'B. [息事寧人] 暫避鋒芒保全大局',
          'C. [市井下三濫] 撒生石灰偷襲下陰',
          'D. [交畀同伴] 示意在場同門依性格處理',
          'E. [修煉武學] 當場體悟發力尋找破綻',
          'F. [其他] 玩家自定義破局動作',
        ];

    const finalActions = matchedActions && matchedActions.length >= 6 
      ? matchedActions.map((a: string) => a.replace(/^[-*]\s*/, '').trim()).slice(0, 6)
      : fallbackActions;

    return NextResponse.json({
      success: true,
      newState: updatedState,
      updatedState: updatedState,
      playerState: updatedState,
      text: cleanText,
      aiText: cleanText,
      narration: cleanText,
      message: cleanText,
      content: cleanText,
      actions: finalActions,
    });
  } catch (error: any) {
    console.error('API Error Status:', error.status);
    console.error('API Error Body:', error.error || error.message || error);

    return NextResponse.json(
      {
        error: `[${error.status || 500}] ${error.message || 'API 呼叫失敗'}`,
      },
      { status: 500 }
    );
  }
}