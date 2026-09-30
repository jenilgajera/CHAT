export function millis(ts: unknown): number {
  if (!ts) {
    return 0;
  }
  if (typeof ts === 'number') {
    return ts;
  }
  if (typeof ts === 'string') {
    const n = Date.parse(ts);
    return Number.isFinite(n) ? n : 0;
  }
  if (ts instanceof Date) {
    return ts.getTime();
  }
  if (typeof ts === 'object' && ts && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'object' && ts && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

export function formatClock(ts: unknown): string {
  const ms = millis(ts);
  if (!ms) {
    return '';
  }
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatListTime(ts: unknown): string {
  const ms = millis(ts);
  if (!ms) {
    return '';
  }
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return formatClock(d);
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function dayKey(ts: unknown): string {
  const ms = millis(ts);
  if (!ms) {
    return '';
  }
  return new Date(ms).toDateString();
}

export function formatDayLabel(ts: unknown): string {
  const ms = millis(ts);
  if (!ms) {
    return '';
  }
  const d = new Date(ms);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (d.toDateString() === yest.toDateString()) {
    return 'Yesterday';
  }
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatLastSeen(ts: unknown, online: boolean): string {
  if (online) {
    return 'online';
  }
  const ms = millis(ts);
  if (!ms) {
    return 'last seen recently';
  }
  return `last seen ${formatListTime(ts)} ${formatClock(ts)}`;
}
