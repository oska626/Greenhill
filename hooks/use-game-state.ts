'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  PlayerState,
  ChatMessage,
  INITIAL_PLAYER_STATE,
  INITIAL_ACTIONS,
} from '@/lib/game-types';

const STORAGE_KEY = 'ming-sum-pavilion-save';

interface SaveData {
  playerState: PlayerState;
  chatHistory: ChatMessage[];
  actions: string[];
  isStarted: boolean;
}

function loadSave(): SaveData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveData;
  } catch {
    return null;
  }
}

function persistSave(data: SaveData) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable
  }
}

const OPENING_MESSAGE: ChatMessage = {
  role: 'gm',
  content:
    '青山城，連日暴雨，城西唐樓嘅瓦頂漏水如注。\n\n明心閣正堂嘅爛八仙桌上攤住幾張發黃嘅借據同半截冷硬油條。門外隱約傳嚟城東匯智樓打手嘅叫罵聲。\n\n何仔抹走額頭嘅雨水，將嘴入面嘅油條吞落去，上下打量咗你一眼：\n「咦，好生面口喎。睇你個死樣，都係走投無路先入嚟明心閣㗎啦？報個名號，撈開邊瓣呀？」\n\n【請選擇你嘅市井出身】：',
  actions: INITIAL_ACTIONS,
};

export function useGameState() {
  const [playerState, setPlayerState] = useState<PlayerState>(INITIAL_PLAYER_STATE);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [actions, setActions] = useState<string[]>(INITIAL_ACTIONS);
  const [isStarted, setIsStarted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const save = loadSave();
    if (save) {
      setPlayerState(save.playerState);
      setChatHistory(save.chatHistory);
      setActions(save.actions);
      setIsStarted(save.isStarted);
    } else {
      setChatHistory([OPENING_MESSAGE]);
      setActions(INITIAL_ACTIONS);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistSave({ playerState, chatHistory, actions, isStarted });
  }, [playerState, chatHistory, actions, isStarted, hydrated]);

  const startGame = useCallback(() => {
    setPlayerState(INITIAL_PLAYER_STATE);
    setChatHistory([OPENING_MESSAGE]);
    setActions(INITIAL_ACTIONS);
    setIsStarted(true);
  }, []);

  const resetGame = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    setPlayerState(INITIAL_PLAYER_STATE);
    setChatHistory([OPENING_MESSAGE]);
    setActions(INITIAL_ACTIONS);
    setIsStarted(true);
  }, []);

  const submitTurn = useCallback(
    async (action: string) => {
      if (isProcessing) return;
      setIsProcessing(true);

      const playerMsg: ChatMessage = { role: 'player', content: action };
      const newHistory = [...chatHistory, playerMsg];
      setChatHistory(newHistory);

      try {
        const res = await fetch('/api/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerState,
            action,
            chatHistory: newHistory,
          }),
        });

        if (!res.ok) {
          throw new Error(`API returned ${res.status}`);
        }

        const data = await res.json();

        setPlayerState(data.updatedState);
        setActions(data.actions && data.actions.length > 0 ? data.actions : INITIAL_ACTIONS);

        const gmMsg: ChatMessage = {
          role: 'gm',
          content: data.aiText || data.text || data.narration || data.message || '（江湖沉寂，無事發生）',
          actions: data.actions,
        };
        setChatHistory([...newHistory, gmMsg]);
      } catch {
        const errMsg: ChatMessage = {
          role: 'gm',
          content: '【系統】連線中斷，江湖訊號不穩。請再試一次。',
          actions: INITIAL_ACTIONS,
        };
        setChatHistory([...newHistory, errMsg]);
        setActions(INITIAL_ACTIONS);
      } finally {
        setIsProcessing(false);
      }
    },
    [playerState, chatHistory, isProcessing],
  );

  return {
    playerState,
    chatHistory,
    actions,
    isStarted,
    isProcessing,
    hydrated,
    startGame,
    resetGame,
    submitTurn,
  };
}