// Keep settlement rules in the engine. Choices name only the immediate action.
const SHORT_ACTIONS: Record<string, string> = {
  "查碼頭貨單": "核對被扣糧車數目",
  "夜探碼頭": "潛入探明進港路線",
  "硬奪碼頭": "帶人強行奪回碼頭",
  "運勁奪港": "運勁奪回碼頭",
  "運步夜探": "運步探明碼頭路線",
  "踏入第一章": "返回總壇盤點生意",
  "回顧結局": "查看本章收局",
  "總壇休養": "返回總壇休養",
  "派人守街": "請堂主派人守街",
  "買消息": "向容晚秋問街訊",
  "買暗道": "向容晚秋問暗道",
  "買藥療傷": "向顧忘生買藥療傷",
  "買藥帶走": "向顧忘生買藥包",
  "買石灰包": "添購生石灰包",
  "買飛蝗石": "添購飛蝗石",
  "買袖藏短刺": "添購袖藏短刺",
  "捐銀固防": "捐銀加固堂口",
  "付錢息事": "付錢安頓攤販",
  "補帳": "補上缺失帳款",
  "救治傷者": "替傷者換乾淨藥",
  "僱船工": "僱船工探水路",
};

const chineseCount = (value: string) => Array.from(value).filter((character) => /[\u3400-\u9fff]/u.test(character)).length;

export function conciseOption(option: string): string {
  const match = /^([A-Z]\. \[([^\]]+)\]\s*)(.*)$/s.exec(option);
  if (!match || /^(自由行動|自訂手段)$/.test(match[2])) return option;
  const [, prefix, tag, source] = match;
  let body = SHORT_ACTIONS[tag] || source.split(/[；。，（(:：]/u, 1)[0].trim();
  if (!body) body = tag;
  if (chineseCount(body) > 12) {
    let count = 0;
    body = Array.from(body).filter((character) => {
      if (/[\u3400-\u9fff]/u.test(character)) count++;
      return count <= 12;
    }).join("").replace(/[，；、\s]+$/u, "");
  }
  return `${prefix}${body}`;
}
