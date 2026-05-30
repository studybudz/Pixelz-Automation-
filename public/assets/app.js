const API_BASE = '/api';
let systemUserConfig = null;
let telegramInitDataRaw = "";
let systemStatus = null;

// Core System Boots & Verification Sequence
document.addEventListener('DOMContentLoaded', async () => {
  initDaySelectors();
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    telegramInitDataRaw = tg.initData || "";
    
    // Fallback profile definition for isolated tracking sandboxes
    if (!telegramInitDataRaw) {
      telegramInitDataRaw = "user=%7B%22id%22%3A999999%2C%22first_name%22%3A%22Developer%22%2C%22username%22%3A%22dev_node%22%7D&hash=mock_hash";
    }

    tg.setHeaderColor('secondary_bg_color');
    tg.expand();
  }

  await executeCryptographicHandshake();
  
  // Attach DOM Interaction Framework Events
  document.getElementById('btnAcceptPrivacy').addEventListener('click', commitPrivacyAcceptance);
  document.getElementById('btnSaveConfig').addEventListener('click', saveSystemConfiguration);
  document.getElementById('btnRefreshStatus').addEventListener('click', loadSystemStatus);
  document.getElementById('btnReconnectWebhook').addEventListener('click', reconnectWebhook);
  document.getElementById('toggleAwayMessage').addEventListener('change', (e) => {
    const container = document.getElementById('awayMessageContainer');
    e.target.checked ? container.classList.remove('hidden') : container.classList.add('hidden');
  });
});

function initDaySelectors() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const container = document.getElementById('daysSelector');
  const tpl = document.getElementById('dayBtnTpl');
  days.forEach((day, index) => {
    const clone = tpl.content.cloneNode(true);
    clone.querySelector('div').innerText = day;
    clone.querySelector('input').value = index;
    container.appendChild(clone);
  });
}

function normalizeConfig(config) {
  return {
    ...config,
    automationDays: Array.isArray(config?.automationDays) ? config.automationDays : [0, 1, 2, 3, 4, 5, 6],
    routingKeywords: Array.isArray(config?.routingKeywords) ? config.routingKeywords : (config?.routingKeywords || 'human, agent, help').split(',').map((item) => item.trim()).filter(Boolean),
    customKeywordReplies: Array.isArray(config?.customKeywordReplies)
      ? config.customKeywordReplies.map((pair) => ({ keyword: pair.keyword || '', reply: pair.reply || '' }))
      : [],
    businessHours: config?.businessHours || { start: 0, end: 24 }
  };
}

function updateStatusChip(elementId, label, tone) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = label;
  element.classList.remove('is-good', 'is-warn', 'is-bad');
  if (tone) {
    element.classList.add(tone);
  }
}

async function loadSystemStatus() {
  try {
    const res = await fetch(`${API_BASE}/system/status`);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Unable to load system status');
    }

    systemStatus = data;
    const botUser = data.bot?.username ? `@${data.bot.username}` : 'not connected';
    document.getElementById('botUsernameDisplay').innerText = botUser;
    document.getElementById('webhookUrlDisplay').innerText = data.webhook?.url || 'not set';
    document.getElementById('businessModeDisplay').innerText = data.bot?.canConnectToBusiness ? 'enabled' : 'disabled';
    document.getElementById('guestModeDisplay').innerText = data.bot?.supportsGuestQueries ? 'enabled' : 'disabled';

    updateStatusChip('chipWebhook', data.webhook?.url ? 'Webhook: live' : 'Webhook: missing', data.webhook?.url ? 'is-good' : 'is-bad');
    updateStatusChip('chipBusiness', data.bot?.canConnectToBusiness ? 'Business: ready' : 'Business: limited', data.bot?.canConnectToBusiness ? 'is-good' : 'is-warn');
    updateStatusChip('chipGuest', data.bot?.supportsGuestQueries ? 'Guest: ready' : 'Guest: unavailable', data.bot?.supportsGuestQueries ? 'is-good' : 'is-warn');
    updateStatusChip('chipPrivacy', systemUserConfig?.hasAcceptedTerms ? 'Privacy: accepted' : 'Privacy: pending', systemUserConfig?.hasAcceptedTerms ? 'is-good' : 'is-warn');
    document.getElementById('statusSubtitle').innerText = data.webhook?.url
      ? 'Telegram can deliver updates to this bot. The dashboard is ready for live automation.'
      : 'Telegram updates are not connected yet. Reconnect the webhook before testing live chats.';
  } catch (err) {
    console.error('[Status Load Error]:', err);
    updateStatusChip('chipWebhook', 'Webhook: offline', 'is-bad');
    updateStatusChip('chipBusiness', 'Business: unknown', 'is-warn');
    updateStatusChip('chipGuest', 'Guest: unknown', 'is-warn');
  }
}

async function reconnectWebhook() {
  try {
    const res = await fetch(`${API_BASE}/system/register-webhook`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Webhook registration failed');
    }

    await loadSystemStatus();
    alert('Webhook reconnected successfully.');
  } catch (err) {
    console.error('[Webhook Registration Error]:', err);
    alert('Webhook registration failed. Check the server logs and your WEBAPP_URL.');
  }
}

async function executeCryptographicHandshake() {
  try {
    const res = await fetch(`${API_BASE}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: telegramInitDataRaw })
    });

    const data = await res.json();
    if (data.success) {
      systemUserConfig = normalizeConfig(data.config);
      document.getElementById('userIdDisplay').innerText = systemUserConfig.telegramUserId;
      
      evaluatePrivacyGuard(systemUserConfig.hasAcceptedTerms);
      syncConfigurationControls();
      await loadSystemStatus();
      await fetchAnalytics();
      await executeQueueSync();
      await executeTemplateIngestion();
    } else {
      console.error("[Handshake Critical Fault]: Cryptographic envelope verification rejected.");
    }
  } catch (err) {
    console.error("[Network Operation Exception]:", err);
  }
}

function evaluatePrivacyGuard(hasAccepted) {
  const modal = document.getElementById('privacyModal');
  if (!hasAccepted) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

async function commitPrivacyAcceptance() {
  try {
    const res = await fetch(`${API_BASE}/privacy/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramUserId: systemUserConfig.telegramUserId })
    });
    const data = await res.json();
    if (data.success) {
      systemUserConfig = normalizeConfig(data.config);
      evaluatePrivacyGuard(true);
      updateStatusChip('chipPrivacy', 'Privacy: accepted', 'is-good');
    }
  } catch (err) {
    console.error("[Privacy Pipeline Exception]:", err);
  }
}

function syncConfigurationControls() {
  document.getElementById('toggleDataLearning').checked = systemUserConfig.isDataLearningEnabled;
  document.getElementById('selectAutomationMode').value = systemUserConfig.automationMode || 'draft';
  document.getElementById('selectTone').value = systemUserConfig.aiTone || 'Professional';
  document.getElementById('customPromptArea').value = systemUserConfig.customSystemPrompt || '';
  document.getElementById('businessStart').value = systemUserConfig.businessHours?.start || 0;
  document.getElementById('businessEnd').value = systemUserConfig.businessHours?.end || 24;
  document.getElementById('routingKeywords').value = systemUserConfig.routingKeywords?.join(', ') || '';
  document.getElementById('toggleAwayMessage').checked = systemUserConfig.isAwayMessageEnabled || false;
  document.getElementById('awayMessageText').value = systemUserConfig.awayMessageText || '';

  // Sync Days
  const dayChecks = document.querySelectorAll('input[name="automationDays"]');
  const activeDays = systemUserConfig.automationDays || [0,1,2,3,4,5,6];
  dayChecks.forEach(ch => ch.checked = activeDays.includes(parseInt(ch.value)));

  // Sync Keywords
  const kwContainer = document.getElementById('keywordPairsContainer');
  kwContainer.innerHTML = "";
  (systemUserConfig.customKeywordReplies || []).forEach(pair => addKeywordPair(pair.keyword, pair.reply));

  const container = document.getElementById('awayMessageContainer');
  systemUserConfig.isAwayMessageEnabled ? container.classList.remove('hidden') : container.classList.add('hidden');
}

async function saveSystemConfiguration() {
  try {
    const payload = {
      telegramUserId: systemUserConfig.telegramUserId,
      isDataLearningEnabled: document.getElementById('toggleDataLearning').checked,
      automationMode: document.getElementById('selectAutomationMode').value,
      aiTone: document.getElementById('selectTone').value,
      customSystemPrompt: document.getElementById('customPromptArea').value,
      businessHours: {
        start: parseInt(document.getElementById('businessStart').value),
        end: parseInt(document.getElementById('businessEnd').value)
      },
      isAwayMessageEnabled: document.getElementById('toggleAwayMessage').checked,
      awayMessageText: document.getElementById('awayMessageText').value,
      routingKeywords: document.getElementById('routingKeywords').value.split(',').map(k => k.trim()).filter(Boolean),
      automationDays: Array.from(document.querySelectorAll('input[name="automationDays"]:checked')).map(ch => parseInt(ch.value)),
      customKeywordReplies: Array.from(document.querySelectorAll('.kw-pair')).map(el => ({
        keyword: el.querySelector('.kw-input').value.toLowerCase().trim(),
        reply: el.querySelector('.reply-input').value.trim()
      })).filter(p => p.keyword && p.reply)
    };

    const res = await fetch(`${API_BASE}/config/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      systemUserConfig = normalizeConfig(data.config);
      alert("Your settings have been saved!");
      updateStatusChip('chipPrivacy', systemUserConfig.hasAcceptedTerms ? 'Privacy: accepted' : 'Privacy: pending', systemUserConfig.hasAcceptedTerms ? 'is-good' : 'is-warn');
    }
  } catch (err) {
    console.error("[Config Write Failure]:", err);
  }
}

function addKeywordPair(keyword = "", reply = "") {
  const container = document.getElementById('keywordPairsContainer');
  const div = document.createElement('div');
  div.className = "kw-pair bg-white/5 p-3 rounded-xl border border-white/5 space-y-2";
  div.innerHTML = `
    <div class="flex gap-2">
      <input type="text" placeholder="Keyword" class="kw-input flex-1 bg-[#06030a] border border-purple-900/30 rounded-lg p-2 text-[11px] text-gray-300 focus:outline-none" value="${keyword}">
      <button onclick="this.parentElement.parentElement.remove()" class="text-red-500 text-xs px-2">✕</button>
    </div>
    <textarea placeholder="Auto-reply text..." class="reply-input w-full bg-[#06030a] border border-purple-900/30 rounded-lg p-2 text-[11px] text-gray-300 focus:outline-none" rows="2">${reply}</textarea>
  `;
  container.appendChild(div);
}

async function executeTemplateIngestion() {
  try {
    const res = await fetch(`${API_BASE}/config/templates`);
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('presetsContainer');
      container.innerHTML = "";
      
      data.templates.forEach(tpl => {
        const div = document.createElement('div');
        div.className = "p-3 bg-[#171026] border border-purple-500/10 rounded-xl cursor-pointer hover:border-purple-500/40 transition text-left";
        div.innerHTML = `
          <h4 class="text-sm font-bold text-purple-300">${tpl.title}</h4>
          <p class="text-[11px] text-gray-400 mt-0.5">${tpl.description}</p>
        `;
        div.onclick = () => {
          document.getElementById('customPromptArea').value = tpl.systemPrompt;
        };
        container.appendChild(div);
      });
    }
  } catch (err) {
    console.error("[Template Fetch Fault]:", err);
  }
}

async function fetchAnalytics() {
  try {
    const res = await fetch(`${API_BASE}/analytics/${systemUserConfig.telegramUserId}`);
    const data = await res.json();
    if (data.success) {
      document.getElementById('resRate').innerText = `${data.stats.resolutionRate}%`;
      document.getElementById('avgResp').innerText = data.stats.avgResponseTime;
      document.getElementById('totalInt').innerText = data.stats.totalInteractions;
      document.getElementById('escRate').innerText = `${data.stats.escalationRate}%`;
      document.getElementById('activeThr').innerText = data.stats.activeThreads;
    }
  } catch (err) {
    console.error("[Analytics Sync Error]:", err);
  }
}

async function executeQueueSync() {
  try {
    const res = await fetch(`${API_BASE}/drafts/${systemUserConfig.telegramUserId}`);
    const data = await res.json();
    const container = document.getElementById('queueContainer');
    container.innerHTML = "";

    if (data.success && data.drafts.length > 0) {
      data.drafts.forEach(draft => {
        const card = document.createElement('div');
        card.className = "bg-[#110a1d]/80 border border-purple-900/40 p-4 rounded-xl space-y-3 glass-card text-left";
        card.innerHTML = `
          <div class="flex justify-between items-center border-b border-purple-950 pb-2">
            <span class="text-xs font-bold text-indigo-400">${draft.customerName}</span>
            <span class="text-[10px] uppercase tracking-wider bg-purple-900/40 px-2 py-0.5 rounded text-purple-300 border border-purple-500/20">${draft.category}</span>
          </div>
          <div class="text-xs space-y-1">
            <p class="text-gray-400"><strong class="text-gray-500 text-[10px] uppercase tracking-wider">In:</strong> ${draft.incomingMessage}</p>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase tracking-wider text-purple-400 font-bold">Draft Action Reply</label>
              <div class="flex gap-2 mb-1">
                <button onclick="insertSnippet('${draft._id}', 'Check Pricing')" class="text-[9px] bg-purple-900/30 px-2 py-0.5 rounded border border-purple-500/20">💰 Pricing</button>
                <button onclick="insertSnippet('${draft._id}', 'View Catalog')" class="text-[9px] bg-purple-900/30 px-2 py-0.5 rounded border border-purple-500/20">📦 Catalog</button>
              </div>
              <textarea id="tx-${draft._id}" class="w-full bg-[#181129] border border-purple-900/50 rounded-lg p-2 text-xs focus:outline-none focus:border-purple-500 transition font-sans text-gray-200" rows="2">${draft.aiSuggestedReply}</textarea>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button onclick="dispatchQueueAction('${draft._id}', 'rejected')" class="text-xs px-3 py-1.5 rounded-lg bg-red-950/40 text-red-400 border border-red-500/20 hover:bg-red-900/40 transition">Drop</button>
            <button onclick="dispatchQueueAction('${draft._id}', 'approved')" class="text-xs px-4 py-1.5 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-900/40 transition font-semibold">Deploy</button>
          </div>
        `;
        container.appendChild(card);
      });
    } else {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center pt-16 text-center px-6">
          <div class="w-16 h-16 bg-purple-900/20 rounded-full flex items-center justify-center mb-4 border border-purple-500/20">
            <span class="text-2xl">📡</span>
          </div>
          <p class="text-gray-300 text-sm font-semibold">System Standby</p>
          <p class="text-gray-500 text-[11px] mt-2 leading-relaxed max-w-[200px]">
            Waiting for incoming frames. Ensure the bot is added to your 
            <span class="text-purple-400">Chat Automation</span> settings.
          </p>
        </div>`;
    }
  } catch (err) {
    console.error("[Queue Interface Frame Sync Failure]:", err);
  }
}

async function dispatchQueueAction(draftId, action) {
  try {
    const modifiedText = document.getElementById(`tx-${draftId}`)?.value || "";
    const res = await fetch(`${API_BASE}/drafts/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId, action, modifiedText })
    });
    const data = await res.json();
    if (data.success) {
      await executeQueueSync();
    }
  } catch (err) {
    console.error("[Queue Transmit Intercept Fault]:", err);
  }
}

function insertSnippet(draftId, snippet) {
  const textarea = document.getElementById(`tx-${draftId}`);
  if (textarea) {
    textarea.value += (textarea.value ? ' ' : '') + snippet;
  }
}
