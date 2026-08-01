import './styles.css';
import {
  computeForge,
  formatDuration,
  formatTimer,
  formatCompletion,
  quickForgeReduction,
  clampQuantity,
  MAX_QUICK_FORGE_LEVEL,
} from './forge.js';
import { loadItems, groupByCategory } from './items.js';
import { planNotifications, sendAll, validateTopicUrl } from './ntfy.js';

const $ = (id) => document.getElementById(id);

const els = {
  category: $('categorySelect'),
  item: $('itemSelect'),
  perItemLabel: $('perItemLabel'),
  quantity: $('quantityInput'),
  quickForgeLevel: $('quickForgeLevel'),
  quickForgeLabel: $('quickForgeLabel'),
  sequential: $('sequentialCheck'),
  notify: $('notifyCheck'),
  reminder: $('reminderCheck'),
  topic: $('topicInput'),
  calculate: $('calculateBtn'),
  copy: $('copyBtn'),
  copyFeedback: $('copyFeedback'),
  summaryPlaceholder: $('summaryPlaceholder'),
  summaryContent: $('summaryContent'),
  resItem: $('resItem'),
  resBase: $('resBase'),
  resEffective: $('resEffective'),
  resTotal: $('resTotal'),
  resReady: $('resReady'),
  timerText: $('timerText'),
  progressBar: $('progressBar'),
  progressWrap: $('progressWrap'),
  statusMessage: $('statusMessage'),
  warningBox: $('warningBox'),
};

const itemsById = new Map();
let categories = new Map();
let countdownInterval = null;
let lastResult = null;

// --- Rendering helpers ---

function setStatus(text, tone = 'info') {
  const tones = {
    info: 'text-accent',
    warn: 'text-warning',
    error: 'text-danger',
  };
  els.statusMessage.className = `mt-4 text-sm ${tones[tone]} bg-app p-3 rounded border border-separator`;
  els.statusMessage.textContent = text;
}

function setWarnings(warnings) {
  els.warningBox.innerHTML = '';
  if (!warnings.length) {
    els.warningBox.classList.add('hidden');
    return;
  }
  els.warningBox.classList.remove('hidden');
  for (const warning of warnings) {
    const p = document.createElement('p');
    p.className = 'flex gap-2';
    p.innerHTML = '<span aria-hidden="true">&#9888;</span>';
    p.appendChild(document.createTextNode(warning));
    els.warningBox.appendChild(p);
  }
}

function selectedItem() {
  return itemsById.get(els.item.value) || null;
}

function currentSettings() {
  return {
    quantity: clampQuantity(els.quantity.value),
    quickForgeLevel: Number(els.quickForgeLevel.value) || 0,
    sequential: els.sequential.checked,
  };
}

// --- Population ---

function populateCategories() {
  els.category.innerHTML = '';
  for (const category of categories.keys()) {
    const opt = document.createElement('option');
    opt.value = category;
    opt.textContent = category;
    els.category.appendChild(opt);
  }
}

function populateItems() {
  const items = categories.get(els.category.value) || [];
  els.item.innerHTML = '';
  for (const item of items) {
    const opt = document.createElement('option');
    // A stable id, not an array index: reordering the data file must not
    // silently change which item a selection refers to.
    opt.value = item.id;
    opt.textContent = `${item.name} (${item.durationLabel})`;
    els.item.appendChild(opt);
  }
  updatePerItemLabel();
}

function updateQuickForgeLabel() {
  const level = Number(els.quickForgeLevel.value) || 0;
  const reduction = quickForgeReduction(level);
  els.quickForgeLabel.textContent =
    level > 0 ? `Level ${level} — ${reduction}% faster` : 'Not unlocked — no reduction';
}

function updatePerItemLabel() {
  const item = selectedItem();
  if (!item) {
    els.perItemLabel.textContent = '';
    return;
  }

  const { quickForgeLevel } = currentSettings();
  const { perItemSeconds, reduction } = computeForge({
    baseSeconds: item.seconds,
    quickForgeLevel,
  });

  els.perItemLabel.textContent =
    reduction > 0
      ? `Per item: ${item.durationLabel} → ${formatDuration(perItemSeconds)} (−${reduction}%)`
      : `Per item: ${item.durationLabel}`;
}

function toggleTopicInput() {
  const enabled = els.notify.checked;
  els.topic.disabled = !enabled;
  els.reminder.disabled = !enabled;
  els.topic.classList.toggle('opacity-50', !enabled);
}

// --- Core action ---

async function calculateForge() {
  const item = selectedItem();
  if (!item) {
    setStatus('Pick an item first.', 'warn');
    return;
  }

  const { quantity, quickForgeLevel, sequential } = currentSettings();
  // Reflect any clamping back into the field so the user sees what was used.
  els.quantity.value = String(quantity);

  const result = computeForge({
    baseSeconds: item.seconds,
    quantity,
    quickForgeLevel,
    sequential,
  });

  const now = new Date();
  const completionTime = new Date(now.getTime() + result.totalSeconds * 1000);
  const completionLabel = formatCompletion(completionTime, now);

  els.summaryPlaceholder.classList.add('hidden');
  els.summaryContent.classList.remove('hidden');

  els.resItem.textContent = `${quantity}x ${item.name} (${item.category})`;
  els.resBase.textContent = formatDuration(item.seconds);
  els.resEffective.textContent =
    result.reduction > 0
      ? `${formatDuration(result.perItemSeconds)} (−${result.reduction}%)`
      : formatDuration(result.perItemSeconds);
  els.resTotal.textContent = formatDuration(result.totalSeconds);
  els.resReady.textContent = completionLabel;

  lastResult = {
    itemName: item.name,
    category: item.category,
    quantity,
    sequential,
    quickForgeLevel,
    totalSeconds: result.totalSeconds,
    completionLabel,
  };

  startCountdown(now, completionTime, result.totalSeconds);

  if (!els.notify.checked) {
    setWarnings([]);
    setStatus('Timer started. Notifications are disabled.');
    return;
  }

  const topic = validateTopicUrl(els.topic.value);
  if (!topic.ok) {
    setWarnings([]);
    setStatus(`Timer started, but no notifications sent — ${topic.error}`, 'error');
    return;
  }

  const { messages, warnings } = planNotifications({
    itemName: item.name,
    quantity,
    totalSeconds: result.totalSeconds,
    completionLabel,
    wantReminder: els.reminder.checked,
  });

  setWarnings(warnings);
  setStatus('Timer started. Sending notifications…');

  const { sent, failed } = await sendAll(topic.url, messages);

  if (failed.length === 0) {
    const scheduled = sent.filter((m) => m.delaySeconds > 0).length;
    setStatus(
      scheduled > 0
        ? `Timer started. ${scheduled} notification${scheduled !== 1 ? 's' : ''} scheduled on ntfy.`
        : 'Timer started. Sent the start notification.',
    );
  } else if (sent.length === 0) {
    setStatus(`Timer started, but no notifications were sent. ${failed[0].error}`, 'error');
  } else {
    setStatus(
      `Timer started. ${sent.length} notification${sent.length !== 1 ? 's' : ''} sent, ` +
        `${failed.length} failed: ${failed[0].error}`,
      'warn',
    );
  }
}

function startCountdown(startTime, completionTime, totalSeconds) {
  if (countdownInterval) clearInterval(countdownInterval);

  const startMs = startTime.getTime();
  const totalMs = Math.max(1, totalSeconds * 1000);
  els.progressWrap.setAttribute('aria-valuemax', String(totalSeconds));

  const tick = () => {
    const remainingMs = completionTime.getTime() - Date.now();

    if (remainingMs <= 0) {
      els.timerText.textContent = 'Ready!';
      els.progressBar.style.width = '100%';
      els.progressWrap.setAttribute('aria-valuenow', String(totalSeconds));
      setStatus('Forge complete!');
      clearInterval(countdownInterval);
      countdownInterval = null;
      return;
    }

    const elapsedMs = Date.now() - startMs;
    const percent = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
    els.progressBar.style.width = `${percent}%`;
    els.progressWrap.setAttribute('aria-valuenow', String(Math.floor(elapsedMs / 1000)));
    els.timerText.textContent = formatTimer(remainingMs / 1000);
  };

  tick();
  countdownInterval = setInterval(tick, 1000);
}

async function copySummary() {
  if (!lastResult) return;

  const lines = [
    'Forge Summary',
    `Item: ${lastResult.quantity}x ${lastResult.itemName} (${lastResult.category})`,
    `Total Duration: ${formatDuration(lastResult.totalSeconds)}`,
    `Ready At: ${lastResult.completionLabel}`,
  ];
  if (lastResult.quickForgeLevel > 0) {
    lines.push(`Quick Forge: level ${lastResult.quickForgeLevel}`);
  }
  if (lastResult.sequential) lines.push('Mode: sequential (single slot)');

  const text = lines.join('\n');
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    showCopyFeedback('Copied to clipboard.');
  } catch {
    // Clipboard API needs a secure context and can still be denied.
    showCopyFeedback('Could not copy automatically — select the summary and copy it.', true);
  }
}

let copyFeedbackTimer = null;
function showCopyFeedback(text, isError = false) {
  els.copyFeedback.textContent = text;
  els.copyFeedback.className = `text-xs mt-1 ${isError ? 'text-danger' : 'text-accent'}`;
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = setTimeout(() => {
    els.copyFeedback.textContent = '';
  }, 4000);
}

// --- Init ---

function init() {
  let items;
  try {
    items = loadItems(undefined, { includeDevOnly: import.meta.env.DEV });
  } catch (error) {
    // Bad recipe data should be obvious, not silently produce zero-second forges.
    setStatus(`Could not load forge data: ${error.message}`, 'error');
    console.error(error);
    return;
  }

  for (const item of items) itemsById.set(item.id, item);
  categories = groupByCategory(items);

  els.quickForgeLevel.max = String(MAX_QUICK_FORGE_LEVEL);

  populateCategories();
  populateItems();
  updateQuickForgeLabel();

  els.category.addEventListener('change', populateItems);
  els.item.addEventListener('change', updatePerItemLabel);
  els.quickForgeLevel.addEventListener('input', () => {
    updateQuickForgeLabel();
    updatePerItemLabel();
  });
  els.quantity.addEventListener('change', () => {
    els.quantity.value = String(clampQuantity(els.quantity.value));
  });
  els.notify.addEventListener('change', toggleTopicInput);
  els.calculate.addEventListener('click', calculateForge);
  els.copy.addEventListener('click', copySummary);

  toggleTopicInput();

  window.addEventListener('offline', () => {
    setStatus('You are offline. The calculator still works, but notifications cannot be scheduled.', 'warn');
  });
}

init();
