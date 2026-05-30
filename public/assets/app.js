const API_BASE = '/api';
let systemUserConfig = null;
let telegramInitDataRaw = "";

// Core System Boots & Verification Sequence
document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    telegramInitDataRaw = tg.initData || "";
    
    // Fallback profile definition for isolated tracking sandboxes
    if (!telegramInitDataRaw) {
      telegramInitDataRaw = "user=%7B%22id%22%3A999999%2C%22first_name%22%3A%22Developer%22%2C%22username%22%3A%22dev_node%22%7D&hash=mock_hash";
    }
  }

  await executeCryptographicHandshake();
  
  // Attach DOM Interaction Framework Events
  document.getElementById('btnAcceptPrivacy').addEventListener('click', commitPrivacyAcceptance);
  document.getElementById('btnSaveConfig').addEventListener('click', saveSystemConfiguration);
});

async function executeCryptographicHandshake() {
  try {
    const res = await fetch(`${API_BASE}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: telegramInitDataRaw })
    });

    const data = await res.json();
    if (data.success) {
      systemUserConfig = data.config;
      document.getElementById('userIdDisplay').innerText = systemUserConfig.telegramUserId;
      
      evaluatePrivacyGuard(systemUserConfig.hasAcceptedTerms);
      syncConfigurationControls();
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
      systemUserConfig = data.config;
      evaluatePrivacyGuard(true);
    }
  } catch (err) {
    console.error("[Privacy Pipeline Exception]:", err);
  }
}

function syncConfigurationControls() {
  document.getElementById('toggleDataLearning').checked = systemUserConfig.isDataLearningEnabled;
  document.getElementById('selectTone').value = systemUserConfig.aiTone || 'Professional';
  document.getElementById('customPromptArea').value = systemUserConfig.customSystemPrompt || '';
}

async function saveSystemConfiguration() {
  try {
    const payload = {
      telegramUserId: systemUserConfig.telegramUserId,
      isDataLearningEnabled: document.getElementById('toggleDataLearning').checked,
      aiTone: document.getElementById('selectTone').value,
      customSystemPrompt: document.getElementById('customPromptArea').value
    };

    const res = await fetch(`${API_BASE}/config/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      systemUserConfig = data.config;
      alert("System Matrix parameters synchronized successfully.");
    }
  } catch (err) {
    console.error("[Config Write Failure]:", err);
  }
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
      container.innerHTML = `<p class="text-gray-600 text-xs italic tracking-wide text-center pt-8">Queue pipeline empty. Standing by for incoming message frames...</p>`;
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