"use client";

import { useEffect, useState, useRef } from "react";

export interface GameState {
  turn: number;
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

export default function GamePage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [narrative, setNarrative] = useState<string>("");
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [customInput, setCustomInput] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const narrativeEndRef = useRef<HTMLDivElement>(null);

  // 初次載入：向後端請求開局第一幕
  const initGame = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`連線失敗 (Status: ${res.status})`);
      const data: ApiResponse = await res.json();
      if (data.error) throw new Error(data.error);

      setGameState(data.state);
      setNarrative(data.narrative);
      setOptions(data.options || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "載入失敗";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initGame();
  }, []);

  // 滾動至最新文字
  useEffect(() => {
    narrativeEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [narrative, loading]);

  // 提交玩家行動
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

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200 flex flex-col font-sans">
      {/* 頂部狀態列 */}
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur px-4 py-3 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-600 tracking-wider">青山城</span>
            <span className="text-stone-500">|</span>
            <span className="text-stone-400">當前地標:</span>
            <span className="text-stone-100 font-semibold">{gameState?.currentLocation || "載入中..."}</span>
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
                  (gameState?.hozaiDefense ?? 60) <= 20
                    ? "text-rose-500 animate-pulse"
                    : (gameState?.hozaiDefense ?? 60) <= 40
                    ? "text-amber-500"
                    : "text-emerald-400"
                }`}
              >
                {gameState?.hozaiDefense ?? 60}/100
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 主體工作區 */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 左側與中央：主劇情展示與行動選擇 */}
        <section className="lg:col-span-3 flex flex-col gap-4">
          {/* 劇情主視窗 */}
          <div className="bg-stone-900/60 border border-stone-800/80 rounded-lg p-5 min-h-[380px] max-h-[520px] overflow-y-auto shadow-inner flex flex-col justify-between">
            {errorMsg ? (
              <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 rounded text-sm">
                ⚠️ {errorMsg}
                <button onClick={initGame} className="ml-4 underline text-rose-200 hover:text-white">
                  重新連線
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm md:text-base leading-relaxed tracking-wide whitespace-pre-line text-stone-200 font-serif">
                  {narrative || "正在讀取青山城風雨局勢..."}
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

          {/* 行動選項面版 */}
          <div className="bg-stone-900/80 border border-stone-800 rounded-lg p-4 flex flex-col gap-3">
            <div className="text-xs font-semibold text-stone-400 tracking-wider">可執行抉擇</div>
            <div className="grid grid-cols-1 gap-2">
              {options.length > 0 ? (
                options.map((opt, idx) => (
                  <button
                    key={idx}
                    disabled={loading}
                    onClick={() => handleAction(opt)}
                    className="text-left text-xs md:text-sm px-4 py-2.5 rounded bg-stone-800/70 hover:bg-stone-700/80 hover:border-amber-700/60 border border-stone-700/50 transition duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-stone-200"
                  >
                    {opt}
                  </button>
                ))
              ) : (
                <div className="text-xs text-stone-500 py-2">尚無可選選項</div>
              )}
            </div>

            {/* 自訂義市井手段輸入 */}
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

        {/* 右側：個人屬性、行囊與城西七大地標 */}
        <aside className="lg:col-span-1 flex flex-col gap-4">
          {/* 生理狀態 */}
          <div className="bg-stone-900/80 border border-stone-800 rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold text-stone-400">身體狀況</div>
            {/* 氣血條 */}
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
                    width: `${Math.max(
                      0,
                      Math.min(100, ((gameState?.playerHp ?? 100) / (gameState?.maxHp ?? 100)) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* 內力條 */}
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
                    width: `${Math.max(
                      0,
                      Math.min(100, ((gameState?.playerMp ?? 50) / (gameState?.maxMp ?? 50)) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 行囊（嚴格 4 格限制） */}
          <div className="bg-stone-900/80 border border-stone-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-stone-400">行囊負重</span>
              <span className="text-stone-400 font-mono">
                {gameState?.inventory.length ?? 1} / {gameState?.maxInventory ?? 4}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {Array.from({ length: gameState?.maxInventory || 4 }).map((_, idx) => {
                const item = gameState?.inventory[idx];
                return (
                  <div
                    key={idx}
                    className={`h-14 rounded border flex items-center justify-center p-1.5 text-center text-[11px] leading-tight ${
                      item
                        ? "border-amber-700/50 bg-stone-800/80 text-amber-200"
                        : "border-stone-800 border-dashed bg-stone-950/40 text-stone-600"
                    }`}
                  >
                    {item || "空位"}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 城西七大地標巡查概況 */}
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
