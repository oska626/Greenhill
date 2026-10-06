import { renameLegacyWorldNames, repeatedNpcLine } from "./npc-voices.ts";

export const LANDMARKS = [
  "青鋒堂總壇", "晚秋茶寮", "黑泥街", "鬼骰坊", "裂石擂", "苦煙館", "夜雨樓",
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
  "A. [即刻領命] 不再耽擱，帶藥趕往晚秋茶寮；何不歸得以留下固防。",
  "B. [索取盤纏] 向何不歸領十文路費；私銀增加，堂口公款減少。",
  "C. [問清敵情] 問出玄武樓刀手的兵刃與路線，再帶藥上路。",
  "D. [驗清草藥] 仔細驗藥，免得傷藥有誤，再帶藥上路。",
  "E. [記住暗巷] 先認清往市集的退路，再帶藥上路。",
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
const AMBUSH_OPTIONS = [
  "A. [正面護人] 替陸千帆擋刀；少耗氣力，難免多受傷。",
  "B. [掀案阻敵] 掀翻肉案擋住刀手；傷勢與氣力各有耗損。",
  "C. [背靠背守] 與陸千帆結陣；多耗氣力，少受刀傷。",
  "D. [登簷引敵] 踩柱登簷引開刀手；耗力最重，傷勢最輕。",
  "E. [側翼擊敵] 擊向刀手下盤；冒險受傷，留下擊退敵人的名聲。",
];
const SOLO_AMBUSH_OPTIONS = [
  "A. [正面迎敵] 獨自擋刀；少耗氣力，難免多受傷。",
  "B. [掀案阻敵] 掀翻肉案，趁亂突圍。",
  "C. [守住牆角] 倚牆尋隙；多耗氣力，少受刀傷。",
  "D. [登簷引敵] 踩柱登簷；耗力最重，傷勢最輕。",
  "E. [側翼擊敵] 擊向刀手下盤；冒險受傷，留下擊退敵人的名聲。",
];
const SOLO_AMBUSH_FLAVOR = ["你獨自正面擋刀。", "你獨自掀翻肉案擋敵。", "你靠牆守住巷口。", "你踩柱登簷尋隙。", "你低身擊向刀手下盤。"];

const TUTORIAL_FLAVOR: Record<Exclude<QuestStep, "sandbox">, string[]> = {
  prologue_briefing: ["你接過藥包，立即動身。", "你向何不歸討路費，才接過藥包。", "你問清刀手路線，記住他們慣用的兵刃。", "你拆開藥包，驗過草藥才領命。", "你認清通往市集的暗巷，再帶藥離開。"],
  yung_tea_stall: ["你請容晚秋先配傷藥，趕在刀手前動身。", "你問清刀手裝束，請容晚秋換藥。", "你飲過熱茶，調勻氣息才換藥。", "你跟容晚秋認清藥封，再收下金創散。", "你託容晚秋向堂口傳信，換藥後趕往市集。"],
  market_collection: ["你先救陸千帆，再逼張斷骨交錢。", "你先向張斷骨索錢，讓陸千帆帶傷等候。", "你先查巷口刀手，回頭救人時已收不齊規費。", "你先救人，允張斷骨緩交餘款。", "你護陸千帆離開肉檔，暫且放下規費。"],
  huizhi_ambush: ["你護住陸千帆，正面擋刀。", "你掀翻肉案擋住刀手。", "你與陸千帆背靠背結陣。", "你踩柱登簷，尋隙突圍。", "你低身擊向刀手下盤。"],
};

const SANDBOX_OPTIONS: Record<Landmark, string[]> = {
  "青鋒堂總壇": ["A. [休整] 靜坐調息，回復氣血與內力。", "B. [固防] 撥二十文公款修補堂口防線。", "C. [盤點] 清點堂口帳目。", "D. [問何不歸] 問何不歸近日玄武樓動靜。", "E. [巡視] 巡視總壇守備。"],
  "晚秋茶寮": ["A. [買藥] 花十文私銀買金創散並敷藥。", "B. [打探] 問容晚秋城西傳聞。", "C. [喝茶] 喝茶歇腳。", "D. [辨藥] 請容晚秋辨認草藥。", "E. [看街] 留意茶檔外動靜。"],
  "黑泥街": ["A. [巡街收規] 催收十文規費，記入公款。", "B. [問價] 打聽市集藥價。", "C. [找陸千帆] 問陸千帆傷勢。", "D. [盯梢] 留意玄武樓眼線。", "E. [歇腳] 在肉檔旁歇腳，回復少許內力。"],
  "鬼骰坊": ["A. [押小] 押十文私銀賭一局。", "B. [看盤] 觀察骰盤，尋找莊家的破綻。", "C. [問祁觀衡] 問祁觀衡堂口欠帳。", "D. [查老千] 查出藏籌碼的賭客，替堂口追回銀錢。", "E. [核暗帳] 核對賭坊暗帳，替堂口追回錯漏。"],
  "裂石擂": ["A. [打黑拳] 挨一場黑拳，賺二十文私銀。", "B. [練拳] 向衛沉岳請教拳腳。", "C. [觀擂] 觀察擂台對手。", "D. [問霍破陣] 問霍破陣拳館近況。", "E. [歇息] 在拳館歇腳。"],
  "苦煙館": ["A. [問藥] 打聽止血藥價。", "B. [看人] 觀察館內客人。", "C. [問顧忘生] 問顧忘生黑市傳聞。", "D. [拒藥] 拒絕來路不明的丹藥。", "E. [調製敷藥] 耗費內力調藥，替自己止傷。"],
  "夜雨樓": ["A. [問柳照霜] 問柳照霜城西消息。", "B. [聽曲] 聽一曲，稍作調息。", "C. [查客] 留意陌生客人。", "D. [問路] 問清附近暗巷。", "E. [斷開跟梢] 費些氣力甩開盯梢的人。"],
};

const INCIDENTS: Incident[] = ["market_raid", "missing_ledger", "tainted_medicine"];
const INCIDENT_OPTIONS: Record<Incident, string[]> = {
  market_raid: [
    "A. [護住攤販] 召集街坊，擋住玄武樓插旗。",
    "B. [暗巷截路] 繞到刀手後方，斷其退路。",
    "C. [設局取證] 記下刀手勒索攤販的證詞。",
    "D. [付錢息事] 撥二十文公款安頓攤販。",
    "E. [撤守保人] 先護傷者撤到青鋒堂。",
  ],
  missing_ledger: [
    "A. [查賭檔] 到鬼骰坊核對缺失的規費帳。",
    "B. [問容晚秋] 問容晚秋誰曾帶走帳簿。",
    "C. [追腳印] 沿市集泥印追查偷帳的人。",
    "D. [補帳] 撥十文公款填補眼前缺口。",
    "E. [告知何不歸] 把帳目破綻交給何不歸處置。",
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
  tainted_medicine: "你見茶檔送來的傷藥封口被換過，已有傷者用了藥。城西七處據點都等你拿主意。",
};

type Reaction = { event: string; line: string; speaker?: string };
const SANDBOX_REACTIONS: Record<Landmark, Record<string, Reaction>> = {
  "青鋒堂總壇": {
    "休整": { event: "", line: "坐吧。這扇門我還守得住；等你喘勻了，再替我走一趟。" },
    "固防": { event: "", line: "補牆要用公款，少一文都是別人的飯錢。先把帳記清。" },
    "盤點": { event: "你翻開堂口帳簿，逐筆核對公款，沒有漏下一文。", line: "你看得清這本帳，我便能騰出手守門。別讓我白忙。" },
    "問何不歸": { event: "你問何不歸玄武樓近況，聽見城西幾處路口都添了眼線。", line: "路口又添了眼線。我能替你擋人，卻替你找不出路。" },
    "巡視": { event: "你巡過總壇門口與後巷，記住兩處鬆動的門閂。", line: "門閂鬆了便換。今晚我守前門，後巷交給你。" },
  },
  "晚秋茶寮": {
    "買藥": { event: "", line: "錢放在桌上。藥敷厚些，黑泥街的水不認傷口。" },
    "打探": { event: "你問容晚秋城西傳聞，聽見玄武樓又在街口認人。", line: "茶還沒涼，街口已有人在認你的臉。從後巷走。" },
    "喝茶": { event: "你端起苦茶，熱氣壓住喉頭的乾澀。", line: "慢點喝，燙。喝完從側巷走。" },
    "辨藥": { event: "你攤開藥包，請容晚秋辨過草藥氣味與碎屑。", line: "這味能止血。你先聞清楚，下回拿到另一包也認得出來。" },
    "看街": { event: "你從茶檔望向街口，記下兩條能退回市集的窄巷，也察覺對面有人盯著你。", line: "碗端高些。對面那人看了你半日，卻一口茶也沒買。" },
  },
  "黑泥街": {
    "巡街收規": { event: "", line: "錢由你收。若有人從後面跟來，我會先讓你知道。" },
    "問價": { event: "你問過兩家藥攤，聽見同一味傷藥報出兩個價。", line: "你一著急，藥價便由人開。先看清兩家的秤。" },
    "找陸千帆": { event: "你問陸千帆肋下刀傷。你見他按住舊布條，呼吸仍穩，刀口卻未合。", line: "小傷，走得動。你先看巷口，別讓人抄後路。" },
    "盯梢": { event: "你退到肉檔陰影，盯住巷口來往的灰衣人。", line: "那兩個人走得太齊。我往左，你替我看右邊。", speaker: "陸千帆" },
    "歇腳": { event: "你靠著肉檔外牆歇腳，耳朵仍朝巷口張著。", line: "若要歇，離肉案遠些。你擋著門，我今日便少一筆生意。", speaker: "張斷骨" },
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
    "打黑拳": { event: "", line: "錢在那裏。傷口先按住，別讓血滴到擂台外。" },
    "練拳": { event: "你照衛沉岳指點收緊肘線，連打三記短拳。", line: "肘收回來。你的肋下，比拳先到了他面前。" },
    "觀擂": { event: "你看完一場擂台，記下對手換步時露出的空門。", line: "左肋有空門。看見不算，打得到才算。" },
    "問霍破陣": { event: "你問霍破陣拳館近況，聽見近來上擂的人多，能走下來的少。", line: "今早抬走一個。誰下的手？我正找他。", speaker: "霍破陣" },
    "歇息": { event: "你在武館角落歇息，聽見擂台上拳肉相撞。", line: "歇夠，起身。" },
  },
  "苦煙館": {
    "問藥": { event: "你問止血藥價，先看清封口，再掂藥包分量。", line: "價寫在紙上。先看封口，再看你身上的傷值不值這包藥。" },
    "看人": { event: "你掃過館內客人，見有人只看藥，不肯露手。", line: "手藏著的人，未必是怕冷。" },
    "問顧忘生": { event: "你問顧忘生黑市傳聞，聽見近來有人暗收傷藥。", line: "有人在暗收傷藥。傷的人一多，價便由他們說了算。" },
    "拒藥": { event: "你推開來歷不明的丹藥，沒有讓藥粉沾手。", line: "你不碰是對的。這包藥，連我都不願打開。" },
    "調製敷藥": { event: "你照顧忘生指點磨開藥末，敷在自己的傷處。", line: "藥先敷薄些。若還滲血，再添第二層。" },
  },
  "夜雨樓": {
    "問柳照霜": { event: "你問柳照霜城西消息，聽見有人在樓裏打聽青鋒堂，連茶都沒碰。", line: "那客人問青鋒堂，卻連茶都沒碰。你猜他等誰？" },
    "聽曲": { event: "你聽完一曲，指尖仍按著錢袋。", line: "曲已聽完，你的手卻始終壓著錢袋。你是在等人，還是在防人？" },
    "查客": { event: "你留意席間陌生客，記下兩人同時望向門口，腳尖卻朝後巷。", line: "兩個人都看門，腳尖卻朝後巷。" },
    "問路": { event: "你問清附近暗巷的出口，記住轉角那道窄門。", line: "側門可以借你走。只是身後那條尾巴，別帶進夜雨樓。" },
    "斷開跟梢": { event: "你借夜雨樓的側門甩開身後尾巴，繞回城西街面。", line: "側門借你走。下一次，別把人帶到我樓前。" },
  },
};

const SANDBOX_CLUES: Record<string, string> = {
  "青鋒堂總壇:盤點": "帳目有據", "青鋒堂總壇:問何不歸": "街面有備", "青鋒堂總壇:巡視": "街面有備",
  "晚秋茶寮:打探": "街面有備", "晚秋茶寮:辨藥": "傷藥有據", "晚秋茶寮:看街": "街面有備",
  "黑泥街:問價": "傷藥有據", "黑泥街:找陸千帆": "街面有備", "黑泥街:盯梢": "街面有備", "黑泥街:查眼線": "街面有備",
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
  if (/醫|毒|藥|術|病/.test(text)) return { hp: 80 + variation, mp: 75 - variation };
  if (/扒|偷|摸鎖|開鎖|身法|靈巧|眼快|輕功/.test(text)) return { hp: 90 + variation, mp: 60 - variation };
  if (/刀|劍|棍|武|拳|皮厚|命硬|神力|壯/.test(text)) return { hp: 125 + variation, mp: 30 - variation };
  return { hp: 100 + variation, mp: 50 - variation };
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

const OPENING_WORLD_BRIEFING = "你剛進堂口，我本不該把這些事交給你。陸千帆那道傷，是玄武樓的人砍的；他們要的，是黑泥街。城南金冊莊早已盯上我們的地契，只等這條街失守。刀傷還有藥可治。若連落腳之地也沒了，我拿甚麼留住這些人？";
const OPENING_ERRAND = "先到晚秋茶寮換藥，救回陸千帆。張斷骨那五十文，回來時也別忘了。";

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

export function normalizeState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<GameState>;
  if (typeof value.playerName !== "string" || typeof value.background !== "string" || typeof value.trait !== "string") return null;
  const background = value.background === "爛賭收數佬" ? "賭坊收帳人"
    : value.background === "濕鳩武館棄徒" ? "落魄武館棄徒" : value.background;
  const steps: QuestStep[] = ["prologue_briefing", "yung_tea_stall", "market_collection", "huizhi_ambush", "sandbox"];
  if (!steps.includes(value.questStep as QuestStep)) return null;
  const stats = aptitude(value.playerName, background, value.trait);
  const maxHp = finite(value.maxHp, stats.hp, 1, 170);
  const maxMp = finite(value.maxMp, stats.mp, 1, 170);
  const flags = value.flags || { tookHerbs: false, visitedYung: false, collectedMarketFee: false, marketAmbushTriggered: false };
  const pendingIncident = INCIDENTS.includes(flags.pendingIncident as Incident) ? flags.pendingIncident as Incident : undefined;
  return {
    turn: finite(value.turn, 1, 1, 100000),
    playerName: value.playerName.slice(0, 30), background: background.slice(0, 60), trait: value.trait.slice(0, 60),
    gender: typeof value.gender === "string" ? value.gender.replace(/[\r\n「」]/g, "").trim().slice(0, 8) : undefined,
    skill: typeof value.skill === "string" ? value.skill.replace(/[\r\n「」]/g, "").trim().slice(0, 12) : undefined,
    personality: typeof value.personality === "string" ? value.personality.replace(/[\r\n「」]/g, "").trim().slice(0, 12) : undefined,
    currentLocation: typeof value.currentLocation === "string" && LANDMARKS.includes(renameLegacyWorldNames(value.currentLocation) as Landmark)
      ? renameLegacyWorldNames(value.currentLocation) as Landmark : "青鋒堂總壇",
    inventory: Array.isArray(value.inventory) ? value.inventory.filter((item): item is string => typeof item === "string").slice(0, 4).map((item) => item.slice(0, 30)) : [],
    maxInventory: 4,
    playerHp: finite(value.playerHp, maxHp, 0, maxHp), maxHp,
    playerMp: finite(value.playerMp, maxMp, 0, maxMp), maxMp,
    silver: finite(value.silver, 0, 0, Number.MAX_SAFE_INTEGER - 1000), factionFunds: finite(value.factionFunds, 10, 0, Number.MAX_SAFE_INTEGER - 1000),
    hozaiDefense: finite(value.hozaiDefense, 60, 0, 100),
    worldFlags: Array.isArray(value.worldFlags) ? value.worldFlags.filter((flag): flag is string => typeof flag === "string").slice(0, 30).map((flag) => renameLegacyWorldNames(flag).slice(0, 20)) : [],
    questStep: value.questStep as QuestStep,
    flags: {
      tookHerbs: flags.tookHerbs === true, visitedYung: flags.visitedYung === true,
      collectedMarketFee: flags.collectedMarketFee === true, marketAmbushTriggered: flags.marketAmbushTriggered === true,
      lastMarketDuesTurn: finite(flags.lastMarketDuesTurn, 0, 0, 100000),
      pendingIncident,
      incidentCount: finite(flags.incidentCount, 0, 0, 100000),
      lastIncidentTurn: finite(flags.lastIncidentTurn, 0, 0, 100000),
      lastSandboxTag: typeof flags.lastSandboxTag === "string" ? renameLegacyWorldNames(flags.lastSandboxTag).slice(0, 40) : undefined,
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
    if (index === 0) { state.playerHp = Math.max(0, state.playerHp - 6); state.hozaiDefense = Math.min(100, state.hozaiDefense + 8); event = "你擋在攤販前挨了一刀，氣血減六；街坊守住肉檔，何不歸防線升八。"; }
    if (index === 1) { state.playerMp = Math.max(0, state.playerMp - 5); state.hozaiDefense = Math.min(100, state.hozaiDefense + 6); event = "你從暗巷截住刀手退路，內力減五；對方拔旗撤走，何不歸防線升六。"; }
    if (index === 2) { state.hozaiDefense = Math.min(100, state.hozaiDefense + 4); event = "你記下三名攤販的證詞，逼刀手收旗，何不歸防線升四。"; }
    if (index === 3) { if (state.factionFunds >= 20) { state.factionFunds -= 20; state.hozaiDefense = Math.min(100, state.hozaiDefense + 3); event = "你撥二十文公款安頓攤販，刀手暫退，何不歸防線升三。"; } else event = "公款不足二十文，你只能護攤販退入窄巷，刀手仍在肉檔。"; }
    if (index === 4) { state.hozaiDefense = Math.max(0, state.hozaiDefense - 8); event = "你先護傷者撤走，肉檔失去半日生意，刀手把旗插在路口；何不歸防線減八。"; }
    if (index < 4 && state.worldFlags.includes("街面有備")) {
      state.hozaiDefense = Math.min(100, state.hozaiDefense + 2);
      event += "先前記下的街面異動讓眾人及早應對，何不歸防線再升二。";
    }
    if (index < 4 && state.worldFlags.includes("擊退伏擊刀手")) {
      state.hozaiDefense = Math.min(100, state.hozaiDefense + 2);
      event += "刀手認出你曾在肉檔擊退同夥，攻勢一滯，何不歸防線再升二。";
    }
    if (index <= 1 && state.worldFlags.includes("裂石擂練拳")) {
      const restored = Math.min(2, state.maxHp - state.playerHp);
      state.playerHp += restored;
      event += `你憑練過的拳路卸去一部分刀勢，氣血回復${restored}。`;
    }
    remember(state, index === 4 ? "市集暫失" : "市集守住");
    reply = { speaker: "陸千帆", line: index === 4 ? "人先撤了。我記著那面旗，遲早拔回來。" : "肉檔先守住了。我去看巷口，你別再替我挨刀。" };
  } else if (incident === "missing_ledger") {
    if (index === 0) { state.currentLocation = "鬼骰坊"; state.hozaiDefense = Math.min(100, state.hozaiDefense + 3); event = "你到鬼骰坊對帳，查出缺頁記著一筆假規費。祁觀衡鎖好原本，何不歸防線升三。"; }
    if (index === 1) { state.currentLocation = "晚秋茶寮"; state.hozaiDefense = Math.min(100, state.hozaiDefense + 2); event = "你問容晚秋，得知灰衣客昨夜從總壇帶走帳頁；何不歸防線升二。"; }
    if (index === 2) { state.currentLocation = "黑泥街"; state.playerMp = Math.max(0, state.playerMp - 4); state.hozaiDefense = Math.min(100, state.hozaiDefense + 4); event = "你沿泥印追到市集後巷，找回濕透的帳頁；內力減四，何不歸防線升四。"; }
    if (index === 3) { if (state.factionFunds >= 10) { state.factionFunds -= 10; state.hozaiDefense = Math.min(100, state.hozaiDefense + 1); event = "你撥十文公款補帳，暫且穩住人心，何不歸防線升一；缺的那頁仍得追查。"; } else event = "公款不足十文，缺帳未補，你把破綻先記在紙上。"; }
    if (index === 4) { state.hozaiDefense = Math.min(100, state.hozaiDefense + 1); event = "你把缺頁之事告知何不歸；他封住帳櫃，派人逐筆重查，何不歸防線升一。"; }
    if (index <= 2 && state.worldFlags.includes("帳目有據")) {
      state.factionFunds += 10;
      event += "你憑先前留下的帳目對出被藏的十文規費，追回公款。";
    }
    remember(state, "規費帳失頁已查");
    reply = index === 0
      ? { speaker: "祁觀衡", line: "假規費寫得真工整。可惜少算了一筆。" }
      : index === 1
        ? { speaker: "容晚秋", line: "灰衣客沒喝茶，手倒一直按著袖口。" }
        : { speaker: "何不歸", line: index === 3 ? "十文我記下了。缺的那頁，還得替我找。" : "帳先收好。你查到哪一步，我替你擋到哪一步。" };
  } else {
    if (index === 0) { state.hozaiDefense = Math.min(100, state.hozaiDefense + 2); event = "你封存可疑藥包，茶檔暫停出藥，傷者改用乾淨布條止血；何不歸防線升二。"; }
    if (index === 1) { state.currentLocation = "苦煙館"; state.hozaiDefense = Math.min(100, state.hozaiDefense + 3); event = "你把藥帶到苦煙館，顧忘生驗出封口混了苦麻粉；何不歸防線升三。"; }
    if (index === 2) { state.currentLocation = "晚秋茶寮"; state.hozaiDefense = Math.min(100, state.hozaiDefense + 2); event = "你追問送藥腳夫，查到他替灰衣客轉過手；何不歸防線升二。"; }
    if (index === 3) { if (state.silver >= 10) { state.silver -= 10; state.playerHp = Math.min(state.maxHp, state.playerHp + 5); event = "你花十文私銀買乾淨傷藥救人，餘藥敷在自己傷口，氣血回復五。"; } else event = "你拿不出十文私銀，便用乾淨布條替傷者止血。"; }
    if (index === 4) { state.hozaiDefense = Math.min(100, state.hozaiDefense + 4); event = "你派人告知城西七處據點停用這批藥，逐一收回藥包；何不歸防線升四。"; }
    if (index !== 3 && state.worldFlags.includes("傷藥有據")) {
      state.hozaiDefense = Math.min(100, state.hozaiDefense + 2);
      event += "先前認清的藥封讓眾人及早分出可疑傷藥，何不歸防線再升二。";
    }
    if (index !== 3 && state.worldFlags.includes("辨清傷藥封口")) {
      state.hozaiDefense = Math.min(100, state.hozaiDefense + 2);
      event += "容晚秋教過你的繩結仍記得清楚，你當場挑出換過封口的藥，何不歸防線再升二。";
    }
    remember(state, "可疑傷藥已處置");
    reply = index === 1
      ? { speaker: "顧忘生", line: "苦麻粉。藥還沒入口，人先被它放倒。" }
      : { speaker: "容晚秋", line: "封口換過。往後收藥，先讓我看繩結。" };
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
    state.currentLocation = "青鋒堂總壇";
    if (opening) {
      const stats = aptitude(state.playerName, state.background, state.trait);
      state.maxHp = stats.hp; state.playerHp = stats.hp;
      state.maxMp = stats.mp; state.playerMp = stats.mp;
      const cleanName = state.playerName.replace(/[「」\r\n]/g, "").trim();
      const address = cleanName && Array.from(cleanName).length <= 8 ? cleanName : "小子";
      const customProfile = state.background === "自定義市井流民" && Boolean(state.gender && state.skill && state.personality);
      event = customProfile
        ? "你踩過城西泥巷，進了青鋒堂。雨水沿著衣角滴下；何不歸把藥包推到你面前。"
        : `你踩過城西泥巷，進了青鋒堂。${openingPortrait(state.background, state.trait)}堂外有人為規費爭吵；何不歸沒有抬頭，只把藥包推到你面前。`;
      npcReply = {
        speaker: "何不歸",
        line: customProfile
          ? customOpeningAssessment(state, address)
          : `${address}，${openingAssessment(state.background, state.trait)}。${OPENING_WORLD_BRIEFING}${OPENING_ERRAND}`,
      };
    } else {
      event += flavor("prologue_briefing");
      if (choice === 0) {
        state.hozaiDefense = Math.min(100, state.hozaiDefense + 4);
        event += "何不歸得以留下補強守備，防線升四。";
      } else if (choice === 1) {
        if (state.factionFunds >= 10) {
          state.factionFunds -= 10; state.silver += 10;
          event += "他從公款撥十文給你作路費；公款減少十文，私銀增加十文。";
        } else event += "堂口已拿不出十文路費，你只得空手上路。";
      } else if (choice === 2) { remember(state, "問清刀手兵刃"); event += "你記住刀手慣用的短刀，往後交手便有了防備。"; }
      else if (choice === 3) { remember(state, "驗過堂口草藥"); event += "草藥沒有受潮，葉脈也不見異色。"; }
      else if (choice === 4) { remember(state, "熟記市集暗巷"); event += "你把退往巷口的路記在心裏。"; }
      state.questStep = "yung_tea_stall";
      state.currentLocation = "晚秋茶寮";
      if (!state.inventory.includes("【生草藥包】")) state.inventory.push("【生草藥包】");
      state.flags.tookHerbs = true;
      event += "你帶著生草藥到晚秋茶寮，向容晚秋出示藥包。你聽容晚秋警告，玄武樓刀手在市集附近出沒。";
    }
  } else if (state.questStep === "yung_tea_stall") {
    event += flavor("yung_tea_stall");
    if (choice === 0) { remember(state, "趕在刀手前到市集"); event += "你沒等茶涼，便先一步趕到市集。"; }
    else if (choice === 1) { remember(state, "認清刀手裝束"); event += "容晚秋說刀手袖口繫著灰線，你把這個記號記下。"; }
    else if (choice === 2) { remember(state, "茶寮調息"); event += "熱茶壓下疲乏，你把氣息調勻。"; }
    else if (choice === 3) { remember(state, "辨清傷藥封口"); event += "容晚秋教你認清封口的繩結與藥味。"; }
    else if (choice === 4) { remember(state, "茶寮傳信接應"); event += "容晚秋派人通知堂口，說市集恐有埋伏。"; }
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
    const betrayed = customAction(action) && /背叛|出賣陸千帆|不救陸千帆/.test(action);
    const maimed = customAction(action) && /打斷張斷骨|致殘張斷骨|廢了張斷骨/.test(action);
    if (betrayed) {
      remember(state, "出賣陸千帆");
      state.hozaiDefense = Math.max(0, state.hozaiDefense - 15);
      event += "你扣下金創散，任陸千帆帶傷獨自留在肉檔。";
    } else {
      const medicine = state.inventory.indexOf("【金創散】");
      if (medicine >= 0) state.inventory.splice(medicine, 1);
      remember(state, "救下陸千帆");
    }
    if (maimed) {
      remember(state, "打斷張斷骨右手");
      event += "你打斷張斷骨右手，肉檔眾人看在眼裡。";
    }
    state.flags.marketAmbushTriggered = true;
    if (customAction(action) && /私吞|昧起|袋起|自己收/.test(action)) {
      state.silver += 50;
      state.flags.collectedMarketFee = true;
      remember(state, "私吞五十文規費");
      state.hozaiDefense = Math.max(0, state.hozaiDefense - 10);
      event += `${betrayed ? "你逼" : "你交藥救人，又逼"}得張斷骨交出五十文，卻私吞入袋。你聽張斷骨吹響呼哨，玄武樓刀手隨即伏擊。`;
    } else {
      const fee = choice === 2 ? 30 : choice === 3 ? 20 : choice === 4 ? 0 : 50;
      state.factionFunds += fee;
      state.flags.collectedMarketFee = fee > 0;
      if (choice === 0) {
        remember(state, "先救陸千帆");
        state.hozaiDefense = Math.min(100, state.hozaiDefense + 3);
        event += "你替陸千帆敷上金創散，他扶著肉案重新站穩。張斷骨見你們不退，才交足五十文；你記入公款，同門也肯留下守街，何不歸防線升三。";
      } else if (choice === 1) {
        remember(state, "陸千帆傷勢加重");
        state.hozaiDefense = Math.max(0, state.hozaiDefense - 3);
        event += "你扣住藥包，先逼張斷骨交出五十文，逐文記入公款。等你回頭，陸千帆的衣襟已被血浸透；藥終究敷上了，何不歸防線卻減三。";
      } else if (choice === 2) {
        remember(state, "已察覺巷口伏兵");
        remember(state, "張斷骨欠費二十文");
        state.playerMp = Math.max(0, state.playerMp - 3);
        event += "你先轉入巷口，認出刀手袖上那道灰線。回頭替陸千帆敷藥時，張斷骨只肯交三十文；你記入公款，餘下二十文留待追討，查探耗去三點內力。";
      } else if (choice === 3) {
        remember(state, "張斷骨欠費三十文");
        event += "你先替陸千帆敷藥，張斷骨才從錢袋裏數出二十文。餘下三十文，他寫下欠條；你將現錢記入公款，把那張紙收進袖中。";
      } else if (choice === 4) {
        remember(state, "張斷骨規費未收");
        state.hozaiDefense = Math.max(0, state.hozaiDefense - 6);
        event += "你把藥敷在陸千帆傷處，扶他離開肉檔。五十文一文未收；街坊望著守街的人先退，何不歸防線減六。";
      } else {
        event += `${betrayed ? "你逼" : "你交藥救人，又逼"}得張斷骨交出五十文規費，當場記入青鋒堂公款。`;
      }
      event += choice === 4
        ? "你們退到巷口，玄武樓刀手已封住去路。"
        : "張斷骨吹響呼哨，玄武樓刀手隨即伏擊。";
    }
  } else if (state.questStep === "huizhi_ambush") {
    event += state.worldFlags.includes("出賣陸千帆") && choice >= 0 ? SOLO_AMBUSH_FLAVOR[choice] : flavor("huizhi_ambush");
    state.questStep = "sandbox";
    state.currentLocation = "黑泥街";
    const tactic = choice >= 0 ? choice : 0;
    const hpBefore = state.playerHp;
    const mpBefore = state.playerMp;
    let hpCost = [12, 8, 7, 4, 10][tactic];
    let mpCost = [2, 5, 7, 11, 4][tactic];
    if (state.worldFlags.includes("出賣陸千帆")) hpCost += 3;
    if (state.worldFlags.includes("陸千帆傷勢加重")) hpCost += 3;
    if (state.worldFlags.includes("問清刀手兵刃")) hpCost -= 2;
    if (state.worldFlags.includes("驗過堂口草藥") && !state.worldFlags.includes("出賣陸千帆")) hpCost -= 2;
    if (state.worldFlags.includes("趕在刀手前到市集")) hpCost -= 2;
    if (state.worldFlags.includes("認清刀手裝束")) hpCost -= 2;
    if (state.worldFlags.includes("已察覺巷口伏兵")) hpCost -= 3;
    if (state.worldFlags.includes("熟記市集暗巷")) mpCost -= 2;
    if (state.worldFlags.includes("茶寮調息")) mpCost -= 3;
    state.playerHp = Math.max(0, state.playerHp - Math.max(1, hpCost));
    state.playerMp = Math.max(0, state.playerMp - Math.max(1, mpCost));
    if (state.worldFlags.includes("茶寮傳信接應")) {
      state.hozaiDefense = Math.min(100, state.hozaiDefense + 4);
      event += "茶寮傳信及時，堂口派人接應，何不歸防線升四。";
    }
    if (tactic === 4) remember(state, "擊退伏擊刀手");
    remember(state, "市集伏擊突圍");
    event += state.worldFlags.includes("出賣陸千帆")
      ? `你獨自衝出包圍，氣血減${hpBefore - state.playerHp}，內力減${mpBefore - state.playerMp}。你仍留在城西市集，可以探索七處據點。`
      : `你與陸千帆衝出包圍，氣血減${hpBefore - state.playerHp}，內力減${mpBefore - state.playerMp}。你仍留在城西市集，可以探索七處據點。`;
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
      if (destination === "黑泥街" && state.worldFlags.includes("打斷張斷骨右手") && !state.worldFlags.includes("屠戶避讓")) {
        remember(state, "屠戶避讓");
        event += "你見張斷骨避開目光，肉檔再沒人敢當面頂撞。";
      }
    } else if (destination || (movement && /城東|城南|城北|城中|外城|玄武樓總壇|官府/.test(action))) {
      event += "你走到城西邊界，見外頭有人把守，便折返原地。";
    } else {
      const tag = /^\w\. \[([^\]]+)\]/.exec(action)?.[1] || "";
      const reaction = SANDBOX_REACTIONS[state.currentLocation][tag];
      const sandboxTag = `${state.currentLocation}:${tag}`;
      const repeatable = ["喝茶", "歇腳", "歇息", "聽曲", "調製敷藥", "練拳"].includes(tag);
      const repeatedAction = Boolean(reaction?.event) && !repeatable && state.flags.lastSandboxTag === sandboxTag;
      state.flags.repeatedActionCount = repeatedAction ? (state.flags.repeatedActionCount || 0) + 1 : 0;
      state.flags.lastSandboxTag = sandboxTag;
      if (reaction) npcReply = { speaker: reaction.speaker || ({
        "青鋒堂總壇": "何不歸", "晚秋茶寮": "容晚秋", "黑泥街": "陸千帆",
        "鬼骰坊": "祁觀衡", "裂石擂": "衛沉岳", "苦煙館": "顧忘生", "夜雨樓": "柳照霜",
      } satisfies Record<Landmark, string>)[state.currentLocation], line: reaction.line };
      if (customAction(action) && /撒沙|撒泥|石灰|撩陰|掀桌|掀枱|逃跑|裝死/.test(action)) {
        const suited = /手疾|身法|靈巧|扒手|察言|皮糙|命硬/.test(state.trait);
        event += suited ? "你使出市井陰招，借自身所長甩開眼線。" : "你使出市井陰招，卻手慢半拍，只勉強保住退路。";
      } else if (state.currentLocation === "裂石擂" && tag === "打黑拳") {
        if (state.playerHp > 10) { state.playerHp -= 10; state.silver += 20; event += "你挨過裂石擂那場硬拳，肋下還在發疼。衛沉岳把二十文賞錢放在台邊；你氣血減十，私銀增加二十文。"; }
        else event += "你傷得太重，衛沉岳攔住你上擂台。";
      } else if (state.currentLocation === "晚秋茶寮" && tag === "買藥") {
        if (state.silver >= 10) { state.silver -= 10; state.playerHp = Math.min(state.maxHp, state.playerHp + 25); event += "你將十文私銀放在茶寮桌上。容晚秋替你敷妥金創散，血終於止住；氣血回復二十五。"; }
        else event += "你掂了掂空錢袋，容晚秋搖頭，不肯賒藥。";
      } else if (state.currentLocation === "青鋒堂總壇" && tag === "固防") {
        if (state.factionFunds >= 20) { state.factionFunds -= 20; state.hozaiDefense = Math.min(100, state.hozaiDefense + 12); event += "你從青鋒堂公款撥出二十文，換上總壇鬆動的門閂。門能再擋一陣，何不歸防線升十二。"; }
        else event += "你清點公款，尚欠二十文，防線無法修補。";
      } else if (state.currentLocation === "青鋒堂總壇" && tag === "休整") {
        const hpRestored = Math.min(12, state.maxHp - state.playerHp);
        const mpRestored = Math.min(8, state.maxMp - state.playerMp);
        state.playerHp = Math.min(state.maxHp, state.playerHp + 12);
        state.playerMp = Math.min(state.maxMp, state.playerMp + 8);
        event += `你在總壇靜坐調息，氣血回復${hpRestored}，內力回復${mpRestored}。`;
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
      } else if (state.currentLocation === "苦煙館" && tag === "調製敷藥") {
        if (state.playerMp >= 4 && state.playerHp < state.maxHp) {
          const healed = Math.min(12, state.maxHp - state.playerHp);
          state.playerMp -= 4; state.playerHp += healed;
          event += `你耗去四點內力調藥，敷在傷處，氣血回復${healed}。`;
        } else event += "你傷勢已平，或氣力不足以調藥；顧忘生沒有讓你白耗藥材。";
      } else if (state.currentLocation === "夜雨樓" && tag === "斷開跟梢") {
        if (state.playerMp >= 4) {
          state.playerMp -= 4;
          state.hozaiDefense = Math.min(100, state.hozaiDefense + 4);
          event += "你耗去四點內力甩開尾巴，替堂口藏住行跡；何不歸防線升四。";
        } else event += "你氣力不足，才到側門便被身後的人重新盯上。";
      } else if (state.currentLocation === "裂石擂" && tag === "練拳") {
        if (state.playerMp >= 4) {
          state.playerMp -= 4; remember(state, "裂石擂練拳");
          event += "你照衛沉岳指點練過拳，耗去四點內力；下次守街時，便認得刀手逼近的步法。";
        } else event += "你氣息已亂，衛沉岳叫你先收拳，免得傷了自己。";
      } else if (["晚秋茶寮:喝茶", "黑泥街:歇腳", "夜雨樓:聽曲"].includes(sandboxTag)) {
        const restored = Math.min(6, state.maxMp - state.playerMp);
        state.playerMp += restored;
        event += (reaction?.event || "") + `你暫得喘息，內力回復${restored}。`;
      } else if (state.currentLocation === "裂石擂" && tag === "歇息") {
        const restored = Math.min(8, state.maxHp - state.playerHp);
        state.playerHp += restored;
        event += (reaction?.event || "") + `你按著傷處歇了一陣，氣血回復${restored}。`;
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
    }
    }
    state.hozaiDefense = Math.max(0, state.hozaiDefense - 2);
    event += "玄武樓又向城西逼近一步；何不歸防線減二。";
    if (state.currentLocation === "青鋒堂總壇" && state.worldFlags.includes("私吞五十文規費") && !state.worldFlags.includes("何不歸查出私吞")) {
      state.hozaiDefense = Math.max(0, state.hozaiDefense - 8);
      remember(state, "何不歸查出私吞");
      event += "你見何不歸查出私吞規費，防線再減八。";
    }
    if (state.hozaiDefense === 0) {
      remember(state, "何不歸防線崩潰");
      event += "你聽見何不歸防線崩潰，堂口人心潰散。";
    }
    if (!pendingIncident && state.turn >= 8 && state.turn - (state.flags.lastIncidentTurn || 0) >= 5) {
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

  const changes: string[] = [];
  if (state.silver !== oldSilver) changes.push(`私銀${state.silver > oldSilver ? "增加" : "減少"}${Math.abs(state.silver - oldSilver)}文`);
  if (state.factionFunds !== oldFunds) changes.push(`公款${state.factionFunds > oldFunds ? "增加" : "減少"}${Math.abs(state.factionFunds - oldFunds)}文`);
  return { state, options: availableOptions(state), event: event.trim(), moneyNote: changes.join("，"), npcReply };
}

export function availableOptions(state: GameState): string[] {
  return state.questStep === "prologue_briefing" ? PROLOGUE_OPTIONS
    : state.questStep === "yung_tea_stall" ? TEA_OPTIONS
    : state.questStep === "market_collection" ? MARKET_OPTIONS
    : state.questStep === "huizhi_ambush" ? (state.worldFlags.includes("出賣陸千帆") ? SOLO_AMBUSH_OPTIONS : AMBUSH_OPTIONS)
    : state.flags.pendingIncident ? INCIDENT_OPTIONS[state.flags.pendingIncident]
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
      : SANDBOX_OPTIONS[state.currentLocation];
}
