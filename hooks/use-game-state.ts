'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  PlayerState,
  ChatMessage,
  INITIAL_PLAYER_STATE,
  INITIAL_ACTIONS,
} from '@/lib/game-types';
import { renameLegacyWorldNames } from '@/lib/npc-voices';

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
    const save = JSON.parse(raw) as SaveData;
    if (save.playerState?.companion) save.playerState.companion = renameLegacyWorldNames(save.playerState.companion);
    if (Array.isArray(save.chatHistory)) save.chatHistory = save.chatHistory.map((message) => ({
      ...message,
      content: message.role === 'gm' ? renameLegacyWorldNames(message.content) : message.content,
      actions: message.actions?.map(renameLegacyWorldNames),
    }));
    if (Array.isArray(save.actions)) save.actions = save.actions.map(renameLegacyWorldNames);
    return save;
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
    '青山城連日落雨。青鋒堂的舊簷擋不住水，堂中的帳頁卻仍攤得整整齊齊。門外傳來玄武樓刀手的聲音，隔著雨，也聽得出他們在催人讓街。\n\n何不歸抹去額上的雨水，把一包傷藥推到你面前。他沒有問你從哪裏逃來，只看了一眼你腳下的泥。\n何不歸：「先報上名號。這扇門還開著，你總要知道，進來之後要替誰守住它。」\n\n【選擇你的出身】：',
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
