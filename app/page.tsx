"use client";

import { useEffect, useState, useRef } from "react";
import { aptitude, availableOptions, CUSTOM_ACTION_START, LANDMARKS, normalizeState, OPENING_CITY_NARRATION, type GameState, type Landmark } from "@/lib/game-engine";
import { guardLayersForLifeline, missionDone, MISSIONS, travelChoices } from "@/lib/city-progression";
import { newRelationships } from "@/lib/companion-relations";
import { renameLegacyWorldNames } from "@/lib/npc-voices";
import { createPrologueHandoff, type PrologueHandoff } from "@/lib/prologue-handoff";
import { MapModal } from "@/components/game/map-modal";
import { FactionsModal } from "@/components/game/factions-modal";
import { HistoryModal } from "@/components/game/history-modal";
import { shouldCapturePrologueCheckpoint } from "@/lib/prologue-checkpoint";
import { chapterPressureForecast } from "@/lib/chapter-one";
import { actionEnergyCost, FATIGUE_THRESHOLD, MAX_ENERGY } from "@/lib/energy";
import { STARTING_DARK_HAND, readyDarkHand } from "@/lib/dirty-hand";
import { startingInventory, startingItemOptions, startingWeaponForInventory, type BackgroundId } from "@/lib/character-creation";
import { WEAPONS } from "@/lib/combat-engine";
import { initialRelationshipScores } from "@/lib/npc-traits";
import { hardboiledFallback } from "@/lib/narrative-style";
import { blackmudAnchors } from "@/lib/blackmud-hud";

interface ApiResponse {
  narrative: string;
  options: string[];
  state: GameState;
  error?: string;
  narrativeSource?: string;
}

interface SavedGameData {
  saveVersion?: 2;
  state: GameState;
  narrative: string;
  options: string[];
  handoff?: PrologueHandoff;
  checkpoint?: { version: 1; state: GameState; narrative: string; options: string[] };
}

const SAVE_KEY = "qingshan_game_save_v1";
const READ_KEY = "qingshan_read_narratives_v1";
const RAW_OPENING_PREFIX = "青鋒堂總壇，何不歸在場，桌上有陸千帆的傷勢記錄。任務目標：";
function recordDisplayedHistory(state: GameState, previous: GameState, action: string, narrative: string,
  source?: string): GameState {
  const history = [...(state.history || [])];
  const entry = { turn: state.turn, action, narrative,
    narrativeSource: source === "azure" || source === "market_npc" ? "API" as const : "Fallback" as const,
    preLocation: previous.currentLocation, postLocation: state.currentLocation, questStep: state.questStep };
  if (history.length > (previous.history?.length || 0) && history[history.length - 1]?.turn === state.turn) {
    history[history.length - 1] = entry;
  } else {
    history.push(entry);
  }
  return { ...state, history };
}
const BACKGROUND_TAGS: Record<string, string> = {
  "賭坊收帳人": "收帳人", "城西街童扒手": "扒手", "落魄武館棄徒": "武館棄徒",
  "黑市醫道學徒": "醫道學徒", "自定義市井流民": "市井流民",
};
const showActionWithoutTurnCount = (option: string) => option
  .replace(/每三回合/g, "持續")
  .replace(/(?:用|耗)一回合/g, "需時")
  .replace(/休整一回合/g, "稍作休整")
  .replace(/(?:共)?[一二三四五六七八九十\d]+回合/g, "一段時間");

function highlightedOption(option: string) {
  const display = showActionWithoutTurnCount(option);
  const parts = /^([A-Z]\. )(\[[^\]]+\])(.*)$/s.exec(display);
  return parts ? <>{parts[1]}<span className="font-semibold text-amber-500">{parts[2]}</span>{parts[3]}</> : display;
}

const BACKGROUNDS = [
  {
    id: "debt_collector",
    name: "賭坊收帳人",
    desc: "你在鬼骰坊替人追帳，認得欠債人的眼神，也認得藏在袖中的刀。",
    trait: "察言觀色（交涉與洞察提升）",
  },
  {
    id: "pickpocket",
    name: "城西街童扒手",
    desc: "你在黑泥街長大。攤販記不住你的臉，守門人卻總比你慢一步。",
    trait: "手疾眼快（身法與偷襲提升）",
  },
  {
    id: "martial_dropout",
    name: "落魄武館棄徒",
    desc: "你被裂石擂逐出門牆。拳路仍在，肩上的舊傷也還在。",
    trait: "皮糙肉厚（受擊傷害抗性）",
  },
  {
    id: "doc_assistant",
    name: "黑市醫道學徒",
    desc: "你曾在苦煙館熬藥洗傷。藥味留在指縫，傷口的顏色瞞不過你。",
    trait: "辨毒識藥（毒傷與異常抗性）",
  },
  {
    id: "custom",
    name: "自定義市井流民",
    desc: "你從未向人說清來歷。青山城也從未追問，只看你能否活過明日。",
    trait: "草莽之軀（屬性均衡）",
  },
] satisfies { id: BackgroundId; name: string; desc: string; trait: string }[];

export default function GamePage() {
  const [view, setView] = useState<"creation" | "game">("creation");

  const [savedGame, setSavedGame] = useState<SavedGameData | null>(null);

  const [playerName, setPlayerName] = useState<string>("阿七");
  const [selectedBgId, setSelectedBgId] = useState<BackgroundId>("debt_collector");
  const [customGender, setCustomGender] = useState<string>("");
  const [customSkill, setCustomSkill] = useState<string>("");
  const [customPersonality, setCustomPersonality] = useState<string>("");
  const [selectedStartingItem, setSelectedStartingItem] = useState<string>(startingItemOptions("debt_collector")[0]);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [silverDelta, setSilverDelta] = useState(0);
  const [narrative, setNarrative] = useState<string>("");
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [customInput, setCustomInput] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [selectedDestination, setSelectedDestination] = useState<Landmark | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [factionsOpen, setFactionsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [skipRead, setSkipRead] = useState(false);
  const [previouslyRead, setPreviouslyRead] = useState(false);
  const [showReadNarrative, setShowReadNarrative] = useState(false);

  const narrativeEndRef = useRef<HTMLDivElement>(null);
  const narrativeScrollRef = useRef<HTMLDivElement>(null);
  const lastActionRef = useRef<string>("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed: SavedGameData = JSON.parse(raw);
        const state = normalizeState(parsed?.state);
        if (state && typeof parsed?.narrative === "string") {
          const storedHandoff = parsed.handoff?.version === 1 && parsed.handoff.ending === state.flags.ending
            && typeof parsed.handoff.summary === "string" ? parsed.handoff : undefined;
          const checkpointState = parsed.checkpoint?.version === 1 ? normalizeState(parsed.checkpoint.state) : null;
          const checkpoint = checkpointState?.questStep === "sandbox" && !checkpointState.flags.ending
            && !checkpointState.flags.finalCrisis && typeof parsed.checkpoint?.narrative === "string"
            ? { version: 1 as const, state: checkpointState, narrative: parsed.checkpoint.narrative,
              options: availableOptions(checkpointState) } : undefined;
          const handoff = createPrologueHandoff(state) || storedHandoff;
          const migratedAlleyWall = state.questStep === "sandbox" && state.currentLocation === "黑泥街"
            && !state.combat && !state.flags.alleyEscape && !state.flags.marketAftermath
            && !state.worldFlags.includes("市集殘局已定") && state.worldFlags.includes("黑泥街巷尾脫險")
            && /踢翻餿水桶|追兵踩進污水/.test(parsed.narrative)
            && /手背|挨了一刀|刀手/.test(parsed.narrative);
          if (migratedAlleyWall) {
            state.flags.alleyEscape = true;
            state.flags.alleyWall = true;
            state.worldFlags = state.worldFlags.filter((flag) => flag !== "黑泥街巷尾脫險");
            state.sceneState!.movedObjects["餿水桶"] = "巷口倒翻，餿水流滿地";
            if (!state.sceneState!.depletedSources.includes("餿水桶")) state.sceneState!.depletedSources.push("餿水桶");
          }
          const migratedAftermath = state.flags.marketAftermath && parsed.state?.flags?.marketAftermath !== true;
          const restored: SavedGameData = { saveVersion: 2, state,
            narrative: migratedAftermath || migratedAlleyWall ? hardboiledFallback(parsed.narrative, state)
              : renameLegacyWorldNames(parsed.narrative.replace(OPENING_CITY_NARRATION, "").trimStart()),
            options: availableOptions(state),
            handoff, checkpoint };
          setSavedGame(restored);
          if (state.flags.ending || parsed.state?.maxMp !== MAX_ENERGY || migratedAftermath || migratedAlleyWall)
            localStorage.setItem(SAVE_KEY, JSON.stringify(restored));
        }
      }
    } catch (e) {
      console.error("讀取存檔失敗:", e);
    }
  }, []);

  useEffect(() => {
    if (gameState?.turn === 1 && gameState.questStep === "prologue_briefing") {
      if (narrativeScrollRef.current) narrativeScrollRef.current.scrollTop = 0;
    } else {
      narrativeEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [narrative, loading, gameState?.turn, gameState?.questStep]);

  useEffect(() => {
    if (!narrative) return;
    try {
      const stored = JSON.parse(localStorage.getItem(READ_KEY) || "[]");
      const read: string[] = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : [];
      setPreviouslyRead(read.includes(narrative));
      setShowReadNarrative(false);
      if (!read.includes(narrative)) localStorage.setItem(READ_KEY, JSON.stringify([...read.slice(-199), narrative]));
    } catch {
      setPreviouslyRead(false);
    }
  }, [narrative]);

  const saveToLocalStorage = (state: GameState, narr: string, opts: string[]) => {
    try {
      const reachedCheckpoint = !savedGame?.checkpoint && shouldCapturePrologueCheckpoint(gameState, state);
      const checkpoint = reachedCheckpoint
        ? { version: 1 as const, state, narrative: narr, options: opts } : savedGame?.checkpoint;
      const handoff = savedGame?.handoff?.ending === state.flags.ending
        ? savedGame?.handoff : createPrologueHandoff(state) || undefined;
      const payload: SavedGameData = { saveVersion: 2, state, narrative: narr, options: opts,
        handoff, checkpoint };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      setSavedGame(payload);
    } catch (e) {
      console.error("自動存檔失敗:", e);
    }
  };

  const handleLoadSavedGame = () => {
    if (!savedGame) return;
    setSilverDelta(0);
    setGameState(savedGame.state);
    const rawOpening = savedGame.state.turn === 1 && savedGame.state.questStep === "prologue_briefing"
      && savedGame.narrative.startsWith(RAW_OPENING_PREFIX);
    setNarrative(rawOpening ? "" : savedGame.narrative);
    setOptions(rawOpening ? [] : savedGame.options);
    setErrorMsg(rawOpening ? "舊存檔的開場對白未能生成，請按「重新嘗試」。" : "");
    if (rawOpening) lastActionRef.current = savedGame.state.history?.find((entry) => entry.action.startsWith("[初入堂口]"))?.action
      || `[初入堂口] ${savedGame.state.playerName}`;
    setView("game");
  };

  const handleLoadCheckpoint = () => {
    const checkpoint = savedGame?.checkpoint;
    if (!checkpoint || !window.confirm("由序章中期存檔重試？之後的進度會被覆蓋。")) return;
    const restored: SavedGameData = { saveVersion: 2, state: checkpoint.state,
      narrative: checkpoint.narrative, options: availableOptions(checkpoint.state), checkpoint };
    localStorage.setItem(SAVE_KEY, JSON.stringify(restored));
    setSavedGame(restored);
    setGameState(restored.state);
    setSilverDelta(0);
    setNarrative(restored.narrative);
    setOptions(restored.options);
    setSelectedDestination(null);
    setCustomInput("");
    setErrorMsg("");
    setView("game");
  };

  const handleRestartGame = () => {
    if (window.confirm("確定重新開始？目前的進度與存檔將被清除。")) {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (e) {
        console.error("清除存檔失敗:", e);
      }
      setSavedGame(null);
      setGameState(null);
      setSilverDelta(0);
      setNarrative("");
      setOptions([]);
      setCustomInput("");
      setSelectedDestination(null);
      setErrorMsg("");
      setView("creation");
    }
  };

  const requestOpening = async (initialCharacterState: GameState, action: string) => {
    const openingState = { ...initialCharacterState, history: [] };
    setGameState(openingState);
    setSilverDelta(0);
    setNarrative("");
    setOptions([]);
    setErrorMsg("");
    setView("game");
    setLoading(true);
    lastActionRef.current = action;
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, state: openingState }),
      });
      let data: ApiResponse;
      try {
        data = await res.json();
      } catch {
        throw new Error(`伺服器無回應 (HTTP ${res.status})`);
      }
      if (!res.ok || data.error) throw new Error(data.error || `開局生成失敗 (HTTP ${res.status})`);
      const openedState = recordDisplayedHistory(data.state, openingState, action, data.narrative, data.narrativeSource);
      setGameState(openedState);
      setNarrative(data.narrative);
      setOptions(data.options || []);
      saveToLocalStorage(openedState, data.narrative, data.options || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "開局連線失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = async () => {
    if (!playerName.trim()) {
      setErrorMsg("請先輸入江湖名號");
      return;
    }
    if (selectedBgId === "custom" && (!customGender.trim() || !customSkill.trim() || !customPersonality.trim())) {
      setErrorMsg("請填妥性別、技能同埋性格，何不歸先可以認識你。");
      return;
    }
    setErrorMsg("");
    const trimmedName = playerName.trim();
    const bg = BACKGROUNDS.find((b) => b.id === selectedBgId) || BACKGROUNDS[0];
    const initialTrait = selectedBgId === "custom" ? customSkill.trim() : bg.trait;
    const stats = aptitude(trimmedName, bg.name, initialTrait);
    const inventory = startingInventory(bg.id, selectedStartingItem);
    const startingWeapon = startingWeaponForInventory(inventory);

    const initialCharacterState: GameState = {
      turn: 1,
      playerName: trimmedName,
      background: bg.name,
      trait: initialTrait,
      ...(selectedBgId === "custom" ? {
        gender: customGender.trim(), skill: customSkill.trim(), personality: customPersonality.trim(),
      } : {}),
      currentLocation: "青鋒堂總壇",
      inventory,
      maxInventory: 4,
      playerHp: stats.hp,
      maxHp: stats.hp,
      hpScaleVersion: 2,
      playerMp: stats.mp,
      maxMp: stats.mp,
      silver: 0,
      customActionUses: CUSTOM_ACTION_START,
      factionFunds: 10,
      sectLifeline: 60,
      worldFlags: selectedBgId === "martial_dropout" ? ["武館舊傷"] : [],
      activeMissions: [],
      lastEncounterTurn: 0,
      history: [],
      relationships: newRelationships(),
      relationshipScores: initialRelationshipScores(),
      equippedWeapon: startingWeapon,
      weaponDurability: WEAPONS[startingWeapon].maxDurability,
      knownMoves: {},
      questStep: "prologue_briefing",
      flags: {
        tookHerbs: false,
        visitedYung: false,
        collectedMarketFee: false,
        marketAmbushTriggered: false,
        darkHandInitialized: true,
      },
    };

    const action = `[初入堂口] ${trimmedName}（出身：${bg.name}，${selectedBgId === "custom" ? `性別：${customGender.trim()}，技能：${customSkill.trim()}，性格：${customPersonality.trim()}` : `特質：${initialTrait}`}）踏入青鋒堂總壇，向堂主領命。`;
    await requestOpening(initialCharacterState, action);
  };

  const handleAction = async (actionText: string) => {
    if (!actionText.trim() || loading || !gameState) return;
    lastActionRef.current = actionText;
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionText,
          state: gameState,
          previousNarrative: narrative,
        }),
      });

      let data: ApiResponse;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error(`伺服器無回應 (HTTP ${res.status})`);
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || `伺服器拒絕請求 (HTTP ${res.status})`);
      }

      const nextNarrative = data.narrative;
      const nextOptions = data.options || [];

      if (data.narrativeSource === "custom_rejected") {
        // A rejected attempt changes no game resource, but its failure must be
        // available to <LastTurn> before the player tries another action.
        const rejectedState = recordDisplayedHistory(data.state, gameState, actionText, nextNarrative, data.narrativeSource);
        setGameState(rejectedState);
        saveToLocalStorage(rejectedState, narrative, options);
        setErrorMsg(nextNarrative);
        return;
      }

      const nextState = recordDisplayedHistory(data.state, gameState, actionText, nextNarrative, data.narrativeSource);
      setGameState(nextState);
      setSilverDelta(nextState.silver - gameState.silver);
      setNarrative(nextNarrative);
      setOptions(nextOptions);
      setCustomInput("");
      setSelectedDestination(null);

      saveToLocalStorage(nextState, nextNarrative, nextOptions);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "行動處理發生未知錯誤";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    handleAction(`F. [自訂手段] ${customInput.trim()}`);
  };

  const handoff = gameState?.flags.ending && savedGame?.state.flags.ending === gameState.flags.ending
    ? savedGame.handoff || createPrologueHandoff(gameState) : gameState ? createPrologueHandoff(gameState) : null;
  const supportCount = gameState ? MISSIONS.filter((mission) => gameState.worldFlags.includes(mission.clue)).length : 0;
  const unfinishedSupport = gameState ? MISSIONS.filter((mission) => !missionDone(gameState.worldFlags, mission))
    .map((mission) => mission.title) : [];
  const treasuryChange = gameState?.flags.treasuryChange?.turn === gameState?.turn
    ? gameState?.flags.treasuryChange : undefined;
  const chapterForecast = gameState ? chapterPressureForecast(gameState) : null;
  const darkHandOptions = gameState && (gameState.combat || gameState.flags.alleyEscape)
    ? options.filter((option) => /^[IJ]\. \[(?:撒生石灰|施放暗手|袖藏暗手|全力陰手)\]/.test(option)) : [];
  const primaryOptions = darkHandOptions.length
    ? options.filter((option) => !darkHandOptions.includes(option)) : options;
  const darkHandItem = darkHandOptions.length && gameState
    ? gameState.combat && gameState.inventory.includes(STARTING_DARK_HAND) ? STARTING_DARK_HAND
      : readyDarkHand(gameState.inventory, !gameState.flags.alleyEscape) : undefined;

  if (view === "creation") {
    const curBg = BACKGROUNDS.find((b) => b.id === selectedBgId) || BACKGROUNDS[0];
    const curStats = aptitude(playerName.trim(), curBg.name, selectedBgId === "custom" ? customSkill.trim() || curBg.trait : curBg.trait);
    const startingChoices = startingItemOptions(curBg.id);
    const startingItems = startingInventory(curBg.id, selectedStartingItem);

    return (
      <div className="min-h-screen bg-[#121110] text-[#e4d8bf] flex flex-col justify-center items-center p-4 font-serif">
        <div className="max-w-2xl w-full wood-panel p-6 shadow-2xl space-y-6">
          <div className="relative text-center space-y-1 border-b border-[#4a3727] pb-4">
            <button type="button" onClick={() => setFactionsOpen(true)}
              className="mb-3 rounded-sm border border-[#765739] bg-[#201811] px-2.5 py-1 text-[11px] text-amber-500/90 shadow-inner hover:border-[#a68150] sm:absolute sm:right-0 sm:top-0 sm:mb-0">
              青山風雲
            </button>
            <h1 className="text-2xl font-bold tracking-widest text-amber-500">青山城 · 泥潭入道</h1>
            <p className="text-xs text-stone-400">城西的雨還未停。報上名號，走進青鋒堂那扇尚未關上的門。</p>
          </div>

          {savedGame && (
            <div className="p-3.5 bg-amber-950/30 border border-amber-700/60 rounded-lg flex items-center justify-between gap-3">
              <div className="text-xs text-amber-200/90">
                <span className="font-semibold text-amber-400">發現舊進度：</span>
                {savedGame.state.playerName}（{savedGame.state.background}）· 位於 {savedGame.state.currentLocation}
              </div>
              <button
                type="button"
                onClick={handleLoadSavedGame}
                className="bg-amber-700 hover:bg-amber-600 text-stone-100 px-3.5 py-1.5 rounded text-xs font-medium transition shrink-0 shadow"
              >
                繼續江湖路
              </button>
            </div>
          )}

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
                  className="w-full bg-[#17130f] border border-[#59432e] rounded-sm px-3 py-2 text-sm text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-[#a68150]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-400 tracking-wider">市井出身</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => {
                    setSelectedBgId(bg.id);
                    if (!startingItemOptions(bg.id).includes(selectedStartingItem))
                      setSelectedStartingItem(startingItemOptions(bg.id)[0]);
                  }}
                  className={`text-left p-3 rounded-sm border shadow-inner transition ${
                    selectedBgId === bg.id
                      ? "border-[#a68150] bg-[#302317] text-[#e6d7bd]"
                      : "border-[#3a2e26] bg-[#17130f] hover:border-[#765739] text-[#bca887]"
                  }`}
                >
                  <div className="font-semibold text-sm flex justify-between items-center">
                    <span className={selectedBgId === bg.id ? "text-amber-400" : ""}>{bg.name}</span>
                    <span className="text-[10px] text-stone-300">氣血：{aptitude(playerName.trim(), bg.name, bg.trait).hp} · 精力：{MAX_ENERGY}</span>
                  </div>
                  <div className="text-xs text-stone-300 mt-1 line-clamp-2 leading-relaxed">{bg.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {selectedBgId === "custom" && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-stone-400">寫下你的本事與性情。何不歸會在堂口親自問你。</p>
              <div className="space-y-1.5">
                <label htmlFor="custom-gender" className="text-xs font-semibold text-stone-400 tracking-wider">性別（8 字內）</label>
                <input id="custom-gender" type="text" maxLength={8} value={customGender} onChange={(e) => setCustomGender(e.target.value)}
                  placeholder="例：女子、男子、非二元" className="w-full bg-stone-950 border border-stone-700 rounded px-3 py-2 text-sm text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-amber-600" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="custom-skill" className="text-xs font-semibold text-stone-400 tracking-wider">技能（12 字內）</label>
                <input id="custom-skill" type="text" maxLength={12} value={customSkill} onChange={(e) => setCustomSkill(e.target.value)}
                  placeholder="例：辨藥、摸鎖、使短刀" className="w-full bg-stone-950 border border-stone-700 rounded px-3 py-2 text-sm text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-amber-600" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="custom-personality" className="text-xs font-semibold text-stone-400 tracking-wider">性格（12 字內）</label>
                <input id="custom-personality" type="text" maxLength={12} value={customPersonality} onChange={(e) => setCustomPersonality(e.target.value)}
                  placeholder="例：嘴硬心軟、遇事多疑" className="w-full bg-stone-950 border border-stone-700 rounded px-3 py-2 text-sm text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-amber-600" />
              </div>
            </div>
          )}

          <div className="space-y-1.5 border-t border-[#4a3727] pt-3">
            <p className="text-xs text-stone-300">江湖防身：系統自備<span className="font-semibold text-amber-500">{STARTING_DARK_HAND}</span></p>
            <label htmlFor="starting-item" className="block text-xs font-semibold tracking-wider text-[#c6ab82]">另選一件隨身物（4選1）</label>
            <select id="starting-item" value={startingItems[1]} onChange={(e) => setSelectedStartingItem(e.target.value)}
              className="w-full rounded-sm border border-[#59432e] bg-[#17130f] px-3 py-2 text-sm text-amber-400 focus:outline-none focus:border-[#a68150]">
              {startingChoices.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div className="bg-stone-950/80 border border-stone-700/80 rounded p-3 space-y-2 text-xs text-stone-300">
            <div className="font-semibold text-stone-300">初始命盤預覽</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-stone-300">
              <div>氣血上限: <span className="font-mono text-rose-400">{curStats.hp}</span></div>
              <div>精力上限: <span className="font-mono text-sky-400">{curStats.mp}</span></div>
              <div>行囊容量: <span className="font-mono text-stone-200">4 格</span></div>
              <div>初期銀兩: <span className="font-mono text-amber-400">0 文</span></div>
            </div>
            <div className="text-stone-300 pt-1">
              {selectedBgId === "custom" ? "擅長技能" : "天賦特質"}: <span className="text-amber-300 font-medium">{selectedBgId === "custom" ? customSkill || "待填" : curBg.trait}</span>
            </div>
            {selectedBgId === "custom" && <div className="text-stone-300">性別：{customGender || "待填"} · 性格：{customPersonality || "待填"}</div>}
            {selectedBgId === "martial_dropout" && <div className="text-rose-300">肩傷未癒：開局氣血 26 / 28</div>}
            <div className="text-stone-300">
              隨身物資：{startingItems.map((item, index) => <span key={item} className="font-medium text-amber-500">{index > 0 ? "、" : ""}{item}</span>)} <span className="text-stone-200">({startingItems.length}/4 格)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartGame}
            className="w-full bg-[#6f4d2a] hover:bg-[#8c6747] text-stone-100 font-medium py-2.5 rounded-sm border border-[#a47a45] transition duration-150 shadow-inner text-sm tracking-wider mt-2"
          >
            推門入局
          </button>
        </div>
        <FactionsModal open={factionsOpen} onOpenChange={setFactionsOpen} />
      </div>
    );
  }

  const blackmudItems = gameState ? blackmudAnchors(gameState) : [];

  return (
    <div className="min-h-screen bg-[#121110] text-[#e4d8bf] flex flex-col font-serif">
      <header className="border-b border-[#3a2e26] bg-[#1a1511]/95 backdrop-blur px-4 py-3 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-600 tracking-wider">青山城</span>
            <span className="text-stone-500">|</span>
            <span className="text-[#e9d8b6] font-semibold tracking-widest">{gameState?.playerName || "無名氏"} 【{BACKGROUND_TAGS[gameState?.background || ""] || gameState?.background || "無名"}】</span>
            <span className="text-stone-500">|</span>
            <span className="text-stone-400">當前地標:</span>
            <span className="text-stone-100 font-semibold">{gameState?.currentLocation}</span>
          </div>

          <div className="flex items-center gap-3.5 text-stone-300">
            <button type="button" onClick={() => setFactionsOpen(true)}
              className="rounded-sm border border-[#765739] bg-[#201811] px-2.5 py-1 text-[11px] text-amber-500/90 shadow-inner hover:border-[#a68150]"
              aria-label="查看青山風雲與城西形勢">
              青山風雲
            </button>
            <button type="button" onClick={() => setHistoryOpen(true)}
              className="rounded-sm border border-[#3d2e20] bg-[#201811] px-2.5 py-1 text-[11px] text-stone-300 shadow-inner hover:border-[#765739] hover:text-amber-300">
              殘卷紀錄
            </button>
            <div>
              <span className="text-stone-400 mr-1">私銀:</span>
              <span className="text-amber-400 font-mono font-medium">{gameState?.silver ?? 0}</span> 文
              {silverDelta !== 0 && (
                <span className={`ml-1 text-xs font-semibold ${silverDelta < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {silverDelta < 0 ? "↓" : "↑"}{Math.abs(silverDelta)}
                </span>
              )}
            </div>
            <div>
              <span className="text-stone-400 mr-1">青鋒堂命脈:</span>
              <span
                className={`font-mono font-bold ${
                  (gameState?.sectLifeline ?? 60) <= 20
                    ? "text-rose-400 animate-pulse"
                    : (gameState?.sectLifeline ?? 60) <= 40
                    ? "text-amber-500"
                    : "text-emerald-400"
                }`}
              >
                {gameState?.sectLifeline ?? 60}/100
              </span>
              {gameState?.questStep === "sandbox" && (!gameState.flags.ending || gameState.flags.finalGuardLayers !== undefined) && (
                <span className="ml-2 text-stone-400 text-[11px]" title="命脈60起每10點增加一層守備；每層抵銷5點終局攻勢">
                  守備{gameState.flags.finalGuardLayers ?? guardLayersForLifeline(gameState.sectLifeline)}層
                </span>
              )}
            </div>
            <div title={treasuryChange?.reason || "青鋒堂公帳結餘"}>
              <span className="text-stone-400 mr-1">青鋒堂公款:</span>
              <span className="text-amber-400 font-mono font-medium">{gameState?.factionFunds ?? 0}</span> 文
              {treasuryChange && treasuryChange.delta !== 0 && (
                <span className={`ml-1 text-xs font-semibold ${treasuryChange.delta < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {treasuryChange.delta < 0 ? "↓" : "↑"}{Math.abs(treasuryChange.delta)}
                </span>
              )}
              {treasuryChange && (
                <span className="block text-[10px] text-stone-400">{treasuryChange.reason}</span>
              )}
            </div>

            <button
              type="button"
              onClick={handleRestartGame}
              className="ml-2 px-2.5 py-1 rounded bg-stone-800 hover:bg-rose-900/50 hover:text-rose-300 border border-stone-700/60 hover:border-rose-700/50 text-[11px] text-stone-300 transition"
              title="抹除所有進度，重返創角頁面"
            >
              重新開始
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        <section className="lg:col-span-3 flex flex-col gap-4">
          <div ref={narrativeScrollRef} className="parchment-panel p-5 min-h-[380px] max-h-[520px] overflow-y-auto flex flex-col justify-between">
            {errorMsg ? (
              <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 rounded text-sm">
                ⚠️ {errorMsg}
                <button
                  onClick={() => lastActionRef.current.startsWith("[初入堂口]") && gameState
                    ? requestOpening(gameState, lastActionRef.current) : handleAction(lastActionRef.current)}
                  className="ml-4 underline text-rose-200 hover:text-white"
                >
                  重新嘗試
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-end gap-3 text-[11px] text-stone-400">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={skipRead} onChange={(event) => setSkipRead(event.target.checked)} />略過已讀敘事</label>
                </div>
                {skipRead && previouslyRead && !showReadNarrative ? (
                  <button type="button" onClick={() => setShowReadNarrative(true)} className="text-left text-sm text-stone-400 underline">這段敘事已讀過；按此重看</button>
                ) : (
                  <div className="space-y-5 text-sm md:text-base leading-relaxed tracking-wide text-[#e9dcc4] font-serif">
                    {narrative.split(/\n\s*\n/).map((paragraph, index) => (
                      /^（[^\n]+）$/.test(paragraph.trim())
                        ? <p key={index} className="whitespace-pre-line italic text-amber-200/80">{paragraph.trim()}</p>
                        : <p key={index} className="whitespace-pre-line">{paragraph}</p>
                    ))}
                  </div>
                )}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-amber-500/80 pt-2">
                    <span className="animate-spin text-base">⚙</span> 局勢變化中...
                  </div>
                )}
                <div ref={narrativeEndRef} />
              </div>
            )}
          </div>

          {blackmudItems.length > 0 && (
            <div className="wood-panel px-3 py-2.5" aria-live="polite">
              <div className="mb-2 text-[11px] font-semibold tracking-wider text-stone-400">
                黑泥街・{gameState?.flags.alleyEscape ? gameState.flags.alleyWall ? "牆頭" : "死巷"
                  : gameState?.flags.marketAftermath && gameState.flags.marketAftermathKind === "escape" ? "後巷" : "肉檔前"}・眼下之物
              </div>
              <div className="flex flex-wrap gap-1.5">
                {blackmudItems.map((item) => (
                  <details key={`${gameState?.turn}-${item.name}-${item.label}`} className={`group rounded-sm border text-xs shadow-inner ${item.tone === "ready"
                    ? "border-[#8c6747] bg-[#2b2118] text-[#e9d8b6]"
                    : item.tone === "risk" ? "border-[#765739] bg-[#261c14] text-amber-300"
                      : item.tone === "spent" ? "border-[#4a3929] bg-[#17130f] text-stone-400"
                        : "border-[#4a3929] bg-[#1b1713] text-stone-300"}`}>
                    <summary title={item.detail} className="cursor-pointer list-none px-2.5 py-1.5 focus-visible:outline focus-visible:outline-amber-400">
                      <span className="text-amber-500/90">〔{item.name}〕</span><span className="ml-1 text-[10px] opacity-75">{item.label}</span>
                    </summary>
                    <p className="max-w-56 border-t border-[#4a3929] px-2.5 py-2 leading-relaxed">{item.detail}</p>
                  </details>
                ))}
              </div>
            </div>
          )}

          {handoff && (
            <div className="bg-amber-950/25 border border-amber-700/50 rounded-lg p-4 space-y-2">
              <div className="text-sm font-semibold text-amber-300">第一章承接文字</div>
              <p className="text-sm leading-relaxed text-stone-200 select-text">{handoff.summary}</p>
              <p className="text-xs text-stone-400">已連同完整狀態存於此瀏覽器；{gameState?.flags.chapterOne?.stage === "complete" ? `第一章〈碼頭斷貨〉已結束：${gameState.flags.chapterOne.result}。` : gameState?.questStep === "chapter_one" ? "第一章〈碼頭斷貨〉進行中。" : gameState?.flags.ending === "守住城西" ? "可從下方踏入第一章〈碼頭斷貨〉。" : "此結局未能進入第一章；可由中期存檔重試或重新開始。"}</p>
              {gameState?.flags.ending && gameState.flags.ending !== "守住城西" && savedGame?.checkpoint && (
                <button type="button" onClick={handleLoadCheckpoint} className="rounded border border-amber-700 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-900/30">由中期存檔重試</button>
              )}
            </div>
          )}

          <div className="wood-panel p-4 flex flex-col gap-3">
            <div className="text-xs font-semibold text-stone-400 tracking-wider">江湖抉擇與據點差事</div>
            {gameState?.combat && (
              <div className="rounded border border-red-900/50 bg-red-950/25 px-3 py-2 text-xs text-red-200">
                交鋒中 · 對手氣血 {gameState.combat.enemyHp} ·
                {gameState.combat.enemyIntent === "flank" ? "刀手正繞向陸千帆"
                  : gameState.combat.enemyIntent === "heavy" ? "對手正蓄力重拳"
                    : gameState.combat.enemyIntent === "press" ? "刀手正逼近肉案"
                      : gameState.combat.enemyIntent === "jab" ? "對手正試探你的門戶" : "刀手將正面出刀"}
              </div>
            )}
            {gameState?.questStep === "sandbox" && !gameState.flags.ending && (
              <div className="text-[11px] text-stone-400">{gameState.flags.finalCrisis
                ? "入夜了，玄武樓已向七處據點同時進攻。"
                : `距離入夜玄武樓大舉進攻：尚餘 ${Math.max(0, 70 - gameState.turn)} 回合。行路與辦差都會耗時。`}</div>
            )}
            {gameState?.questStep === "sandbox" && gameState.flags.checkpointReady && !gameState.flags.midpointBriefed && (
              <div className="rounded border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">三件城西急事已處理；返回總壇與何不歸開戰前會議。</div>
            )}
            {gameState?.questStep === "sandbox" && savedGame?.checkpoint && (
              <div className="text-[11px] text-emerald-400">（已記錄堂口備戰狀態，若固守失敗可由此重新推演）</div>
            )}
            {gameState?.questStep === "sandbox" && (gameState.turn >= 20 || gameState.flags.finalCrisis) && (
              <div className="rounded border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                守城支援：{supportCount}/3 項；命脈 {gameState.sectLifeline}/100。{supportCount < 3 && unfinishedSupport.length > 0
                  ? `尚可細查：${unfinishedSupport.join("、")}。` : supportCount < 3 ? "現有差事未留下足夠支援。" : "支援已齊，仍須守住足夠命脈。"}
                {!gameState.flags.finalCrisis && <span className="block mt-1">可到苦煙館買療傷藥放入行囊；進入第一章斷貨後，只能用預先帶備的藥。</span>}
              </div>
            )}
            {gameState?.questStep === "chapter_one" && chapterForecast && (
              <div className="rounded border border-rose-900/60 bg-rose-950/25 px-3 py-2 text-xs text-rose-200 space-y-1">
                <div>斷貨持續影響公款：接下來預計{chapterForecast.loss ? `減 ${Math.min(gameState.factionFunds, chapterForecast.loss)} 文${gameState.factionFunds < chapterForecast.loss ? `，另欠收 ${chapterForecast.loss - gameState.factionFunds} 文` : ""}` : "暫無欠收"}；行動收支另計。</div>
                <div>{chapterForecast.tributeIn === null ? `本期貢款：${gameState.flags.chapterOne?.tribute === "paid" ? "已繳" : "逾期"}`
                  : `須繳 ${chapterForecast.tributeCost} 文貢款；${chapterForecast.tributeIn <= 2 ? "催繳已迫近" : chapterForecast.tributeIn <= 4 ? "期限漸近" : "尚有緩衝"}`}。{(gameState.flags.chapterOne?.deficitStreak || 0) >= 2 ? "公款接連欠收，堂口防線開始鬆動。" : "公款欠收會削弱堂口防線。"}</div>
                <div className="font-semibold">{(gameState.flags.chapterOne?.foodShortageDays || 0) >= 4 ? "斷糧已久" : "糧藥供應吃緊"}；民怨 {gameState.flags.chapterOne?.unrest || 0}/20，繼續上升會衝擊地標。</div>
                <div>失守地標：{gameState.flags.chapterOne?.lostLandmarks?.join("、") || "無"}（達 3 處或命脈歸零即敗）。</div>
                <div>同行同伴：{gameState.flags.chapterOne?.selectedCompanion || "未選；只可選一位"}。</div>
              </div>
            )}
            <div className={gameState?.combat ? "flex flex-col gap-2" : "grid grid-cols-1 md:grid-cols-2 gap-2"}>
              {primaryOptions.map((opt, idx) => (
                <button
                  key={idx}
                  disabled={loading}
                  onClick={() => handleAction(opt)}
                  className="text-left text-xs md:text-sm px-3.5 py-2.5 rounded-sm border border-[#584330] bg-[#161311] text-stone-200 shadow-inner transition duration-150 hover:border-[#8c6747] hover:bg-[#271d15] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {highlightedOption(opt)}
                  {gameState && <span className="block mt-1 text-[11px] text-stone-400">
                    {(() => {
                      const route = LANDMARKS.flatMap((destination) => travelChoices(gameState, destination))
                        .find((choice) => choice.label === opt);
                      const turns = route?.turns || Number(/(?:共)?(\d+)回合/.exec(opt)?.[1] || 1);
                      const cost = actionEnergyCost(gameState, opt, turns);
                      const travel = /\[(?:明路前往|暗道前往|前往)\]/.test(opt);
                      const duration = turns > 1 ? " · 耗時較長" : "";
                      const costText = cost === 0 ? "精力 0 · 行動需時"
                        : travel && gameState.playerMp < cost
                          ? `精力 -${gameState.playerMp} · 氣血 -${2 * (cost - gameState.playerMp)}${duration}`
                        : gameState.playerMp === 0 && cost === 1 ? "精力耗盡 · 氣血 -2"
                          : `精力 -${cost}${turns > 1 ? duration : ""}`;
                      const item = /\[(?:撒生石灰|施放暗手|袖藏暗手|全力陰手)\]/.test(opt)
                        ? readyDarkHand(gameState.inventory, !gameState.flags.alleyEscape) : undefined;
                      return `${costText}${item ? ` · 用掉${item}` : ""}`;
                    })()}
                  </span>}
                </button>
              ))}
            </div>
            {gameState && darkHandOptions.length > 0 && (
              <div role="group" aria-label="暗手專用動作"
                className="mt-2 flex flex-wrap items-center gap-2 rounded-sm border border-[#59432e] bg-[#1b1510] px-3 py-2 shadow-inner">
                <span className="mr-auto text-xs font-semibold tracking-wider text-amber-500/90">
                  【暗手{darkHandItem ? ` · ${darkHandItem.slice(1, -1)}` : ""}】
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {darkHandOptions.map((opt) => {
                    const desperate = opt.startsWith("J.") || Boolean(gameState.combat
                      && gameState.playerMp >= 2 && gameState.playerHp <= Math.ceil(gameState.maxHp * 0.3));
                    const cost = gameState.combat && desperate ? 2 : actionEnergyCost(gameState, opt);
                    return (
                      <button key={opt} type="button" disabled={loading} onClick={() => handleAction(opt)}
                        title={opt}
                        aria-label={`${desperate ? "拼命" : "普通"}暗手：${opt}，精力減 ${cost}${darkHandItem ? `，用掉${darkHandItem}` : ""}`}
                        className="rounded-sm border border-[#765739] bg-[#251b13] px-2.5 py-1.5 text-xs text-stone-100 shadow-inner transition hover:border-[#a68150] hover:bg-[#342416] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50">
                        <span className="font-semibold">{highlightedOption(opt)}</span>
                        <span className="ml-1.5 text-stone-400">精力 −{cost}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {gameState && (gameState.questStep === "chapter_one" || !gameState.flags.finalCrisis && !gameState.flags.ending)
              && gameState.flags.chapterOne?.stage !== "complete" && gameState.flags.chapterOne?.stage !== "failed"
              && <form onSubmit={handleCustomSubmit} className="mt-2 pt-3 border-t border-stone-800 flex flex-col gap-1.5">
              <div className="text-xs font-semibold text-amber-400/90 tracking-wider flex items-center gap-1.5">
                <span>F. [自由行動]</span>
                <span className="text-[11px] text-stone-400 font-normal">可寫多件有先後的事；局勢改變時，餘下行動可能被打斷。限 300 字。</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  disabled={loading || !gameState || Boolean(gameState.pendingEncounter)}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder={gameState.currentLocation === "黑泥街" ? "直接說話，或寫出你要做的事。" : "寫明眼前人物或物件，以及你要做的事。"}
                  maxLength={300}
                  className="flex-1 bg-[#17130f] border border-[#59432e] rounded-sm px-3 py-2 text-xs md:text-sm focus:outline-none focus:border-[#a68150] text-stone-200 placeholder:text-stone-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading || !customInput.trim() || !gameState || Boolean(gameState.pendingEncounter)}
                  className="bg-[#6f4d2a] hover:bg-[#8c6747] border border-[#a47a45] text-stone-100 px-5 py-2 rounded-sm text-xs md:text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed shadow-inner"
                >
                  出招
                </button>
              </div>
            </form>}
          </div>
        </section>

        <aside className="lg:col-span-1 flex flex-col gap-4">
          <div className="wood-panel p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-stone-400">身體狀況</span>
              <span className="text-[10px] text-amber-300/80">{gameState?.skill || gameState?.trait}</span>
            </div>
            <div className="text-xs text-stone-400">兵器：<span className="text-stone-200">{WEAPONS[gameState?.equippedWeapon || "fists"].name}</span>
              {gameState?.equippedWeapon && gameState.equippedWeapon !== "fists" && <span className="ml-2 text-stone-300">耐用 {gameState.weaponDurability}</span>}
              {gameState?.equippedWeapon === "fists" && (gameState.inventory.includes("【牛肉刀】") || gameState.inventory.includes("【生鏽鐵刀】")) && <span className="ml-2 text-stone-300">藏刀耐用 {gameState.weaponDurability}</span>}
            </div>
            {(gameState?.knownMoves?.mud_step || gameState?.knownMoves?.short_punch || gameState?.knownMoves?.soft_parry || gameState?.knownMoves?.point_strike) ? (
              <div className="text-xs text-stone-400">所學：<span className="text-stone-200">{[
                gameState.knownMoves.mud_step ? `泥鰍步 ${gameState.knownMoves.mud_step} 層` : "",
                gameState.knownMoves.short_punch ? `裂石短拳 ${gameState.knownMoves.short_punch} 層` : "",
                gameState.knownMoves.soft_parry ? `卸力手 ${gameState.knownMoves.soft_parry} 層` : "",
                gameState.knownMoves.point_strike ? `辨穴陰招 ${gameState.knownMoves.point_strike} 層` : "",
              ].filter(Boolean).join("、")}</span></div>
            ) : null}
            {gameState?.personality && <div className="text-xs text-stone-400">性格：<span className="text-stone-200">{gameState.personality}</span></div>}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-400">氣血</span>
                <span className="text-stone-200 font-mono">
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
                <span className="text-stone-400">精力</span>
                <span className="text-stone-200 font-mono">
                  {gameState?.playerMp ?? 50} / {gameState?.maxMp ?? 50}
                </span>
              </div>
              {gameState && gameState.playerMp <= FATIGUE_THRESHOLD && (
                <div className="mt-1 text-[11px] text-amber-300">疲勞：調查／交涉多耗 1 精力；戰鬥受傷多 2 氣血。</div>
              )}
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

          {gameState?.socialMemory && Object.keys(gameState.socialMemory).length > 0 && (
            <div className="wood-panel p-4 space-y-2">
              <div className="text-xs font-semibold text-amber-400">人物立場</div>
              {Object.entries(gameState.socialMemory).map(([name, person]) => (
                <div key={name} className="text-xs text-stone-300">
                  <span className="font-medium">{name}</span>：{{ hostile: "敵對", wary: "戒備", neutral: "觀望",
                    cooperative: "願意合作", ally: "倒戈相助" }[person.stance]}
                  {person.beliefs.length > 0 ? ` · 信念：${person.beliefs.join("、")}` : ""}
                </div>
              ))}
            </div>
          )}

          {/* 江湖因果標籤面板 */}
          {gameState?.worldFlags && gameState.worldFlags.length > 0 && (
            <div className="wood-panel p-4 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-amber-400">江湖因果事跡</span>
                <span className="text-stone-400 font-mono text-[10px]">{gameState.worldFlags.length} 樁</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {gameState.worldFlags.map((flag, idx) => (
                  <span
                    key={idx}
                    className="bg-amber-950/50 border border-amber-800/60 text-amber-200 px-2 py-0.5 rounded text-[11px] leading-tight"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="wood-panel p-4 space-y-2">
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
                      item ? "border-amber-700/50 bg-stone-800/80 text-amber-400" : "border-stone-700 border-dashed bg-stone-950/40 text-stone-500"
                    }`}
                  >
                    {item || "空位"}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="wood-panel p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between mb-2"><div className="font-semibold text-stone-400">城西地標與路程</div>
              <button type="button" onClick={() => setMapOpen(true)} className="text-amber-400 hover:text-amber-200">查看地圖</button></div>
            <div className="space-y-1.5 text-stone-300">
              {LANDMARKS.filter((location) => gameState?.currentLocation === location
                || Boolean(gameState && travelChoices(gameState, location).length > 0)).map((location) => (
                <button
                  key={location}
                  type="button"
                  disabled={loading || !gameState || Boolean(gameState.combat) || Boolean(gameState.pendingEncounter)
                    || Boolean(gameState.flags.alleyEscape) || Boolean(gameState.flags.marketAftermath)
                    || Boolean(gameState.flags.finalCrisis)
                    || (gameState.questStep === "sandbox" && Boolean(gameState.flags.ending))
                    || gameState.currentLocation === location || travelChoices(gameState, location).length === 0}
                  onClick={() => setSelectedDestination(location)}
                  className={`block w-full text-left py-1 px-2 rounded disabled:opacity-90 ${gameState?.currentLocation === location ? "text-amber-400 bg-stone-800" : "text-stone-300 hover:bg-stone-800 hover:text-stone-100"}`}
                >
                  {location}{gameState?.flags.chapterOne?.lostLandmarks?.includes(location) ? " · 失守" : ""}
                  <span className="text-stone-400">{gameState && gameState.currentLocation === location ? " · 目前所在"
                    : gameState && travelChoices(gameState, location).length > 0
                      ? ` · ${travelChoices(gameState, location)[0].turns === 1 ? "一步可達" : `${travelChoices(gameState, location)[0].turns}回合路程`}` : " · 尚未開放"}</span>
                </button>
              ))}
            </div>
            {gameState && selectedDestination && gameState.currentLocation !== selectedDestination
              && travelChoices(gameState, selectedDestination).length > 0 && !gameState.combat && !gameState.pendingEncounter
              && !gameState.flags.alleyEscape && !gameState.flags.marketAftermath
              && !gameState.flags.finalCrisis && (
              <div className="space-y-1.5 border-t border-stone-700 pt-2">
                <div className="text-amber-300">前往{selectedDestination}，揀一條路：</div>
                {travelChoices(gameState, selectedDestination).map((route) => (
                  <button key={route.kind} type="button" disabled={loading}
                    onClick={() => handleAction(route.label)}
                    className="block w-full text-left rounded border border-stone-700 bg-stone-800 px-2 py-1.5 hover:border-amber-700 disabled:opacity-40">
                    {route.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
      <MapModal open={mapOpen} onOpenChange={setMapOpen} state={gameState} />
      <FactionsModal open={factionsOpen} onOpenChange={setFactionsOpen} />
      <HistoryModal open={historyOpen} onOpenChange={setHistoryOpen} history={gameState?.history || []} />
    </div>
  );
}
