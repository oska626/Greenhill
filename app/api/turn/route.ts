import { NextRequest, NextResponse } from "next/server";
import { normalizeState, resolveTurn, type GameState, type Landmark } from "@/lib/game-engine";

const SYSTEM_PROMPT = `你是青山城城西的文字冒險主持人。只寫繁體中文冷硬短句，古代底層市井，無神怪、高武、現代物品。
只以「你」寫旁白。玩家名號只可在 NPC 對白出現。原地行動不重複描寫環境。開局第一段先用一筆城西市井聲氣帶你入堂，第二段由何仔當面評你，從域卡度受傷引出差事，勿只列任務。
只回 JSON：{"narrative":"..."}。narrative 須 80 至 120 字，嚴格兩段，以 \\n\\n 分隔；第二段的 NPC 對白另起一行。
只敘述提供的確定事件，不增減金錢、道具、氣血、內力或地點，不讓玩家離開城西七據點。`;

const SPEAKER: Record<Landmark, string> = {
  "明心閣總壇": "何仔", "容姐茶檔": "容姐", "泥濘市集": "域卡度",
  "聚財坊": "奇仕", "黑市武館": "衛林", "仙館": "佚名", "怡紅院": "玉樺",
};

function fallbackNarrative(event: string, state: GameState, npcReply?: { speaker: string; line: string }): string {
  if (state.questStep === "prologue_briefing" && npcReply?.speaker === "何仔") {
    return `${event}\n\n你伸手，卻見何仔按住藥包。\n何仔：「${npcReply.line}」`;
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
  const speech: Record<GameState["questStep"], string> = {
    prologue_briefing: "藥先送到，錢再帶回來。",
    yung_tea_stall: "刀手今早走過，先把藥換妥。",
    market_collection: "先敷藥，巷口也要盯住。",
    huizhi_ambush: "刀手來了，當心左右。",
    sandbox: "城西的事，還得一步一步辦。",
  };
  const companionBetrayed = state.currentLocation === "泥濘市集" && state.worldFlags.includes("出賣域卡度");
  const speaker = npcReply?.speaker || (companionBetrayed ? "張屠戶" : SPEAKER[state.currentLocation]);
  const line = npcReply?.line || (companionBetrayed
    ? state.questStep === "huizhi_ambush" ? "你一個也走不掉。" : "這條街的賬，我還記著。"
    : speech[state.questStep]);
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

function validNarrative(value: unknown, npcReply?: { speaker: string; line: string }): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split("\n\n");
  const length = Array.from(value.replace(/\s/g, "")).length;
  return parts.length === 2 && parts.every(Boolean) && length >= 80 && length <= 120
    && !/[他她它]|手機|電腦|槍械|超人|修仙|法術/.test(value)
    && /\n[^：\n]+：[「『]/.test(parts[1])
    && (!npcReply || parts[1].includes(`${npcReply.speaker}：「${npcReply.line}」`));
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

async function narrate(state: GameState, action: string, event: string, moneyChanged: boolean, npcReply?: { speaker: string; line: string }) {
  const fallback = fallbackNarrative(event, state, npcReply);
  const fallbackResult = (reason: string) => ({ text: fallback, source: "fallback" as const, reason });
  // The deterministic account already contains the exact transaction.
  if (moneyChanged) return fallbackResult("money_change");
  const key = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_API_KEY;
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || process.env.AZURE_ENDPOINT || "").trim();
  if (!key || !endpoint) return fallbackResult("missing_azure_config");

  const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o").trim();
  const openingInstruction = state.questStep === "prologue_briefing"
    ? `開局人物：出身「${state.background}」，特質「${state.trait}」。第一段先寫城西泥巷、茶檔與肉檔的短景，再寫你入堂；第二段讓何仔當面評你，再由傷者與欠帳帶出差事，不能像任務清單。\n`
    : "";
  const replyInstruction = npcReply ? `確定對白：${npcReply.speaker}：「${npcReply.line}」。第二段原句保留。\n` : "";
  const prompt = `地點：${state.currentLocation}；階段：${state.questStep}；你做了：${action.slice(0, 180)}。\n${openingInstruction}確定事件：${event}\n${replyInstruction}已記因果：${state.worldFlags.join("、") || "無"}。只寫確定事件；所有收支金額須明說。`;
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
    return validNarrative(parsed.narrative, npcReply)
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
  const payload = body as { action?: unknown; state?: unknown };
  const state = normalizeState(payload.state);
  if (!state || typeof payload.action !== "string" || payload.action.length > 500) {
    return NextResponse.json({ error: "遊戲狀態或行動無效" }, { status: 400 });
  }
  const opening = payload.action.startsWith("[初入堂口]") && state.questStep === "prologue_briefing" && state.turn === 1;
  const turn = resolveTurn(state, payload.action, opening);
  const narration = await narrate(turn.state, payload.action, turn.event, Boolean(turn.moneyNote), turn.npcReply);
  return NextResponse.json({
    narrative: narration.text, options: turn.options, state: turn.state,
    narrativeSource: narration.source,
    ...("reason" in narration ? { narrativeFallbackReason: narration.reason } : {}),
  });
}
