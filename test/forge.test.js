import { describe, it, expect } from 'vitest';
import {
  parseDuration,
  parseDurationOrThrow,
  formatDuration,
  formatTimer,
  quickForgeReduction,
  quickForgeMultiplier,
  clampQuantity,
  computeForge,
  itemId,
  formatCompletion,
} from '../src/forge.js';

describe('parseDuration', () => {
  it('parses each unit', () => {
    expect(parseDuration('30 Seconds')).toBe(30);
    expect(parseDuration('30 Minutes')).toBe(1800);
    expect(parseDuration('8 Hours')).toBe(28800);
    expect(parseDuration('3 Days')).toBe(259200);
  });

  it('handles singular and plural forms', () => {
    expect(parseDuration('1 Hour')).toBe(3600);
    expect(parseDuration('1 Day')).toBe(86400);
    expect(parseDuration('1 second')).toBe(1);
  });

  it('sums compound durations', () => {
    expect(parseDuration('1 Day 6 Hours')).toBe(86400 + 21600);
    expect(parseDuration('4 Hours 30 Minutes')).toBe(14400 + 1800);
    expect(parseDuration('2 Days 2 Hours')).toBe(172800 + 7200);
  });

  it('is case insensitive and tolerates spacing', () => {
    expect(parseDuration('8HOURS')).toBe(28800);
    expect(parseDuration('  8   hours  ')).toBe(28800);
  });

  it('accepts decimals', () => {
    expect(parseDuration('1.5 Hours')).toBe(5400);
  });

  it('returns null rather than 0 for unparseable input', () => {
    // The old code returned 0 here, which silently became an instant forge.
    expect(parseDuration('8 Huors')).toBe(null); // typo'd unit
    expect(parseDuration('8 Hrs')).toBe(null); // abbreviation
    expect(parseDuration('8h')).toBe(null);
    expect(parseDuration('eight hours')).toBe(null);
    expect(parseDuration('soon')).toBe(null);
    expect(parseDuration('')).toBe(null);
    expect(parseDuration(undefined)).toBe(null);
    expect(parseDuration(42)).toBe(null);
  });

  it('ignores trailing junk after a valid unit', () => {
    expect(parseDuration('8 Hour s')).toBe(28800);
  });

  it('is not affected by regex state across calls', () => {
    expect(parseDuration('8 Hours')).toBe(28800);
    expect(parseDuration('8 Hours')).toBe(28800);
    expect(parseDuration('8 Hours')).toBe(28800);
  });
});

describe('parseDurationOrThrow', () => {
  it('returns seconds for valid input', () => {
    expect(parseDurationOrThrow('6 Hours')).toBe(21600);
  });

  it('throws with context for malformed input', () => {
    expect(() => parseDurationOrThrow('8 Huors', 'duration for "Refining / Widget"')).toThrow(
      /Refining \/ Widget/,
    );
  });
});

describe('formatDuration', () => {
  it('handles zero and negatives', () => {
    expect(formatDuration(0)).toBe('0 seconds');
    expect(formatDuration(-5)).toBe('0 seconds');
  });

  it('uses singular and plural correctly', () => {
    expect(formatDuration(1)).toBe('1 second');
    expect(formatDuration(2)).toBe('2 seconds');
    expect(formatDuration(3600)).toBe('1 hour');
    expect(formatDuration(86400)).toBe('1 day');
  });

  it('omits empty units', () => {
    expect(formatDuration(86400 + 60)).toBe('1 day, 1 minute');
  });

  it('handles the day boundary', () => {
    expect(formatDuration(86399)).toBe('23 hours, 59 minutes, 59 seconds');
  });

  it('round-trips forge durations', () => {
    expect(formatDuration(parseDuration('1 Day 6 Hours'))).toBe('1 day, 6 hours');
  });
});

describe('formatTimer', () => {
  it('drops the hour segment under an hour', () => {
    expect(formatTimer(65)).toBe('01m 05s');
  });

  it('shows hours when present', () => {
    expect(formatTimer(3725)).toBe('1h 02m 05s');
  });

  it('shows days for long forges', () => {
    // 7 days used to render as "168h 00m 00s".
    expect(formatTimer(7 * 86400)).toBe('7d 00h 00m 00s');
  });

  it('clamps negatives to zero', () => {
    expect(formatTimer(-10)).toBe('00m 00s');
  });
});

describe('quickForgeReduction', () => {
  it('is zero when the perk is not unlocked', () => {
    expect(quickForgeReduction(0)).toBe(0);
    expect(quickForgeReduction(-1)).toBe(0);
    expect(quickForgeReduction(undefined)).toBe(0);
  });

  it('follows min(30, 10 + level*0.5 + floor(level/20)*10)', () => {
    expect(quickForgeReduction(1)).toBe(10.5);
    expect(quickForgeReduction(10)).toBe(15);
    expect(quickForgeReduction(19)).toBe(19.5);
    expect(quickForgeReduction(20)).toBe(30);
  });

  it('clamps above max level', () => {
    expect(quickForgeReduction(50)).toBe(30);
  });

  it('matches the old hardcoded 0.7 multiplier at max level', () => {
    expect(quickForgeMultiplier(20)).toBeCloseTo(0.7, 10);
    expect(quickForgeMultiplier(0)).toBe(1);
  });
});

describe('clampQuantity', () => {
  it('keeps values within the seven forge slots', () => {
    expect(clampQuantity(1)).toBe(1);
    expect(clampQuantity(7)).toBe(7);
    expect(clampQuantity(999)).toBe(7); // used to be accepted verbatim
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-3)).toBe(1);
  });

  it('falls back to 1 for junk input', () => {
    expect(clampQuantity('abc')).toBe(1);
    expect(clampQuantity('')).toBe(1);
    expect(clampQuantity(NaN)).toBe(1);
  });

  it('truncates fractional quantities', () => {
    expect(clampQuantity(3.9)).toBe(3);
  });
});

describe('computeForge', () => {
  const base = 28800; // 8 hours

  it('treats parallel slots as a single item duration', () => {
    const r = computeForge({ baseSeconds: base, quantity: 4, sequential: false });
    expect(r.totalSeconds).toBe(base);
  });

  it('adds up sequential runs', () => {
    const r = computeForge({ baseSeconds: base, quantity: 4, sequential: true });
    expect(r.totalSeconds).toBe(base * 4);
  });

  it('applies the Quick Forge reduction per item', () => {
    const r = computeForge({ baseSeconds: base, quantity: 2, quickForgeLevel: 20, sequential: true });
    expect(r.perItemSeconds).toBe(20160); // 28800 * 0.7
    expect(r.totalSeconds).toBe(40320);
    expect(r.reduction).toBe(30);
  });

  it('applies partial reductions at lower perk levels', () => {
    const r = computeForge({ baseSeconds: base, quickForgeLevel: 1 });
    expect(r.reduction).toBe(10.5);
    expect(r.perItemSeconds).toBe(Math.floor(base * 0.895));
  });

  it('clamps the quantity it was given', () => {
    const r = computeForge({ baseSeconds: base, quantity: 999, sequential: true });
    expect(r.quantity).toBe(7);
    expect(r.totalSeconds).toBe(base * 7);
  });
});

describe('itemId', () => {
  it('produces stable slugs', () => {
    expect(itemId('Drill Parts', 'Mithril Drill SX-R226')).toBe('drill-parts:mithril-drill-sx-r226');
    expect(itemId('Forging', "Divan's Powder Coating")).toBe('forging:divan-s-powder-coating');
  });

  it('is distinct for distinct items', () => {
    expect(itemId('Gear', 'Titanium Ring')).not.toBe(itemId('Gear', 'Titanium Relic'));
  });
});

describe('formatCompletion', () => {
  it('omits the date when the forge finishes today', () => {
    const now = new Date('2026-03-01T10:00:00');
    const done = new Date('2026-03-01T18:00:00');
    expect(formatCompletion(done, now)).not.toMatch(/Mar/);
  });

  it('includes the date when the forge crosses midnight', () => {
    // A 7 day forge showing only a time of day is ambiguous.
    const now = new Date('2026-03-01T10:00:00');
    const done = new Date('2026-03-08T10:00:00');
    expect(formatCompletion(done, now)).toMatch(/Mar/);
  });
});
