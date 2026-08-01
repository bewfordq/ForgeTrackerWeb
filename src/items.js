import rawItems from './data/items.json';
import { parseDurationOrThrow, itemId } from './forge.js';

/**
 * Load and validate the recipe table.
 *
 * Validation is deliberately loud: a typo like "8 Huors", or an abbreviation
 * the parser does not know such as "8h", used to come back as zero seconds and
 * turn into an instantly-complete forge with no warning.
 */
export function loadItems(items = rawItems, { includeDevOnly = false } = {}) {
  const seen = new Set();

  return items
    .filter((item) => includeDevOnly || !item.devOnly)
    .map((item) => {
      const { category, name, duration } = item;

      if (!category || typeof category !== 'string') {
        throw new Error(`Item ${JSON.stringify(name)} is missing a category.`);
      }
      if (!name || typeof name !== 'string') {
        throw new Error(`An item in category ${JSON.stringify(category)} is missing a name.`);
      }

      const id = itemId(category, name);
      if (seen.has(id)) {
        throw new Error(`Duplicate item: ${category} / ${name}`);
      }
      seen.add(id);

      return {
        id,
        category,
        name,
        durationLabel: duration,
        seconds: parseDurationOrThrow(duration, `duration for "${category} / ${name}"`),
      };
    });
}

/** Group items by category, preserving the order they appear in the data file. */
export function groupByCategory(items) {
  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category).push(item);
  }
  return grouped;
}

export { rawItems };
