'use client';

import dynamic from 'next/dynamic';

const GameScreen = dynamic(() => import('@/components/game/game-screen'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-500">
      <span className="text-sm tracking-wider">載入江湖……</span>
    </div>
  ),
});

export default function Home() {
  return <GameScreen />;
}
