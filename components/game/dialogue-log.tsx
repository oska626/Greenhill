'use client';

import { useRef, useEffect } from 'react';
import { ChatMessage } from '@/lib/game-types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface DialogueLogProps {
  messages: ChatMessage[];
  isProcessing: boolean;
}

export function DialogueLog({ messages, isProcessing }: DialogueLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5 bg-zinc-900/80">
        <div className="h-2 w-2 rounded-full bg-red-500/70" />
        <span className="text-xs font-medium tracking-wider text-zinc-400 uppercase">
          江湖見聞
        </span>
        <div className="ml-auto flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-amber-500/40" />
          <div className="h-2 w-2 rounded-full bg-emerald-500/40" />
        </div>
      </div>
      <ScrollArea className="flex-1 px-4 py-3" style={{ maxHeight: '100%' }}>
        <div className="space-y-4 pb-2">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex flex-col gap-1',
                msg.role === 'player' ? 'items-end' : 'items-start',
              )}
            >
              <span
                className={cn(
                  'text-xs font-medium tracking-wide',
                  msg.role === 'player' ? 'text-amber-500/80' : 'text-emerald-500/80',
                )}
              >
                {msg.role === 'player' ? '【你】' : '【GM】'}
              </span>
              <div
                className={cn(
                  'rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
                  msg.role === 'player'
                    ? 'bg-amber-950/30 border border-amber-900/40 text-amber-100/90 max-w-[85%]'
                    : 'bg-zinc-800/40 border border-zinc-700/50 text-zinc-300 max-w-[95%]',
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex items-center gap-2 text-zinc-500">
              <span className="text-xs">GM 正在推演劇情</span>
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
