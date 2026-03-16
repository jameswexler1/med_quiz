/* MedQuiz — Supabase Sync
   Username-only, no password, fully optional.
   Falls back gracefully when offline or unauthenticated. */
'use strict';

const SUPA_URL = 'https://zhefachwuuxbjukftwfe.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZWZhY2h3dXV4Ymp1a2Z0d2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzQyMDYsImV4cCI6MjA4OTIxMDIwNn0.JYVGyYz6nLhNKFfrtkF5AQ91GhTj5EGYzXFtgu3poZc';
const REST     = SUPA_URL + '/rest/v1/profiles';

const Sync = {
  username: localStorage.getItem('mq_username') || null,

  headers() {
    return {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    };
  },

  isLoggedIn() { return !!this.username; },

  /* ── LOGIN / CREATE ─────────────────────────────────── */
  async login(username) {
    username = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
      throw new Error(window.t('sync.userErr'));
    }

    // Upsert: create profile if new, do nothing if exists
    const res = await fetch(REST, {
      method:  'POST',
      headers: { ...this.headers(), 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
      body:    JSON.stringify({ username, history: [], updated_at: new Date().toISOString() }),
    });
    if (!res.ok && res.status !== 409) throw new Error(window.t('sync.loginErr'));

    this.username = username;
    localStorage.setItem('mq_username', username);

    // Pull remote history and merge
    await this.pull();
    return username;
  },

  /* ── LOGOUT ─────────────────────────────────────────── */
  logout() {
    this.username = null;
    localStorage.removeItem('mq_username');
    updateSyncUI();
  },

  /* ── PUSH local → remote ────────────────────────────── */
  async push() {
    if (!this.isLoggedIn()) return;
    const history = getHistory();
    try {
      await fetch(REST + '?username=eq.' + encodeURIComponent(this.username), {
        method:  'PATCH',
        headers: this.headers(),
        body:    JSON.stringify({ history, updated_at: new Date().toISOString() }),
      });
    } catch(e) { console.warn('MedQuiz sync push failed', e); }
  },

  /* ── PULL remote → local (merge) ───────────────────── */
  async pull() {
    if (!this.isLoggedIn()) return;
    try {
      const res = await fetch(
        REST + '?username=eq.' + encodeURIComponent(this.username) + '&select=history,updated_at',
        { headers: this.headers() }
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (!rows.length) return;

      const remote = rows[0].history || [];
      const local  = getHistory();

      // Merge: union by id, deduplicate, sort by date ascending
      const map = new Map();
      [...local, ...remote].forEach(h => {
        if (h && h.id) map.set(h.id, h);
      });
      const merged = [...map.values()].sort((a,b) => a.id - b.id);

      localStorage.setItem('mq_history', JSON.stringify(merged));
      if (merged.length !== local.length) {
        showToast(window.t('sync.mergeOk'), 'success');
      }
    } catch(e) { console.warn('MedQuiz sync pull failed', e); }
  },
};

/* ── UI HELPERS ─────────────────────────────────────────── */
function updateSyncUI() {
  const loggedIn = Sync.isLoggedIn();
  const pill   = document.getElementById('sync-pill');
  const modal  = document.getElementById('sync-modal');
  if (!pill) return;

  if (loggedIn) {
    pill.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.98"/>
      </svg>
      <span data-i18n="sync.loggedAs">${window.t('sync.loggedAs')}</span>
      <strong>${Sync.username}</strong>
      <button onclick="Sync.logout();showToast(window.MQ_LANG==='pt'?'Sessão encerrada':'Signed out','success')" style="margin-left:6px;opacity:.6;font-size:.75rem;background:none;border:none;cursor:pointer;color:inherit" data-i18n="sync.logout">${window.t('sync.logout')}</button>
    `;
    pill.style.borderColor = 'var(--accent)';
    pill.style.color       = 'var(--accent)';
  } else {
    pill.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span data-i18n="sync.title">${window.t('sync.title')}</span>
    `;
    pill.style.borderColor = 'var(--border)';
    pill.style.color       = 'var(--text-2)';
    pill.onclick = () => modal && modal.classList.remove('hidden');
  }
}

function buildSyncModal() {
  if (document.getElementById('sync-modal')) return;
  const el = document.createElement('div');
  el.id = 'sync-modal';
  el.innerHTML = `
    <div class="sync-backdrop" id="sync-backdrop"></div>
    <div class="sync-dialog card">
      <h3 style="margin-bottom:6px" data-i18n="sync.title">${window.t('sync.title')}</h3>
      <p style="color:var(--text-2);font-size:.9rem;margin-bottom:18px" data-i18n="sync.subtitle">${window.t('sync.subtitle')}</p>
      <label class="card-label" data-i18n="sync.userLabel">${window.t('sync.userLabel')}</label>
      <input id="sync-username-input" class="input" type="text" maxlength="32"
        placeholder="${window.t('sync.userPlaceholder')}"
        style="margin-bottom:12px"/>
      <button class="btn btn-primary btn-full" id="sync-login-btn" style="margin-bottom:8px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.98"/>
        </svg>
        <span data-i18n="sync.loginBtn">${window.t('sync.loginBtn')}</span>
      </button>
      <button class="btn btn-ghost btn-full" id="sync-local-btn" data-i18n="sync.localBtn">
        ${window.t('sync.localBtn')}
      </button>
    </div>
  `;
  document.body.appendChild(el);

  document.getElementById('sync-backdrop').onclick = () => el.classList.add('hidden');

  document.getElementById('sync-login-btn').onclick = async () => {
    const val = document.getElementById('sync-username-input').value;
    const btn = document.getElementById('sync-login-btn');
    btn.disabled = true;
    btn.querySelector('span').textContent = window.t('sync.syncing');
    try {
      await Sync.login(val);
      el.classList.add('hidden');
      updateSyncUI();
      showToast(window.t('sync.synced'), 'success');
    } catch(e) {
      showToast(e.message || window.t('sync.loginErr'), 'error');
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = window.t('sync.loginBtn');
    }
  };

  document.getElementById('sync-local-btn').onclick = () => {
    el.classList.add('hidden');
    localStorage.setItem('mq_sync_dismissed', '1');
  };

  document.getElementById('sync-username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('sync-login-btn').click();
  });
}

/* ── BOOT ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  buildSyncModal();
  updateSyncUI();

  // Auto-pull on load if logged in
  if (Sync.isLoggedIn()) Sync.pull().then(updateSyncUI);

  // Show modal on first visit (not dismissed, not logged in)
  if (!Sync.isLoggedIn() && !localStorage.getItem('mq_sync_dismissed')) {
    setTimeout(() => {
      const modal = document.getElementById('sync-modal');
      if (modal) modal.classList.remove('hidden');
    }, 800);
  }
});

/* Hook into saveResult so every save auto-pushes */
const _origSaveResult = window._saveResultHooked;
if (!_origSaveResult) {
  window._saveResultHooked = true;
  const origSave = window.saveResult;
  if (typeof origSave === 'function') {
    // Will be hooked after app.js defines saveResult
  }
}
