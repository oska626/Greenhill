import { performance } from "node:perf_hooks";

process.loadEnvFile(".env");

const key = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_API_KEY;
const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || process.env.AZURE_ENDPOINT || "").trim();
const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o").trim();

if (!key || !endpoint) {
  console.log(JSON.stringify({ error: "Azure endpoint or API key is missing" }));
  process.exitCode = 1;
} else {
  const base = endpoint.replace(/\/$/, "");
  const version = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
  const url = base.includes("/openai/v1/responses")
    ? base.replace("/openai/v1/responses", "/openai/v1/chat/completions")
    : base.endsWith("/openai/v1") ? `${base}/chat/completions`
    : base.includes("/chat/completions") ? base
    : base.includes("services.ai.azure.com") ? `${base}/openai/v1/chat/completions`
    : `${base}/openai/deployments/${deployment}/chat/completions?api-version=${version}`;

  const system = `你是青山城城西的文字冒險主持人。只寫繁體中文冷硬短句，古代底層市井，無神怪、高武、現代物品。
只以「你」寫旁白。玩家名號只可在 NPC 對白出現。原地行動不重複描寫環境。
只回 JSON：{"narrative":"..."}。narrative 須 80 至 120 字，嚴格兩段，以 \\n\\n 分隔；第二段的 NPC 對白另起一行。
只敘述提供的確定事件，不增減金錢、道具、氣血、內力或地點，不讓玩家離開城西七據點。`;
  const cases = [
    {
      name: "opening",
      prompt: "地點：明心閣總壇；階段：prologue_briefing；你做了：[初入堂口] 阿七。\n確定事件：你初入明心閣，聽何仔打量你的出身，又看見草藥推到面前。你聽何仔交代：到容姐茶檔換金創散救域卡度，再去市集收五十文規費。\n已記因果：無。只寫確定事件；所有收支金額須明說。",
      required: ["容姐茶檔", "域卡度", "五十文"],
    },
    {
      name: "tea-stall",
      prompt: "地點：泥濘市集；階段：market_collection；你做了：B. [問刀手並換藥] 問清伏擊線索，換藥後趕往市集。\n確定事件：你先問刀手兵刃，再請容姐換藥。你把草藥交給容姐，收下金創散與伏擊警訊，趕到市集肉檔。你見域卡度仍帶傷，張屠戶卻拒交規費。\n已記因果：無。只寫確定事件；所有收支金額須明說。",
      required: ["金創散", "域卡度", "張屠戶"],
    },
    {
      name: "sandbox-pressure",
      prompt: "地點：黑市武館；階段：sandbox；你做了：B. [練拳] 向衛林請教拳腳。\n確定事件：你在黑市武館向衛林問拳。你感到匯智樓施壓，何仔防線減二。\n已記因果：市集伏擊突圍。只寫確定事件；所有收支金額須明說。",
      required: ["黑市武館", "衛林", "何仔"],
    },
  ];

  for (const sample of cases) {
    const started = performance.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: deployment, messages: [{ role: "system", content: system }, { role: "user", content: sample.prompt }], temperature: 0.3, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(20000),
      });
      const raw = await response.text();
      if (!response.ok) {
        let code;
        try { code = JSON.parse(raw).error?.code; } catch { /* Do not print upstream bodies. */ }
        console.log(JSON.stringify({ case: sample.name, deployment, httpStatus: response.status, errorCode: code || "unknown", latencyMs: Math.round(performance.now() - started) }));
        break;
      }
      const data = JSON.parse(raw);
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
      const narrative = parsed.narrative;
      const paragraphs = typeof narrative === "string" ? narrative.split("\n\n") : [];
      const characters = typeof narrative === "string" ? Array.from(narrative.replace(/\s/g, "")).length : 0;
      const report = {
        case: sample.name, deployment, httpStatus: response.status,
        latencyMs: Math.round(performance.now() - started),
        promptTokens: data.usage?.prompt_tokens ?? null, completionTokens: data.usage?.completion_tokens ?? null,
        characters, paragraphs: paragraphs.length,
        secondPerson: typeof narrative === "string" && !/[他她它]/.test(narrative) && paragraphs[0]?.startsWith("你"),
        dialogueOnNewLine: /\n[^：\n]+：[「『]/.test(paragraphs[1] || ""),
        requiredTerms: sample.required.filter((term) => narrative?.includes(term)),
        allRequiredTerms: sample.required.every((term) => narrative?.includes(term)),
        narrative,
      };
      console.log(JSON.stringify(report));
    } catch (error) {
      console.log(JSON.stringify({ case: sample.name, deployment, error: error?.name || "request-failed", causeCode: error?.cause?.code || null, latencyMs: Math.round(performance.now() - started) }));
      process.exitCode = 1;
      break;
    }
  }
}
