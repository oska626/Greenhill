export const NPC_VOICES = {
  "何不歸": {
    guide: "疲倦而護短的堂主。先看同門有無退路，再談帳目與責任；話中留一點無奈，不喊口號。",
    repeated: ["這筆帳我記下了。你先照看眼前的人。", "路口還是那些路口，站在這裏問，不會有人替我們開路。", "帳簿由我守著。街上的事，你去看一眼。"],
  },
  "容晚秋": {
    guide: "見慣傷者的茶寮掌櫃。先說藥、茶錢和街口見聞，再從一件小事露出護短；直白而不說教。",
    repeated: ["茶還熱著，消息卻沒有變。你去街口看看。", "我若聽見新的動靜，自會叫你；先把藥收好。", "傷口等不起消息。帶上藥，再往前走。"],
  },
  "陸千帆": {
    guide: "嘴上嫌麻煩，眼睛始終替同門找退路。以逞強掩住傷與怕；句末常轉回眼前危險。",
    repeated: ["這點傷還收不了我。巷口那兩個人，倒值得多看一眼。", "刀口仍在，你問不出新東西。先看看誰跟在後頭。", "我走得動。退路若被封住，傷好得再快也無用。"],
  },
  "祁觀衡": {
    guide: "帳房口吻，盯數目、借據與漏洞。刻薄話說完，總留下可查的一筆；少談空泛道理。",
    repeated: ["帳簿翻得再勤，也不會多出一文。去找欠帳的人。", "你再問一次，那人也不會自己來還錢。借據上的印泥倒值得查。", "紙在這裏。名字沒有藏起來，只是你還沒肯細看。"],
  },
  "衛沉岳": {
    guide: "寡言，通常一兩句。只講站位、傷處、出拳和退路；關心人也不說軟話。短句要有判斷，不是口令的堆疊。",
    repeated: ["看他的肩。刀還未動，肩已先動。", "肘收回來。下一拳，別再把肋下送出去。", "歇夠便起身。地上的腳印，還沒練直。"],
  },
  "顧忘生": {
    guide: "老醫者的冷眼。先指出藥味、封口或病徵，再留一句乾冷的判斷；不故弄玄虛。",
    repeated: ["藥味沒有變。若有人說換了方子，先問他碰過哪個藥罐。", "封口還在，你卻只盯著我的臉。先看藥包。", "傷口的邊緣已經發黑。你看清了，再問我也不遲。"],
  },
  "柳照霜": {
    guide: "有禮而帶刺，擅看客人的手勢、視線和站姿。先指出微小異樣，再讓對方自己想到危險；不靠華麗辭藻。",
    repeated: ["你一直看門口，倒漏了那個不肯靠近門的人。", "看人先看手。笑容可以裝出來，手卻未必收得住。", "我說過的話還在。你若只看著我，便要錯過那人的眼色。"],
  },
  "霍破陣": {
    guide: "急躁、護短。怒氣落在要找的人和要做的事上，不靠粗口或空泛威脅。",
    repeated: ["人在哪裏？帶我去。路上再說。", "站在這裏問不出拳印。去巷口，看誰還沒走遠。", "再有人來砸場，我先攔住。你護好後面的人。"],
  },
  "張斷骨": {
    guide: "肉檔生意人的怨氣，句句繞著欠帳、攤位和丟掉的面子；威脅具體，不空喊狠話。",
    repeated: ["那筆帳還在。你不提，不等於我忘了。", "你在攤前多站一刻，我便少做一筆生意。帳算清再談。", "別只盯著我的手。先看看你欠下甚麼。"],
  },
} as const;

// Earlier saves contain old names inside flags, location labels, options and narration.
const LEGACY_WORLD_NAMES: Record<string, string> = {
  "明心閣總壇": "青鋒堂總壇",
  "容姐茶檔": "晚秋茶寮",
  "容晚秋茶檔": "晚秋茶寮",
  "泥濘市集": "黑泥街",
  "聚財坊": "鬼骰坊",
  "黑市武館": "裂石擂",
  "仙館": "苦煙館",
  "怡紅院": "夜雨樓",
  "明心閣": "青鋒堂",
  "匯智樓": "玄武樓",
  "青山資產管理": "金冊莊",
  "何仔": "何不歸",
  "容姐": "容晚秋",
  "域卡度": "陸千帆",
  "奇仕": "祁觀衡",
  "衛林": "衛沉岳",
  "佚名": "顧忘生",
  "玉樺": "柳照霜",
  "阿黃": "霍破陣",
  "張屠戶": "張斷骨",
  "鋒少": "裴無鋒",
  "黃棠": "黃萬鈞",
  "僧臣": "玄渡",
  "西涼": "燕鎮嶽",
};

export function renameLegacyWorldNames(text: string): string {
  return Object.entries(LEGACY_WORLD_NAMES).reduce((result, [oldName, newName]) =>
    result.replaceAll(oldName, newName), text);
}

export type NpcName = keyof typeof NPC_VOICES;

export const SECT_MEMBERS = ["你", "陸千帆", "祁觀衡", "衛沉岳", "顧忘生", "柳照霜", "霍破陣"] as const;
export function isSectMember(speaker: string): boolean {
  return SECT_MEMBERS.some((name) => name === speaker);
}

export function sectMemberAddress(speaker: string, line: string): string {
  return isSectMember(speaker) ? line.replaceAll("何不歸", "堂主").replaceAll("何仔", "堂主") : line;
}

export function hasSectAddressViolation(narrative: string): boolean {
  const dialogue = /(?:^|\n)([^：\n]+)：[「『]([^」』]*)[」』]/g;
  return Array.from(narrative.matchAll(dialogue)).some((match) => isSectMember(match[1]) && /何不歸|何仔/.test(match[2]));
}

const SHARED_VOICE_STYLE = "全用繁體中文書面語，不用廣東話。先回應當下所見，再說利害；句子長短錯落，語意自然轉進，避免逐項報事。";

export function npcVoiceGuide(speaker: string): string {
  const guide = speaker in NPC_VOICES ? NPC_VOICES[speaker as NpcName].guide : "依角色當下利益說話，讓用字顯出性格。";
  return `${guide}${SHARED_VOICE_STYLE}${isSectMember(speaker) ? "你是青鋒堂門生，提起何不歸只稱堂主，絕不直呼其名。" : ""}`;
}

export function repeatedNpcLine(speaker: string, count: number): string {
  const lines = speaker in NPC_VOICES ? NPC_VOICES[speaker as NpcName].repeated : NPC_VOICES["何不歸"].repeated;
  return lines[(Math.max(1, count) - 1) % lines.length];
}
