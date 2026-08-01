import { describe, it, expect, vi } from 'vitest';
import {
  planNotifications,
  sendNtfy,
  sendAll,
  validateTopicUrl,
  canScheduleDelay,
  MIN_DELAY_SECONDS,
  MAX_DELAY_SECONDS,
} from '../src/ntfy.js';

const okResponse = () => ({ ok: true, status: 200, text: async () => '' });

const basePlan = {
  itemName: 'Refined Diamond',
  quantity: 1,
  totalSeconds: 8 * 3600,
  completionLabel: '6:00 PM',
};

const byId = (plan, id) => plan.messages.find((m) => m.id === id);

describe('delay window', () => {
  it('matches ntfy limits', () => {
    expect(MIN_DELAY_SECONDS).toBe(10);
    expect(MAX_DELAY_SECONDS).toBe(259200); // 3 days
  });

  it('accepts delays inside the window only', () => {
    expect(canScheduleDelay(10)).toBe(true);
    expect(canScheduleDelay(259200)).toBe(true);
    expect(canScheduleDelay(9)).toBe(false);
    expect(canScheduleDelay(259201)).toBe(false);
  });
});

describe('planNotifications', () => {
  it('always sends an immediate start message', () => {
    const plan = planNotifications(basePlan);
    expect(byId(plan, 'started').delaySeconds).toBe(0);
  });

  it('schedules the completion alert for a normal forge', () => {
    const plan = planNotifications(basePlan);
    const complete = byId(plan, 'complete');
    expect(complete.delaySeconds).toBe(8 * 3600);
    expect(complete.priority).toBe('5');
    expect(plan.warnings).toHaveLength(0);
  });

  it('schedules right up to the 3 day limit', () => {
    const plan = planNotifications({ ...basePlan, totalSeconds: MAX_DELAY_SECONDS });
    expect(byId(plan, 'complete')).toBeDefined();
    expect(plan.warnings).toHaveLength(0);
  });

  it('refuses to schedule a completion alert past the limit', () => {
    // Pendant of Divan and the 7 day pets used to claim success here while
    // ntfy silently rejected the request.
    const plan = planNotifications({ ...basePlan, itemName: 'Pendant of Divan', totalSeconds: 7 * 86400 });
    expect(byId(plan, 'complete')).toBeUndefined();
    expect(plan.warnings.join(' ')).toMatch(/only schedules alerts up to 3 days/);
  });

  it('offers a check-in nudge at the 3 day mark instead', () => {
    const plan = planNotifications({ ...basePlan, totalSeconds: 7 * 86400 });
    const nudge = byId(plan, 'overflow-nudge');
    expect(nudge.delaySeconds).toBe(MAX_DELAY_SECONDS);
    expect(nudge.body).toMatch(/4 days/); // 7 days total minus the 3 day nudge
  });

  it('can leave the nudge out', () => {
    const plan = planNotifications({ ...basePlan, totalSeconds: 7 * 86400, wantOverflowNudge: false });
    expect(byId(plan, 'overflow-nudge')).toBeUndefined();
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('catches sequential runs that overflow the limit', () => {
    // 7x Beacon V run back to back is 14 days 14 hours.
    const total = (2 * 86400 + 2 * 3600) * 7;
    const plan = planNotifications({ ...basePlan, itemName: 'Beacon V', quantity: 7, totalSeconds: total });
    expect(byId(plan, 'complete')).toBeUndefined();
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('warns when a forge is too short to schedule at all', () => {
    const plan = planNotifications({ ...basePlan, totalSeconds: 5 });
    expect(byId(plan, 'complete')).toBeUndefined();
    expect(plan.warnings.join(' ')).toMatch(/below ntfy's minimum delay/);
  });

  describe('5 minute reminder', () => {
    it('schedules ahead of completion', () => {
      const plan = planNotifications({ ...basePlan, wantReminder: true });
      expect(byId(plan, 'reminder').delaySeconds).toBe(8 * 3600 - 300);
    });

    it('is skipped when the forge is shorter than the lead time', () => {
      const plan = planNotifications({ ...basePlan, totalSeconds: 120, wantReminder: true });
      expect(byId(plan, 'reminder')).toBeUndefined();
      expect(plan.warnings.join(' ')).toMatch(/less than 5 minutes/);
    });

    it('is skipped when it would land under the 10 second minimum', () => {
      // The old `reminderDelay > 0` guard let 1-9s through, which ntfy rejects.
      const plan = planNotifications({ ...basePlan, totalSeconds: 305, wantReminder: true });
      expect(byId(plan, 'reminder')).toBeUndefined();
      expect(plan.warnings.join(' ')).toMatch(/nearly done/);
    });

    it('is not scheduled at all for an over-limit forge', () => {
      const plan = planNotifications({ ...basePlan, totalSeconds: 7 * 86400, wantReminder: true });
      expect(byId(plan, 'reminder')).toBeUndefined();
    });
  });
});

describe('validateTopicUrl', () => {
  it('accepts a normal topic', () => {
    expect(validateTopicUrl('https://ntfy.sh/my-topic')).toEqual({
      ok: true,
      url: 'https://ntfy.sh/my-topic',
    });
  });

  it('strips trailing slashes and whitespace', () => {
    expect(validateTopicUrl('  https://ntfy.sh/my-topic//  ').url).toBe('https://ntfy.sh/my-topic');
  });

  it('rejects empty input', () => {
    expect(validateTopicUrl('').ok).toBe(false);
    expect(validateTopicUrl(undefined).ok).toBe(false);
  });

  it('rejects non-URLs', () => {
    expect(validateTopicUrl('my-topic').ok).toBe(false);
  });

  it('rejects a URL with no topic name', () => {
    expect(validateTopicUrl('https://ntfy.sh').ok).toBe(false);
    expect(validateTopicUrl('https://ntfy.sh/').ok).toBe(false);
  });

  it('accepts self-hosted servers', () => {
    expect(validateTopicUrl('https://ntfy.example.com/forge').ok).toBe(true);
  });
});

describe('sendNtfy', () => {
  it('posts the body with title and priority headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    await sendNtfy(
      'https://ntfy.sh/t',
      { title: 'Forge Complete', body: 'ready', delaySeconds: 3600, priority: '5' },
      fetchImpl,
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://ntfy.sh/t');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('ready');
    expect(init.headers.Title).toBe('Forge Complete');
    expect(init.headers.Priority).toBe('5');
    expect(init.headers['X-Delay']).toBe('3600s');
  });

  it('omits X-Delay for immediate messages', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    await sendNtfy('https://ntfy.sh/t', { title: 'T', body: 'b', delaySeconds: 0 }, fetchImpl);
    expect(fetchImpl.mock.calls[0][1].headers['X-Delay']).toBeUndefined();
  });

  it('throws on a rejected request instead of resolving silently', async () => {
    // This is the bug that hid every failed schedule: res.ok was never checked.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ code: 40007, error: 'delay cannot be higher than 3 days' }),
    });
    await expect(sendNtfy('https://ntfy.sh/t', { title: 'T', body: 'b' }, fetchImpl)).rejects.toThrow(
      /delay cannot be higher than 3 days/,
    );
  });

  it('reports rate limiting distinctly', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => '' });
    await expect(sendNtfy('https://ntfy.sh/t', { title: 'T', body: 'b' }, fetchImpl)).rejects.toThrow(
      /rate limit/i,
    );
  });

  it('reports network failures', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sendNtfy('https://ntfy.sh/t', { title: 'T', body: 'b' }, fetchImpl)).rejects.toThrow(
      /Could not reach the ntfy server/,
    );
  });
});

describe('sendAll', () => {
  it('separates sent from failed messages', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'nope' });

    const { sent, failed } = await sendAll(
      'https://ntfy.sh/t',
      [
        { id: 'a', title: 'A', body: 'a' },
        { id: 'b', title: 'B', body: 'b' },
      ],
      fetchImpl,
    );

    expect(sent.map((m) => m.id)).toEqual(['a']);
    expect(failed).toHaveLength(1);
    expect(failed[0].message.id).toBe('b');
    expect(failed[0].error).toMatch(/400/);
  });

  it('reports everything sent when all succeed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const { sent, failed } = await sendAll('https://ntfy.sh/t', [{ id: 'a', title: 'A', body: 'a' }], fetchImpl);
    expect(sent).toHaveLength(1);
    expect(failed).toHaveLength(0);
  });
});
