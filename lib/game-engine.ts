import { repeatedNpcLine } from "./npc-voices.ts";

export const LANDMARKS = [
  "明心閣總壇", "容姐茶檔", "泥濘市集", "聚財坊", "黑市武館", "仙館", "怡紅院",
] as const;

export type Landmark = typeof LANDMARKS[number];
export type QuestStep = "prologue_briefing" | "yung_tea_stall" | "market_collection" | "huizhi_ambush" | "sandbox";
export type Incident = "market_raid" | "missing_ledger" | "tainted_medicine";

export interface GameState {
  turn: number;
  playerName: string;
  background: string;
  trait: string;
  gender?: string;
  skill?: string;
  personality?: string;
  currentLocation: Landmark;
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
  questStep: QuestStep;
  flags: {
    tookHerbs: boolean;
    visitedYung: boolean;
    collectedMarketFee: boolean;
    marketAmbushTriggered: boolean;
    lastMarketDuesTurn?: number;
    pendingIncident?: Incident;
    incidentCount?: number;
    lastIncidentTurn?: number;
    lastSandboxTag?: string;
    repeatedActionCount?: number;
  };
}

export interface TurnResult {
  state: GameState;
  options: string[];
  event: string;
  moneyNote: string;
  npcReply?: { speaker: string; line: string };
}

const PROLOGUE_OPTIONS = [
  "A. [領命] 接下差事，帶藥去容姐茶檔。",
  "B. [反譏後領命] 冷言反譏何仔，仍帶藥上路。",
  "C. [問清後領命] 問清匯智樓動靜，再帶藥上路。",
  "D. [驗藥後領命] 查驗草藥成色，再帶藥上路。",
  "E. [默然領命] 觀察堂口退路，帶藥離開。",
];
const TEA_OPTIONS = [
  "A. [換藥] 交出草藥，收下金創散，趕往市集。",
  "B. [問刀手並換藥] 問清伏擊線索，換藥後趕往市集。",
  "C. [喝茶並換藥] 喝碗苦茶，換藥後趕往市集。",
  "D. [探路並換藥] 審視街面，換藥後趕往市集。",
  "E. [催藥] 催容姐配藥，收好後趕往市集。",
];
const MARKET_OPTIONS = [
  "A. [救人收規] 把金創散交給域卡度，逼張屠戶交出五十文。",
  "B. [按刀收規] 先逼張屠戶交錢，再把藥交給域卡度。",
  "C. [陰招收規] 撒泥嚇退屠戶，取規費並交藥。",
  "D. [戒備收規] 盯緊巷口，取規費並交藥。",
  "E. [同門收規] 與域卡度並肩逼索，交藥後取規費。",
];
const AMBUSH_OPTIONS = [
  "A. [迎敵突圍] 護住域卡度，擋開刀手突圍。",
  "B. [掀案突圍] 掀翻肉案阻敵，帶域卡度突圍。",
  "C. [結陣突圍] 與域卡度背靠背，尋隙突圍。",
  "D. [借勢突圍] 踩柱登簷，牽制刀手後突圍。",
  "E. [側翼突圍] 低身擊敵下盤，帶域卡度突圍。",
];
const SOLO_AMBUSH_OPTIONS = [
  "A. [迎敵突圍] 獨自擋開刀手突圍。",
  "B. [掀案突圍] 掀翻肉案阻敵，趁亂突圍。",
  "C. [守巷突圍] 靠住牆角，尋隙突圍。",
  "D. [借勢突圍] 踩柱登簷，牽制刀手突圍。",
  "E. [側翼突圍] 低身擊敵下盤，衝開缺口。",
];
const SOLO_AMBUSH_FLAVOR = ["你獨自正面擋刀。", "你獨自掀翻肉案擋敵。", "你靠牆守住巷口。", "你踩柱登簷尋隙。", "你低身擊向刀手下盤。"];

const TUTORIAL_FLAVOR: Record<Exclude<QuestStep, "sandbox">, string[]> = {
  prologue_briefing: ["你接過何仔差事。", "你冷言反譏，仍接下差事。", "你問清敵情，再接下差事。", "你驗過草藥，再接下差事。", "你記住堂口退路，接下差事。"],
  yung_tea_stall: ["你催容姐換藥。", "你先問刀手兵刃，再請容姐換藥。", "你喝過苦茶，再請容姐換藥。", "你探過街面，再請容姐換藥。", "你催緊容姐手腳，等藥配成。"],
  market_collection: ["你先救域卡度，再逼索規費。", "你按刀逼索，隨即交藥救人。", "你撒泥嚇退屠戶，取錢救人。", "你盯住巷口，邊戒備邊取錢救人。", "你與域卡度並肩逼索，交藥救人。"],
  huizhi_ambush: ["你護住域卡度，正面擋刀。", "你掀翻肉案擋住刀手。", "你與域卡度背靠背結陣。", "你踩柱登簷，尋隙突圍。", "你低身擊向刀手下盤。"],
};

const SANDBOX_OPTIONS: Record<Landmark, string[]> = {
  "明心閣總壇": ["A. [休整] 靜坐調息，回復氣血與內力。", "B. [固防] 撥二十文公款修補堂口防線。", "C. [盤點] 清點堂口帳目。", "D. [問何仔] 問何仔近日匯智樓動靜。", "E. [巡視] 巡視總壇守備。"],
  "容姐茶檔": ["A. [買藥] 花十文私銀買金創散並敷藥。", "B. [打探] 問容姐城西傳聞。", "C. [喝茶] 喝茶歇腳。", "D. [辨藥] 請容姐辨認草藥。", "E. [看街] 留意茶檔外動靜。"],
  "泥濘市集": ["A. [巡街收規] 催收十文規費，記入公款。", "B. [問價] 打聽市集藥價。", "C. [找域卡度] 問域卡度傷勢。", "D. [盯梢] 留意匯智樓眼線。", "E. [歇腳] 在肉檔旁歇腳。"],
  "聚財坊": ["A. [押小] 押十文私銀賭一局。", "B. [看盤] 觀察骰盤。", "C. [問奇仕] 問奇仕堂口欠帳。", "D. [查老千] 留意賭客手法。", "E. [離桌] 離開賭桌。"],
  "黑市武館": ["A. [打黑拳] 挨一場黑拳，賺二十文私銀。", "B. [練拳] 向衛林請教拳腳。", "C. [觀擂] 觀察擂台對手。", "D. [問阿黃] 問阿黃拳館近況。", "E. [歇息] 在拳館歇腳。"],
  "仙館": ["A. [問藥] 打聽止血藥價。", "B. [看人] 觀察館內客人。", "C. [問佚名] 問佚名黑市傳聞。", "D. [拒藥] 拒絕來路不明的丹藥。", "E. [離席] 離開藥桌。"],
  "怡紅院": ["A. [問玉樺] 問玉樺城西消息。", "B. [聽曲] 聽一曲，稍作調息。", "C. [查客] 留意陌生客人。", "D. [問路] 問清附近暗巷。", "E. [離席] 離開席位。"],
};

const INCIDENTS: Incident[] = ["market_raid", "missing_ledger", "tainted_medicine"];
const INCIDENT_OPTIONS: Record<Incident, string[]> = {
  market_raid: [
    "A. [護住攤販] 召集街坊，擋住匯智樓插旗。",
    "B. [暗巷截路] 繞到刀手後方，斷其退路。",
    "C. [設局取證] 記下刀手勒索攤販的證詞。",
    "D. [付錢息事] 撥二十文公款安頓攤販。",
    "E. [撤守保人] 先護傷者撤到明心閣。",
  ],
  missing_ledger: [
    "A. [查賭檔] 到聚財坊核對缺失的規費帳。",
    "B. [問容姐] 問容姐誰曾帶走帳簿。",
    "C. [追腳印] 沿市集泥印追查偷帳的人。",
    "D. [補帳] 撥十文公款填補眼前缺口。",
    "E. [告知何仔] 把帳目破綻交給何仔處置。",
  ],
  tainted_medicine: [
    "A. [封存藥包] 封住來歷不明的傷藥。",
    "B. [請佚名驗藥] 帶藥去仙館查驗。",
    "C. [追查送藥人] 查問茶檔附近的送藥腳夫。",
    "D. [救治傷者] 花十文私銀替傷者換乾淨藥。",
    "E. [公開警訊] 告訴七處據點暫停用這批藥。",
  ],
};

const INCIDENT_REPORTS: Record<Incident, string> = {
  market_raid: "你收到市集急報：匯智樓刀手在肉檔插旗，攤販被逼交兩份規費。此刻須決定如何保住城西的人。",
  missing_ledger: "你見堂口規費帳少了一頁，聚財坊與市集的數目對不上。何仔限你先查清帳，再碰公款。",
  tainted_medicine: "你見茶檔送來的傷藥封口被換過，已有傷者用了藥。城西七處據點都等你拿主意。",
};

type Reaction = { event: string; line: string; speaker?: string };
const SANDBOX_REACTIONS: Record<Landmark, Record<string, Reaction>> = {
  "明心閣總壇": {
    "休整": { event: "", line: "坐吧。等你喘勻了，這道門還得有人替我守。" },
    "固防": { event: "", line: "先記帳，後補牆。少一文，我替你挨罵？" },
    "盤點": { event: "你翻開堂口帳簿，逐筆核對公款，沒有漏下一文。", line: "帳你看，我去擋人。可別讓我白擋。" },
    "問何仔": { event: "你問何仔匯智樓近況，聽見城西幾處路口都添了眼線。", line: "路口多了眼線。我這張老臉擋得住一時，你得找條路。" },
    "巡視": { event: "你巡過總壇門口與後巷，記住兩處鬆動的門閂。", line: "門閂鬆了？記下。今晚我守前門，你看後巷。" },
  },
  "容姐茶檔": {
    "買藥": { event: "", line: "錢放桌上。藥敷厚點，別叫泥水鑽進傷口。" },
    "打探": { event: "你問容姐城西傳聞，聽見匯智樓又在街口認人。", line: "茶還沒涼，街口就有人認你的臉。走後巷。" },
    "喝茶": { event: "你端起苦茶，熱氣壓住喉頭的乾澀。", line: "慢點喝，燙。喝完從側巷走。" },
    "辨藥": { event: "你攤開藥包，請容姐辨過草藥氣味與碎屑。", line: "這味能止血。先聞清楚，別拿錯包。" },
    "看街": { event: "你從茶檔望向街口，記下兩條能退回市集的窄巷，也察覺對面有人盯著你。", line: "碗擋著臉。對面那人盯你半天了。" },
  },
  "泥濘市集": {
    "巡街收規": { event: "", line: "錢你收，我看著後頭。別說我沒出力。" },
    "問價": { event: "你問過兩家藥攤，聽見同一味傷藥報出兩個價。", line: "急著買，價就由人開。" },
    "找域卡度": { event: "你問域卡度肋下刀傷。你見他按住舊布條，呼吸仍穩，刀口卻未合。", line: "小傷，走得動。你先看巷口，別讓人抄後路。" },
    "盯梢": { event: "你退到肉檔陰影，盯住巷口來往的灰衣人。", line: "那兩個人走得太齊。我往左，你替我看右邊。", speaker: "域卡度" },
    "歇腳": { event: "你靠著肉檔外牆歇腳，耳朵仍朝巷口張著。", line: "要歇去別處，別擋我肉檔生意。", speaker: "張屠戶" },
    "查眼線": { event: "你沿肉檔外圍查眼線，發現有人見你便轉入窄巷。", line: "還敢在我攤前晃？那筆帳我記著。", speaker: "張屠戶" },
  },
  "聚財坊": {
    "押小": { event: "", line: "十文押下去，輸贏記你名下。別找帳房哭。" },
    "看盤": { event: "你盯住骰盅落桌，記下莊家左手收回時的停頓。", line: "看見他左手沒有？那一下值十文。" },
    "問奇仕": { event: "你問奇仕堂口欠帳，聽見他只肯談帳面，不肯報人名。", line: "欠帳兩頁，嘴倒是乾淨。名字自己去問。" },
    "查老千": { event: "你盯住桌邊換籌碼的手，見有人袖口藏得太緊。", line: "盯袖口。抓到手，這桌輸的才算得清。" },
    "離桌": { event: "你離開賭桌，先把自己的錢袋按緊。", line: "肯起身，算你還會算帳。" },
  },
  "黑市武館": {
    "打黑拳": { event: "", line: "傷口自己按住。錢拿走。" },
    "練拳": { event: "你照衛林指點收緊肘線，連打三記短拳。", line: "肘收回來。護肋。" },
    "觀擂": { event: "你看完一場擂台，記下對手換步時露出的空門。", line: "空門在左肋。打得到再說。" },
    "問阿黃": { event: "你問阿黃拳館近況，聽見近來上擂的人多，能走下來的少。", line: "今早抬走一個。誰下的手？我正找他。", speaker: "阿黃" },
    "歇息": { event: "你在武館角落歇息，聽見擂台上拳肉相撞。", line: "歇夠，起身。" },
  },
  "仙館": {
    "問藥": { event: "你問止血藥價，先看清封口，再掂藥包分量。", line: "價寫著。先看封口，再看自己的傷。" },
    "看人": { event: "你掃過館內客人，見有人只看藥，不肯露手。", line: "手藏著的人，未必是怕冷。" },
    "問佚名": { event: "你問佚名黑市傳聞，聽見近來有人暗收傷藥。", line: "有人收傷藥。死人多了，價自然漲。" },
    "拒藥": { event: "你推開來歷不明的丹藥，沒有讓藥粉沾手。", line: "不吃也好。這包連我都不聞。" },
    "離席": { event: "你離開藥桌，把袖口收緊，沒碰旁邊的藥瓶。", line: "旁邊那瓶，別碰。" },
  },
  "怡紅院": {
    "問玉樺": { event: "你問玉樺城西消息，聽見有人在樓裏打聽明心閣，連茶都沒碰。", line: "那客人問明心閣，卻連茶都沒碰。你猜他等誰？" },
    "聽曲": { event: "你聽完一曲，指尖仍按著錢袋。", line: "曲聽完了。你的手還按著錢袋呢。" },
    "查客": { event: "你留意席間陌生客，記下兩人同時望向門口，腳尖卻朝後巷。", line: "兩個人都看門，腳尖卻朝後巷。" },
    "問路": { event: "你問清附近暗巷的出口，記住轉角那道窄門。", line: "側門借你走。別把尾巴也帶進來。" },
    "離席": { event: "你起身離席，從側門繞開樓前人群。", line: "慢走。既然選了側門，就別回頭看正門。" },
  },
};

const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;

export function aptitude(name: string, background: string, trait: string) {
  const text = `${name} ${background} ${trait}`;
  const variation = Array.from(name).reduce((sum, char) => sum + (char.codePointAt(0) || 0), 0) % 5 - 2;
  if (/醫|毒|藥|術|病/.test(text)) return { hp: 80 + variation, mp: 75 - variation };
  if (/扒|偷|摸鎖|開鎖|身法|靈巧|眼快|輕功/.test(text)) return { hp: 90 + variation, mp: 60 - variation };
  if (/刀|劍|棍|武|拳|皮厚|命硬|神力|壯/.test(text)) return { hp: 125 + variation, mp: 30 - variation };
  return { hp: 100 + variation, mp: 50 - variation };
}

function openingPortrait(background: string, trait: string) {
  if (background === "爛賭收數佬") return "你進明心閣，指腹骰繭未退。";
  if (background === "城西街童扒手") return "你進明心閣，眼先掃過退路。";
  if (background === "濕鳩武館棄徒") return "你進明心閣，肩上舊傷扯著步子。";
  if (background === "黑市醫道學徒") return "你進明心閣，指縫藥色未褪。";
  if (/醫|毒|藥/.test(trait)) return "你進明心閣，指縫藥色未褪。";
  if (/偷|巧|快|扒/.test(trait)) return "你進明心閣，眼先掃過退路。";
  if (/拳|壯|狠|勇/.test(trait)) return "你進明心閣，拳骨上的繭還硬。";
  if (/見風|察言|口才|機靈/.test(trait)) return "你進明心閣，先看何仔的臉色。";
  return "你進明心閣，鞋底帶著城西泥。";
}

function openingAssessment(background: string, trait: string) {
  if (background === "爛賭收數佬") return "你會收數，也會救人麼";
  if (background === "城西街童扒手") return "你腳快，別只顧逃命";
  if (background === "濕鳩武館棄徒") return "你骨頭硬，別只護自己";
  if (background === "黑市醫道學徒") return "你認得藥，別讓我收屍";
  if (/醫|毒|藥/.test(trait)) return "你認得藥，別讓我收屍";
  if (/偷|巧|快|扒/.test(trait)) return "你腳快，別只顧逃命";
  if (/拳|壯|狠|勇/.test(trait)) return "你骨頭硬，別只護自己";
  if (/見風|察言|口才|機靈/.test(trait)) return "你會看人臉色，今日看人命";
  return "你腳下站得穩，別叫我失望";
}

function customOpeningAssessment(state: GameState, address: string): string {
  const gender = state.gender || "不願透露";
  const skill = state.skill || state.trait;
  const personality = state.personality || "寡言";
  const genderPhrase = /不願|保密|未定|未知/.test(gender) ? "性別你不願多說" : `你是${gender}`;
  const challenge = /心軟|善良|重情|仁慈/.test(personality) ? "救人歸救人，帳也得收齊。"
    : /衝動|暴躁|急性|莽撞/.test(personality) ? "火氣收住，先把人救回來。"
    : /多疑|謹慎|膽小|怕事/.test(personality) ? "看清退路，別忘了先救人。"
    : /冷酷|無情|冷漠|狠/.test(personality) ? "下得了狠手，也別把同門丟下。"
    : "我看你做事有沒有分寸。";
  return `${address}，${genderPhrase}，靠${skill}吃飯，性子${personality}。${challenge}去容姐換藥救域卡度，再收張屠戶五十文。`;
}

export function normalizeState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<GameState>;
  if (typeof value.playerName !== "string" || typeof value.background !== "string" || typeof value.trait !== "string") return null;
  const steps: QuestStep[] = ["prologue_briefing", "yung_tea_stall", "market_collection", "huizhi_ambush", "sandbox"];
  if (!steps.includes(value.questStep as QuestStep)) return null;
  const stats = aptitude(value.playerName, value.background, value.trait);
  const maxHp = finite(value.maxHp, stats.hp, 1, 170);
  const maxMp = finite(value.maxMp, stats.mp, 1, 170);
  const flags = value.flags || { tookHerbs: false, visitedYung: false, collectedMarketFee: false, marketAmbushTriggered: false };
  const pendingIncident = INCIDENTS.includes(flags.pendingIncident as Incident) ? flags.pendingIncident as Incident : undefined;
  return {
    turn: finite(value.turn, 1, 1, 100000),
    playerName: value.playerName.slice(0, 30), background: value.background.slice(0, 60), trait: value.trait.slice(0, 60),
    gender: typeof value.gender === "string" ? value.gender.replace(/[\r\n「」]/g, "").trim().slice(0, 8) : undefined,
    skill: typeof value.skill === "string" ? value.skill.replace(/[\r\n「」]/g, "").trim().slice(0, 12) : undefined,
    personality: typeof value.personality === "string" ? value.personality.replace(/[\r\n「」]/g, "").trim().slice(0, 12) : undefined,
    currentLocation: LANDMARKS.includes(value.currentLocation as Landmark) ? value.currentLocation as Landmark : "明心閣總壇",
    inventory: Array.isArray(value.inventory) ? value.inventory.filter((item): item is string => typeof item === "string").slice(0, 4).map((item) => item.slice(0, 30)) : [],
    maxInventory: 4,
    playerHp: finite(value.playerHp, maxHp, 0, maxHp), maxHp,
    playerMp: finite(value.playerMp, maxMp, 0, maxMp), maxMp,
    silver: finite(value.silver, 0, 0, Number.MAX_SAFE_INTEGER - 1000), factionFunds: finite(value.factionFunds, 10, 0, Number.MAX_SAFE_INTEGER - 1000),
    hozaiDefense: finite(value.hozaiDefense, 60, 0, 100),
    worldFlags: Array.isArray(value.worldFlags) ? value.worldFlags.filter((flag): flag is string => typeof flag === "string").slice(0, 30).map((flag) => flag.slice(0, 20)) : [],
    questStep: value.questStep as QuestStep,
    flags: {
      tookHerbs: flags.tookHerbs === true, visitedYung: flags.visitedYung === true,
      collectedMarketFee: flags.collectedMarketFee === true, marketAmbushTriggered: flags.marketAmbushTriggered === true,
      lastMarketDuesTurn: finite(flags.lastMarketDuesTurn, 0, 0, 100000),
      pendingIncident,
      incidentCount: finite(flags.incidentCount, 0, 0, 100000),
      lastIncidentTurn: finite(flags.lastIncidentTurn, 0, 0, 100000),
      lastSandboxTag: typeof flags.lastSandboxTag === "string" ? flags.lastSandboxTag.slice(0, 40) : undefined,
      repeatedActionCount: finite(flags.repeatedActionCount, 0, 0, 100000),
    },
  };
}

function remember(state: GameState, flag: string) {
  if (!state.worldFlags.includes(flag)) state.worldFlags.push(flag);
}

function customAction(action: string) { return action.startsWith("F. [自訂手段]"); }

function resolveIncident(state: GameState, incident: Incident, choice: number): { event: string; reply: TurnResult["npcReply"] } {
  const index = choice >= 0 ? choice : 4;
  const lead = `你處置${incident === "market_raid" ? "市集插旗" : incident === "missing_ledger" ? "失蹤帳頁" : "可疑傷藥"}。`;
  let event = "";
  let reply: TurnResult["npcReply"];
  if (incident === "market_raid") {
    if (index === 0) { state.playerHp = Math.max(0, state.playerHp - 6); state.hozaiDefense = Math.min(100, state.hozaiDefense + 8); event = "你擋在攤販前挨了一刀，氣血減六；街坊守住肉檔，何仔防線升八。"; }
    if (index === 1) { state.playerMp = Math.max(0, state.playerMp - 5); state.hozaiDefense = Math.min(100, state.hozaiDefense + 6); event = "你從暗巷截住刀手退路，內力減五；對方拔旗撤走，何仔防線升六。"; }
    if (index === 2) { state.hozaiDefense = Math.min(100, state.hozaiDefense + 4); event = "你記下三名攤販的證詞，逼刀手收旗，何仔防線升四。"; }
    if (index === 3) { if (state.factionFunds >= 20) { state.factionFunds -= 20; state.hozaiDefense = Math.min(100, state.hozaiDefense + 3); event = "你撥二十文公款安頓攤販，刀手暫退，何仔防線升三。"; } else event = "公款不足二十文，你只能護攤販退入窄巷，刀手仍在肉檔。"; }
    if (index === 4) event = "你先護傷者撤走，肉檔失去半日生意，刀手把旗插在路口。";
    remember(state, index === 4 ? "市集暫失" : "市集守住");
    reply = { speaker: "域卡度", line: index === 4 ? "人先撤了。我記著那面旗，遲早拔回來。" : "肉檔先守住了。我去看巷口，你別再替我挨刀。" };
  } else if (incident === "missing_ledger") {
    if (index === 0) { state.currentLocation = "聚財坊"; event = "你到聚財坊對帳，查出缺頁記著一筆假規費，奇仕把原本鎖起來。"; }
    if (index === 1) { state.currentLocation = "容姐茶檔"; event = "你問容姐，得知一個灰衣客昨夜沒喝茶，從總壇帶走帳頁。"; }
    if (index === 2) { state.currentLocation = "泥濘市集"; state.playerMp = Math.max(0, state.playerMp - 4); event = "你沿泥印追到市集後巷，找回濕透的帳頁，內力減四。"; }
    if (index === 3) { if (state.factionFunds >= 10) { state.factionFunds -= 10; event = "你撥十文公款補帳，何仔看出缺頁仍在，叫你把支出記明。"; } else event = "公款不足十文，缺帳未補，你把破綻先記在紙上。"; }
    if (index === 4) event = "你把缺頁之事告知何仔；他封住帳櫃，派人逐筆重查。";
    remember(state, "規費帳失頁已查");
    reply = index === 0
      ? { speaker: "奇仕", line: "假規費寫得真工整。可惜少算了一筆。" }
      : index === 1
        ? { speaker: "容姐", line: "灰衣客沒喝茶，手倒一直按著袖口。" }
        : { speaker: "何仔", line: index === 3 ? "十文我記下了。缺的那頁，還得替我找。" : "帳先收好。你查到哪一步，我替你擋到哪一步。" };
  } else {
    if (index === 0) event = "你封存可疑藥包，茶檔暫停出藥，傷者改用乾淨布條止血。";
    if (index === 1) { state.currentLocation = "仙館"; event = "你把藥帶到仙館，佚名驗出封口混了苦麻粉，寫下辨認記號。"; }
    if (index === 2) { state.currentLocation = "容姐茶檔"; event = "你追問送藥腳夫，查到他在茶檔外替灰衣客轉過手。"; }
    if (index === 3) { if (state.silver >= 10) { state.silver -= 10; state.playerHp = Math.min(state.maxHp, state.playerHp + 5); event = "你花十文私銀買乾淨傷藥救人，餘藥敷在自己傷口，氣血回復五。"; } else event = "你拿不出十文私銀，便用乾淨布條替傷者止血。"; }
    if (index === 4) event = "你派人告知城西七處據點停用這批藥，藥包逐一收回封存。";
    remember(state, "可疑傷藥已處置");
    reply = index === 1
      ? { speaker: "佚名", line: "苦麻粉。藥還沒入口，人先被它放倒。" }
      : { speaker: "容姐", line: "封口換過。往後收藥，先讓我看繩結。" };
  }
  state.flags.pendingIncident = undefined;
  return { event: lead + event, reply };
}

export function resolveTurn(rawState: GameState, action: string, opening: boolean): TurnResult {
  const state: GameState = { ...rawState, flags: { ...rawState.flags }, inventory: [...rawState.inventory], worldFlags: [...rawState.worldFlags] };
  const oldSilver = state.silver;
  const oldFunds = state.factionFunds;
  let event = "";
  let npcReply: TurnResult["npcReply"];
  const absurd = customAction(action) && /槍械|手槍|步槍|機關槍|超人|神仙|飛天|激光|雷射|核彈|手機|電腦|修仙|法術/.test(action);
  const choice = /^[A-E]\./.test(action) ? action.charCodeAt(0) - 65 : -1;
  const flavor = (step: Exclude<QuestStep, "sandbox">) => choice >= 0 ? TUTORIAL_FLAVOR[step][choice] : "你自定手段，仍把眼前差事辦下去。";
  if (!opening) state.turn += 1;
  if (absurd) {
    state.playerHp = Math.max(0, state.playerHp - 15);
    event = "你被劣質丹藥幻覺誤導，當場出醜，氣血減十五。";
  }

  if (state.questStep === "prologue_briefing") {
    state.currentLocation = "明心閣總壇";
    if (opening) {
      const stats = aptitude(state.playerName, state.background, state.trait);
      state.maxHp = stats.hp; state.playerHp = stats.hp;
      state.maxMp = stats.mp; state.playerMp = stats.mp;
      const cleanName = state.playerName.replace(/[「」\r\n]/g, "").trim();
      const address = cleanName && Array.from(cleanName).length <= 8 ? cleanName : "小子";
      const customProfile = state.background === "自定義市井流民" && Boolean(state.gender && state.skill && state.personality);
      event = customProfile
        ? "你踩過城西泥巷。茶檔傳來搗藥聲；何仔把藥包推到你面前。"
        : `你踩過城西泥巷。你聽茶檔搗藥、肉檔拍案討數。${openingPortrait(state.background, state.trait)}你見何仔推來藥包。`;
      npcReply = {
        speaker: "何仔",
        line: customProfile
          ? customOpeningAssessment(state, address)
          : `${address}，${openingAssessment(state.background, state.trait)}。域卡度是自家人，挨了匯智樓一刀。去容姐茶檔換金創散。救他；再收張屠戶五十文。`,
      };
    } else {
      event += flavor("prologue_briefing");
      state.questStep = "yung_tea_stall";
      state.currentLocation = "容姐茶檔";
      if (!state.inventory.includes("【生草藥包】")) state.inventory.push("【生草藥包】");
      state.flags.tookHerbs = true;
      event += "你帶著生草藥到容姐茶檔，向容姐出示藥包。你聽容姐警告，匯智樓刀手在市集附近出沒。";
    }
  } else if (state.questStep === "yung_tea_stall") {
    event += flavor("yung_tea_stall");
    state.questStep = "market_collection";
    state.currentLocation = "泥濘市集";
    const herb = state.inventory.indexOf("【生草藥包】");
    if (herb >= 0) state.inventory.splice(herb, 1);
    if (!state.inventory.includes("【金創散】")) state.inventory.push("【金創散】");
    state.flags.visitedYung = true;
    event += "你把草藥交給容姐，收下金創散與伏擊警訊，趕到市集肉檔。你見域卡度仍帶傷，張屠戶卻拒交規費。";
  } else if (state.questStep === "market_collection") {
    event += flavor("market_collection");
    state.questStep = "huizhi_ambush";
    state.currentLocation = "泥濘市集";
    const betrayed = customAction(action) && /背叛|出賣域卡度|不救域卡度/.test(action);
    const maimed = customAction(action) && /打斷張屠戶|致殘張屠戶|廢了張屠戶/.test(action);
    if (betrayed) {
      remember(state, "出賣域卡度");
      state.hozaiDefense = Math.max(0, state.hozaiDefense - 15);
      event += "你扣下金創散，任域卡度帶傷獨自留在肉檔。";
    } else {
      const medicine = state.inventory.indexOf("【金創散】");
      if (medicine >= 0) state.inventory.splice(medicine, 1);
      remember(state, "救下域卡度");
    }
    if (maimed) {
      remember(state, "打斷張屠戶右手");
      event += "你打斷張屠戶右手，肉檔眾人看在眼裡。";
    }
    state.flags.collectedMarketFee = true;
    state.flags.marketAmbushTriggered = true;
    if (customAction(action) && /私吞|昧起|袋起|自己收/.test(action)) {
      state.silver += 50;
      remember(state, "私吞五十文規費");
      state.hozaiDefense = Math.max(0, state.hozaiDefense - 10);
      event += `${betrayed ? "你逼" : "你交藥救人，又逼"}得張屠戶交出五十文，卻私吞入袋。你聽張屠戶吹響呼哨，匯智樓刀手隨即伏擊。`;
    } else {
      state.factionFunds += 50;
      event += `${betrayed ? "你逼" : "你交藥救人，又逼"}得張屠戶交出五十文規費，當場記入明心閣公款。你聽張屠戶吹響呼哨，匯智樓刀手隨即伏擊。`;
    }
  } else if (state.questStep === "huizhi_ambush") {
    event += state.worldFlags.includes("出賣域卡度") && choice >= 0 ? SOLO_AMBUSH_FLAVOR[choice] : flavor("huizhi_ambush");
    state.questStep = "sandbox";
    state.currentLocation = "泥濘市集";
    state.playerHp = Math.max(0, state.playerHp - 8);
    state.playerMp = Math.max(0, state.playerMp - 5);
    remember(state, "市集伏擊突圍");
    event += state.worldFlags.includes("出賣域卡度")
      ? "你獨自避開刀手，突圍留在城西市集。你氣血減八，內力減五。你如今可探索城西七處據點。"
      : "你與域卡度擊退匯智樓刀手，突圍留在城西市集。你氣血減八，內力減五。你如今可探索城西七處據點。";
  } else {
    const pendingIncident = state.flags.pendingIncident;
    if (pendingIncident) {
      const resolved = resolveIncident(state, pendingIncident, choice);
      event += resolved.event;
      npcReply = resolved.reply;
    } else {
    const travel = /^F\. \[前往\] (.+)$/.exec(action);
    const movement = customAction(action) && /前往|走去|走到|抵達|潛入|闖入|進入/.test(action);
    const destination = travel?.[1] || (movement ? LANDMARKS.find((place) => action.includes(place)) : undefined);
    if (destination && LANDMARKS.includes(destination as Landmark)) {
      state.currentLocation = destination as Landmark;
      event += `你沿城西街巷抵達${destination}。`;
      if (destination === "泥濘市集" && state.worldFlags.includes("打斷張屠戶右手") && !state.worldFlags.includes("屠戶避讓")) {
        remember(state, "屠戶避讓");
        event += "你見張屠戶避開目光，肉檔再沒人敢當面頂撞。";
      }
    } else if (destination || (movement && /城東|城南|城北|城中|外城|匯智樓總壇|官府/.test(action))) {
      event += "你走到城西邊界，見外頭有人把守，便折返原地。";
    } else {
      const tag = /^\w\. \[([^\]]+)\]/.exec(action)?.[1] || "";
      const reaction = SANDBOX_REACTIONS[state.currentLocation][tag];
      const sandboxTag = `${state.currentLocation}:${tag}`;
      const repeatedAction = Boolean(reaction?.event) && state.flags.lastSandboxTag === sandboxTag;
      state.flags.repeatedActionCount = repeatedAction ? (state.flags.repeatedActionCount || 0) + 1 : 0;
      state.flags.lastSandboxTag = sandboxTag;
      if (reaction) npcReply = { speaker: reaction.speaker || ({
        "明心閣總壇": "何仔", "容姐茶檔": "容姐", "泥濘市集": "域卡度",
        "聚財坊": "奇仕", "黑市武館": "衛林", "仙館": "佚名", "怡紅院": "玉樺",
      } satisfies Record<Landmark, string>)[state.currentLocation], line: reaction.line };
      if (customAction(action) && /撒沙|撒泥|石灰|撩陰|掀桌|掀枱|逃跑|裝死/.test(action)) {
        const suited = /手疾|身法|靈巧|扒手|察言|皮糙|命硬/.test(state.trait);
        event += suited ? "你使出市井陰招，借自身所長甩開眼線。" : "你使出市井陰招，卻手慢半拍，只勉強保住退路。";
      } else if (state.currentLocation === "黑市武館" && tag === "打黑拳") {
        if (state.playerHp > 10) { state.playerHp -= 10; state.silver += 20; event += "你在黑市武館挨一場硬拳，氣血減十，收二十文私銀。"; }
        else event += "你傷得太重，衛林攔住你上擂台。";
      } else if (state.currentLocation === "容姐茶檔" && tag === "買藥") {
        if (state.silver >= 10) { state.silver -= 10; state.playerHp = Math.min(state.maxHp, state.playerHp + 25); event += "你付十文私銀買金創散敷傷，氣血回復二十五。"; }
        else event += "你掂了掂空錢袋，容姐搖頭，不肯賒藥。";
      } else if (state.currentLocation === "明心閣總壇" && tag === "固防") {
        if (state.factionFunds >= 20) { state.factionFunds -= 20; state.hozaiDefense = Math.min(100, state.hozaiDefense + 12); event += "你從明心閣公款撥二十文修補堂口，何仔防線升十二。"; }
        else event += "你清點公款，尚欠二十文，防線無法修補。";
      } else if (state.currentLocation === "明心閣總壇" && tag === "休整") {
        state.playerHp = Math.min(state.maxHp, state.playerHp + 12);
        state.playerMp = Math.min(state.maxMp, state.playerMp + 8);
        event += "你在總壇靜坐調息，氣血回復十二，內力回復八。";
      } else if (state.currentLocation === "泥濘市集" && tag === "巡街收規") {
        if (state.turn - (state.flags.lastMarketDuesTurn || 0) >= 3) {
          state.factionFunds += 10; state.flags.lastMarketDuesTurn = state.turn;
          event += "你巡街收得十文規費，當場記入明心閣公款。";
        } else event += "你巡了一圈，今日規費早已收過，無人再交錢。";
      } else if (state.currentLocation === "聚財坊" && tag === "押小") {
        if (state.silver >= 10) {
          const won = state.turn % 2 === 0;
          state.silver += won ? 10 : -10;
          event += won ? "你押十文私銀，骰子落小，贏回十文淨利。" : "你押十文私銀，骰子落大，輸掉十文。";
        } else event += "你掏不出十文私銀，奇仕不讓你下注。";
      } else if (repeatedAction) {
        event += `你再次查問${tag}，眼前沒有新的線索。`;
        if (npcReply) npcReply.line = repeatedNpcLine(npcReply.speaker, state.flags.repeatedActionCount || 1);
      } else event += reaction?.event || `你在${state.currentLocation}照自己的意思行事，留意四下動靜。`;
    }
    }
    state.hozaiDefense = Math.max(0, state.hozaiDefense - 2);
    event += "你感到匯智樓施壓，何仔防線減二。";
    if (state.currentLocation === "明心閣總壇" && state.worldFlags.includes("私吞五十文規費") && !state.worldFlags.includes("何仔查出私吞")) {
      state.hozaiDefense = Math.max(0, state.hozaiDefense - 8);
      remember(state, "何仔查出私吞");
      event += "你見何仔查出私吞規費，防線再減八。";
    }
    if (state.hozaiDefense === 0) {
      remember(state, "何仔防線崩潰");
      event += "你聽見何仔防線崩潰，堂口人心潰散。";
    }
    if (!pendingIncident && state.turn >= 8 && state.turn - (state.flags.lastIncidentTurn || 0) >= 5) {
      const incident = INCIDENTS[(state.flags.incidentCount || 0) % INCIDENTS.length];
      state.flags.pendingIncident = incident;
      state.flags.lastIncidentTurn = state.turn;
      state.flags.incidentCount = (state.flags.incidentCount || 0) + 1;
      event = INCIDENT_REPORTS[incident] + event;
      npcReply = incident === "missing_ledger"
        ? { speaker: "何仔", line: "少一頁帳，我替你擋不了多久。先查誰摸過。" }
        : incident === "tainted_medicine"
          ? { speaker: "容姐", line: "封口給人動過。快叫各處先別用藥。" }
          : { speaker: "域卡度", line: "刀手又來插旗。我守肉檔，你拿主意。" };
    }
  }

  const changes: string[] = [];
  if (state.silver !== oldSilver) changes.push(`私銀${state.silver > oldSilver ? "增加" : "減少"}${Math.abs(state.silver - oldSilver)}文`);
  if (state.factionFunds !== oldFunds) changes.push(`公款${state.factionFunds > oldFunds ? "增加" : "減少"}${Math.abs(state.factionFunds - oldFunds)}文`);
  const options = state.questStep === "prologue_briefing" ? PROLOGUE_OPTIONS
    : state.questStep === "yung_tea_stall" ? TEA_OPTIONS
    : state.questStep === "market_collection" ? MARKET_OPTIONS
    : state.questStep === "huizhi_ambush" ? (state.worldFlags.includes("出賣域卡度") ? SOLO_AMBUSH_OPTIONS : AMBUSH_OPTIONS)
    : state.flags.pendingIncident ? INCIDENT_OPTIONS[state.flags.pendingIncident]
    : state.currentLocation === "泥濘市集" && state.worldFlags.includes("出賣域卡度")
      ? SANDBOX_OPTIONS["泥濘市集"].map((option) => option.startsWith("C.") ? "C. [查眼線] 留意匯智樓眼線。" : option)
      : SANDBOX_OPTIONS[state.currentLocation];
  return { state, options, event: event.trim(), moneyNote: changes.join("，"), npcReply };
}
