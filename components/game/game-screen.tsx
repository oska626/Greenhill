'use client';

import { useState } from 'react';
import { useGameState } from '@/hooks/use-game-state';
import { DialogueLog } from '@/components/game/dialogue-log';
import { ActionButtons } from '@/components/game/action-buttons';
import { StatusPanel } from '@/components/game/status-panel';
import { MapModal } from '@/components/game/map-modal';
import { Button } from '@/components/ui/button';
import { Map as MapIcon, RotateCcw, Swords } from 'lucide-react';

export default function GameScreen() {
  const {
    playerState,
    chatHistory,
    actions,
    isStarted,
    isProcessing,
    hydrated,
    startGame,
    resetGame,
    submitTurn,
  } = useGameState();

  const [mapOpen, setMapOpen] = useState(false);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-500">
        <div className="flex flex-col items-center gap-3">
          <Swords className="h-8 w-8 animate-pulse text-amber-600/50" />
          <span className="text-sm tracking-wider">載入江湖……</span>
        </div>
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="max-w-lg text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-wider text-zinc-100">
              鳴森樓
            </h1>
            <p className="text-sm text-zinc-500 tracking-[0.3em] uppercase">
              ming-sum-pavilion
            </p>
          </div>
          <p className="text-sm leading-relaxed text-zinc-400">
            青山城，一座江湖人匯聚嘅古城。傳聞城中鳴森樓藏住一段不為人知嘅秘密，
            三個武人離奇失蹤，人心惶惶。你係一個無名浪客，今日踏入城中，
            命運嘅齒輪開始轉動……
          </p>
          <Button
            onClick={startGame}
            size="lg"
            className="bg-amber-700/80 text-amber-50 hover:bg-amber-600/80 border border-amber-900/40"
          >
            <Swords className="h-5 w-5 mr-2" />
            踏入江湖
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-amber-600/70" />
            <span className="text-lg font-bold tracking-wider text-zinc-100">鳴森樓</span>
            <span className="hidden text-xs text-zinc-600 sm:inline">| 青山城 · 江湖紀事</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetGame}
              className="border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              重新開始
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left column (2/3) */}
          <div className="lg:col-span-2 flex flex-col gap-4" style={{ minHeight: 'calc(100vh - 120px)' }}>
            {/* Dialogue log - fixed height, scrollable */}
            <div className="flex-1 min-h-[400px] max-h-[calc(100vh-340px)]">
              <DialogueLog messages={chatHistory} isProcessing={isProcessing} />
            </div>
            {/* Action buttons */}
            <ActionButtons
              actions={actions}
            witPoints={playerState?.wit_points ?? 2}
              isProcessing={isProcessing}
              onAction={submitTurn}
            />
          </div>

          {/* Right column (1/3) */}
          <div className="lg:col-span-1 flex flex-col gap-3">
            <StatusPanel state={playerState} />
            {/* Map button */}
            <Button
              variant="outline"
              onClick={() => setMapOpen(true)}
              className="w-full border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100"
            >
              <MapIcon className="h-4 w-4 mr-2" />
              查看地圖
            </Button>
          </div>
        </div>
      </main>

      <MapModal open={mapOpen} onOpenChange={setMapOpen} />
    </div>
  );
}
