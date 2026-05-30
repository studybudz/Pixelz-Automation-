const API_BASE = '/api';
const state = {
  userConfig: null,
  initData: '',
  systemStatus: null
};

const el = (id) => document.getElementById(id);
const hasEl = (id) => Boolean(el(id));

const setText = (id, value) => {
  const node = el(id);
  if (node) {
    node.textContent = value;
  }
};

const setValue = (id, value) => {
  const node = el(id);
  if (node) {
    node.value = value ?? '';
  }
};

const setChecked = (id, value) => {
  const node = el(id);
  if (node) {
    node.checked = Boolean(value);
  }
};

const normalizeConfig = (config = {}) => ({
  ...config,
  automationDays: Array.isArray(config.automationDays) ? config.automationDays : [0, 1, 2, 3, 4, 5, 6],
  routingKeywords: Array.isArray(config.routingKeywords)
    ? config.routingKeywords
    : String(config.routingKeywords || 'human, agent, help')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
  customKeywordReplies: Array.isArray(config.customKeywordReplies)
    ? config.customKeywordReplies.map((pair) => ({ keyword: pair.keyword || '', reply: pair.reply || '' }))
    : [],
  businessHours: config.businessHours || { start: 0, end: 24 },
  replyWindowMode: config.replyWindowMode || 'draft'
});

const updateStatusChip = (id, label, tone) => {
  const node = el(id);
  if (!node) return;
  node.textContent = label;
  node.classList.remove('is-good', 'is-warn', 'is-bad');
  if (tone) {
    node.classList.add(tone);
  }
};

const initTelegramBridge = () => {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    state.initData = tg.initData || '';
    try {
      tg.setHeaderColor('secondary_bg_color');
    } catch (_) {}
  }
};

const initDaySelectors = () => {
  const container = el('daysSelector');
  const tpl = el('dayBtnTpl');
  if (!container || !tpl) return;

  if (container.childElementCount > 0) return;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  days.forEach((day, index) => {
    const clone = tpl.content.cloneNode(true);
    clone.querySelector('div').innerText = day;
    clone.querySelector('input').value = index;
    container.appendChild(clone);
  });
};

const bindPageEvents = () => {
  el('btnAcceptPrivacy')?.addEventListener('click', commitPrivacyAcceptance);
  el('btnSaveConfig')?.addEventListener('click', saveSystemConfiguration);
  el('btnRefreshStatus')?.addEventListener('click', loadSystemStatus);
  el('btnReconnectWebhook')?.addEventListener('click', reconnectWebhook);
  el('btnAddPair')?.addEventListener('click', () => addKeywordPair());
  el('toggleAwayMessage')?.addEventListener('change', (event) => {
    const container = el('awayMessageContainer');
    if (!container) return;
    container.classList.toggle('hidden', !event.target.checked);
  });
};

async function bootstrapSession() {
  try {
    let payload = null;

    if (state.initData) {
      const verifyResponse = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: state.initData })
      });
      payload = await verifyResponse.json();
    }

    if (!payload?.success) {
      const fallbackResponse = await fetch(`${API_BASE}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      payload = await fallbackResponse.json();
    }

    if (!payload?.success) {
      throw new Error(payload?.error || 'Unable to load session');
    }

    state.userConfig = normalizeConfig(payload.config);

    setText('userIdDisplay', state.userConfig.telegramUserId);
    evaluatePrivacyGuard(state.userConfig.hasAcceptedTerms);
    syncConfigurationControls();
    await refreshPages();
  } catch (error) {
    console.error('[Bootstrap Error]', error);
  }
}

async function refreshPages() {
  await loadSystemStatus();
  await fetchAnalytics();
  await executeQueueSync();
  await executeTemplateIngestion();
}

function evaluatePrivacyGuard(hasAccepted) {
  const modal = el('privacyModal');
  if (!modal) return;
  modal.classList.toggle('hidden', Boolean(hasAccepted));
}

async function commitPrivacyAcceptance() {
  if (!state.userConfig?.telegramUserId) return;

  try {
    const response = await fetch(`${API_BASE}/privacy/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramUserId: state.userConfig.telegramUserId })
    });
    const payload = await response.json();
    if (payload.success) {
      state.userConfig = normalizeConfig(payload.config);
      evaluatePrivacyGuard(true);
      updateStatusChip('chipPrivacy', 'Privacy: accepted', 'is-good');
    }
  } catch (error) {
    console.error('[Privacy Error]', error);
  }
}

function syncConfigurationControls() {
  if (!state.userConfig) return;

  setChecked('toggleDataLearning', state.userConfig.isDataLearningEnabled);
  setValue('selectAutomationMode', state.userConfig.automationMode || 'draft');
  setValue('selectReplyWindowMode', state.userConfig.replyWindowMode || 'draft');
  setValue('selectTone', state.userConfig.aiTone || 'Professional');
  setValue('customPromptArea', state.userConfig.customSystemPrompt || '');
  setValue('businessStart', state.userConfig.businessHours?.start ?? 0);
  setValue('businessEnd', state.userConfig.businessHours?.end ?? 24);
  setValue('routingKeywords', (state.userConfig.routingKeywords || []).join(', '));
  setChecked('toggleAwayMessage', state.userConfig.isAwayMessageEnabled);
  setValue('awayMessageText', state.userConfig.awayMessageText || '');

  const dayChecks = document.querySelectorAll('input[name="automationDays"]');
  const activeDays = state.userConfig.automationDays || [0, 1, 2, 3, 4, 5, 6];
  dayChecks.forEach((checkbox) => {
    checkbox.checked = activeDays.includes(Number(checkbox.value));
  });

  const keywordPairsContainer = el('keywordPairsContainer');
  if (keywordPairsContainer) {
    keywordPairsContainer.innerHTML = '';
    (state.userConfig.customKeywordReplies || []).forEach((pair) => addKeywordPair(pair.keyword, pair.reply));
  }

  const awayContainer = el('awayMessageContainer');
  if (awayContainer) {
    awayContainer.classList.toggle('hidden', !state.userConfig.isAwayMessageEnabled);
  }
}

async function loadSystemStatus() {
  if (!hasEl('chipWebhook') && !hasEl('webhookUrlDisplay') && !hasEl('statusSubtitle')) return;

  try {
    const response = await fetch(`${API_BASE}/system/status`);
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || 'Unable to load system status');
    }

    state.systemStatus = payload;
    setText('botUsernameDisplay', payload.bot?.username ? `@${payload.bot.username}` : 'not connected');
    setText('webhookUrlDisplay', payload.webhook?.url || 'not set');
    setText('businessModeDisplay', payload.bot?.canConnectToBusiness ? 'enabled' : 'disabled');
    setText('guestModeDisplay', payload.bot?.supportsGuestQueries ? 'enabled' : 'disabled');

    updateStatusChip('chipWebhook', payload.webhook?.url ? 'Webhook: live' : 'Webhook: missing', payload.webhook?.url ? 'is-good' : 'is-bad');
    updateStatusChip('chipBusiness', payload.bot?.canConnectToBusiness ? 'Business: ready' : 'Business: limited', payload.bot?.canConnectToBusiness ? 'is-good' : 'is-warn');
    updateStatusChip('chipGuest', payload.bot?.supportsGuestQueries ? 'Guest: ready' : 'Guest: unavailable', payload.bot?.supportsGuestQueries ? 'is-good' : 'is-warn');
    updateStatusChip('chipPrivacy', state.userConfig?.hasAcceptedTerms ? 'Privacy: accepted' : 'Privacy: pending', state.userConfig?.hasAcceptedTerms ? 'is-good' : 'is-warn');

    setText(
      'statusSubtitle',
      payload.webhook?.url
        ? 'Telegram is connected and ready to accept business, guest, and bot updates.'
        : 'Telegram is not connected yet. Reconnect the webhook before testing live chats.'
    );
  } catch (error) {
    console.error('[Status Error]', error);
    updateStatusChip('chipWebhook', 'Webhook: offline', 'is-bad');
    updateStatusChip('chipBusiness', 'Business: unknown', 'is-warn');
    updateStatusChip('chipGuest', 'Guest: unknown', 'is-warn');
  }
}

async function reconnectWebhook() {
  try {
    const response = await fetch(`${API_BASE}/system/register-webhook`, { method: 'POST' });
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || 'Webhook registration failed');
    }

    await loadSystemStatus();
    alert('Webhook reconnected successfully.');
  } catch (error) {
    console.error('[Webhook Error]', error);
    alert('Webhook registration failed. Check the server logs and WEBAPP_URL.');
  }
}

async function saveSystemConfiguration() {
  if (!state.userConfig?.telegramUserId) return;

  try {
    const payload = {
      telegramUserId: state.userConfig.telegramUserId,
      isDataLearningEnabled: el('toggleDataLearning')?.checked || false,
      automationMode: el('selectAutomationMode')?.value || 'draft',
      replyWindowMode: el('selectReplyWindowMode')?.value || 'draft',
      aiTone: el('selectTone')?.value || 'Professional',
      customSystemPrompt: el('customPromptArea')?.value || '',
      businessHours: {
        start: Number.parseInt(el('businessStart')?.value || '0', 10),
        end: Number.parseInt(el('businessEnd')?.value || '24', 10)
      },
      isAwayMessageEnabled: el('toggleAwayMessage')?.checked || false,
      awayMessageText: el('awayMessageText')?.value || '',
      routingKeywords: (el('routingKeywords')?.value || '')
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      automationDays: Array.from(document.querySelectorAll('input[name="automationDays"]:checked')).map((checkbox) => Number(checkbox.value)),
      customKeywordReplies: Array.from(document.querySelectorAll('.kw-pair')).map((row) => ({
        keyword: row.querySelector('.kw-input')?.value?.toLowerCase().trim() || '',
        reply: row.querySelector('.reply-input')?.value?.trim() || ''
      })).filter((pair) => pair.keyword && pair.reply)
    };

    const response = await fetch(`${API_BASE}/config/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (data.success) {
      state.userConfig = normalizeConfig(data.config);
      syncConfigurationControls();
      updateStatusChip('chipPrivacy', state.userConfig.hasAcceptedTerms ? 'Privacy: accepted' : 'Privacy: pending', state.userConfig.hasAcceptedTerms ? 'is-good' : 'is-warn');
      alert('Your settings have been saved.');
    }
  } catch (error) {
    console.error('[Config Error]', error);
  }
}

function addKeywordPair(keyword = '', reply = '') {
  const container = el('keywordPairsContainer');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'kw-pair bg-white/80 p-3 rounded-xl border border-slate-200 space-y-2';
  row.innerHTML = `
    <div class="flex gap-2">
      <input type="text" placeholder="Keyword" class="kw-input flex-1 bg-[#06030a] border border-purple-900/30 rounded-lg p-2 text-[11px] text-gray-300 focus:outline-none" value="${keyword}">
      <button type="button" class="text-red-400 text-xs px-2" data-remove-pair>x</button>
    </div>
    <textarea placeholder="Auto-reply text..." class="reply-input w-full bg-[#06030a] border border-purple-900/30 rounded-lg p-2 text-[11px] text-gray-300 focus:outline-none" rows="2">${reply}</textarea>
  `;

  row.querySelector('[data-remove-pair]')?.addEventListener('click', () => row.remove());
  container.appendChild(row);
}

async function executeTemplateIngestion() {
  const container = el('presetsContainer');
  if (!container) return;

  try {
    const response = await fetch(`${API_BASE}/config/templates`);
    const payload = await response.json();
    if (payload.success) {
      container.innerHTML = '';
      payload.templates.forEach((template) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'p-3 bg-white/90 border border-slate-200 rounded-xl cursor-pointer hover:border-purple-300 transition text-left';
        card.innerHTML = `
          <h4 class="text-sm font-bold text-slate-900">${template.title}</h4>
          <p class="text-[11px] text-slate-600 mt-0.5">${template.description}</p>
        `;
        card.addEventListener('click', () => {
          setValue('customPromptArea', template.systemPrompt);
        });
        container.appendChild(card);
      });
    }
  } catch (error) {
    console.error('[Template Error]', error);
  }
}

async function fetchAnalytics() {
  if (!hasEl('resRate')) return;

  try {
    const response = await fetch(`${API_BASE}/analytics/${state.userConfig.telegramUserId}`);
    const payload = await response.json();
    if (payload.success) {
      setText('resRate', `${payload.stats.resolutionRate}%`);
      setText('avgResp', payload.stats.avgResponseTime);
      setText('totalInt', payload.stats.totalInteractions);
      setText('escRate', `${payload.stats.escalationRate}%`);
      setText('activeThr', payload.stats.activeThreads);
    }
  } catch (error) {
    console.error('[Analytics Error]', error);
  }
}

async function executeQueueSync() {
  const container = el('queueContainer');
  if (!container || !state.userConfig?.telegramUserId) return;

  try {
    const response = await fetch(`${API_BASE}/drafts/${state.userConfig.telegramUserId}`);
    const payload = await response.json();
    container.innerHTML = '';

    if (payload.success && payload.drafts.length > 0) {
      payload.drafts.forEach((draft) => {
        const card = document.createElement('div');
        card.className = 'bg-white/90 border border-slate-200 p-4 rounded-xl space-y-3 glass-card text-left';
        card.innerHTML = `
          <div class="flex justify-between items-center border-b border-slate-200 pb-2">
            <span class="text-xs font-bold text-slate-900">${draft.customerName}</span>
            <span class="text-[10px] uppercase tracking-wider bg-purple-50 px-2 py-0.5 rounded text-purple-700 border border-purple-100">${draft.category}</span>
          </div>
          <div class="text-xs space-y-1">
            <p class="text-slate-600"><strong class="text-slate-500 text-[10px] uppercase tracking-wider">In:</strong> ${draft.incomingMessage}</p>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase tracking-wider text-purple-600 font-bold">Draft Action Reply</label>
              <div class="flex gap-2 mb-1">
                <button type="button" onclick="insertSnippet('${draft._id}', 'Check Pricing')" class="text-[9px] bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">Pricing</button>
                <button type="button" onclick="insertSnippet('${draft._id}', 'View Catalog')" class="text-[9px] bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">Catalog</button>
              </div>
              <textarea id="tx-${draft._id}" class="w-full rounded-lg p-2 text-xs focus:outline-none focus:border-purple-500 transition font-sans" rows="2">${draft.aiSuggestedReply}</textarea>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" onclick="dispatchQueueAction('${draft._id}', 'rejected')" class="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition">Drop</button>
            <button type="button" onclick="dispatchQueueAction('${draft._id}', 'approved')" class="text-xs px-4 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition font-semibold">Deploy</button>
          </div>
        `;
        container.appendChild(card);
      });
    } else {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center pt-16 text-center px-6">
          <div class="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4 border border-purple-100">
            <span class="text-2xl text-purple-600">inbox</span>
          </div>
          <p class="text-slate-700 text-sm font-semibold">System Standby</p>
          <p class="text-slate-500 text-[11px] mt-2 leading-relaxed max-w-[200px]">
            Waiting for incoming messages. Check your business connection or guest mode settings.
          </p>
        </div>`;
    }
  } catch (error) {
    console.error('[Queue Error]', error);
  }
}

async function dispatchQueueAction(draftId, action) {
  try {
    const modifiedText = el(`tx-${draftId}`)?.value || '';
    const response = await fetch(`${API_BASE}/drafts/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId, action, modifiedText })
    });
    const payload = await response.json();
    if (payload.success) {
      await executeQueueSync();
    }
  } catch (error) {
    console.error('[Draft Action Error]', error);
  }
}

function insertSnippet(draftId, snippet) {
  const textarea = el(`tx-${draftId}`);
  if (textarea) {
    textarea.value += (textarea.value ? ' ' : '') + snippet;
  }
}

window.addKeywordPair = addKeywordPair;
window.dispatchQueueAction = dispatchQueueAction;
window.insertSnippet = insertSnippet;

document.addEventListener('DOMContentLoaded', async () => {
  initTelegramBridge();
  initDaySelectors();
  bindPageEvents();
  await bootstrapSession();
});
