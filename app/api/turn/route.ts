import { NextRequest, NextResponse } from "next/server";
import { normalizeState, resolveTurn, type GameState, type Landmark } from "@/lib/game-engine";
import { npcVoiceGuide } from "@/lib/npc-voices";

const SYSTEM_PROMPT = `你是青山城城西的文字冒險主持人。這是古代底層幫派江湖；同門情分、欠帳、傷勢與地盤牽動人心。只用自然的繁體中文書面語，不用廣東話、現代口語或網絡用語。沒有神怪、高武或現代物品。
旁白以第二人稱「你」推進。玩家名號只可在 NPC 對白出現。原地行動不重複描寫環境。以動作、傷口、器物和帳目起筆，讓事情先發生，再顯出人物的打算與代價；收束時留下當下的決定或壓力。句子長短交錯，段落有起伏，不把事件逐項列成流水帳，也不堆砌典故、口號或華麗形容詞。
NPC 說話須符合各自的利益與習慣。話可以說得含蓄，意思必須清楚。若已提供確定對白，逐字保留該句，不另加 NPC 發言。
只回 JSON：{"narrative":"..."}。narrative 須 90 至 220 字，嚴格兩段，以 \\n\\n 分隔；第二段的 NPC 對白另起一行。
只敘述提供的確定事件，不增減金錢、道具、氣血、內力或地點，不讓玩家離開城西七據點。`;

const SPEAKER: Record<Landmark, string> = {
  "青鋒堂總壇": "何不歸", "晚秋茶寮": "容晚秋", "黑泥街": "陸千帆",
  "鬼骰坊": "祁觀衡", "裂石擂": "衛沉岳", "苦煙館": "顧忘生", "夜雨樓": "柳照霜",
};

function fallbackNarrative(event: string, state: GameState, npcReply?: { speaker: string; line: string }, combatTurn = false): string {
  if (state.questStep === "prologue_briefing" && npcReply?.speaker === "何不歸") {
    const detail = "你看見何不歸指節上的舊傷，也看見藥包旁那本未合上的帳。";
    return `${event}\n\n${detail}\n何不歸：「${npcReply.line}」`;
  }
  if (combatTurn) {
    const sentences = event.split(/(?<=。)/).filter(Boolean);
    const midpoint = Math.max(1, Math.ceil(sentences.length / 2));
    const first = sentences.slice(0, midpoint).join("");
    const second = sentences.slice(midpoint).join("") || "勝負尚未定下，你仍須看清對方下一步。";
    const speaker = npcReply?.speaker || (state.currentLocation === "裂石擂" ? "衛沉岳"
      : state.worldFlags.includes("出賣陸千帆") ? "張斷骨" : "陸千帆");
    const line = npcReply?.line || (state.currentLocation === "裂石擂" ? "先看他的肩。拳還未到。"
      : state.worldFlags.includes("出賣陸千帆") ? "你一個人守得住這條街？" : "刀手近了。先看他握刀的手。");
    return `${first}\n\n${second}\n${speaker}：「${line}」`;
  }
  const clauses = event.split(/(?<=。)/).filter(Boolean);
  const pressure = clauses.at(-1)?.startsWith("玄武樓趁") ? clauses.pop() || "" : "";
  const midpoint = Math.max(1, Math.ceil(clauses.length / 2));
  const first = pressure ? clauses.join("") + pressure : clauses.slice(0, midpoint).join("");
  let second = pressure ? "" : clauses.slice(midpoint).join("");
  const visibleLength = (text: string) => Array.from(text.replace(/\s/g, "")).length;
  const sandboxDetail: Record<Landmark, string[]> = {
    "青鋒堂總壇": ["你翻看堂口帳簿，知道一文公款也不能亂花。", "你記住何不歸的臉色，堂口還要有人守。"],
    "晚秋茶寮": ["你掂量藥價，也記住容晚秋提醒過的刀手。", "你收好錢袋，沒有忘記市集的傷號。"],
    "黑泥街": ["你盯住肉檔與巷口，防著舊仇再來。", "你掂量今日規費，沒有把公款當私銀。"],
    "鬼骰坊": ["鬼骰坊的叫喝聲不曾停。你收好錢袋，知道每一筆都有人記著。", "桌上的銅錢仍在移動，你卻得先算清下一筆帳。"],
    "裂石擂": ["你揉了揉傷處，還記得擂台上的硬拳。", "你握緊拳頭，掂量下一場的代價。"],
    "苦煙館": ["你看清藥包封口，沒有碰來歷不明的丹藥。", "你聞到藥味，先守住自己的神志。"],
    "夜雨樓": ["你聽著樓裡閒話，暗記可疑客人的口音。", "你留心席間眼色，不急著露出底牌。"],
  };
  const detail: Record<GameState["questStep"], string[]> = {
    prologue_briefing: ["你攥緊藥包，沒有應聲。", "你看見何不歸的手壓著帳簿，知道五十文也要帶回。"],
    yung_tea_stall: ["你護住懷裡的草藥，將容晚秋的警訊記在心裡。", "你聽見街口腳步，又把袖口攏緊。"],
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
    "青鋒堂總壇": "這道門我先守著。你去看街上的事。",
    "晚秋茶寮": "茶給你留著。傷口先別沾水。",
    "黑泥街": "我看巷口。你先把腳下踩穩。",
    "鬼骰坊": "進門先數錢，出門再數一遍。",
    "裂石擂": "站穩。肘收回來。",
    "苦煙館": "先聞藥味。別急著入口。",
    "夜雨樓": "那人只看門口。你也該看一眼。",
  };
  const companionBetrayed = state.currentLocation === "黑泥街" && state.worldFlags.includes("出賣陸千帆");
  const speaker = npcReply?.speaker || (companionBetrayed ? "張斷骨" : SPEAKER[state.currentLocation]);
  const line = npcReply?.line || (companionBetrayed
    ? state.questStep === "huizhi_ambush" ? "你一個也走不掉。" : "這條街的賬，我還記著。"
    : state.questStep === "sandbox" ? sandboxSpeech[state.currentLocation] : speech[state.questStep]);
  const dialogue = `\n${speaker}：「${line}」`;
  const additions = state.questStep === "sandbox" && state.turn % 2 === 0
    ? [...detail[state.questStep]].reverse() : detail[state.questStep];
  if (!second || visibleLength(first + second + dialogue) < 130) second += additions[0];
  if (!second) second = "你將眼前的事記在心裏，知道這一回合尚未了結。";
  return `${first}\n\n${second}${dialogue}`;
}

function validNarrative(value: unknown, npcReply?: { speaker: string; line: string }, previousNarrative = ""): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split("\n\n");
  const length = Array.from(value.replace(/\s/g, "")).length;
  const narrationOnly = value.replace(/^[^\n：]+：[「『].*$/gm, "");
  const dialogueLines = parts[1]?.match(/\n[^：\n]+：[「『]/g) || [];
  return parts.length === 2 && parts.every(Boolean) && length >= 90 && length <= 220
    && !/[他她它]/.test(narrationOnly)
    && !/[嘅咗喺啲唔冇嚟咁佢畀睇]/.test(value)
    && !/手機|電腦|槍械|超人|修仙|法術/.test(value)
    && dialogueLines.length === 1
    && (!npcReply || parts[1].includes(`${npcReply.speaker}：「${npcReply.line}」`))
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

async function narrate(state: GameState, action: string, event: string, moneyChanged: boolean, combatTurn: boolean, npcReply?: { speaker: string; line: string }, previousNarrative = "") {
  const fallback = fallbackNarrative(event, state, npcReply, combatTurn);
  const fallbackResult = (reason: string) => ({ text: fallback, source: "fallback" as const, reason });
  if (state.questStep === "prologue_briefing" && state.turn === 1) return fallbackResult("authored_opening");
  if (combatTurn) return fallbackResult("calculated_combat");
  // The deterministic account already contains the exact transaction.
  if (moneyChanged) return fallbackResult("money_change");
  const key = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_API_KEY;
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || process.env.AZURE_ENDPOINT || "").trim();
  if (!key || !endpoint) return fallbackResult("missing_azure_config");

  const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o").trim();
  const replyInstruction = npcReply ? `確定對白：${npcReply.speaker}：「${npcReply.line}」。第二段原句保留。\n` : "";
  const speaker = npcReply?.speaker || (state.currentLocation === "黑泥街" && state.worldFlags.includes("出賣陸千帆")
    ? "張斷骨" : SPEAKER[state.currentLocation]);
  const prompt = `第 ${state.turn} 回合。地點：${state.currentLocation}；階段：${state.questStep}；你做了：${action.slice(0, 180)}。\n確定事件：${event}\n本回合 NPC：${speaker}。聲線：${npcVoiceGuide(speaker)}\n${replyInstruction}已記因果：${state.worldFlags.join("、") || "無"}。${previousNarrative ? `上一回合敘事：${previousNarrative.slice(0, 180)}。避免重複句式和對白，只描寫今回合新事件。` : ""}只寫確定事件；所有收支金額須明說。`;
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
    return validNarrative(parsed.narrative, npcReply, previousNarrative)
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
  if (turn.state.flags.ending) return NextResponse.json({ narrative: turn.event, options: [], state: turn.state, narrativeSource: "ending" });
  const previousNarrative = typeof payload.previousNarrative === "string" ? payload.previousNarrative.slice(0, 500) : "";
  const narration = await narrate(turn.state, payload.action, turn.event, Boolean(turn.moneyNote), Boolean(state.combat || turn.state.combat), turn.npcReply, previousNarrative);
  return NextResponse.json({
    narrative: narration.text, options: turn.options, state: turn.state,
    narrativeSource: narration.source,
    ...("reason" in narration ? { narrativeFallbackReason: narration.reason } : {}),
  });
}
