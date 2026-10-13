'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { GameState } from '@/lib/game-engine';

interface HistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: NonNullable<GameState['history']>;
}

export function HistoryModal({ open, onOpenChange, history }: HistoryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="bg-black/85 backdrop-blur-sm"
        className="max-w-2xl max-h-[85vh] overflow-hidden rounded-sm bg-[#181512] border-2 border-[#4a3828] text-[#d5c7b3] font-serif p-0">
        <DialogHeader className="border-b border-[#4a3828] px-6 py-5">
          <DialogTitle className="text-xl tracking-widest text-amber-200">往事殘卷 (Debug Log)</DialogTitle>
          <DialogDescription className="text-xs text-[#a3907c]">逐回合查閱你的選擇與當時的敘事。</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto px-6 pb-6 space-y-4">
          {history.length === 0 ? <p className="py-8 text-center text-[#a3907c]">殘卷尚無記載。</p>
            : [...history].reverse().map((entry, index) => (
              <article key={`${entry.turn}-${history.length - index}`} className="border-b border-[#4a3828] pb-4 last:border-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-[#a3907c]">Turn {entry.turn}</span>
                  <span className="rounded-sm border border-amber-900/50 px-2 py-1 text-sm text-amber-500 bg-amber-950/30">{entry.action}</span>
                </div>
                <p className="whitespace-pre-wrap break-words leading-relaxed text-[#d5c7b3]">{entry.narrative}</p>
              </article>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
