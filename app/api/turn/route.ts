import { NextRequest, NextResponse } from "next/server";
import { normalizeState, resolveTurn, type GameState, type Landmark } from "@/lib/game-engine";
import { npcVoiceGuide } from "@/lib/npc-voices";

const SYSTEM_PROMPT = `你是青山城城西的文字冒險主持人。古代底層幫派江湖；同門情分、血債與規費牽動人心。只寫繁體中文冷硬短句，無神怪、高武、現代物品。
只以「你」寫旁白。玩家名號只可在 NPC 對白出現。原地行動不重複描寫環境。少形容詞；用動作、傷口、器物和欠帳成畫面。長短句交錯，句號斷氣、分號轉折。
NPC 說話須符合指定人物的利益與習慣，讓用字和句長顯出性格。用自然繁體中文；只有自然順口時才用少量廣東話，不逐字把普通話轉成粵語，也不靠語氣助詞堆出口吻。若已提供確定對白，只保留該句，不另加 NPC 發言。
只回 JSON：{"narrative":"..."}。narrative 須 80 至 120 字，嚴格兩段，以 \\n\\n 分隔；第二段的 NPC 對白另起一行。
只敘述提供的確定事件，不增減金錢、道具、氣血、內力或地點，不讓玩家離開城西七據點。`;

const SPEAKER: Record<Landmark, string> = {
  "明心閣總壇": "何仔", "容姐茶檔": "容姐", "泥濘市集": "域卡度",
  "聚財坊": "奇仕", "黑市武館": "衛林", "仙館": "佚名", "怡紅院": "玉樺",
};

function fallbackNarrative(event: string, state: GameState, npcReply?: { speaker: string; line: string }): string {
  if (state.questStep === "prologue_briefing" && npcReply?.speaker === "何仔") {
    const detail = state.background === "自定義市井流民" && state.gender && state.skill && state.personality
      ? "你看見藥包的麻繩沾著泥。"
      : "你伸手，藥包不動。";
    return `${event}\n\n${detail}\n何仔：「${npcReply.line}」`;
  }
  const clauses = event.split(/(?<=。)/).filter(Boolean);
  const midpoint = Math.max(1, Math.ceil(clauses.length / 2));
  const first = clauses.slice(0, midpoint).join("");
  let second = clauses.slice(midpoint).join("");
  const visibleLength = (text: string) => Array.from(text.replace(/\s/g, "")).length;
  const sandboxDetail: Record<Landmark, string[]> = {
    "明心閣總壇": ["你翻看堂口帳簿，知道一文公款也不能亂花。", "你記住何仔的臉色，防線還要有人守。"],
    "容姐茶檔": ["你掂量藥價，也記住容姐提醒過的刀手。", "你收好錢袋，沒有忘記市集的傷號。"],
    "泥濘市集": ["你盯住肉檔與巷口，防著舊仇再來。", "你掂量今日規費，沒有把公款當私銀。"],
    "聚財坊": ["你盯著骰盅，先算清輸得起幾文。", "你收緊錢袋，知道賭桌不講情面。"],
    "黑市武館": ["你揉了揉傷處，還記得擂台上的硬拳。", "你握緊拳頭，掂量下一場的代價。"],
    "仙館": ["你看清藥包封口，沒有碰來歷不明的丹藥。", "你聞到藥味，先守住自己的神志。"],
    "怡紅院": ["你聽著樓裡閒話，暗記可疑客人的口音。", "你留心席間眼色，不急著露出底牌。"],
  };
  const detail: Record<GameState["questStep"], string[]> = {
    prologue_briefing: ["你攥緊藥包，沒有應聲。", "你看見何仔的手壓著帳簿，知道五十文也要帶回。"],
    yung_tea_stall: ["你護住懷裡的草藥，將容姐的警訊記在心裡。", "你聽見街口腳步，又把袖口攏緊。"],
    market_collection: ["你按住藥包，沒有忘記肉檔欠下的規費。", "你留意巷口動靜，準備先救人再收錢。"],
    huizhi_ambush: ["你收緊刀柄，將身邊同門護在側後。", "你聽見巷尾腳步，知道眼前再無退路。"],
    sandbox: sandboxDetail[state.currentLocation],
  };
  const speech: Record<Exclude<GameState["questStep"], "sandbox">, string> = {
    prologue_briefing: "藥先送到。五十文的帳，我替你看著。",
    yung_tea_stall: "藥拿穩。市集那邊，少走明路。",
    market_collection: "我這傷還撐得住。你先看巷口。",
    huizhi_ambush: "我往左。你別讓他們抄後路。",
  };
  const sandboxSpeech: Record<Landmark, string> = {
    "明心閣總壇": "這道門我先守著。你去看街上的事。",
    "容姐茶檔": "茶給你留著。傷口先別沾水。",
    "泥濘市集": "我看巷口。你先把腳下踩穩。",
    "聚財坊": "進門先數錢，出門再數一遍。",
    "黑市武館": "站穩。肘收回來。",
    "仙館": "先聞藥味。別急著入口。",
    "怡紅院": "那人只看門口。你也該看一眼。",
  };
  const companionBetrayed = state.currentLocation === "泥濘市集" && state.worldFlags.includes("出賣域卡度");
  const speaker = npcReply?.speaker || (companionBetrayed ? "張屠戶" : SPEAKER[state.currentLocation]);
  const line = npcReply?.line || (companionBetrayed
    ? state.questStep === "huizhi_ambush" ? "你一個也走不掉。" : "這條街的賬，我還記著。"
    : state.questStep === "sandbox" ? sandboxSpeech[state.currentLocation] : speech[state.questStep]);
  const dialogue = `\n${speaker}：「${line}」`;
  const additions = detail[state.questStep];
  if (state.questStep === "sandbox" && state.turn % 2 === 0) additions.reverse();
  for (const addition of additions) {
    if (visibleLength(first + second + dialogue) >= 80) break;
    second += addition;
  }
  if (visibleLength(first + second + dialogue) < 80) second += "你站穩腳步，等著下一步動靜。";
  const room = Math.max(0, 120 - visibleLength(first + dialogue));
  if (second.length > room) second = second.slice(0, room);
  return `${first}\n\n${second}${dialogue}`;
}

function validNarrative(value: unknown, npcReply?: { speaker: string; line: string }, previousNarrative = "", customOpening?: GameState): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split("\n\n");
  const length = Array.from(value.replace(/\s/g, "")).length;
  const narrationOnly = value.replace(/^[^\n：]+：[「『].*$/gm, "");
  const dialogueLines = parts[1]?.match(/\n[^：\n]+：[「『]/g) || [];
  const hoLine = parts[1]?.match(/\n何仔：「([^」]*)」/)?.[1] || "";
  return parts.length === 2 && parts.every(Boolean) && length >= 80 && length <= 120
    && !/[他她它]/.test(narrationOnly)
    && !/手機|電腦|槍械|超人|修仙|法術/.test(value)
    && dialogueLines.length === 1
    && (!npcReply || Boolean(customOpening) || parts[1].includes(`${npcReply.speaker}：「${npcReply.line}」`))
    && (!customOpening || (Boolean(hoLine)
      && hoLine.includes("域卡度") && hoLine.includes("五十文")
      && !/(你是.{0,12}，.{0,18}，性子|性別[:：]|技能[:：]|性格[:：])/.test(hoLine)))
    && value.replace(/\s/g, "") !== previousNarrative.replace(/\s/g, "");
}

function azureUrl(endpoint: string, deployment: string) {
  const base = endpoint.replace(/\/$/, "");
  if (base.includes("/openai/v1/responses")) return base.replace("/openai/v1/responses", "/openai/v1/chat/completions");
  if (base.endsWith("/openai/v1")) return `${base}/chat/completions`;
  if (base.includes("/chat/completions")) return base;
  if (base.includes("services.ai.azure.com")) return `${base}/openai/v1/chat/completions`;
  const version = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
  return `${base}/openai/deployments/${deployment}/chat/completions?api-version=${version}`;
}

async function narrate(state: GameState, action: string, event: string, moneyChanged: boolean, npcReply?: { speaker: string; line: string }, previousNarrative = "") {
  const fallback = fallbackNarrative(event, state, npcReply);
  const fallbackResult = (reason: string) => ({ text: fallback, source: "fallback" as const, reason });
  // The deterministic account already contains the exact transaction.
  if (moneyChanged) return fallbackResult("money_change");
  const key = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_API_KEY;
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || process.env.AZURE_ENDPOINT || "").trim();
  if (!key || !endpoint) return fallbackResult("missing_azure_config");

  const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o").trim();
  const customOpening = state.questStep === "prologue_briefing" && state.turn === 1
    && state.background === "自定義市井流民" && Boolean(state.gender && state.skill && state.personality);
  const openingInstruction = state.questStep === "prologue_briefing"
    ? customOpening
      ? `自訂人物：性別「${state.gender}」、技能「${state.skill}」、性格「${state.personality}」。何仔先看這門本事能怎樣幫手，再從性子推斷玩家可能犯的錯或能守住的事，才交代救域卡度、收五十文。性別只影響自然稱呼，不推斷能力，也無須直說。請用何仔護短又怕欠帳的口吻，不要念「你是某性別、會某技能、性子某樣」的資料清單。\n`
      : `開局人物：出身「${state.background}」，特質「${state.trait}」。第一段用城西泥、搗藥聲、肉檔討數帶你入堂；第二段何仔當面評你，先露同門情分再壓五十文。短句有停頓。\n`
    : "";
  const replyInstruction = customOpening
    ? "第二段由何仔親口評斷角色，再說救域卡度與收五十文規費；可以轉述人物資料，毋須逐字重複。\n"
    : npcReply ? `確定對白：${npcReply.speaker}：「${npcReply.line}」。第二段原句保留。\n` : "";
  const speaker = npcReply?.speaker || (state.currentLocation === "泥濘市集" && state.worldFlags.includes("出賣域卡度")
    ? "張屠戶" : SPEAKER[state.currentLocation]);
  const prompt = `第 ${state.turn} 回合。地點：${state.currentLocation}；階段：${state.questStep}；你做了：${action.slice(0, 180)}。\n${openingInstruction}確定事件：${event}\n本回合 NPC：${speaker}。聲線：${npcVoiceGuide(speaker)}\n${replyInstruction}已記因果：${state.worldFlags.join("、") || "無"}。${previousNarrative ? `上一回合敘事：${previousNarrative.slice(0, 180)}。避免重複句式和對白，只描寫今回合新事件。` : ""}只寫確定事件；所有收支金額須明說。`;
  try {
    const response = await fetch(azureUrl(endpoint, deployment), {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: deployment, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }], temperature: 0.3, response_format: { type: "json_object" } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return fallbackResult(`azure_http_${response.status}`);
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return validNarrative(parsed.narrative, npcReply, previousNarrative, customOpening ? state : undefined)
      ? { text: parsed.narrative, source: "azure" as const }
      : fallbackResult("invalid_narrative");
  } catch {
    return fallbackResult("azure_request_or_parse_error");
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  const payload = body as { action?: unknown; state?: unknown; previousNarrative?: unknown };
  const state = normalizeState(payload.state);
  if (!state || typeof payload.action !== "string" || payload.action.length > 500) {
    return NextResponse.json({ error: "遊戲狀態或行動無效" }, { status: 400 });
  }
  const opening = payload.action.startsWith("[初入堂口]") && state.questStep === "prologue_briefing" && state.turn === 1;
  const turn = resolveTurn(state, payload.action, opening);
  const previousNarrative = typeof payload.previousNarrative === "string" ? payload.previousNarrative.slice(0, 500) : "";
  const narration = await narrate(turn.state, payload.action, turn.event, Boolean(turn.moneyNote), turn.npcReply, previousNarrative);
  return NextResponse.json({
    narrative: narration.text, options: turn.options, state: turn.state,
    narrativeSource: narration.source,
    ...("reason" in narration ? { narrativeFallbackReason: narration.reason } : {}),
  });
}
