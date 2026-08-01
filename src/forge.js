/**
 * Pure forge calculation logic. No DOM access — everything here is unit tested
 * in test/forge.test.js.
 */

export const MIN_QUANTITY = 1;
/** The Forge has at most 7 slots once every HotM slot is unlocked. */
export const MAX_QUANTITY = 7;

/** Highest Quick Forge perk level in Heart of the Mountain. */
export const MAX_QUICK_FORGE_LEVEL = 20;

const DURATION_PATTERN = /(\d+(?:\.\d+)?)\s*(seconds?|minutes?|hours?|days?)/gi;

const UNIT_SECONDS = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
};

/**
 * Parse a human duration string ("1 Day 6 Hours") into seconds.
 * Returns null when nothing could be parsed, so callers can tell "malformed"
 * apart from a genuine zero. Use parseDurationOrThrow for recipe data.
 */
export function parseDuration(durationStr) {
  if (typeof durationStr !== 'string') return null;

  DURATION_PATTERN.lastIndex = 0;
  let totalSeconds = 0;
  let matched = false;
  let match;

  while ((match = DURATION_PATTERN.exec(durationStr)) !== null) {
    const amount = parseFloat(match[1]);
    const unit = match[2].toLowerCase().replace(/s$/, '');
    const multiplier = UNIT_SECONDS[unit];
    if (multiplier === undefined) continue;
    totalSeconds += amount * multiplier;
    matched = true;
  }

  return matched ? totalSeconds : null;
}

/**
 * Same as parseDuration but throws on malformed input. Recipe data must never
 * silently become a zero-second forge, so item loading uses this.
 */
export function parseDurationOrThrow(durationStr, context = 'duration') {
  const seconds = parseDuration(durationStr);
  if (seconds === null || seconds <= 0) {
    throw new Error(
      `Could not parse ${context}: ${JSON.stringify(durationStr)}. ` +
        'Expected whole words like "4 Hours" or "1 Day 6 Hours" — ' +
        'abbreviations such as "4h" or "4 Hrs" are not recognised.',
    );
  }
  return seconds;
}

/** Long form: "1 day, 6 hours". */
export function formatDuration(seconds) {
  seconds = Math.floor(seconds);
  if (seconds <= 0) return '0 seconds';

  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  const parts = [];
  if (d > 0) parts.push(`${d} day${d !== 1 ? 's' : ''}`);
  if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
  if (m > 0) parts.push(`${m} minute${m !== 1 ? 's' : ''}`);
  if (s > 0) parts.push(`${s} second${s !== 1 ? 's' : ''}`);
  return parts.join(', ');
}

/** Clock form for the live countdown: "2d 03h 04m 05s" / "03m 05s". */
export function formatTimer(seconds) {
  seconds = Math.max(0, Math.floor(seconds));

  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const pad = (num) => num.toString().padStart(2, '0');
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return `${pad(m)}m ${pad(s)}s`;
}

/**
 * Quick Forge time reduction, as a percentage.
 *
 * Hypixel's formula: min(30, 10 + level * 0.5 + floor(level / 20) * 10)
 * so level 1 gives 10.5% and level 20 gives the full 30%.
 * Source: https://wiki.hypixel.net/The_Forge
 */
export function quickForgeReduction(level) {
  const lvl = Number(level);
  if (!Number.isFinite(lvl) || lvl <= 0) return 0;
  const clamped = Math.min(Math.floor(lvl), MAX_QUICK_FORGE_LEVEL);
  return Math.min(30, 10 + clamped * 0.5 + Math.floor(clamped / 20) * 10);
}

/** Multiplier applied to base forge time, e.g. 0.7 at Quick Forge 20. */
export function quickForgeMultiplier(level) {
  return 1 - quickForgeReduction(level) / 100;
}

export function clampQuantity(value) {
  const qty = Math.floor(Number(value));
  if (!Number.isFinite(qty)) return MIN_QUANTITY;
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, qty));
}

/**
 * Work out the effective and total forge duration.
 *
 * Sequential means one slot running the items back to back, so the times add
 * up. Otherwise the items occupy separate slots and finish together, so the
 * total is a single item's duration.
 */
export function computeForge({ baseSeconds, quantity = 1, quickForgeLevel = 0, sequential = false }) {
  const qty = clampQuantity(quantity);
  const reduction = quickForgeReduction(quickForgeLevel);
  const perItemSeconds = Math.floor(baseSeconds * quickForgeMultiplier(quickForgeLevel));
  const totalSeconds = sequential ? perItemSeconds * qty : perItemSeconds;

  return { quantity: qty, reduction, perItemSeconds, totalSeconds, baseSeconds };
}

/** Stable identifier for an item, used as the <option> value. */
export function itemId(category, name) {
  const slug = (text) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return `${slug(category)}:${slug(name)}`;
}

/**
 * Format a completion timestamp. A bare time of day is ambiguous for anything
 * that does not finish today (a 7 day forge showing "3:15 PM" is misleading),
 * so the date is included whenever the forge crosses midnight.
 */
export function formatCompletion(date, now = new Date()) {
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: sameDay ? undefined : 'medium',
    timeStyle: 'short',
  }).format(date);
}
