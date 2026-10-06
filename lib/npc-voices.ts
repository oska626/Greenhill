export const NPC_VOICES = {
  "何仔": {
    guide: "先替同門留退路，再把責任與帳目壓回對方肩上。語氣像疲倦的堂口主事，偶爾自嘲；不喊口號。",
    repeated: ["這事我記著。你先把眼前的人顧好。", "路口還是那些路口，換個地方探探。", "別替我守帳簿。去看街上出了甚麼事。"],
  },
  "容姐": {
    guide: "像見慣傷號的茶檔掌櫃，先講藥、茶錢、街口的實事，再露一點護短。直白而不說教。",
    repeated: ["消息還是那一句。茶涼了，你去街口看看。", "我若再聽到動靜，第一個叫你。", "先把藥收好。別坐著等人來報信。"],
  },
  "域卡度": {
    guide: "嘴上嫌麻煩，眼睛卻一直替同門看退路。用逞強掩住傷與怕，說話帶一點市井滑頭，不硬塞粵語助詞。",
    repeated: ["我還沒倒。你替我盯緊巷口。", "又問？刀口還在，先看誰跟著你。", "這點傷要不了命。退路倒得早點找。"],
  },
  "奇仕": {
    guide: "帳房口吻，盯數目、借據與漏洞；一句刻薄話後給可查的線索。少談空泛道理。",
    repeated: ["同一本帳，翻三遍也不會多出一文。", "你再問一次，欠帳的人也不會自己上門。", "紙在這裏。名字要你自己去查。"],
  },
  "衛林": {
    guide: "寡言，通常一兩個短句。只講站位、傷處、出拳和退路；關心人也不說軟話。",
    repeated: ["看手。別看嘴。", "肘收回來。再練。", "歇夠就起身。"],
  },
  "佚名": {
    guide: "老醫者的冷眼，先指出藥味、封口或病徵，再用乾冷一句收尾。不故弄玄虛。",
    repeated: ["藥味沒變。人心我不驗。", "封口先看。別總問我。", "傷口會說話。你自己看。"],
  },
  "玉樺": {
    guide: "有禮而帶刺，擅看客人的手勢、視線和站姿。話說半句便讓人自己看出危險；不用華麗辭藻。",
    repeated: ["你又看門口？先看看誰一直避開門口。", "若要看人，先看他把手放在哪裏。", "話我說過了。眼睛別只看我。"],
  },
  "阿黃": {
    guide: "急躁、護短，短句直指要找的人和要做的事；怒氣有重量，不靠連串粗口。",
    repeated: ["還問？人在哪裏，帶我去。", "站著問沒用。去巷口看。", "再有人踩場，我先上。"],
  },
  "張屠戶": {
    guide: "肉檔生意人的怨氣，句句繞著欠帳、攤位和丟掉的面子；威脅具體，不空喊狠話。",
    repeated: ["帳還在，我可沒說算了。", "你站久一刻，我這攤又少一筆生意。", "別盯著我的手。先把欠的算清。"],
  },
} as const;

export type NpcName = keyof typeof NPC_VOICES;

export function npcVoiceGuide(speaker: string): string {
  return speaker in NPC_VOICES ? NPC_VOICES[speaker as NpcName].guide : "依角色當下利益說話，句子自然簡短。";
}

export function repeatedNpcLine(speaker: string, count: number): string {
  const lines = speaker in NPC_VOICES ? NPC_VOICES[speaker as NpcName].repeated : NPC_VOICES["何仔"].repeated;
  return lines[(Math.max(1, count) - 1) % lines.length];
}
