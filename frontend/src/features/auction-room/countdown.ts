export const secondsRemaining = (endTime: number, nowMs: number): number =>
  Math.max(0, Math.ceil(endTime - nowMs / 1_000));

export function formatCountdown(totalSeconds: number): string {
  const bounded = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(bounded / 3_600);
  const minutes = Math.floor((bounded % 3_600) / 60);
  const seconds = bounded % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}p`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}
