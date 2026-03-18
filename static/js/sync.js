/* MedQuiz — Supabase Sync
   Username-only, no password, fully optional. */
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

  async login(rawUsername) {
    const username = rawUsername.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
      throw new Error(window.t('sync.userErr'));
    }
    try {
      const res = await fetch(REST, {
        method:  'POST',
        headers: { ...this.headers(), 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
        body:    JSON.stringify({ username, history: [], updated_at: new Date().toISOString() }),
      });
      if (!res.ok && res.status !== 409) {
        throw new Error(window.t('sync.loginErr') + ' (HTTP ' + res.status + ')');
      }
    } catch(e) {
      if (e.message.includes('sync.')) throw e;
      throw new Error(window.t('sync.loginErr'));
    }
    this.username = username;
    localStorage.setItem('mq_username', username);
    await this.pull();
    return username;
  },

  logout() {
    this.username = null;
    localStorage.removeItem('mq_username');
    localStorage.removeItem('mq_sync_dismissed');
    updateSyncUI();
    showToast(window.MQ_LANG === 'pt' ? 'Sessão encerrada' : 'Signed out', 'success');
  },

  async push() {
    if (!this.isLoggedIn()) return;
    try {
      const history = getHistory();
      const res = await fetch(REST + '?username=eq.' + encodeURIComponent(this.username), {
        method:  'PATCH',
        headers: this.headers(),
        body:    JSON.stringify({ history, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) console.warn('Sync push HTTP', res.status);
    } catch(e) { console.warn('MedQuiz sync push failed', e); }
  },

  async pull() {
    if (!this.isLoggedIn()) return;
    try {
      const res = await fetch(
        REST + '?username=eq.' + encodeURIComponent(this.username) + '&select=history',
        { headers: this.headers() }
      );
      if (!res.ok) { console.warn('Sync pull HTTP', res.status); return; }
      const rows = await res.json();
      if (!rows.length) return;
      const remote = rows[0].history || [];
      const local  = getHistory();
      const map    = new Map();
      [...local, ...remote].forEach(h => { if (h && h.id) map.set(h.id, h); });
      const merged = [...map.values()].sort((a, b) => a.id - b.id);
      localStorage.setItem('mq_history', JSON.stringify(merged));
      if (merged.length !== local.length) {
        showToast(window.t('sync.mergeOk'), 'success');
      }
    } catch(e) { console.warn('MedQuiz sync pull failed', e); }
  },
};

/* ── UI ───────────────────────────────────────────────── */
function updateSyncUI() {
  const pill = document.getElementById('sync-pill');
  if (!pill) return;
  if (Sync.isLoggedIn()) {
    pill.style.borderColor = 'var(--accent)';
    pill.style.color       = 'var(--accent)';
    pill.onclick           = null;
    pill.style.cursor      = 'default';
    pill.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.98"/></svg>' +
      '<span>' + window.t('sync.loggedAs') + '</span> ' +
      '<strong>' + Sync.username + '</strong>' +
      '<button id="sync-logout-btn" style="margin-left:8px;opacity:.65;font-size:.75rem;' +
        'background:none;border:none;cursor:pointer;color:inherit;padding:0">' +
        window.t('sync.logout') + '</button>';
    document.getElementById('sync-logout-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      Sync.logout();
    });
  } else {
    pill.style.borderColor = 'var(--border)';
    pill.style.color       = 'var(--text-2)';
    pill.style.cursor      = 'pointer';
    pill.onclick           = openSyncModal;
    pill.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
      '<span>' + window.t('sync.title') + '</span>';
  }
}

function openSyncModal() {
  const m = document.getElementById('sync-modal');
  if (m) { m.classList.remove('hidden'); }
}

function buildSyncModal() {
  const existing = document.getElementById('sync-modal');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'sync-modal';
  el.className = 'hidden';
  el.innerHTML =
    '<div class="sync-backdrop" id="sync-backdrop"></div>' +
    '<div class="sync-dialog card">' +
      '<h3 style="margin-bottom:6px">' + window.t('sync.title') + '</h3>' +
      '<p style="color:var(--text-2);font-size:.9rem;margin-bottom:18px">' + window.t('sync.subtitle') + '</p>' +
      '<label class="card-label">' + window.t('sync.userLabel') + '</label>' +
      '<input id="sync-username-input" class="input" type="text" maxlength="32"' +
        ' placeholder="' + window.t('sync.userPlaceholder') + '"' +
        ' style="margin-bottom:12px"/>' +
      '<button class="btn btn-primary btn-full" id="sync-login-btn" style="margin-bottom:8px">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.98"/></svg>' +
        '<span id="sync-login-label">' + window.t('sync.loginBtn') + '</span>' +
      '</button>' +
      '<button class="btn btn-ghost btn-full" id="sync-local-btn">' + window.t('sync.localBtn') + '</button>' +
    '</div>';
  document.body.appendChild(el);

  document.getElementById('sync-backdrop').onclick = () => el.classList.add('hidden');

  document.getElementById('sync-login-btn').onclick = async () => {
    const val   = document.getElementById('sync-username-input').value;
    const btn   = document.getElementById('sync-login-btn');
    const label = document.getElementById('sync-login-label');
    btn.disabled  = true;
    label.textContent = window.t('sync.syncing');
    try {
      await Sync.login(val);
      el.classList.add('hidden');
      updateSyncUI();
      showToast(window.t('sync.synced'), 'success');
    } catch(e) {
      showToast(e.message || window.t('sync.loginErr'), 'error');
      btn.disabled = false;
      label.textContent = window.t('sync.loginBtn');
    }
  };

  document.getElementById('sync-username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('sync-login-btn').click();
  });

  document.getElementById('sync-local-btn').onclick = () => {
    el.classList.add('hidden');
    localStorage.setItem('mq_sync_dismissed', '1');
  };
}

/* ── BOOT ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  buildSyncModal();
  updateSyncUI();

  if (Sync.isLoggedIn()) {
    // Already logged in — pull history silently
    Sync.pull().then(updateSyncUI).catch(console.warn);
    // Also check for remote in-progress session
    setTimeout(function() {
      if (typeof pullSession === 'function') {
        pullSession().then(function(remote) {
          if (!remote) return;
          // Always use remote on boot — not in a quiz yet
          localStorage.setItem('mq_session', JSON.stringify(remote));
          if (typeof checkResumeBanner === 'function') checkResumeBanner();
          if (typeof renderHistory === 'function') {
            var hs = document.getElementById('screen-history');
            if (hs && hs.classList.contains('active')) renderHistory();
          }
        }).catch(console.warn);
      }
    }, 500);
  } else if (!localStorage.getItem('mq_sync_dismissed')) {
    // First visit and never dismissed — show after short delay
    setTimeout(openSyncModal, 900);
  }
  // If dismissed and not logged in: do nothing (truly optional)
});

/* ── SHARE QUIZ ─────────────────────────────────────────── */
const SHARE_REST = SUPA_URL + '/rest/v1/shared_quizzes';

async function shareQuiz(name, questions) {
  // Generate a short random ID: 8 chars, alphanumeric
  const id = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => b.toString(36).padStart(2,'0')).join('').slice(0,8);

  const res = await fetch(SHARE_REST, {
    method:  'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ id, name, questions }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Share failed: ' + err);
  }

  return window.location.origin + '/?share=' + id;
}

async function loadSharedQuiz(id) {
  const res = await fetch(
    SHARE_REST + '?id=eq.' + encodeURIComponent(id) + '&select=name,questions',
    {
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
      }
    }
  );
  if (!res.ok) throw new Error('Could not load shared quiz');
  const rows = await res.json();
  if (!rows.length) throw new Error('Shared quiz not found');
  return rows[0];
}

window.shareQuiz     = shareQuiz;
window.loadSharedQuiz = loadSharedQuiz;

/* ── SESSION SYNC ───────────────────────────────────────── */
const SESSION_REST = SUPA_URL + '/rest/v1/sessions';

async function pushSession(sessionData) {
  if (!Sync.isLoggedIn()) return;
  try {
    var allSessions = [];
    try { allSessions = JSON.parse(localStorage.getItem('mq_sessions') || '[]'); } catch(e) {}
    await fetch(SESSION_REST, {
      method: 'POST',
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        username:   Sync.username,
        session:    { sessions: allSessions, updatedAt: Date.now() },
        updated_at: new Date().toISOString(),
      }),
    });
  } catch(e) { console.warn('Session push failed', e); }
}

async function pullSession() {
  if (!Sync.isLoggedIn()) return null;
  try {
    const res = await fetch(
      SESSION_REST + '?username=eq.' + encodeURIComponent(Sync.username) + '&select=session,updated_at',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows.length || !rows[0].session) return null;
    const data = rows[0].session;
    if (data.sessions) {
      localStorage.setItem('mq_sessions', JSON.stringify(data.sessions));
      if (typeof checkResumeBanner === 'function') checkResumeBanner();
      return data.sessions[0] || null;
    }
    return data.shuffled ? data : null;
  } catch(e) { console.warn('Session pull failed', e); return null; }
}

async function clearRemoteSession() {
  if (!Sync.isLoggedIn()) return;
  try {
    await fetch(SESSION_REST + '?username=eq.' + encodeURIComponent(Sync.username), {
      method:  'PATCH',
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ session: {}, updated_at: new Date().toISOString() }),
    });
  } catch(e) { console.warn('Session clear failed', e); }
}

window.pushSession      = pushSession;
window.pullSession      = pullSession;
window.clearRemoteSession = clearRemoteSession;
