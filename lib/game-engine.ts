import { renameLegacyWorldNames, repeatedNpcLine } from "./npc-voices.ts";
import { combatOptions, createCombat, normalizeCombat, resolveCombatRound, trainMove, WEAPONS,
  type CombatState, type KnownMoves, type WeaponId } from "./combat-engine.ts";
import { ENDING_OPTIONS, MISSIONS, acceptedMissionIds, missionDone, missionOptions, resolveEnding, resolveMission, travelChoices } from "./city-progression.ts";
import { COMPANION_IDS, applyMissionRelationship, changeTrust, companionLeads, newRelationships, normalizeRelationships,
  type CompanionId, type CompanionRelationships } from "./companion-relations.ts";
import { CREATIVE_GOALS, CUSTOM_ACTION_MAX, claimsUnacquiredObject, isMarketIntentScene, marketIntentTargets, negatesIrreversibleAction,
  sceneAttemptObjects, type CreativeAction, type MarketIntent, type SceneAttempt } from "./custom-action.ts";
import { RAID_TARGETS, advanceChapterSocialTurn, chapterOneOptions, finishChapterTurn, resolveChapterOne, type Business, type ChapterOneState } from "./chapter-one.ts";
import { localNpcReply, MARKET_NPC_REACTIONS, marketDialogueTarget, normalizeMarketNpcHistory, normalizeSocialMemory, socialTargets, socialTopic,
  type MarketNpcExchange, type MarketNpcProposal, type MarketNpcReaction, type SocialIntent, type SocialMemory } from "./social-influence.ts";
import { PACKED_MEDICINE, USE_PACKED_MEDICINE, USE_HEMOSTATIC_POWDER,
  canUsePackedMedicine, canUseHemostaticPowder, consumePackedMedicine, consumeHemostaticPowder,
  restoreVitals } from "./recovery.ts";
import { MAX_ENERGY, actionEnergyCost, availableWithEnergy, canAffordEnergy, spendEnergy } from "./energy.ts";
import { DARK_HAND_LIMIT, DARK_HAND_PRICE, STARTING_DARK_HAND, SCAVENGE_SOURCES, darkHandCount,
  darkHandPurchaseOptions, dirtyHandModifier, dirtyHandOptionMove, dirtyHandTier, dirtyHandVerb, isDarkHand,
  readyDarkHand, rollD20, type DarkHandItem } from "./dirty-hand.ts";
import { LANDMARK_SCENES, normalizeSceneState, objectStatus, openEntrance, revealEntrance, type SceneState } from "./scene-state.ts";
import { conciseOption } from "./option-text.ts";
import { drawEncounter, encounterChoice, encounterOptions, ENCOUNTERS, resolveEncounter, type EncounterId } from "./encounters.ts";
import { applyActionTags, normalizeRelationshipScores, type RelationshipScores } from "./npc-traits.ts";
import { startingWeaponItem } from "./character-creation.ts";
import { withoutSettlementLog } from "./narrative-style.ts";
import { getPseudoRandom } from "./state-random.ts";
export { getPseudoRandom } from "./state-random.ts";

export const PROLOGUE_LANDMARKS = [
  "青鋒堂總壇", "晚秋茶寮", "黑泥街", "鬼骰坊", "裂石擂", "苦煙館", "夜雨樓",
] as const;
export const LANDMARKS = [...PROLOGUE_LANDMARKS, "碼頭"] as const;

export type Landmark = typeof LANDMARKS[number];
export type QuestStep = "prologue_briefing" | "kuyan_medicine" | "yung_tea_stall" | "market_collection" | "huizhi_ambush" | "sandbox" | "chapter_one";
export type Incident = "market_raid" | "missing_ledger" | "tainted_medicine";
type CustomEcho = CreativeAction & { location: Landmark; dueTurn: number };
export const CUSTOM_ACTION_START = CUSTOM_ACTION_MAX;

export interface HistoryEntry {
  turn: number;
  action: string;
  narrative: string;
  narrativeSource: "API" | "Fallback" | "未記錄";
  preLocation: Landmark | "未記錄";
  postLocation: Landmark | "未記錄";
  questStep: QuestStep | "未記錄";
}

export interface GameState {
  turn: number;
  history?: HistoryEntry[];
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
  hpScaleVersion?: 2;
  playerMp: number;
  maxMp: number;
  silver: number;
  customActionUses: number;
  factionFunds: number;
  sectLifeline: number;
  worldFlags: string[];
  activeMissions: string[];
  lastEncounterTurn: number;
  pendingEncounter?: EncounterId;
  relationships: CompanionRelationships;
  /** Numeric action-tag affinity. Legacy companion trust, wounds and estrangement stay in relationships. */
  relationshipScores: RelationshipScores;
  socialMemory?: SocialMemory;
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
    alleyWall?: boolean;
    alleyAllyPresent?: boolean;
    marketAftermath?: boolean;
    marketAftermathKind?: "victory" | "escape" | "defeat";
    marketIntentHistory?: Array<{ turn: number; approach: MarketIntent["approach"] | "自訂"; target: string; object?: string; outcome: string }>;
    marketNpcHistory?: MarketNpcExchange[];
  };
}

function incidentDue(state: GameState): boolean {
  if (state.turn < 8) return false;
  const elapsed = state.turn - (state.flags.lastIncidentTurn || 0);
  if (elapsed < 3) return false;
  // Growing odds create surprise; the cap prevents a long run without story progress.
  return elapsed >= 10 || getPseudoRandom(state) < Math.min(65, 15 + (elapsed - 3) * 8);
}

function shortcutRiskDue(state: GameState, riskPeriod: number): boolean {
  return riskPeriod > 0 && getPseudoRandom(state) < Math.floor(100 / riskPeriod);
}

export interface TurnResult {
  state: GameState;
  options: string[];
  event: string;
  moneyNote: string;
  npcReply?: { speaker: string; line: string };
}

const PROLOGUE_OPTIONS = [
  "A. [即刻領命] 趕往苦煙館領藥",
  "B. [索取盤纏] 向堂主索十文路費",
  "C. [問清敵情] 問清刀手動向",
  "D. [詳問傷勢] 問清千帆傷勢",
  "E. [記住暗巷] 認清市集退路",
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
  "A. [救護同門] 替陸千帆敷藥止血。",
  "B. [催收規費] 向張斷骨催收五十文規費。",
  "C. [暗查巷口] 辨認巷口刀手的位置。",
  "D. [商議緩交] 與張斷骨談分期交付規費。",
  "E. [護人撤離] 帶陸千帆離開肉檔。",
];

function alleyOptions(state: GameState): string[] {
  if (state.flags.alleyWall) {
    const options = [
      "A. [撞開刀手] 從牆頭撲下撞開守巷的刀手；硬闖須再挨一刀。",
      "B. [借牆脫身] 伏低避開刀鋒，沿牆脊爬往後巷；顧不上肉檔街口。",
      "C. [扯籮阻路] 踢落竹籮絆住追兵，再從牆背落地；若被扯住便要掛彩。",
    ];
    const item = readyDarkHand(state.inventory, false);
    if (item && state.playerMp >= 1) options.push(`I. [${item === STARTING_DARK_HAND ? "撒生石灰" : "施放暗手"}] ${dirtyHandOptionMove(item)}攻刀手`);
    return availableWithEnergy(state, options);
  }
  const options = [
    "A. [硬闖街口] 迎刀撞開肉檔前的守位；可重奪路，但必定掛彩。",
    state.flags.alleyAllyPresent
      ? "B. [伏低護人] 伏進油泥替陸千帆接刀；拖住追兵，讓他先踩竹籮攀牆。"
      : "B. [伏低保命] 伏在油泥裏挨過追兵搜巷，再伺機攀牆。",
    "C. [踢翻餿水桶] 蹬翻巷尾餿水桶；借追兵滑腳一瞬，踩竹籮翻牆。",
    "H. [踩籮翻牆] 把廢竹籮踢到牆邊直攀上去；重物可能甩落牆下。",
  ];
  if (state.flags.alleyAllyPresent && !state.relationships["陸千帆"].wounded)
    options.splice(3, 0, "D. [交畀陸千帆] 讓陸千帆選攀牆時機；他能走動，卻會牽動舊傷。");
  const item = readyDarkHand(state.inventory, false);
  if (item && state.playerMp >= 1) options.push(`I. [${item === STARTING_DARK_HAND ? "撒生石灰" : "施放暗手"}] ${dirtyHandOptionMove(item)}攻刀手`);
  return availableWithEnergy(state, options);
}

function marketAftermathOptions(state: GameState): string[] {
  if (state.flags.marketAftermathKind === "defeat") return availableWithEnergy(state, [
    state.flags.alleyAllyPresent ? "C. [檢視傷勢] 扶陸千帆退到肉檔後" : "C. [裹緊傷口] 按住刀口退往後巷",
    "D. [伏身避刀] 借肉案遮身避開追兵",
    "G. [撤離街口] 沿後巷退出失守街口",
  ]);
  if (state.flags.marketAftermathKind === "escape") return availableWithEnergy(state, [
    state.flags.alleyAllyPresent
      ? "C. [檢視傷勢] 退到後巷替陸千帆壓住傷口；別讓追兵循血找來。"
      : "C. [裹緊傷口] 在後巷撕布裹住刀口；先止血再動身。",
    state.sceneState?.depletedSources.includes("廢竹籮")
      ? "D. [封住退路] 堆起散竹守住後巷轉角；只能示警，擋不住追兵。"
      : "D. [封住退路] 把竹籮堵在牆背，守住後巷轉角；防追兵翻牆。",
    "G. [離巷收隊] 沿後巷撤回青鋒堂勢力範圍；先甩開刀手再接別的事。",
  ]);
  const options = [
    ...(state.flags.alleyAllyPresent && !state.relationships["陸千帆"].estranged
      ? ["C. [檢視傷勢] 撕布替陸千帆壓住肋下刀口；先穩住他，別讓血浸透衣衫。"]
      : ["C. [裹緊傷口] 撕布按住自己身上的刀口；先止血，再看街口動靜。"]),
    "D. [伏巷警戒] 伏在巷口盯緊退路；防備刀手轉頭殺回來。",
    "E. [盤問張斷骨] 扣住躲在肉案後的張斷骨；問清誰把刀手放進街口。",
    "G. [安頓收隊] 叫同門看住巷口，送傷者離開肉檔；街面穩住才接下一樁事。",
  ];
  const source = SCAVENGE_SOURCES["黑泥街"];
  if (!state.sceneState?.depletedSources.includes(source.key) && state.inventory.length < state.maxInventory
    && darkHandCount(state.inventory) < DARK_HAND_LIMIT)
    options.push("S. [搜刮殘局] 從肉案血水裡拾起碎骨藏袖；眼線會記住你在現場停留。");
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

const INCIDENT_REPORTS: Record<Incident, (location: Landmark) => string> = {
  market_raid: (location) => `你在${location}收到市集急報：玄武樓刀手在肉檔插旗，攤販被逼交兩份規費。你得決定如何護住城西的人。`,
  missing_ledger: (location) => `你在${location}收到堂口遞來的缺頁帳目，鬼骰坊與市集的數目對不上。何不歸要你先查清帳，再碰公款。`,
  tainted_medicine: (location) => `你在${location}聽腳夫報信：茶寮那批傷藥的封口被換過，已有傷者用了藥。城西各處正等你拿主意。`,
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
    "斷開跟梢": { event: "你在夜雨樓側門甩開身後尾巴，回身守住樓內的退路。", line: "側門借你走。下一次，別把人帶到我樓前。" },
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
  if (background === "賭坊收帳人" || background === "爛賭收數佬") return { hp: 20, mp: MAX_ENERGY };
  if (background === "城西街童扒手") return { hp: 18, mp: MAX_ENERGY };
  if (background === "落魄武館棄徒" || background === "濕鳩武館棄徒") return { hp: 28, mp: MAX_ENERGY };
  if (background === "黑市醫道學徒") return { hp: 16, mp: MAX_ENERGY };
  const hp = /醫|毒|藥|術|病/.test(trait) ? 16
    : /扒|偷|摸鎖|開鎖|身法|靈巧|眼快|輕功/.test(trait) ? 18
      : /刀|劍|棍|武|拳|皮厚|命硬|神力|壯/.test(trait) ? 24 : 20;
  return { hp, mp: MAX_ENERGY };
}

export const OPENING_CITY_NARRATION = `明末年間，青山城城主燕鎮嶽手握重兵，以兵權壓制城東、城南、城西三方勢力。

城東玄武樓樓主裴無鋒正逐漸侵奪城西，圖謀吞併青鋒堂與城南金冊莊，獨掌城中地下秩序；

城南金冊莊莊主黃萬鈞表面替城主經營銀號及管理地契，暗中卻與城外不明勢力往來。

城西青鋒堂堂主何不歸堅守地盤，不願靠掠奪與傷害無辜壯大堂口，誓要讓同門與街坊在此共存。

城北官衙的玄渡奉朝廷密旨坐鎮，表面維持法度，暗中監視燕鎮嶽與城中各方勢力。`;
// Opening facts are handed to the narrator; the engine does not write dialogue.
export const OPENING_MISSION_FACTS = "陸千帆被玄武樓的人所傷；玄武樓正逼近黑泥街。青鋒堂要守住街坊。先到苦煙館找顧忘生領止血膏藥，再到黑泥街市集救陸千帆；張斷骨的五十文規費也須帶回。";

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
    if (missionDone(worldFlags, mission))
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
  const savedMaxHp = finite(value.maxHp, stats.hp, 1, 170);
  const legacyHp = value.hpScaleVersion !== 2 && savedMaxHp > 40;
  const maxHp = legacyHp ? stats.hp : savedMaxHp;
  const playerHp = legacyHp
    ? Math.min(maxHp, Math.ceil(finite(value.playerHp, savedMaxHp, 0, savedMaxHp) / savedMaxHp * maxHp))
    : finite(value.playerHp, maxHp, 0, maxHp);
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
  for (const [oldClue, missionId] of [
    ["城東假契證據", "forged_deed"], ["前線守備有序", "arena_probe"],
    ["傷藥來源已查", "tainted_medicine"], ["城東耳目已識破", "hidden_spy"],
  ] as const) {
    const clue = MISSIONS.find((mission) => mission.id === missionId)?.clue;
    if (clue && worldFlags.includes(oldClue) && !worldFlags.includes(clue)) worldFlags.push(clue);
  }
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
  const borrowedLegacyKnife = sceneState.objectHolders["牛肉刀"] === "玩家" && inventory.includes("【生鏽鐵刀】")
    && !inventory.includes("【牛肉刀】");
  if (borrowedLegacyKnife) inventory[inventory.indexOf("【生鏽鐵刀】")] = "【牛肉刀】";
  const combat = normalizeCombat(value.combat);
  const activeCombat = combat && ((combat.scenario === "market_ambush" && value.questStep === "huizhi_ambush")
    || (combat.scenario === "arena" && value.questStep === "sandbox")) ? combat : undefined;
  const equippedStartingItem = value.equippedWeapon ? startingWeaponItem(value.equippedWeapon) : undefined;
  const equippedWeapon: WeaponId = value.equippedWeapon === "captured_knife" && inventory.includes("【奪來短刀】")
    ? "captured_knife" : value.equippedWeapon === "rusty_knife" && inventory.includes("【生鏽鐵刀】")
    ? "rusty_knife" : (value.equippedWeapon === "beef_knife" || borrowedLegacyKnife && value.equippedWeapon === "rusty_knife")
      && inventory.includes("【牛肉刀】") ? "beef_knife" : value.equippedWeapon === "wooden_stick" && activeCombat?.scenario === "market_ambush"
      ? "wooden_stick" : equippedStartingItem && inventory.includes(equippedStartingItem)
        ? value.equippedWeapon! : "fists";
  const weaponDurability = equippedWeapon === "captured_knife"
    ? finite(value.weaponDurability, WEAPONS.captured_knife.maxDurability, 0, WEAPONS.captured_knife.maxDurability)
    : equippedStartingItem && equippedWeapon !== "fists"
    ? finite(value.weaponDurability, WEAPONS[equippedWeapon].maxDurability, 0, WEAPONS[equippedWeapon].maxDurability)
    : inventory.includes("【牛肉刀】")
    ? finite(value.weaponDurability, WEAPONS.beef_knife.maxDurability, 0, WEAPONS.beef_knife.maxDurability)
    : inventory.includes("【生鏽鐵刀】")
    ? finite(value.weaponDurability, WEAPONS.rusty_knife.maxDurability, 0, WEAPONS.rusty_knife.maxDurability)
    : equippedWeapon === "wooden_stick" ? finite(value.weaponDurability, WEAPONS.wooden_stick.maxDurability, 0, WEAPONS.wooden_stick.maxDurability) : 0;
  const rawMoves = value.knownMoves && typeof value.knownMoves === "object" ? value.knownMoves : {};
  const knownMoves: KnownMoves = {
    mud_step: finite(rawMoves.mud_step, 0, 0, 3), short_punch: finite(rawMoves.short_punch, 0, 0, 3),
    soft_parry: finite(rawMoves.soft_parry, 0, 0, 3), point_strike: finite(rawMoves.point_strike, 0, 0, 3),
  };
  const savedLocation = typeof value.currentLocation === "string" && LANDMARKS.includes(renameLegacyWorldNames(value.currentLocation) as Landmark)
    ? renameLegacyWorldNames(value.currentLocation) as Landmark : "青鋒堂總壇";
  const restoredLocation = savedLocation === "碼頭" && (value.questStep !== "chapter_one"
    || !["dock", "complete", "failed"].includes(flags.chapterOne?.stage || "")) ? "青鋒堂總壇"
    : value.questStep === "chapter_one" && flags.chapterOne?.stage === "dock" && savedLocation !== "碼頭"
      ? "青鋒堂總壇" : savedLocation;
  const currentLocation: Landmark = activeCombat?.scenario === "market_ambush" ? "黑泥街"
    : activeCombat?.scenario === "arena" ? "裂石擂"
      : value.questStep === "sandbox" && (flags.alleyEscape === true || flags.alleyWall === true || flags.marketAftermath === true)
        ? "黑泥街" : restoredLocation;
  const pendingEncounter = (value.questStep === "sandbox" || value.questStep === "chapter_one" && flags.chapterOne?.stage === "shortage") && !pendingIncident && !activeCombat
    && !flags.marketAftermath && !flags.alleyEscape && !flags.alleyWall && !flags.finalCrisis
    && ENCOUNTERS.some((encounter) => encounter.id === value.pendingEncounter && encounter.location === currentLocation)
    ? value.pendingEncounter as EncounterId : undefined;
  const alleyEscape = !activeCombat && value.questStep === "sandbox" && currentLocation === "黑泥街"
    && (flags.alleyEscape === true || flags.alleyWall === true);
  return {
    turn: finite(value.turn, 1, 1, 100000),
    history: Array.isArray(value.history) ? value.history.filter((entry) => entry && typeof entry === "object"
      && Number.isFinite(entry.turn) && typeof entry.action === "string" && typeof entry.narrative === "string")
      .map((entry) => ({ turn: entry.turn, action: entry.action, narrative: entry.narrative,
        narrativeSource: entry.narrativeSource === "API" || entry.narrativeSource === "Fallback"
          ? entry.narrativeSource : "未記錄" as const,
        preLocation: LANDMARKS.includes(entry.preLocation as Landmark) ? entry.preLocation : "未記錄" as const,
        postLocation: LANDMARKS.includes(entry.postLocation as Landmark) ? entry.postLocation : "未記錄" as const,
        questStep: steps.includes(entry.questStep as QuestStep) ? entry.questStep : "未記錄" as const })) : [],
    playerName: value.playerName.slice(0, 30), background: background.slice(0, 60), trait: value.trait.slice(0, 60),
    gender: typeof value.gender === "string" ? value.gender.replace(/[\r\n「」]/g, "").trim().slice(0, 8) : undefined,
    skill: typeof value.skill === "string" ? value.skill.replace(/[\r\n「」]/g, "").trim().slice(0, 12) : undefined,
    personality: typeof value.personality === "string" ? value.personality.replace(/[\r\n「」]/g, "").trim().slice(0, 12) : undefined,
    currentLocation,
    inventory,
    sceneState,
    maxInventory: finite(value.maxInventory, 4, 4, 6),
    playerHp, maxHp, hpScaleVersion: 2,
    playerMp, maxMp,
    silver: finite(value.silver, 0, 0, Number.MAX_SAFE_INTEGER - 1000), factionFunds: finite(value.factionFunds, 10, 0, Number.MAX_SAFE_INTEGER - 1000),
    customActionUses: finite(value.customActionUses, CUSTOM_ACTION_START, 0, CUSTOM_ACTION_MAX),
    sectLifeline: finite(value.sectLifeline ?? (value as Partial<GameState> & { hozaiDefense?: unknown }).hozaiDefense, 60, 0, 100),
    worldFlags,
    lastEncounterTurn: finite(value.lastEncounterTurn, 0, 0, 100000),
    pendingEncounter,
    activeMissions: Array.from(new Set([
      ...(Array.isArray(value.activeMissions) ? value.activeMissions.filter((id): id is string => typeof id === "string") : []),
      ...acceptedMissionIds(worldFlags),
    ])).filter((id) => MISSIONS.some((mission) => mission.id === id && !missionDone(worldFlags, mission))),
    relationships,
    relationshipScores: normalizeRelationshipScores(value.relationshipScores),
    socialMemory: normalizeSocialMemory(value.socialMemory),
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
      alleyEscape,
      alleyWall: alleyEscape && flags.alleyWall === true,
      alleyAllyPresent: flags.alleyAllyPresent === true,
      marketAftermath: !activeCombat && !alleyEscape && value.questStep === "sandbox" && currentLocation === "黑泥街"
        && (flags.marketAftermath === true || (flags.marketAftermath === undefined
        && value.questStep === "sandbox" && currentLocation === "黑泥街" && !activeCombat
        && !flags.alleyEscape && !pendingIncident && !flags.lastSandboxTag
        && finite(value.turn, 1, 1, 100000) <= 10 && worldFlags.includes("擊退伏擊刀手"))),
      marketAftermathKind: flags.marketAftermathKind === "escape" || flags.marketAftermathKind === "defeat"
        ? flags.marketAftermathKind : "victory",
      marketIntentHistory: Array.isArray(flags.marketIntentHistory) ? flags.marketIntentHistory
        .filter((entry): entry is { turn: number; approach: MarketIntent["approach"] | "自訂"; target: string; object?: string; outcome: string } =>
          Boolean(entry && typeof entry === "object" && typeof entry.turn === "number" && Number.isFinite(entry.turn)
            && typeof entry.approach === "string" && ["救護", "查探", "交涉", "施壓", "借物", "脫身", "進擊", "防守", "奪械", "自訂"].includes(entry.approach)
            && typeof entry.target === "string" && entry.target.length <= 12 && typeof entry.outcome === "string" && entry.outcome.length <= 160
            && (entry.object === undefined || typeof entry.object === "string" && entry.object.length <= 20)))
        .slice(-8) : [],
      marketNpcHistory: normalizeMarketNpcHistory(flags.marketNpcHistory),
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
          foundShortageLocation: flags.chapterOne.foundShortageLocation === true
            || worldFlags.includes(`第一章${flags.chapterOne.affectedBusiness}斷貨已查`),
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

function marketPressureWarning(state: GameState): string {
  return state.questStep === "market_collection" && !state.combat
    && (state.flags.marketIntentHistory?.length || 0) >= 2
    ? "巷口灰衣人已逼到肉檔邊，指節貼著刀柄。" : "";
}

const MARKET_TREATMENT_FLAG = "陸千帆已敷藥";
const MARKET_MEDICINES = ["【止血膏藥】", "【金創散】", "【止血散】"] as const;

function marketWoundTreated(state: GameState): boolean {
  return state.worldFlags.includes(MARKET_TREATMENT_FLAG) && !state.relationships["陸千帆"].wounded;
}

function marketMedicine(state: GameState, preferred?: string): string | undefined {
  if (preferred) {
    const item = `【${preferred}】`;
    return MARKET_MEDICINES.some((medicine) => medicine === item) && state.inventory.includes(item) ? item : undefined;
  }
  return MARKET_MEDICINES.find((item) => state.inventory.includes(item));
}

function treatMarketWound(state: GameState, preferred?: string): string | undefined {
  if (marketWoundTreated(state)) return undefined;
  const medicine = marketMedicine(state, preferred);
  if (!medicine) return undefined;
  state.inventory.splice(state.inventory.indexOf(medicine), 1);
  state.relationships["陸千帆"].wounded = false;
  remember(state, MARKET_TREATMENT_FLAG);
  remember(state, "救下陸千帆");
  return medicine.slice(1, -1);
}

function dropMarketObject(state: GameState, name: string, position: string): void {
  state.sceneState!.movedObjects[name] = position;
  state.sceneState!.objectHolders[name] = "";
  if (name === "剁骨刀") remember(state, "張斷骨失刀");
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
      return `你早前從${echo.location}的${echo.anchor}查到破綻，同門據此避過玄武樓眼線。`;
    }
    if (echo.goal === "護人") {
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
      return `你早前在${echo.location}護住的人帶來街坊接應。`;
    }
    if (echo.goal === "做工") {
      state.silver += 2;
      return `你早前在${echo.location}借${echo.anchor}辦成的活有了回音，商戶補付兩文私銀。`;
    }
    if (echo.goal === "牽制") {
      state.sectLifeline = Math.max(0, state.sectLifeline - 2);
      return `你早前在${echo.location}牽制的眼線回頭試探堂口。`;
    }
    state.sectLifeline = Math.min(100, state.sectLifeline + 1);
    return `你早前在${echo.location}同${echo.anchor}談妥的事得到回應，對方替堂口傳來消息。`;
  }).join("");
}

function incidentDestination(incident: Incident, index: number): Landmark | undefined {
  if (incident === "market_raid") return "黑泥街";
  if (incident === "missing_ledger") return (["鬼骰坊", "晚秋茶寮", "黑泥街"] as Landmark[])[index];
  if (incident === "tainted_medicine") return ([undefined, "苦煙館", "晚秋茶寮"] as (Landmark | undefined)[])[index];
  return undefined;
}

function resolveIncident(state: GameState, incident: Incident, choice: number): { event: string; reply: TurnResult["npcReply"]; turns: number } {
  const index = choice >= 0 ? choice : 4;
  const destination = incidentDestination(incident, index);
  if (destination && destination !== state.currentLocation)
    return { event: `須先沿街走到${destination}，才能處置這樁急事。`, reply: undefined, turns: 1 };
  const lead = `你處置${incident === "market_raid" ? "市集插旗" : incident === "missing_ledger" ? "失蹤帳頁" : "可疑傷藥"}。`;
  let event = "";
  let reply: TurnResult["npcReply"];
  if (incident === "market_raid") {
    if (index === 0) { state.playerHp = Math.max(0, state.playerHp - 4); state.sectLifeline = Math.min(100, state.sectLifeline + 8); event = "你擋在攤販前挨了一刀，痛得倒抽一口涼氣；街坊守住肉檔。"; }
    if (index === 1) { state.playerMp = Math.max(0, state.playerMp - 5); state.sectLifeline = Math.min(100, state.sectLifeline + 6); event = "你從暗巷截住刀手退路，氣喘吁吁；對方拔旗撤走。"; }
    if (index === 2) { state.sectLifeline = Math.min(100, state.sectLifeline + 4); event = "你記下三名攤販的證詞，逼刀手收旗。"; }
    if (index === 3) { if (state.silver >= 20) { state.silver -= 20; state.sectLifeline = Math.min(100, state.sectLifeline + 3); event = "你自掏私銀安頓攤販，刀手暫退。"; } else event = "私銀不足二十文，你只能護攤販退入窄巷，刀手仍在肉檔。"; }
    if (index === 4) { state.sectLifeline = Math.max(0, state.sectLifeline - 8); event = "你先護傷者撤走，肉檔失去半日生意，刀手把旗插在路口。"; }
    if (index < 4 && state.worldFlags.includes("街面有備")) {
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
      event += "先前記下的街面異動讓眾人及早應對。";
    }
    if (index < 4 && state.worldFlags.includes("擊退伏擊刀手")) {
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
      event += "刀手認出你曾在肉檔擊退同夥，攻勢一滯。";
    }
    if (index <= 1 && (state.knownMoves?.short_punch || 0) > 0) {
      const restored = Math.min(2, state.maxHp - state.playerHp);
      state.playerHp += restored;
      event += "你憑練過的拳路卸去一部分刀勢，呼吸稍稍平穩。";
    }
    remember(state, index === 4 ? "市集暫失" : "市集守住");
    reply = { speaker: "陸千帆", line: index === 4 ? "人先撤了。我記著那面旗，遲早拔回來。" : "肉檔先守住了。我去看巷口，你別再替我挨刀。" };
  } else if (incident === "missing_ledger") {
    let tipBought = false;
    if (index === 0) { state.sectLifeline = Math.min(100, state.sectLifeline + 3); event = "你到鬼骰坊對帳，查出缺頁記著一筆假規費。祁觀衡鎖好原本。"; }
    if (index === 1) {
      if (state.silver >= 10) {
        state.silver -= 10; tipBought = true;
        state.sectLifeline = Math.min(100, state.sectLifeline + 2);
        event = "你向容晚秋買到消息，得知灰衣客昨夜從總壇帶走帳頁。";
      } else event = "你拿不出十文私銀，容晚秋沒有說出誰帶走帳頁；缺頁仍待追查。";
    }
    if (index === 2) { state.playerMp = Math.max(0, state.playerMp - 4); state.sectLifeline = Math.min(100, state.sectLifeline + 4); event = "你沿泥印追到市集後巷，氣喘吁吁地找回濕透的帳頁。"; }
    if (index === 3) { if (state.silver >= 10) { state.silver -= 10; state.sectLifeline = Math.min(100, state.sectLifeline + 1); event = "你自掏私銀補上缺口，暫且穩住人心；缺的那頁仍得追查。"; } else event = "私銀不足十文，缺帳未補，你把破綻先記在紙上。"; }
    if (index === 4) { state.sectLifeline = Math.min(100, state.sectLifeline + 1); event = `你在${state.currentLocation}寫下缺頁線索，託同門送交堂主；回信說帳櫃已封，往後要逐筆重查。`; }
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
    if (index === 0) { state.sectLifeline = Math.min(100, state.sectLifeline + 2); event = "你封存可疑藥包，叫腳夫暫停送藥，傷者改用乾淨布條裹傷。"; }
    if (index === 1) { state.sectLifeline = Math.min(100, state.sectLifeline + 3); event = "你把藥帶到苦煙館，顧忘生驗出封口混了苦麻粉。"; }
    if (index === 2) { state.sectLifeline = Math.min(100, state.sectLifeline + 2); event = "你追問送藥腳夫，查到他替灰衣客轉過手。"; }
    if (index === 3) { if (state.silver >= 10) { state.silver -= 10; state.playerHp = Math.min(state.maxHp, state.playerHp + 5); event = "你買來乾淨傷藥救人，餘藥敷在自己傷口，痛楚稍緩。"; } else event = "你拿不出十文私銀，便用乾淨布條替傷者裹傷。"; }
    if (index === 4) { state.sectLifeline = Math.min(100, state.sectLifeline + 4); event = "你派人告知城西七處據點停用這批藥，逐一收回藥包。"; }
    if (index !== 3 && state.worldFlags.includes("傷藥有據")) {
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
      event += "先前認清的藥封讓眾人及早分出可疑傷藥。";
    }
    if (index !== 3 && state.worldFlags.includes("辨清傷藥封口")) {
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
      event += `${state.flags.visitedGu ? "顧忘生" : "容晚秋"}教過你的繩結仍記得清楚，你當場挑出換過封口的藥。`;
    }
    remember(state, "可疑傷藥已處置");
    reply = index === 1
      ? { speaker: "顧忘生", line: "苦麻粉。藥還沒入口，人先被它放倒。" }
      : { speaker: "容晚秋", line: "封口換過。這批貨別再讓腳夫送出去。" };
  }
  state.flags.pendingIncident = undefined;
  const speakerLocation: Partial<Record<string, Landmark>> = {
    "陸千帆": "黑泥街", "何不歸": "青鋒堂總壇", "容晚秋": "晚秋茶寮", "顧忘生": "苦煙館", "祁觀衡": "鬼骰坊",
  };
  if (reply && speakerLocation[reply.speaker] !== state.currentLocation) reply = undefined;
  return { event: `${lead}${event}`, reply, turns: 1 };
}

export function resolveOpeningKnifeRequest(rawState: GameState, playerText: string): TurnResult | null {
  const state = normalizeState(rawState);
  if (!state || !["prologue_briefing", "sandbox"].includes(state.questStep)
    || state.currentLocation !== "青鋒堂總壇" || state.combat || state.flags.pendingIncident || state.pendingEncounter
    || state.flags.alleyEscape || state.flags.marketAftermath || state.flags.finalCrisis || state.flags.ending) return null;
  if (!/(?:堂主|何不歸)/.test(playerText) || !/(?:牛肉刀|刀仔|短刀|小刀|佩刀|防身刀|把刀)/.test(playerText)
    || !/(?:俾|畀|給|借|討|攞|拿|發|請|要)/.test(playerText)) return null;
  if (/如果|假如|假設|會點|點樣|只是問|只係問/.test(playerText)
    || /(?:唔|不|別|毋|無|冇)[^，。；]{0,6}(?:要|借|攞|拿|討|俾|畀|給)/.test(playerText)) return null;
  state.turn += 1;
  const npcReply = { speaker: "何不歸", line: state.questStep === "prologue_briefing"
    ? "刀借你防身。先把傷藥送到，莫在街上逞強。" : "領刀可以。出勤用完，記得報損。" };
  if (state.inventory.includes("【牛肉刀】"))
    return { state, options: availableOptions(state), event: "你向堂主討刀；他指向你身上已有的短刃，沒有再拿一把。", moneyNote: "",
      npcReply: { speaker: "何不歸", line: state.questStep === "prologue_briefing"
        ? "你身上已有刀。先把傷藥送到。" : "你身上已有刀，用完記得報損。" } };
  if (state.inventory.length >= state.maxInventory)
    return { state, options: availableOptions(state), event: "你向堂主討刀；他看見你行囊已滿，叫你先騰出位置。", moneyNote: "",
      npcReply: { speaker: "何不歸", line: "刀在案後。你先把行囊騰出空位。" } };
  state.inventory.push("【牛肉刀】");
  state.equippedWeapon = "beef_knife";
  state.weaponDurability = WEAPONS.beef_knife.maxDurability;
  state.sceneState!.objectHolders["牛肉刀"] = "玩家";
  state.sceneState!.movedObjects["牛肉刀"] = "玩家腰間";
  remember(state, "堂主借出牛肉刀");
  return { state, options: availableOptions(state),
    event: "你向堂主討一把刀防身。何不歸從案後兵器架取出一把牛肉刀，連鞘交到你手中。",
    moneyNote: "", npcReply };
}

function resolveTurnCore(rawState: GameState, action: string, opening: boolean, creative?: CreativeAction, spendCustomUse = false,
  terrainObject?: "厚砧板" | "懸肉鐵鉤" | "剁骨刀", disarmAttempt = false, freeAttempt?: SceneAttempt): TurnResult {
  const state = normalizeState(rawState);
  if (!state) throw new Error("遊戲狀態無效");
  if (state.questStep === "chapter_one" && state.flags.chapterOne?.stage === "shortage") {
    const offered = availableOptions(state);
    if (!offered.includes(action)) return { state, options: offered, event: "眼前不能採取這項行動。", moneyNote: "" };
    const pending = state.flags.pendingIncident;
    const incidentAction = pending && INCIDENT_OPTIONS[pending].findIndex((option) => conciseOption(option) === action);
    if (pending && incidentAction !== undefined && incidentAction >= 0) {
      const resolved = resolveIncident(state, pending, incidentAction);
      const pressure = advanceChapterSocialTurn(state, actionEnergyCost(state, action));
      const result = finishChapterTurn(state, resolved.event + pressure);
      result.npcReply = localNpcReply(state, resolved.reply);
      return result;
    }
    if (state.pendingEncounter) {
      const resolved = resolveEncounter(state, state.pendingEncounter, action);
      if (!resolved) return { state, options: offered, event: "眼前須先處置這樁急事。", moneyNote: "" };
      state.pendingEncounter = undefined;
      return finishChapterTurn(state, resolved + advanceChapterSocialTurn(state, actionEnergyCost(state, action)));
    }
    const mission = missionOptions(state).includes(action) ? resolveMission(state, action) : undefined;
    if (mission) {
      const result = finishChapterTurn(state, mission.event + advanceChapterSocialTurn(state, actionEnergyCost(state, action)));
      result.npcReply = localNpcReply(state, { speaker: mission.speaker, line: mission.line });
      return result;
    }
  }
  if (state.questStep === "chapter_one" || state.flags.ending) {
    return resolveChapterOne(state, action, false);
  }
  if (state.flags.finalCrisis) {
    const endingAction = ENDING_OPTIONS.find((option) => option === action || conciseOption(option) === action);
    if (!endingAction) return { state, options: availableOptions(state), event: "玄武樓已壓到城西門前。你須決定青鋒堂最後的去路。", moneyNote: "" };
    const event = resolveEnding(state, endingAction);
    return { state, options: chapterOneOptions(state), event, moneyNote: "" };
  }
  if (!opening && (state.flags.pendingIncident || state.pendingEncounter) && customAction(action))
    return { state, options: availableOptions(state), event: "眼前須先處置這樁急事。", moneyNote: "" };
  if (!opening && !customAction(action)) {
    const options = availableOptions(state);
    const key = /^\w\. \[[^\]]+\]/.exec(action)?.[0];
    const travelMatch = /^F\. \[前往\] (.+)$/.exec(action);
    const legacyTravel = state.questStep === "sandbox" && !state.combat && !state.flags.pendingIncident && !state.pendingEncounter
      && !state.flags.alleyEscape && !state.flags.alleyWall && !state.flags.marketAftermath && travelMatch
      && LANDMARKS.includes(travelMatch[1] as Landmark) && travelChoices(state, travelMatch[1] as Landmark).length > 0;
    const routeTravel = state.questStep === "sandbox" && !state.combat && !state.pendingEncounter
      && !state.flags.alleyEscape && !state.flags.alleyWall && !state.flags.marketAftermath && LANDMARKS.some((destination) =>
      travelChoices(state, destination).some((route) => route.label === action));
    const exactOnly = /\[(?:撒生石灰|施放暗手|袖藏暗手|全力陰手|硬闖街口|伏低護人|伏低保命|踢翻餿水桶|踩籮翻牆|交畀陸千帆|撞開刀手|借牆脫身|扯籮阻路|檢視傷勢|裹緊傷口|伏巷警戒|盤問張斷骨|安頓收隊|搜刮殘局|封住退路|離巷收隊)\]/.test(action);
    if (!options.includes(action) && !(key && !exactOnly && options.some((option) => option.startsWith(key)))
      && !legacyTravel && !routeTravel)
      return { state, options, event: "眼前不能採取這項行動。", moneyNote: "" };
  }
  if (!opening && state.questStep === "market_collection" && /^[A-E]\./.test(action)) {
    const code = action[0];
    if (code === "A") {
      const medicine = marketMedicine(state)?.slice(1, -1);
      return resolveSceneAttempt(state, { effect: "protect", target: "陸千帆",
        ...(medicine ? { object: medicine } : {}), method: action });
    }
    const plan: MarketIntent = code === "B"
      ? { approach: "施壓", target: "張斷骨", method: "向張斷骨催收規費" }
      : code === "C" ? { approach: "查探", target: "街口", method: "辨認巷口刀手位置" }
        : code === "D" ? { approach: "交涉", target: "張斷骨", method: "與張斷骨商議緩交規費" }
          : { approach: "脫身", target: "陸千帆", method: "帶陸千帆撤離肉檔" };
    return resolveMarketIntent(state, plan);
  }
  if (!opening && state.questStep === "market_collection" && customAction(action)) {
    const acts = [/(?:背叛|出賣陸千帆|不救陸千帆)/.test(action),
      /(?:私吞|昧起|袋起|自己收)/.test(action),
      /(?:打斷張斷骨|致殘張斷骨|廢了張斷骨)/.test(action)].filter(Boolean).length;
    if (acts !== 1 || negatesIrreversibleAction(action))
      return { state, options: availableOptions(state), event: "請只講一件要做的事。", moneyNote: "" };
  }
  const startingEnergy = state.playerMp;
  const startingLocation = state.currentLocation;
  const wasInCombat = Boolean(state.combat || state.questStep === "huizhi_ambush");
  const wasInIncident = Boolean(state.flags.pendingIncident);
  const wasInEncounter = Boolean(state.pendingEncounter);
  const wasInAftermath = Boolean(state.flags.marketAftermath || state.flags.alleyEscape || state.flags.alleyWall);
  const selectedTravel = LANDMARKS.flatMap((destination) => travelChoices(state, destination))
    .find((route) => route.label === action);
  const travelTarget = selectedTravel?.destination || /^F\. \[前往\] (.+)$/.exec(action)?.[1] as Landmark | undefined;
  const quotedTurns = Number(/(?:共)?(\d+)回合/.exec(action)?.[1] || 0);
  const plannedTurns = selectedTravel?.turns || quotedTurns || (travelTarget && LANDMARKS.includes(travelTarget)
    ? travelChoices(state, travelTarget)[0]?.turns || 1 : 1);
  const energyCost = creative
    ? creative.goal === "做工" || creative.goal === "牽制" ? 3
      : creative.goal === "護人" ? 2
      : actionEnergyCost(state, `F. [${creative.goal}]`)
    : actionEnergyCost(state, action, plannedTurns);
  if (!canAffordEnergy(state, energyCost, action))
    return { state, options: availableOptions(state), event: "你氣力不足，須先休養或服藥。", moneyNote: "" };
  const oldSilver = state.silver;
  const oldFunds = state.factionFunds;
  let event = "";
  let npcReply: TurnResult["npcReply"];
  let travelTurns = 1;
  const absurd = customAction(action) && /槍械|手槍|步槍|機關槍|超人|神仙|飛天|激光|雷射|核彈|手機|電腦|修仙|法術/.test(action);
  const choice = /^[A-E]\./.test(action) ? action.charCodeAt(0) - 65 : -1;
  const flavor = (step: Exclude<QuestStep, "sandbox" | "huizhi_ambush" | "chapter_one">) => choice >= 0 ? TUTORIAL_FLAVOR[step][choice] : "你自定手段，仍把眼前差事辦下去。";
  if (!opening) state.turn += 1;
  if (absurd) {
    state.playerHp = Math.max(0, state.playerHp - 4);
    event = "你被劣質丹藥幻覺誤導，當場出醜，腳下一晃，強忍劇痛。";
  }

  if (state.pendingEncounter) {
    const resolved = resolveEncounter(state, state.pendingEncounter, action);
    if (resolved) {
      event += resolved;
      state.pendingEncounter = undefined;
    }
  } else if (state.combat) {
    if (freeAttempt?.effect === "seize" && freeAttempt.object === "刀手短刀") disarmAttempt = true;
    const wasMarketAmbush = state.combat.scenario === "market_ambush";
    const weaponBefore = state.equippedWeapon || "fists";
    const usingDarkHand = /\[(?:撒生石灰|施放暗手|袖藏暗手|全力陰手)\]/.test(action);
    const guaranteed = action.includes("[全力陰手]")
      || usingDarkHand && state.playerMp >= 2 && state.playerHp <= Math.ceil(state.maxHp * 0.3);
    const darkItem = usingDarkHand ? state.inventory.includes(STARTING_DARK_HAND)
      ? STARTING_DARK_HAND : readyDarkHand(state.inventory) : undefined;
    if (usingDarkHand && darkItem) state.inventory.splice(state.inventory.indexOf(darkItem), 1);
    const selectedTerrain = terrainObject || (wasMarketAmbush && action.includes("[扯鐵鉤]") ? "懸肉鐵鉤"
      : wasMarketAmbush && action.includes("[推砧板]") ? "厚砧板" : undefined);
    const result = resolveCombatRound({
      combat: state.combat, action: absurd ? "B. [沉身守勢]" : action, playerHp: state.playerHp, playerMp: state.playerMp,
      background: state.background,
      armGuard: state.inventory.includes("【粗鐵護腕】"),
      weapon: state.equippedWeapon || "fists", weaponDurability: state.weaponDurability || 0,
      knownMoves: state.knownMoves || {}, canTakeStick: !action.includes("[撞肉案]")
        && !state.inventory.includes("【牛肉刀】") && !state.inventory.includes("【生鏽鐵刀】")
        && !state.inventory.includes("【奪來短刀】"),
      disarmAttempt, canCarryKnife: state.inventory.length < state.maxInventory,
      freeAttempt,
      terrainObject: selectedTerrain,
      fatigued: startingEnergy <= 10,
      dirtyHand: darkItem ? { item: darkItem, guaranteed,
        tier: dirtyHandTier(rollD20(state, action), dirtyHandModifier(state), guaranteed) } : undefined,
    });
    state.playerHp = result.playerHp;
    state.playerMp = result.playerMp;
    state.equippedWeapon = result.weapon;
    state.weaponDurability = result.weaponDurability;
    if (wasMarketAmbush && action.includes("[扯鐵鉤]"))
      state.sceneState!.movedObjects["懸肉鐵鉤"] = "從肉架扯落，勾在肉案邊";
    if (wasMarketAmbush && action.includes("[推砧板]"))
      state.sceneState!.movedObjects["厚砧板"] = "肉案前，已被推歪";
    if (disarmAttempt && result.weapon === "captured_knife" && !state.inventory.includes("【奪來短刀】"))
      state.inventory.push("【奪來短刀】");
    if (disarmAttempt && result.outcome === "won" && result.weapon !== "captured_knife")
      state.sceneState!.movedObjects["刀手短刀"] = "黑泥街肉案下";
    if (wasMarketAmbush && result.combat.allyPresent && action.startsWith("B. [護住同門]")
      && !state.worldFlags.includes("伏擊中護住陸千帆")) {
      remember(state, "伏擊中護住陸千帆");
      changeTrust(state.relationships, "陸千帆", 1);
    }
    if (weaponBefore === "rusty_knife" && result.weapon === "fists" && state.inventory.includes("【生鏽鐵刀】")) {
      state.inventory = state.inventory.filter((item) => item !== "【生鏽鐵刀】");
    }
    if (weaponBefore === "beef_knife" && result.weapon === "fists" && state.inventory.includes("【牛肉刀】")) {
      state.inventory = state.inventory.filter((item) => item !== "【牛肉刀】");
      if (state.sceneState!.objectHolders["牛肉刀"] === "玩家") {
        state.sceneState!.objectHolders["牛肉刀"] = "";
        state.sceneState!.movedObjects["牛肉刀"] = "交手處折斷";
      }
    }
    if (weaponBefore === "captured_knife" && result.weapon === "fists")
      state.inventory = state.inventory.filter((item) => item !== "【奪來短刀】");
    const brokenStartingItem = startingWeaponItem(weaponBefore);
    if (brokenStartingItem && result.weapon === "fists")
      state.inventory = state.inventory.filter((item) => item !== brokenStartingItem);
    event += result.event;
    if (result.outcome === "ongoing") {
      state.combat = result.combat;
      npcReply = wasMarketAmbush
        ? result.combat.allyPresent
          ? { speaker: "陸千帆", line: "我守住左邊。你看他下一刀從何處來。" }
          : { speaker: "刀手", line: "你還站得住？下一刀可沒人替你擋。" }
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
        state.flags.alleyWall = false;
        state.flags.alleyAllyPresent = result.combat.allyPresent;
        if (result.outcome === "won") {
          state.flags.marketAftermath = true;
          state.flags.marketAftermathKind = "victory";
          remember(state, "市集伏擊突圍");
          remember(state, "擊退伏擊刀手");
          event += "刀手退入暗巷，街口的打鬥停了。肉檔還在，血水仍淌到攤販腳邊。";
        } else {
          if (result.outcome === "lost") {
            state.flags.marketAftermath = true;
            state.flags.marketAftermathKind = "defeat";
            event += "刀手仍佔著肉檔街口，你被逼退到肉案後；先處置傷口或沿後巷撤離。";
          }
          state.sectLifeline = Math.max(0, state.sectLifeline - (result.outcome === "fled" ? 6 : 10));
          remember(state, result.outcome === "fled" ? "市集伏擊撤守" : "市集伏擊戰敗");
          event += result.outcome === "fled" ? "你保住性命，卻讓出肉檔前的街口。"
            : "青鋒堂暫失肉檔前的街口。";
        }
        if (result.combat.allyWounded) {
          remember(state, "陸千帆再受刀傷");
          state.relationships["陸千帆"].wounded = true;
          state.sectLifeline = Math.max(0, state.sectLifeline - 3);
          event += "陸千帆的舊傷又添一刀，握著肉案才站穩。";
        }
        if (state.worldFlags.includes("茶寮傳信接應") || state.worldFlags.includes("苦煙館傳信接應")) {
          state.sectLifeline = Math.min(100, state.sectLifeline + 4);
          event += `${state.worldFlags.includes("苦煙館傳信接應") ? "顧忘生" : "容晚秋"}傳出的信帶來接應。`;
        }
        if (state.playerHp === 0) {
          state.playerHp = 1;
          event += "你被同門拖出刀口，氣血只剩一線。";
        }
        npcReply = result.combat.allyPresent
          ? { speaker: "陸千帆", line: result.outcome === "won" ? "街口守住了。眼線還沒散，先收拾手尾。"
            : result.outcome === "lost" ? "街口丟了。先退到肉案後，按住傷口再走。" : "他媽的，先翻出去。誰堵的路，回頭剁誰。" }
          : result.outcome === "won" ? { speaker: "張斷骨", line: "人先活著。肉檔的帳，回頭再算。" } : undefined;
      } else {
        if (result.outcome === "won") {
          state.silver += 20;
          remember(state, "裂石擂勝場");
          event += "衛沉岳把賞錢放到你手裏。";
        } else if (state.playerHp === 0) {
          state.playerHp = 1;
          event += "衛沉岳將你從擂台上扶下，氣血只剩一線。";
        }
        npcReply = { speaker: "衛沉岳", line: result.outcome === "won" ? "拳收住。對手已經倒了。" : "先把氣息養回來，再談下一場。" };
      }
    }
    if (!wasMarketAmbush) {
      state.sectLifeline = Math.max(0, state.sectLifeline - 2);
      event += "玄武樓又向城西逼近一步。";
    }
  } else if (state.questStep === "prologue_briefing") {
    state.currentLocation = "青鋒堂總壇";
    if (opening) {
      const stats = aptitude(state.playerName, state.background, state.trait);
      state.maxHp = stats.hp; state.playerHp = state.background === "落魄武館棄徒" ? stats.hp - 2 : stats.hp;
      state.hpScaleVersion = 2;
      state.maxMp = stats.mp; state.playerMp = stats.mp;
      event = `青鋒堂總壇，何不歸在場，桌上有陸千帆的傷勢記錄。任務目標：${OPENING_MISSION_FACTS}`;
    } else {
      event += flavor("prologue_briefing");
      if (choice === 0) {
        state.sectLifeline = Math.min(100, state.sectLifeline + 4);
        event += "何不歸得以留下補強守備。";
      } else if (choice === 1) {
        if (state.factionFunds >= 10) {
          state.factionFunds -= 10; state.silver += 10;
          event += "他從公帳撥出路費，交到你手裏。";
        } else event += "堂口已拿不出十文路費，你只得空手上路。";
      } else if (choice === 2) { remember(state, "問清刀手兵刃"); event += "你記住刀手慣用的短刀，往後交手便有了防備。"; }
      else if (choice === 3) { remember(state, "問清陸千帆傷勢"); event += "何不歸說清傷口深淺，你記下來向顧忘生交代。"; }
      else if (choice === 4) { remember(state, "熟記市集暗巷"); event += "你把退往巷口的路記在心裏。"; }
      state.questStep = "kuyan_medicine";
      state.currentLocation = "苦煙館";
      const memory = ["堂主留守堂口的話還在耳邊", "腰間新添的銅錢輕響",
        "你記著堂主說過的短刀", "你記著陸千帆傷口的深淺", "你記著堂主指過的市集暗巷"][choice] || "堂主的交代還在耳邊";
      event = `你踏進苦煙館，${memory}。顧忘生揭開藥罐，叫你先看清膏藥封口，再說陸千帆的傷勢。`;
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
    npcReply = { speaker: "陸千帆", line: "刀手還在巷口。先看清再動手。" };
    event = `你趕到黑泥街市集肉檔，懷裡的止血膏藥尚未拆封。${choice === 1 ? "你記著顧忘生提過的灰線刀手。" : "藥包貼著胸口，腥氣已迎面而來。"}陸千帆仍帶傷，張斷骨卻拒交規費。`;
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
    event = `你趕到黑泥街市集肉檔，袖裡的金創散尚未拆封。${choice === 1 ? "你記著容晚秋提過的灰線刀手。" : "茶香還在袖口，肉檔腥氣已迎面而來。"}陸千帆仍帶傷，張斷骨卻拒交規費。`;
  } else if (state.questStep === "market_collection") {
    const betrayed = /(?:背叛|出賣陸千帆|不救陸千帆)/.test(action);
    const embezzled = /(?:私吞|昧起|袋起|自己收)/.test(action);
    if (betrayed) {
      remember(state, "出賣陸千帆");
      state.relationships["陸千帆"].trust = -3;
      state.relationships["陸千帆"].estranged = true;
      state.sectLifeline = Math.max(0, state.sectLifeline - 15);
      event += "你將陸千帆留在肉檔，向巷口刀手指明他的所在。刀手亮刃逼近。";
    } else if (embezzled) {
      state.silver += 50;
      state.flags.collectedMarketFee = true;
      remember(state, "私吞五十文規費");
      state.sectLifeline = Math.max(0, state.sectLifeline - 10);
      event += "你逼張斷骨交出五十文規費，收進自己錢袋。巷口刀手亮刃逼近。";
    } else {
      remember(state, "打斷張斷骨右手");
      state.sectLifeline = Math.max(0, state.sectLifeline - 3);
      event += "你打斷張斷骨右手。肉檔眾人四散，巷口刀手亮刃逼近。";
    }
    state.flags.marketAmbushTriggered = true;
    state.questStep = "huizhi_ambush";
    const fight = createCombat("market_ambush", !betrayed && state.worldFlags.includes("救下陸千帆"));
    fight.preparedDefense = Math.min(5, ["問清刀手兵刃", "驗過堂口草藥", "趕在刀手前到市集", "認清刀手裝束", "熟記市集暗巷", "茶寮調息", "苦煙館調息", "已察覺巷口伏兵", "肉案已作遮掩", "肉檔鐵鉤已移位", "陸千帆同意配合"]
      .filter((flag) => state.worldFlags.includes(flag)).length);
    state.combat = fight;
    if (!state.worldFlags.includes("救下陸千帆")) state.relationships["陸千帆"].wounded = true;
  } else if (state.flags.alleyEscape) {
    const item = /\[(?:撒生石灰|施放暗手)\]/.test(action) ? readyDarkHand(state.inventory, false) : undefined;
    const guaranteed = Boolean(item && state.playerMp >= 2 && state.playerHp <= Math.ceil(state.maxHp * 0.3));
    const tier = item ? dirtyHandTier(rollD20(state, action), dirtyHandModifier(state), guaranteed) : undefined;
    if (item) {
      state.inventory.splice(state.inventory.indexOf(item), 1);
      if (guaranteed) state.playerMp -= 1;
    }
    if (state.flags.alleyWall) {
      if (action.includes("[撞開刀手]")) {
        state.playerHp = Math.max(1, state.playerHp - 4);
        event = "你從牆頭撲下撞歪刀手，肩上又挨一刀。你跌進後巷，竹籮堵住追兵；牆背終於沒了刀聲。";
      } else if (action.includes("[借牆脫身]")) {
        state.sceneState!.movedObjects["廢竹籮"] = "被追兵撞散在死巷牆下";
        if (!state.sceneState!.depletedSources.includes("廢竹籮")) state.sceneState!.depletedSources.push("廢竹籮");
        event = "你伏在牆脊避過刀鋒，爬到後巷才落地。追兵撞散竹籮，腳步卻停在牆那邊。";
      } else if (action.includes("[扯籮阻路]")) {
        state.playerHp = Math.max(1, state.playerHp - 2);
        state.sceneState!.movedObjects["廢竹籮"] = "被踢落牆背窄口";
        event = "你踢落竹籮，追兵扯住你衣角。你掙開時手臂見血，翻到牆背，巷口刀手沒跟上。";
      } else if (tier === "failed") {
        state.playerHp = Math.max(1, state.playerHp - 5);
        event = `你${dirtyHandVerb(item!)}，刀手偏頭躲開，反手將你逼回牆頭。追兵踩著竹籮攀上來。`;
      } else if (tier) {
        if (tier === "ordinary") state.playerHp = Math.max(1, state.playerHp - 2);
        event = `你${dirtyHandVerb(item!)}，刀手遮眼退開。你翻落後巷，牆後只剩追兵踢翻竹籮的聲響。`;
      }
      state.flags.alleyWall = tier === "failed";
    } else if (action.includes("[硬闖街口]")) {
      state.playerHp = Math.max(1, state.playerHp - 5);
      state.sectLifeline = Math.min(100, state.sectLifeline + 3);
      event = "你撞回肉檔前，肩頭挨刀，硬把刀手逼開。刀手退入暗巷，街口重新露出一條路。";
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
      if (!state.sceneState!.depletedSources.includes("餿水桶")) state.sceneState!.depletedSources.push("餿水桶");
      state.flags.alleyWall = true;
      event = "你踢翻餿水桶，追兵踩進污水滑了一步。你借竹籮登牆，手背又添刀痕；另一名刀手守住牆背。";
    } else if (action.includes("[交畀陸千帆]")) {
      state.relationships["陸千帆"].wounded = true;
      event = "陸千帆把竹籮踢到牆邊，先托你上去，再攀牆跟來。他扯開了舊傷。";
      npcReply = { speaker: "陸千帆", line: "手拿開。老子還爬得動。" };
    } else if (action.includes("[踩籮翻牆]")) {
      state.playerHp = Math.max(1, state.playerHp - 2);
      state.sceneState!.movedObjects["廢竹籮"] = "被追兵撞散在死巷牆下";
      if (!state.sceneState!.depletedSources.includes("廢竹籮")) state.sceneState!.depletedSources.push("廢竹籮");
      if (state.inventory.includes("【牛肉刀】") || state.inventory.includes("【生鏽鐵刀】") || state.inventory.includes("【奪來短刀】")) {
        if (state.sceneState!.objectHolders["牛肉刀"] === "玩家") {
          state.sceneState!.objectHolders["牛肉刀"] = "";
          state.sceneState!.movedObjects["牛肉刀"] = "黑泥街死巷牆下";
        }
        state.inventory = state.inventory.filter((held) => held !== "【牛肉刀】" && held !== "【生鏽鐵刀】" && held !== "【奪來短刀】");
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
    state.flags.alleyEscape = Boolean(state.flags.alleyWall) || tier === "failed"
      || event === "你仍困在死巷。肉檔前的刀手守著唯一街口。";
    if (!state.flags.alleyEscape) {
      remember(state, "黑泥街巷尾脫險");
      state.flags.marketAftermath = true;
      state.flags.marketAftermathKind = action.includes("[硬闖街口]") ? "victory" : "escape";
    }
    state.sectLifeline = Math.max(0, state.sectLifeline - 1);
  } else if (state.flags.marketAftermath) {
    if (state.flags.marketAftermathKind === "defeat") {
      if (action.includes("[檢視傷勢]")) {
        remember(state, "陸千帆傷勢已包紮");
        event = "你扶陸千帆退到肉案後，撕布按住他的傷口；刀手佔著街口，你們沿後巷撤走。";
      } else if (action.includes("[裹緊傷口]")) {
        state.playerHp = Math.min(state.maxHp, state.playerHp + 1);
        event = "你按住自己刀口，扯布裹緊，趁刀手守著肉檔沿後巷撤走。";
      } else if (action.includes("[伏身避刀]")) {
        event = "你伏在肉案後躲開追來的刀，聽見刀手接管街口，才貼著後巷牆根退走。";
      } else if (action.includes("[撤離街口]")) {
        event = "你沿後巷退出黑泥街肉檔，刀手仍守著失去的街口；這筆敗帳得另找機會討回。";
      }
      if (event) {
        state.flags.marketAftermath = false;
        remember(state, "市集戰敗撤離");
        remember(state, "市集殘局已定");
        state.currentLocation = "青鋒堂總壇";
        event += "你回到青鋒堂總壇，街口失守的消息已先一步傳到堂內。";
      }
    } else if (state.flags.marketAftermathKind === "escape") {
      if (action.includes("[檢視傷勢]")) {
        remember(state, "陸千帆傷勢已包紮");
        event = "你在後巷替陸千帆按住刀口，血暫時止了。牆那邊的腳步遠去，你們沿暗巷撤開。";
      } else if (action.includes("[裹緊傷口]")) {
        state.playerHp = Math.min(state.maxHp, state.playerHp + 1);
        event = "你靠在後巷牆邊，撕布裹住手背刀痕。追兵沒翻過牆，你收起血布，轉出巷尾。";
      } else if (action.includes("[封住退路]")) {
        remember(state, "巷口已設警戒");
        event = state.sceneState!.depletedSources.includes("廢竹籮")
          ? "你堆起散竹守著牆背窄口，聽到刀聲遠去才走。竹片擋不住追兵，血跡仍留在巷裡。"
          : "你把竹籮塞進牆背窄口，守到刀聲遠去。血跡留在巷裡，你才沿後街撤走。";
      } else if (action.includes("[離巷收隊]")) {
        event = "你扶著牆沿後巷撤走，刀手沒能追上。走出黑泥街前，你回頭認清了那條退路。";
      }
      if (event) {
        state.flags.marketAftermath = false;
        remember(state, "市集殘局已定");
        state.sectLifeline = Math.max(0, state.sectLifeline - 1);
      }
    } else {
    if (action.includes("[檢視傷勢]")) {
      remember(state, "陸千帆傷勢已包紮");
      changeTrust(state.relationships, "陸千帆", 1);
      event = "你撕下布條，按住陸千帆肋下刀口。血暫時止了，他仍得去苦煙館換藥。";
      npcReply = { speaker: "陸千帆", line: "手別抖。這點傷還要不了我的命。" };
    } else if (action.includes("[裹緊傷口]")) {
      state.playerHp = Math.min(state.maxHp, state.playerHp + 1);
      event = "你扯布裹住自己的刀口，血漸漸止住。肉檔前還有人收拾斷棍和倒地的木凳。";
    } else if (action.includes("[伏巷警戒]")) {
      remember(state, "街面有備");
      remember(state, "巷口已設警戒");
      event = "你伏在巷口陰影，盯住刀手退走的路。兩個灰衣人見有人守著，繞過肉檔走了。";
      npcReply = state.flags.alleyAllyPresent ? { speaker: "陸千帆", line: "盯住那兩個。別讓他們摸回來。" } : undefined;
    } else if (action.includes("[盤問張斷骨]")) {
      remember(state, "張斷骨供出眼線");
      remember(state, "街面有備");
      event = "你扣住張斷骨衣領，把他從肉案後拖出來。他指向巷口，說灰衣客早在那裡守著。";
      npcReply = { speaker: "張斷骨", line: "人是從巷口來的。我沒替他們開路！" };
    } else if (action.includes("[搜刮殘局]")) {
      const source = SCAVENGE_SOURCES["黑泥街"];
      if (!state.sceneState!.depletedSources.includes(source.key) && state.inventory.length < state.maxInventory
        && darkHandCount(state.inventory) < DARK_HAND_LIMIT) {
        state.inventory.push(source.item);
        state.sceneState!.depletedSources.push(source.key);
        state.sectLifeline = Math.max(0, state.sectLifeline - 1);
        event = "你從血水裡拾起碎骨藏進袖口。巷口眼線看見你仍留在肉檔，轉身去報信。";
      }
    } else if (action.includes("[安頓收隊]")) {
      event = "你叫同門守住巷口，攙傷者離開肉檔。攤販把翻倒的木架扶起，街口才有人敢走過。";
      npcReply = state.flags.alleyAllyPresent ? { speaker: "陸千帆", line: "人交給我。你去看別處。" } : undefined;
    }
    if (event) {
      state.flags.marketAftermath = false;
      remember(state, "市集殘局已定");
      state.sectLifeline = Math.max(0, state.sectLifeline - 1);
    } else event = "肉檔前的血還沒乾。先把傷者、眼線或街口手尾處理妥當。";
    }
  } else {
    const pendingIncident = state.flags.pendingIncident;
    if (pendingIncident && selectedTravel) {
      state.currentLocation = selectedTravel.destination;
      event += `你走${selectedTravel.kind === "shortcut" ? "暗道" : "明路"}到${selectedTravel.destination}；急事仍待處置。`;
      if (selectedTravel.kind === "shortcut" && shortcutRiskDue(state, selectedTravel.riskPeriod)) {
        if (selectedTravel.riskDamage) { state.playerHp = Math.max(1, state.playerHp - selectedTravel.riskDamage); event += "暗巷遭人攔截，你帶傷脫身。"; }
        if (selectedTravel.riskLifeline) { state.sectLifeline = Math.max(0, state.sectLifeline - selectedTravel.riskLifeline); event += "眼線尾隨，堂口守衛不得不分神接應。"; }
      }
    } else if (pendingIncident) {
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
      event += "你將市集插旗、規費帳失頁與換封傷藥逐件交代。何不歸為你倒了杯茶：「最難捱的硬仗快到了，坐下回氣。」他攤開七處據點的守街名冊，與你逐一商量缺口。";
      npcReply = { speaker: "何不歸", line: "後半程，把沒查完的差事補上。" };
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
          event += `你從${creative.anchor}察出旁人漏看的破綻，及早通知堂口。`;
        } else if (creative.goal === "護人") {
          state.playerHp -= 3;
          state.sectLifeline = Math.min(100, state.sectLifeline + 4);
          event += `你借${creative.anchor}護住眼前的人，自己帶傷踉蹌半步；街面暫穩。`;
        } else if (creative.goal === "做工") {
          state.playerMp -= 3;
          state.silver += 4;
          event += `你借${creative.anchor}替人完成一樁活，氣喘吁吁地領了工錢。`;
        } else if (creative.goal === "牽制") {
          state.playerMp -= 3;
          state.sectLifeline = Math.min(100, state.sectLifeline + 3);
          event += `你借${creative.anchor}拖住玄武樓眼線，虎口發麻；堂口得以補位。`;
        } else {
          state.sectLifeline = Math.min(100, state.sectLifeline + 2);
          const companion = COMPANION_IDS.find((name) => name === creative.anchor);
          if (companion) changeTrust(state.relationships, companion, 1);
          event += `你同${creative.anchor}把眼前利害說清，對方肯替堂口留一條路。`;
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
        event += "你在苦煙館自掏十文請顧忘生調藥，託腳夫送往黑泥街。回信報陸千帆已換下舊布，傷勢漸穩。";
        npcReply = { speaker: "顧忘生", line: "傷口能合上。你若還叫他帶傷硬撐，這藥便白用了。" };
      } else event += "你拿不出十文私銀替陸千帆求藥，顧忘生先替你記下方子。";
    } else if (state.currentLocation === "夜雨樓" && action.startsWith("J. [接暗殺令]") && state.worldFlags.filter((flag) => flag.endsWith("完成")).length >= 3 && !state.worldFlags.includes("暗殺令已接")) {
      remember(state, "暗殺令已接");
      event += "柳照霜交你一張沒有署名的契紙：玄武樓的刀手頭目今晚會到黑泥街。事成付四十文私銀。";
      npcReply = { speaker: "柳照霜", line: "認清人再出手。錯一刀，錢救不了你。" };
    } else if (state.currentLocation === "黑泥街" && action.startsWith("J. [執行暗殺令]") && state.worldFlags.includes("暗殺令已接") && !state.worldFlags.includes("暗殺令已結")) {
      remember(state, "暗殺令已結");
      const skill = (state.knownMoves?.short_punch || 0) + (state.knownMoves?.point_strike || 0);
      if (skill >= 2 && state.playerHp >= 8) {
        state.silver += 40; state.playerHp -= 6; state.sectLifeline = Math.max(0, state.sectLifeline - 6);
        remember(state, "城東記恨暗殺");
        event += "你在肉檔後巷截住刀手頭目，帶傷領了酬勞；城東也認出你的手法。";
      } else {
        state.playerHp = Math.max(1, state.playerHp - 8); state.sectLifeline = Math.max(0, state.sectLifeline - 8);
        event += "你伏擊刀手卻未能壓住對方，帶傷撤回，酬勞落空。";
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
      event += "你在鬼骰坊收回私貸與利錢；門外街坊傳來怨言。";
      npcReply = { speaker: "祁觀衡", line: "錢收齊了。人情這一欄，帳上沒法替你填。" };
    } else if (state.currentLocation === "鬼骰坊" && action.startsWith("K. [領追債令]") && state.worldFlags.includes("假借據完成") && !state.worldFlags.includes("追債令已領")) {
      remember(state, "追債令已領");
      event += "祁觀衡把一張欠條交你，授權你到黑泥街追還堂口舊款；追回款項須入公帳，佣金另計。";
      npcReply = { speaker: "祁觀衡", line: "公數是公數，你的五文佣金我另記。" };
    } else if (state.currentLocation === "黑泥街" && action.startsWith("K. [和談追債]") && state.worldFlags.includes("追債令已領") && !state.worldFlags.includes("追債令已結")) {
      remember(state, "追債令已結"); state.factionFunds += 15; state.silver += 5;
      changeTrust(state.relationships, "陸千帆", 1);
      event += "你在黑泥街同欠債攤販商量分期，追回十五文入公帳；祁觀衡託人送來五文私銀佣金。";
      npcReply = { speaker: "陸千帆", line: "你肯留他一口飯，他下月才交得出餘款。" };
    } else if (state.currentLocation === "黑泥街" && action.startsWith("L. [強追欠款]") && state.worldFlags.includes("追債令已領") && !state.worldFlags.includes("追債令已結")) {
      remember(state, "追債令已結"); state.factionFunds += 20; state.silver += 8;
      changeTrust(state.relationships, "陸千帆", -1);
      state.sectLifeline = Math.max(0, state.sectLifeline - 5);
      event += "你在黑泥街強追舊款入公帳，祁觀衡託人送來佣金；攤販閉門。";
      npcReply = { speaker: "陸千帆", line: "帳是平了。這條街的人可未必肯認你。" };
    } else {
    const travel = /^F\. \[前往\] (.+)$/.exec(action);
    const routeTravel = selectedTravel;
    const movement = customAction(action) && /前往|走去|走到|抵達|潛入|闖入|進入/.test(action);
    const destination = routeTravel?.destination || travel?.[1] || (movement ? LANDMARKS.find((place) => action.includes(place)) : undefined);
    if (destination && LANDMARKS.includes(destination as Landmark)) {
      const routes = travelChoices(state, destination as Landmark);
      const selected = routeTravel ? routes.find((route) => route.label === action) : routes[0];
      if (!selected) event += destination === state.currentLocation ? "你已在此處，無須再走一趟。" : "這條路尚未查明，你留在原地。";
      else {
        travelTurns = selected.turns;
        state.turn += Math.max(0, travelTurns - 1);
        state.currentLocation = destination as Landmark;
        event += `你走${selected.kind === "shortcut" ? "暗道" : "明路"}，趕到${destination}。`;
        if (selected.kind === "shortcut") {
          if (shortcutRiskDue(state, selected.riskPeriod)) {
            if (selected.riskDamage) { state.playerHp = Math.max(1, state.playerHp - selected.riskDamage); event += "暗巷有人攔路，你帶傷脫身。"; }
            if (selected.riskLifeline) { state.sectLifeline = Math.max(0, state.sectLifeline - selected.riskLifeline); event += "尾巴跟到堂口據點，守衛忙著遮掩行跡。"; }
          }
          else { remember(state, "暗道行跡已藏"); event += "你避過街口眼線，記下對方的守位。"; }
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
        "青鋒堂總壇": "何不歸", "晚秋茶寮": "容晚秋", "黑泥街": socialTargets(state).includes("陸千帆") ? "陸千帆" : "張斷骨",
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
          state.sectLifeline = Math.max(0, state.sectLifeline - 1);
          event += tag === "拾碎骨" ? "你在肉案下拾起一片碎骨藏袖。巷口眼線記下你的動靜，轉身去報信。"
            : "你趁土灶熄火刮起爐灰藏袖。幾個茶客見了，轉頭便有人傳話。";
        } else event += "這處材料已被拿盡，或你再無空位藏暗手。";
        npcReply = { speaker: state.currentLocation === "黑泥街" ? "陸千帆" : "容晚秋",
          line: "東西拿到了，腳步也讓人聽見了。" };
      } else if (state.currentLocation === "鬼骰坊" && tag === "查賬房雜物") {
        openEntrance(state.sceneState!, "鬼骰坊");
        event += state.inventory.includes("【開鎖鐵線】")
          ? "你趁打手轉身搬開賬房雜物，以鐵線挑開活門鐵柵。門下暗路通茶寮與夜雨樓，退路已被人留意。"
          : "你搬開賬房後的雜物，摸到鐵柵活門，從箱底找出鏽鑰開鎖。門下暗路通茶寮土灶與夜雨樓酒窖。";
        npcReply = { speaker: "祁觀衡", line: "門在這裡。進去後別把人領回來。" };
      } else if (state.currentLocation === "夜雨樓" && tag === "查酒窖巨桶") {
        openEntrance(state.sceneState!, "夜雨樓");
        event += "你避開護院，下酒窖鑽進廢桶，摸出桶底暗門。路通鬼骰坊賬房的地下樞紐。";
        npcReply = { speaker: "柳照霜", line: "桶底那扇門，你自己記住。" };
      } else if (state.currentLocation === "晚秋茶寮" && tag === "移開灶底石板") {
        openEntrance(state.sceneState!, "晚秋茶寮");
        state.sectLifeline = Math.max(0, state.sectLifeline - 1);
        event += "你趁容晚秋招呼茶客，掀開土灶底的空心石板，露出向下的暗道。茶客看見入口，街口眼線開始尋路；你仍站在灶旁。";
        npcReply = { speaker: "容晚秋", line: "洞開了就快走。再磨蹭，人就跟下來。" };
      } else if (state.currentLocation === "苦煙館" && tag === "辨無名藥粉") {
        if (state.relationships["顧忘生"].trust >= 1 || state.background === "黑市醫道學徒") {
          state.sceneState!.medicineIdentified = true;
          event += state.background === "黑市醫道學徒"
            ? `你隔櫃辨出瓷瓶封口殘粉的氣味，那是${state.sceneState!.medicineKind}；瓶仍在顧忘生手邊。`
            : `顧忘生取下櫃後瓷瓶，倒出少許粉末驗過。那是${state.sceneState!.medicineKind}，沾到口鼻會使人手腳發軟。`;
          npcReply = { speaker: "顧忘生", line: "認出來便好。瓶子仍歸我管。" };
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
        if (state.playerHp > 6) {
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
          event += `你跟著${teacher}拆過一遍招，${moveName}的手法漸熟，虎口發麻。`;
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
          event += "你已知道這條街訊；容晚秋手上暫無新消息，沒有收你的錢，也沒有再扣私銀。";
          npcReply = { speaker: "容晚秋", line: "消息沒變，這回不收錢。等有人走過街口再來。" };
        } else if (state.silver >= 10) {
          state.silver -= 10;
          remember(state, "茶寮街訊已購");
          remember(state, "街面有備");
          event += `你付十文私銀，容晚秋把城西街口的消息告訴你。${reaction?.event || ""}`;
        } else {
          event += "私銀不足十文，容晚秋沒有收錢，也沒有說出街口新消息。";
          npcReply = { speaker: "容晚秋", line: "我靠這些消息過活。十文錢帶來，再談街口的事。" };
        }
      } else if (state.currentLocation === "晚秋茶寮" && tag === "買暗道") {
        if (state.worldFlags.includes("茶寮暗道已知")) {
          event += "你已知道通往夜雨樓的暗道路線；容晚秋沒有再收私銀，也沒有新的入口可說。";
          npcReply = { speaker: "容晚秋", line: "路還是那條路。記得看身後有沒有人跟著。" };
        } else if (state.silver >= 15) {
          state.silver -= 15;
          remember(state, "茶寮暗道已知");
          revealEntrance(state.sceneState!, "晚秋茶寮");
          revealEntrance(state.sceneState!, "夜雨樓");
          event += `你付十五文私銀，得知茶寮土灶底石板通往夜雨樓酒窖的暗道。${reaction?.event || ""}`;
        } else {
          event += "私銀不足十五文，容晚秋沒有收錢，也沒有說出暗道入口。";
          npcReply = { speaker: "容晚秋", line: "那條路值十五文。錢帶來，我才說入口在哪裏。" };
        }
      } else if (state.currentLocation === "青鋒堂總壇" && tag === "捐銀固防") {
        if (state.silver >= 20) { state.silver -= 20; state.factionFunds += 20; state.sectLifeline = Math.min(100, state.sectLifeline + 10); event += "你捐私銀入公帳，何不歸收下後安排人手換門閂、補傷藥。"; }
        else event += "你私銀不足二十文，何不歸叫你先留錢買藥。";
      } else if (state.currentLocation === "青鋒堂總壇" && tag === "休整") {
        restoreVitals(state, 0.2);
        event += "你在總壇靜坐調息，重新包紮傷處，呼吸漸穩。";
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
          const won = readTable || getPseudoRandom(state) < 50;
          if (readTable) state.worldFlags = state.worldFlags.filter((flag) => flag !== "已看透骰局");
          state.silver += won ? 10 : -10;
          event += won
            ? `骰盅落桌，你押在小上贏了。${readTable ? "先前看出的手勢讓你避開了莊家的圈套；" : ""}祁觀衡把銅錢撥回你面前。`
            : "骰盅落桌，你押在小上卻開了大。祁觀衡把銅錢撥到莊家那邊。";
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
          restoreVitals(state, 0.35);
          event += "你付錢請顧忘生配藥，敷藥後調勻氣息。";
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
          ? "你拆開行囊裏一包療傷藥，服下後調勻呼吸。"
          : "你沒有可用的療傷藥，或氣血與精力都已充足。";
      } else if (tag === "自敷止血膏藥" || tag === "自敷金創散") {
        const medicine = tag === "自敷止血膏藥" ? "【止血膏藥】" : "【金創散】";
        const index = state.inventory.indexOf(medicine);
        if (index >= 0 && state.playerHp < state.maxHp) {
          state.inventory.splice(index, 1);
          state.playerHp = Math.min(state.maxHp, state.playerHp + 4);
          event += `你取出${medicine}敷在傷口，重新紮緊布條，痛楚漸緩。`;
        } else event += "傷口無須再敷藥，這包藥仍留在行囊。";
      } else if (tag === "敷止血散") {
        const healed = consumeHemostaticPowder(state);
        event += healed ? "你將止血散按進傷口，重新紮緊布條，血終於止住。"
          : "傷口沒有出血，這包止血散先留在行囊。";
      } else if (state.currentLocation === "夜雨樓" && tag === "斷開跟梢") {
        if (state.playerMp >= 4) {
          state.playerMp -= 4;
          state.sectLifeline = Math.min(100, state.sectLifeline + 4);
          event += "你氣喘吁吁地甩開尾巴，替堂口藏住行跡。";
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
    event += "玄武樓趁你趕路向城西施壓。";
    if (state.currentLocation === "青鋒堂總壇" && state.worldFlags.includes("私吞五十文規費") && !state.worldFlags.includes("何不歸查出私吞")) {
      state.sectLifeline = Math.max(0, state.sectLifeline - 8);
      remember(state, "何不歸查出私吞");
      event += "你見何不歸查出私吞規費，堂口眾人面色鐵青。";
    }
    if (!state.combat && !pendingIncident && incidentDue(state)) {
      const incident = INCIDENTS[(state.flags.incidentCount || 0) % INCIDENTS.length];
      state.flags.pendingIncident = incident;
      state.flags.lastIncidentTurn = state.turn;
      state.flags.incidentCount = (state.flags.incidentCount || 0) + 1;
      event = INCIDENT_REPORTS[incident](state.currentLocation) + event;
      npcReply = incident === "missing_ledger" && state.currentLocation === "青鋒堂總壇"
        ? { speaker: "何不歸", line: "少一頁帳，我替你擋不了多久。先查誰摸過。" }
        : incident === "tainted_medicine" && state.currentLocation === "晚秋茶寮"
          ? { speaker: "容晚秋", line: "封口給人動過。快叫各處先別用藥。" }
          : incident === "market_raid" && state.currentLocation === "黑泥街"
            ? { speaker: "陸千帆", line: "刀手又來插旗。我守肉檔，你拿主意。" } : undefined;
    }
  }

  if (state.questStep === "sandbox" && state.turn >= 8 && state.turn < 70 && state.sectLifeline > 0
    && !opening && !wasInCombat && !wasInIncident && !wasInEncounter && !wasInAftermath
    && !state.combat && !state.pendingEncounter && !state.flags.pendingIncident
    && !state.flags.alleyEscape && !state.flags.alleyWall && !state.flags.marketAftermath
    && !state.flags.finalCrisis) {
    const encounter = drawEncounter(state);
    if (encounter) {
      state.pendingEncounter = encounter.id;
      state.lastEncounterTurn = state.turn;
      event += encounter.report;
      npcReply = undefined;
    }
  }

  if (state.questStep === "sandbox" && startingLocation !== "黑泥街" && state.currentLocation === "黑泥街"
    && state.worldFlags.includes("打斷張斷骨右手") && !state.worldFlags.includes("屠戶避讓")) {
    remember(state, "屠戶避讓");
    event += "你見張斷骨避開目光，肉檔再沒人敢當面頂撞。";
  }
  if (wasInAftermath && state.worldFlags.includes("救下陸千帆") && state.worldFlags.includes("市集殘局已定")
    && !state.flags.marketAftermath && !state.flags.alleyEscape && state.flags.marketAftermathKind !== "defeat") {
    event += `同門帶來何不歸的口信。口信寫道：「裴無鋒的人退去了東市，今晚必定大舉反撲。天黑前，尚餘${Math.max(0, 70 - state.turn)}回合，盡快跑勻七處據點穩住陣腳。」`;
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
  return { state, options: availableOptions(state), event: event.trim(), moneyNote: changes.join("，"),
    npcReply: localNpcReply(state, npcReply) };
}

export function resolveTurn(rawState: GameState, action: string, opening: boolean, creative?: CreativeAction, spendCustomUse = false,
  terrainObject?: "厚砧板" | "懸肉鐵鉤" | "剁骨刀", disarmAttempt = false, freeAttempt?: SceneAttempt): TurnResult {
  const result = resolveTurnCore(rawState, action, opening, creative, spendCustomUse, terrainObject, disarmAttempt, freeAttempt);
  if (rawState.pendingEncounter && result.state.turn > rawState.turn) {
    const choice = encounterChoice(rawState.pendingEncounter, action);
    if (choice?.actionTags?.length && (!choice.price || rawState.silver >= choice.price)) {
      result.event += applyActionTags(result.state.relationshipScores, rawState.currentLocation, choice.actionTags);
    }
  }
  if (rawState.flags.chapterOne?.stage === "shortage"
    && result.state.questStep === "chapter_one" && result.state.flags.chapterOne?.stage === "shortage"
    && result.state.turn > rawState.turn && !rawState.flags.pendingIncident && !rawState.pendingEncounter
    && !result.state.flags.pendingIncident && !result.state.pendingEncounter) {
    if (result.state.turn - (result.state.flags.lastIncidentTurn || 0) >= 8
      && getPseudoRandom(result.state) < 20) {
      const incident = INCIDENTS[(result.state.flags.incidentCount || 0) % INCIDENTS.length];
      result.state.flags.pendingIncident = incident;
      result.state.flags.lastIncidentTurn = result.state.turn;
      result.state.flags.incidentCount = (result.state.flags.incidentCount || 0) + 1;
      result.event += INCIDENT_REPORTS[incident](result.state.currentLocation);
    } else {
      const encounter = drawEncounter(result.state);
      if (encounter) {
        result.state.pendingEncounter = encounter.id;
        result.state.lastEncounterTurn = result.state.turn;
        result.event += encounter.report;
      }
    }
    result.options = availableOptions(result.state);
  }
  result.event = withoutSettlementLog(result.event);
  const history = result.state.history || [];
  const entry: HistoryEntry = { turn: result.state.turn, action, narrative: result.event,
    narrativeSource: "Fallback", preLocation: rawState.currentLocation,
    postLocation: result.state.currentLocation, questStep: result.state.questStep };
  if (history.length > (rawState.history?.length || 0) && history[history.length - 1]?.turn === result.state.turn) {
    history[history.length - 1] = entry;
  } else {
    history.push(entry);
  }
  result.state.history = history;
  return result;
}

export function resolveMarketDialogue(rawState: GameState, target: string, utterance: string,
  proposal: MarketNpcProposal): TurnResult & { reaction: MarketNpcReaction; reason: string } {
  const state = normalizeState(rawState);
  if (!state || state.pendingEncounter || marketDialogueTarget(state, utterance) !== target || state.flags.finalCrisis || state.flags.ending)
    return { state: state || rawState, options: availableOptions(state || rawState),
      event: "那人此刻不在面前，這句話沒有說出口。", moneyNote: "", reaction: "talk", reason: "target_absent" };
  const cost = state.playerMp <= 10 && !state.combat && !state.flags.alleyEscape ? 2 : 1;
  if (!state.combat && !canAffordEnergy(state, cost))
    return { state, options: availableOptions(state), event: "你已乏力，連話也說不清。", moneyNote: "",
      reaction: "talk", reason: "exhausted" };
  const prior = (state.flags.marketNpcHistory || []).filter((entry) => entry.target === target);
  let reaction: MarketNpcReaction = MARKET_NPC_REACTIONS.some((item) => item === proposal.reaction)
    ? proposal.reaction : "talk";
  const belief = typeof proposal.belief === "string" ? proposal.belief.replace(/[\r\n<>]/g, "").slice(0, 40).trim() : "";
  const concreteLeverage = /帳|借據|刀手|玄武樓|銀|錢|保命|護|救|出賣|證據/.test(utterance);
  const beliefTalks = prior.filter((entry) => belief && (entry.player.includes(belief)
    || belief === "基督信仰" && /耶穌|基督/.test(entry.player))).length;
  if (reaction === "adopt_belief" && (!belief || beliefTalks < 2)) reaction = "consider";
  if (reaction === "defect" && (prior.length < 2 || !concreteLeverage)) reaction = "consider";
  if (reaction === "reveal" && target !== "張斷骨") reaction = "consider";
  if (reaction === "defect" && target === "陸千帆") reaction = "cooperate";
  if (reaction === "cooperate" && target === "刀手" && prior.length === 0 && !concreteLeverage)
    reaction = "consider";

  let pressure = "";
  if (state.combat?.scenario === "market_ambush") {
    const guard = availableOptions(state).find((option) => option.startsWith("B."));
    if (guard) {
      const guarded = resolveTurn(state, guard, false);
      Object.assign(state, guarded.state);
      pressure = guarded.event;
      if (!state.combat && target === "刀手") reaction = "talk";
    }
  } else {
    state.turn += 1;
    spendEnergy(state, cost);
    state.sectLifeline = Math.max(0, state.sectLifeline - 1);
    if (state.flags.alleyEscape) {
      state.playerHp = Math.max(1, state.playerHp - 2);
      pressure = "你停下來喊話，追兵踏進泥水，刀鋒又擦過手臂。";
    }
  }
  if (state.sectLifeline === 0 || state.turn >= 70) state.flags.finalCrisis = true;
  if (state.flags.finalCrisis) reaction = "talk";

  const social = state.socialMemory ||= {};
  const person = social[target] ||= { stance: target === "刀手" ? "hostile" : target === "張斷骨" ? "wary" : "neutral",
    beliefs: [], topics: {} };
  let event = `你在${state.currentLocation}向${target}說了話。`;
  if (reaction === "refuse") { person.stance = person.stance === "neutral" ? "wary" : person.stance;
    event += `${target}不肯照辦，卻記住了你說的話。`; }
  if (reaction === "consider") event += `${target}沒有當場答應，要求你把話說實在。`;
  if (reaction === "reveal") {
    remember(state, "張斷骨避談眼線");
    event += "張斷骨沒報名字，只朝巷口灰衣人的藏身處斜了一眼。";
  }
  if (reaction === "cooperate") {
    person.stance = person.stance === "ally" ? "ally" : "cooperative";
    if (target === "陸千帆") changeTrust(state.relationships, "陸千帆", 1);
    if (target === "刀手" && state.combat) state.combat.preparedDefense = Math.min(5, state.combat.preparedDefense + 1);
    event += `${target}答應今次配合，往後仍看你能否守約。`;
  }
  if (reaction === "defect") {
    person.stance = "ally";
    remember(state, `${target}轉向玩家`);
    if (target === "刀手" && state.combat) state.combat.preparedDefense = Math.min(5, state.combat.preparedDefense + 2);
    if (target === "張斷骨") state.sectLifeline = Math.min(100, state.sectLifeline + 2);
    event += `${target}當場倒戈，舊主日後會追究。`;
  }
  if (reaction === "adopt_belief") {
    if (!person.beliefs.includes(belief)) person.beliefs.push(belief);
    event += `${target}接受了${belief}，這不會替他抹去舊帳。`;
  }
  const memory = typeof proposal.memory === "string" ? proposal.memory.replace(/[\r\n<>]/g, "").slice(0, 100) : "";
  state.flags.marketNpcHistory = [...(state.flags.marketNpcHistory || []), {
    turn: state.turn, target, player: utterance.slice(0, 300), reply: "", reaction, memory,
  }].slice(-16);
  if (rawState.questStep === "market_collection") {
    const intentHistory: NonNullable<GameState["flags"]["marketIntentHistory"]> = [...(state.flags.marketIntentHistory || []), {
      turn: state.turn, approach: "交涉" as const, target, outcome: event.slice(0, 160),
    }].slice(-8);
    state.flags.marketIntentHistory = intentHistory;
    if (intentHistory.length >= 3) {
      state.questStep = "huizhi_ambush";
      state.flags.marketAmbushTriggered = true;
      state.combat = createCombat("market_ambush", !state.worldFlags.includes("棄下陸千帆"));
      event += "巷口刀手等不下去，亮刀逼近肉案。";
    }
  }
  return { state, options: availableOptions(state), event: `${event}${pressure}${marketPressureWarning(state)}`, moneyNote: "",
    reaction, reason: typeof proposal.reason === "string" ? proposal.reason.slice(0, 100) : "" };
}

export function recordMarketNpcReply(state: GameState, target: string, reply: string): void {
  const latest = state.flags.marketNpcHistory?.at(-1);
  if (latest?.target === target && latest.turn === state.turn) latest.reply = reply.replace(/[\r\n<>]/g, "").slice(0, 300);
}

export function resolveSocialIntent(rawState: GameState, plan: SocialIntent): TurnResult {
  const start = normalizeState(rawState);
  if (!start || !socialTargets(start).includes(plan.target)
    || start.flags.pendingIncident || start.pendingEncounter
    || start.questStep !== "chapter_one" && (start.flags.ending || start.flags.finalCrisis)
    || start.flags.chapterOne?.stage === "complete" || start.flags.chapterOne?.stage === "failed")
    return { state: start || rawState, options: availableOptions(start || rawState), event: "那人眼下不在你面前，這番話無處可說。", moneyNote: "" };
  const socialCost = start.playerMp <= 10 && !start.combat && !start.flags.alleyEscape ? 2 : 1;
  if (!start.combat && !canAffordEnergy(start, socialCost))
    return { state: start, options: availableOptions(start), event: "你已乏力，眼下說不清這番話；先找地方歇息。", moneyNote: "" };

  const spoken = start.combat?.scenario === "market_ambush";
  const guard = spoken ? availableOptions(start).find((option) => option.startsWith("B.")) : undefined;
  const guarded = guard ? resolveTurn(start, guard, false) : undefined;
  const state = guarded?.state || start;
  let pressure = guarded?.event || "";
  if (!guarded) {
    if (state.questStep === "chapter_one") pressure = advanceChapterSocialTurn(state, socialCost);
    else {
      state.turn += 1;
      pressure = spendEnergy(state, socialCost);
      state.sectLifeline = Math.max(0, state.sectLifeline - 1);
      if (state.flags.alleyEscape) {
        state.playerHp = Math.max(1, state.playerHp - 2);
        pressure += "你停步喊話，追兵追近，刀鋒擦過衣袖。";
      }
    }
  }
  if (state.questStep !== "chapter_one" && (state.sectLifeline === 0 || state.turn >= 70))
    state.flags.finalCrisis = true;
  if (state.flags.chapterOne?.stage === "failed"
    || state.questStep !== "chapter_one" && (state.flags.ending || state.flags.finalCrisis))
    return { state, options: availableOptions(state), event: `${pressure}眼前局勢已崩，對話沒能再談下去。`, moneyNote: "" };
  if (spoken && !state.combat)
    return { state, options: availableOptions(state), event: `${pressure}刀手已退開，你的話未能當面說完。`, moneyNote: "" };

  const memory = state.socialMemory ||= {};
  const person = memory[plan.target] ||= {
    stance: plan.target === "刀手" ? "hostile" : plan.target === "張斷骨" || plan.target === "碼頭守衛" ? "wary" : "neutral",
    beliefs: [], topics: {},
  };
  const key = socialTopic(plan);
  const topic = person.topics[key] ||= { progress: 0, resistance: 0, tactics: [], arguments: [], lastTurn: 0 };
  const argument = plan.method.replace(/[\s，。！？：；「」,.:;!?]/g, "").slice(0, 100);
  const repeated = topic.arguments.includes(argument)
    || topic.tactics.filter((tactic) => tactic === plan.tactic).length >= (plan.tactic === "reason" || plan.tactic === "evidence" ? 2 : 1);
  const inDanger = Boolean(start.combat || start.flags.alleyEscape);
  const evidencePairs = [
    [/帳|借據/, /帳|借據/], [/刀手|眼線|伏兵/, /刀手|眼線|伏兵/],
    [/貨|船|碼頭/, /貨|船|碼頭|斷貨/], [/藥|封口/, /藥|封口/], [/街訊/, /街訊/],
  ] as const;
  const knownEvidence = plan.tactic === "evidence" && (start.worldFlags.some((flag) =>
    evidencePairs.some(([spoken, known]) => spoken.test(plan.method) && known.test(flag)))
    || Boolean(start.flags.chapterOne?.evidence && /貨|船|碼頭|帳/.test(plan.method)));
  const trustedCompanion = COMPANION_IDS.includes(plan.target as CompanionId)
    && start.relationships[plan.target as CompanionId].trust >= 1;
  const tangibleOffer = plan.tactic === "interest" && /銀|錢|分成|好處|保住生意|保命/.test(plan.method)
    && (start.silver >= 5 || /保命|保住生意/.test(plan.method));
  const costlyConcession = plan.tactic === "concession" && /我會|我願|交換|放你|替你|幫你/.test(plan.method);
  const credibleThreat = plan.tactic === "threat" && /證據|借據|帳簿|貨單|告發/.test(plan.method)
    && start.worldFlags.some((flag) => /證|帳|借據|貨/.test(flag));
  const reasonedCase = plan.tactic === "reason" && /因為|所以|若果|如果|道理|何以|為甚麼|點解/.test(plan.method);
  const personalWitness = plan.tactic === "testimony" && /親身|我曾|我見過|我經歷|我試過/.test(plan.method);
  const sharedHistory = plan.tactic === "bond" && /舊情|同門|恩情|救過|相識|朋友/.test(plan.method);
  let gain = repeated ? 0 : knownEvidence ? plan.goal === "belief" ? 1 : 2
    : trustedCompanion && plan.tactic === "bond" ? 2
      : tangibleOffer || costlyConcession || credibleThreat || reasonedCase || personalWitness
        || sharedHistory && trustedCompanion ? 1 : 0;
  gain = Math.min(gain, plan.quality === "weak" ? 0
    : plan.quality === "grounded" && (knownEvidence || trustedCompanion && plan.tactic === "bond") ? 2 : 1);
  if (inDanger && !knownEvidence && plan.goal !== "truce") gain = Math.max(0, gain - 1);
  if (plan.tactic === "threat" && !credibleThreat) {
    topic.resistance = Math.min(8, topic.resistance + 1);
    person.stance = person.stance === "neutral" ? "wary" : person.stance;
  }
  if (repeated) topic.resistance = Math.min(8, topic.resistance + 1);
  topic.progress = Math.min(8, topic.progress + gain);
  topic.lastTurn = state.turn;
  if (!repeated) { topic.tactics.push(plan.tactic); topic.arguments.push(argument); }
  const threshold = plan.goal === "belief" ? 5 : plan.goal === "defect" ? 5
    : plan.goal === "truce" ? 3
      : person.stance === "ally" || person.stance === "cooperative" ? 1 : 2;
  const required = threshold + (person.stance === "hostile" ? 1 : 0) + Math.min(2, topic.resistance);
  const achieved = topic.progress >= required;
  let event = `你當面向${plan.target}提出${plan.subject}。`;
  let line = "空口說這些，叫我拿甚麼信你？";
  if (repeated) {
    event += `${plan.target}聽出你仍是舊話，反而退開半步。`;
    line = "你剛才說過了。拿點真的來。";
  } else if (!gain) {
    event += `${plan.target}沒有改口；眼下的說法欠了憑據，或未碰到他的利害。`;
  } else if (!achieved) {
    event += `${plan.target}接住你的話，仍要看你下一步拿出甚麼。`;
    line = "話我聽見了。再拿點真憑據。";
  } else if (plan.goal === "belief") {
    if (!person.beliefs.includes(plan.subject)) person.beliefs.push(plan.subject);
    person.stance = person.stance === "hostile" ? "wary" : person.stance;
    event += `${plan.target}接納了${plan.subject}，往後說話和取捨都須記住這番轉變。`;
    line = "我信了。可舊帳還得逐筆算。";
  } else if (plan.goal === "defect") {
    person.stance = "ally";
    const firstDefection = !state.worldFlags.includes(`${plan.target}轉向玩家`);
    remember(state, `${plan.target}轉向玩家`);
    if (plan.target === "刀手" && state.combat?.scenario === "market_ambush")
      state.combat.preparedDefense = Math.min(5, state.combat.preparedDefense + 2);
    if (plan.target === "張斷骨" && firstDefection)
      state.sectLifeline = Math.min(100, state.sectLifeline + 2);
    if (plan.target === "碼頭守衛" && firstDefection && state.flags.chapterOne?.stage === "dock") {
      state.flags.chapterOne.dockRouteKnown = true;
      state.flags.chapterOne.evidence = Math.min(10, state.flags.chapterOne.evidence + 1);
      event += "他交出了碼頭換班路線。";
    }
    event += `${plan.target}收住手，明說這回站在你這邊；舊主仍會追究。`;
    line = "這回我幫你。舊帳，回頭再算。";
  } else {
    if (plan.goal === "help" && person.stance !== "ally") person.stance = "cooperative";
    if (plan.goal === "truce" && person.stance === "hostile") person.stance = "wary";
    if (plan.goal === "truce" && plan.target === "刀手" && state.combat?.scenario === "market_ambush")
      state.combat.preparedDefense = Math.min(5, state.combat.preparedDefense + 1);
    if (COMPANION_IDS.includes(plan.target as CompanionId) && plan.goal === "help")
      changeTrust(state.relationships, plan.target as CompanionId, 1);
    if (plan.target === "船工" && plan.goal === "help" && state.flags.chapterOne?.stage === "dock") {
      state.flags.chapterOne.crewHired = true;
      state.flags.chapterOne.dockRouteKnown = true;
      event += "船工願意自發接應岸邊的糧藥。";
    }
    event += plan.goal === "truce" ? `${plan.target}暫且收手，但沒有答應放棄原來的差事。`
      : plan.goal === "information" ? `${plan.target}答應交代自己知道的事，仍要你逐項追問。`
        : `${plan.target}答應出手幫這一回，往後是否同行仍要看交情。`;
    line = plan.goal === "truce" ? "先停手。別當我認輸。" : "好，這一回我幫。";
  }
  if (start.questStep === "market_collection") {
    const history: NonNullable<GameState["flags"]["marketIntentHistory"]> = [...(state.flags.marketIntentHistory || []), {
      turn: state.turn, approach: "交涉" as const, target: plan.target, outcome: event.slice(0, 160),
    }].slice(-8);
    state.flags.marketIntentHistory = history;
    if (history.length >= 3) {
      state.questStep = "huizhi_ambush";
      state.flags.marketAmbushTriggered = true;
      state.combat = createCombat("market_ambush", !state.worldFlags.includes("棄下陸千帆"));
      event += "巷口刀手等不下去，亮刀逼近肉案。";
    }
  }
  return { state, options: availableOptions(state), event: `${event}${pressure}${marketPressureWarning(state)}`, moneyNote: "",
    npcReply: { speaker: plan.target, line } };
}

export function resolveSceneAttempt(rawState: GameState, plan: SceneAttempt): TurnResult {
  const state = normalizeState(rawState);
  if (!state || !isMarketIntentScene(state)) throw new Error("黑泥街現場狀態無效");
  const denied = (event: string): TurnResult => ({ state, options: availableOptions(state), event, moneyNote: "" });
  if (claimsUnacquiredObject(state, plan.method))
    return denied("你剛才沒有拿到鐵鉤；它仍在肉架上，眼下不能當作手持兵器。");
  if (state.playerMp === 0 && (plan.effect === "harm" || plan.effect === "seize"))
    return denied(plan.object === "懸肉鐵鉤" ? "你精力不足，扯不下肉架鐵鉤；鐵鉤仍掛在肉架上。"
      : "你精力不足，眼下無法出手奪物或進擊。");
  if (!marketIntentTargets(state).includes(plan.target) || plan.object && !sceneAttemptObjects(state).includes(plan.object))
    return denied("眼前沒有這個人或物；先看清身位再出手。");
  if (state.flags.marketAftermath && plan.effect === "seize" && plan.object === "碎骨片")
    return resolveMarketIntent(state, { approach: "借物", target: plan.target, object: "碎骨片", method: plan.method });
  if ((plan.effect === "harm" || plan.effect === "seize")
    && !["刀手", "張斷骨"].includes(plan.target) && !plan.object)
    return denied("眼前無人可供這樣下手；說清你要碰誰、碰甚麼。");
  const carried = plan.object && state.inventory.includes(`【${plan.object}】`);
  const physical = plan.object && !carried && plan.object !== "刀手短刀"
    ? objectStatus(state.sceneState!, plan.object) : undefined;
  if (plan.object && !carried && plan.object !== "刀手短刀" && !physical)
    return denied("那件物事不在你眼前，不能隔空借用。");
  if (physical?.holder && physical.holder !== plan.target)
    return denied(`${plan.object}仍在${physical.holder}手裡，須先貼近他，不能越人取物。`);
  if (state.combat && plan.object === "剁骨刀")
    return denied("刀手正隔在你與張斷骨的肉案之間，眼下碰不到那把剁骨刀。");
  if (physical?.handling === "fixed" && /掟|擲|拋|扔|拿走|帶走/.test(plan.method))
    return denied(`${plan.object}固定在原處，搬不走。`);
  if (physical?.handling === "heavy" && /掟|擲|拋|扔/.test(plan.method))
    return denied(`${plan.object}沉重，不能當飛鏢擲出去。`);
  if (plan.object === "刀手短刀" && plan.target !== "刀手")
    return denied("短刀在刀手掌中，眼下碰不到別人的手裡。 ");
  if (plan.object === "刀手短刀" && state.flags.alleyEscape)
    return denied("你與刀手隔著巷口，先貼近才可搶腕。 ");
  if (plan.object === "刀手短刀" && plan.effect !== "seize")
    return denied("短刀還在刀手手裡，先奪下才可拿來使。 ");
  if (carried && isDarkHand(`【${plan.object}】`)) {
    const result = resolveMarketIntent(state, { approach: "借物", target: plan.target, object: plan.object, method: plan.method });
    return result;
  }
  const usedMedicine = Boolean(carried && plan.object && ["金創散", "止血膏藥", "止血散"].includes(plan.object)
    && plan.effect !== "inspect");
  if (usedMedicine && plan.effect === "protect" && plan.target === "陸千帆" && marketWoundTreated(state))
    return denied("陸千帆的傷口已敷過藥；這包藥先留著，眼下要處理規費或巷口刀手。");
  const spendMedicine = (next: GameState): string | undefined => {
    if (!usedMedicine) return;
    if (plan.effect === "protect" && plan.target === "陸千帆") {
      return treatMarketWound(next, plan.object);
    }
    const item = `【${plan.object}】`;
    const index = next.inventory.indexOf(item);
    if (index >= 0) next.inventory.splice(index, 1);
    if (plan.effect === "protect" && plan.target === "自己") next.playerHp = Math.min(next.maxHp, next.playerHp + 4);
  };
  const record = (next: GameState, event: string) => {
    next.flags.marketIntentHistory = [...(next.flags.marketIntentHistory || []), {
      turn: next.turn, approach: "自訂" as const, target: plan.target, ...(plan.object ? { object: plan.object } : {}), outcome: event.slice(0, 160),
    }].slice(-8);
  };
  if (state.combat || state.questStep === "huizhi_ambush" || plan.target === "刀手"
    && ["harm", "disrupt", "seize", "move"].includes(plan.effect) && state.questStep === "market_collection") {
    if (state.flags.marketAftermath || state.flags.alleyEscape)
      return denied("刀手已不在你能貼身出手的位置。 ");
    if (!state.combat) {
      state.questStep = "huizhi_ambush";
      state.flags.marketAmbushTriggered = true;
      state.combat = createCombat("market_ambush", !state.worldFlags.includes("棄下陸千帆"));
      state.combat.preparedDefense = Math.min(5, ["已察覺巷口伏兵", "肉案已作遮掩", "陸千帆同意配合"]
        .filter((flag) => state.worldFlags.includes(flag)).length);
    }
    if (physical?.reach === "guarded" && physical.holder !== plan.target)
      return denied("有人守著這件物事，你貼不到它。 ");
    const action = availableOptions(state).find((option) => option.startsWith("A."));
    if (!action) return denied("刀手已退開，眼前無法交手。 ");
    const result = resolveTurn(state, action, false, undefined, false, undefined, false, plan);
    if (physical?.reach === "move" && result.state.playerHp > 1) {
      result.state.playerHp -= 1;
      result.state.playerMp = Math.max(0, result.state.playerMp - (physical.handling === "heavy" ? 1 : 0));
      result.event = `你伸手去碰${plan.object}，肘邊挨了一下。${result.event}`;
    }
    if (physical?.handling === "heavy" && physical.reach !== "move") {
      result.state.playerMp = Math.max(0, result.state.playerMp - 1);
      result.event = `你費力挪動${plan.object}，身位慢了半拍。${result.event}`;
    }
    if (plan.object && physical && plan.effect !== "inspect")
      result.state.sceneState!.movedObjects[plan.object] = plan.object === "排污水溝爛木蓋板"
        && ["move", "disrupt", "seize"].includes(plan.effect) ? "水溝蓋板掀開，溝口露出"
        : plan.object === "半扇懸掛生豬胴體" ? "肉架下搖晃，已偏離原位" : "黑泥街交手處，已被挪動";
    const medicine = spendMedicine(result.state);
    if (medicine) result.event = `你把${medicine}按在陸千帆傷口。${result.event}`;
    record(result.state, result.event);
    return result;
  }
  const cost = physical?.handling === "heavy" || physical?.reach === "guarded" ? 2 : 1;
  if (state.playerMp < cost && state.playerHp <= 2) return denied("你連站穩都難，眼下做不到這一步。 ");
  state.turn += 1;
  const shortfall = Math.max(0, cost - state.playerMp);
  state.playerMp = Math.max(0, state.playerMp - cost);
  if (shortfall) state.playerHp = Math.max(1, state.playerHp - shortfall * 2);
  let event: string;
  if (state.flags.alleyEscape) {
    state.sectLifeline = Math.max(0, state.sectLifeline - 1);
    const priorWall = Boolean(state.flags.alleyWall);
    if (plan.effect === "move" && priorWall) {
      state.flags.alleyEscape = false;
      state.flags.marketAftermath = true;
      state.flags.marketAftermathKind = "escape";
      remember(state, "黑泥街巷尾脫險");
      event = `你借${plan.object || "牆根"}翻出死巷。刀手留在牆那邊，陸千帆仍須止血。`;
    } else if (plan.effect === "move" || plan.effect === "disrupt") {
      state.flags.alleyWall = true;
      state.playerHp = Math.max(1, state.playerHp - 2);
      event = `你${plan.object ? `挪動${plan.object}` : "搶身貼牆"}，刀手仍守著街口；你踩上巷尾牆根，手背又挨了一刀。`;
    } else {
      state.playerHp = Math.max(1, state.playerHp - 3);
      event = `你在死巷裡${plan.effect === "protect" ? "護住身後的人" : "試探刀手的位置"}，刀口仍逼近，退路尚未打開。`;
    }
    if (plan.object === "餿水桶" && (plan.effect === "move" || plan.effect === "disrupt")) {
      const poured = /踢翻|推翻|倒|潑|傾|翻桶/.test(plan.method);
      state.sceneState!.movedObjects["餿水桶"] = poured ? "巷口倒翻，餿水流滿地" : "挪到死巷牆根";
      if (poured && !state.sceneState!.depletedSources.includes("餿水桶")) state.sceneState!.depletedSources.push("餿水桶");
    }
    if (plan.object === "廢竹籮" && (plan.effect === "move" || plan.effect === "disrupt"))
      state.sceneState!.movedObjects["廢竹籮"] = priorWall ? "被挪到牆背窄口" : "挪到死巷牆根";
  } else if (state.flags.marketAftermath) {
    state.flags.marketAftermath = false;
    remember(state, "市集殘局已定");
    state.sectLifeline = Math.max(0, state.sectLifeline - 1);
    if (plan.effect === "harm" && plan.target === "張斷骨") {
      remember(state, "當街襲擊張斷骨");
      state.sectLifeline = Math.max(0, state.sectLifeline - 2);
    }
    if (plan.effect === "seize" && plan.object && physical?.handling === "take" && !physical.holder
      && state.inventory.length < state.maxInventory) {
      state.inventory.push(`【${plan.object}】`);
      state.sceneState!.objectHolders[plan.object] = state.playerName;
      state.sceneState!.movedObjects[plan.object] = `${state.playerName}的行囊`;
    }
    event = plan.effect === "inspect" ? `你在${plan.target}附近查過，血跡與刀痕還在；眼線見你留步，先一步散去。`
      : plan.effect === "protect" ? "你先安頓傷者，守住巷口；刀手沒有再折返。"
        : plan.effect === "harm" && plan.target === "張斷骨" ? "你把張斷骨揪出肉案，街坊退開；血案又添一筆，堂口須替你收拾。"
          : plan.effect === "seize" && plan.object && state.inventory.includes(`【${plan.object}】`)
            ? `你從殘局拾起${plan.object}，收進行囊；巷口眼線記下你的動靜。`
        : "你把肉檔眼前的手尾收拾妥當，帶人離開血地。";
  } else {
    if (plan.effect === "move" && (plan.target === "自己" || plan.target === "陸千帆")) {
      const withAlly = plan.target === "陸千帆";
      remember(state, withAlly ? "救下陸千帆" : "棄下陸千帆");
      state.flags.alleyAllyPresent = withAlly;
      state.flags.alleyEscape = true;
      state.flags.alleyWall = false;
      state.questStep = "sandbox";
      state.sectLifeline = Math.max(0, state.sectLifeline - 6);
      event = withAlly ? "你架起陸千帆退進死巷，刀手搶先封住街口；巷尾竹籮仍可墊腳攀牆。"
        : "你獨自退進死巷，陸千帆留在肉檔；刀手封住街口，巷尾竹籮仍可墊腳。";
    } else if (physical?.holder && plan.effect === "seize") {
      state.playerHp = Math.max(1, state.playerHp - 3);
      dropMarketObject(state, plan.object!, "肉案下，從持有人手裡震落");
      event = `你貼身扣住${physical.holder}的手，刀口劃過手背；${plan.object}落到肉案下，巷口刀手循聲逼近。`;
    } else if (plan.effect === "inspect") {
      remember(state, "已察覺巷口伏兵");
      event = `你貼著${plan.object || plan.target}看清巷口動靜；刀手藏在暗處，見你抬頭便收刀。`;
    } else if (plan.effect === "protect" || plan.effect === "disrupt") {
      if (physical && plan.object) state.sceneState!.movedObjects[plan.object] = "肉檔前，已挪作遮掩";
      if (plan.object === "厚砧板") remember(state, "肉案已作遮掩");
      if (plan.target === "陸千帆" && plan.effect === "protect") {
        remember(state, "救下陸千帆");
        changeTrust(state.relationships, "陸千帆", 1);
        state.flags.alleyAllyPresent = true;
      }
      if (plan.effect === "disrupt" && !plan.object) remember(state, "已察覺巷口伏兵");
      event = usedMedicine && plan.effect === "protect" && plan.target === "陸千帆"
        ? "陸千帆扶著肉案站穩；巷口刀手改了站位。"
        : `你${plan.object ? `挪動${plan.object}` : "卡住身位"}，替${plan.target}搶出半步；巷口刀手改了站位。`;
    } else {
      if (plan.effect === "harm" && plan.target === "張斷骨") {
        remember(state, "當街襲擊張斷骨");
        state.sectLifeline = Math.max(0, state.sectLifeline - 2);
      }
      event = `你朝${plan.target}試了一手，肉檔前的人群散開；巷口刀手亮出短刀。`;
    }
    state.sectLifeline = Math.max(0, state.sectLifeline - 1);
    if (!state.flags.alleyEscape && (["harm", "seize", "move"].includes(plan.effect)
      || (state.flags.marketIntentHistory || []).length >= 2)) {
      state.questStep = "huizhi_ambush";
      state.flags.marketAmbushTriggered = true;
      state.combat = createCombat("market_ambush", !state.worldFlags.includes("棄下陸千帆"));
      state.combat.preparedDefense = Math.min(5, ["已察覺巷口伏兵", "肉案已作遮掩"]
        .filter((flag) => state.worldFlags.includes(flag)).length);
    }
  }
  const medicine = spendMedicine(state);
  if (medicine) event = `你把${medicine}按在陸千帆傷口。${event}`;
  record(state, event);
  return { state, options: availableOptions(state), event: `${event}${marketPressureWarning(state)}`, moneyNote: "" };
}

export function resolveMarketIntent(rawState: GameState, plan: MarketIntent): TurnResult {
  const state = normalizeState(rawState);
  if (!state || !isMarketIntentScene(state)) throw new Error("黑泥街現場狀態無效");
  const rejected = (event: string): TurnResult => ({ state, options: availableOptions(state), event, moneyNote: "" });
  if (claimsUnacquiredObject(state, plan.method))
    return rejected("你剛才沒有拿到鐵鉤；它仍在肉架上，眼下不能當作手持兵器。");
  if (state.questStep === "market_collection" && ["借物", "進擊", "奪械"].includes(plan.approach)
    && state.playerMp < (plan.approach === "借物" ? 2 : 1))
    return rejected(plan.object === "懸肉鐵鉤"
      ? "你精力不足，扯不下肉架鐵鉤；鐵鉤仍掛在肉架上。"
      : "你精力不足，眼下無法出手奪物或進擊。");
  const record = (next: GameState, event: string) => {
    next.flags.marketIntentHistory = [...(next.flags.marketIntentHistory || []), {
      turn: next.turn, approach: plan.approach, target: plan.target, ...(plan.object ? { object: plan.object } : {}),
      outcome: event.slice(0, 160),
    }].slice(-8);
  };
  if (plan.approach === "奪械") {
    if (plan.target !== "刀手" || plan.object) return rejected("要搶的是刀手手上的短刀；先看清他的位置，不能隔空取刀。");
    if (state.equippedWeapon && state.equippedWeapon !== "fists")
      return rejected("你手上還握著兵器；須先騰出雙手，才可貼身扣刀手的腕。");
    if (state.flags.alleyEscape || state.flags.marketAftermath)
      return rejected("你與持刀人隔著巷牆或已散開，眼下貼不到他的腕。");
    const rushedFromStall = state.questStep === "market_collection";
    if (rushedFromStall) {
      state.questStep = "huizhi_ambush";
      state.flags.marketAmbushTriggered = true;
      state.combat = createCombat("market_ambush", !state.worldFlags.includes("棄下陸千帆"));
      state.combat.preparedDefense = Math.min(5, ["已察覺巷口伏兵", "肉案已作遮掩",
        "問清刀手兵刃", "陸千帆同意配合"].filter((flag) => state.worldFlags.includes(flag)).length);
    }
    const attack = availableOptions(state).find((option) => option.startsWith("A."));
    if (!attack) return rejected("刀手此刻不在你能貼身搶腕的位置。");
    const result = resolveTurn(state, attack, false, undefined, false, undefined, true);
    if (rushedFromStall) result.event = `你撲向巷口持刀人。${result.event}`;
    record(result.state, result.event);
    return result;
  }
  if (state.questStep === "market_collection" && plan.approach === "救護") {
    if (plan.target !== "陸千帆") return rejected("陸千帆就在肉案旁；眼前沒有其他能由你救治的人。");
    if (marketWoundTreated(state)) return rejected("陸千帆的傷口已敷過藥；眼下先處理規費或巷口刀手。");
    return resolveSceneAttempt(state, { effect: "protect", target: "陸千帆",
      ...(plan.object ? { object: plan.object } : {}), method: plan.method });
  }
  if (state.questStep !== "market_collection") {
    if (state.combat && plan.object === "剁骨刀")
      return rejected("刀手正隔在你與張斷骨的肉案之間，眼下碰不到那把剁骨刀。 ");
    const usingDarkHand = Boolean(plan.object && state.inventory.some((item) => isDarkHand(item) && item === `【${plan.object}】`));
    if (plan.approach === "借物" && state.combat && !usingDarkHand
      && !["厚砧板", "懸肉鐵鉤", "剁骨刀"].includes(plan.object || ""))
      return rejected("這件物事眼下不能拿來擋刀；換個合乎手邊位置的用法。 ");
    if (plan.approach === "借物" && state.flags.alleyEscape && !usingDarkHand
      && !["廢竹籮", "餿水桶"].includes(plan.object || ""))
      return rejected("巷尾夠得著的只有竹籮、餿水桶和你身上的暗手。 ");
    if (plan.approach === "借物" && state.flags.marketAftermath && !usingDarkHand
      && !(state.flags.marketAftermathKind === "escape" ? plan.object === "廢竹籮" : plan.object === "碎骨片"))
      return rejected("這件物事眼下不能從殘局裡取作暗手。 ");
    if (state.flags.alleyEscape && plan.approach === "查探") {
      state.turn += 1;
      if (state.playerMp > 0) state.playerMp -= 1;
      else state.playerHp = Math.max(1, state.playerHp - 2);
      state.sectLifeline = Math.max(0, state.sectLifeline - 1);
      const event = state.flags.alleyWall
        ? "你伏在牆頭看清後巷，刀手守著落腳處；身後追兵踩上竹籮，留給你的空檔更窄了。"
        : "你貼著死巷牆根探頭，肉檔前的刀手仍封住街口。巷尾竹籮尚可墊腳，追兵又逼近一步。";
      record(state, event);
      return { state, options: availableOptions(state), event, moneyNote: "" };
    }
    const options = availableOptions(state);
    const withTag = (tag: string) => options.find((option) => option.includes(`[${tag}]`));
    const tag = state.combat?.scenario === "market_ambush"
      ? plan.approach === "脫身" ? "護人撤離"
        : plan.approach === "救護" || plan.approach === "防守" ? "護住同門"
          : plan.approach === "查探" ? "佯攻破綻"
            : plan.approach === "借物" ? "借地形" : "正面進擊"
      : state.flags.alleyEscape
        ? state.flags.alleyWall
          ? plan.approach === "借物" ? "扯籮阻路" : plan.approach === "進擊" || plan.approach === "施壓" ? "撞開刀手" : "借牆脫身"
          : plan.object === "餿水桶" ? "踢翻餿水桶"
            : plan.approach === "救護" || plan.approach === "防守" ? state.flags.alleyAllyPresent ? "伏低護人" : "伏低保命"
              : plan.approach === "進擊" || plan.approach === "施壓" ? "硬闖街口" : "踩籮翻牆"
        : state.flags.marketAftermathKind === "defeat"
          ? plan.approach === "救護" ? state.flags.alleyAllyPresent ? "檢視傷勢" : "裹緊傷口"
            : plan.approach === "查探" || plan.approach === "防守" ? "伏身避刀" : "撤離街口"
        : plan.approach === "救護" ? state.flags.alleyAllyPresent ? "檢視傷勢" : "裹緊傷口"
          : plan.approach === "查探" || plan.approach === "防守" ? state.flags.marketAftermathKind === "escape" ? "封住退路" : "伏巷警戒"
            : plan.approach === "借物" ? state.flags.marketAftermathKind === "escape" ? "封住退路" : "搜刮殘局"
              : plan.target === "張斷骨" && state.flags.marketAftermathKind !== "escape" ? "盤問張斷骨"
                : state.flags.marketAftermathKind === "escape" ? "離巷收隊" : "安頓收隊";
    const combatLetter = plan.approach === "脫身" ? "E"
      : plan.approach === "救護" || plan.approach === "防守" ? "B"
        : plan.approach === "借物" ? "C" : plan.approach === "查探" || plan.approach === "交涉" ? "D" : "A";
    const option = usingDarkHand ? options.find((item) => item.startsWith("I. [撒生石灰]")
      || item.startsWith("I. [施放暗手]"))
      : state.combat ? options.find((item) => item.startsWith(`${combatLetter}.`)) : withTag(tag);
    if (!option) return rejected("眼前無法用這件物事達成所想；換個貼近當前身位的手段。 ");
    const terrainObject = state.combat && plan.approach === "借物" && ["厚砧板", "懸肉鐵鉤", "剁骨刀"].includes(plan.object || "")
      ? plan.object as "厚砧板" | "懸肉鐵鉤" | "剁骨刀" : undefined;
    const result = resolveTurn(state, option, false, undefined, false, terrainObject);
    if (plan.approach === "救護" && plan.target === "陸千帆") {
      const allyPresent = Boolean(state.combat?.allyPresent || state.flags.alleyAllyPresent);
      const medicine = allyPresent ? treatMarketWound(result.state) : undefined;
      if (medicine) result.event = `你把${medicine}按進陸千帆傷口。${result.event}`;
    }
    if (plan.approach === "交涉" && plan.target === "刀手")
      result.event = `你喊話想叫刀手停步，他沒有收刀。${result.event}`;
    record(result.state, result.event);
    return result;
  }

  const { approach, target, object } = plan;
  const carriedDarkHandItem = object ? state.inventory.find((item): item is DarkHandItem => isDarkHand(item) && item === `【${object}】`) : undefined;
  const carriedDarkHand = Boolean(carriedDarkHandItem);
  if (approach === "救護" && target !== "陸千帆") return rejected("陸千帆就在肉案旁；眼前沒有其他能由你救治的人。 ");
  if (approach === "借物" && !object) return rejected("要借現場物件，先說清你要碰哪一件。 ");
  if (approach === "借物" && !carriedDarkHand && !["厚砧板", "懸肉鐵鉤", "剁骨刀"].includes(object || ""))
    return rejected("這件物事眼下不能用來佈置肉檔。 ");
  if (approach === "脫身" && target !== "自己" && target !== "陸千帆") return rejected("眼前要帶誰走，須先說清。 ");
  if (object === "剁骨刀" && approach !== "借物" && !(approach === "進擊" && target === "張斷骨"))
    return rejected("剁骨刀還在張斷骨手裡；須先貼身奪刀，不能隔空拿來使。 ");
  if (object === "厚砧板" && approach !== "借物" && !(approach === "防守" && target === "陸千帆"))
    return rejected("砧板重得抬不走；眼下只能費力推歪它作遮掩。 ");
  if (object === "懸肉鐵鉤" && approach !== "借物" && !(approach === "進擊" && target === "張斷骨"))
    return rejected("鐵鉤掛在肉架上；須先靠近扯下，不能隔街揮出。 ");
  state.turn += 1;
  const oldFunds = state.factionFunds;
  const cost = approach === "借物" || approach === "查探" || object === "厚砧板" ? 2 : 1;
  if (state.playerMp >= cost) state.playerMp -= cost;
  else { state.playerHp = Math.max(1, state.playerHp - 2 * (cost - state.playerMp)); state.playerMp = 0; }
  state.sectLifeline = Math.max(0, state.sectLifeline - 1);
  let event = "";
  let npcReply: TurnResult["npcReply"];
  let decisive = false;
  let escaped = false;
  if (approach === "查探") {
    if (!state.worldFlags.includes("已察覺巷口伏兵")) {
      remember(state, "已察覺巷口伏兵");
      event = "你伏近肉案，順著泥印望向巷口。灰線刀手藏在陰處，見你抬頭便把短刀收回袖裡。";
    } else event = "你又看了一眼巷口。灰線刀手仍躲在原處，沒有露出新的破綻。";
  } else if (approach === "借物") {
    if (object === "厚砧板") {
      state.sceneState!.movedObjects["厚砧板"] = "肉案旁傾斜，擋住巷口視線";
      remember(state, "肉案已作遮掩");
      event = "你沉肩推歪厚砧板，木案撞地堵住巷口半邊。張斷骨罵了一聲，暗處刀手被迫換位。";
    } else if (object === "懸肉鐵鉤") {
      state.playerHp = Math.max(1, state.playerHp - 1);
      state.sceneState!.movedObjects["懸肉鐵鉤"] = "從肉架扯落，勾在肉案邊";
      remember(state, "肉檔鐵鉤已移位");
      event = "你扯下肉架鐵鉤，掌心被鏽尖劃破。鐵鉤掛住肉案一角，刀手繞路時得先避開它。";
    } else if (object === "剁骨刀") {
      state.playerHp = Math.max(1, state.playerHp - 4);
      dropMarketObject(state, "剁骨刀", "與張斷骨拉扯後落在肉案下");
      event = "你迎著刀口扯住張斷骨手腕，指背見血。剁骨刀落到肉案下，巷口刀手聽見響動。";
      decisive = true;
    } else if (carriedDarkHand) {
      const item = carriedDarkHandItem!;
      state.inventory.splice(state.inventory.indexOf(item), 1);
      const guaranteed = /全力|拼命|豁出去/.test(plan.method) && state.playerMp > 0;
      if (guaranteed) state.playerMp -= 1;
      const tier = dirtyHandTier(rollD20(state, plan.method), dirtyHandModifier(state), guaranteed);
      if (tier === "failed") {
        state.playerHp = Math.max(1, state.playerHp - 3);
        event = `你${dirtyHandVerb(item)}，巷口刀手偏頭避開，反手劃破你的臂。暗手已用掉，伏擊當即壓上來。`;
      } else {
        remember(state, "暗手逼出伏兵");
        event = `你${dirtyHandVerb(item)}，巷口刀手遮眼現身。暗手已用掉，你搶出半步，伏擊轉成明刀。`;
      }
      decisive = true;
    } else return rejected("這件物事無法在肉檔前這樣使用。 ");
  } else if (approach === "交涉" && target === "陸千帆") {
    changeTrust(state.relationships, "陸千帆", 1);
    remember(state, "陸千帆同意配合");
    event = "你俯身與陸千帆對了兩句，他扶著肉案站穩，答應按你的手勢動身。巷口有人停下腳步。";
    npcReply = { speaker: "陸千帆", line: "你指路，我還走得動。" };
  } else if ((approach === "交涉" || approach === "施壓") && target === "張斷骨"
    && /問|追問|打聽|套話|誰|邊個|伏兵|刀手|眼線/.test(plan.method)
    && !/收錢|交錢|規費|欠款|還錢/.test(plan.method)) {
    remember(state, "張斷骨避談眼線");
    event = "你扣住張斷骨追問巷口的灰衣人。他盯著肉案上的血，不肯說名字，卻把目光朝暗巷斜了一下。";
    npcReply = { speaker: "張斷骨", line: "我沒叫他們來。你自己看巷口。" };
  } else if (approach === "救護" || approach === "防守" && target === "陸千帆") {
    const medicine = approach === "救護" ? treatMarketWound(state) : undefined;
    remember(state, "救下陸千帆");
    changeTrust(state.relationships, "陸千帆", 2);
    state.flags.alleyAllyPresent = true;
    if (approach === "防守" && object === "厚砧板") {
      state.sceneState!.movedObjects["厚砧板"] = "肉案旁傾斜，擋住巷口視線";
      remember(state, "肉案已作遮掩");
    }
    event = approach === "防守" && object === "厚砧板"
      ? "你沉肩推歪厚砧板，擋在陸千帆身前。刀手繞過肉案逼近，張斷骨趁亂吹響呼哨。"
      : medicine && approach === "救護"
      ? `你把${medicine}壓在陸千帆傷處，扶他離開刀口。張斷骨吹響呼哨，巷口刀手當即逼近。`
      : "你橫身護住陸千帆，先替他壓住傷口。張斷骨吹響呼哨，巷口刀手持刀逼近。";
    decisive = true;
  } else if (approach === "脫身") {
    const withAlly = target === "陸千帆";
    if (withAlly) { remember(state, "救下陸千帆"); changeTrust(state.relationships, "陸千帆", 1); }
    else { remember(state, "棄下陸千帆"); changeTrust(state.relationships, "陸千帆", -2); }
    state.flags.alleyAllyPresent = withAlly;
    state.flags.alleyEscape = true;
    state.flags.alleyWall = false;
    state.questStep = "sandbox";
    state.sectLifeline = Math.max(0, state.sectLifeline - 6);
    remember(state, "市集伏擊撤守");
    remember(state, "張斷骨規費未收");
    event = withAlly ? "你架住陸千帆退出肉檔，刀手搶先封住街口。你們跌進死巷，巷尾竹籮還未挪到牆邊。"
      : "你丟下陸千帆獨自退入死巷。刀手封住肉檔街口，巷尾竹籮還沒挪到牆邊。";
    escaped = true;
  } else {
    if (approach === "交涉" && target === "張斷骨") {
      state.factionFunds += 20;
      state.flags.collectedMarketFee = true;
      remember(state, "張斷骨欠費三十文");
      event = "你逼張斷骨當街認下欠帳，他只拿出二十文。你記進公款；他卻向巷口吹了聲哨。";
    } else if (approach === "施壓" && target === "張斷骨") {
      state.factionFunds += 50;
      state.flags.collectedMarketFee = true;
      event = "你扣住張斷骨衣領逼他交足規費，逐文記入公款。他剛鬆手，巷口刀手便亮了刃。";
    } else if (approach === "進擊" && target === "張斷骨") {
      remember(state, "當街襲擊張斷骨");
      state.sectLifeline = Math.max(0, state.sectLifeline - 3);
      if (object === "剁骨刀") {
        state.playerHp = Math.max(1, state.playerHp - 4);
        dropMarketObject(state, "剁骨刀", "與張斷骨拉扯後落在肉案下");
        event = "你搶張斷骨手上的剁骨刀，手背被刀鋒劃開。刀落肉案下，街坊四散，巷口刀手循聲衝出。";
      } else if (object === "懸肉鐵鉤") {
        state.playerHp = Math.max(1, state.playerHp - 1);
        state.sceneState!.movedObjects["懸肉鐵鉤"] = "從肉架扯落，勾在肉案邊";
        event = "你扯下懸肉鐵鉤掃向張斷骨，掌心被鏽尖割開。肉案翻響，巷口刀手循聲衝出。";
      } else event = "你搶步撞向張斷骨，肉案翻響，街坊四散。巷口刀手循聲衝出，短刀直取你的胸口。";
    } else event = target === "刀手" && approach === "交涉"
      ? "你向暗巷喊話，叫灰線刀手露面說清來意。他沒有答話，只持刀衝出，直取你的胸口。"
      : "你在肉檔前攔住去路，張斷骨吹響呼哨。巷口刀手從暗處撲出，短刀直取你的胸口。";
    decisive = true;
  }
  if (!decisive && !escaped && (state.flags.marketIntentHistory || []).length >= 2) {
    decisive = true;
    event += "你還未退開，巷口刀手已等不下去，短刀越過肉案直刺過來。";
  }
  if (decisive) {
    state.flags.marketAmbushTriggered = true;
    state.questStep = "huizhi_ambush";
    const fight = createCombat("market_ambush", !state.worldFlags.includes("棄下陸千帆"));
    fight.preparedDefense = Math.min(5, ["已察覺巷口伏兵", "肉案已作遮掩", "肉檔鐵鉤已移位", "暗手逼出伏兵", "問清刀手兵刃", "認清刀手裝束", "陸千帆同意配合"]
      .filter((flag) => state.worldFlags.includes(flag)).length);
    state.combat = fight;
    if (!state.worldFlags.includes("救下陸千帆")) state.relationships["陸千帆"].wounded = true;
  }
  if (!escaped && !decisive && state.turn >= 8) event += "刀手還在巷口，肉檔前的爭執未了。";
  if (state.factionFunds !== oldFunds) state.flags.treasuryChange = {
    delta: state.factionFunds - oldFunds, reason: "黑泥街當回合規費", turn: state.turn,
  };
  record(state, event);
  return { state, options: availableOptions(state), event: `${event}${marketPressureWarning(state)}`, moneyNote: state.factionFunds !== oldFunds ? "公款已入帳" : "", npcReply };
}

function marketCollectionOptions(state: GameState): string[] {
  const aidComplete = marketWoundTreated(state)
    || (!marketMedicine(state) && state.worldFlags.includes("救下陸千帆"));
  return MARKET_OPTIONS.filter((option) => !aidComplete || !option.startsWith("A."))
    .map((option) => option.startsWith("A.") && !marketMedicine(state)
      ? "A. [救護同門] 撕布壓住陸千帆傷口。"
      : option.startsWith("C.") && state.worldFlags.includes("已察覺巷口伏兵")
        ? "C. [暗查巷口] 沿已知刀手位置再查動靜。" : option);
}

function rawAvailableOptions(state: GameState): string[] {
  if (state.questStep === "chapter_one" && state.flags.chapterOne?.stage === "shortage") {
    if (state.flags.pendingIncident) return availableWithEnergy(state, [
      ...INCIDENT_OPTIONS[state.flags.pendingIncident].filter((_, index) => {
        const destination = incidentDestination(state.flags.pendingIncident!, index);
        return !destination || destination === state.currentLocation;
      }),
      ...LANDMARKS.flatMap((destination) => travelChoices(state, destination).map((route) => route.label)),
    ]);
    if (state.pendingEncounter) return availableWithEnergy(state, encounterOptions(state.pendingEncounter));
  }
  if (state.questStep === "chapter_one" || state.flags.ending) return chapterOneOptions(state);
  if (state.flags.finalCrisis) return ENDING_OPTIONS;
  if (state.combat || state.questStep === "huizhi_ambush") {
    const combat = state.combat || createCombat("market_ambush", !state.worldFlags.includes("出賣陸千帆"));
    const options = combatOptions(combat, state.equippedWeapon || "fists", state.knownMoves || {}, state.playerMp,
      !state.inventory.includes("【牛肉刀】") && !state.inventory.includes("【生鏽鐵刀】") && !state.inventory.includes("【奪來短刀】"),
      state.inventory.includes(STARTING_DARK_HAND) ? STARTING_DARK_HAND : readyDarkHand(state.inventory));
    if (combat.scenario === "market_ambush") {
      const scene = normalizeSceneState(state.sceneState, state.worldFlags);
      const terrain = !scene.movedObjects["懸肉鐵鉤"] && !scene.depletedSources.includes("懸肉鐵鉤")
        ? "C. [扯鐵鉤] 扯下肉架鐵鉤撥開刀勢；須貼近刀口，掌心易被鏽尖劃破。"
        : !scene.movedObjects["厚砧板"] && !scene.depletedSources.includes("厚砧板")
          ? "C. [推砧板] 費力推歪肉案厚砧板擋刀；身位慢半拍，側腹仍露給對手。"
          : "C. [撞肉案] 蹬住肉案斜身撞去；只能搶半步，仍要防反手刀。";
      return availableWithEnergy(state, options.map((option) => option.startsWith("C.") ? terrain : option));
    }
    return availableWithEnergy(state, options);
  }
  if (state.flags.alleyEscape || state.flags.alleyWall) return alleyOptions(state);
  if (state.flags.marketAftermath) return marketAftermathOptions(state);
  if (state.pendingEncounter) return availableWithEnergy(state, encounterOptions(state.pendingEncounter));
  const base = state.questStep === "prologue_briefing" ? PROLOGUE_OPTIONS
    : state.questStep === "kuyan_medicine" ? GU_OPTIONS
    : state.questStep === "yung_tea_stall" ? TEA_OPTIONS
    : state.questStep === "market_collection" ? marketCollectionOptions(state)
    : state.flags.pendingIncident ? [
      ...INCIDENT_OPTIONS[state.flags.pendingIncident].filter((_, index) => {
        const destination = incidentDestination(state.flags.pendingIncident!, index);
        return !destination || destination === state.currentLocation;
      }),
      ...LANDMARKS.flatMap((destination) => travelChoices(state, destination).map((route) => route.label)),
    ]
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
      ? SANDBOX_OPTIONS["黑泥街"].filter((option) => !option.includes("[找陸千帆]")
        || socialTargets(state).includes("陸千帆")).map((option) => {
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
  if (state.questStep !== "sandbox" || state.flags.pendingIncident || state.pendingEncounter) return availableWithEnergy(state, base);
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
    sideWork.push("J. [執行暗殺令] 伏擊刀手頭目；至少兩層進擊招數及八點氣血較有把握；成功仍傷六點氣血、命脈減六。");
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
  if (state.currentLocation === "黑泥街" && socialTargets(state).includes("陸千帆")
    && state.relationships["陸千帆"].trust >= 2
    && !state.relationships["陸千帆"].wounded && !state.relationships["陸千帆"].estranged
    && !state.worldFlags.includes("熟記市集暗巷"))
    sideWork.push("M. [請陸千帆指路] 請他帶你認清黑泥街後巷，發現往總壇的暗道。");
  if (state.currentLocation === "苦煙館" && state.relationships["陸千帆"].wounded
    && !state.relationships["陸千帆"].estranged)
    sideWork.push("M. [為陸千帆求藥] 自掏十文私銀請顧忘生療傷；傷勢穩定後可再同行。");
  if (state.currentLocation === "青鋒堂總壇" && state.flags.checkpointReady && !state.flags.midpointBriefed)
    sideWork.push("O. [向堂主交代] 整理首輪三件城西急事，留下後半程的中期存檔。");
  if (state.currentLocation === "青鋒堂總壇" || state.currentLocation === "裂石擂")
    sideWork.push(...darkHandPurchaseOptions(state));
  const scavenge = SCAVENGE_SOURCES[state.currentLocation as keyof typeof SCAVENGE_SOURCES];
  if (scavenge && state.inventory.length < state.maxInventory && darkHandCount(state.inventory) < DARK_HAND_LIMIT
    && !state.sceneState?.depletedSources.includes(scavenge.key)) sideWork.push(scavenge.label);
  if (state.currentLocation === "鬼骰坊" && !state.sceneState?.openedEntrances.includes("鬼骰坊")
    && (state.worldFlags.includes("帳目有據") || state.worldFlags.includes("假借據完成")
      || state.inventory.includes("【開鎖鐵線】")))
    sideWork.push("T. [查賬房雜物] 趁打手換位，進賬房搬開雜物；耗一回合，可能驚動守衛。");
  if (state.currentLocation === "夜雨樓" && !state.sceneState?.openedEntrances.includes("夜雨樓")
    && (state.worldFlags.includes("城主府密報完成") || state.worldFlags.includes("陌生恩客完成")))
    sideWork.push("T. [查酒窖巨桶] 避開護院進酒窖，查最深處的舊桶；耗一回合。");
  if (state.currentLocation === "晚秋茶寮" && state.sceneState?.discoveredEntrances.includes("晚秋茶寮")
    && !state.sceneState.openedEntrances.includes("晚秋茶寮"))
    sideWork.push("T. [移開灶底石板] 趁容晚秋招呼茶客，掀開土灶石板；耗一回合，可能走漏風聲。");
  if (state.currentLocation === "苦煙館" && !state.sceneState?.medicineUsed) {
    if (!state.sceneState?.medicineIdentified)
      sideWork.push(state.background === "黑市醫道學徒"
        ? "T. [辨無名藥粉] 隔櫃認封口藥味；可辨藥性，仍不能擅取瓷瓶。"
        : "T. [辨無名藥粉] 請顧忘生辨清櫃後瓷瓶；須先取得她信任，不能隔櫃取藥。");
    if (!state.sceneState?.medicineIdentified)
      sideWork.push("U. [盲用藥粉] 冒險從櫃後取無標瓷瓶；藥性未知，可能反傷自身。");
  }
  return availableWithEnergy(state, [...base, ...missionOptions(state), ...training, ...sideWork,
    ...(canUsePackedMedicine(state) ? [USE_PACKED_MEDICINE] : []),
    ...(canUseHemostaticPowder(state) ? [USE_HEMOSTATIC_POWDER] : []),
    ...(state.playerHp < state.maxHp && state.inventory.includes("【止血膏藥】")
      ? ["W. [自敷止血膏藥] 用一回合將隨身膏藥敷在自己的傷口。"] : []),
    ...(state.playerHp < state.maxHp && state.inventory.includes("【金創散】")
      ? ["X. [自敷金創散] 用一回合將隨身金創散敷在自己的傷口。"] : [])]);
}

export function availableOptions(state: GameState): string[] {
  return rawAvailableOptions(state).map(conciseOption);
}
