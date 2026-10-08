'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { ROAD_LINKS, SECRET_LINKS } from '@/lib/city-progression';
import type { GameState } from '@/lib/game-engine';

interface MapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state?: GameState | null;
}

const MAP_AREAS = [
  { name: '青鋒堂總壇', desc: '同門落腳的舊鑄劍堂', x: 25, y: 23 },
  { name: '晚秋茶寮', desc: '容晚秋的茶檔與消息站', x: 42, y: 40 },
  { name: '黑泥街', desc: '攤販雜處的主街市集', x: 67, y: 37 },
  { name: '鬼骰坊', desc: '賭檔、借貸與暗帳所在', x: 25, y: 58 },
  { name: '裂石擂', desc: '地下拳館與打手據點', x: 78, y: 66 },
  { name: '苦煙館', desc: '禁藥與黑市消息集散處', x: 46, y: 76 },
  { name: '夜雨樓', desc: '風月場所，亦是情報樞紐', x: 13, y: 86 },
  { name: '碼頭', desc: '城西糧藥入城的水路，第一章斷貨後可前往', x: 85, y: 17 },
];

export function MapModal({ open, onOpenChange, state }: MapModalProps) {
  const areas = state?.questStep === 'chapter_one' ? MAP_AREAS : MAP_AREAS.filter((area) => area.name !== '碼頭');
  const lostLandmarks = new Set(state?.flags.chapterOne?.lostLandmarks || []);
  const position = (name: string) => MAP_AREAS.find((area) => area.name === name)!;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-zinc-800">
          <DialogTitle className="text-lg font-semibold text-zinc-100">
            青山城 · {state?.questStep === 'chapter_one' ? '城西七處據點與碼頭' : '城西七處據點'}
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-500">
            江湖路險，步步為營
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {/* ASCII / Block map */}
          <div className="relative rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 overflow-hidden">
            <div className="relative h-72 w-full">
              {/* Map grid background */}
              <svg className="absolute inset-0 h-full w-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgb(63 63 70)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>

              {/* City walls */}
              <div className="absolute inset-2 border-2 border-dashed border-zinc-700/60 rounded-lg" />

              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="城西明路與已發現暗道">
                {ROAD_LINKS.filter((road) => areas.some((area) => area.name === road.from)
                  && areas.some((area) => area.name === road.to)).map((road) => <line key={`${road.from}-${road.to}`} x1={position(road.from).x} y1={position(road.from).y}
                  x2={position(road.to).x} y2={position(road.to).y} stroke="#a8a29e" strokeOpacity="0.55" strokeWidth="0.6" />)}
                {SECRET_LINKS.filter((route) => state?.worldFlags.includes(route.flag)).map((route) =>
                  <line key={`${route.from}-${route.to}`} x1={position(route.from).x} y1={position(route.from).y}
                    x2={position(route.to).x} y2={position(route.to).y} stroke="#f59e0b" strokeWidth="0.8" strokeDasharray="2 1" />)}
              </svg>

              {/* Area markers */}
              {areas.map((area, i) => (
                <div
                  key={i}
                  className="absolute flex flex-col items-center gap-1"
                  style={{
                    left: `${area.x}%`,
                    top: `${area.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="relative">
                    <div className={`h-3 w-3 rounded-full ring-2 ${lostLandmarks.has(area.name as GameState['currentLocation'])
                      ? 'bg-rose-600 ring-rose-900/70' : 'bg-amber-600/80 ring-amber-900/40 shadow-[0_0_8px_rgba(217,119,6,0.4)]'}`} />
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-mono text-zinc-500">
                      {i + 1}
                    </span>
                  </div>
                  <span className="whitespace-nowrap text-[11px] font-medium text-zinc-300 bg-zinc-900/80 px-1.5 py-0.5 rounded">
                    {area.name}{lostLandmarks.has(area.name as GameState['currentLocation']) ? ' · 失守' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-zinc-400">灰線：明路；金色虛線：已發現暗道；紅點：失守地標。選目的地後可比較路程與風險。</p>

          {/* Area legend */}
          <div className="grid grid-cols-2 gap-2">
            {areas.map((area, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-900/30 text-[10px] font-mono text-amber-500">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className={`text-xs font-medium ${lostLandmarks.has(area.name as GameState['currentLocation']) ? 'text-rose-300' : 'text-zinc-200'}`}>
                    {area.name}{lostLandmarks.has(area.name as GameState['currentLocation']) ? ' · 失守' : ''}
                  </div>
                  <div className="text-[11px] text-zinc-500 leading-snug">{area.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 pb-5 pt-2 border-t border-zinc-800">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
          >
            <X className="h-4 w-4 mr-1.5" />
            關閉
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
