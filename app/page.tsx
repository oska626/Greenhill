"use client";

import { useEffect, useState, useRef } from "react";

export interface GameState {
  turn: number;
  playerName: string;
  background: string;
  trait: string;
  currentLocation: string;
  inventory: string[];
  maxInventory: number;
  playerHp: number;
  maxHp: number;
  playerMp: number;
  maxMp: number;
  silver: number;
  factionFunds: number;
  hozaiDefense: number;
  questStep: "prologue_briefing" | "yung_tea_stall" | "market_collection" | "huizhi_ambush" | "sandbox";
  flags: {
    tookHerbs: boolean;
    visitedYung: boolean;
    collectedMarketFee: boolean;
    marketAmbushTriggered: boolean;
  };
}

interface ApiResponse {
  narrative: string;
  options: string[];
  state: GameState;
  error?: string;
}

const BACKGROUNDS = [
  {
    id: "debt_collector",
    name: "爛賭收數佬",
    desc: "常年在聚財坊廝混打滾，擅長睇人眼色與恐嚇逼數，下手陰毒專打軟肋。",
    trait: "察言觀色（交涉與洞察提升）",
    startingItems: ["【灌鉛假骰】"],
    hp: 100,
    mp: 50,
  },
  {
    id: "pickpocket",
    name: "城西街童扒手",
    desc: "從小在泥濘市集混大，擅長偷雞摸狗、腳底抹油。身法靈活，擅避要害。",
    trait: "手疾眼快（身法與偷襲提升）",
    startingItems: ["【生石灰粉】"],
    hp: 90,
    mp: 60,
  },
  {
    id: "martial_dropout",
    name: "濕鳩武館棄徒",
    desc: "被黑市武館逐出門牆，雖無上乘內功，但練就一身爛命硬橋硬馬。",
    trait: "皮糙肉厚（受擊傷害抗性）",
    startingItems: ["【粗鐵護腕】"],
    hp: 120,
    mp: 40,
  },
  {
    id: "doc_assistant",
    name: "黑市醫道學徒",
    desc: "曾在仙館替死人熬藥洗傷，識得草藥毒物，通曉人體要害死穴。",
    trait: "辨毒識藥（毒傷與異常抗性）",
    startingItems: ["【止血散】"],
    hp: 95,
    mp: 55,
  },
  {
    id: "custom",
    name: "自定義市井流民",
    desc: "身世不明的市井孤魂，憑一口狠勁在青山城苟活。",
    trait: "草莽之軀（屬性均衡）",
    startingItems: [],
    hp: 100,
    mp: 50,
  },
];

export default function GamePage() {
  const [view, setView] = useState<"creation" | "game">("creation");

  const [playerName, setPlayerName] = useState<string>("阿七");
  const [selectedBgId, setSelectedBgId] = useState<string>("debt_collector");
  const [customTrait, setCustomTrait] = useState<string>("見風使舵");

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [narrative, setNarrative] = useState<string>("");
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [customInput, setCustomInput] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const narrativeEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    narrativeEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [narrative, loading]);

  const handleStartGame = () => {
    if (!playerName.trim()) {
      setErrorMsg("請先輸入江湖名號");
      return;
    }
    setErrorMsg("");
    const trimmedName = playerName.trim();
    const bg = BACKGROUNDS.find((b) => b.id === selectedBgId) || BACKGROUNDS[0];
    const initialTrait = selectedBgId === "custom" ? customTrait.trim() || "草莽之軀" : bg.trait;

    const initialCharacterState: GameState = {
      turn: 1,
      playerName: trimmedName,
      background: bg.name,
      trait: initialTrait,
      currentLocation: "明心閣總壇",
      inventory: [...bg.startingItems],
      maxInventory: 4,
      playerHp: bg.hp,
      maxHp: bg.hp,
      playerMp: bg.mp,
      maxMp: bg.mp,
      silver: 0,
      factionFunds: 10,
      hozaiDefense: 60,
      questStep: "prologue_briefing",
      flags: {
        tookHerbs: false,
        visitedYung: false,
        collectedMarketFee: false,
        marketAmbushTriggered: false,
      },
    };

    setGameState(initialCharacterState);
    setNarrative(
      `青山城連日暴雨初歇，簷前濁水滴瀝未止。\n\n` +
      `明心閣青瓦古堂內，正廳中央的昔日鑄劍巨爐早已冷透，積滿塵灰。閣主何仔眼圈烏黑，正坐在缺角長木凳上揉著太陽穴，順手將一包粗布紮緊的生草藥拍在滿是茶漬的木几上。\n\n` +
      `「${trimmedName}，天光喇，雨停咗班刀手就該出動。你新入堂口，咪成日企喺度似碌木。」何仔打了個哈欠，斜眼瞥著你：\n` +
      `「拎呢包生草藥去巷口交畀容姐煲茶，順便去市集搵域卡度。市集欠咗三日規費，收唔齊返嚟，今晚成個閣嘅手足都要捱餓。」`
    );
    setOptions([
      "1. [領命出發] 拿起木几上的【生草藥包】，戴上破斗笠動身前往容姐茶檔。",
      "2. [打探門路] 追問何仔：「如果市集有人耍賴唔交規費，我應該點應付？」",
      "3. [查驗地圖] 掃視堂內牆上的城西羊皮舊圖，確認容姐茶檔與市集的位置。",
    ]);
    setView("game");
  };

  const handleAction = async (actionText: string) => {
    if (!actionText.trim() || loading || !gameState) return;
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionText,
          state: gameState,
        }),
      });

      if (!res.ok) throw new Error(`回合推進失敗 (Status: ${res.status})`);
      const data: ApiResponse = await res.json();
      if (data.error) throw new Error(data.error);

      setGameState(data.state);
      setNarrative(data.narrative);
      setOptions(data.options || []);
      setCustomInput("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "行動處理錯誤";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  if (view === "creation") {
    const curBg = BACKGROUNDS.find((b) => b.id === selectedBgId) || BACKGROUNDS[0];
    return (
      <div className="min-h-screen bg-stone-950 text-stone-200 flex flex-col justify-center items-center p-4">
        <div className="max-w-2xl w-full bg-stone-900/90 border border-stone-800 rounded-lg p-6 shadow-2xl space-y-6">
          <div className="text-center space-y-1 border-b border-stone-800 pb-4">
            <h1 className="text-2xl font-bold tracking-widest text-amber-500">青山城 · 泥潭入道</h1>
            <p className="text-xs text-stone-400">大雨滂沱，刀鋒未冷。在城西這片泥濘死地，立下你的身家姓名。</p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 rounded text-xs">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-400 tracking-wider">江湖名號</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="輸入名號（例：阿七、生番、啞仔）"
              className="w-full bg-stone-950 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 focus:outline-none focus:border-amber-600"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-400 tracking-wider">市井出身</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => setSelectedBgId(bg.id)}
                  className={`text-left p-3 rounded border transition ${
                    selectedBgId === bg.id
                      ? "border-amber-600 bg-stone-800/90 text-stone-100"
                      : "border-stone-800 bg-stone-950/60 hover:bg-stone-800/40 text-stone-400"
                  }`}
                >
                  <div className="font-semibold text-sm flex justify-between items-center">
                    <span className={selectedBgId === bg.id ? "text-amber-400" : ""}>{bg.name}</span>
                    <span className="text-[10px] text-stone-500">血:{bg.hp} 氣:{bg.mp}</span>
                  </div>
                  <div className="text-xs text-stone-400 mt-1 line-clamp-2 leading-relaxed">{bg.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {selectedBgId === "custom" && (
            <div className="space-y-2 pt-1">
              <label className="text-xs font-semibold text-stone-400 tracking-wider">自訂核心特質</label>
              <input
                type="text"
                value={customTrait}
                onChange={(e) => setCustomTrait(e.target.value)}
                placeholder="輸入特質（例：命硬、裝聾作啞、生石灰專家）"
                className="w-full bg-stone-950 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 focus:outline-none focus:border-amber-600"
              />
            </div>
          )}

          <div className="bg-stone-950/80 border border-stone-800/80 rounded p-3 space-y-2 text-xs">
            <div className="font-semibold text-stone-300">初始命盤預覽</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-stone-400">
              <div>氣血上限: <span className="font-mono text-rose-400">{curBg.hp}</span></div>
              <div>內力上限: <span className="font-mono text-sky-400">{curBg.mp}</span></div>
              <div>行囊容量: <span className="font-mono text-stone-200">4 格</span></div>
              <div>初期銀兩: <span className="font-mono text-amber-400">0 文</span></div>
            </div>
            <div className="text-stone-400 pt-1">
              天賦特質: <span className="text-amber-300 font-medium">{selectedBgId === "custom" ? customTrait || "草莽之軀" : curBg.trait}</span>
            </div>
            <div className="text-stone-400">
              隨身攜帶: <span className="text-stone-300 font-mono">{curBg.startingItems.length > 0 ? curBg.startingItems.join("、 ") : "身無長物"} ({curBg.startingItems.length}/4 格)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartGame}
            className="w-full bg-amber-700/90 hover:bg-amber-600 text-stone-100 font-medium py-2.5 rounded transition duration-150 shadow-md text-sm tracking-wider mt-2"
          >
            確認創角 · 踏入青山城
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200 flex flex-col font-sans">
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur px-4 py-3 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-600 tracking-wider">青山城</span>
            <span className="text-stone-500">|</span>
            <span className="text-stone-100 font-medium">{gameState?.playerName || "無名氏"}</span>
            <span className="text-stone-500 text-[11px]">({gameState?.background})</span>
            <span className="text-stone-500">|</span>
            <span className="text-stone-400">當前地標:</span>
            <span className="text-stone-100 font-semibold">{gameState?.currentLocation}</span>
            <span className="bg-stone-800 text-stone-400 px-2 py-0.5 rounded text-[11px]">
              第 {gameState?.turn || 1} 回合
            </span>
          </div>

          <div className="flex items-center gap-4 text-stone-300">
            <div>
              <span className="text-stone-500 mr-1">銀兩:</span>
              <span className="text-amber-400 font-mono font-medium">{gameState?.silver ?? 0}</span> 文
            </div>
            <div>
              <span className="text-stone-500 mr-1">門派流動金:</span>
              <span className="text-emerald-400 font-mono font-medium">{gameState?.factionFunds ?? 0}</span> 文
            </div>
            <div>
              <span className="text-stone-500 mr-1">何仔防線:</span>
              <span
                className={`font-mono font-bold ${
                  (gameState?.hozaiDefense ?? 60) <= 20 ? "text-rose-500 animate-pulse" : (gameState?.hozaiDefense ?? 60) <= 40 ? "text-amber-500" : "text-emerald-400"
                }`}
              >
                {gameState?.hozaiDefense ?? 60}/100
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        <section className="lg:col-span-3 flex flex-col gap-4">
          <div className="bg-stone-900/60 border border-stone-800/80 rounded-lg p-5 min-h-[380px] max-h-[520px] overflow-y-auto shadow-inner flex flex-col justify-between">
            {errorMsg ? (
              <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 rounded text-sm">
                ⚠️ {errorMsg}
                <button
                  onClick={() => handleAction("重試當前回合")}
                  className="ml-4 underline text-rose-200 hover:text-white"
                >
                  重新嘗試
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm md:text-base leading-relaxed tracking-wide whitespace-pre-line text-stone-200 font-serif">
                  {narrative}
                </div>
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-amber-500/80 pt-2">
                    <span className="animate-spin text-base">⚙</span> 局勢變化中...
                  </div>
                )}
                <div ref={narrativeEndRef} />
              </div>
            )}
          </div>

          <div className="bg-stone-900/80 border border-stone-800 rounded-lg p-4 flex flex-col gap-3">
            <div className="text-xs font-semibold text-stone-400 tracking-wider">可執行抉擇</div>
            <div className="grid grid-cols-1 gap-2">
              {options.map((opt, idx) => (
                <button
                  key={idx}
                  disabled={loading}
                  onClick={() => handleAction(opt)}
                  className="text-left text-xs md:text-sm px-4 py-2.5 rounded bg-stone-800/70 hover:bg-stone-700/80 hover:border-amber-700/60 border border-stone-700/50 transition duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-stone-200"
                >
                  {opt}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAction(customInput);
              }}
              className="mt-2 flex gap-2 pt-2 border-t border-stone-800/60"
            >
              <input
                type="text"
                value={customInput}
                disabled={loading}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="輸入其他江湖招數或市井手段（例如：就地踢泥、借故大叫...）"
                className="flex-1 bg-stone-950 border border-stone-700/80 rounded px-3 py-1.5 text-xs md:text-sm focus:outline-none focus:border-amber-600 text-stone-200 placeholder:text-stone-600 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !customInput.trim()}
                className="bg-amber-800/80 hover:bg-amber-700 text-amber-100 px-4 py-1.5 rounded text-xs md:text-sm font-medium transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                執行
              </button>
            </form>
          </div>
        </section>

        <aside className="lg:col-span-1 flex flex-col gap-4">
          <div className="bg-stone-900/80 border border-stone-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-stone-400">身體狀況</span>
              <span className="text-[10px] text-amber-300/80">{gameState?.trait}</span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-400">氣血</span>
                <span className="text-stone-300 font-mono">
                  {gameState?.playerHp ?? 100} / {gameState?.maxHp ?? 100}
                </span>
              </div>
              <div className="w-full bg-stone-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-rose-600 h-full transition-all duration-300"
                  style={{
                    width: `${Math.max(0, Math.min(100, ((gameState?.playerHp ?? 100) / (gameState?.maxHp ?? 100)) * 100))}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-400">內力</span>
                <span className="text-stone-300 font-mono">
                  {gameState?.playerMp ?? 50} / {gameState?.maxMp ?? 50}
                </span>
              </div>
              <div className="w-full bg-stone-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-sky-600 h-full transition-all duration-300"
                  style={{
                    width: `${Math.max(0, Math.min(100, ((gameState?.playerMp ?? 50) / (gameState?.maxMp ?? 50)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-stone-400">行囊負重</span>
              <span className="text-stone-400 font-mono">
                {gameState?.inventory.length ?? 0} / {gameState?.maxInventory ?? 4}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {Array.from({ length: gameState?.maxInventory || 4 }).map((_, idx) => {
                const item = gameState?.inventory[idx];
                return (
                  <div
                    key={idx}
                    className={`h-14 rounded border flex items-center justify-center p-1.5 text-center text-[11px] leading-tight ${
                      item ? "border-amber-700/50 bg-stone-800/80 text-amber-200" : "border-stone-800 border-dashed bg-stone-950/40 text-stone-600"
                    }`}
                  >
                    {item || "空位"}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800 rounded-lg p-4 space-y-2 text-xs">
            <div className="font-semibold text-stone-400 mb-2">城西地標與堂口</div>
            <div className="space-y-1.5 text-stone-400">
              <div className="flex justify-between items-center py-0.5">
                <span>明心閣總壇 (何仔)</span>
                <span className="text-[10px] text-emerald-400">大本營</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span>容姐茶檔 (容姐)</span>
                <span className="text-[10px] text-amber-300">補給</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span>泥濘市集 (域卡度)</span>
                <span className="text-[10px] text-rose-400">收規</span>
              </div>
              <div className="flex justify-between items-center py-0.5 opacity-60">
                <span>怡紅院 (玉樺)</span>
                <span className="text-[10px] text-stone-500">情報</span>
              </div>
              <div className="flex justify-between items-center py-0.5 opacity-60">
                <span>聚財坊 (奇仕)</span>
                <span className="text-[10px] text-stone-500">賭博借貸</span>
              </div>
              <div className="flex justify-between items-center py-0.5 opacity-60">
                <span>武館 (衛林/阿黃)</span>
                <span className="text-[10px] text-stone-500">黑拳</span>
              </div>
              <div className="flex justify-between items-center py-0.5 opacity-60">
                <span>仙館 (佚名)</span>
                <span className="text-[10px] text-stone-500">禁藥</span>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
