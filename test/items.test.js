import { describe, it, expect } from 'vitest';
import rawItems from '../src/data/items.json';
import { loadItems, groupByCategory } from '../src/items.js';
import { parseDuration } from '../src/forge.js';

/**
 * Guard rail for the "anyone can add a forge recipe" workflow documented in the
 * README. A malformed duration used to parse as zero seconds and silently
 * produce an instantly-complete forge, so these run over the real data file.
 */
describe('items.json', () => {
  const items = loadItems(rawItems, { includeDevOnly: true });

  it('loads every entry', () => {
    expect(items.length).toBe(rawItems.length);
    expect(items.length).toBeGreaterThan(100);
  });

  it.each(rawItems.map((item) => [`${item.category} / ${item.name}`, item]))(
    'has a parseable, non-zero duration: %s',
    (_label, item) => {
      const seconds = parseDuration(item.duration);
      expect(seconds).not.toBeNull();
      expect(seconds).toBeGreaterThan(0);
    },
  );

  it('has no duplicate category/name pairs', () => {
    const seen = new Map();
    for (const item of rawItems) {
      const key = `${item.category}|${item.name}`;
      expect(seen.has(key), `duplicate entry: ${key}`).toBe(false);
      seen.set(key, true);
    }
  });

  it('gives every item a category and a name', () => {
    for (const item of rawItems) {
      expect(typeof item.category).toBe('string');
      expect(item.category.trim().length).toBeGreaterThan(0);
      expect(typeof item.name).toBe('string');
      expect(item.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('generates unique ids', () => {
    const ids = new Set(items.map((item) => item.id));
    expect(ids.size).toBe(items.length);
  });

  it('hides dev-only entries from production builds', () => {
    const production = loadItems(rawItems, { includeDevOnly: false });
    expect(production.some((item) => item.category === 'Testing')).toBe(false);
    expect(items.some((item) => item.category === 'Testing')).toBe(true);
  });

  it('keeps known reference durations intact', () => {
    const byName = new Map(items.map((item) => [item.name, item]));
    expect(byName.get('Refined Diamond').seconds).toBe(8 * 3600);
    expect(byName.get('Pendant of Divan').seconds).toBe(7 * 86400);
    expect(byName.get('Beacon V').seconds).toBe(2 * 86400 + 2 * 3600);
    expect(byName.get('Titanium Gauntlet').seconds).toBe(4 * 3600 + 1800);
  });
});

describe('loadItems validation', () => {
  it('rejects a malformed duration', () => {
    expect(() => loadItems([{ category: 'Refining', name: 'Widget', duration: '8 Huors' }])).toThrow(
      /Could not parse/,
    );
  });

  it('rejects a missing category', () => {
    expect(() => loadItems([{ name: 'Widget', duration: '1 Hour' }])).toThrow(/category/);
  });

  it('rejects a missing name', () => {
    expect(() => loadItems([{ category: 'Refining', duration: '1 Hour' }])).toThrow(/name/);
  });

  it('rejects duplicates', () => {
    const dupe = { category: 'Refining', name: 'Widget', duration: '1 Hour' };
    expect(() => loadItems([dupe, { ...dupe }])).toThrow(/Duplicate/);
  });
});

describe('groupByCategory', () => {
  it('preserves data-file ordering', () => {
    const grouped = groupByCategory(loadItems(rawItems, { includeDevOnly: true }));
    expect([...grouped.keys()][0]).toBe('Refining');
    expect(grouped.get('Refining')[0].name).toBe('Refined Diamond');
  });

  it('covers every item exactly once', () => {
    const items = loadItems(rawItems, { includeDevOnly: true });
    const grouped = groupByCategory(items);
    const total = [...grouped.values()].reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(items.length);
  });
});
