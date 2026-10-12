"use client";

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OPENING_CITY_NARRATION } from "@/lib/game-engine";

interface FactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const [overview, east, south, west, north] = OPENING_CITY_NARRATION.split(/\n\s*\n/);
const factions = [
  { region: "城東", name: "玄武樓", leader: "裴無鋒", description: east },
  { region: "城南", name: "金冊莊", leader: "黃萬鈞", description: south },
  { region: "城北", name: "官衙", leader: "玄渡", description: north },
  { region: "城西", name: "青鋒堂", leader: "何不歸", description: west },
];

export function FactionsModal({ open, onOpenChange }: FactionsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto rounded-sm border-[#765739] bg-[#1b1713] p-0 font-serif text-[#e6d7bd] shadow-2xl">
        <DialogHeader className="border-b border-[#4a3727] px-6 pb-4 pt-6 text-left">
          <p className="text-[11px] tracking-[0.35em] text-amber-600">城西志</p>
          <DialogTitle className="font-serif text-2xl tracking-widest text-amber-200">【 青山風雲 · 各方勢力 】</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-[#c6b394]">{overview}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
          {factions.map((faction) => (
            <article key={faction.region} className="parchment-panel p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-[#57422c] pb-2">
                <h3 className="font-serif text-lg text-[#f0e2c5]">{faction.name}</h3>
                <span className="text-xs tracking-widest text-amber-500">{faction.region}</span>
              </div>
              <p className="mb-2 text-xs text-[#a98d69]">主事 · {faction.leader}</p>
              <p className="text-sm leading-6 text-[#d9c9ab]">{faction.description}</p>
            </article>
          ))}
        </div>
        <div className="border-t border-[#4a3727] px-6 pb-5 pt-3 text-right">
          <DialogClose className="rounded-sm border border-[#765739] bg-[#261c14] px-4 py-2 text-xs text-amber-300 shadow-inner hover:border-[#a68150]">
            合上密卷
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
