import { describe, expect, it } from 'vitest';
import { formatCountdown, secondsRemaining } from './countdown';

describe('countdown', () => {
  it('calculates epoch seconds with a ceiling for partial seconds', () => {
    expect(secondsRemaining(100, 99_001)).toBe(1);
    expect(secondsRemaining(100, 99_000)).toBe(1);
    expect(secondsRemaining(100, 98_999)).toBe(2);
  });

  it('clamps ended auctions to zero', () => {
    expect(secondsRemaining(100, 100_000)).toBe(0);
    expect(secondsRemaining(100, 120_000)).toBe(0);
  });

  it('formats a stable hours-minute-second display', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(3_661)).toBe('01:01:01');
  });
});
