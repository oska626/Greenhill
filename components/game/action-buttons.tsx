'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';

interface ActionButtonsProps {
  actions: string[];
  witPoints: number;
  isProcessing: boolean;
  onAction: (action: string) => void;
}

const ACTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

const ACTION_STYLES: Record<string, string> = {
  A: 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/60',
  B: 'border-zinc-700 hover:border-emerald-600/50 hover:bg-emerald-950/20',
  C: 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/60',
  D: 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/60',
  E: 'border-zinc-700 hover:border-amber-700/50 hover:bg-amber-950/20',
  F: 'border-red-900/40 hover:border-red-700/60 hover:bg-red-950/20',
};

export function ActionButtons({
  actions,
  witPoints,
  isProcessing,
  onAction,
}: ActionButtonsProps) {
  const [customInput, setCustomInput] = useState('');
  const [isInputActive, setIsInputActive] = useState(false);
  const [currentLabel, setCurrentLabel] = useState('E');

  const handleButtonClick = (label: string, text: string) => {
    const isCustom =
      text.includes('自定義') ||
      text.includes('自訂') ||
      text.includes('[其他]') ||
      (label === 'E' && text.includes('江湖人'));

    if (isCustom) {
      setCurrentLabel(label);
      setIsInputActive(true);
      return;
    }

    onAction(text);
  };

  const handleCustomSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customInput.trim() || isProcessing) return;

    onAction(`${currentLabel}. [自定義] ${customInput.trim()}`);
    setCustomInput('');
    setIsInputActive(false);
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium tracking-wider text-zinc-400 uppercase">
          行動
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {ACTION_LABELS.map((label, i) => {
          const actionText = actions[i];

          // 若無選項文字（如開局無 F 格），完全不渲染
          if (!actionText || actionText.trim() === '') {
            return null;
          }

          const isFAction = label === 'F';
          const isDisabled = isProcessing || (isFAction && witPoints <= 0);
          const isWitAction = isFAction;

          return (
            <Button
              key={label}
              variant="outline"
              disabled={isDisabled}
              onClick={() => handleButtonClick(label, actionText)}
              className={cn(
                'h-auto whitespace-normal items-start justify-start gap-3 rounded-md border px-3 py-3 text-left text-sm font-normal transition-all w-full',
                'bg-zinc-900/40 text-zinc-300',
                ACTION_STYLES[label] || ACTION_STYLES.A,
                isDisabled && 'cursor-not-allowed opacity-40 hover:bg-zinc-900/40',
                isWitAction && !isDisabled && 'text-red-300/90',
              )}
            >
              <span
                className={cn(
                  'mt-[2px] flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold',
                  isFAction
                    ? 'bg-red-900/40 text-red-400'
                    : 'bg-zinc-800 text-zinc-400',
                )}
              >
                {label}
              </span>
              <span className="flex-1 leading-snug">
                {actionText.replace(/^[A-F]\.\s*/, '')}
              </span>
              {isFAction && (
                <span
                  className={cn(
                    'mt-[4px] shrink-0 text-xs',
                    witPoints > 0 ? 'text-red-500/70' : 'text-zinc-600',
                  )}
                >
                  機變 {witPoints}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {isInputActive && (
        <form onSubmit={handleCustomSubmit} className="pt-2 border-t border-zinc-800/80">
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="輸入江湖稱號、背景（50字內）及隨身破爛物品..."
              disabled={isProcessing}
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!customInput.trim() || isProcessing}
              className="bg-amber-700 text-amber-50 hover:bg-amber-600 px-4"
            >
              <Send className="h-4 w-4 mr-1.5" />
              出招
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsInputActive(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              取消
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}