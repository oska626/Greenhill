import { availableOptions, normalizeState, resolveTurn, type GameState, type TurnResult } from "./game-engine.ts";
import { advanceChapterSocialTurn, finishChapterTurn } from "./chapter-one.ts";
import { actionEnergyCost, canAffordEnergy, spendEnergy } from "./energy.ts";
import { socialTargets } from "./social-influence.ts";

const aliases: Record<string, RegExp> = {
  "何不歸": /何不歸|堂主/, "陸千帆": /陸千帆|千帆/, "張斷骨": /張斷骨|張屠戶|屠戶/,
  "顧忘生": /顧忘生|顧大夫/, "容晚秋": /容晚秋|容姑娘/,
};

const strangerReply: Record<string, string> = {
  "何不歸": "城西路口添咗眼線。係邊個派嚟嘅，仲未查清。",
  "容晚秋": "街口消息要十文。你想知邊個行過，先講價。",
  "張斷骨": "幾張生面孔成日盯住我個檔。你自己望吓巷口。",
  "陸千帆": "巷口有人盯梢，我睇住佢哋。來歷仲未查清。",
  "祁觀衡": "賭坊日日有生客。冇憑據，我唔會亂指邊個係眼線。",
  "衛沉岳": "上擂嘅生面口唔少。你要認邊個，指畀我睇。",
  "霍破陣": "近排上擂嘅人多。邊個有問題，我仲查緊。",
  "顧忘生": "館裏有客人只睇藥，隻手收得好實。佢來歷，我未問到。",
  "柳照霜": "有人喺樓裏打聽青鋒堂，連茶都冇掂。佢等邊個，仲未查清。",
  "船工": "碼頭日日有人上落。你講嗰個，我未認到。",
  "碼頭守衛": "有可疑人就指畀我睇。冇憑據，唔好亂扣帽。",
};

const ordinaryReply: Record<string, string> = {
  "何不歸": "講清楚你要查邊件。冇實據，堂口唔會亂落判斷。",
  "容晚秋": "我靠消息食飯。你講清楚想知邊條線，我先講價。",
  "張斷骨": "我只睇住眼前個檔。其他事，冇憑據我唔講。",
  "陸千帆": "眼前條街我仲睇得住。其他消息，未查清。",
  "祁觀衡": "帳面有數就拎帳嚟。人名，我唔會憑空講。",
  "衛沉岳": "先睇清眼前個人點出拳。其他事，我唔亂講。",
  "霍破陣": "你要問邊個，指清楚。冇見過嘅，我唔替佢作證。",
  "顧忘生": "我只講親眼見過嘅。未驗過嘅藥同消息，一樣唔亂開口。",
  "柳照霜": "樓裏人多，傳言更多。冇親眼見到嘅，我唔講實。",
  "船工": "我只知眼前呢批貨。你問嗰樣，仲要查。",
  "碼頭守衛": "貨單寫得清先講。其他事，我唔亂認。",
};

function isInformationQuestion(text: string): boolean {
  const utterance = text.trim().replace(/^[「『“"']|[」』”"']$/g, "");
  if (!utterance || /^(?:如果|假如|假設|若果)/.test(utterance)
    || /(?:唔|不|冇|無|沒有|毋)(?:會|要|想)?問/.test(utterance)
    || /[，,；;。？?」』”]\s*(?:我|就|即刻|順手|跟住|再|然後|之後)?\s*(?:攞|拿|偷|打|攻|扯|踢|推|敷|買|付|交|走|去)/.test(utterance)
    || /並(?:且)?\s*(?:攞|拿|偷|打|攻|扯|踢|推|敷|買|付|交|走|去)/.test(utterance)
    || /(?:可唔可以|可否|能否|肯唔肯|願唔願)[^，。？?]{0,16}(?:幫|借|攞|拿|給|畀|帶|送|出手)/.test(utterance)
    || /(?:問|請|向|同)[^，。？?]{0,12}(?:借我|畀我|給我|幫我|帶我)/.test(utterance)
    || /(?:借|攞|拿|買)[^，。？?]{0,12}(?:得唔得|得不得)/.test(utterance)) return false;
  return /(?:[？?]|問|打聽|請教|想知|查問)/.test(utterance)
    && /(?:有冇|有無|有沒有|見過|見到|知唔知|知道|聽過|聽聞|邊|誰|乜|咩|點|消息|傳聞|動靜|近況|近排|最近|近日|出沒|問|打聽)/.test(utterance)
    && /(?:生面|陌生|可疑|眼線|玄武樓|刀手|街口|黑市|傷藥|堂口|帳|拳館|擂台|城西|青鋒堂|巷口|客人|消息|傳聞|動靜|近況|貨|碼頭|藥|路|兵刃|武器)/.test(utterance);
}

function sandboxOption(state: GameState, target: string, question: string): string | undefined {
  const tag = target === "何不歸" && /玄武樓|眼線|街口動靜/.test(question) ? "問堂主"
    : target === "祁觀衡" && /欠帳|堂口帳/.test(question) ? "問祁觀衡"
      : target === "霍破陣" && /拳館|上擂|擂台近況/.test(question) ? "問霍破陣"
        : target === "顧忘生" && /黑市|傳聞|暗收傷藥/.test(question) ? "問顧忘生"
          : target === "柳照霜" && /城西消息|青鋒堂消息/.test(question) ? "問柳照霜" : undefined;
  return tag ? availableOptions(state).find((option) => option.includes(`[${tag}]`)) : undefined;
}

function knownReply(target: string, question: string): string | undefined {
  if (target === "何不歸" && /玄武樓|街口|眼線/.test(question))
    return "城西幾處路口添咗眼線。邊條線係玄武樓派嚟嘅，仲要查。";
  if (target === "祁觀衡" && /欠帳|堂口帳/.test(question))
    return "欠帳有兩頁。人名未核清，我唔會亂報。";
  if (target === "霍破陣" && /拳館|上擂|擂台/.test(question))
    return "近排上擂嘅人多，走得落嚟嘅少。邊個下重手，我仲查緊。";
  if (target === "顧忘生" && /黑市|傳聞|暗收傷藥/.test(question))
    return "有人暗中收傷藥。傷者一多，價就由佢哋開。";
  if (target === "柳照霜" && /城西|青鋒堂|樓裏客人/.test(question))
    return "有人喺樓裏打聽青鋒堂，連茶都冇掂。佢等邊個，仲未查清。";
  return undefined;
}

export function resolveLocalInquiry(rawState: GameState, playerText: string): TurnResult | null {
  const state = normalizeState(rawState);
  const clinicMedicineRequest = state?.currentLocation === "苦煙館"
    && (state.questStep === "sandbox" || state.questStep === "kuyan_medicine")
    && /(?:可唔可以|可不可以|能否|得唔得|請|問)/.test(playerText)
    && /(?:借|畀我|給我)[^，。？?]{0,10}(?:藥|止血膏藥|療傷藥)/.test(playerText);
  if (!state || !(isInformationQuestion(playerText) || clinicMedicineRequest)
    || /城主|燕鎮嶽|官府/.test(playerText)
    || state.combat || state.pendingEncounter
    || state.flags.pendingIncident || state.flags.alleyEscape || state.flags.marketAftermath
    || state.questStep !== "chapter_one" && (state.flags.finalCrisis || state.flags.ending)
    || state.flags.chapterOne?.stage === "complete" || state.flags.chapterOne?.stage === "failed") return null;
  const present = socialTargets(state);
  const named = present.filter((name) => (aliases[name] || new RegExp(name)).test(playerText));
  const candidates = named.length ? named : present;
  if (candidates.length > 1) return { state, options: availableOptions(state), moneyNote: "",
    event: `眼前有${candidates.join("、")}。你這一問若不點名，幾張嘴怕要同時開鑼；想問哪一位？` };
  const target = candidates[0];
  if (!target) return null;
  // Blackmud has a separate dialogue resolver with combat and street-pressure rules.
  if (state.currentLocation === "黑泥街" && state.questStep !== "chapter_one") return null;
  const preset = state.questStep === "sandbox" ? sandboxOption(state, target, playerText) : undefined;
  if (preset) {
    const turn = resolveTurn(state, preset, false);
    const reply = knownReply(target, playerText);
    if (reply && socialTargets(turn.state).includes(target)) turn.npcReply = { speaker: target, line: reply };
    if (turn.state.history?.at(-1)?.turn === turn.state.turn)
      turn.state.history[turn.state.history.length - 1].action = `F. [自訂手段] ${playerText}`;
    return turn;
  }
  const tutorialKnife = state.questStep === "prologue_briefing" && target === "何不歸"
    && /刀手|短刀|兵刃|武器/.test(playerText);
  const teaKnife = state.questStep === "yung_tea_stall" && target === "容晚秋"
    && /刀手|灰線|生面口|生面孔/.test(playerText);
  const cost = tutorialKnife ? actionEnergyCost(state, "C. [問清敵情]")
    : teaKnife ? actionEnergyCost(state, "B. [追問刀手]")
      : state.playerMp <= 10 ? 2 : 1;
  if (!canAffordEnergy(state, cost)) return { state, options: availableOptions(state), moneyNote: "",
    event: "你氣力不足，先歇一歇再問。" };
  let pressure = "";
  if (state.questStep === "chapter_one") pressure = advanceChapterSocialTurn(state, cost);
  else {
    state.turn += 1;
    pressure = spendEnergy(state, cost);
    state.sectLifeline = Math.max(0, state.sectLifeline - 1);
  }
  if (tutorialKnife && !state.worldFlags.includes("問清刀手兵刃")) state.worldFlags.push("問清刀手兵刃");
  if (teaKnife && !state.worldFlags.includes("認清刀手裝束")) state.worldFlags.push("認清刀手裝束");
  const stranger = /生面口|生面孔|生面人|陌生|可疑|眼線|出沒/.test(playerText);
  const clinicMedicineQuestion = target === "顧忘生" && /有冇藥|藥價|止血膏藥|療傷藥/.test(playerText);
  const line = clinicMedicineRequest || clinicMedicineQuestion
    ? state.questStep === "kuyan_medicine"
      ? "止血膏藥備好咗。你先講清陸千帆傷口，封好藥包就拎走。"
      : "藥唔借。十文一包，買咗先攞。"
    : tutorialKnife ? "玄武樓啲刀手慣用短刀。見到佢哋，先睇手再埋身。"
    : teaKnife ? "有個刀手袖口繫灰線。見到佢，唔好當係普通茶客。"
      : knownReply(target, playerText) || (stranger ? strangerReply[target] : ordinaryReply[target]);
  const event = `你向${target}${clinicMedicineRequest ? "問能否借一包藥" : clinicMedicineQuestion ? "問起傷藥" : stranger ? "打聽近日可疑的人影" : "問起眼前的消息"}。${pressure}`;
  const result = { state, options: availableOptions(state), moneyNote: "",
    event, npcReply: { speaker: target, line } };
  return state.questStep === "chapter_one" ? { ...finishChapterTurn(state, event), npcReply: result.npcReply } : result;
}
