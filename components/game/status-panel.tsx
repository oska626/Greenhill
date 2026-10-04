'use client';

import { PlayerState } from '@/lib/game-types';
import { Shield, Coins, Heart, Zap, Sparkles, Building, Flame, Skull } from 'lucide-react';

interface StatusPanelProps {
  state: PlayerState;
}

export function StatusPanel({ state }: StatusPanelProps) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-300">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <span className="font-bold text-zinc-100 text-sm">{state.identity}</span>
        <span className="text-zinc-500">
          街區：<strong className="text-amber-500">{state.controlled_streets ?? 3}</strong> 條
        </span>
      </div>

      {/* 氣血 & 內力 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
          <div className="flex items-center justify-between text-red-400">
            <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> 氣血</span>
            <span>{state.qi_hp} / {state.max_qi_hp}</span>
          </div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
          <div className="flex items-center justify-between text-blue-400">
            <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> 內力</span>
            <span>{state.neili} / {state.max_neili}</span>
          </div>
        </div>
      </div>

      {/* 機變 & 財富 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
          <div className="flex items-center justify-between text-amber-400">
            <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> 機變</span>
            <span>{state.wit_points} / 2</span>
          </div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
          <div className="flex items-center justify-between text-yellow-400">
            <span className="flex items-center gap-1"><Coins className="h-3.5 w-3.5" /> 銅錢</span>
            <span>{state.copper} 文 {state.silver > 0 ? `| ${state.silver} 兩` : ''}</span>
          </div>
        </div>
      </div>

      {/* 行囊 */}
      <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2 space-y-1">
        <div className="text-zinc-500 text-[11px] mb-1">隨身行囊 (上限 4 格)</div>
        {state.inventory?.map((item, idx) => (
          <div key={idx} className="flex justify-between text-zinc-400">
            <span>{idx + 1}. {item || <span className="text-zinc-700">[空位]</span>}</span>
          </div>
        ))}
      </div>

      {/* 同門與大局 (隱藏數值視覺化) */}
      <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2 space-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-zinc-400">在場同伴：</span>
          <span className="text-zinc-200">{state.companion}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-400">何仔防線：</span>
          <div className="flex items-center gap-2">
            <div className="w-16 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all" 
                style={{ width: `${Math.max(0, Math.min(100, (state.ho_defense ?? 60)))}%` }} 
              />
            </div>
            <span className="text-emerald-400 font-mono">{state.ho_defense ?? 60}/100</span>
          </div>
        </div>
        <div className="flex justify-between text-zinc-500">
          <span>西涼猜忌：{state.xiliang_suspicion ?? 10}%</span>
          <span>僧臣罪證：{state.monk_evidence ?? 10}%</span>
        </div>
      </div>
    </div>
  );
}