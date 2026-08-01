/**
 * ntfy.sh publishing plus the scheduling rules its server enforces.
 *
 * The delay window is the important part: ntfy will only hold a message for a
 * limited time, and it rejects anything outside that window with a 4xx. The
 * previous version of this app ignored the response entirely, so long forges
 * silently never notified. See https://docs.ntfy.sh/publish/#scheduled-delivery
 */

/** ntfy refuses a delay under 10 seconds. */
export const MIN_DELAY_SECONDS = 10;
/** ntfy.sh caps scheduled delivery at 3 days (self-hosted can raise this). */
export const MAX_DELAY_SECONDS = 3 * 24 * 60 * 60;

import { formatDuration } from './forge.js';

export function canScheduleDelay(seconds) {
  return seconds >= MIN_DELAY_SECONDS && seconds <= MAX_DELAY_SECONDS;
}

/** Reject obviously wrong topic URLs before we bother the network. */
export function validateTopicUrl(rawUrl) {
  const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return { ok: false, error: 'Enter an ntfy topic URL.' };

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'That does not look like a URL. Example: https://ntfy.sh/my-topic' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Topic URL must start with https://' };
  }
  if (!url.pathname || url.pathname === '/') {
    return { ok: false, error: 'The URL needs a topic name, e.g. https://ntfy.sh/my-topic' };
  }

  return { ok: true, url: trimmed };
}

/**
 * Decide which notifications to send for a forge run. Pure, so the awkward
 * cases (forges longer than the delay cap, reminders that land too close to
 * now) are covered by tests rather than discovered in production.
 */
export function planNotifications({
  itemName,
  quantity,
  totalSeconds,
  completionLabel,
  wantReminder = false,
  reminderLeadSeconds = 300,
  wantOverflowNudge = true,
}) {
  const messages = [];
  const warnings = [];
  const label = `${quantity}x ${itemName}`;

  messages.push({
    id: 'started',
    title: 'Forge Started',
    body: `Started forging ${label}. Ready at ${completionLabel}.`,
    delaySeconds: 0,
    priority: '3',
  });

  if (totalSeconds > MAX_DELAY_SECONDS) {
    // ntfy cannot hold a message this long, so do not pretend we scheduled one.
    warnings.push(
      `ntfy only schedules alerts up to ${formatDuration(MAX_DELAY_SECONDS)} ahead. ` +
        `This forge takes ${formatDuration(totalSeconds)}, so the completion alert cannot be scheduled yet.`,
    );

    if (wantOverflowNudge) {
      const remaining = totalSeconds - MAX_DELAY_SECONDS;
      messages.push({
        id: 'overflow-nudge',
        title: 'Forge Check-in',
        body:
          `${label} still has about ${formatDuration(remaining)} left. ` +
          'Re-open Forge Tracker to schedule the final alert.',
        delaySeconds: MAX_DELAY_SECONDS,
        priority: '3',
      });
    }
  } else if (totalSeconds < MIN_DELAY_SECONDS) {
    warnings.push(
      `This forge finishes in under ${MIN_DELAY_SECONDS} seconds, which is below ntfy's minimum delay. ` +
        'Use the on-screen countdown instead.',
    );
  } else {
    messages.push({
      id: 'complete',
      title: 'Forge Complete',
      body: `${label} is ready! (${formatDuration(totalSeconds)})`,
      delaySeconds: totalSeconds,
      priority: '5',
    });
  }

  if (wantReminder) {
    const reminderDelay = totalSeconds - reminderLeadSeconds;
    if (canScheduleDelay(reminderDelay)) {
      messages.push({
        id: 'reminder',
        title: 'Forge Reminder',
        body: `${label} ready in ${formatDuration(reminderLeadSeconds)}.`,
        delaySeconds: reminderDelay,
        priority: '3',
      });
    } else if (reminderDelay > 0 && reminderDelay < MIN_DELAY_SECONDS) {
      warnings.push('Skipped the 5-minute reminder: this forge is nearly done already.');
    } else if (reminderDelay <= 0) {
      warnings.push('Skipped the 5-minute reminder: this forge takes less than 5 minutes.');
    }
    // reminderDelay > MAX_DELAY_SECONDS is already covered by the overflow warning.
  }

  return { messages, warnings };
}

/** Turn an ntfy error response into something worth showing a user. */
async function describeFailure(response) {
  if (response.status === 429) {
    return 'ntfy rate limit reached (429). Wait a moment and try again.';
  }

  let detail = '';
  try {
    const body = await response.text();
    if (body) {
      try {
        const parsed = JSON.parse(body);
        detail = parsed.error || parsed.message || body;
      } catch {
        detail = body;
      }
    }
  } catch {
    /* body unavailable — fall back to the status line */
  }

  const trimmed = detail.trim().slice(0, 200);
  return `ntfy returned ${response.status}${trimmed ? `: ${trimmed}` : ''}`;
}

/**
 * POST a single message. Throws on any non-2xx so callers can never report
 * success for a notification the server rejected.
 */
export async function sendNtfy(topicUrl, { title, body, delaySeconds = 0, priority = '3' }, fetchImpl = globalThis.fetch) {
  const headers = { Title: title, Priority: String(priority) };
  if (delaySeconds > 0) headers['X-Delay'] = `${Math.floor(delaySeconds)}s`;

  let response;
  try {
    response = await fetchImpl(topicUrl, { method: 'POST', body, headers });
  } catch (cause) {
    throw new Error('Could not reach the ntfy server (network or CORS error).', { cause });
  }

  if (!response.ok) {
    throw new Error(await describeFailure(response));
  }

  return response;
}

/**
 * Send every planned message, reporting per-message outcomes. Nothing is
 * reported as scheduled unless its POST actually succeeded.
 */
export async function sendAll(topicUrl, messages, fetchImpl = globalThis.fetch) {
  const results = await Promise.allSettled(
    messages.map((message) => sendNtfy(topicUrl, message, fetchImpl)),
  );

  const sent = [];
  const failed = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sent.push(messages[index]);
    } else {
      failed.push({ message: messages[index], error: result.reason?.message || String(result.reason) });
    }
  });

  return { sent, failed };
}
