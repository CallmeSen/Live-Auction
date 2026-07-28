export const secondsRemaining = (endTime: number, nowMs: number): number =>
  Math.max(0, Math.ceil(endTime - nowMs / 1_000));

export function formatCountdown(totalSeconds: number): string {
  const bounded = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(bounded / 3_600);
  const minutes = Math.floor((bounded % 3_600) / 60);
  const seconds = bounded % 60;
  const clock = [minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
  return hours > 0 ? `${hours.toString().padStart(2, '0')}:${clock}` : clock;
}
