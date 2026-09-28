import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react';
import type { Story } from '@/lib/stories';
import { markStorySeen } from '@/lib/stories';
import { VipGoldMark } from '@/components/VipGoldMark';

const HOLD_MS = 5200;

export function StoryViewer({
  stories,
  startIndex = 0,
  onClose,
}: {
  stories: Story[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, stories.length - 1)));
  const [paused, setPaused] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const story = stories[index];

  useEffect(() => {
    if (!story || paused) return;
    markStorySeen(story.id);
    const timer = window.setTimeout(() => {
      if (index < stories.length - 1) setIndex((value) => value + 1);
      else onClose();
    }, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [index, onClose, paused, story, stories.length]);

  if (!stories.length) {
    return (
      <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/75 p-4">
        <div className="w-full max-w-[360px] rounded-[2rem] bg-zinc-950 px-6 py-10 text-center shadow-2xl">
          <p className="text-base font-extrabold text-white">Yakında hikaye yok</p>
          <p className="mt-2 text-sm text-white/60">Yalnızca 1 km içindeki firma hikayeleri görünür.</p>
          <button type="button" onClick={onClose} className="mt-5 rounded-2xl bg-mint-500 px-5 py-2.5 text-sm font-extrabold text-white">Kapat</button>
        </div>
      </div>
    );
  }

  if (!story) return null;

  const go = (next: number) => {
    if (next < 0 || next >= stories.length) {
      onClose();
      return;
    }
    setIndex(next);
  };

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/75 p-2 sm:p-4">
      <div
        className="relative h-[min(92dvh,820px)] w-full max-w-[400px] overflow-hidden rounded-[2.15rem] bg-zinc-950 shadow-2xl"
        onPointerDown={(event) => {
          start.current = { x: event.clientX, y: event.clientY };
          setPaused(true);
        }}
        onPointerUp={(event) => {
          setPaused(false);
          const origin = start.current;
          start.current = null;
          if (!origin) return;
          const dx = event.clientX - origin.x;
          const dy = event.clientY - origin.y;
          if (dy > 72 && Math.abs(dy) > Math.abs(dx)) {
            onClose();
            return;
          }
          if (dx < -56) {
            go(index + 1);
            return;
          }
          if (dx > 56) {
            go(index - 1);
            return;
          }
          const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
          const x = event.clientX - box.left;
          if (x < box.width * 0.32) go(index - 1);
          else if (x > box.width * 0.68) go(index + 1);
        }}
        onPointerCancel={() => { start.current = null; setPaused(false); }}
      >
        <img src={story.image_data} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70" />

        <div className="absolute inset-x-3 top-3 z-10 flex gap-1">
          {stories.map((item, i) => (
            <span key={item.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <span
                className={`block h-full origin-left bg-white ${i < index ? 'w-full' : i > index ? 'w-0' : 'w-full'}`}
                style={i === index ? { animation: `storyBar ${HOLD_MS}ms linear`, animationPlayState: paused ? 'paused' : 'running' } : undefined}
              />
            </span>
          ))}
        </div>

        <div className="absolute inset-x-0 top-6 z-10 flex items-center justify-between px-4 pt-2">
          <div className="flex min-w-0 items-center gap-2">
            {story.created_by === 'admin' ? <VipGoldMark className="h-11 w-11 shrink-0" /> : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-white">{story.company_name}</p>
              {story.created_by === 'admin' ? null : (
                <p className="text-[11px] text-white/70">Firma hikayesi</p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/35 text-white" aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-8">
          {story.caption ? <p className="text-[15px] font-bold leading-snug text-white">{story.caption}</p> : null}
          {story.created_by === 'admin' ? null : (
            <p className="mt-2 flex items-center gap-1 text-[11px] text-white/70">
              <MapPin className="h-3.5 w-3.5" />
              1 km içindeki işletme · yana veya aşağı kaydır
            </p>
          )}
        </div>

        <button type="button" className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/20 p-1 text-white/80" onClick={() => go(index - 1)} aria-label="Önceki">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/20 p-1 text-white/80" onClick={() => go(index + 1)} aria-label="Sonraki">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <style>{`@keyframes storyBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }`}</style>
    </div>
  );
}
