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

  it('switches from seconds to minutes and hours at the display boundaries', () => {
    expect(formatCountdown(0)).toBe('0s');
    expect(formatCountdown(59)).toBe('59s');
    expect(formatCountdown(60)).toBe('1p');
    expect(formatCountdown(65)).toBe('1p 5s');
    expect(formatCountdown(3_599)).toBe('59p 59s');
    expect(formatCountdown(3_600)).toBe('1h');
    expect(formatCountdown(3_661)).toBe('1h 1p 1s');
  });
});
