import type { GameState, Landmark } from "./game-engine.ts";

export const SOCIAL_GOALS = ["help", "truce", "defect", "belief", "information"] as const;
export type SocialGoal = typeof SOCIAL_GOALS[number];
export const SOCIAL_TACTICS = ["evidence", "reason", "testimony", "interest", "bond", "concession", "threat", "assertion"] as const;
export type SocialTactic = typeof SOCIAL_TACTICS[number];
export type SocialIntent = { target: string; goal: SocialGoal; subject: string; tactic: SocialTactic;
  quality: "weak" | "coherent" | "grounded"; method: string };
export type SocialMemory = Record<string, {
  stance: "hostile" | "wary" | "neutral" | "cooperative" | "ally";
  beliefs: string[];
  topics: Record<string, { progress: number; resistance: number; tactics: SocialTactic[]; arguments: string[]; lastTurn: number }>;
}>;

export const MARKET_NPC_REACTIONS = ["talk", "refuse", "consider", "reveal", "cooperate", "defect", "adopt_belief"] as const;
export type MarketNpcReaction = typeof MARKET_NPC_REACTIONS[number];
export type MarketNpcProposal = { reaction: MarketNpcReaction; reason: string; memory: string; belief?: string };
export type MarketNpcExchange = { turn: number; target: string; player: string; reply: string;
  reaction: MarketNpcReaction; memory: string };

export function marketDialogueTarget(state: GameState, playerText: string): string | undefined {
  if (state.currentLocation !== "黑泥街" || state.questStep === "chapter_one") return;
  const present = socialTargets(state);
  const mentioned = present.find((name) => textMentions(name, playerText));
  const addressed = /講|說|問|談|勸|叫|請|告訴|話畀|解釋|傾|辯|嘲|鬧|罵|威脅|承諾|「|“|\bNPC\b/i.test(playerText)
    || mentioned && new RegExp(`(?:^|[，。！!])\\s*${mentioned}[，：:！!]`).test(playerText);
  if (mentioned) return addressed ? mentioned : undefined;
  // A spoken line need not name its listener or describe an additional physical action.
  // In a fight, the active knife man is the listener unless the line points to a wounded ally.
  const spokenLine = /[？?「」“”]/.test(playerText)
    || /^(?:大家|各位|兄弟|老兄|朋友|你們?|喂|住手|別動|不要動|唔好動)/.test(playerText);
  if (!spokenLine || /^(?:如果|假如|若是|假設)我/.test(playerText)) return;
  if (state.combat?.scenario === "market_ambush" || state.flags.alleyEscape) {
    if (/你(?:的)?傷|傷口|撐得住/.test(playerText) && present.includes("陸千帆")) return "陸千帆";
    return present.includes("刀手") ? "刀手" : undefined;
  }
  return present.length === 1 ? present[0] : undefined;
}

function textMentions(name: string, text: string): boolean {
  if (text.includes(name)) return true;
  return name === "陸千帆" && /千帆/.test(text)
    || name === "張斷骨" && /張屠戶|屠戶/.test(text)
    || name === "刀手" && /追兵|伏兵|灰線人/.test(text);
}

export function normalizeMarketNpcHistory(raw: unknown): MarketNpcExchange[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is MarketNpcExchange => Boolean(entry && typeof entry === "object"
    && Number.isInteger(entry.turn) && entry.turn >= 0 && entry.turn <= 100000
    && typeof entry.target === "string" && ["張斷骨", "陸千帆", "刀手"].includes(entry.target)
    && typeof entry.player === "string" && typeof entry.reply === "string"
    && typeof entry.memory === "string" && MARKET_NPC_REACTIONS.some((reaction) => reaction === entry.reaction)))
    .slice(-16).map((entry) => ({ turn: entry.turn, target: entry.target,
      player: clean(entry.player, 300), reply: clean(entry.reply, 300),
      reaction: entry.reaction, memory: clean(entry.memory, 100) }));
}

const RESIDENTS: Record<Landmark, string[]> = {
  "青鋒堂總壇": ["何不歸"], "晚秋茶寮": ["容晚秋"], "黑泥街": ["張斷骨"],
  "鬼骰坊": ["祁觀衡"], "裂石擂": ["衛沉岳", "霍破陣"], "苦煙館": ["顧忘生"],
  "夜雨樓": ["柳照霜"], "碼頭": ["船工", "碼頭守衛"],
};

export function socialTargets(state: GameState): string[] {
  const targets = [...RESIDENTS[state.currentLocation]];
  if (state.currentLocation === "黑泥街") {
    if (state.flags.marketAftermathKind === "escape" && state.flags.marketAftermath) targets.splice(targets.indexOf("張斷骨"), 1);
    if ((state.questStep === "market_collection" || state.flags.alleyAllyPresent || state.combat?.allyPresent)
      && !state.relationships["陸千帆"].estranged) targets.push("陸千帆");
    if (state.combat?.scenario === "market_ambush" || state.flags.alleyEscape) targets.push("刀手");
  }
  if (state.questStep === "chapter_one" && state.flags.chapterOne?.selectedCompanion)
    targets.push(state.flags.chapterOne.selectedCompanion);
  return Array.from(new Set(targets));
}

const bounded = (value: unknown, max: number) => typeof value === "number" && Number.isFinite(value)
  ? Math.max(0, Math.min(max, Math.trunc(value))) : 0;
const clean = (value: unknown, max: number) => typeof value === "string"
  ? value.replace(/[\r\n<>]/g, "").trim().slice(0, max) : "";

export function normalizeSocialMemory(raw: unknown): SocialMemory {
  if (!raw || typeof raw !== "object") return {};
  const result: SocialMemory = {};
  for (const [name, entry] of Object.entries(raw as Record<string, unknown>).slice(0, 18)) {
    if (!clean(name, 16) || !entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    const stance = ["hostile", "wary", "neutral", "cooperative", "ally"].includes(String(value.stance))
      ? value.stance as SocialMemory[string]["stance"] : "neutral";
    const topics: SocialMemory[string]["topics"] = {};
    if (value.topics && typeof value.topics === "object") {
      for (const [key, topic] of Object.entries(value.topics as Record<string, unknown>).slice(0, 12)) {
        if (!clean(key, 70) || !topic || typeof topic !== "object") continue;
        const data = topic as Record<string, unknown>;
        topics[clean(key, 70)] = {
          progress: bounded(data.progress, 8), resistance: bounded(data.resistance, 8),
          tactics: Array.isArray(data.tactics) ? data.tactics.filter((item): item is SocialTactic =>
            SOCIAL_TACTICS.some((tactic) => tactic === item)).slice(0, 8) : [],
          arguments: Array.isArray(data.arguments) ? data.arguments.map((item) => clean(item, 100)).filter(Boolean).slice(0, 8) : [],
          lastTurn: bounded(data.lastTurn, 100000),
        };
      }
    }
    result[clean(name, 16)] = {
      stance,
      beliefs: Array.isArray(value.beliefs) ? value.beliefs.map((item) => clean(item, 40)).filter(Boolean).slice(0, 5) : [],
      topics,
    };
  }
  return result;
}

export function socialTopic(plan: SocialIntent): string {
  return `${plan.goal}:${plan.subject.slice(0, 40)}`;
}

export function inferSocialIntent(state: GameState, text: string): SocialIntent | undefined {
  if (/^(?:如果|假如|若果|假設|可唔可以|可不可以|我唔會|我不會|我不要|我唔想)/.test(text.trim())) return;
  const target = socialTargets(state).find((name) => text.includes(name)
    || name === "刀手" && /追兵|灰線|伏兵/.test(text)
    || name === "陸千帆" && /千帆/.test(text)
    || name === "何不歸" && /堂主/.test(text));
  if (!target || !/講|說|勸|遊說|說服|談|問|答應|承諾|要求|叫|請|勸降|招降|辯|解釋|出示|展示|指明|坦白|攤牌|證明/.test(text)) return;
  const goal: SocialGoal = /耶穌|基督|改信|皈依|信仰|宗教/.test(text) ? "belief"
    : /倒戈|反過來幫|掉轉頭幫|投靠|轉投|叛|棄暗投明/.test(text) ? "defect"
      : /停手|和解|休戰|放過|收刀/.test(text) ? "truce"
        : /問|打聽|交代|透露|講出/.test(text) && !/幫|援|協助/.test(text) ? "information" : "help";
  if (goal === "information") return;
  const namedFaith = /(?:改信|皈依|信)([\u3400-\u9fffA-Za-z]{1,12})(?=[，。！？；\s]|$)/.exec(text)?.[1];
  if (goal === "belief" && !/耶穌|基督/.test(text) && !namedFaith) return;
  const subject = goal === "belief" ? /耶穌|基督/.test(text) ? "基督信仰" : namedFaith!
    : goal === "defect" ? "轉投玩家" : goal === "truce" ? "眼前停手" : "協助玩家";
  const tactic: SocialTactic = /證據|借據|帳簿|貨單|證詞|親眼|看清|睇清/.test(text) ? "evidence"
    : /親身|我曾|我見過|我經歷|我試過/.test(text) ? "testimony"
      : /因為|所以|若果|如果|道理|何以|為甚麼|點解/.test(text) ? "reason"
    : /銀|錢|利益|好處|分成|保住生意|保命/.test(text) ? "interest"
      : /舊情|同門|恩情|救過|相識|朋友/.test(text) ? "bond"
        : /我會|我願|交換|放你|替你|幫你/.test(text) ? "concession"
          : /殺|威脅|否則|告發/.test(text) ? "threat" : "assertion";
  const documentaryGround = tactic === "evidence" && state.worldFlags.some((flag) =>
    [/帳|借據/, /刀手|眼線|伏兵/, /貨|船|碼頭/, /藥|封口/].some((cue) => cue.test(text) && cue.test(flag)));
  return { target, goal, subject, tactic,
    quality: tactic === "assertion" || text.length < 16 ? "weak" : documentaryGround ? "grounded" : "coherent",
    method: text.slice(0, 100) };
}
