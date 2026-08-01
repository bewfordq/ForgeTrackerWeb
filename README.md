# Hypixel SkyBlock Forge Tracker (Web Version)

You do not need to download or install anything to use this tool. It is hosted as a live website:

**https://bewfordq.github.io/ForgeTrackerWeb/**

For any issues with the website, message me on any of my socials: https://bewford.gay/

---

## Using the tool

### 1. Configuration

- **Category & Item** — select the item you want to forge from the dropdowns.
- **Quantity** — how many items (1–7, matching the maximum number of forge slots).
- **Quick Forge perk level** — your Heart of the Mountain Quick Forge level, `0`–`20`.
  Leave it at `0` if you have not unlocked the perk. The tool applies the real
  per-level reduction, so you no longer need a maxed perk to get a correct answer
  (see [Quick Forge](#quick-forge) below).
- **Sequential** — enable this when you are queuing several items into a *single*
  forge slot, so they run one after another and the times add up. Leave it off when
  you are filling multiple slots at once, since those finish together.

### 2. Notifications

The tool uses [ntfy.sh](https://ntfy.sh/) for push notifications, with no account required.

1. Install the ntfy app on your phone (https://ntfy.sh/).
2. Tick **Send notifications**.
3. Enter a topic URL, e.g. `https://ntfy.sh/your-topic-name`.
4. Subscribe to that same topic in the ntfy app.
5. Click **Calculate Timer**.

> **Pick your own topic name.** Anyone who knows a topic name can subscribe to it, so
> a shared or guessable name means strangers see your alerts and you see theirs.
> Use something unique.

Notifications are scheduled server-side using ntfy's `X-Delay` header, so you can close
the browser tab and still get the alert.

#### The 3-day scheduling limit

ntfy will only hold a scheduled message for **3 days**
([docs](https://docs.ntfy.sh/publish/#scheduled-delivery)). Anything longer — Pendant of
Divan, the 7-day pets, or a sequential queue that adds up past 3 days — cannot have its
completion alert scheduled up front.

When that happens the tool says so instead of pretending it worked, and offers to send a
check-in nudge at the 3-day mark reminding you to re-open the tracker and schedule the
final alert. (An earlier version silently reported success while ntfy rejected the
request, so long forges never notified at all.)

---

## Quick Forge

Quick Forge does not give a flat 30%. Hypixel's formula is:

```
reduction% = min(30, 10 + level × 0.5 + floor(level / 20) × 10)
```

So level 1 gives 10.5%, level 10 gives 15%, and only level 20 reaches the full 30%.
Enter your actual perk level and the tool does the rest.

Source: [Hypixel SkyBlock Wiki — The Forge](https://wiki.hypixel.net/The_Forge)

---

## Development

The project was originally a Python/tkinter desktop app
([bewfordq/ForgeTracker](https://github.com/bewfordq/ForgeTracker)) and was converted to
a web app to remove the Python requirement. It is a static site — vanilla JavaScript with
no UI framework — built with [Vite](https://vite.dev/) and styled with Tailwind CSS.

### Requirements

Node.js 20 or newer.

### Commands

```bash
npm install     # install dependencies
npm run dev     # local dev server with hot reload
npm test        # run the test suite
npm run build   # production build into dist/
npm run preview # serve the production build locally
```

### Layout

| Path                 | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `index.html`         | Page markup                                                     |
| `src/main.js`        | DOM wiring and event handling                                   |
| `src/forge.js`       | Duration parsing, formatting, Quick Forge maths (pure, tested)  |
| `src/ntfy.js`        | Notification planning and publishing                            |
| `src/items.js`       | Loads and validates the recipe table                            |
| `src/data/items.json`| **The forge recipes**                                           |
| `src/styles.css`     | Tailwind entry point and theme colours                          |
| `test/`              | Vitest suites                                                   |

### Adding or updating forge recipes

Edit `src/data/items.json` and add an entry:

```json
{ "category": "Refining", "name": "New Material", "duration": "4 Hours" }
```

Durations are written as whole words and can be combined: `"30 Seconds"`, `"30 Minutes"`,
`"4 Hours 30 Minutes"`, `"1 Day 6 Hours"`, `"7 Days"`.

Abbreviations like `"4h"` or `"4 Hrs"` are **not** recognised. Previously an unrecognised
duration quietly became a zero-second forge; now it fails loudly, and `npm test` checks
every entry in the file parses to a non-zero duration and that there are no duplicates.
Run `npm test` after editing.

Add `"devOnly": true` to an entry to keep it out of production builds (used for the test
item).

### Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs the tests, builds,
and publishes to GitHub Pages. This requires **Settings → Pages → Source: "GitHub
Actions"**; the published URL is unchanged.

`.github/workflows/ci.yml` runs the tests and a build on every push and pull request.

---

## Support

This is a side project and is open for modification — fork it and change whatever you like.

If you find it useful, consider [supporting on Ko-fi](https://ko-fi.com/bewford), and
consider supporting [ntfy.sh](https://ntfy.sh) as well, since without their product this
project would not be possible.
