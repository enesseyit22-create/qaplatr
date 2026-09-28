import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type LiveChange = {
  table: string;
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export function subscribeTables(tables: string[], onChange: (change?: LiveChange) => void) {
  if (!isSupabaseConfigured || tables.length === 0) return () => {};

  let timer: number | null = null;
  let retry: number | null = null;
  let stopped = false;
  let channel: RealtimeChannel | null = null;

  const ping = (change?: LiveChange) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => onChange(change), change ? 30 : 160);
  };

  const start = () => {
    if (stopped) return;
    if (channel) void supabase.removeChannel(channel);
    channel = supabase.channel(`live:${tables.join(',')}:${crypto.randomUUID()}`);
    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          ping({
            table,
            eventType: String(payload.eventType ?? '*'),
            new: (payload.new as Record<string, unknown> | null) ?? null,
            old: (payload.old as Record<string, unknown> | null) ?? null,
          });
        },
      );
    }
    void channel.subscribe((status) => {
      if (stopped) return;
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (retry) window.clearTimeout(retry);
        retry = window.setTimeout(start, 1800);
      }
    });
  };

  start();

  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    if (retry) window.clearTimeout(retry);
    if (channel) void supabase.removeChannel(channel);
    channel = null;
  };
}
