import { renameLegacyWorldNames, repeatedNpcLine } from "./npc-voices.ts";
import { combatOptions, createCombat, normalizeCombat, resolveCombatRound, trainMove, WEAPONS,
  type CombatState, type KnownMoves, type WeaponId } from "./combat-engine.ts";
import { ENDING_OPTIONS, MISSIONS, missionOptions, resolveEnding, resolveMission, travelChoices } from "./city-progression.ts";
import { COMPANION_IDS, applyMissionRelationship, changeTrust, companionLeads, newRelationships, normalizeRelationships,
  type CompanionId, type CompanionRelationships } from "./companion-relations.ts";
import { CREATIVE_GOALS, CUSTOM_ACTION_MAX, negatesIrreversibleAction, type CreativeAction } from "./custom-action.ts";
import { RAID_TARGETS, chapterOneOptions, resolveChapterOne, type Business, type ChapterOneState } from "./chapter-one.ts";
import { PACKED_MEDICINE, USE_PACKED_MEDICINE, canUsePackedMedicine, consumePackedMedicine, restoreVitals } from "./recovery.ts";
import { MAX_ENERGY, actionEnergyCost, availableWithEnergy, canAffordEnergy, spendEnergy } from "./energy.ts";
import { DARK_HAND_LIMIT, DARK_HAND_PRICE, STARTING_DARK_HAND, SCAVENGE_SOURCES, darkHandCount,
  darkHandPurchaseOptions, dirtyHandModifier, dirtyHandTier, dirtyHandVerb, isDarkHand, readyDarkHand, rollD20 } from "./dirty-hand.ts";
import { LANDMARK_SCENES, normalizeSceneState, openEntrance, revealEntrance, type SceneState } from "./scene-state.ts";

export const PROLOGUE_LANDMARKS = [
  "青鋒堂總壇", "晚秋茶寮", "黑泥街", "鬼骰坊", "裂石擂", "苦煙館", "夜雨樓",
] as const;
export const LANDMARKS = [...PROLOGUE_LANDMARKS, "碼頭"] as const;

export type Landmark = typeof LANDMARKS[number];
export type QuestStep = "prologue_briefing" | "kuyan_medicine" | "yung_tea_stall" | "market_collection" | "huizhi_ambush" | "sandbox" | "chapter_one";
export type Incident = "market_raid" | "missing_ledger" | "tainted_medicine";
type CustomEcho = CreativeAction & { location: Landmark; dueTurn: number };
export const CUSTOM_ACTION_START = CUSTOM_ACTION_MAX;
export const CUSTOM_ACTION_PRICE = 50;

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
  sceneState?: SceneState;
  maxInventory: number;
  playerHp: number;
  maxHp: number;
  playerMp: number;
  maxMp: number;
  silver: number;
  customActionUses: number;
  factionFunds: number;
  sectLifeline: number;
  worldFlags: string[];
  relationships: CompanionRelationships;
  equippedWeapon?: WeaponId;
  weaponDurability?: number;
  knownMoves?: KnownMoves;
  combat?: CombatState;
  questStep: QuestStep;
  flags: {
    tookHerbs: boolean;
    visitedYung: boolean;
    visitedGu?: boolean;
    collectedMarketFee: boolean;
    marketAmbushTriggered: boolean;
    lastMarketDuesTurn?: number;
    pendingIncident?: Incident;
    incidentCount?: number;
    lastIncidentTurn?: number;
    lastSandboxTag?: string;
    repeatedActionCount?: number;
    ending?: string;
    finalCrisis?: boolean;
    finalGuardLayers?: number;
    finalSupport?: number;
    prologueCompanionLeads?: CompanionId[];
    chapterOne?: ChapterOneState;
    treasuryChange?: { delta: number; reason: string; turn: number };
    checkpointReady?: boolean;
    midpointBriefed?: boolean;
    lastJobTurn?: number;
    loanDueTurn?: number;
    customEchoes?: CustomEcho[];
    darkHandInitialized?: boolean;
    alleyEscape?: boolean;
    alleyAllyPresent?: boolean;
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
  "A. [即刻領命] 不再耽擱，趕往苦煙館領膏藥；何不歸得以留下固防。",
  "B. [索取盤纏] 向堂主領十文路費；私銀增加，堂口公款減少。",
  "C. [問清敵情] 問出玄武樓刀手的兵刃與路線，再往苦煙館。",
  "D. [詳問傷勢] 問清陸千帆傷口情況，讓顧忘生對症配膏藥。",
  "E. [記住暗巷] 先認清往市集的退路，再往苦煙館。",
];
const GU_OPTIONS = [
  "A. [急取膏藥] 領取止血膏藥，趁刀手未到趕往市集。",
  "B. [追問刀手] 問顧忘生近日來買藥的灰線刀手，再帶膏藥去市集。",
  "C. [就地調息] 在苦煙館調勻氣息，帶膏藥再走。",
  "D. [辨認藥封] 請顧忘生教你辨別膏藥封口，再趕往市集。",
  "E. [託醫傳信] 請顧忘生遣人通知堂口接應，再帶膏藥出發。",
];
const TEA_OPTIONS = [
  "A. [急取傷藥] 請容晚秋先配藥，趁刀手未到趕往市集。",
  "B. [追問刀手] 問清刀手的裝束，換藥後趕往市集。",
  "C. [飲茶調息] 借一碗熱茶養足氣力，換藥後再走。",
  "D. [辨認傷藥] 請容晚秋教你辨別藥封，換藥後再走。",
  "E. [託人傳信] 請容晚秋通知堂口接應，換藥後趕往市集。",
];
const MARKET_OPTIONS = [
  "A. [先救同門] 先替陸千帆敷藥，再收足五十文規費。",
  "B. [先收規費] 先逼張斷骨交足五十文；陸千帆須再忍片刻。",
  "C. [暗查巷口] 先辨刀手去向，救人後只來得及收三十文。",
  "D. [容許緩交] 先救人，收二十文，准張斷骨餘下三十文日後補交。",
  "E. [護人撤離] 先帶陸千帆離開肉檔；五十文規費暫時收不到。",
];

function alleyOptions(state: GameState): string[] {
  const options = [
    "A. [硬闖街口] 迎刀撞開肉檔前的守位；可重奪路，但必定掛彩。",
    state.flags.alleyAllyPresent
      ? "B. [伏低護人] 自己挨刀拖住追兵，讓陸千帆先攀牆；渡過後機變回復一次。"
      : "B. [伏低保命] 伏在油泥裏挨過追兵搜巷，再伺機攀牆。",
    "C. [踢翻餿水桶] 借巷尾餿水桶阻住刀手，再踩竹籮攀牆；耗兩點精力。",
    "H. [踩籮翻牆] 踩廢竹籮直接翻牆；耗兩點精力，身上重物可能落下。",
  ];
  if (state.flags.alleyAllyPresent && !state.relationships["陸千帆"].wounded)
    options.splice(3, 0, "D. [交畀陸千帆] 讓陸千帆選攀牆時機；他能走動，卻會牽動舊傷。");
  const item = readyDarkHand(state.inventory, false);
  if (item && state.playerMp >= 1) options.push(`I. [袖藏暗手] ${dirtyHandVerb(item)}，趁亂攀牆；耗一件實物，失手會受刀。`);
  if (item && state.playerMp >= 2) options.push(`J. [全力陰手] ${dirtyHandVerb(item)}，趁亂攀牆；另耗一點精力，至少脫身。`);
  return availableWithEnergy(state, options);
}
const TUTORIAL_FLAVOR: Record<Exclude<QuestStep, "sandbox" | "huizhi_ambush" | "chapter_one">, string[]> = {
  prologue_briefing: ["你領命後立即動身。", "你向何不歸討路費，才動身往苦煙館。", "你問清刀手路線，記住他們慣用的兵刃。", "你記下陸千帆傷口的情況，準備向顧忘生交代。", "你認清通往市集的暗巷，再動身往苦煙館。"],
  kuyan_medicine: ["你請顧忘生先取膏藥，趕在刀手前動身。", "你問清灰線刀手的動靜，收好膏藥。", "你在苦煙館調勻氣息，才帶藥離開。", "你跟顧忘生認清封口，再收下膏藥。", "你託顧忘生遣人傳信，帶藥趕往市集。"],
  yung_tea_stall: ["你請容晚秋先配傷藥，趕在刀手前動身。", "你問清刀手裝束，請容晚秋換藥。", "你飲過熱茶，調勻氣息才換藥。", "你跟容晚秋認清藥封，再收下金創散。", "你託容晚秋向堂口傳信，換藥後趕往市集。"],
  market_collection: ["你先救陸千帆，再逼張斷骨交錢。", "你先向張斷骨索錢，讓陸千帆帶傷等候。", "你先查巷口刀手，回頭救人時已收不齊規費。", "你先救人，允張斷骨緩交餘款。", "你護陸千帆離開肉檔，暫且放下規費。"],
};

const SANDBOX_OPTIONS: Record<Landmark, string[]> = {
  "青鋒堂總壇": ["A. [休整] 休養一回合，氣血與精力各回復上限的20%。", "B. [捐銀固防] 捐二十文私銀入公帳，由堂主安排固防；命脈升十。", "C. [盤點] 清點堂口帳目。", "D. [問堂主] 問堂主近日玄武樓動靜。", "E. [習泥鰍步] 向堂主學保命步法；耗精力與一回合。"],
  "晚秋茶寮": ["A. [買消息] 付十文私銀，向容晚秋買城西街口情報。", "B. [買暗道] 付十五文私銀，向容晚秋買通往夜雨樓的暗道走法。"],
  "黑泥街": ["A. [巡街收規] 催收十文規費，記入公款。", "B. [搬貨] 替商販搬貨照料騾車；每隔三回合可賺六文私銀。", "C. [找陸千帆] 問陸千帆傷勢。", "D. [盯梢] 留意玄武樓眼線。", "E. [問張斷骨] 問肉檔近日有誰來過。"],
  "鬼骰坊": ["A. [押小] 押十文私銀賭一局。", "B. [看盤] 觀察骰盤，尋找莊家的破綻。", "C. [問祁觀衡] 問祁觀衡堂口欠帳。", "D. [查老千] 查出藏籌碼的賭客，替堂口追回銀錢。", "E. [核暗帳] 核對賭坊暗帳，替堂口追回錯漏。"],
  "裂石擂": ["A. [打黑拳] 上擂迎敵；打贏可得二十文私銀，受傷自行承擔。", "B. [習裂石短拳] 向衛沉岳習拳；耗精力與一回合。", "C. [觀擂] 觀察擂台對手。", "D. [問霍破陣] 問霍破陣拳館近況。", "E. [整備兵器] 花四十文私銀買生鏽鐵刀，或花十文修刀。"],
  "苦煙館": ["A. [買藥療傷] 付十文私銀、用一回合，氣血與精力各回復上限的35%。", "B. [看人] 觀察館內客人。", "C. [問顧忘生] 問顧忘生黑市傳聞。", "D. [拒藥] 拒絕來路不明的丹藥。", "E. [買藥帶走] 付十文私銀買一包療傷藥，佔一格行囊。"],
  "夜雨樓": ["A. [問柳照霜] 問柳照霜城西消息。", "B. [聽曲] 聽曲時留心席間動靜。", "C. [查客] 留意陌生客人。", "D. [問路] 問清附近暗巷。", "E. [斷開跟梢] 費些氣力甩開盯梢的人。"],
  "碼頭": [],
};

const INCIDENTS: Incident[] = ["market_raid", "missing_ledger", "tainted_medicine"];
const INCIDENT_OPTIONS: Record<Incident, string[]> = {
  market_raid: [
    "A. [護住攤販] 召集街坊，擋住玄武樓插旗。",
    "B. [暗巷截路] 繞到刀手後方，斷其退路。",
    "C. [設局取證] 記下刀手勒索攤販的證詞。",
    "D. [付錢息事] 自掏二十文私銀安頓攤販。",
    "E. [撤守保人] 先護傷者撤入黑泥街窄巷。",
  ],
  missing_ledger: [
    "A. [查賭檔] 到鬼骰坊核對缺失的規費帳。",
    "B. [買帳頁線索] 付十文私銀，向容晚秋買誰曾帶走帳簿的消息。",
    "C. [追腳印] 沿市集泥印追查偷帳的人。",
    "D. [補帳] 自掏十文私銀填補眼前缺口。",
    "E. [告知堂主] 把帳目破綻交給堂主處置。",
  ],
  tainted_medicine: [
    "A. [封存藥包] 封住來歷不明的傷藥。",
    "B. [請顧忘生驗藥] 帶藥去苦煙館查驗。",
    "C. [追查送藥人] 查問茶檔附近的送藥腳夫。",
    "D. [救治傷者] 花十文私銀替傷者換乾淨藥。",
    "E. [公開警訊] 告訴七處據點暫停用這批藥。",
  ],
};

const INCIDENT_REPORTS: Record<Incident, string> = {
  market_raid: "你收到市集急報：玄武樓刀手在肉檔插旗，攤販被逼交兩份規費。此刻須決定如何保住城西的人。",
  missing_ledger: "你見堂口規費帳少了一頁，鬼骰坊與市集的數目對不上。何不歸限你先查清帳，再碰公款。",
  tainted_medicine: "你見運藥腳夫在茶寮歇腳時留下的傷藥封口被換過，已有傷者用了藥。城西七處據點都等你拿主意。",
};

type Reaction = { event: string; line: string; speaker?: string };
const SANDBOX_REACTIONS: Record<Landmark, Record<string, Reaction>> = {
  "青鋒堂總壇": {
    "休整": { event: "", line: "坐吧。這扇門我還守得住；等你喘勻了，再替我走一趟。" },
    "捐銀固防": { event: "", line: "你的心意我入帳了。修門和備藥，我會安排。" },
    "盤點": { event: "你翻開堂口帳簿，逐筆核對公款，沒有漏下一文。", line: "你看得清這本帳，我便能騰出手守門。別讓我白忙。" },
    "問堂主": { event: "你問何不歸玄武樓近況，聽見城西幾處路口都添了眼線。", line: "路口又添了眼線。我能替你擋人，卻替你找不出路。" },
    "習泥鰍步": { event: "", line: "腳下先鬆，肩才不會替旁人接刀。再走一遍。" },
  },
  "晚秋茶寮": {
    "買消息": { event: "你向容晚秋買到街口情報：玄武樓的人正沿路認青鋒堂的面孔。", line: "十文錢我收了。街口有兩個灰衣人認臉，先別走明路。" },
    "買暗道": { event: "容晚秋指向煮茶土灶底的空心石板：下方暗網經鬼骰坊賬房樞紐通夜雨樓酒窖。", line: "土灶底下那塊石板能移。進去先聽腳步，別把尾巴帶下來。" },
  },
  "黑泥街": {
    "巡街收規": { event: "", line: "錢由你收。若有人從後面跟來，我會先讓你知道。" },
    "搬貨": { event: "", line: "搬貨賺的錢是你的，規費可得另外記帳。" },
    "找陸千帆": { event: "你問陸千帆肋下刀傷。你見他按住舊布條，呼吸仍穩，刀口卻未合。", line: "小傷，走得動。你先看巷口，別讓人抄後路。" },
    "盯梢": { event: "你退到肉檔陰影，盯住巷口來往的灰衣人。", line: "那兩個人走得太齊。我往左，你替我看右邊。", speaker: "陸千帆" },
    "問張斷骨": { event: "你問張斷骨近日誰在肉檔前打轉，他朝巷口努了努嘴。", line: "幾張生面孔盯我的肉檔，真有本事就替我趕走。", speaker: "張斷骨" },
    "查眼線": { event: "你沿肉檔外圍查眼線，發現有人見你便轉入窄巷。", line: "又來看我的攤？那筆帳還在，你不提，我也不會忘。", speaker: "張斷骨" },
  },
  "鬼骰坊": {
    "押小": { event: "", line: "十文放上桌，便算你認了這局。輸了別來改帳。" },
    "看盤": { event: "你盯住骰盅落桌，記下莊家左手收回時的停頓。", line: "莊家的左手收得太快。那一下，少說值十文。" },
    "問祁觀衡": { event: "你問祁觀衡堂口欠帳，聽見他只肯談帳面，不肯報人名。", line: "欠帳的有兩頁，肯認帳的一個也沒有。名字自己去查。" },
    "查老千": { event: "你盯住桌邊換籌碼的手，見有人袖口藏得太緊。", line: "抓住那隻藏在袖裏的手，這桌輸掉的錢才有處討。" },
    "核暗帳": { event: "你陪祁觀衡核對賭坊暗帳，查出一筆被人壓住的舊款。", line: "帳藏得再深，數目總有對不上的一天。這筆錢記回堂口。" },
  },
  "裂石擂": {
    "打黑拳": { event: "", line: "先看他的肩。拳未到，肩已經告訴你了。" },
    "習裂石短拳": { event: "", line: "肘收回來。你的肋下，比拳先到了他面前。" },
    "觀擂": { event: "你看完一場擂台，記下對手換步時露出的空門。", line: "左肋有空門。看見不算，打得到才算。" },
    "問霍破陣": { event: "你問霍破陣拳館近況，聽見近來上擂的人多，能走下來的少。", line: "今早抬走一個。誰下的手？我正找他。", speaker: "霍破陣" },
    "整備兵器": { event: "", line: "刀鈍了可以磨。手若握不穩，換甚麼刀都一樣。" },
  },
  "苦煙館": {
    "問藥": { event: "你問止血藥價，先看清封口，再掂藥包分量。", line: "價寫在紙上。先看封口，再看你身上的傷值不值這包藥。" },
    "看人": { event: "你掃過館內客人，見有人只看藥，不肯露手。", line: "手藏著的人，未必是怕冷。" },
    "問顧忘生": { event: "你問顧忘生黑市傳聞，聽見近來有人暗收傷藥。", line: "有人在暗收傷藥。傷的人一多，價便由他們說了算。" },
    "拒藥": { event: "你推開來歷不明的丹藥，沒有讓藥粉沾手。", line: "你不碰是對的。這包藥，連我都不願打開。" },
    "買藥療傷": { event: "", line: "十文私銀。藥敷好，氣息也要慢慢調。" },
    "買藥帶走": { event: "", line: "封口記清楚。要用時才拆，別讓藥粉受潮。" },
  },
  "夜雨樓": {
    "問柳照霜": { event: "你問柳照霜城西消息，聽見有人在樓裏打聽青鋒堂，連茶都沒碰。", line: "那客人問青鋒堂，卻連茶都沒碰。你猜他等誰？" },
    "聽曲": { event: "你聽完一曲，指尖仍按著錢袋。", line: "曲已聽完，你的手卻始終壓著錢袋。你是在等人，還是在防人？" },
    "查客": { event: "你留意席間陌生客，記下兩人同時望向門口，腳尖卻朝後巷。", line: "兩個人都看門，腳尖卻朝後巷。" },
    "問路": { event: "你問清附近暗巷的出口，記住轉角那道窄門。", line: "側門可以借你走。只是身後那條尾巴，別帶進夜雨樓。" },
    "斷開跟梢": { event: "你借夜雨樓的側門甩開身後尾巴，繞回城西街面。", line: "側門借你走。下一次，別把人帶到我樓前。" },
  },
  "碼頭": {},
};

const SANDBOX_CLUES: Record<string, string> = {
  "青鋒堂總壇:盤點": "帳目有據", "青鋒堂總壇:問堂主": "街面有備",
  "黑泥街:問價": "傷藥有據", "黑泥街:找陸千帆": "街面有備", "黑泥街:盯梢": "街面有備", "黑泥街:問張斷骨": "街面有備", "黑泥街:查眼線": "街面有備",
  "鬼骰坊:看盤": "已看透骰局", "鬼骰坊:問祁觀衡": "帳目有據", "鬼骰坊:查老千": "帳目有據", "鬼骰坊:核暗帳": "帳目有據",
  "裂石擂:觀擂": "街面有備", "裂石擂:問霍破陣": "街面有備",
  "苦煙館:問藥": "傷藥有據", "苦煙館:看人": "街面有備", "苦煙館:問顧忘生": "傷藥有據", "苦煙館:拒藥": "傷藥有據",
  "夜雨樓:問柳照霜": "街面有備", "夜雨樓:查客": "街面有備", "夜雨樓:問路": "街面有備",
};

const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;

export function aptitude(name: string, background: string, trait: string) {
  const text = `${name} ${background} ${trait}`;
  const variation = Array.from(name).reduce((sum, char) => sum + (char.codePointAt(0) || 0), 0) % 5 - 2;
  if (/醫|毒|藥|術|病/.test(text)) return { hp: 80 + variation, mp: MAX_ENERGY };
  if (/扒|偷|摸鎖|開鎖|身法|靈巧|眼快|輕功/.test(text)) return { hp: 90 + variation, mp: MAX_ENERGY };
  if (/刀|劍|棍|武|拳|皮厚|命硬|神力|壯/.test(text)) return { hp: 125 + variation, mp: MAX_ENERGY };
  return { hp: 100 + variation, mp: MAX_ENERGY };
}

function openingPortrait(background: string, trait: string) {
  if (background === "賭坊收帳人" || background === "爛賭收數佬") return "你指腹的骰繭還未褪去。";
  if (background === "城西街童扒手") return "你先看見後門，再看見堂主。";
  if (background === "落魄武館棄徒" || background === "濕鳩武館棄徒") return "肩上的舊傷讓你的步子慢了半拍。";
  if (background === "黑市醫道學徒") return "你指縫的藥色仍洗不乾淨。";
  if (/醫|毒|藥/.test(trait)) return "你指縫的藥色仍洗不乾淨。";
  if (/偷|巧|快|扒/.test(trait)) return "你先看見後門，再看見堂主。";
  if (/拳|壯|狠|勇/.test(trait)) return "你拳骨上的繭被雨水浸得發白。";
  if (/見風|察言|口才|機靈/.test(trait)) return "你先看何不歸的臉色，才肯往前一步。";
  return "你鞋底的泥在門檻上留下了印子。";
}

function openingAssessment(background: string, trait: string) {
  if (background === "賭坊收帳人" || background === "爛賭收數佬") return "你會收帳，想必也看得出人命比銀錢難還";
  if (background === "城西街童扒手") return "你腳快，別只顧逃命";
  if (background === "落魄武館棄徒" || background === "濕鳩武館棄徒") return "你骨頭硬，別只護自己";
  if (background === "黑市醫道學徒") return "你認得藥，別讓我收屍";
  if (/醫|毒|藥/.test(trait)) return "你認得藥，別讓我收屍";
  if (/偷|巧|快|扒/.test(trait)) return "你腳快，別只顧逃命";
  if (/拳|壯|狠|勇/.test(trait)) return "你骨頭硬，別只護自己";
  if (/見風|察言|口才|機靈/.test(trait)) return "你會看人臉色，今日看人命";
  return "你腳下站得穩，別叫我失望";
}

export const OPENING_CITY_NARRATION = `明末年間，青山城城主燕鎮嶽手握重兵，以兵權壓制城東、城南、城西三方勢力。

城東玄武樓樓主裴無鋒正逐漸侵奪城西，圖謀吞併青鋒堂與城南金冊莊，獨掌城中地下秩序；

城南金冊莊莊主黃萬鈞表面替城主經營銀號及管理地契，暗中卻與城外不明勢力往來。

城西青鋒堂堂主何不歸堅守地盤，不願靠掠奪與傷害無辜壯大堂口，誓要讓同門與街坊在此共存。

城北官衙的玄渡奉朝廷密旨坐鎮，表面維持法度，暗中監視燕鎮嶽與城中各方勢力。`;
const OPENING_WORLD_BRIEFING = "陸千帆那道傷，是玄武樓的人砍的；他們要的，是黑泥街。堂口要守住這條街，也要讓街坊相信我們肯護人。";
const OPENING_ERRAND = "先到苦煙館找顧忘生領止血膏藥，再去黑泥街市集救陸千帆。張斷骨那五十文，回來時也別忘了。";

function customOpeningAssessment(state: GameState, address: string): string {
  const gender = state.gender || "不願透露";
  const skill = state.skill || state.trait;
  const personality = state.personality || "寡言";
  const skillName = skill.replace(/^(擅長|熟悉|懂得|會)/, "") || "這門手藝";
  const greeting = /^(女|女子|女性)$/.test(gender) && address !== "小子" ? `${address}姑娘`
    : /^(男|男子|男性)$/.test(gender) && address !== "小子" ? `${address}兄弟` : address;
  const judgement = /鎖|扒|偷|盜/.test(skill) ? "鎖眼你看得明白，人心可沒那麼好撬。"
    : /醫|藥|毒|療|止血/.test(skill) ? "你認得藥，陸千帆那道傷就交你看。"
    : /刀|劍|棍|武|拳|打/.test(skill) ? "你會動手，先拿這本事護人。"
    : /帳|算|賭|收數|口才/.test(skill) ? "你會算帳，先把同門的命算進去。"
    : /跑|身法|探路|輕功/.test(skill) ? "你腳步快，記得替同門留條路。"
    : `你說會${skillName}。先用來護人。`;
  const caution = /多疑|疑心|不信人/.test(personality) ? "你防人防得緊，自己人總得信一回。"
    : /心軟|善良|重情|仁慈/.test(personality) ? "你心軟，我知道；該收的帳還是得收。"
    : /衝動|暴躁|急性|莽撞/.test(personality) ? "脾氣先壓住，別替刀手省事。"
    : /謹慎|小心|怕事/.test(personality) ? "你看得仔細，別把人耽誤了。"
    : /冷酷|無情|冷漠|狠/.test(personality) ? "心硬可以，別把同門丟下。"
    : `至於${personality}，回來再讓我見識。`;
  return `${greeting}，${judgement}${caution}${OPENING_WORLD_BRIEFING}${OPENING_ERRAND}`;
}

function legacyRelationships(worldFlags: string[]): CompanionRelationships {
  const relationships = newRelationships();
  const lu = relationships["陸千帆"];
  if (worldFlags.includes("出賣陸千帆")) {
    lu.trust = -3;
    lu.estranged = true;
  } else if (worldFlags.includes("先救陸千帆") || worldFlags.includes("張斷骨規費未收")) {
    lu.trust = 2;
  } else if (worldFlags.includes("陸千帆傷勢加重")) {
    lu.trust = -2;
    lu.wounded = true;
  } else if (worldFlags.includes("救下陸千帆")) {
    lu.trust = 1;
  }
  if (worldFlags.includes("陸千帆再受刀傷")) lu.wounded = true;
  if (worldFlags.includes("伏擊中護住陸千帆")) changeTrust(relationships, "陸千帆", 1);
  if (worldFlags.includes("陸千帆傷勢穩定")) {
    lu.wounded = false;
    changeTrust(relationships, "陸千帆", 1);
  }
  if (worldFlags.includes("茶寮傳信接應")) changeTrust(relationships, "容晚秋", 1);
  if (worldFlags.includes("苦煙館傳信接應")) changeTrust(relationships, "顧忘生", 1);
  for (const mission of MISSIONS) {
    if (worldFlags.includes(`${mission.title}完成`))
      applyMissionRelationship(relationships, mission.id, worldFlags.includes(mission.clue));
  }
  return relationships;
}

export function normalizeState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<GameState>;
  if (typeof value.playerName !== "string" || typeof value.background !== "string" || typeof value.trait !== "string") return null;
  const background = value.background === "爛賭收數佬" ? "賭坊收帳人"
    : value.background === "濕鳩武館棄徒" ? "落魄武館棄徒" : value.background;
  const steps: QuestStep[] = ["prologue_briefing", "kuyan_medicine", "yung_tea_stall", "market_collection", "huizhi_ambush", "sandbox", "chapter_one"];
  if (!steps.includes(value.questStep as QuestStep)) return null;
  const stats = aptitude(value.playerName, background, value.trait);
  const maxHp = finite(value.maxHp, stats.hp, 1, 170);
  const oldMaxMp = finite(value.maxMp, MAX_ENERGY, 1, 170);
  const maxMp = MAX_ENERGY;
  const playerMp = oldMaxMp === MAX_ENERGY
    ? finite(value.playerMp, maxMp, 0, maxMp)
    : Math.min(maxMp, Math.round(finite(value.playerMp, oldMaxMp, 0, oldMaxMp) / oldMaxMp * maxMp));
  const flags = value.flags || { tookHerbs: false, visitedYung: false, collectedMarketFee: false, marketAmbushTriggered: false };
  if (value.questStep === "chapter_one" && (flags.ending !== "守住城西" || !flags.chapterOne
    || !["rest", "shortage", "dock", "complete", "failed"].includes(flags.chapterOne.stage)
    || !["黑泥街", "鬼骰坊", "苦煙館", "夜雨樓"].includes(flags.chapterOne.affectedBusiness))) return null;
  const oldDeadlineFailure = flags.chapterOne?.stage === "failed" && flags.chapterOne.result === "城西斷供";
  const pendingIncident = INCIDENTS.includes(flags.pendingIncident as Incident) ? flags.pendingIncident as Incident : undefined;
  const worldFlags = Array.isArray(value.worldFlags) ? value.worldFlags.filter((flag): flag is string => typeof flag === "string")
    .filter((flag) => !oldDeadlineFailure || flag !== "第一章城西斷供")
    .slice(0, 100).map((flag) => renameLegacyWorldNames(flag).slice(0, 30)) : [];
  const relationships = value.relationships && typeof value.relationships === "object"
    ? normalizeRelationships(value.relationships) : legacyRelationships(worldFlags);
  const prologueLeads = Array.isArray(flags.prologueCompanionLeads)
    ? flags.prologueCompanionLeads.filter((name): name is CompanionId => typeof name === "string" && COMPANION_IDS.some((id) => id === name))
    : flags.ending ? companionLeads(relationships, flags.ending) : undefined;
  const selectedCompanion = flags.chapterOne && COMPANION_IDS.find((name) =>
    name === flags.chapterOne?.selectedCompanion && prologueLeads?.includes(name));
  const inventory = Array.isArray(value.inventory) ? value.inventory.filter((item): item is string => typeof item === "string")
    .slice(0, 6).map((item) => item === "【生石灰粉】" ? STARTING_DARK_HAND : item.slice(0, 30)) : [];
  if (!flags.darkHandInitialized && darkHandCount(inventory) === 0 && inventory.length < finite(value.maxInventory, 4, 4, 6))
    inventory.push(STARTING_DARK_HAND);
  const sceneState = normalizeSceneState(value.sceneState, worldFlags);
  const combat = normalizeCombat(value.combat);
  const activeCombat = combat && ((combat.scenario === "market_ambush" && value.questStep === "huizhi_ambush")
    || (combat.scenario === "arena" && value.questStep === "sandbox")) ? combat : undefined;
  const equippedWeapon: WeaponId = value.equippedWeapon === "rusty_knife" && inventory.includes("【生鏽鐵刀】")
    ? "rusty_knife" : value.equippedWeapon === "wooden_stick" && activeCombat?.scenario === "market_ambush"
      ? "wooden_stick" : "fists";
  const weaponDurability = inventory.includes("【生鏽鐵刀】")
    ? finite(value.weaponDurability, WEAPONS.rusty_knife.maxDurability, 0, WEAPONS.rusty_knife.maxDurability)
    : equippedWeapon === "wooden_stick" ? finite(value.weaponDurability, WEAPONS.wooden_stick.maxDurability, 0, WEAPONS.wooden_stick.maxDurability) : 0;
  const rawMoves = value.knownMoves && typeof value.knownMoves === "object" ? value.knownMoves : {};
  const knownMoves: KnownMoves = {
    mud_step: finite(rawMoves.mud_step, 0, 0, 3), short_punch: finite(rawMoves.short_punch, 0, 0, 3),
    soft_parry: finite(rawMoves.soft_parry, 0, 0, 3), point_strike: finite(rawMoves.point_strike, 0, 0, 3),
  };
  const savedLocation = typeof value.currentLocation === "string" && LANDMARKS.includes(renameLegacyWorldNames(value.currentLocation) as Landmark)
    ? renameLegacyWorldNames(value.currentLocation) as Landmark : "青鋒堂總壇";
  const currentLocation = savedLocation === "碼頭" && (value.questStep !== "chapter_one"
    || !["dock", "complete", "failed"].includes(flags.chapterOne?.stage || "")) ? "青鋒堂總壇"
    : value.questStep === "chapter_one" && flags.chapterOne?.stage === "dock" && savedLocation !== "碼頭"
      ? "青鋒堂總壇" : savedLocation;
  return {
    turn: finite(value.turn, 1, 1, 100000),
    playerName: value.playerName.slice(0, 30), background: background.slice(0, 60), trait: value.trait.slice(0, 60),
    gender: typeof value.gender === "string" ? value.gender.replace(/[\r\n「」]/g, "").trim().slice(0, 8) : undefined,
    skill: typeof value.skill === "string" ? value.skill.replace(/[\r\n「」]/g, "").trim().slice(0, 12) : undefined,
    personality: typeof value.personality === "string" ? value.personality.replace(/[\r\n「」]/g, "").trim().slice(0, 12) : undefined,
    currentLocation,
    inventory,
    sceneState,
    maxInventory: finite(value.maxInventory, 4, 4, 6),
    playerHp: finite(value.playerHp, maxHp, 0, maxHp), maxHp,
    playerMp, maxMp,
    silver: finite(value.silver, 0, 0, Number.MAX_SAFE_INTEGER - 1000), factionFunds: finite(value.factionFunds, 10, 0, Number.MAX_SAFE_INTEGER - 1000),
    customActionUses: finite(value.customActionUses, CUSTOM_ACTION_START, 0, CUSTOM_ACTION_MAX),
    sectLifeline: finite(value.sectLifeline ?? (value as Partial<GameState> & { hozaiDefense?: unknown }).hozaiDefense, 60, 0, 100),
    worldFlags,
    relationships,
    equippedWeapon, weaponDurability, knownMoves,
    combat: activeCombat || (value.questStep === "huizhi_ambush"
      ? createCombat("market_ambush", !worldFlags.includes("出賣陸千帆")) : undefined),
    questStep: value.questStep as QuestStep,
    flags: {
      tookHerbs: flags.tookHerbs === true, visitedYung: flags.visitedYung === true, visitedGu: flags.visitedGu === true,
      collectedMarketFee: flags.collectedMarketFee === true, marketAmbushTriggered: flags.marketAmbushTriggered === true,
      lastMarketDuesTurn: finite(flags.lastMarketDuesTurn, 0, 0, 100000),
      pendingIncident,
      incidentCount: finite(flags.incidentCount, 0, 0, 100000),
      lastIncidentTurn: finite(flags.lastIncidentTurn, 0, 0, 100000),
      lastSandboxTag: typeof flags.lastSandboxTag === "string" ? renameLegacyWorldNames(flags.lastSandboxTag).slice(0, 40) : undefined,
      repeatedActionCount: finite(flags.repeatedActionCount, 0, 0, 100000),
      lastJobTurn: finite(flags.lastJobTurn, 0, 0, 100000),
      loanDueTurn: finite(flags.loanDueTurn, 0, 0, 100000),
      customEchoes: Array.isArray(flags.customEchoes) ? flags.customEchoes
        .filter((echo): echo is CustomEcho => Boolean(echo && typeof echo === "object"
          && CREATIVE_GOALS.some((goal) => goal === echo.goal)
          && LANDMARKS.some((place) => place === echo.location)
          && typeof echo.anchor === "string" && echo.anchor.length <= 30
          && typeof echo.dueTurn === "number" && Number.isInteger(echo.dueTurn)))
        .slice(0, 20).map((echo) => ({ goal: echo.goal, anchor: echo.anchor,
          location: echo.location, dueTurn: finite(echo.dueTurn, 0, 0, 100000) })) : [],
      darkHandInitialized: true,
      alleyEscape: flags.alleyEscape === true && value.questStep === "sandbox" && currentLocation === "黑泥街",
      alleyAllyPresent: flags.alleyAllyPresent === true,
      finalCrisis: flags.finalCrisis === true,
      finalGuardLayers: flags.finalGuardLayers === undefined ? undefined : finite(flags.finalGuardLayers, 0, 0, 5),
      finalSupport: flags.finalSupport === undefined ? undefined : finite(flags.finalSupport, 0, 0, 7),
      prologueCompanionLeads: prologueLeads,
      ending: typeof flags.ending === "string" && ["守住城西", "城西陷落", "割地求存", "獨自撤走"].includes(flags.ending) ? flags.ending : undefined,
      chapterOne: flags.ending === "守住城西" && flags.chapterOne
        && ["rest", "shortage", "dock", "complete", "failed"].includes(flags.chapterOne.stage)
        && ["黑泥街", "鬼骰坊", "苦煙館", "夜雨樓"].includes(flags.chapterOne.affectedBusiness)
        ? { stage: oldDeadlineFailure
            ? worldFlags.includes(`第一章${flags.chapterOne.affectedBusiness}斷貨已查`) ? "dock" : "shortage"
            : flags.chapterOne.stage, turns: finite(flags.chapterOne.turns, 0, 0, 100000),
          evidence: finite(flags.chapterOne.evidence, 0, 0, 10), allies: selectedCompanion ? 1 : 0,
          selectedCompanion,
          affectedBusiness: flags.chapterOne.affectedBusiness as Business,
          deficitStreak: finite(flags.chapterOne.deficitStreak, 0, 0, 100),
          foodShortageDays: finite(flags.chapterOne.foodShortageDays, flags.chapterOne.deficitStreak || 0, 0, 100000),
          unrest: finite(flags.chapterOne.unrest, 0, 0, 1000),
          lostLandmarks: Array.isArray(flags.chapterOne.lostLandmarks)
            ? Array.from(new Set(flags.chapterOne.lostLandmarks.filter((place): place is Landmark =>
              (RAID_TARGETS as readonly Landmark[]).includes(place))))
            : [],
          tribute: ["pending", "paid", "missed"].includes(flags.chapterOne.tribute) ? flags.chapterOne.tribute : "pending",
          manifestFound: flags.chapterOne.manifestFound === true, crewHired: flags.chapterOne.crewHired === true,
          dockRouteKnown: flags.chapterOne.dockRouteKnown === true, petitionHeard: flags.chapterOne.petitionHeard === true,
          result: !oldDeadlineFailure && typeof flags.chapterOne.result === "string" ? flags.chapterOne.result.slice(0, 30) : undefined } : undefined,
      treasuryChange: flags.treasuryChange && typeof flags.treasuryChange.reason === "string"
        ? { delta: finite(flags.treasuryChange.delta, 0, -100000, 100000), reason: flags.treasuryChange.reason.slice(0, 100),
          turn: finite(flags.treasuryChange.turn, 0, 0, 100000) } : undefined,
      checkpointReady: flags.checkpointReady === true,
      midpointBriefed: flags.midpointBriefed === true,
    },
  };
}

function remember(state: GameState, flag: string) {
  if (!state.worldFlags.includes(flag)) state.worldFlags.push(flag);
}

function customAction(action: string) { return action.startsWith("F. [自訂手段]"); }

function settleCustomEchoes(state: GameState): string {
  if (state.questStep !== "sandbox" || state.combat) return "";
  const due = (state.flags.customEchoes || []).filter((echo) => echo.dueTurn <= state.turn);
  state.flags.customEchoes = (state.flags.customEchoes || []).filter((echo) => echo.dueTurn > state.turn);
  return due.map((echo) => {
    remember(state, `${echo.location}機變${echo.goal}已兌現`);
    if (echo.goal === "查線索") {
      state.sectLifeline = Math.min(100, state.sectLifeline + 1);
      return `你早前從${echo.location}的${echo.anchor}查到破綻，同門據此避過玄武樓眼線；青鋒堂命脈升一。`;
    }
    if (echo.goal === "護人") {
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
      return `你早前在${echo.location}護住的人帶來街坊接應；青鋒堂命脈升二。`;
    }
    if (echo.goal === "做工") {
      state.silver += 2;
      return `你早前在${echo.location}借${echo.anchor}辦成的活有了回音，商戶補付兩文私銀。`;
    }
    if (echo.goal === "牽制") {
      state.sectLifeline = Math.max(0, state.sectLifeline - 2);
      return `你早前在${echo.location}牽制的眼線回頭試探堂口；青鋒堂命脈減二。`;
    }
    state.sectLifeline = Math.min(100, state.sectLifeline + 1);
    return `你早前在${echo.location}同${echo.anchor}談妥的事得到回應，對方替堂口傳來消息；青鋒堂命脈升一。`;
  }).join("");
}

function resolveIncident(state: GameState, incident: Incident, choice: number): { event: string; reply: TurnResult["npcReply"]; turns: number } {
  const index = choice >= 0 ? choice : 4;
  const origin = state.currentLocation;
  const destination: Landmark | undefined = incident === "market_raid" && index !== 3 ? "黑泥街"
    : incident === "missing_ledger" ? (["鬼骰坊", "晚秋茶寮", "黑泥街"] as Landmark[])[index]
      : incident === "tainted_medicine" ? (["晚秋茶寮", "苦煙館", "晚秋茶寮"] as Landmark[])[index] : undefined;
  if (destination) state.currentLocation = destination;
  const lead = `你處置${incident === "market_raid" ? "市集插旗" : incident === "missing_ledger" ? "失蹤帳頁" : "可疑傷藥"}。`;
  let event = "";
  let reply: TurnResult["npcReply"];
  if (incident === "market_raid") {
    if (index === 0) { state.playerHp = Math.max(0, state.playerHp - 6); state.sectLifeline = Math.min(100, state.sectLifeline + 8); event = "你擋在攤販前挨了一刀，氣血減六；街坊守住肉檔，青鋒堂命脈升八。"; }
    if (index === 1) { state.playerMp = Math.max(0, state.playerMp - 5); state.sectLifeline = Math.min(100, state.sectLifeline + 6); event = "你從暗巷截住刀手退路，精力減五；對方拔旗撤走，青鋒堂命脈升六。"; }
    if (index === 2) { state.sectLifeline = Math.min(100, state.sectLifeline + 4); event = "你記下三名攤販的證詞，逼刀手收旗，青鋒堂命脈升四。"; }
    if (index === 3) { if (state.silver >= 20) { state.silver -= 20; state.sectLifeline = Math.min(100, state.sectLifeline + 3); event = "你自掏二十文私銀安頓攤販，刀手暫退，青鋒堂命脈升三。"; } else event = "私銀不足二十文，你只能護攤販退入窄巷，刀手仍在肉檔。"; }
    if (index === 4) { state.sectLifeline = Math.max(0, state.sectLifeline - 8); event = "你先護傷者撤走，肉檔失去半日生意，刀手把旗插在路口；青鋒堂命脈減八。"; }
    if (index < 4 && state.worldFlags.includes("街面有備")) {
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
      event += "先前記下的街面異動讓眾人及早應對，青鋒堂命脈再升二。";
    }
    if (index < 4 && state.worldFlags.includes("擊退伏擊刀手")) {
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
      event += "刀手認出你曾在肉檔擊退同夥，攻勢一滯，青鋒堂命脈再升二。";
    }
    if (index <= 1 && (state.knownMoves?.short_punch || 0) > 0) {
      const restored = Math.min(2, state.maxHp - state.playerHp);
      state.playerHp += restored;
      event += `你憑練過的拳路卸去一部分刀勢，氣血回復${restored}。`;
    }
    remember(state, index === 4 ? "市集暫失" : "市集守住");
    reply = { speaker: "陸千帆", line: index === 4 ? "人先撤了。我記著那面旗，遲早拔回來。" : "肉檔先守住了。我去看巷口，你別再替我挨刀。" };
  } else if (incident === "missing_ledger") {
    let tipBought = false;
    if (index === 0) { state.currentLocation = "鬼骰坊"; state.sectLifeline = Math.min(100, state.sectLifeline + 3); event = "你到鬼骰坊對帳，查出缺頁記著一筆假規費。祁觀衡鎖好原本，青鋒堂命脈升三。"; }
    if (index === 1) {
      state.currentLocation = "晚秋茶寮";
      if (state.silver >= 10) {
        state.silver -= 10; tipBought = true;
        state.sectLifeline = Math.min(100, state.sectLifeline + 2);
        event = "你付十文私銀向容晚秋買消息，得知灰衣客昨夜從總壇帶走帳頁；青鋒堂命脈升二。";
      } else event = "你拿不出十文私銀，容晚秋沒有說出誰帶走帳頁；缺頁仍待追查。";
    }
    if (index === 2) { state.currentLocation = "黑泥街"; state.playerMp = Math.max(0, state.playerMp - 4); state.sectLifeline = Math.min(100, state.sectLifeline + 4); event = "你沿泥印追到市集後巷，找回濕透的帳頁；精力減四，青鋒堂命脈升四。"; }
    if (index === 3) { if (state.silver >= 10) { state.silver -= 10; state.sectLifeline = Math.min(100, state.sectLifeline + 1); event = "你自掏十文私銀補上缺口，暫且穩住人心，青鋒堂命脈升一；缺的那頁仍得追查。"; } else event = "私銀不足十文，缺帳未補，你把破綻先記在紙上。"; }
    if (index === 4) { state.sectLifeline = Math.min(100, state.sectLifeline + 1); event = "你把缺頁之事告知何不歸；他封住帳櫃，派人逐筆重查，青鋒堂命脈升一。"; }
    if (index <= 2 && (index !== 1 || tipBought) && state.worldFlags.includes("帳目有據")) {
      state.factionFunds += 10;
      event += "你憑先前留下的帳目對出被藏的十文規費，追回公款。";
    }
    remember(state, "規費帳失頁已查");
    reply = index === 0
      ? { speaker: "祁觀衡", line: "假規費寫得真工整。可惜少算了一筆。" }
      : index === 1
        ? { speaker: "容晚秋", line: tipBought ? "灰衣客沒喝茶，手倒一直按著袖口。" : "十文私銀帶來，我才說那晚誰經過茶寮。" }
        : { speaker: "何不歸", line: index === 3 ? "十文我記下了。缺的那頁，還得替我找。" : "帳先收好。你查到哪一步，我替你擋到哪一步。" };
  } else {
    if (index === 0) { state.sectLifeline = Math.min(100, state.sectLifeline + 2); event = "你封存可疑藥包，叫腳夫暫停送藥，傷者改用乾淨布條止血；青鋒堂命脈升二。"; }
    if (index === 1) { state.currentLocation = "苦煙館"; state.sectLifeline = Math.min(100, state.sectLifeline + 3); event = "你把藥帶到苦煙館，顧忘生驗出封口混了苦麻粉；青鋒堂命脈升三。"; }
    if (index === 2) { state.currentLocation = "晚秋茶寮"; state.sectLifeline = Math.min(100, state.sectLifeline + 2); event = "你追問送藥腳夫，查到他替灰衣客轉過手；青鋒堂命脈升二。"; }
    if (index === 3) { if (state.silver >= 10) { state.silver -= 10; state.playerHp = Math.min(state.maxHp, state.playerHp + 5); event = "你花十文私銀買乾淨傷藥救人，餘藥敷在自己傷口，氣血回復五。"; } else event = "你拿不出十文私銀，便用乾淨布條替傷者止血。"; }
    if (index === 4) { state.sectLifeline = Math.min(100, state.sectLifeline + 4); event = "你派人告知城西七處據點停用這批藥，逐一收回藥包；青鋒堂命脈升四。"; }
    if (index !== 3 && state.worldFlags.includes("傷藥有據")) {
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
      event += "先前認清的藥封讓眾人及早分出可疑傷藥，青鋒堂命脈再升二。";
    }
    if (index !== 3 && state.worldFlags.includes("辨清傷藥封口")) {
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
      event += `${state.flags.visitedGu ? "顧忘生" : "容晚秋"}教過你的繩結仍記得清楚，你當場挑出換過封口的藥，青鋒堂命脈再升二。`;
    }
    remember(state, "可疑傷藥已處置");
    reply = index === 1
      ? { speaker: "顧忘生", line: "苦麻粉。藥還沒入口，人先被它放倒。" }
      : { speaker: "容晚秋", line: "封口換過。這批貨別再讓腳夫送出去。" };
  }
  state.flags.pendingIncident = undefined;
  const turns = destination && destination !== origin ? travelChoices({ ...state, currentLocation: origin }, destination)[0].turns : 1;
  if (turns > 1) state.turn += turns - 1;
  return { event: `${destination && destination !== origin ? `你沿明路費${turns}回合趕到${destination}。` : ""}${lead}${event}`, reply, turns };
}

export function resolveTurn(rawState: GameState, action: string, opening: boolean, creative?: CreativeAction, spendCustomUse = false): TurnResult {
  const state = normalizeState(rawState);
  if (!state) throw new Error("遊戲狀態無效");
  if (state.questStep === "chapter_one" || state.flags.ending) {
    return resolveChapterOne(state, action, spendCustomUse);
  }
  const usesCustomAction = customAction(action) || spendCustomUse;
  if (state.flags.finalCrisis) {
    if (!ENDING_OPTIONS.includes(action)) return { state, options: ENDING_OPTIONS, event: "玄武樓已壓到城西門前。你須決定青鋒堂最後的去路。", moneyNote: "" };
    const event = resolveEnding(state, action);
    return { state, options: chapterOneOptions(state), event, moneyNote: "" };
  }
  if (!opening && !customAction(action)) {
    const options = availableOptions(state);
    const key = /^\w\. \[[^\]]+\]/.exec(action)?.[0];
    const travelMatch = /^F\. \[前往\] (.+)$/.exec(action);
    const legacyTravel = state.questStep === "sandbox" && !state.flags.pendingIncident && !state.flags.alleyEscape && travelMatch
      && LANDMARKS.includes(travelMatch[1] as Landmark) && travelMatch[1] !== state.currentLocation;
    const routeTravel = state.questStep === "sandbox" && !state.flags.pendingIncident && !state.flags.alleyEscape && LANDMARKS.some((destination) =>
      travelChoices(state, destination).some((route) => route.label === action));
    const exactOnly = /\[(?:袖藏暗手|全力陰手|硬闖街口|伏低護人|伏低保命|踢翻餿水桶|踩籮翻牆|交畀陸千帆)\]/.test(action);
    if (!options.includes(action) && !(key && !exactOnly && options.some((option) => option.startsWith(key)))
      && !legacyTravel && !routeTravel)
      return { state, options, event: "眼前不能採取這項行動。", moneyNote: "" };
  }
  if (action.startsWith("N. [請堂主授機變]") && state.customActionUses >= CUSTOM_ACTION_MAX)
    return { state, options: availableOptions(state), event: "機變已儲滿兩次，毋須再付私銀。", moneyNote: "" };
  if (usesCustomAction && state.customActionUses === 0)
    return { state, options: availableOptions(state), event: "機變次數已用盡；完成差事或到總壇請堂主補給。", moneyNote: "" };
  const startingEnergy = state.playerMp;
  const startingLocation = state.currentLocation;
  const wasInCombat = Boolean(state.combat || state.questStep === "huizhi_ambush");
  const travelTarget = /^F\. \[(?:明路前往|暗道前往|前往)\] ([^（]+)/.exec(action)?.[1] as Landmark | undefined;
  const quotedTurns = Number(/(?:共)?(\d+)回合/.exec(action)?.[1] || 0);
  const plannedTurns = quotedTurns || (travelTarget && LANDMARKS.includes(travelTarget)
    ? travelChoices(state, travelTarget)[0]?.turns || 1 : 1);
  const energyCost = creative
    ? creative.goal === "做工" || creative.goal === "牽制" ? 3
      : creative.goal === "護人" ? 2
      : actionEnergyCost(state, `F. [${creative.goal}]`)
    : actionEnergyCost(state, action, plannedTurns);
  if (!canAffordEnergy(state, energyCost, action))
    return { state, options: availableOptions(state), event: `精力不足，這項行動須${energyCost}點精力；先休養或服藥。`, moneyNote: "" };
  const oldSilver = state.silver;
  const oldFunds = state.factionFunds;
  if (usesCustomAction) state.customActionUses -= 1;
  let event = "";
  let npcReply: TurnResult["npcReply"];
  let travelTurns = 1;
  const absurd = customAction(action) && /槍械|手槍|步槍|機關槍|超人|神仙|飛天|激光|雷射|核彈|手機|電腦|修仙|法術/.test(action);
  const choice = /^[A-E]\./.test(action) ? action.charCodeAt(0) - 65 : -1;
  const flavor = (step: Exclude<QuestStep, "sandbox" | "huizhi_ambush" | "chapter_one">) => choice >= 0 ? TUTORIAL_FLAVOR[step][choice] : "你自定手段，仍把眼前差事辦下去。";
  if (!opening) state.turn += 1;
  if (absurd) {
    state.playerHp = Math.max(0, state.playerHp - 15);
    event = "你被劣質丹藥幻覺誤導，當場出醜，氣血減十五。";
  }

  if (state.combat) {
    const wasMarketAmbush = state.combat.scenario === "market_ambush";
    const weaponBefore = state.equippedWeapon || "fists";
    const usingDarkHand = /\[(?:袖藏暗手|全力陰手)\]/.test(action);
    const guaranteed = action.includes("[全力陰手]");
    const darkItem = usingDarkHand ? readyDarkHand(state.inventory) : undefined;
    if (usingDarkHand && darkItem) state.inventory.splice(state.inventory.indexOf(darkItem), 1);
    const result = resolveCombatRound({
      combat: state.combat, action: absurd ? "B. [沉身守勢]" : action, playerHp: state.playerHp, playerMp: state.playerMp,
      weapon: state.equippedWeapon || "fists", weaponDurability: state.weaponDurability || 0,
      knownMoves: state.knownMoves || {}, canTakeStick: !state.inventory.includes("【生鏽鐵刀】"),
      fatigued: startingEnergy <= 10,
      dirtyHand: darkItem ? { item: darkItem, guaranteed,
        tier: dirtyHandTier(rollD20(state, action), dirtyHandModifier(state), guaranteed) } : undefined,
    });
    state.playerHp = result.playerHp;
    state.playerMp = result.playerMp;
    state.equippedWeapon = result.weapon;
    state.weaponDurability = result.weaponDurability;
    if (wasMarketAmbush && result.combat.allyPresent && action.startsWith("B. [護住同門]")
      && !state.worldFlags.includes("伏擊中護住陸千帆")) {
      remember(state, "伏擊中護住陸千帆");
      changeTrust(state.relationships, "陸千帆", 1);
    }
    if (weaponBefore === "rusty_knife" && result.weapon === "fists" && state.inventory.includes("【生鏽鐵刀】")) {
      state.inventory = state.inventory.filter((item) => item !== "【生鏽鐵刀】");
    }
    event += result.event;
    if (result.outcome === "ongoing") {
      state.combat = result.combat;
      npcReply = wasMarketAmbush && result.combat.allyPresent
        ? { speaker: "陸千帆", line: "我守住左邊。你看他下一刀從何處來。" }
        : { speaker: "衛沉岳", line: "肩先動了。別等拳到眼前才退。" };
    } else {
      state.combat = undefined;
      if (state.equippedWeapon === "wooden_stick") {
        state.equippedWeapon = "fists"; state.weaponDurability = 0;
        event += "你把打裂的木棍丟在肉案旁。";
      }
      if (wasMarketAmbush) {
        state.questStep = "sandbox";
        state.currentLocation = "黑泥街";
        state.flags.alleyEscape = result.outcome === "fled";
        state.flags.alleyAllyPresent = result.combat.allyPresent;
        if (result.outcome === "won") {
          remember(state, "市集伏擊突圍");
          remember(state, "擊退伏擊刀手");
          event += "黑泥街的肉檔仍由青鋒堂守著。";
        } else {
          state.sectLifeline = Math.max(0, state.sectLifeline - (result.outcome === "fled" ? 6 : 10));
          remember(state, result.outcome === "fled" ? "市集伏擊撤守" : "市集伏擊戰敗");
          event += result.outcome === "fled" ? "你保住性命，卻讓出肉檔前的街口；青鋒堂命脈減六。"
            : "青鋒堂暫失肉檔前的街口，青鋒堂命脈減十。";
        }
        if (result.combat.allyWounded) {
          remember(state, "陸千帆再受刀傷");
          state.relationships["陸千帆"].wounded = true;
          state.sectLifeline = Math.max(0, state.sectLifeline - 3);
          event += "陸千帆的舊傷又添一刀，青鋒堂命脈再減三。";
        }
        if (state.worldFlags.includes("茶寮傳信接應") || state.worldFlags.includes("苦煙館傳信接應")) {
          state.sectLifeline = Math.min(100, state.sectLifeline + 4);
          event += `${state.worldFlags.includes("苦煙館傳信接應") ? "顧忘生" : "容晚秋"}傳出的信帶來接應，青鋒堂命脈升四。`;
        }
        if (state.playerHp === 0) {
          state.playerHp = 1;
          event += "你被同門拖出刀口，氣血只剩一線。";
        }
        npcReply = result.combat.allyPresent
          ? { speaker: "陸千帆", line: result.outcome === "won" ? "這條街還在。我這道傷，回去再看。" : "他媽的，先翻出去。誰堵的路，回頭剁誰。" }
          : { speaker: "何不歸", line: "你回來了。街上的事，慢慢說給我聽。" };
      } else {
        if (result.outcome === "won") {
          state.silver += 20;
          remember(state, "裂石擂勝場");
          event += "衛沉岳把二十文賞錢放到你手裏，私銀增加二十文。";
        } else if (state.playerHp === 0) {
          state.playerHp = 1;
          event += "衛沉岳將你從擂台上扶下，氣血只剩一線。";
        }
        npcReply = { speaker: "衛沉岳", line: result.outcome === "won" ? "拳收住。對手已經倒了。" : "先把氣息養回來，再談下一場。" };
      }
    }
    if (!wasMarketAmbush) {
      state.sectLifeline = Math.max(0, state.sectLifeline - 2);
      event += "玄武樓又向城西逼近一步；青鋒堂命脈減二。";
    }
  } else if (state.questStep === "prologue_briefing") {
    state.currentLocation = "青鋒堂總壇";
    if (opening) {
      const stats = aptitude(state.playerName, state.background, state.trait);
      state.maxHp = stats.hp; state.playerHp = stats.hp;
      state.maxMp = stats.mp; state.playerMp = stats.mp;
      const cleanName = state.playerName.replace(/[「」\r\n]/g, "").trim();
      const address = cleanName && Array.from(cleanName).length <= 8 ? cleanName : "小子";
      const customProfile = state.background === "自定義市井流民" && Boolean(state.gender && state.skill && state.personality);
      event = customProfile
        ? "你踩過城西泥巷，進了青鋒堂。雨水沿著衣角滴下；何不歸指著桌上記有陸千帆傷勢的紙。"
        : `你踩過城西泥巷，進了青鋒堂。${openingPortrait(state.background, state.trait)}堂外有人為規費爭吵；何不歸沒有抬頭，只把記有陸千帆傷勢的紙推到你面前。`;
      npcReply = {
        speaker: "何不歸",
        line: customProfile
          ? customOpeningAssessment(state, address)
          : `${address}，${openingAssessment(state.background, state.trait)}。${OPENING_WORLD_BRIEFING}${OPENING_ERRAND}`,
      };
    } else {
      event += flavor("prologue_briefing");
      if (choice === 0) {
        state.sectLifeline = Math.min(100, state.sectLifeline + 4);
        event += "何不歸得以留下補強守備，防線升四。";
      } else if (choice === 1) {
        if (state.factionFunds >= 10) {
          state.factionFunds -= 10; state.silver += 10;
          event += "他從公款撥十文給你作路費；公款減少十文，私銀增加十文。";
        } else event += "堂口已拿不出十文路費，你只得空手上路。";
      } else if (choice === 2) { remember(state, "問清刀手兵刃"); event += "你記住刀手慣用的短刀，往後交手便有了防備。"; }
      else if (choice === 3) { remember(state, "問清陸千帆傷勢"); event += "何不歸說清傷口深淺，你記下來向顧忘生交代。"; }
      else if (choice === 4) { remember(state, "熟記市集暗巷"); event += "你把退往巷口的路記在心裏。"; }
      state.questStep = "kuyan_medicine";
      state.currentLocation = "苦煙館";
      event += "你到苦煙館見顧忘生，將陸千帆的傷勢與市集急況告訴她。她揭開藥罐，叫你先看清膏藥的封口。";
    }
  } else if (state.questStep === "kuyan_medicine") {
    event += flavor("kuyan_medicine");
    if (choice === 0) { remember(state, "趕在刀手前到市集"); event += "你收好膏藥，趕在刀手前動身。"; }
    else if (choice === 1) { remember(state, "認清刀手裝束"); event += "顧忘生說有袖口繫灰線的刀手來買過止痛藥，你記住這個記號。"; }
    else if (choice === 2) { remember(state, "苦煙館調息"); event += "你在藥煙散去的窗邊調勻氣息，才動身往市集。"; }
    else if (choice === 3) { remember(state, "辨清傷藥封口"); event += "顧忘生教你認清膏藥封口的繩結與藥味。"; }
    else if (choice === 4) { remember(state, "苦煙館傳信接應"); changeTrust(state.relationships, "顧忘生", 1); event += "顧忘生遣人通知堂口，說市集恐有埋伏。"; }
    if (state.worldFlags.includes("問清陸千帆傷勢")) {
      remember(state, "傷藥有據");
      event += "她聽過你交代的傷口深淺，調整膏藥分量，將用法寫在紙上。";
    }
    state.questStep = "market_collection";
    state.currentLocation = "黑泥街";
    if (!state.inventory.includes("【止血膏藥】")) state.inventory.push("【止血膏藥】");
    state.flags.visitedGu = true;
    npcReply = { speaker: "顧忘生", line: "膏藥敷在傷口，先壓住血。別讓他帶傷硬撐。" };
    event += "你從顧忘生手中領了止血膏藥，趕到黑泥街市集肉檔。陸千帆仍帶傷，張斷骨卻拒交規費。";
  } else if (state.questStep === "yung_tea_stall") {
    event += flavor("yung_tea_stall");
    if (choice === 0) { remember(state, "趕在刀手前到市集"); event += "你沒等茶涼，便先一步趕到市集。"; }
    else if (choice === 1) { remember(state, "認清刀手裝束"); event += "容晚秋說刀手袖口繫著灰線，你把這個記號記下。"; }
    else if (choice === 2) { remember(state, "茶寮調息"); event += "熱茶壓下疲乏，你把氣息調勻。"; }
    else if (choice === 3) { remember(state, "辨清傷藥封口"); event += "容晚秋教你認清封口的繩結與藥味。"; }
    else if (choice === 4) { remember(state, "茶寮傳信接應"); changeTrust(state.relationships, "容晚秋", 1); event += "容晚秋派人通知堂口，說市集恐有埋伏。"; }
    state.questStep = "market_collection";
    state.currentLocation = "黑泥街";
    const herb = state.inventory.indexOf("【生草藥包】");
    if (herb >= 0) state.inventory.splice(herb, 1);
    if (!state.inventory.includes("【金創散】")) state.inventory.push("【金創散】");
    state.flags.visitedYung = true;
    event += "你把草藥交給容晚秋，收下金創散與伏擊警訊，趕到市集肉檔。你見陸千帆仍帶傷，張斷骨卻拒交規費。";
  } else if (state.questStep === "market_collection") {
    if (choice < 0) event += flavor("market_collection");
    state.questStep = "huizhi_ambush";
    state.currentLocation = "黑泥街";
    const intentionalHarm = customAction(action) && !negatesIrreversibleAction(action);
    const betrayed = intentionalHarm && /背叛|出賣陸千帆|不救陸千帆/.test(action);
    const maimed = intentionalHarm && /打斷張斷骨|致殘張斷骨|廢了張斷骨/.test(action);
    const medicineName = state.inventory.includes("【止血膏藥】") ? "止血膏藥" : "金創散";
    if (betrayed) {
      remember(state, "出賣陸千帆");
      state.relationships["陸千帆"].trust = -3;
      state.relationships["陸千帆"].estranged = true;
      state.sectLifeline = Math.max(0, state.sectLifeline - 15);
      event += `你扣下${medicineName}，任陸千帆帶傷獨自留在肉檔。`;
    } else {
      const medicine = state.inventory.indexOf(`【${medicineName}】`);
      if (medicine >= 0) state.inventory.splice(medicine, 1);
      remember(state, "救下陸千帆");
      changeTrust(state.relationships, "陸千帆", [2, -2, 1, 1, 2][choice] ?? 1);
      if (choice === 1) state.relationships["陸千帆"].wounded = true;
    }
    if (maimed) {
      remember(state, "打斷張斷骨右手");
      event += "你打斷張斷骨右手，肉檔眾人看在眼裡。";
    }
    state.flags.marketAmbushTriggered = true;
    if (intentionalHarm && /私吞|昧起|袋起|自己收/.test(action)) {
      state.silver += 50;
      state.flags.collectedMarketFee = true;
      remember(state, "私吞五十文規費");
      state.sectLifeline = Math.max(0, state.sectLifeline - 10);
      event += `${betrayed ? "你逼" : "你交藥救人，又逼"}得張斷骨交出五十文，卻私吞入袋。你聽張斷骨吹響呼哨，玄武樓刀手隨即伏擊。`;
    } else {
      const fee = choice === 2 ? 30 : choice === 3 ? 20 : choice === 4 ? 0 : 50;
      state.factionFunds += fee;
      state.flags.collectedMarketFee = fee > 0;
      if (choice === 0) {
        remember(state, "先救陸千帆");
        state.sectLifeline = Math.min(100, state.sectLifeline + 3);
        event += `你替陸千帆敷上${medicineName}，他扶著肉案重新站穩。張斷骨見你們不退，才交足五十文；你記入公款，同門也肯留下守街，青鋒堂命脈升三。`;
      } else if (choice === 1) {
        remember(state, "陸千帆傷勢加重");
        state.sectLifeline = Math.max(0, state.sectLifeline - 3);
        event += "你扣住藥包，先逼張斷骨交出五十文，逐文記入公款。等你回頭，陸千帆的衣襟已被血浸透；藥終究敷上了，青鋒堂命脈卻減三。";
      } else if (choice === 2) {
        remember(state, "已察覺巷口伏兵");
        remember(state, "張斷骨欠費二十文");
        state.playerMp = Math.max(0, state.playerMp - 3);
        event += "你先轉入巷口，認出刀手袖上那道灰線。回頭替陸千帆敷藥時，張斷骨只肯交三十文；你記入公款，餘下二十文留待追討，查探耗去三點精力。";
      } else if (choice === 3) {
        remember(state, "張斷骨欠費三十文");
        event += "你先替陸千帆敷藥，張斷骨才從錢袋裏數出二十文。餘下三十文，他寫下欠條；你將現錢記入公款，把那張紙收進袖中。";
      } else if (choice === 4) {
        remember(state, "張斷骨規費未收");
        state.sectLifeline = Math.max(0, state.sectLifeline - 6);
        event += "你把藥敷在陸千帆傷處，扶他離開肉檔。五十文一文未收；街坊望著守街的人先退，青鋒堂命脈減六。";
      } else {
        event += `${betrayed ? "你逼" : "你交藥救人，又逼"}得張斷骨交出五十文規費，當場記入青鋒堂公款。`;
      }
      event += choice === 4
        ? "你們退到巷口，玄武樓刀手已封住去路。"
        : "張斷骨吹響呼哨，玄武樓刀手隨即伏擊。";
    }
    const fight = createCombat("market_ambush", !state.worldFlags.includes("出賣陸千帆"));
    fight.preparedDefense = Math.min(5, ["問清刀手兵刃", "驗過堂口草藥", "趕在刀手前到市集", "認清刀手裝束", "熟記市集暗巷", "茶寮調息", "苦煙館調息", "已察覺巷口伏兵"]
      .filter((flag) => state.worldFlags.includes(flag)).length);
    state.combat = fight;
    event += fight.preparedDefense
      ? "先前留下的線索使你認出刀手起勢，尚有一步可以應對。"
      : "領頭刀手低肩逼近，短刀直指你的胸口。";
  } else if (state.flags.alleyEscape) {
    const item = /\[(?:袖藏暗手|全力陰手)\]/.test(action) ? readyDarkHand(state.inventory, false) : undefined;
    const guaranteed = action.includes("[全力陰手]");
    const tier = item ? dirtyHandTier(rollD20(state, action), dirtyHandModifier(state), guaranteed) : undefined;
    if (item) {
      state.inventory.splice(state.inventory.indexOf(item), 1);
      if (guaranteed) state.playerMp -= 1;
    }
    if (action.includes("[硬闖街口]")) {
      state.playerHp = Math.max(1, state.playerHp - 5);
      state.sectLifeline = Math.min(100, state.sectLifeline + 3);
      event = "你撞回肉檔前，肩頭挨刀，硬把刀手逼開。街口重新露出一條路。";
      remember(state, "黑泥街街口重奪");
    } else if (action.includes("[伏低護人]") || action.includes("[伏低保命]")) {
      state.playerHp = Math.max(1, state.playerHp - 4);
      if (state.flags.alleyAllyPresent) {
        state.customActionUses = Math.min(CUSTOM_ACTION_MAX, state.customActionUses + 1);
        changeTrust(state.relationships, "陸千帆", 1);
      }
      event = state.flags.alleyAllyPresent
        ? "你伏進油泥，替陸千帆擋下追兵一刀。刀手走過，你們才踩竹籮翻牆。"
        : "你伏進油泥挨過一刀。刀手搜向巷口，你才踩竹籮翻牆。";
    } else if (action.includes("[踢翻餿水桶]")) {
      state.playerHp = Math.max(1, state.playerHp - 1);
      state.sceneState!.movedObjects["餿水桶"] = "巷口倒翻，餿水流滿地";
      event = "你踢翻餿水桶，追兵踩進污水滑了一步。你借竹籮登牆，手背仍挨了一刀。";
    } else if (action.includes("[交畀陸千帆]")) {
      state.relationships["陸千帆"].wounded = true;
      event = "陸千帆把竹籮踢到牆邊，先托你上去，再攀牆跟來。他扯開了舊傷。";
      npcReply = { speaker: "陸千帆", line: "手拿開。老子還爬得動。" };
    } else if (action.includes("[踩籮翻牆]")) {
      state.playerHp = Math.max(1, state.playerHp - 2);
      if (state.inventory.includes("【生鏽鐵刀】")) {
        state.inventory = state.inventory.filter((held) => held !== "【生鏽鐵刀】");
        state.equippedWeapon = "fists";
        state.weaponDurability = 0;
        state.sceneState!.movedObjects["生鏽鐵刀"] = "黑泥街死巷牆下";
      }
      event = "你踩竹籮攀上牆頭，瓦片割破手掌。身後刀手撞散竹籮，沒能跟上。";
    } else if (tier === "great") {
      event = `你${dirtyHandVerb(item!)}，刀手遮眼撞上巷牆。你借竹籮翻過牆頭。`;
    } else if (tier === "ordinary") {
      state.playerHp = Math.max(1, state.playerHp - 2);
      event = `你${dirtyHandVerb(item!)}，刀手亂了步子，反手仍劃破你的臂。你踩竹籮翻牆。`;
    } else if (tier === "failed") {
      state.playerHp = Math.max(1, state.playerHp - 6);
      event = `你${dirtyHandVerb(item!)}，刀手早有防備，抬刀將你逼回巷尾。`;
    } else {
      event = "你仍困在死巷。肉檔前的刀手守著唯一街口。";
    }
    state.flags.alleyEscape = tier === "failed" || event === "你仍困在死巷。肉檔前的刀手守著唯一街口。";
    if (!state.flags.alleyEscape) remember(state, "黑泥街巷尾脫險");
    state.sectLifeline = Math.max(0, state.sectLifeline - 1);
  } else {
    const pendingIncident = state.flags.pendingIncident;
    if (pendingIncident) {
      const resolved = resolveIncident(state, pendingIncident, choice);
      event += resolved.event;
      npcReply = resolved.reply;
      travelTurns = resolved.turns;
      if (pendingIncident === "tainted_medicine" && state.flags.incidentCount === 3 && !state.flags.midpointBriefed) {
        state.flags.checkpointReady = true;
        event += "三件城西急事暫告一段落。你應回總壇向堂主交代，再商量守城後半程。";
      }
    } else if (state.flags.checkpointReady && state.currentLocation === "青鋒堂總壇"
      && action.startsWith("O. [向堂主交代]")) {
      state.flags.checkpointReady = false;
      state.flags.midpointBriefed = true;
      event += "你將市集插旗、規費帳失頁與換封傷藥逐件交代。何不歸翻過帳頁，讓你看清還有多少人手肯守街。";
      npcReply = { speaker: "何不歸", line: "前頭的帳已記下。後半程，你要把沒查完的差事補上。" };
    } else if (creative && customAction(action)) {
      const flag = `${state.currentLocation}機變${creative.goal}`;
      if (state.worldFlags.includes(flag)) {
        event += `你再次借${creative.anchor}試同一手，這處已沒有新的收穫。`;
      } else if (creative.goal === "護人" && state.playerHp < 4) {
        event += "你傷得太重，眼下護不住旁人，只得先穩住自己。";
      } else if (["做工", "牽制"].includes(creative.goal) && state.playerMp < 3) {
        event += "你氣力不足，這一手未能使成。";
      } else {
        remember(state, flag);
        state.flags.customEchoes = [...(state.flags.customEchoes || []), {
          goal: creative.goal, anchor: creative.anchor, location: state.currentLocation, dueTurn: state.turn + 2,
        }].slice(-20);
        if (creative.goal === "查線索") {
          state.sectLifeline = Math.min(100, state.sectLifeline + 2);
          event += `你從${creative.anchor}察出旁人漏看的破綻，及早通知堂口；青鋒堂命脈升二。`;
        } else if (creative.goal === "護人") {
          state.playerHp -= 3;
          state.sectLifeline = Math.min(100, state.sectLifeline + 4);
          event += `你借${creative.anchor}護住眼前的人，自己受傷氣血減三；街面暫穩，青鋒堂命脈升四。`;
        } else if (creative.goal === "做工") {
          state.playerMp -= 3;
          state.silver += 4;
          event += `你借${creative.anchor}替人完成一樁活，精力減三，領四文私銀。`;
        } else if (creative.goal === "牽制") {
          state.playerMp -= 3;
          state.sectLifeline = Math.min(100, state.sectLifeline + 3);
          event += `你借${creative.anchor}拖住玄武樓眼線，精力減三；堂口得以補位，青鋒堂命脈升三。`;
        } else {
          state.sectLifeline = Math.min(100, state.sectLifeline + 2);
          const companion = COMPANION_IDS.find((name) => name === creative.anchor);
          if (companion) changeTrust(state.relationships, companion, 1);
          event += `你同${creative.anchor}把眼前利害說清，對方肯替堂口留一條路；青鋒堂命脈升二。`;
          npcReply = { speaker: creative.anchor, line: "話說明白了。眼前這一步，我會照應。" };
        }
        event += ({
          "查線索": "同門說還要核實這條線。",
          "護人": "獲救的人記住你留下的傷。",
          "做工": "東家說驗妥貨再結餘錢。",
          "牽制": "眼線撤時回頭認了你的身形。",
          "交涉": "對方答應稍後回話。",
        } satisfies Record<CreativeAction["goal"], string>)[creative.goal];
      }
    } else {
    const mission = resolveMission(state, action);
    if (mission) {
      event += mission.event;
      npcReply = { speaker: mission.speaker, line: mission.line };
    } else if (state.currentLocation === "青鋒堂總壇" && action === `N. [請堂主授機變] 付${CUSTOM_ACTION_PRICE}文私銀，請堂主補給一次機變；公款不動。`) {
      if (state.silver >= CUSTOM_ACTION_PRICE) {
        state.silver -= CUSTOM_ACTION_PRICE;
        state.customActionUses = Math.min(CUSTOM_ACTION_MAX, state.customActionUses + 1);
        event += `你從私囊數出${CUSTOM_ACTION_PRICE}文交給堂主，換得一次額外機變；公款未動。`;
        npcReply = { speaker: "何不歸", line: "這筆是你的私銀，我記清了。下回出手，先看準局勢。" };
      } else event += `你私銀不足${CUSTOM_ACTION_PRICE}文，堂主叫你先把眼前差事辦妥。`;
    } else if (state.currentLocation === "黑泥街" && action.startsWith("M. [請陸千帆指路]")
      && state.relationships["陸千帆"].trust >= 2 && !state.relationships["陸千帆"].wounded
      && !state.relationships["陸千帆"].estranged && !state.worldFlags.includes("熟記市集暗巷")) {
      remember(state, "熟記市集暗巷");
      event += "陸千帆領你走過肉檔後方的窄巷，逐一指出可避開街口眼線的轉角。你記下總壇與黑泥街之間的暗道。";
      npcReply = { speaker: "陸千帆", line: "這條路我只帶信得過的人走。記住，回頭先看有沒有人跟著。" };
    } else if (state.currentLocation === "苦煙館" && action.startsWith("M. [為陸千帆求藥]")
      && state.relationships["陸千帆"].wounded && !state.relationships["陸千帆"].estranged) {
      if (state.silver >= 10) {
        state.silver -= 10;
        state.relationships["陸千帆"].wounded = false;
        changeTrust(state.relationships, "陸千帆", 1);
        remember(state, "陸千帆傷勢穩定");
        event += "你自掏十文私銀請顧忘生調藥，送去黑泥街替陸千帆換下浸血的布條。他傷勢漸穩，終於能再走暗巷。";
        npcReply = { speaker: "顧忘生", line: "傷口能合上。你若還叫他帶傷硬撐，這藥便白用了。" };
      } else event += "你拿不出十文私銀替陸千帆求藥，顧忘生先替你記下方子。";
    } else if (state.currentLocation === "夜雨樓" && action.startsWith("J. [接暗殺令]") && state.worldFlags.filter((flag) => flag.endsWith("完成")).length >= 3 && !state.worldFlags.includes("暗殺令已接")) {
      remember(state, "暗殺令已接");
      event += "柳照霜交你一張沒有署名的契紙：玄武樓的刀手頭目今晚會到黑泥街。事成付四十文私銀。";
      npcReply = { speaker: "柳照霜", line: "認清人再出手。錯一刀，錢救不了你。" };
    } else if (state.currentLocation === "黑泥街" && action.startsWith("J. [執行暗殺令]") && state.worldFlags.includes("暗殺令已接") && !state.worldFlags.includes("暗殺令已結")) {
      remember(state, "暗殺令已結");
      const skill = (state.knownMoves?.short_punch || 0) + (state.knownMoves?.point_strike || 0);
      if (skill >= 2 && state.playerHp >= 25) {
        state.silver += 40; state.playerHp -= 12; state.sectLifeline = Math.max(0, state.sectLifeline - 6);
        remember(state, "城東記恨暗殺");
        event += "你在肉檔後巷截住刀手頭目，受傷氣血減十二，領到四十文私銀；城東認出你的手法，青鋒堂命脈減六。";
      } else {
        state.playerHp = Math.max(1, state.playerHp - 18); state.sectLifeline = Math.max(0, state.sectLifeline - 8);
        event += "你伏擊刀手卻未能壓住對方，帶傷撤回；氣血減十八，青鋒堂命脈減八，酬勞落空。";
      }
    } else if (state.currentLocation === "鬼骰坊" && action.startsWith("J. [私銀放貸]") && state.worldFlags.filter((flag) => flag.endsWith("完成")).length >= 3 && !state.flags.loanDueTurn) {
      if (state.silver >= 20) {
        state.silver -= 20; state.flags.loanDueTurn = state.turn + 5;
        event += "你用二十文私銀自行放貸，祁觀衡替你立下五回合後還二十六文的借據。";
      } else event += "你拿不出二十文私銀作本。";
      npcReply = { speaker: "祁觀衡", line: "借出去的是你的錢，催回來也得你自己面對人。" };
    } else if (state.currentLocation === "鬼骰坊" && action.startsWith("J. [收回私貸]") && state.flags.loanDueTurn && state.turn >= state.flags.loanDueTurn) {
      state.silver += 26; state.flags.loanDueTurn = 0;
      state.sectLifeline = Math.max(0, state.sectLifeline - 3);
      remember(state, "街坊怨貸");
      event += "你收回私貸二十六文，其中六文是利錢；欠債人的攤檔熄了燈，青鋒堂命脈減三。";
      npcReply = { speaker: "祁觀衡", line: "錢收齊了。人情這一欄，帳上沒法替你填。" };
    } else if (state.currentLocation === "鬼骰坊" && action.startsWith("K. [領追債令]") && state.worldFlags.includes("假借據完成") && !state.worldFlags.includes("追債令已領")) {
      remember(state, "追債令已領");
      event += "祁觀衡把一張欠條交你，授權你到黑泥街追還堂口舊款；追回款項須入公帳，佣金另計。";
      npcReply = { speaker: "祁觀衡", line: "公數是公數，你的五文佣金我另記。" };
    } else if (state.currentLocation === "黑泥街" && action.startsWith("K. [和談追債]") && state.worldFlags.includes("追債令已領") && !state.worldFlags.includes("追債令已結")) {
      remember(state, "追債令已結"); state.factionFunds += 15; state.silver += 5;
      changeTrust(state.relationships, "陸千帆", 1);
      event += "你同欠債攤販商量分期，先追回十五文入公帳；祁觀衡按約付你五文私銀佣金。";
      npcReply = { speaker: "陸千帆", line: "你肯留他一口飯，他下月才交得出餘款。" };
    } else if (state.currentLocation === "黑泥街" && action.startsWith("L. [強追欠款]") && state.worldFlags.includes("追債令已領") && !state.worldFlags.includes("追債令已結")) {
      remember(state, "追債令已結"); state.factionFunds += 20; state.silver += 8;
      changeTrust(state.relationships, "陸千帆", -1);
      state.sectLifeline = Math.max(0, state.sectLifeline - 5);
      event += "你強追二十文舊款入公帳，祁觀衡付你八文私銀佣金；攤販閉門，青鋒堂命脈減五。";
      npcReply = { speaker: "陸千帆", line: "帳是平了。這條街的人可未必肯認你。" };
    } else {
    const travel = /^F\. \[前往\] (.+)$/.exec(action);
    const routeTravel = /^F\. \[(明路前往|暗道前往)\] (.+?)（/.exec(action);
    const movement = customAction(action) && /前往|走去|走到|抵達|潛入|闖入|進入/.test(action);
    const destination = routeTravel?.[2] || travel?.[1] || (movement ? LANDMARKS.find((place) => action.includes(place)) : undefined);
    if (destination && LANDMARKS.includes(destination as Landmark)) {
      const routes = travelChoices(state, destination as Landmark);
      const selected = routeTravel ? routes.find((route) => route.label === action) : routes[0];
      if (!selected) event += destination === state.currentLocation ? "你已在此處，無須再走一趟。" : "這條路尚未查明，你留在原地。";
      else {
        travelTurns = selected.turns;
        state.turn += Math.max(0, travelTurns - 1);
        state.currentLocation = destination as Landmark;
        event += `你走${selected.kind === "shortcut" ? "暗道" : "明路"}，費了${travelTurns}回合抵達${destination}。`;
        if (selected.kind === "shortcut") {
          if (state.turn % selected.riskPeriod === 0) {
            if (selected.riskDamage) { state.playerHp = Math.max(1, state.playerHp - selected.riskDamage); event += `暗巷有人攔路，你脫身時氣血減${selected.riskDamage}。`; }
            if (selected.riskLifeline) { state.sectLifeline = Math.max(0, state.sectLifeline - selected.riskLifeline); event += `尾巴跟到堂口據點，青鋒堂命脈減${selected.riskLifeline}。`; }
          }
          else { remember(state, "暗道行跡已藏"); event += "你避過街口眼線，記下對方的守位。"; }
        } else if (travelTurns >= 2 && state.turn % 4 === 0) {
          state.silver += 5;
          event += "途中你替商販搬過一車貨，得五文私銀。";
        } else if (travelTurns === 3 && state.turn % 5 === 0) {
          remember(state, "街面有備");
          event += "你行經幾處路口，記下城東刀手換崗的次序。";
        }
      }
    } else if (destination || (movement && /城東|城南|城北|城中|外城|玄武樓總壇|官府/.test(action))) {
      event += "你走到城西邊界，見外頭有人把守，便折返原地。";
    } else {
      const tag = /^\w\. \[([^\]]+)\]/.exec(action)?.[1] || "";
      const reaction = SANDBOX_REACTIONS[state.currentLocation][tag];
      const sandboxTag = `${state.currentLocation}:${tag}`;
      const repeatable = ["買藥療傷", "習泥鰍步", "習裂石短拳"].includes(tag);
      const repeatedAction = Boolean(reaction?.event) && !repeatable && state.flags.lastSandboxTag === sandboxTag;
      state.flags.repeatedActionCount = repeatedAction ? (state.flags.repeatedActionCount || 0) + 1 : 0;
      state.flags.lastSandboxTag = sandboxTag;
      if (reaction) npcReply = { speaker: reaction.speaker || ({
        "青鋒堂總壇": "何不歸", "晚秋茶寮": "容晚秋", "黑泥街": "陸千帆",
        "鬼骰坊": "祁觀衡", "裂石擂": "衛沉岳", "苦煙館": "顧忘生", "夜雨樓": "柳照霜", "碼頭": "碼頭腳夫",
      } satisfies Record<Landmark, string>)[state.currentLocation], line: reaction.line };
      if (["買石灰包", "買飛蝗石", "買袖藏短刺"].includes(tag)
        && (state.currentLocation === "青鋒堂總壇" || state.currentLocation === "裂石擂")) {
        const item = tag === "買石灰包" ? "【生石灰包】" : tag === "買飛蝗石" ? "【飛蝗石】" : "【袖藏短刺】";
        if (state.silver >= DARK_HAND_PRICE && state.inventory.length < state.maxInventory
          && darkHandCount(state.inventory) < DARK_HAND_LIMIT) {
          state.silver -= DARK_HAND_PRICE;
          state.inventory.push(item);
          event += `你付五文私銀，把${item}藏進袖中。`;
        } else event += "私銀不足或行囊已滿，這件暗手未能帶走。";
        npcReply = { speaker: state.currentLocation === "青鋒堂總壇" ? "何不歸" : "衛沉岳",
          line: "藏穩。用過便沒了，別指望第二回還在袖裡。" };
      } else if (tag === "拾碎骨" || tag === "刮爐灰") {
        const source = SCAVENGE_SOURCES[state.currentLocation as keyof typeof SCAVENGE_SOURCES];
        if (source && !state.sceneState!.depletedSources.includes(source.key)
          && state.inventory.length < state.maxInventory && darkHandCount(state.inventory) < DARK_HAND_LIMIT) {
          state.inventory.push(source.item);
          state.sceneState!.depletedSources.push(source.key);
          if (tag === "拾碎骨") state.playerHp = Math.max(1, state.playerHp - 2);
          else state.sectLifeline = Math.max(0, state.sectLifeline - 1);
          event += tag === "拾碎骨" ? "你在肉案下拾起一片碎骨藏袖。刀手認了你的背影，街口已失先機。"
            : "你趁土灶熄火刮起爐灰藏袖。幾個茶客見了，轉頭便有人傳話。";
        } else event += "這處材料已被拿盡，或你再無空位藏暗手。";
        npcReply = { speaker: state.currentLocation === "黑泥街" ? "陸千帆" : "容晚秋",
          line: "東西拿到了，腳步也讓人聽見了。" };
      } else if (state.currentLocation === "鬼骰坊" && tag === "查賬房雜物") {
        openEntrance(state.sceneState!, "鬼骰坊");
        event += "你搬開賬房後的雜物，摸到鐵柵活門，從箱底找出鏽鑰開鎖。門下暗路通茶寮土灶與夜雨樓酒窖。";
        npcReply = { speaker: "祁觀衡", line: "門在這裡。進去後別把人領回來。" };
      } else if (state.currentLocation === "夜雨樓" && tag === "查酒窖巨桶") {
        openEntrance(state.sceneState!, "夜雨樓");
        event += "你避開護院，下酒窖鑽進廢桶，摸出桶底暗門。路通鬼骰坊賬房的地下樞紐。";
        npcReply = { speaker: "柳照霜", line: "桶底那扇門，你自己記住。" };
      } else if (state.currentLocation === "晚秋茶寮" && tag === "移開灶底石板") {
        openEntrance(state.sceneState!, "晚秋茶寮");
        state.sectLifeline = Math.max(0, state.sectLifeline - 1);
        event += "你趁容晚秋起身招呼茶客，掀開土灶底的空心石板。有人看見你鑽下去，街口眼線開始尋路。";
        npcReply = { speaker: "容晚秋", line: "洞開了就快走。再磨蹭，人就跟下來。" };
      } else if (state.currentLocation === "苦煙館" && tag === "辨無名藥粉") {
        if (state.relationships["顧忘生"].trust >= 1) {
          state.sceneState!.medicineIdentified = true;
          event += `顧忘生取下櫃後瓷瓶，倒出少許粉末驗過。那是${state.sceneState!.medicineKind}，沾到口鼻會使人手腳發軟。`;
          npcReply = { speaker: "顧忘生", line: "這瓶是散氣粉。別拿它當傷藥。" };
        } else {
          event += "你指向櫃後無標瓷瓶，顧忘生按住瓶口，沒有交到你手上。";
          npcReply = { speaker: "顧忘生", line: "先把手拿開。你我還沒熟到能亂碰藥。" };
        }
      } else if (state.currentLocation === "苦煙館" && tag === "盲用藥粉") {
        const bottle = state.sceneState!;
        if (!bottle.medicineIdentified && !bottle.medicineUsed) {
          bottle.medicineUsed = true;
          bottle.objectHolders["無名藥粉瓷瓶"] = "已耗盡";
          state.playerHp = Math.max(1, state.playerHp - 2);
          state.playerMp = Math.max(0, state.playerMp - 4);
          event += `你越過櫃檯搶下無標瓷瓶，揭蓋時吸進一口${bottle.medicineKind}。顧忘生奪回空瓶，你扶著木架才站穩。`;
          npcReply = { speaker: "顧忘生", line: "敢在我店裡亂吞藥？下次未必還站得起來。" };
        }
      } else if (customAction(action) && /撒沙|撒泥|石灰|撩陰|掀桌|掀枱|逃跑|裝死/.test(action)) {
        const suited = /手疾|身法|靈巧|扒手|察言|皮糙|命硬/.test(state.trait);
        event += suited ? "你使出市井陰招，借自身所長甩開眼線。" : "你使出市井陰招，卻手慢半拍，只勉強保住退路。";
      } else if (state.currentLocation === "裂石擂" && tag === "打黑拳") {
        if (state.playerHp > 10) {
          state.combat = createCombat("arena");
          event += "你踏進裂石擂。對手在圍欄另一端沉肩，拳未出，已在試你的門戶。打贏才有二十文賞錢。";
        } else event += "你傷得太重，衛沉岳攔住你上擂台。";
      } else if ((state.currentLocation === "青鋒堂總壇" && tag === "習泥鰍步")
        || (state.currentLocation === "裂石擂" && tag === "習裂石短拳")
        || (state.currentLocation === "夜雨樓" && tag === "習卸力手" && state.worldFlags.includes("陌生恩客完成"))
        || (state.currentLocation === "鬼骰坊" && tag === "習辨穴陰招" && state.worldFlags.includes("假借據完成"))) {
        const move = tag === "習泥鰍步" ? "mud_step" : tag === "習裂石短拳" ? "short_punch"
          : tag === "習卸力手" ? "soft_parry" : "point_strike";
        const moveName = move === "mud_step" ? "泥鰍步" : move === "short_punch" ? "裂石短拳"
          : move === "soft_parry" ? "卸力手" : "辨穴陰招";
        const teacher = move === "mud_step" ? "何不歸" : move === "short_punch" ? "衛沉岳"
          : move === "soft_parry" ? "柳照霜" : "祁觀衡";
        const rank = state.knownMoves?.[move] || 0;
        const lesson = trainMove(rank, state.playerMp, state.silver);
        if (lesson.success) {
          state.playerMp -= lesson.mpCost;
          state.silver -= lesson.silverCost;
          state.knownMoves = { ...state.knownMoves, [move]: lesson.rank };
          event += `你跟著${teacher}拆過一遍招，${moveName}練到第${lesson.rank}層；精力減${lesson.mpCost}${lesson.silverCost ? `，私銀減${lesson.silverCost}文` : ""}。`;
        } else event += lesson.reason;
      } else if (state.currentLocation === "裂石擂" && tag === "整備兵器") {
        if (!state.inventory.includes("【生鏽鐵刀】")) {
          if (state.silver >= 40 && state.inventory.length < state.maxInventory) {
            state.silver -= 40;
            state.inventory.push("【生鏽鐵刀】");
            state.equippedWeapon = "rusty_knife";
            state.weaponDurability = WEAPONS.rusty_knife.maxDurability;
            event += "你花四十文私銀買下生鏽鐵刀，握柄雖舊，刀口尚能傷人。你將刀佩在身側。";
          } else event += state.silver < 40 ? "你拿不出四十文私銀，衛沉岳叫你先把拳練穩。" : "行囊已滿，這把刀暫且帶不走。";
        } else if (state.equippedWeapon === "rusty_knife") {
          state.equippedWeapon = "fists";
          event += "你把生鏽鐵刀收入鞘中，騰出雙手運拳。";
        } else if ((state.weaponDurability || 0) < WEAPONS.rusty_knife.maxDurability) {
          if (state.silver >= 10) {
            state.silver -= 10;
            state.equippedWeapon = "rusty_knife";
            state.weaponDurability = WEAPONS.rusty_knife.maxDurability;
            event += "你花十文私銀磨好刀口，將生鏽鐵刀重新佩妥。";
          } else event += "刀口可磨，錢卻不能賒。你尚欠十文私銀。";
        } else {
          state.equippedWeapon = "rusty_knife";
          event += "你試過刀鋒，將生鏽鐵刀佩在身側。";
        }
      } else if (state.currentLocation === "晚秋茶寮" && tag === "買消息") {
        if (state.worldFlags.includes("茶寮街訊已購")) {
          event += "你再問一遍，容晚秋手上暫無新消息，沒有收你的錢。";
          npcReply = { speaker: "容晚秋", line: "消息沒變，這回不收錢。等有人走過街口再來。" };
        } else if (state.silver >= 10) {
          state.silver -= 10;
          remember(state, "茶寮街訊已購");
          remember(state, "街面有備");
          event += `你付十文私銀買消息。${reaction?.event || ""}`;
        } else {
          event += "你拿不出十文私銀，容晚秋沒有說出街口新消息。";
          npcReply = { speaker: "容晚秋", line: "我靠這些消息過活。十文錢帶來，再談街口的事。" };
        }
      } else if (state.currentLocation === "晚秋茶寮" && tag === "買暗道") {
        if (state.worldFlags.includes("茶寮暗道已知")) {
          event += "你重問通往夜雨樓的暗道，路線沒有改，容晚秋沒有再收錢。";
          npcReply = { speaker: "容晚秋", line: "路還是那條路。記得看身後有沒有人跟著。" };
        } else if (state.silver >= 15) {
          state.silver -= 15;
          remember(state, "茶寮暗道已知");
          revealEntrance(state.sceneState!, "晚秋茶寮");
          revealEntrance(state.sceneState!, "夜雨樓");
          event += `你付十五文私銀買暗道消息。${reaction?.event || ""}`;
        } else {
          event += "你拿不出十五文私銀，容晚秋沒有說出暗道入口。";
          npcReply = { speaker: "容晚秋", line: "那條路值十五文。錢帶來，我才說入口在哪裏。" };
        }
      } else if (state.currentLocation === "青鋒堂總壇" && tag === "捐銀固防") {
        if (state.silver >= 20) { state.silver -= 20; state.factionFunds += 20; state.sectLifeline = Math.min(100, state.sectLifeline + 10); event += "你捐二十文私銀入公帳，何不歸收下後安排人手換門閂、補傷藥；青鋒堂命脈升十。"; }
        else event += "你私銀不足二十文，何不歸叫你先留錢買藥。";
      } else if (state.currentLocation === "青鋒堂總壇" && tag === "休整") {
        const { hp: hpRestored, mp: mpRestored } = restoreVitals(state, 0.2);
        event += `你在總壇靜坐調息，氣血回復${hpRestored}，精力回復${mpRestored}。`;
      } else if (state.currentLocation === "黑泥街" && tag === "巡街收規") {
        const outstanding = state.worldFlags.includes("張斷骨規費未收") ? 50
          : state.worldFlags.includes("張斷骨欠費三十文") ? 30
            : state.worldFlags.includes("張斷骨欠費二十文") ? 20 : 0;
        if (outstanding && !state.worldFlags.includes("張斷骨舊費已清")) {
          state.factionFunds += outstanding;
          state.flags.collectedMarketFee = true;
          state.flags.lastMarketDuesTurn = state.turn;
          remember(state, "張斷骨舊費已清");
          event += `你持著舊帳回到肉檔，張斷骨終於交出所欠的${outstanding}文。你逐文數清，記入青鋒堂公款。`;
        } else if (state.turn - (state.flags.lastMarketDuesTurn || 0) >= 3) {
          state.factionFunds += 10; state.flags.lastMarketDuesTurn = state.turn;
          event += "你沿黑泥街逐攤收規，十文錢在掌中數清，當場記入青鋒堂公款。";
        } else event += "你巡了一圈，今日規費早已收過，無人再交錢。";
      } else if (state.currentLocation === "黑泥街" && tag === "搬貨") {
        if (!state.flags.lastJobTurn || state.turn - state.flags.lastJobTurn >= 3) {
          state.silver += 6; state.flags.lastJobTurn = state.turn;
          event += "你替商販搬完一車貨，又照料騾車，領到六文私銀。";
          npcReply = { speaker: "陸千帆", line: "這錢是你做活賺的，收好。" };
        } else event += "上一車貨才剛卸下，商販暫時沒有新活。";
      } else if (state.currentLocation === "鬼骰坊" && tag === "押小") {
        if (state.silver >= 10) {
          const readTable = state.worldFlags.includes("已看透骰局");
          const won = readTable || state.turn % 2 === 0;
          if (readTable) state.worldFlags = state.worldFlags.filter((flag) => flag !== "已看透骰局");
          state.silver += won ? 10 : -10;
          event += won
            ? `骰盅落桌，你押在小上的十文私銀贏了。${readTable ? "先前看出的手勢讓你避開了莊家的圈套；" : ""}祁觀衡把銅錢撥回你面前，這一局私銀淨增十文。`
            : "骰盅落桌，你押在小上的十文私銀卻開了大。祁觀衡把銅錢撥到莊家那邊；這一局私銀減少十文。";
        } else event += "你掏不出十文私銀，祁觀衡不讓你下注。";
      } else if (state.currentLocation === "鬼骰坊" && (tag === "查老千" || tag === "核暗帳")) {
        const recoveredFlag = tag === "查老千" ? "老千贓款已收" : "賭坊錯帳已收";
        const recovered = tag === "查老千" ? 10 : 5;
        event += reaction?.event || "";
        if (!state.worldFlags.includes(recoveredFlag)) {
          state.factionFunds += recovered;
          remember(state, recoveredFlag);
          event += `祁觀衡查實後收回${recovered}文，記入青鋒堂公款。`;
        } else event += "這筆舊款已經收回，再查也變不出第二份。";
        remember(state, "帳目有據");
      } else if (state.currentLocation === "苦煙館" && tag === "買藥療傷") {
        if (state.playerHp === state.maxHp && state.playerMp === state.maxMp) {
          event += "你氣血與精力都已充足，顧忘生沒有收錢配藥。";
        } else if (state.silver >= 10) {
          state.silver -= 10;
          const { hp: hpRestored, mp: mpRestored } = restoreVitals(state, 0.35);
          event += `你付十文私銀請顧忘生配藥，敷藥後調勻氣息；氣血回復${hpRestored}，精力回復${mpRestored}。`;
        } else event += "你拿不出十文私銀，顧忘生沒有給你藥。";
      } else if (state.currentLocation === "苦煙館" && tag === "買藥帶走") {
        if (state.inventory.length >= state.maxInventory) event += "行囊已滿，顧忘生沒有收錢，也沒有交藥。";
        else if (state.silver < 10) event += "你拿不出十文私銀，顧忘生沒有交藥。";
        else {
          state.silver -= 10;
          state.inventory.push(PACKED_MEDICINE);
          event += "你付十文私銀買下一包療傷藥，封好放入行囊；留待受傷時使用。";
        }
      } else if (tag === "服用療傷藥") {
        const restored = consumePackedMedicine(state);
        event += restored
          ? `你拆開行囊裏一包療傷藥，氣血回復${restored.hp}，精力回復${restored.mp}。`
          : "你沒有可用的療傷藥，或氣血與精力都已充足。";
      } else if (state.currentLocation === "夜雨樓" && tag === "斷開跟梢") {
        if (state.playerMp >= 4) {
          state.playerMp -= 4;
          state.sectLifeline = Math.min(100, state.sectLifeline + 4);
          event += "你耗去四點精力甩開尾巴，替堂口藏住行跡；青鋒堂命脈升四。";
        } else event += "你氣力不足，才到側門便被身後的人重新盯上。";
      } else if (repeatedAction) {
        event += `你再次查問${tag}，眼前沒有新的線索。`;
        if (npcReply) npcReply.line = repeatedNpcLine(npcReply.speaker, state.flags.repeatedActionCount || 1);
      } else {
        event += reaction?.event || `你在${state.currentLocation}照自己的意思行事，留意四下動靜。`;
        const clue = SANDBOX_CLUES[sandboxTag];
        if (clue && !state.worldFlags.includes(clue)) {
          remember(state, clue);
          event += clue === "已看透骰局" ? "你看出莊家收手的暗號，下一局押注便有了把握。"
            : clue === "帳目有據" ? "這筆線索留在帳上，日後若有缺頁便能對照。"
              : clue === "傷藥有據" ? "你把藥色與封口記牢，日後驗藥便有了憑據。"
                : "你記下街面異動，往後遇上刀手便可早作防備。";
        }
      }
      if (sandboxTag === "黑泥街:找陸千帆" && npcReply) {
        const relation = state.relationships["陸千帆"];
        npcReply.line = relation.wounded ? "這道傷還拖著我。若你真要我幫忙，先去苦煙館找顧忘生。"
          : relation.trust >= 2 ? "後巷我替你看過。你若要走暗路，先來找我。"
            : relation.trust < 0 ? "我走得動。你的帳先算清，別叫我替你收尾。"
              : npcReply.line;
      }
    }
    }
    }
    state.sectLifeline = Math.max(0, state.sectLifeline - travelTurns);
    event += `玄武樓趁這${travelTurns === 1 ? "一回合" : `${travelTurns}回合`}向城西施壓；青鋒堂命脈減${travelTurns}。`;
    if (state.currentLocation === "青鋒堂總壇" && state.worldFlags.includes("私吞五十文規費") && !state.worldFlags.includes("何不歸查出私吞")) {
      state.sectLifeline = Math.max(0, state.sectLifeline - 8);
      remember(state, "何不歸查出私吞");
      event += "你見何不歸查出私吞規費，防線再減八。";
    }
    if (!state.combat && !pendingIncident && state.turn >= 8 && state.turn - (state.flags.lastIncidentTurn || 0) >= 5) {
      const incident = INCIDENTS[(state.flags.incidentCount || 0) % INCIDENTS.length];
      state.flags.pendingIncident = incident;
      state.flags.lastIncidentTurn = state.turn;
      state.flags.incidentCount = (state.flags.incidentCount || 0) + 1;
      event = INCIDENT_REPORTS[incident] + event;
      npcReply = incident === "missing_ledger"
        ? { speaker: "何不歸", line: "少一頁帳，我替你擋不了多久。先查誰摸過。" }
        : incident === "tainted_medicine"
          ? { speaker: "容晚秋", line: "封口給人動過。快叫各處先別用藥。" }
          : { speaker: "陸千帆", line: "刀手又來插旗。我守肉檔，你拿主意。" };
    }
  }

  if (state.questStep === "sandbox" && startingLocation !== "黑泥街" && state.currentLocation === "黑泥街"
    && state.worldFlags.includes("打斷張斷骨右手") && !state.worldFlags.includes("屠戶避讓")) {
    remember(state, "屠戶避讓");
    event += "你見張斷骨避開目光，肉檔再沒人敢當面頂撞。";
  }
  event += settleCustomEchoes(state);
  if (state.questStep === "sandbox" && (state.sectLifeline === 0 || state.turn >= 70)) {
    state.flags.finalCrisis = true;
    state.flags.pendingIncident = undefined;
    state.flags.customEchoes = [];
    remember(state, "城東吞併危機");
    event += "玄武樓已向城西七處據點同時插旗。何不歸召集殘部，請你決定最後去路。";
  }

  if (!opening && !wasInCombat) {
    const cost = travelTurns === plannedTurns ? energyCost
      : actionEnergyCost({ ...state, playerMp: startingEnergy, questStep: rawState.questStep }, action, travelTurns);
    event += spendEnergy(state, cost, Math.max(0, startingEnergy - state.playerMp), /\[(?:明路前往|暗道前往|前往)\]/.test(action));
  }
  const changes: string[] = [];
  if (state.silver !== oldSilver) changes.push(`私銀${state.silver > oldSilver ? "增加" : "減少"}${Math.abs(state.silver - oldSilver)}文`);
  if (state.factionFunds !== oldFunds) {
    changes.push(`公款${state.factionFunds > oldFunds ? "增加" : "減少"}${Math.abs(state.factionFunds - oldFunds)}文`);
    state.flags.treasuryChange = { delta: state.factionFunds - oldFunds, reason: "本回合公款收支", turn: state.turn };
  }
  return { state, options: availableOptions(state), event: event.trim(), moneyNote: changes.join("，"), npcReply };
}

export function availableOptions(state: GameState): string[] {
  if (state.questStep === "chapter_one" || state.flags.ending) return chapterOneOptions(state);
  if (state.flags.finalCrisis) return ENDING_OPTIONS;
  if (state.flags.alleyEscape) return alleyOptions(state);
  if (state.combat || state.questStep === "huizhi_ambush") {
    const combat = state.combat || createCombat("market_ambush", !state.worldFlags.includes("出賣陸千帆"));
    return availableWithEnergy(state, combatOptions(combat, state.equippedWeapon || "fists", state.knownMoves || {}, state.playerMp,
      !state.inventory.includes("【生鏽鐵刀】"), readyDarkHand(state.inventory)));
  }
  const base = state.questStep === "prologue_briefing" ? PROLOGUE_OPTIONS
    : state.questStep === "kuyan_medicine" ? GU_OPTIONS
    : state.questStep === "yung_tea_stall" ? TEA_OPTIONS
    : state.questStep === "market_collection" ? MARKET_OPTIONS
    : state.flags.pendingIncident ? INCIDENT_OPTIONS[state.flags.pendingIncident].map((option, index) => {
      const destination: Landmark | undefined = state.flags.pendingIncident === "market_raid" && index !== 3 ? "黑泥街"
        : state.flags.pendingIncident === "missing_ledger" ? (["鬼骰坊", "晚秋茶寮", "黑泥街"] as Landmark[])[index]
          : state.flags.pendingIncident === "tainted_medicine" ? (["晚秋茶寮", "苦煙館", "晚秋茶寮"] as Landmark[])[index] : undefined;
      if (!destination || destination === state.currentLocation) return option;
      const turns = travelChoices(state, destination)[0].turns;
      return `${option}（須赴${destination}，共${turns}回合）`;
    })
    : state.currentLocation === "青鋒堂總壇"
      ? SANDBOX_OPTIONS["青鋒堂總壇"].map((option) => option.startsWith("E.")
        ? (state.knownMoves?.mud_step || 0) >= 3 ? "E. [習泥鰍步] 已練到第三層；再問堂主，只能重溫舊招。"
          : `E. [習泥鰍步] 向堂主修習保命步法；目前第${state.knownMoves?.mud_step || 0}層，耗精力${[4, 6, 8][state.knownMoves?.mud_step || 0]}。` : option)
    : state.currentLocation === "晚秋茶寮"
      ? SANDBOX_OPTIONS["晚秋茶寮"].map((option) => option.startsWith("A.") && state.worldFlags.includes("茶寮街訊已購")
        ? "A. [買消息] 街口消息已知；再問不另收錢。"
        : option.startsWith("B.") && state.worldFlags.includes("茶寮暗道已知")
          ? "B. [買暗道] 夜雨樓暗道已知；再問不另收錢。" : option)
    : state.currentLocation === "黑泥街"
      ? SANDBOX_OPTIONS["黑泥街"].map((option) => {
        if (option.startsWith("A.") && !state.worldFlags.includes("張斷骨舊費已清")) {
          const due = state.worldFlags.includes("張斷骨規費未收") ? 50
            : state.worldFlags.includes("張斷骨欠費三十文") ? 30
              : state.worldFlags.includes("張斷骨欠費二十文") ? 20 : 0;
          if (due) return `A. [巡街收規] 追收張斷骨所欠${due}文規費，記入公款。`;
        }
        return option.startsWith("C.") && state.worldFlags.includes("出賣陸千帆")
          ? "C. [查眼線] 留意玄武樓眼線。" : option;
      })
      : state.currentLocation === "鬼骰坊"
        ? SANDBOX_OPTIONS["鬼骰坊"].map((option) =>
          option.startsWith("D.") && state.worldFlags.includes("老千贓款已收")
            ? "D. [查老千] 再查賭桌手法；舊贓款已收，未必有新所得。"
            : option.startsWith("E.") && state.worldFlags.includes("賭坊錯帳已收")
              ? "E. [核暗帳] 再核暗帳；舊錯帳已清，未必有新所得。" : option)
      : state.currentLocation === "裂石擂"
        ? SANDBOX_OPTIONS["裂石擂"].map((option) => {
          if (option.startsWith("B.")) return (state.knownMoves?.short_punch || 0) >= 3
            ? "B. [習裂石短拳] 已練到第三層；再問衛沉岳，只能重溫舊招。"
            : `B. [習裂石短拳] 向衛沉岳習拳；目前第${state.knownMoves?.short_punch || 0}層，耗精力${[4, 6, 8][state.knownMoves?.short_punch || 0]}。`;
          if (option.startsWith("E.") && state.inventory.includes("【生鏽鐵刀】")) return state.equippedWeapon === "rusty_knife"
            ? "E. [整備兵器] 收刀改用徒手；須花一回合。"
            : (state.weaponDurability || 0) < WEAPONS.rusty_knife.maxDurability
              ? "E. [整備兵器] 花十文私銀修磨生鏽鐵刀，然後佩刀。"
              : "E. [整備兵器] 佩上生鏽鐵刀；須花一回合。";
          return option;
        })
      : SANDBOX_OPTIONS[state.currentLocation];
  if (state.questStep !== "sandbox" || state.flags.pendingIncident) return availableWithEnergy(state, base);
  const training = state.currentLocation === "夜雨樓" && state.worldFlags.includes("陌生恩客完成") && (state.knownMoves?.soft_parry || 0) < 3
    ? [`I. [習卸力手] 向柳照霜習招；目前第${state.knownMoves?.soft_parry || 0}層，耗精力${[4, 6, 8][state.knownMoves?.soft_parry || 0] ?? 0}、私銀${[0, 10, 20][state.knownMoves?.soft_parry || 0] ?? 0}文。`]
    : state.currentLocation === "鬼骰坊" && state.worldFlags.includes("假借據完成") && (state.knownMoves?.point_strike || 0) < 3
      ? [`I. [習辨穴陰招] 向祁觀衡習招；目前第${state.knownMoves?.point_strike || 0}層，耗精力${[4, 6, 8][state.knownMoves?.point_strike || 0] ?? 0}、私銀${[0, 10, 20][state.knownMoves?.point_strike || 0] ?? 0}文。`]
      : [];
  const missionCount = state.worldFlags.filter((flag) => flag.endsWith("完成")).length;
  const sideWork: string[] = [];
  if (missionCount >= 3 && state.currentLocation === "夜雨樓" && !state.worldFlags.includes("暗殺令已接"))
    sideWork.push("J. [接暗殺令] 柳照霜轉介城西刀手頭目；事成可得四十文私銀，失手會受傷。");
  if (state.currentLocation === "黑泥街" && state.worldFlags.includes("暗殺令已接") && !state.worldFlags.includes("暗殺令已結"))
    sideWork.push("J. [執行暗殺令] 伏擊刀手頭目；至少兩層進擊招數及二十五氣血較有把握；成功仍傷十二氣血、命脈減六。");
  if (missionCount >= 3 && state.currentLocation === "鬼骰坊") {
    if (!state.flags.loanDueTurn) sideWork.push("J. [私銀放貸] 自掏二十文，五回合後可收二十六文；收款時命脈減三。");
    else if (state.turn >= state.flags.loanDueTurn) sideWork.push("J. [收回私貸] 收回二十六文；欠債人生計受損，命脈減三。");
  }
  if (state.currentLocation === "鬼骰坊" && state.worldFlags.includes("假借據完成") && !state.worldFlags.includes("追債令已領"))
    sideWork.push("K. [領追債令] 祁觀衡授權追黑泥街舊款；公數入帳，另領佣金。");
  if (state.currentLocation === "黑泥街" && state.worldFlags.includes("追債令已領") && !state.worldFlags.includes("追債令已結")) {
    sideWork.push("K. [和談追債] 追回十五文公數，領五文私銀佣金；留下餘款欠條。");
    sideWork.push("L. [強追欠款] 追回二十文公數，領八文私銀佣金；命脈減五。");
  }
  if (state.currentLocation === "黑泥街" && state.relationships["陸千帆"].trust >= 2
    && !state.relationships["陸千帆"].wounded && !state.relationships["陸千帆"].estranged
    && !state.worldFlags.includes("熟記市集暗巷"))
    sideWork.push("M. [請陸千帆指路] 請他帶你認清黑泥街後巷，發現往總壇的暗道。");
  if (state.currentLocation === "苦煙館" && state.relationships["陸千帆"].wounded
    && !state.relationships["陸千帆"].estranged)
    sideWork.push("M. [為陸千帆求藥] 自掏十文私銀請顧忘生療傷；傷勢穩定後可再同行。");
  if (state.currentLocation === "青鋒堂總壇" && state.customActionUses < CUSTOM_ACTION_MAX)
    sideWork.push(`N. [請堂主授機變] 付${CUSTOM_ACTION_PRICE}文私銀，請堂主補給一次機變；公款不動。`);
  if (state.currentLocation === "青鋒堂總壇" && state.flags.checkpointReady && !state.flags.midpointBriefed)
    sideWork.push("O. [向堂主交代] 整理首輪三件城西急事，留下後半程的中期存檔。");
  if (state.currentLocation === "青鋒堂總壇" || state.currentLocation === "裂石擂")
    sideWork.push(...darkHandPurchaseOptions(state));
  const scavenge = SCAVENGE_SOURCES[state.currentLocation as keyof typeof SCAVENGE_SOURCES];
  if (scavenge && state.inventory.length < state.maxInventory && darkHandCount(state.inventory) < DARK_HAND_LIMIT
    && !state.sceneState?.depletedSources.includes(scavenge.key)) sideWork.push(scavenge.label);
  if (state.currentLocation === "鬼骰坊" && !state.sceneState?.openedEntrances.includes("鬼骰坊")
    && (state.worldFlags.includes("帳目有據") || state.worldFlags.includes("假借據完成")))
    sideWork.push("T. [查賬房雜物] 趁打手換位，進賬房搬開雜物；耗一回合，可能驚動守衛。");
  if (state.currentLocation === "夜雨樓" && !state.sceneState?.openedEntrances.includes("夜雨樓")
    && state.worldFlags.includes("陌生恩客完成"))
    sideWork.push("T. [查酒窖巨桶] 避開護院進酒窖，查最深處的舊桶；耗一回合。");
  if (state.currentLocation === "晚秋茶寮" && state.sceneState?.discoveredEntrances.includes("晚秋茶寮")
    && !state.sceneState.openedEntrances.includes("晚秋茶寮"))
    sideWork.push("T. [移開灶底石板] 趁容晚秋招呼茶客，掀開土灶石板；耗一回合，可能走漏風聲。");
  if (state.currentLocation === "苦煙館" && !state.sceneState?.medicineUsed) {
    if (!state.sceneState?.medicineIdentified)
      sideWork.push("T. [辨無名藥粉] 請顧忘生辨清櫃後瓷瓶；須先取得她信任，不能隔櫃取藥。");
    if (!state.sceneState?.medicineIdentified)
      sideWork.push("U. [盲用藥粉] 冒險從櫃後取無標瓷瓶；藥性未知，可能反傷自身。");
  }
  return availableWithEnergy(state, [...base, ...missionOptions(state), ...training, ...sideWork,
    ...(canUsePackedMedicine(state) ? [USE_PACKED_MEDICINE] : [])]);
}
