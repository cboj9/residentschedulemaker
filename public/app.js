// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('rf_token'),
  programId: localStorage.getItem('rf_programId') ? parseInt(localStorage.getItem('rf_programId')) : null,
  program: null,
  allPrograms: [],
  currentPage: null,
};

// ─── API Client ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (res.status === 401) { logout(); return null; }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ''; }, 3500);
}

// ─── Router ───────────────────────────────────────────────────────────────────
async function navigate(page, params = {}) {
  state.currentPage = page;
  updateNav(page);
  const app = document.getElementById('app');

  const renderers = {
    login: renderLogin,
    setup: renderSetup,
    register: renderRegister,
    'forgot-password': renderForgotPassword,
    'reset-password': () => renderResetPassword(params.token),
    dashboard: renderDashboard,
    residents: renderResidents,
    rotations: renderRotations,
    'pto-requests': renderPTORequests,
    schedules: renderSchedules,
    'schedule-detail': () => renderScheduleDetail(params.scheduleId),
    'sick-days': renderSickDays,
    'program-settings': renderProgramSettings,
    'pto-submit': renderPTOSubmit,
    swaps: renderSwaps,
    jeopardy: renderJeopardy,
    'shared-services': renderSharedServices,
    'programs': renderPrograms,
  };

  const renderer = renderers[page];
  if (!renderer) { app.innerHTML = '<div style="padding:32px">Page not found</div>'; return; }
  app.innerHTML = '<div style="padding:32px;color:var(--text-muted);font-size:0.9rem">Loading…</div>';
  await renderer();
}

function updateNav(page) {
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

// ─── Layout ───────────────────────────────────────────────────────────────────
function renderShell(titleText, contentHtml) {
  document.getElementById('app').innerHTML = `
    <div id="sidebar">
      <div class="sidebar-logo">
        <h1>ResidentFlow</h1>
        <span>Scheduling System</span>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section">Overview</div>
        <div class="nav-link" data-page="dashboard" onclick="navigate('dashboard')">
          ${icon('grid')} Dashboard
        </div>
        <div class="nav-section">Setup</div>
        <div class="nav-link" data-page="residents" onclick="navigate('residents')">
          ${icon('users')} Residents
        </div>
        <div class="nav-link" data-page="rotations" onclick="navigate('rotations')">
          ${icon('refresh')} Rotations
        </div>
        <div class="nav-section">Scheduling</div>
        <div class="nav-link" data-page="pto-requests" onclick="navigate('pto-requests')">
          ${icon('calendar')} PTO Requests
        </div>
        <div class="nav-link" data-page="schedules" onclick="navigate('schedules')">
          ${icon('list')} Schedules
        </div>
        <div class="nav-link" data-page="sick-days" onclick="navigate('sick-days')">
          ${icon('alert')} Sick Days
        </div>
        <div class="nav-section">Tools</div>
        <div class="nav-link" data-page="swaps" onclick="navigate('swaps')">
          ${icon('swap')} Swap Requests
        </div>
        <div class="nav-link" data-page="jeopardy" onclick="navigate('jeopardy')">
          ${icon('shield')} Jeopardy Board
        </div>
        <div class="nav-section">Config</div>
        <div class="nav-link" data-page="shared-services" onclick="navigate('shared-services')">
          ${icon('zap')} Shared Services
        </div>
        <div class="nav-link" data-page="programs" onclick="navigate('programs')">
          ${icon('grid')} Programs
        </div>
        <div class="nav-link" data-page="program-settings" onclick="navigate('program-settings')">
          ${icon('settings')} Program Settings
        </div>
      </nav>
      <div class="sidebar-footer">
        ${state.allPrograms.length > 1 ? `
          <select onchange="switchProgram(+this.value)" style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:rgba(255,255,255,0.75);padding:5px 8px;font-size:0.78rem;cursor:pointer;margin-bottom:8px;outline:none">
            ${state.allPrograms.map(p => `<option value="${p.id}" ${p.id === state.programId ? 'selected' : ''} style="background:#1e2d40;color:#fff">${escHtml(p.name)}</option>`).join('')}
          </select>
        ` : `<div style="margin-bottom:6px;font-weight:500;font-size:0.82rem;color:rgba(255,255,255,0.6)">${escHtml(state.program?.name || '')}</div>`}
        <div style="cursor:pointer;color:rgba(255,255,255,0.3);font-size:0.78rem" onclick="logout()">Sign out</div>
      </div>
    </div>
    <div id="main">
      <div id="topbar">
        <div class="topbar-title">${titleText}</div>
        <div style="font-size:0.8rem;color:var(--text-muted)">${state.program?.name || ''}</div>
      </div>
      <div id="content">${contentHtml}</div>
    </div>
  `;
  updateNav(state.currentPage);
}

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────
function icon(name) {
  const icons = {
    grid: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    users: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    refresh: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="23 4 23 10 17 10"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    calendar: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    list: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    alert: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    settings: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    plus: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    edit: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`,
    trash: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/></svg>`,
    copy: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    download: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3"/></svg>`,
    zap: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    eye: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    check: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="20 6 9 17 4 12"/></svg>`,
    x: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    'bar-chart': `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
    swap: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="17 1 21 5 17 9"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    shield: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    clock: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="12 6 12 12 16 14"/></svg>`,
    print: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="6 9 6 2 18 2 18 9"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
    moon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  };
  return icons[name] || '';
}

// ─── Rotation color palette ───────────────────────────────────────────────────
const ROTATION_COLORS = [
  ['#e8f4f0','#0b8c87'], ['#e8eef8','#2563eb'], ['#f5e8f8','#7c3aed'],
  ['#f8ede8','#c2410c'], ['#f0f8e8','#15803d'], ['#f8f0e8','#b45309'],
  ['#e8f0f8','#1d4ed8'], ['#f8e8ee','#be185d'], ['#e8f8f5','#0d7a5e'],
  ['#f4f0e8','#92400e'], ['#eef0f8','#3730a3'], ['#f8edf0','#9f1239'],
];

function rotationColor(name) {
  if (!name) return ['#f0f4f8', '#5a7080'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return ROTATION_COLORS[hash % ROTATION_COLORS.length];
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function logout() {
  localStorage.removeItem('rf_token');
  localStorage.removeItem('rf_programId');
  state.token = null;
  state.programId = null;
  state.program = null;
  state.allPrograms = [];
  navigate('login');
}

async function renderLogin() {
  // Check if PTO submit page
  if (window.location.pathname === '/pto-submit' || window.location.search.includes('token=')) {
    return navigate('pto-submit');
  }

  const data = await fetch('/api/auth/setup-needed').then(r => r.json()).catch(() => ({ setupNeeded: false }));
  if (data.setupNeeded) return navigate('setup');

  document.getElementById('app').innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-logo">ResidentFlow</div>
        <div class="auth-subtitle">Residency Scheduling System</div>
        <form onsubmit="handleLogin(event)">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="login-email" class="form-input" placeholder="coordinator@hospital.org" required />
          </div>
          <div class="form-group">
            <label class="form-label" style="display:flex;justify-content:space-between;align-items:center">
              Password
              <a href="#" onclick="event.preventDefault();navigate('forgot-password')" style="font-size:0.78rem;color:var(--teal);font-weight:400;text-transform:none;letter-spacing:0">Forgot password?</a>
            </label>
            <input type="password" id="login-password" class="form-input" placeholder="••••••••" required />
          </div>
          <button type="submit" class="btn btn-navy" style="width:100%;justify-content:center;margin-top:8px" id="login-btn">
            Sign In
          </button>
          <div id="login-error" style="color:var(--error);font-size:0.85rem;margin-top:10px;text-align:center"></div>
        </form>
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border);text-align:center;font-size:0.85rem;color:var(--text-muted)">
          New to ResidentFlow?
          <a href="#" onclick="event.preventDefault();navigate('register')" style="color:var(--teal);font-weight:600;text-decoration:none;margin-left:4px">Create an account</a>
        </div>
      </div>
    </div>
  `;
}

window.handleLogin = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  btn.innerHTML = '<span class="loader"></span>';
  btn.disabled = true;
  try {
    const data = await api('POST', '/auth/login', {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value,
    });
    state.token = data.token;
    state.programId = data.programId;
    localStorage.setItem('rf_token', data.token);
    localStorage.setItem('rf_programId', data.programId);
    await loadProgram();
    navigate('dashboard');
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
    btn.innerHTML = 'Sign In';
    btn.disabled = false;
  }
};

async function renderSetup() {
  document.getElementById('app').innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card" style="max-width:520px">
        <div class="auth-logo">ResidentFlow</div>
        <div class="auth-subtitle">First-time setup — create your program and coordinator account</div>
        <form onsubmit="handleSetup(event)">
          <div class="form-group">
            <label class="form-label">Program Name</label>
            <input type="text" id="s-program" class="form-input" placeholder="e.g. Internal Medicine Residency" required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Block Length (weeks)</label>
              <input type="number" id="s-block" class="form-input" value="4" min="1" max="12" required />
            </div>
            <div class="form-group">
              <label class="form-label">Total Blocks</label>
              <input type="number" id="s-blocks" class="form-input" value="13" min="1" max="52" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Academic Year Start</label>
            <input type="date" id="s-year" class="form-input" required />
          </div>
          <hr style="border:none;border-top:1px solid var(--border);margin:20px 0"/>
          <div class="form-group">
            <label class="form-label">Coordinator Email</label>
            <input type="email" id="s-email" class="form-input" required />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="s-pass" class="form-input" minlength="6" required />
          </div>
          <button type="submit" class="btn btn-navy" style="width:100%;justify-content:center" id="setup-btn">
            Create Program
          </button>
          <div id="setup-error" style="color:var(--error);font-size:0.85rem;margin-top:10px;text-align:center"></div>
        </form>
      </div>
    </div>
  `;
}

window.handleSetup = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('setup-btn');
  btn.innerHTML = '<span class="loader"></span>';
  btn.disabled = true;
  try {
    const data = await api('POST', '/auth/setup', {
      programName: document.getElementById('s-program').value,
      blockLengthWeeks: parseInt(document.getElementById('s-block').value),
      totalBlocks: parseInt(document.getElementById('s-blocks').value),
      academicYearStart: document.getElementById('s-year').value,
      email: document.getElementById('s-email').value,
      password: document.getElementById('s-pass').value,
    });
    state.token = data.token;
    state.programId = data.programId;
    localStorage.setItem('rf_token', data.token);
    localStorage.setItem('rf_programId', data.programId);
    await loadProgram();
    navigate('dashboard');
  } catch (err) {
    document.getElementById('setup-error').textContent = err.message;
    btn.innerHTML = 'Create Program';
    btn.disabled = false;
  }
};

async function loadProgram() {
  if (!state.programId) return;
  [state.program, state.allPrograms] = await Promise.all([
    api('GET', `/programs/${state.programId}`).catch(() => null),
    api('GET', '/programs').catch(() => []),
  ]);
  state.allPrograms = state.allPrograms || [];
}

// ─── Register (new program from login page) ───────────────────────────────────
async function renderRegister() {
  document.getElementById('app').innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card" style="max-width:520px">
        <div class="auth-logo">ResidentFlow</div>
        <div class="auth-subtitle">Create a new program and coordinator account</div>
        <form onsubmit="handleRegister(event)">
          <div class="form-group">
            <label class="form-label">Program Name</label>
            <input type="text" id="r-program" class="form-input" placeholder="e.g. Internal Medicine Residency" required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Block Length (weeks)</label>
              <input type="number" id="r-block" class="form-input" value="4" min="1" max="12" required />
            </div>
            <div class="form-group">
              <label class="form-label">Total Blocks</label>
              <input type="number" id="r-blocks" class="form-input" value="13" min="1" max="52" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Academic Year Start</label>
            <input type="date" id="r-year" class="form-input" required />
          </div>
          <hr style="border:none;border-top:1px solid var(--border);margin:20px 0"/>
          <div class="form-group">
            <label class="form-label">Coordinator Email</label>
            <input type="email" id="r-email" class="form-input" required />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="r-pass" class="form-input" minlength="6" required />
          </div>
          <button type="submit" class="btn btn-navy" style="width:100%;justify-content:center" id="register-btn">
            Create Program
          </button>
          <div id="register-error" style="color:var(--error);font-size:0.85rem;margin-top:10px;text-align:center"></div>
        </form>
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border);text-align:center;font-size:0.85rem;color:var(--text-muted)">
          Already have an account?
          <a href="#" onclick="event.preventDefault();navigate('login')" style="color:var(--teal);font-weight:600;text-decoration:none;margin-left:4px">Sign in</a>
        </div>
      </div>
    </div>
  `;
}

window.handleRegister = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  btn.innerHTML = '<span class="loader"></span>';
  btn.disabled = true;
  try {
    const data = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programName: document.getElementById('r-program').value,
        blockLengthWeeks: parseInt(document.getElementById('r-block').value),
        totalBlocks: parseInt(document.getElementById('r-blocks').value),
        academicYearStart: document.getElementById('r-year').value,
        email: document.getElementById('r-email').value,
        password: document.getElementById('r-pass').value,
      }),
    }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Registration failed');
      return d;
    });
    state.token = data.token;
    state.programId = data.programId;
    localStorage.setItem('rf_token', data.token);
    localStorage.setItem('rf_programId', data.programId);
    await loadProgram();
    navigate('dashboard');
  } catch (err) {
    document.getElementById('register-error').textContent = err.message;
    btn.innerHTML = 'Create Program';
    btn.disabled = false;
  }
};

// ─── Forgot Password ──────────────────────────────────────────────────────────
async function renderForgotPassword() {
  document.getElementById('app').innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-logo">ResidentFlow</div>
        <div class="auth-subtitle">Reset your password</div>
        <div id="fp-form-container">
          <form onsubmit="handleForgotPassword(event)">
            <div class="form-group">
              <label class="form-label">Your account email</label>
              <input type="email" id="fp-email" class="form-input" placeholder="coordinator@hospital.org" required />
            </div>
            <button type="submit" class="btn btn-navy" style="width:100%;justify-content:center" id="fp-btn">
              Send Reset Link
            </button>
            <div id="fp-error" style="color:var(--error);font-size:0.85rem;margin-top:10px;text-align:center"></div>
          </form>
        </div>
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border);text-align:center;font-size:0.85rem;color:var(--text-muted)">
          <a href="#" onclick="event.preventDefault();navigate('login')" style="color:var(--teal);font-weight:600;text-decoration:none">Back to sign in</a>
        </div>
      </div>
    </div>
  `;
}

window.handleForgotPassword = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('fp-btn');
  btn.innerHTML = '<span class="loader"></span>';
  btn.disabled = true;
  try {
    const result = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('fp-email').value }),
    }).then(r => r.json());

    const container = document.getElementById('fp-form-container');
    if (result.emailSent) {
      container.innerHTML = `
        <div style="text-align:center;padding:12px 0">
          <div style="font-size:2.5rem;margin-bottom:12px">✉️</div>
          <p style="color:var(--text);font-weight:600;margin-bottom:6px">Check your email</p>
          <p style="color:var(--text-muted);font-size:0.85rem">A password reset link has been sent to your email address.</p>
        </div>`;
    } else if (result.resetLink) {
      container.innerHTML = `
        <div style="padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px">
          <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px">
            Email sending is not configured on this server. Copy this reset link and open it in your browser:
          </p>
          <div style="background:#fff;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:0.78rem;word-break:break-all;color:var(--teal);font-family:monospace">
            ${result.resetLink}
          </div>
          <button class="btn btn-navy btn-sm" style="margin-top:10px;width:100%;justify-content:center"
            onclick="navigator.clipboard.writeText('${result.resetLink}').then(()=>toast('Link copied'))">
            Copy Link
          </button>
        </div>`;
    } else {
      container.innerHTML = `
        <p style="color:var(--text-muted);font-size:0.85rem;text-align:center">
          If an account with that email exists, a reset link has been sent.
        </p>`;
    }
  } catch {
    document.getElementById('fp-error').textContent = 'Something went wrong. Please try again.';
    btn.innerHTML = 'Send Reset Link';
    btn.disabled = false;
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
async function renderResetPassword(token) {
  document.getElementById('app').innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-logo">ResidentFlow</div>
        <div class="auth-subtitle">Choose a new password</div>
        <form onsubmit="handleResetPassword(event, '${token}')">
          <div class="form-group">
            <label class="form-label">New Password</label>
            <input type="password" id="rp-pass" class="form-input" minlength="6" placeholder="At least 6 characters" required />
          </div>
          <div class="form-group">
            <label class="form-label">Confirm Password</label>
            <input type="password" id="rp-confirm" class="form-input" minlength="6" required />
          </div>
          <button type="submit" class="btn btn-navy" style="width:100%;justify-content:center" id="rp-btn">
            Set New Password
          </button>
          <div id="rp-error" style="color:var(--error);font-size:0.85rem;margin-top:10px;text-align:center"></div>
        </form>
      </div>
    </div>
  `;
}

window.handleResetPassword = async function(e, token) {
  e.preventDefault();
  const pass = document.getElementById('rp-pass').value;
  const confirm = document.getElementById('rp-confirm').value;
  if (pass !== confirm) {
    document.getElementById('rp-error').textContent = 'Passwords do not match.';
    return;
  }
  const btn = document.getElementById('rp-btn');
  btn.innerHTML = '<span class="loader"></span>';
  btn.disabled = true;
  try {
    await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: pass }),
    }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Reset failed');
    });
    document.getElementById('app').innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-card" style="text-align:center">
          <div style="font-size:2.5rem;margin-bottom:12px">✓</div>
          <div class="auth-logo" style="margin-bottom:8px">Password Reset</div>
          <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:20px">Your password has been updated. You can now sign in with your new password.</p>
          <button class="btn btn-navy" style="width:100%;justify-content:center" onclick="navigate('login')">
            Go to Sign In
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('rp-error').textContent = err.message;
    btn.innerHTML = 'Set New Password';
    btn.disabled = false;
  }
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  renderShell('How to Generate a Schedule', `
    <style>
      .guide-intro {
        background: linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%);
        border-radius: 14px;
        padding: 28px 32px;
        margin-bottom: 28px;
        color: #fff;
        position: relative;
        overflow: hidden;
      }
      .guide-intro::after {
        content: '';
        position: absolute;
        right: -40px; top: -40px;
        width: 200px; height: 200px;
        background: radial-gradient(circle, rgba(11,181,174,0.18) 0%, transparent 70%);
        border-radius: 50%;
      }
      .guide-intro h2 { font-size: 1.5rem; margin: 0 0 6px; color: #fff; }
      .guide-intro p { margin: 0; font-size: 0.9rem; color: rgba(255,255,255,0.7); max-width: 580px; line-height: 1.6; }
      .guide-steps { display: flex; flex-direction: column; gap: 16px; }
      .guide-step {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0;
        overflow: hidden;
        box-shadow: 0 2px 10px rgba(15,45,74,0.05);
        transition: box-shadow 0.15s;
      }
      .guide-step:hover { box-shadow: 0 4px 20px rgba(15,45,74,0.10); }
      .step-header {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 18px 24px;
        cursor: pointer;
        user-select: none;
      }
      .step-num {
        width: 34px; height: 34px;
        border-radius: 50%;
        background: var(--navy);
        color: #fff;
        font-family: 'DM Serif Display', serif;
        font-size: 1rem;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .step-title-group { flex: 1; }
      .step-title { font-family: 'DM Serif Display', serif; font-size: 1.05rem; color: var(--navy); margin: 0 0 2px; }
      .step-subtitle { font-size: 0.8rem; color: var(--text-muted); margin: 0; }
      .step-cta { flex-shrink: 0; }
      .step-body {
        padding: 0 24px 20px 74px;
        display: none;
      }
      .step-body.open { display: block; }
      .step-body ul { margin: 0; padding-left: 18px; }
      .step-body li { font-size: 0.875rem; color: var(--text); margin-bottom: 6px; line-height: 1.5; }
      .step-body li strong { color: var(--navy); }
      .tip-box {
        background: rgba(11,140,135,0.07);
        border: 1px solid rgba(11,140,135,0.2);
        border-radius: 8px;
        padding: 10px 14px;
        margin-top: 12px;
        font-size: 0.82rem;
        color: var(--teal);
        line-height: 1.5;
      }
      .tip-box strong { color: var(--teal); }
      .warn-box {
        background: rgba(245,158,11,0.07);
        border: 1px solid rgba(245,158,11,0.25);
        border-radius: 8px;
        padding: 10px 14px;
        margin-top: 10px;
        font-size: 0.82rem;
        color: #92400e;
        line-height: 1.5;
      }
      .step-divider { width: 100%; height: 1px; background: var(--border); margin: 0 0 14px; }
      .chevron {
        width: 18px; height: 18px;
        flex-shrink: 0;
        color: var(--text-muted);
        transition: transform 0.2s;
      }
      .step-header.open .chevron { transform: rotate(180deg); }
    </style>

    <div class="guide-intro">
      <h2>Schedule Generation Guide</h2>
      <p>Follow these steps in order before clicking Generate. Skipping or misconfiguring any step is the most common cause of errors and violations. Each step links directly to the relevant section.</p>
    </div>

    <div class="guide-steps">

      <!-- Step 1 -->
      <div class="guide-step">
        <div class="step-header" onclick="toggleStep(this)">
          <div class="step-num">1</div>
          <div class="step-title-group">
            <div class="step-title">Configure Program Settings</div>
            <div class="step-subtitle">Block structure must be correct before anything else</div>
          </div>
          <button class="btn btn-ghost btn-sm step-cta" onclick="event.stopPropagation();navigate('program-settings')">Open Settings</button>
          <svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="step-body">
          <div class="step-divider"></div>
          <ul>
            <li><strong>Block Length (weeks):</strong> Typically 4 weeks. Half-blocks will be half this value (2 weeks). This cannot be changed after generating a schedule.</li>
            <li><strong>Total Blocks:</strong> How many blocks are in the academic year (e.g., 13 for a 52-week year with 4-week blocks).</li>
            <li><strong>Academic Year Start:</strong> The Monday that Block 1 begins. All week numbers and PTO dates derive from this.</li>
          </ul>
          <div class="tip-box"><strong>Tip:</strong> A standard IM program uses 4-week blocks × 13 blocks = 52 weeks. Verify block count × block length matches your actual academic year length before adding any residents.</div>
        </div>
      </div>

      <!-- Step 2 -->
      <div class="guide-step">
        <div class="step-header" onclick="toggleStep(this)">
          <div class="step-num">2</div>
          <div class="step-title-group">
            <div class="step-title">Add All Residents</div>
            <div class="step-subtitle">PGY year determines which rotations each resident is assigned</div>
          </div>
          <button class="btn btn-ghost btn-sm step-cta" onclick="event.stopPropagation();navigate('residents')">Manage Residents</button>
          <svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="step-body">
          <div class="step-divider"></div>
          <ul>
            <li><strong>PGY Year:</strong> Must match exactly what you configure in rotation PGY Restrictions and PGY Requirements. If a resident's PGY year isn't in a rotation's restriction list, they will never be assigned to it.</li>
            <li><strong>PTO Weeks Allotted:</strong> Set the number of PTO weeks each resident is allowed. The algorithm will not approve more PTO than this amount.</li>
            <li><strong>All residents must be added before generating.</strong> Residents added after a schedule is generated will not appear in it unless you regenerate.</li>
          </ul>
          <div class="tip-box"><strong>Tip:</strong> Use the Invite button to send residents a link to submit their own PTO preferences — this saves time in Step 5.</div>
        </div>
      </div>

      <!-- Step 3 -->
      <div class="guide-step">
        <div class="step-header" onclick="toggleStep(this)">
          <div class="step-num">3</div>
          <div class="step-title-group">
            <div class="step-title">Configure All Rotations</div>
            <div class="step-subtitle">The most critical step — misconfigured rotations cause the most errors</div>
          </div>
          <button class="btn btn-ghost btn-sm step-cta" onclick="event.stopPropagation();navigate('rotations')">Manage Rotations</button>
          <svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="step-body">
          <div class="step-divider"></div>
          <ul>
            <li><strong>Type (Required vs. Elective):</strong> Required rotations enforce completion and coverage. Elective rotations are filled only when slack exists.</li>
            <li><strong>Duration:</strong> Match block length (full block) or half of it (half-block). A "flexible" rotation can split into a half-block when only one slot is available.</li>
            <li><strong>Min / Max Capacity:</strong> How many residents must/can be on this rotation per block. The algorithm flags coverage violations if min is not met in any block.</li>
            <li><strong>PGY Restrictions:</strong> List which PGY years are eligible. Leave empty to allow all years. Residents outside this list are never assigned here.</li>
            <li><strong>PGY Requirements (half-block units):</strong> How many half-block units each PGY year must complete. <em>A full 4-week block = 2 units. A 2-week half-block = 1 unit.</em> Set to 0 for a PGY year that should skip this rotation entirely.</li>
            <li><strong>Gap Rules:</strong> Prevent a rotation from appearing too soon after another (e.g., ICU must be ≥ 3 blocks after last ICU). Add these to spread high-intensity rotations.</li>
            <li><strong>Phase Preference (optional):</strong> If a rotation is best placed early or late in the year, set preferred block range. The algorithm scores placements in-range higher.</li>
            <li><strong>PTO Eligible:</strong> Only rotations marked PTO-eligible will have PTO placed on them. Coverage is still enforced even during PTO.</li>
          </ul>
          <div class="warn-box"><strong>Common mistake:</strong> Setting PGY Requirements to 2 when you mean "one full block." Since requirements are in half-block units, 2 = one full 4-week block and 4 = two full blocks. Double-check these values — they are the #1 source of completion violations.</div>
          <div class="tip-box"><strong>Tip:</strong> For required rotations with no PGY Requirements configured, the algorithm defaults to 2 half-units (one full block) per eligible resident. Configure explicit requirements whenever residents need more or fewer repetitions.</div>
        </div>
      </div>

      <!-- Step 4 -->
      <div class="guide-step">
        <div class="step-header" onclick="toggleStep(this)">
          <div class="step-num">4</div>
          <div class="step-title-group">
            <div class="step-title">Set Up Shared Services (if applicable)</div>
            <div class="step-subtitle">Only needed when multiple programs share rotation coverage</div>
          </div>
          <button class="btn btn-ghost btn-sm step-cta" onclick="event.stopPropagation();navigate('shared-services')">Shared Services</button>
          <svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="step-body">
          <div class="step-divider"></div>
          <ul>
            <li>If your program shares a rotation (e.g., ICU) with another residency program, cross-program coverage counts toward the minimum capacity requirement.</li>
            <li>The algorithm fetches the latest generated schedule from linked programs and incorporates their assignments into coverage checks.</li>
            <li><strong>Generate the other program's schedule first</strong> before generating yours, so the cross-program counts are current.</li>
            <li>If no shared services apply, skip this step entirely.</li>
          </ul>
        </div>
      </div>

      <!-- Step 5 -->
      <div class="guide-step">
        <div class="step-header" onclick="toggleStep(this)">
          <div class="step-num">5</div>
          <div class="step-title-group">
            <div class="step-title">Collect PTO Requests</div>
            <div class="step-subtitle">PTO must be entered before generating — it cannot be applied retroactively</div>
          </div>
          <button class="btn btn-ghost btn-sm step-cta" onclick="event.stopPropagation();navigate('pto-requests')">PTO Requests</button>
          <svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="step-body">
          <div class="step-divider"></div>
          <ul>
            <li>Residents submit PTO as specific <strong>week numbers</strong> within the academic year (Week 1 = first week of Block 1).</li>
            <li>The algorithm approves PTO only on PTO-eligible rotations and only if coverage minimums are still met in that block.</li>
            <li>PTO beyond a resident's allotted weeks will not be scheduled.</li>
            <li>Use the <strong>Invite link</strong> on the Residents page to let residents submit their own requests through a self-service form.</li>
            <li>Or enter requests manually on the PTO Requests page before generating.</li>
          </ul>
          <div class="tip-box"><strong>Tip:</strong> Send invite links at least a week before you plan to generate, so residents have time to submit preferences. The algorithm will honor as many approved requests as coverage allows.</div>
        </div>
      </div>

      <!-- Step 6 -->
      <div class="guide-step">
        <div class="step-header" onclick="toggleStep(this)">
          <div class="step-num">6</div>
          <div class="step-title-group">
            <div class="step-title">Create a Schedule &amp; Generate</div>
            <div class="step-subtitle">One click runs the full algorithm across all residents and blocks</div>
          </div>
          <button class="btn btn-primary btn-sm step-cta" onclick="event.stopPropagation();navigate('schedules')">Go to Schedules</button>
          <svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="step-body">
          <div class="step-divider"></div>
          <ul>
            <li>On the Schedules page, click <strong>"New Schedule"</strong> and give it a name and academic year.</li>
            <li>Open the schedule, then click <strong>"Generate"</strong>. The algorithm runs and fills all blocks for all residents.</li>
            <li>Generation is fast (a few seconds). The page will show a violation count immediately after.</li>
            <li>You can regenerate as many times as needed — each run replaces all assignments from scratch.</li>
            <li><strong>Do not regenerate after manually editing</strong> unless you intend to discard all manual changes.</li>
          </ul>
          <div class="warn-box"><strong>Important:</strong> Regenerating a schedule discards all hand-edits. If you have manually adjusted any cells, export or note them before clicking Generate again.</div>
        </div>
      </div>

      <!-- Step 7 -->
      <div class="guide-step">
        <div class="step-header" onclick="toggleStep(this)">
          <div class="step-num">7</div>
          <div class="step-title-group">
            <div class="step-title">Review Violations &amp; Fix</div>
            <div class="step-subtitle">Red = errors, Yellow = warnings — address errors first</div>
          </div>
          <button class="btn btn-ghost btn-sm step-cta" onclick="event.stopPropagation();navigate('schedules')">View Schedules</button>
          <svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="step-body">
          <div class="step-divider"></div>
          <ul>
            <li><strong>Coverage errors:</strong> A required rotation did not meet minimum capacity in some block. Fix by increasing resident count, relaxing PGY restrictions, or reducing the minimum.</li>
            <li><strong>Completion errors:</strong> A resident did not finish the required half-block units for a rotation. Fix by increasing that resident's eligible blocks, reducing the requirement, or checking PGY restrictions are not over-constraining.</li>
            <li><strong>Gap warnings:</strong> A gap rule was violated (rotation repeated too soon). Adjust gap rules or manually move assignments on the schedule grid.</li>
            <li><strong>PTO warnings:</strong> A PTO request could not be honored (coverage conflict or allotment exceeded). Review PTO requests and coverage minimums.</li>
            <li>After fixing configuration, click <strong>Generate</strong> again to re-run the algorithm with the new settings.</li>
            <li>For minor tweaks (single-cell swaps), use the Swap Requests page instead of regenerating.</li>
          </ul>
          <div class="tip-box"><strong>Tip:</strong> Start with zero violations on a small test cohort (2–3 residents, 3–4 rotations) to validate your configuration, then add the full roster and regenerate.</div>
        </div>
      </div>

    </div>
  `);

  // Expand/collapse steps
  window.toggleStep = function(header) {
    const body = header.nextElementSibling;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    header.classList.toggle('open', !isOpen);
  };
}

// ─── Residents ────────────────────────────────────────────────────────────────
async function renderResidents() {
  const residents = await api('GET', `/residents/program/${state.programId}`);

  const PGY_GROUPS = [
    { pgy: 1, label: 'PGY1',               color: '#0b8c87' },
    { pgy: 2, label: 'PGY2',               color: '#2563eb' },
    { pgy: 3, label: 'PGY3',               color: '#7c3aed' },
    { pgy: 4, label: 'Transitional Year',  color: '#c2410c' },
    { pgy: 5, label: 'Psychiatry',         color: '#0d7a5e' },
  ];

  function residentRows(list) {
    return list.map(r => `
      <tr>
        <td><strong>${escHtml(r.name)}</strong></td>
        <td style="color:var(--text-muted)">${r.email || '—'}</td>
        <td>${r.pto_weeks_allotted} weeks</td>
        <td class="actions">
          <button class="btn btn-ghost btn-sm" onclick="generateInvite(${r.id},'${r.name.replace(/'/g, "\\'")}')">
            ${icon('copy')} Invite
          </button>
          <button class="btn btn-ghost btn-sm" onclick="openResidentModal(${r.id})">
            ${icon('edit')} Edit
          </button>
          <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="deleteResident(${r.id})">
            ${icon('trash')} Delete
          </button>
        </td>
      </tr>
    `).join('');
  }

  const grouped = PGY_GROUPS.map(g => ({
    ...g,
    members: (residents || []).filter(r => r.pgy_year === g.pgy),
  })).filter(g => g.members.length > 0);

  // Any PGY levels not in the predefined groups
  const knownPGYs = new Set(PGY_GROUPS.map(g => g.pgy));
  const otherPGYs = [...new Set((residents || []).filter(r => !knownPGYs.has(r.pgy_year)).map(r => r.pgy_year))].sort();
  for (const pgy of otherPGYs) {
    grouped.push({ pgy, label: `PGY${pgy}`, color: '#5a7080', members: residents.filter(r => r.pgy_year === pgy) });
  }

  const groupSections = grouped.map(g => `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="margin-bottom:16px">
        <h2 style="display:flex;align-items:center;gap:10px">
          <span style="width:12px;height:12px;border-radius:50%;background:${g.color};flex-shrink:0;display:inline-block"></span>
          ${escHtml(g.label)}
          <span style="font-family:'DM Sans',sans-serif;font-size:0.8rem;font-weight:500;color:var(--text-muted);margin-left:2px">${g.members.length} resident${g.members.length !== 1 ? 's' : ''}</span>
        </h2>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>PTO Weeks</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${residentRows(g.members)}</tbody>
      </table>
    </div>
  `).join('');

  renderShell('Residents', `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:8px;flex-wrap:wrap">
      <div style="font-size:0.9rem;color:var(--text-muted)">${residents?.length || 0} residents total</div>
      <div style="display:flex;gap:8px">
        <label class="btn btn-ghost" style="cursor:pointer" title="Import residents from CSV">
          ${icon('download')} Import CSV
          <input type="file" accept=".csv" style="display:none" onchange="importResidentsCSV(event)" />
        </label>
        <button class="btn btn-primary" onclick="openResidentModal()">
          ${icon('plus')} Add Resident
        </button>
      </div>
    </div>
    ${residents?.length > 0 ? groupSections : `
      <div class="card"><div class="empty-state">${icon('users')}<p>No residents yet. Add your first resident to get started.</p></div></div>
    `}
    <div id="modal-container"></div>
    <div id="invite-result" style="margin-top:16px"></div>
  `);
}

window.openResidentModal = async function(id) {
  let resident = null;
  let schedules = [];
  let ptoRequests = [];
  let leavePeriods = {};
  if (id) {
    [resident, schedules, ptoRequests] = await Promise.all([
      api('GET', `/residents/program/${state.programId}`).then(list => list.find(r => r.id === id)),
      api('GET', `/schedules/program/${state.programId}`).catch(() => []),
      api('GET', `/pto/resident/${id}`).catch(() => [])
    ]);
    schedules = schedules || [];
    ptoRequests = ptoRequests || [];
    // Fetch leave periods for each schedule
    const leavePromises = schedules.map(s =>
      api('GET', `/leave-periods/resident/${id}/schedule/${s.id}`).catch(() => [])
    );
    const leaveResults = await Promise.all(leavePromises);
    for (let i = 0; i < schedules.length; i++) {
      leavePeriods[schedules[i].id] = leaveResults[i] || [];
    }
  }

  document.getElementById('modal-container').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <h2>${resident ? 'Edit' : 'Add'} Resident</h2>
        <form onsubmit="saveResident(event, ${id || 'null'})">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" id="r-name" class="form-input" value="${resident?.name || ''}" required placeholder="Dr. Jane Smith" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">PGY Year</label>
              <select id="r-pgy" class="form-select">
                ${[1,2,3,4,5,6,7].map(y => `<option value="${y}" ${resident?.pgy_year === y ? 'selected' : ''}>PGY-${y}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">PTO Weeks/Year</label>
              <input type="number" id="r-pto" class="form-input" value="${resident?.pto_weeks_allotted ?? 3}" min="0" max="52" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Email (optional)</label>
            <input type="email" id="r-email" class="form-input" value="${resident?.email || ''}" placeholder="resident@hospital.org" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">${resident ? 'Save Changes' : 'Add Resident'}</button>
          </div>
        </form>
        ${id ? `
        <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
          <h3 style="font-size:0.95rem;font-weight:600;margin-bottom:12px">PTO Requests</h3>
          <div id="pto-section-container">
            ${schedules.length === 0
              ? '<p style="color:var(--text-muted);font-size:0.875rem">No schedules yet. Create a schedule to manage PTO.</p>'
              : renderResidentPtoSection(id, schedules, ptoRequests)
            }
          </div>
        </div>
        <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
          <h3 style="font-size:0.95rem;font-weight:600;margin-bottom:4px">Leave Periods</h3>
          <p style="font-size:0.8rem;color:var(--text-muted);margin:0 0 12px">LOA, research months, maternity/paternity leave. The scheduler will not assign this resident during these blocks.</p>
          <div id="leave-section-container">
            ${schedules.length === 0
              ? '<p style="color:var(--text-muted);font-size:0.875rem">No schedules yet.</p>'
              : renderResidentLeaveSection(id, schedules, leavePeriods)
            }
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `;
};

function renderResidentPtoSection(residentId, schedules, ptoRequests) {
  const statusStyle = {
    approved: 'background:#d1fae5;color:#065f46',
    denied:   'background:#fee2e2;color:#991b1b',
    pending:  'background:#fef9c3;color:#713f12'
  };
  const ayStart = state.program?.academic_year_start;
  const totalBlocks = state.program?.total_blocks || 13;
  const blockLen = state.program?.block_length_weeks || 4;
  const totalWeeks = totalBlocks * blockLen;
  const bounds = academicYearDateBounds(ayStart, totalBlocks, blockLen);

  return schedules.map(s => {
    const reqs = ptoRequests.filter(r => r.schedule_id === s.id).sort((a, b) => a.week_number - b.week_number);
    const chips = reqs.map(r => `
      <span style="display:inline-flex;align-items:center;gap:3px;${statusStyle[r.status] || statusStyle.pending};padding:2px 8px;border-radius:9999px;font-size:0.78rem;font-weight:500">
        ${weekNumToDateRange(r.week_number, ayStart)}<span style="opacity:0.65;font-size:0.7rem;margin-left:2px">(${r.status})</span>
        <button onclick="adminDeletePto(${r.id},${residentId})" style="background:none;border:none;cursor:pointer;padding:0 0 0 3px;line-height:1;color:inherit;font-size:1rem" title="Remove">×</button>
      </span>
    `).join('');
    return `
      <div style="margin-bottom:10px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <span style="font-weight:500;font-size:0.875rem">${escHtml(s.name)}</span>
          <span style="font-size:0.75rem;color:var(--text-muted)">${escHtml(s.academic_year)} · ${s.status}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;min-height:22px">
          ${chips || '<span style="color:var(--text-muted);font-size:0.8rem">No PTO dates added</span>'}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="date" id="pto-date-${s.id}"
            ${bounds.min ? `min="${bounds.min}"` : ''} ${bounds.max ? `max="${bounds.max}"` : ''}
            style="padding:3px 8px;border:1px solid var(--border);border-radius:4px;font-size:0.83rem;background:var(--bg);color:var(--text)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();adminAddPtoDate(${residentId},${s.id},${totalWeeks})}" />
          <button class="btn btn-ghost btn-sm" onclick="adminAddPtoDate(${residentId},${s.id},${totalWeeks})">${icon('plus')} Add week</button>
        </div>
        ${ayStart ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">Pick any date within the week you want off — the full week will be added.</div>` : ''}
      </div>
    `;
  }).join('');
}

window.adminAddPtoDate = async function(residentId, scheduleId, totalWeeks) {
  const input = document.getElementById(`pto-date-${scheduleId}`);
  const dateVal = input?.value;
  if (!dateVal) { toast('Select a date', 'error'); return; }
  const ayStart = state.program?.academic_year_start;
  const week = dateToWeekNum(dateVal, ayStart, totalWeeks);
  if (!week) { toast('Date is outside the academic year range', 'error'); return; }
  try {
    await api('POST', '/pto/admin', { resident_id: residentId, schedule_id: scheduleId, week_numbers: [week] });
    toast(`PTO added: ${weekNumToDateRange(week, ayStart)}`);
    input.value = '';
    await refreshResidentPto(residentId);
  } catch (err) { toast(err.message, 'error'); }
};

window.adminDeletePto = async function(ptoId, residentId) {
  try {
    await api('DELETE', `/pto/${ptoId}`);
    toast('PTO week removed');
    await refreshResidentPto(residentId);
  } catch (err) { toast(err.message, 'error'); }
};

async function refreshResidentPto(residentId) {
  const container = document.getElementById('pto-section-container');
  if (!container) return;
  const [schedules, ptoRequests] = await Promise.all([
    api('GET', `/schedules/program/${state.programId}`).catch(() => []),
    api('GET', `/pto/resident/${residentId}`).catch(() => [])
  ]);
  container.innerHTML = (!schedules?.length)
    ? '<p style="color:var(--text-muted);font-size:0.875rem">No schedules yet.</p>'
    : renderResidentPtoSection(residentId, schedules, ptoRequests || []);
}

function renderResidentLeaveSection(residentId, schedules, leavePeriods) {
  const totalBlocks = state.program?.total_blocks || 13;
  return schedules.map(s => {
    const periods = (leavePeriods[s.id] || []);
    const chips = periods.map(p => `
      <span style="display:inline-flex;align-items:center;gap:3px;background:#f0f4f8;border:1px solid var(--border);padding:2px 8px;border-radius:9999px;font-size:0.78rem;font-weight:500">
        Blocks ${p.start_block}–${p.end_block}${p.reason ? ` (${escHtml(p.reason)})` : ''}
        <button onclick="deleteLeave(${p.id},${residentId})" style="background:none;border:none;cursor:pointer;padding:0 0 0 3px;line-height:1;color:var(--text-muted);font-size:1rem" title="Remove">×</button>
      </span>
    `).join('');
    return `
      <div style="margin-bottom:10px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <span style="font-weight:500;font-size:0.875rem">${escHtml(s.name)}</span>
          <span style="font-size:0.75rem;color:var(--text-muted)">${escHtml(s.academic_year)}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;min-height:22px">
          ${chips || '<span style="color:var(--text-muted);font-size:0.8rem">No leave periods</span>'}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span style="font-size:0.8rem;color:var(--text-muted)">Blocks</span>
          <input type="number" id="leave-start-${s.id}" class="form-input" min="1" max="${totalBlocks}" placeholder="From" style="width:70px;padding:3px 6px;font-size:0.83rem" />
          <span style="font-size:0.8rem;color:var(--text-muted)">–</span>
          <input type="number" id="leave-end-${s.id}" class="form-input" min="1" max="${totalBlocks}" placeholder="To" style="width:70px;padding:3px 6px;font-size:0.83rem" />
          <input type="text" id="leave-reason-${s.id}" class="form-input" placeholder="Reason (optional)" style="flex:1;min-width:100px;padding:3px 8px;font-size:0.83rem" />
          <button class="btn btn-ghost btn-sm" onclick="addLeave(${residentId},${s.id})">${icon('plus')} Add</button>
        </div>
      </div>
    `;
  }).join('');
}

window.addLeave = async function(residentId, scheduleId) {
  const start = parseInt(document.getElementById(`leave-start-${scheduleId}`)?.value);
  const end   = parseInt(document.getElementById(`leave-end-${scheduleId}`)?.value);
  const reason = document.getElementById(`leave-reason-${scheduleId}`)?.value || null;
  const totalBlocks = state.program?.total_blocks || 13;
  if (!start || !end) { toast('Enter start and end block', 'error'); return; }
  if (start > end) { toast('Start block must be ≤ end block', 'error'); return; }
  if (end > totalBlocks) { toast(`End block cannot exceed ${totalBlocks}`, 'error'); return; }
  try {
    await api('POST', '/leave-periods', { resident_id: residentId, schedule_id: scheduleId, start_block: start, end_block: end, reason });
    toast('Leave period added');
    await refreshResidentLeave(residentId);
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteLeave = async function(leaveId, residentId) {
  try {
    await api('DELETE', `/leave-periods/${leaveId}`);
    toast('Leave period removed');
    await refreshResidentLeave(residentId);
  } catch (err) { toast(err.message, 'error'); }
};

async function refreshResidentLeave(residentId) {
  const container = document.getElementById('leave-section-container');
  if (!container) return;
  const schedules = await api('GET', `/schedules/program/${state.programId}`).catch(() => []);
  const leavePromises = (schedules || []).map(s =>
    api('GET', `/leave-periods/resident/${residentId}/schedule/${s.id}`).catch(() => [])
  );
  const leaveResults = await Promise.all(leavePromises);
  const leavePeriods = {};
  for (let i = 0; i < (schedules || []).length; i++) leavePeriods[schedules[i].id] = leaveResults[i] || [];
  container.innerHTML = (!schedules?.length)
    ? '<p style="color:var(--text-muted);font-size:0.875rem">No schedules yet.</p>'
    : renderResidentLeaveSection(residentId, schedules, leavePeriods);
}

window.saveResident = async function(e, id) {
  e.preventDefault();
  try {
    const body = {
      name: document.getElementById('r-name').value,
      pgy_year: parseInt(document.getElementById('r-pgy').value),
      pto_weeks_allotted: parseInt(document.getElementById('r-pto').value),
      email: document.getElementById('r-email').value || null,
    };
    if (id) await api('PUT', `/residents/${id}`, body);
    else await api('POST', `/residents/program/${state.programId}`, body);
    toast(id ? 'Resident updated' : 'Resident added');
    closeModal();
    renderResidents();
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteResident = async function(id) {
  if (!confirm('Delete this resident? This cannot be undone.')) return;
  try {
    await api('DELETE', `/residents/${id}`);
    toast('Resident deleted');
    renderResidents();
  } catch (err) { toast(err.message, 'error'); }
};

window.importResidentsCSV = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) { toast('CSV must have a header row and at least one data row', 'error'); return; }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const rec = {};
    headers.forEach((h, j) => { rec[h] = cols[j] || ''; });
    records.push(rec);
  }

  try {
    const result = await api('POST', `/residents/program/${state.programId}/import`, { records });
    const msg = `Imported ${result.inserted} resident${result.inserted !== 1 ? 's' : ''}${result.errors?.length ? ` (${result.errors.length} skipped)` : ''}`;
    toast(msg, result.errors?.length ? 'info' : 'success');
    renderResidents();
  } catch (err) { toast(err.message, 'error'); }
  event.target.value = '';
};

window.generateInvite = async function(id, name) {
  try {
    // Get active schedules for selection
    const schedules = await api('GET', `/schedules/program/${state.programId}`);
    const draftSchedules = schedules?.filter(s => s.status === 'draft') || [];

    const link = `${window.location.origin}/pto-submit?token=`;
    const data = await api('POST', `/residents/${id}/invite`);
    const fullLink = `${window.location.origin}${data.link}`;

    document.getElementById('invite-result').innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2 style="font-size:1rem">Invite Link for ${name}</h2>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('invite-result').innerHTML=''">Dismiss</button>
        </div>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">
          Share this link with the resident to let them submit PTO preferences. Valid for 30 days.
        </p>
        <div class="invite-link-box">${fullLink}</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" data-link="${fullLink.replace(/"/g,'&quot;')}" onclick="navigator.clipboard.writeText(this.dataset.link).then(()=>toast('Copied to clipboard'))">
          ${icon('copy')} Copy Link
        </button>
      </div>
    `;
  } catch (err) { toast(err.message, 'error'); }
};

// ─── Rotations ────────────────────────────────────────────────────────────────
async function renderRotations() {
  const rotations = await api('GET', `/rotations/program/${state.programId}`);

  function rotationTable(list) {
    if (!list.length) return '<p style="color:var(--text-muted);font-size:0.875rem;padding:8px 0">None.</p>';
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Capacity</th>
            <th>PGY Restrictions</th>
            <th>Required Blocks (by PGY)</th>
            <th>PTO Eligible</th>
            <th>Night Float</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(r => `
            <tr>
              <td>
                <span style="display:inline-flex;align-items:center;gap:6px">
                  <span style="width:10px;height:10px;border-radius:50%;background:${rotationColor(r.name)[1]};flex-shrink:0"></span>
                  <strong>${escHtml(r.name)}</strong>
                </span>
              </td>
              <td>${r.min_capacity}–${r.max_capacity}</td>
              <td>${r.pgyRestrictions?.length > 0 ? r.pgyRestrictions.map(y => `<span class="pgy-tag">PGY-${y}</span>`).join(' ') : '<span style="color:var(--text-muted)">Any</span>'}</td>
              <td style="font-size:0.8rem">
                ${Object.keys(r.pgyRequirements || {}).length > 0
                  ? Object.entries(r.pgyRequirements).map(([yr, n]) => `<span class="pgy-tag">PGY-${yr}: ${n}</span>`).join(' ')
                  : '<span style="color:var(--text-muted)">—</span>'}
              </td>
              <td>${r.pto_eligible ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-gray">No</span>'}</td>
              <td>${r.night_float ? '<span class="badge badge-warning">Yes</span>' : '<span class="badge badge-gray">No</span>'}</td>
              <td class="actions">
                <button class="btn btn-ghost btn-sm" onclick="openRotationModal(${r.id})">${icon('edit')} Edit</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="deleteRotation(${r.id})">${icon('trash')} Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  const required = (rotations || []).filter(r => r.type === 'required');
  const elective = (rotations || []).filter(r => r.type === 'elective');

  renderShell('Rotations', `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:8px;flex-wrap:wrap">
      <div style="font-size:0.9rem;color:var(--text-muted)">${rotations?.length || 0} rotations total</div>
      <div style="display:flex;gap:8px">
        <label class="btn btn-ghost" style="cursor:pointer" title="Import rotations from CSV">
          ${icon('download')} Import CSV
          <input type="file" accept=".csv" style="display:none" onchange="importRotationsCSV(event)" />
        </label>
        <button class="btn btn-primary" onclick="openRotationModal()">${icon('plus')} Add Rotation</button>
      </div>
    </div>

    ${rotations?.length > 0 ? `
      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="margin-bottom:16px">
          <h2 style="display:flex;align-items:center;gap:10px">
            <span style="width:12px;height:12px;border-radius:3px;background:var(--navy);flex-shrink:0;display:inline-block"></span>
            Required Rotations
            <span style="font-family:'DM Sans',sans-serif;font-size:0.8rem;font-weight:500;color:var(--text-muted);margin-left:2px">${required.length}</span>
          </h2>
        </div>
        ${rotationTable(required)}
      </div>

      <div class="card">
        <div class="card-header" style="margin-bottom:16px">
          <h2 style="display:flex;align-items:center;gap:10px">
            <span style="width:12px;height:12px;border-radius:3px;background:var(--text-muted);flex-shrink:0;display:inline-block"></span>
            Elective Rotations
            <span style="font-family:'DM Sans',sans-serif;font-size:0.8rem;font-weight:500;color:var(--text-muted);margin-left:2px">${elective.length}</span>
          </h2>
        </div>
        ${rotationTable(elective)}
      </div>
    ` : `<div class="card"><div class="empty-state">${icon('refresh')}<p>No rotations yet. Add rotations to start building schedules.</p></div></div>`}

    <div id="modal-container"></div>
  `);
}

window.openRotationModal = async function(id) {
  const rotations = await api('GET', `/rotations/program/${state.programId}`);
  let r = id ? rotations.find(x => x.id === id) : null;

  document.getElementById('modal-container').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" style="max-width:580px">
        <h2>${r ? 'Edit' : 'Add'} Rotation</h2>
        <form onsubmit="saveRotation(event, ${id || 'null'})">
          <div class="form-group">
            <label class="form-label">Rotation Name</label>
            <input type="text" id="rot-name" class="form-input" value="${r?.name || ''}" required placeholder="e.g. Internal Medicine, Night Float" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Type</label>
              <select id="rot-type" class="form-select">
                <option value="required" ${(!r || r.type === 'required') ? 'selected' : ''}>Required</option>
                <option value="elective" ${r?.type === 'elective' ? 'selected' : ''}>Elective</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">PTO Eligible?</label>
              <select id="rot-pto" class="form-select">
                <option value="0" ${!r?.pto_eligible ? 'selected' : ''}>No</option>
                <option value="1" ${r?.pto_eligible ? 'selected' : ''}>Yes</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Night Float?</label>
              <select id="rot-night" class="form-select">
                <option value="0" ${!r?.night_float ? 'selected' : ''}>No</option>
                <option value="1" ${r?.night_float ? 'selected' : ''}>Yes — counts as night block</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Duration</label>
              <select id="rot-twoweek" class="form-select" onchange="updateSplitVisibility()">
                <option value="0" ${!r?.two_week ? 'selected' : ''}>Full block (4 wks)</option>
                <option value="1" ${r?.two_week ? 'selected' : ''}>Half block (2 wks)</option>
              </select>
            </div>
          </div>
          <div class="form-group" id="rot-split-row" style="${r?.two_week ? 'display:none' : ''}">
            <label class="form-label">Allow split to half-block?</label>
            <select id="rot-split" class="form-select">
              <option value="0" ${!r?.can_split_to_half ? 'selected' : ''}>No — always full block</option>
              <option value="1" ${r?.can_split_to_half ? 'selected' : ''}>Yes — use half-block when only one slot open</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Preferred Block Range <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-muted)">(optional)</span></label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="number" id="rot-prefmin" class="form-input" value="${r?.preferred_block_min ?? ''}" min="1" max="52" placeholder="From block" style="flex:1" />
                <span style="color:var(--text-muted);font-size:0.85rem">–</span>
                <input type="number" id="rot-prefmax" class="form-input" value="${r?.preferred_block_max ?? ''}" min="1" max="52" placeholder="To block" style="flex:1" />
              </div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">Scheduler scores placements inside this range higher. Leave blank for no preference.</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Required Blocks by PGY Year <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-muted)">(0 = no minimum)</span></label>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              ${[1,2,3,4,5,6,7].map(y => `
                <div>
                  <label style="font-size:0.72rem;color:var(--text-muted);font-weight:600;display:block;margin-bottom:3px">PGY-${y}</label>
                  <input type="number" name="pgy-req-${y}" class="form-input" value="${r?.pgyRequirements?.[y] ?? 0}" min="0" max="52" style="padding:6px 8px" />
                </div>
              `).join('')}
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Min Residents/Block</label>
              <input type="number" id="rot-min" class="form-input" value="${r?.min_capacity ?? 1}" min="0" max="50" />
            </div>
            <div class="form-group">
              <label class="form-label">Max Residents/Block</label>
              <input type="number" id="rot-max" class="form-input" value="${r?.max_capacity ?? 3}" min="1" max="50" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">PGY Year Restrictions (leave empty = any year)</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${[1,2,3,4,5,6,7].map(y => `
                <label style="display:flex;align-items:center;gap:4px;font-size:0.85rem;cursor:pointer">
                  <input type="checkbox" name="pgy" value="${y}" ${r?.pgyRestrictions?.includes(y) ? 'checked' : ''} style="accent-color:var(--teal)" />
                  PGY-${y}
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Gap Rules</label>
            <div id="gap-rules-list">
              ${(r?.gapRules || []).map((rule, i) => renderGapRuleRow(i, rule, rotations.filter(x => x.id !== id))).join('')}
            </div>
            <button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="addGapRule(${JSON.stringify(rotations.filter(x => x.id !== id)).replace(/"/g, '&quot;')})">
              ${icon('plus')} Add Gap Rule
            </button>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">${r ? 'Save Changes' : 'Add Rotation'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
};

function renderGapRuleRow(i, rule, otherRotations) {
  return `
    <div id="gap-row-${i}" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <span style="font-size:0.8rem;color:var(--text-muted);white-space:nowrap">Cannot follow:</span>
      <select name="gap-after" class="form-select" style="flex:1">
        ${otherRotations.map(r => `<option value="${r.id}" ${rule?.after_rotation_id === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
      </select>
      <span style="font-size:0.8rem;color:var(--text-muted);white-space:nowrap">by less than</span>
      <input type="number" name="gap-blocks" class="form-input" style="width:60px" value="${rule?.min_gap_blocks || 1}" min="1" />
      <span style="font-size:0.8rem;color:var(--text-muted)">block(s)</span>
      <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('gap-row-${i}').remove()">✕</button>
    </div>
  `;
}

window.updateSplitVisibility = function() {
  const twoWeek = document.getElementById('rot-twoweek')?.value === '1';
  const row = document.getElementById('rot-split-row');
  if (row) row.style.display = twoWeek ? 'none' : '';
};

let gapRuleCount = 0;
window.addGapRule = function(rotationsJson) {
  const rotations = JSON.parse(rotationsJson.replace(/&quot;/g, '"'));
  const list = document.getElementById('gap-rules-list');
  const div = document.createElement('div');
  div.innerHTML = renderGapRuleRow(++gapRuleCount, null, rotations);
  list.appendChild(div.firstElementChild);
};

window.saveRotation = async function(e, id) {
  e.preventDefault();
  try {
    const pgyRestrictions = [...document.querySelectorAll('input[name="pgy"]:checked')].map(el => parseInt(el.value));
    const gapRows = document.querySelectorAll('[id^="gap-row-"]');
    const gapRules = [...gapRows].map(row => ({
      after_rotation_id: parseInt(row.querySelector('[name="gap-after"]').value),
      min_gap_blocks: parseInt(row.querySelector('[name="gap-blocks"]').value),
    })).filter(r => r.after_rotation_id);

    const pgyRequirements = {};
    [1,2,3,4,5,6,7].forEach(y => {
      const val = parseInt(document.querySelector(`[name="pgy-req-${y}"]`)?.value) || 0;
      if (val > 0) pgyRequirements[y] = val;
    });

    const twoWeek = document.getElementById('rot-twoweek').value === '1';
    const prefMin = document.getElementById('rot-prefmin').value;
    const prefMax = document.getElementById('rot-prefmax').value;
    const body = {
      name: document.getElementById('rot-name').value,
      type: document.getElementById('rot-type').value,
      min_capacity: parseInt(document.getElementById('rot-min').value),
      max_capacity: parseInt(document.getElementById('rot-max').value),
      pto_eligible: document.getElementById('rot-pto').value === '1',
      night_float: document.getElementById('rot-night').value === '1',
      two_week: twoWeek,
      can_split_to_half: !twoWeek && document.getElementById('rot-split').value === '1',
      preferred_block_min: prefMin ? parseInt(prefMin) : null,
      preferred_block_max: prefMax ? parseInt(prefMax) : null,
      pgyRestrictions,
      gapRules,
      pgyRequirements,
    };
    if (id) await api('PUT', `/rotations/${id}`, body);
    else await api('POST', `/rotations/program/${state.programId}`, body);
    toast(id ? 'Rotation updated' : 'Rotation added');
    closeModal();
    renderRotations();
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteRotation = async function(id) {
  if (!confirm('Delete this rotation? This cannot be undone.')) return;
  try {
    await api('DELETE', `/rotations/${id}`);
    toast('Rotation deleted');
    renderRotations();
  } catch (err) { toast(err.message, 'error'); }
};

window.importRotationsCSV = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) { toast('CSV must have a header row and at least one data row', 'error'); return; }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const rec = {};
    headers.forEach((h, j) => { rec[h] = cols[j] || ''; });
    // Normalise boolean-ish columns
    for (const boolCol of ['pto_eligible','night_float','two_week']) {
      if (rec[boolCol] !== undefined) rec[boolCol] = ['1','true','yes'].includes(String(rec[boolCol]).toLowerCase());
    }
    records.push(rec);
  }

  try {
    const result = await api('POST', `/rotations/program/${state.programId}/import`, { records });
    const msg = `Imported ${result.inserted} rotation${result.inserted !== 1 ? 's' : ''}${result.errors?.length ? ` (${result.errors.length} skipped)` : ''}`;
    toast(msg, result.errors?.length ? 'info' : 'success');
    renderRotations();
  } catch (err) { toast(err.message, 'error'); }
  event.target.value = '';
};

// ─── PTO Requests ─────────────────────────────────────────────────────────────
async function renderPTORequests() {
  const schedules = await api('GET', `/schedules/program/${state.programId}`);
  const activeScheduleId = schedules?.[0]?.id;

  let requests = [];
  if (activeScheduleId) {
    requests = await api('GET', `/pto/schedule/${activeScheduleId}`) || [];
  }

  renderShell('PTO Requests', `
    ${schedules?.length > 0 ? `
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px">
        <label class="form-label" style="margin:0">Schedule:</label>
        <select class="form-select" style="width:auto" id="pto-schedule-select" onchange="loadPTOForSchedule(this.value)">
          ${schedules.map(s => `<option value="${s.id}">${s.name} (${s.academic_year})</option>`).join('')}
        </select>
      </div>
    ` : ''}
    <div class="card" id="pto-list-container">
      <div class="card-header">
        <h2>PTO Requests</h2>
        <div style="display:flex;gap:8px">
          <span class="badge badge-warning" id="pending-count">— pending</span>
        </div>
      </div>
      ${!activeScheduleId ? `<div class="empty-state">${icon('calendar')}<p>No schedules yet. Create a schedule first to collect PTO requests.</p></div>` :
        renderPTOTable(requests)}
    </div>
    <div id="modal-container"></div>
  `);

  updatePendingCount(requests);
}

function renderPTOTable(requests) {
  if (!requests?.length) {
    return `<div class="empty-state">${icon('calendar')}<p>No PTO requests yet. Send invite links to residents to collect requests.</p></div>`;
  }
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Resident</th>
          <th>PGY</th>
          <th>Dates</th>
          <th>Status</th>
          <th>Notes</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${requests.map(r => `
          <tr>
            <td><strong>${r.resident_name}</strong></td>
            <td><span class="pgy-tag">PGY-${r.pgy_year}</span></td>
            <td>${weekNumToDateRange(r.week_number, state.program?.academic_year_start)}</td>
            <td>
              <span class="badge ${r.status === 'approved' ? 'badge-success' : r.status === 'denied' ? 'badge-error' : 'badge-warning'}">
                ${r.status}
              </span>
            </td>
            <td style="color:var(--text-muted);font-size:0.8rem">${r.notes || '—'}</td>
            <td class="actions">
              ${r.status === 'pending' ? `
                <button class="btn btn-ghost btn-sm" style="color:var(--success)" onclick="updatePTO(${r.id},'approved')">
                  ${icon('check')} Approve
                </button>
                <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="updatePTO(${r.id},'denied')">
                  ${icon('x')} Deny
                </button>
              ` : `
                <button class="btn btn-ghost btn-sm" onclick="updatePTO(${r.id},'pending')">Reset</button>
              `}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function updatePendingCount(requests) {
  const el = document.getElementById('pending-count');
  if (el) {
    const pending = requests?.filter(r => r.status === 'pending').length || 0;
    el.textContent = `${pending} pending`;
  }
}

window.loadPTOForSchedule = async function(scheduleId) {
  const requests = await api('GET', `/pto/schedule/${scheduleId}`) || [];
  document.getElementById('pto-list-container').innerHTML = `
    <div class="card-header">
      <h2>PTO Requests</h2>
      <span class="badge badge-warning" id="pending-count">— pending</span>
    </div>
    ${renderPTOTable(requests)}
  `;
  updatePendingCount(requests);
};

window.updatePTO = async function(id, status) {
  try {
    await api('PUT', `/pto/${id}`, { status });
    toast(`Request ${status}`);
    renderPTORequests();
  } catch (err) { toast(err.message, 'error'); }
};

// ─── Schedules ────────────────────────────────────────────────────────────────
async function renderSchedules() {
  const schedules = await api('GET', `/schedules/program/${state.programId}`);

  renderShell('Schedules', `
    <div class="card">
      <div class="card-header">
        <h2>Schedules</h2>
        <button class="btn btn-primary" onclick="openScheduleModal()">
          ${icon('plus')} New Schedule
        </button>
      </div>
      ${schedules?.length > 0 ? `
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Academic Year</th>
              <th>Status</th>
              <th>Violations</th>
              <th>Generated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${schedules.map(s => `
              <tr>
                <td><strong>${s.name}</strong></td>
                <td style="color:var(--text-muted)">${s.academic_year}</td>
                <td><span class="badge ${s.status === 'published' ? 'badge-teal' : 'badge-gray'}">${s.status}</span></td>
                <td>
                  ${s.error_count > 0 ? `<span class="badge badge-error">${s.error_count} errors</span> ` : ''}
                  ${s.warning_count > 0 ? `<span class="badge badge-warning">${s.warning_count} warnings</span>` : ''}
                  ${s.error_count === 0 && s.warning_count === 0 && s.generated_at ? `<span class="badge badge-success">Clean</span>` : ''}
                  ${!s.generated_at ? '<span style="color:var(--text-muted);font-size:0.8rem">Not generated</span>' : ''}
                </td>
                <td style="color:var(--text-muted);font-size:0.8rem">${s.generated_at ? new Date(s.generated_at).toLocaleDateString() : '—'}</td>
                <td class="actions">
                  <button class="btn btn-primary btn-sm" onclick="generateSchedule(${s.id})" title="Run scheduler">
                    ${icon('zap')} Generate
                  </button>
                  <button class="btn btn-ghost btn-sm" onclick="navigate('schedule-detail',{scheduleId:${s.id}})">
                    ${icon('eye')} View
                  </button>
                  <button class="btn btn-ghost btn-sm" onclick="exportSchedule(${s.id})">
                    ${icon('download')} Export
                  </button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="deleteSchedule(${s.id})">
                    ${icon('trash')}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<div class="empty-state">${icon('list')}<p>No schedules yet. Create one to get started.</p></div>`}
    </div>
    <div id="modal-container"></div>
  `);
}

window.openScheduleModal = function() {
  const year = new Date().getFullYear();
  document.getElementById('modal-container').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <h2>New Schedule</h2>
        <form onsubmit="createSchedule(event)">
          <div class="form-group">
            <label class="form-label">Schedule Name</label>
            <input type="text" id="sc-name" class="form-input" value="AY ${year}-${year+1}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Academic Year</label>
            <input type="text" id="sc-year" class="form-input" value="${year}-${year+1}" required placeholder="2025-2026" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Schedule</button>
          </div>
        </form>
      </div>
    </div>
  `;
};

window.createSchedule = async function(e) {
  e.preventDefault();
  try {
    await api('POST', `/schedules/program/${state.programId}`, {
      name: document.getElementById('sc-name').value,
      academic_year: document.getElementById('sc-year').value,
    });
    toast('Schedule created');
    closeModal();
    renderSchedules();
  } catch (err) { toast(err.message, 'error'); }
};

window.generateSchedule = async function(id) {
  const btn = event.target.closest('button');
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="loader" style="border-color:rgba(255,255,255,0.3);border-top-color:#fff"></span> Running…';
  btn.disabled = true;
  try {
    const result = await api('POST', `/schedules/${id}/generate`);
    const msg = result.errorCount > 0
      ? `Generated with ${result.errorCount} errors, ${result.warningCount} warnings`
      : result.warningCount > 0
        ? `Generated with ${result.warningCount} warnings`
        : 'Schedule generated — no violations!';
    toast(msg, result.errorCount > 0 ? 'error' : result.warningCount > 0 ? 'info' : 'success');
    renderSchedules();
  } catch (err) {
    toast(err.message, 'error');
    btn.innerHTML = orig;
    btn.disabled = false;
  }
};

window.deleteSchedule = async function(id) {
  if (!confirm('Delete this schedule? All assignments and violations will be lost.')) return;
  try {
    await api('DELETE', `/schedules/${id}`);
    toast('Schedule deleted');
    renderSchedules();
  } catch (err) { toast(err.message, 'error'); }
};

// ─── Schedule Detail (grid) ───────────────────────────────────────────────────
async function renderScheduleDetail(scheduleId) {
  const data = await api('GET', `/schedules/${scheduleId}`);
  if (!data) return;

  const { schedule, assignments, violations } = data;
  const residents = await api('GET', `/residents/program/${state.programId}`);
  const rotations = await api('GET', `/rotations/program/${state.programId}`);

  // Build lookup: residentId → blockNumber → blockHalf → assignment
  const lookup = {};
  for (const a of assignments) {
    if (!lookup[a.resident_id]) lookup[a.resident_id] = {};
    if (!lookup[a.resident_id][a.block_number]) lookup[a.resident_id][a.block_number] = {};
    lookup[a.resident_id][a.block_number][a.block_half || 'full'] = a;
  }

  // Get assignment for a specific half; 'full' assignments count for both A and B
  function getHalfAssign(residentId, blockNum, half) {
    const block = lookup[residentId]?.[blockNum];
    if (!block) return null;
    return block[half] || block['full'] || null;
  }

  // Violation lookup: residentId_blockNumber → severity
  const violationLookup = {};
  for (const v of violations) {
    if (v.resident_id && v.block_number) {
      const key = `${v.resident_id}_${v.block_number}`;
      const current = violationLookup[key];
      if (!current || (v.severity === 'error' && current === 'warning')) {
        violationLookup[key] = v.severity;
      }
    }
  }

  const totalBlocks = state.program?.total_blocks || 13;
  const startDate = state.program?.academic_year_start ? new Date(state.program.academic_year_start) : null;
  const blockLengthWeeks = state.program?.block_length_weeks || 4;

  const halfWeeks = Math.ceil(blockLengthWeeks / 2);

  function blockLabel(b, half) {
    const suffix = half === 'A' ? 'A' : 'B';
    if (!startDate) return `${b}${suffix}`;
    const d = new Date(startDate);
    const halfOffset = half === 'B' ? halfWeeks * 7 : 0;
    d.setDate(d.getDate() + (b - 1) * blockLengthWeeks * 7 + halfOffset);
    return `${b}${suffix}<br><span style="font-size:0.6rem;font-weight:400;opacity:0.7">${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>`;
  }

  const gridHTML = `
    <div class="schedule-grid-wrapper">
      <table class="schedule-grid">
        <thead>
          <tr>
            <th class="resident-col">Resident</th>
            ${Array.from({length: totalBlocks}, (_, i) => `<th>${blockLabel(i+1,'A')}</th><th>${blockLabel(i+1,'B')}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${residents.map(r => `
            <tr>
              <td class="resident-name-cell">
                ${r.name}<br>
                <span class="pgy-tag">PGY-${r.pgy_year}</span>
              </td>
              ${Array.from({length: totalBlocks}, (_, i) => {
                const b = i + 1;
                const vSeverity = violationLookup[`${r.id}_${b}`];
                const rotationsJson = JSON.stringify(rotations).replace(/"/g,'&quot;');

                function renderHalfCell(half) {
                  const a = getHalfAssign(r.id, b, half);
                  if (!a) {
                    return `<td style="background:#fafafa;cursor:pointer" title="Click to assign" onclick="openCellEdit(${schedule.id},null,${r.id},${b},'${half}','—',${rotationsJson})"></td>`;
                  }
                  if (!a.rotation_id && a.ptoWeeks?.length > 0) {
                    return `<td title="PTO"><div class="rotation-cell" style="background:#fff8e8;color:#b45309">PTO</div></td>`;
                  }
                  const [bg, fg] = rotationColor(a.rotation_name);
                  const isFull = (a.block_half || 'full') === 'full';
                  const isPinned = Boolean(a.pinned);
                  return `<td class="${vSeverity ? 'violation-cell' + (vSeverity === 'warning' ? ' violation-warning' : '') : ''}" title="${isPinned ? 'Pinned — click to edit' : 'Click to edit'}">
                    <div class="rotation-cell editable-cell" style="background:${bg};color:${fg};position:relative" onclick="openCellEdit(${schedule.id},${a.id},${r.id},${b},'${half}','${(a.rotation_name||'').replace(/'/g,"\\'")}',${rotationsJson})">
                      ${isPinned ? `<span style="position:absolute;top:2px;right:3px;font-size:0.65rem;opacity:0.7" title="Pinned">🔒</span>` : ''}
                      ${a.rotation_name || '—'}
                      ${isFull ? '' : `<div style="font-size:0.6rem;opacity:0.6">${a.block_half}</div>`}
                      ${a.ptoWeeks?.length > 0 ? `<div class="rotation-cell pto-weeks">+${a.ptoWeeks.length}w PTO</div>` : ''}
                    </div>
                  </td>`;
                }

                return renderHalfCell('A') + renderHalfCell('B');
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const errorViolations = violations.filter(v => v.severity === 'error');
  const warningViolations = violations.filter(v => v.severity === 'warning');

  renderShell(`Schedule: ${schedule.name}`, `
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
      <span class="badge ${schedule.status === 'published' ? 'badge-teal' : 'badge-gray'}">${schedule.status}</span>
      <span style="color:var(--text-muted);font-size:0.85rem">${schedule.academic_year}</span>
      ${schedule.generated_at ? `<span style="color:var(--text-muted);font-size:0.85rem">Generated ${new Date(schedule.generated_at).toLocaleDateString()}</span>` : ''}
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="generateScheduleFromDetail(${schedule.id})">
          ${icon('zap')} Regenerate
        </button>
        <button class="btn btn-ghost" onclick="exportSchedule(${schedule.id})">
          ${icon('download')} Export CSV
        </button>
        <button class="btn btn-ghost" onclick="window.print()" title="Print schedule">
          ${icon('print')} Print
        </button>
        ${schedule.status === 'draft' ? `
          <button class="btn btn-navy" onclick="publishSchedule(${schedule.id})">
            ${icon('check')} Publish
          </button>
        ` : ''}
      </div>
    </div>

    ${violations.length > 0 ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        ${errorViolations.length > 0 ? `
          <div class="card" style="border-color:rgba(220,53,69,0.25);background:rgba(220,53,69,0.03)">
            <div class="card-header" style="margin-bottom:12px">
              <h2 style="font-size:1rem;color:var(--error)">Errors (${errorViolations.length})</h2>
            </div>
            ${errorViolations.slice(0,10).map(v => `
              <div class="violation-item error">
                <span class="violation-icon">⛔</span>
                <div>
                  <div style="font-weight:600;font-size:0.78rem;color:var(--error)">${v.violation_type}</div>
                  <div>${v.message}</div>
                </div>
              </div>
            `).join('')}
            ${errorViolations.length > 10 ? `<div style="color:var(--text-muted);font-size:0.8rem;margin-top:8px">+${errorViolations.length - 10} more errors</div>` : ''}
          </div>
        ` : ''}
        ${warningViolations.length > 0 ? `
          <div class="card" style="border-color:rgba(245,158,11,0.25);background:rgba(245,158,11,0.03)">
            <div class="card-header" style="margin-bottom:12px">
              <h2 style="font-size:1rem;color:#b45309">Warnings (${warningViolations.length})</h2>
            </div>
            ${warningViolations.slice(0,10).map(v => `
              <div class="violation-item warning">
                <span class="violation-icon">⚠️</span>
                <div>
                  <div style="font-weight:600;font-size:0.78rem;color:#b45309">${v.violation_type}</div>
                  <div>${v.message}</div>
                </div>
              </div>
            `).join('')}
            ${warningViolations.length > 10 ? `<div style="color:var(--text-muted);font-size:0.8rem;margin-top:8px">+${warningViolations.length - 10} more warnings</div>` : ''}
          </div>
        ` : ''}
      </div>
    ` : schedule.generated_at ? `
      <div class="card" style="border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.04);margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px;color:#059669">
          <span style="font-size:1.2rem">✓</span>
          <strong>Schedule generated with no violations.</strong>
        </div>
      </div>
    ` : ''}

    <div style="margin-bottom:20px">
      <div style="display:flex;gap:0;border-bottom:2px solid var(--border)">
        <button class="schedule-tab active" id="tab-grid" onclick="showScheduleTab('grid',${schedule.id})">
          ${icon('list')} Schedule Grid
        </button>
        <button class="schedule-tab" id="tab-elective" onclick="showScheduleTab('elective',${schedule.id})">
          ${icon('bar-chart')} Elective Prefs
        </button>
        <button class="schedule-tab" id="tab-log" onclick="showScheduleTab('log',${schedule.id})">
          ${icon('clock')} Change Log
        </button>
      </div>
    </div>

    <div id="tab-panel-grid">
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <h2 style="font-size:1rem;margin:0 0 2px;font-family:'DM Serif Display',serif;color:var(--navy)">Schedule Grid</h2>
            <div style="font-size:0.75rem;color:var(--text-muted)">Click any cell to edit that assignment</div>
          </div>
          <div style="display:flex;gap:12px;font-size:0.78rem;align-items:center">
            <span style="display:flex;align-items:center;gap:4px">
              <span style="width:12px;height:12px;border-radius:3px;background:rgba(220,53,69,0.2);outline:2px solid var(--error);display:inline-block"></span> Error
            </span>
            <span style="display:flex;align-items:center;gap:4px">
              <span style="width:12px;height:12px;border-radius:3px;background:rgba(245,158,11,0.1);outline:2px solid var(--warning);display:inline-block"></span> Warning
            </span>
            <span style="display:flex;align-items:center;gap:4px">
              <span style="width:12px;height:12px;border-radius:3px;background:#fff8e8;display:inline-block"></span> PTO
            </span>
          </div>
        </div>
        ${assignments.length > 0 ? gridHTML : `<div class="empty-state">${icon('zap')}<p>Run the scheduler to generate assignments.</p></div>`}
      </div>
    </div>

    <div id="tab-panel-elective" style="display:none">
      <div id="elective-prefs-content">
        <div style="padding:20px;color:var(--text-muted);font-size:0.85rem">Loading…</div>
      </div>
    </div>

    <div id="tab-panel-log" style="display:none">
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
          <h2 style="font-size:1rem;margin:0;font-family:'DM Serif Display',serif;color:var(--navy)">Change Log</h2>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Every edit, swap, and regeneration is recorded here.</div>
        </div>
        <div id="change-log-content" style="padding:4px 0">
          <div style="padding:20px;color:var(--text-muted);font-size:0.85rem">Loading…</div>
        </div>
      </div>
    </div>

    <div id="modal-container"></div>
  `);
}

window.generateScheduleFromDetail = async function(id) {
  const btn = event.target.closest('button');
  btn.innerHTML = '<span class="loader"></span> Running…';
  btn.disabled = true;
  try {
    const result = await api('POST', `/schedules/${id}/generate`);
    toast(result.errorCount > 0 ? `Generated with ${result.errorCount} errors` : 'Schedule regenerated!',
          result.errorCount > 0 ? 'error' : 'success');
    renderScheduleDetail(id);
  } catch (err) { toast(err.message, 'error'); btn.innerHTML = `${icon('zap')} Regenerate`; btn.disabled = false; }
};

window.publishSchedule = async function(id) {
  if (!confirm('Publish this schedule? Residents will no longer be able to submit PTO changes.')) return;
  try {
    await api('PUT', `/schedules/${id}`, { status: 'published' });
    toast('Schedule published');
    renderScheduleDetail(id);
  } catch (err) { toast(err.message, 'error'); }
};

window.showScheduleTab = async function(tab, scheduleId) {
  document.querySelectorAll('.schedule-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  document.getElementById('tab-panel-grid').style.display = tab === 'grid' ? '' : 'none';
  document.getElementById('tab-panel-elective').style.display = tab === 'elective' ? '' : 'none';
  document.getElementById('tab-panel-log').style.display = tab === 'log' ? '' : 'none';

  if (tab === 'elective') {
    await loadElectivePrefsTab(scheduleId);
    return;
  }

  if (tab === 'log') {
    const entries = await api('GET', `/changelog/schedule/${scheduleId}`).catch(() => []);
    const el = document.getElementById('change-log-content');
    if (!entries?.length) {
      el.innerHTML = `<div class="empty-state">${icon('clock')}<p>No changes recorded yet.</p></div>`;
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>When</th><th>Type</th><th>Block</th><th>Details</th></tr>
        </thead>
        <tbody>
          ${entries.map(e => `
            <tr>
              <td style="color:var(--text-muted);font-size:0.8rem;white-space:nowrap">${new Date(e.created_at).toLocaleString()}</td>
              <td>
                <span class="badge ${e.change_type === 'regenerated' ? 'badge-navy' : e.change_type === 'swap_approved' ? 'badge-teal' : 'badge-gray'}">
                  ${e.change_type.replace(/_/g,' ')}
                </span>
              </td>
              <td style="color:var(--text-muted)">${e.block_number ? `Block ${e.block_number}` : '—'}</td>
              <td style="font-size:0.82rem">
                ${e.old_value ? `<span style="color:var(--text-muted)">${e.old_value}</span>` : ''}
                ${e.old_value && e.new_value ? ` → ` : ''}
                ${e.new_value ? `<strong>${e.new_value}</strong>` : ''}
                ${e.resident_name ? `<span style="color:var(--text-muted);margin-left:4px">(${e.resident_name})</span>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
};

async function loadElectivePrefsTab(scheduleId) {
  const el = document.getElementById('elective-prefs-content');
  if (!el) return;

  const [prefs, residents, rotations] = await Promise.all([
    api('GET', `/elective-preferences/schedule/${scheduleId}`).catch(() => []),
    api('GET', `/residents/program/${state.programId}`).catch(() => []),
    api('GET', `/rotations/program/${state.programId}`).catch(() => []),
  ]);

  const electiveRots = (rotations || []).filter(r => r.type === 'elective');
  const prefsByResident = {};
  for (const p of (prefs || [])) {
    if (!prefsByResident[p.resident_id]) prefsByResident[p.resident_id] = [];
    prefsByResident[p.resident_id].push(p);
  }

  if (!electiveRots.length) {
    el.innerHTML = `<div class="card"><div class="empty-state">${icon('bar-chart')}<p>No elective rotations defined. Add rotations with type "Elective" first.</p></div></div>`;
    return;
  }

  const electiveRotsJson = JSON.stringify(electiveRots).replace(/"/g, '&quot;');

  const residentBlocks = (residents || []).map(r => {
    const myPrefs = (prefsByResident[r.id] || []).sort((a, b) => a.rank - b.rank);
    const usedRotIds = new Set(myPrefs.map(p => p.rotation_id));
    const available = electiveRots.filter(rot => !usedRotIds.has(rot.id));
    return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div>
            <strong>${escHtml(r.name)}</strong>
            <span class="pgy-tag" style="margin-left:6px">PGY-${r.pgy_year}</span>
          </div>
          <span style="font-size:0.78rem;color:var(--text-muted)">${myPrefs.length} preference${myPrefs.length !== 1 ? 's' : ''}</span>
        </div>
        ${myPrefs.length > 0 ? `
          <table class="data-table" style="margin-bottom:12px">
            <thead><tr><th style="width:50px">Rank</th><th>Rotation</th><th style="width:80px">Actions</th></tr></thead>
            <tbody>
              ${myPrefs.map((p, idx) => `
                <tr>
                  <td style="text-align:center;font-weight:600;color:var(--teal)">${p.rank}</td>
                  <td>${escHtml(p.rotation_name)}</td>
                  <td class="actions">
                    ${idx > 0 ? `<button class="btn btn-ghost btn-sm" title="Move up" onclick="moveElectivePref(${scheduleId},${p.id},${myPrefs[idx-1].id},'up')">↑</button>` : ''}
                    <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="deleteElectivePref(${p.id},${scheduleId})">${icon('trash')}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px">No preferences set yet.</div>`}
        ${available.length > 0 ? `
          <div style="display:flex;gap:8px;align-items:center">
            <select id="ep-select-${r.id}" class="form-select" style="flex:1">
              ${available.map(rot => `<option value="${rot.id}">${escHtml(rot.name)}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm" onclick="addElectivePref(${r.id},${scheduleId})">
              ${icon('plus')} Add
            </button>
          </div>
        ` : `<div style="font-size:0.8rem;color:var(--text-muted)">All elective rotations ranked.</div>`}
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:16px;font-size:0.85rem;color:var(--text-muted)">
      Set each resident's ranked elective preferences. The scheduler fills elective slots in rank order.
    </div>
    ${residentBlocks || `<div class="card"><div class="empty-state">${icon('users')}<p>No residents found.</p></div></div>`}
  `;
}

window.addElectivePref = async function(residentId, scheduleId) {
  const sel = document.getElementById(`ep-select-${residentId}`);
  const rotationId = parseInt(sel?.value);
  if (!rotationId) return;

  const prefs = await api('GET', `/elective-preferences/schedule/${scheduleId}`).catch(() => []);
  const myPrefs = (prefs || []).filter(p => p.resident_id === residentId);
  const nextRank = myPrefs.length > 0 ? Math.max(...myPrefs.map(p => p.rank)) + 1 : 1;

  try {
    await api('POST', '/elective-preferences', { resident_id: residentId, schedule_id: scheduleId, rotation_id: rotationId, rank: nextRank });
    toast('Preference added');
    await loadElectivePrefsTab(scheduleId);
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteElectivePref = async function(prefId, scheduleId) {
  try {
    await api('DELETE', `/elective-preferences/${prefId}`);
    toast('Preference removed');
    await loadElectivePrefsTab(scheduleId);
  } catch (err) { toast(err.message, 'error'); }
};

window.moveElectivePref = async function(scheduleId, prefId, swapWithId, direction) {
  const prefs = await api('GET', `/elective-preferences/schedule/${scheduleId}`).catch(() => []);
  const pref = prefs.find(p => p.id === prefId);
  const swapPref = prefs.find(p => p.id === swapWithId);
  if (!pref || !swapPref) return;
  try {
    await Promise.all([
      api('POST', '/elective-preferences', { resident_id: pref.resident_id, schedule_id: scheduleId, rotation_id: pref.rotation_id, rank: swapPref.rank }),
      api('POST', '/elective-preferences', { resident_id: swapPref.resident_id, schedule_id: scheduleId, rotation_id: swapPref.rotation_id, rank: pref.rank }),
    ]);
    await loadElectivePrefsTab(scheduleId);
  } catch (err) { toast(err.message, 'error'); }
};

window.openCellEdit = function(scheduleId, assignmentId, residentId, blockNumber, blockHalf, currentRotation, rotationsRaw) {
  const rotations = typeof rotationsRaw === 'string'
    ? JSON.parse(rotationsRaw.replace(/&quot;/g, '"'))
    : rotationsRaw;

  const existing = document.getElementById('modal-container');
  if (!existing) return;

  const halfLabel = blockHalf === 'A' ? ' — First Half (A)' : blockHalf === 'B' ? ' — Second Half (B)' : '';

  // Look up current pinned state from the assignments already in scope via assignmentId
  const isPinned = assignmentId ? false : false; // will be populated below via data attribute

  existing.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" style="max-width:400px">
        <h2 style="font-size:1.1rem">Edit Assignment</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin-top:-8px">Block ${blockNumber}${halfLabel} — currently: <strong>${currentRotation}</strong></p>
        <div class="form-group">
          <label class="form-label">Change to</label>
          <select id="cell-edit-rotation" class="form-select">
            <option value="">— Unassigned —</option>
            ${rotations.map(r => `<option value="${r.id}" ${r.name === currentRotation ? 'selected' : ''}>${r.name}${r.two_week ? ' (2-wk)' : ''}</option>`).join('')}
          </select>
        </div>
        ${assignmentId ? `
        <div class="form-group" style="margin-bottom:8px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.875rem">
            <input type="checkbox" id="cell-pin-toggle" style="accent-color:var(--teal);width:16px;height:16px" />
            <span>Lock / pin this assignment (regeneration will not override it)</span>
          </label>
        </div>
        ` : ''}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveCellEdit(${scheduleId},${assignmentId || 'null'},${residentId},${blockNumber},'${blockHalf}')">Save Change</button>
        </div>
      </div>
    </div>
  `;

  // Fetch current pinned state and check the box if needed
  if (assignmentId) {
    api('GET', `/schedules/${scheduleId}`).then(data => {
      const asgn = data?.assignments?.find(a => a.id === assignmentId);
      const box = document.getElementById('cell-pin-toggle');
      if (box && asgn) box.checked = Boolean(asgn.pinned);
    }).catch(() => {});
  }
};

window.saveCellEdit = async function(scheduleId, assignmentId, residentId, blockNumber, blockHalf) {
  const rotationId = document.getElementById('cell-edit-rotation').value;
  const pinned = document.getElementById('cell-pin-toggle')?.checked || false;
  try {
    const result = await api('PUT', `/schedules/${scheduleId}/assignments/upsert`, {
      resident_id: residentId,
      block_number: blockNumber,
      block_half: blockHalf,
      rotation_id: rotationId ? parseInt(rotationId) : null,
    });
    // Update pin state separately if assignment existed
    if (assignmentId) {
      await api('PUT', `/schedules/${scheduleId}/assignments/${assignmentId}/pin`, { pinned });
    }
    toast(`Block ${result.block}${blockHalf !== 'full' ? result.half : ''}: ${result.oldRot} → ${result.newRot}`);
    closeModal();
    renderScheduleDetail(scheduleId);
  } catch (err) { toast(err.message, 'error'); }
};

// ─── Sick Days ────────────────────────────────────────────────────────────────
async function renderSickDays() {
  const [schedules, residents] = await Promise.all([
    api('GET', `/schedules/program/${state.programId}`),
    api('GET', `/residents/program/${state.programId}`),
  ]);
  const activeScheduleId = schedules?.[0]?.id;
  const sickDays = activeScheduleId ? await api('GET', `/sick-days/schedule/${activeScheduleId}`) || [] : [];

  renderShell('Sick Days', `
    ${schedules?.length > 0 ? `
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px">
        <label class="form-label" style="margin:0">Schedule:</label>
        <select class="form-select" style="width:auto" id="sick-schedule-select" onchange="loadSickDaysForSchedule(+this.value)">
          ${schedules.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" id="log-sick-day-btn" onclick="openLogSickDayModal(${activeScheduleId},${JSON.stringify(residents).replace(/"/g,'&quot;')})">
          ${icon('plus')} Log Sick Day
        </button>
      </div>
    ` : ''}
    <div class="card">
      <div class="card-header">
        <h2>Sick Day Log</h2>
        <span class="badge badge-error" id="flagged-count">— flagged</span>
      </div>
      <div id="sick-days-table-container">
        ${sickDays.length > 0 ? `
          <table class="data-table">
            <thead>
              <tr>
                <th>Resident</th>
                <th>Date</th>
                <th>Notes</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${sickDays.map(d => `
                <tr>
                  <td><strong>${d.resident_name}</strong></td>
                  <td>${d.date}</td>
                  <td style="color:var(--text-muted)">${d.notes || '—'}</td>
                  <td>
                    ${d.flagged && !d.resolved
                      ? '<span class="badge badge-error">Needs attention</span>'
                      : '<span class="badge badge-success">Resolved</span>'}
                  </td>
                  <td class="actions">
                    ${!d.resolved ? `
                      <button class="btn btn-ghost btn-sm" style="color:var(--success)" onclick="resolveSickDay(${d.id})">
                        ${icon('check')} Resolve
                      </button>
                    ` : ''}
                    <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="deleteSickDay(${d.id})">
                      ${icon('trash')}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state">${icon('alert')}<p>No sick days logged.</p></div>`}
      </div>
    </div>
    <div id="modal-container"></div>
  `);

  const flagged = sickDays.filter(d => d.flagged && !d.resolved).length;
  const el = document.getElementById('flagged-count');
  if (el) el.textContent = `${flagged} flagged`;
}

window.loadSickDaysForSchedule = async function(scheduleId) {
  const sickDays = await api('GET', `/sick-days/schedule/${scheduleId}`) || [];

  // Update Log Sick Day button's scheduleId
  const logBtn = document.getElementById('log-sick-day-btn');
  if (logBtn) {
    const onclick = logBtn.getAttribute('onclick');
    logBtn.setAttribute('onclick', onclick.replace(/openLogSickDayModal\(\d+,/, `openLogSickDayModal(${scheduleId},`));
  }

  const tableContent = sickDays.length > 0 ? `
    <table class="data-table">
      <thead>
        <tr><th>Resident</th><th>Date</th><th>Notes</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${sickDays.map(d => `
          <tr>
            <td><strong>${d.resident_name}</strong></td>
            <td>${d.date}</td>
            <td style="color:var(--text-muted)">${d.notes || '—'}</td>
            <td>${d.flagged && !d.resolved ? '<span class="badge badge-error">Needs attention</span>' : '<span class="badge badge-success">Resolved</span>'}</td>
            <td class="actions">
              ${!d.resolved ? `<button class="btn btn-ghost btn-sm" style="color:var(--success)" onclick="resolveSickDay(${d.id})">${icon('check')} Resolve</button>` : ''}
              <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="deleteSickDay(${d.id})">${icon('trash')}</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : `<div class="empty-state">${icon('alert')}<p>No sick days logged for this schedule.</p></div>`;

  const tableContainer = document.getElementById('sick-days-table-container');
  if (tableContainer) tableContainer.innerHTML = tableContent;

  const flagged = sickDays.filter(d => d.flagged && !d.resolved).length;
  const el = document.getElementById('flagged-count');
  if (el) el.textContent = `${flagged} flagged`;
};

window.openLogSickDayModal = function(scheduleId, residentsJson) {
  const residents = typeof residentsJson === 'string'
    ? JSON.parse(residentsJson.replace(/&quot;/g, '"'))
    : residentsJson;

  document.getElementById('modal-container').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <h2>Log Sick Day</h2>
        <form onsubmit="logSickDay(event, ${scheduleId})">
          <div class="form-group">
            <label class="form-label">Resident</label>
            <select id="sd-resident" class="form-select" required>
              ${residents.map(r => `<option value="${r.id}">${r.name} (PGY-${r.pgy_year})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" id="sd-date" class="form-input" value="${new Date().toISOString().split('T')[0]}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Notes (optional)</label>
            <input type="text" id="sd-notes" class="form-input" placeholder="Coverage arranged, etc." />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Log Sick Day</button>
          </div>
        </form>
      </div>
    </div>
  `;
};

window.logSickDay = async function(e, scheduleId) {
  e.preventDefault();
  try {
    await api('POST', '/sick-days', {
      resident_id: parseInt(document.getElementById('sd-resident').value),
      schedule_id: scheduleId,
      date: document.getElementById('sd-date').value,
      notes: document.getElementById('sd-notes').value || null,
    });
    toast('Sick day logged — flagged for review');
    closeModal();
    renderSickDays();
  } catch (err) { toast(err.message, 'error'); }
};

window.resolveSickDay = async function(id) {
  try {
    await api('PUT', `/sick-days/${id}`, { resolved: true });
    toast('Marked as resolved');
    renderSickDays();
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteSickDay = async function(id) {
  if (!confirm('Delete this sick day record?')) return;
  try {
    await api('DELETE', `/sick-days/${id}`);
    toast('Deleted');
    renderSickDays();
  } catch (err) { toast(err.message, 'error'); }
};

// ─── Program Settings ─────────────────────────────────────────────────────────
async function renderProgramSettings() {
  const p = state.program;

  renderShell('Program Settings', `
    <div class="card" style="max-width:560px">
      <div class="card-header">
        <h2>Program Configuration</h2>
      </div>
      <form onsubmit="saveProgramSettings(event)">
        <div class="form-group">
          <label class="form-label">Program Name</label>
          <input type="text" id="ps-name" class="form-input" value="${p?.name || ''}" required />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Block Length (weeks)</label>
            <input type="number" id="ps-block" class="form-input" value="${p?.block_length_weeks || 4}" min="1" max="12" required />
          </div>
          <div class="form-group">
            <label class="form-label">Total Blocks / Year</label>
            <input type="number" id="ps-blocks" class="form-input" value="${p?.total_blocks || 13}" min="1" max="52" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Academic Year Start</label>
          <input type="date" id="ps-start" class="form-input" value="${p?.academic_year_start || ''}" required />
        </div>
        <div style="margin-top:8px;padding:12px;background:var(--surface-2);border-radius:8px;font-size:0.82rem;color:var(--text-muted)">
          Total schedule weeks: <strong>${(p?.block_length_weeks || 4) * (p?.total_blocks || 13)}</strong>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:24px 0" />
        <div class="form-group">
          <label class="form-label">PTO Request Priority Rule</label>
          <select id="ps-pto-priority" class="form-select">
            <option value="first_come" ${(!p?.pto_priority_rule || p.pto_priority_rule === 'first_come') ? 'selected' : ''}>First Come, First Served — earlier requests win conflicts</option>
            <option value="seniority" ${p?.pto_priority_rule === 'seniority' ? 'selected' : ''}>Seniority — higher PGY year wins conflicts</option>
            <option value="rotating" ${p?.pto_priority_rule === 'rotating' ? 'selected' : ''}>Rotating Priority — who got priority last time loses it next time</option>
          </select>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px">
            When two residents request the same week, this rule determines who gets priority. Used to sort the PTO Requests page.
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:20px">Save Settings</button>
      </form>
    </div>
  `);
}

window.saveProgramSettings = async function(e) {
  e.preventDefault();
  try {
    await api('PUT', `/programs/${state.programId}`, {
      name: document.getElementById('ps-name').value,
      block_length_weeks: parseInt(document.getElementById('ps-block').value),
      total_blocks: parseInt(document.getElementById('ps-blocks').value),
      academic_year_start: document.getElementById('ps-start').value,
      pto_priority_rule: document.getElementById('ps-pto-priority').value,
    });
    await loadProgram();
    toast('Settings saved');
    renderProgramSettings();
  } catch (err) { toast(err.message, 'error'); }
};

// ─── PTO Submit (resident-facing) ─────────────────────────────────────────────
async function renderPTOSubmit() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) {
    document.getElementById('app').innerHTML = `<div class="auth-wrapper"><div class="auth-card"><h2 style="color:var(--error)">Invalid Link</h2><p>This invite link is missing or invalid.</p></div></div>`;
    return;
  }

  let info;
  try {
    info = await fetch(`/api/residents/invite/${token}`).then(r => {
      if (!r.ok) throw new Error();
      return r.json();
    });
  } catch {
    document.getElementById('app').innerHTML = `<div class="auth-wrapper"><div class="auth-card"><h2 style="color:var(--error)">Link Expired</h2><p>This invite link is no longer valid. Contact your program coordinator.</p></div></div>`;
    return;
  }


  // Build week list
  const totalWeeks = info.totalBlocks * info.blockLengthWeeks;
  const startDate = info.academicYearStart ? new Date(info.academicYearStart) : null;

  function weekLabel(w) {
    if (!startDate) return `Week ${w}`;
    const raw = new Date(startDate);
    raw.setDate(startDate.getDate() + (w - 1) * 7);
    const day = raw.getDay();
    const daysBack = day === 0 ? 6 : day - 1;
    const mon = new Date(raw);
    mon.setDate(raw.getDate() - daysBack);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    const fmt = dt => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(mon)} – ${fmt(fri)}`;
  }

  document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;background:var(--bg);padding:32px 16px">
      <div style="max-width:680px;margin:0 auto">
        <div style="margin-bottom:24px">
          <div style="font-family:'DM Serif Display',serif;font-size:1.8rem;color:var(--navy)">ResidentFlow</div>
          <div style="font-size:0.85rem;color:var(--text-muted)">${info.programName}</div>
        </div>
        <div class="card">
          <h2 style="margin:0 0 4px">PTO Request — ${info.residentName}</h2>
          <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 20px">
            PGY-${info.pgyYear} · You have <strong>${info.ptoWeeksAllotted} PTO weeks</strong> this academic year.
            Select the weeks you'd like to request off.
          </p>

          <form onsubmit="submitPTO(event, '${token}', ${info.residentId})">
            <div class="form-group">
              <label class="form-label">Select Schedule</label>
              <div id="schedule-picker" style="margin-bottom:16px">
                <select id="pto-sched-id" class="form-select">
                  <option value="">Loading schedules…</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">
                Select PTO Weeks
                <span id="pto-count" style="margin-left:8px;font-weight:400;color:var(--teal)">0 / ${info.ptoWeeksAllotted} selected</span>
              </label>
              <div class="week-picker" id="week-picker">
                ${Array.from({length: totalWeeks}, (_, i) => {
                  const w = i + 1;
                  return `<button type="button" class="week-btn" data-week="${w}" onclick="toggleWeek(this, ${info.ptoWeeksAllotted})">${weekLabel(w)}</button>`;
                }).join('')}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Additional Notes (optional)</label>
              <input type="text" id="pto-notes" class="form-input" placeholder="Any special context for your requests…" />
            </div>

            <button type="submit" class="btn btn-primary" id="pto-submit-btn" style="width:100%;justify-content:center">
              Submit PTO Requests
            </button>
            <div id="pto-error" style="color:var(--error);font-size:0.85rem;margin-top:8px;text-align:center"></div>
          </form>
        </div>
      </div>
    </div>
  `;

  // Load schedules using public token-authenticated endpoint
  try {
    const scheds = await fetch(`/api/schedules/for-resident?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : []).catch(() => []);

    const sel = document.getElementById('pto-sched-id');
    if (scheds?.length > 0) {
      sel.innerHTML = scheds.map(s =>
        `<option value="${s.id}">${s.name} (${s.academic_year})</option>`
      ).join('');
    } else {
      sel.innerHTML = '<option value="">No open schedules</option>';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.id = 'pto-sched-id-manual';
      inp.className = 'form-input';
      inp.placeholder = 'Schedule ID (ask your coordinator)';
      inp.style.marginTop = '8px';
      document.getElementById('schedule-picker').appendChild(inp);
    }
  } catch {}
}

window.toggleWeek = function(btn, max) {
  const selected = document.querySelectorAll('.week-btn.selected').length;
  if (btn.classList.contains('selected')) {
    btn.classList.remove('selected');
  } else {
    if (selected >= max) {
      document.getElementById('pto-error').textContent = `You can only select ${max} PTO weeks.`;
      setTimeout(() => { const el = document.getElementById('pto-error'); if(el) el.textContent = ''; }, 2500);
      return;
    }
    btn.classList.add('selected');
  }
  const count = document.querySelectorAll('.week-btn.selected').length;
  const el = document.getElementById('pto-count');
  if (el) el.textContent = `${count} / ${max} selected`;
};

window.submitPTO = async function(e, token, residentId) {
  e.preventDefault();
  const selectedWeeks = [...document.querySelectorAll('.week-btn.selected')].map(b => parseInt(b.dataset.week));
  const schedId = document.getElementById('pto-sched-id')?.value ||
                  document.getElementById('pto-sched-id-manual')?.value;

  if (!schedId) {
    document.getElementById('pto-error').textContent = 'Please select a schedule.';
    return;
  }

  const btn = document.getElementById('pto-submit-btn');
  btn.innerHTML = '<span class="loader"></span> Submitting…';
  btn.disabled = true;

  try {
    await fetch('/api/pto/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        scheduleId: parseInt(schedId),
        weekNumbers: selectedWeeks,
        notes: document.getElementById('pto-notes').value || null,
      }),
    }).then(async r => {
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || 'Submission failed');
      }
      return r.json();
    });

    document.getElementById('app').innerHTML = `
      <div style="min-height:100vh;background:var(--bg);display:flex;align-items:center;justify-content:center">
        <div class="card" style="max-width:420px;text-align:center">
          <div style="font-size:3rem;margin-bottom:12px">✓</div>
          <h2 style="color:var(--teal)">PTO Requests Submitted</h2>
          <p style="color:var(--text-muted)">
            ${selectedWeeks.length > 0
              ? `Your ${selectedWeeks.length} PTO week(s) have been submitted for review.`
              : 'No PTO weeks requested.'}
            Your coordinator will incorporate these into the schedule.
          </p>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('pto-error').textContent = err.message;
    btn.innerHTML = 'Submit PTO Requests';
    btn.disabled = false;
  }
};

// ─── Swap Requests ────────────────────────────────────────────────────────────
async function renderSwaps() {
  const schedules = await api('GET', `/schedules/program/${state.programId}`);
  const activeId = schedules?.[0]?.id;
  const residents = await api('GET', `/residents/program/${state.programId}`);

  let swaps = [];
  if (activeId) swaps = await api('GET', `/swaps/schedule/${activeId}`) || [];

  renderShell('Swap Requests', `
    ${schedules?.length > 0 ? `
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label class="form-label" style="margin:0">Schedule:</label>
        <select class="form-select" style="width:auto" id="swaps-schedule-select" onchange="loadSwapsForSchedule(this.value)">
          ${schedules.map(s => `<option value="${s.id}">${s.name} (${s.academic_year})</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="openSwapModal(${activeId}, ${JSON.stringify(residents).replace(/"/g,'&quot;')})">
          ${icon('plus')} Propose Swap
        </button>
      </div>
    ` : ''}
    <div class="card" id="swaps-container">
      <div class="card-header">
        <h2>Swap Requests</h2>
        <p style="margin:0;font-size:0.8rem;color:var(--text-muted)">Swap a block assignment between two residents. Approved swaps update the schedule automatically.</p>
      </div>
      ${renderSwapTable(swaps, activeId, residents)}
    </div>
    <div id="modal-container"></div>
  `);
}

function renderSwapTable(swaps, scheduleId, residents) {
  if (!swaps?.length) {
    return `<div class="empty-state">${icon('swap')}<p>No swap requests yet. Use "Propose Swap" to suggest a block exchange.</p></div>`;
  }
  return `
    <table class="data-table">
      <thead>
        <tr><th>Block</th><th>Resident A</th><th>Resident B</th><th>Status</th><th>Notes</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${swaps.map(s => `
          <tr>
            <td><strong>Block ${s.block_number}</strong></td>
            <td>
              <strong>${s.resident_a_name}</strong>
              <div style="font-size:0.75rem;color:var(--text-muted)">${s.rotation_a || 'Unassigned'}</div>
            </td>
            <td>
              <strong>${s.resident_b_name}</strong>
              <div style="font-size:0.75rem;color:var(--text-muted)">${s.rotation_b || 'Unassigned'}</div>
            </td>
            <td><span class="badge ${s.status === 'approved' ? 'badge-success' : s.status === 'denied' ? 'badge-error' : 'badge-warning'}">${s.status}</span></td>
            <td style="color:var(--text-muted);font-size:0.8rem">${s.notes || '—'}</td>
            <td class="actions">
              ${s.status === 'pending' ? `
                <button class="btn btn-ghost btn-sm" style="color:var(--success)" onclick="updateSwap(${s.id},'approved')">
                  ${icon('check')} Approve
                </button>
                <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="updateSwap(${s.id},'denied')">
                  ${icon('x')} Deny
                </button>
              ` : ''}
              <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="deleteSwap(${s.id})">
                ${icon('trash')}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

window.openSwapModal = function(scheduleId, residentsRaw) {
  const residents = typeof residentsRaw === 'string'
    ? JSON.parse(residentsRaw.replace(/&quot;/g, '"'))
    : residentsRaw;
  const totalBlocks = state.program?.total_blocks || 13;

  document.getElementById('modal-container').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" style="max-width:500px">
        <h2>Propose Swap</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin-top:-8px">Choose two residents and the block where you want to swap their assigned rotations.</p>
        <form onsubmit="createSwap(event, ${scheduleId})">
          <div class="form-group">
            <label class="form-label">Block Number</label>
            <select id="sw-block" class="form-select" required>
              ${Array.from({length: totalBlocks}, (_, i) => `<option value="${i+1}">Block ${i+1}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Resident A</label>
              <select id="sw-res-a" class="form-select" required>
                ${residents.map(r => `<option value="${r.id}">${r.name} (PGY-${r.pgy_year})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Resident B</label>
              <select id="sw-res-b" class="form-select" required>
                ${residents.map(r => `<option value="${r.id}">${r.name} (PGY-${r.pgy_year})</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notes (optional)</label>
            <input type="text" id="sw-notes" class="form-input" placeholder="Reason for swap…" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Swap Request</button>
          </div>
        </form>
      </div>
    </div>
  `;
};

window.createSwap = async function(e, scheduleId) {
  e.preventDefault();
  const resA = parseInt(document.getElementById('sw-res-a').value);
  const resB = parseInt(document.getElementById('sw-res-b').value);
  if (resA === resB) { toast('Select two different residents', 'error'); return; }
  try {
    await api('POST', '/swaps', {
      schedule_id: scheduleId,
      block_number: parseInt(document.getElementById('sw-block').value),
      resident_a_id: resA,
      resident_b_id: resB,
      notes: document.getElementById('sw-notes').value || null,
    });
    toast('Swap request created');
    closeModal();
    renderSwaps();
  } catch (err) { toast(err.message, 'error'); }
};

window.updateSwap = async function(id, status) {
  try {
    await api('PUT', `/swaps/${id}`, { status });
    toast(status === 'approved' ? 'Swap approved — schedule updated' : 'Swap denied');
    renderSwaps();
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteSwap = async function(id) {
  if (!confirm('Delete this swap request?')) return;
  try {
    await api('DELETE', `/swaps/${id}`);
    toast('Deleted');
    renderSwaps();
  } catch (err) { toast(err.message, 'error'); }
};

window.loadSwapsForSchedule = async function(scheduleId) {
  const swaps = await api('GET', `/swaps/schedule/${scheduleId}`) || [];
  const residents = await api('GET', `/residents/program/${state.programId}`);
  const el = document.getElementById('swaps-container');
  el.innerHTML = `
    <div class="card-header">
      <h2>Swap Requests</h2>
    </div>
    ${renderSwapTable(swaps, scheduleId, residents)}
  `;
};

// ─── Jeopardy Board ───────────────────────────────────────────────────────────
async function renderJeopardy() {
  const schedules = await api('GET', `/schedules/program/${state.programId}`);
  const activeId = schedules?.[0]?.id;
  const residents = await api('GET', `/residents/program/${state.programId}`);

  let jeopardyRows = [];
  if (activeId) jeopardyRows = await api('GET', `/jeopardy/schedule/${activeId}`) || [];

  renderShell('Jeopardy Board', `
    ${schedules?.length > 0 ? `
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px">
        <label class="form-label" style="margin:0">Schedule:</label>
        <select class="form-select" style="width:auto" id="jeopardy-schedule-select" onchange="loadJeopardyForSchedule(this.value)">
          ${schedules.map(s => `<option value="${s.id}">${s.name} (${s.academic_year})</option>`).join('')}
        </select>
      </div>
    ` : ''}
    <div class="card" style="margin-bottom:16px;padding:14px 20px;background:rgba(11,140,135,0.04);border-color:rgba(11,140,135,0.2)">
      <p style="margin:0;font-size:0.85rem;color:var(--text-muted)">
        ${icon('shield')}
        <strong style="color:var(--teal)">Jeopardy</strong> is your backup coverage resident for each block.
        When someone calls sick, the jeopardy resident covers. Assign one per block below.
      </p>
    </div>
    <div class="card" id="jeopardy-container" style="padding:0;overflow:hidden">
      ${renderJeopardyTable(jeopardyRows, activeId, residents)}
    </div>
  `);
}

function renderJeopardyTable(rows, scheduleId, residents) {
  if (!scheduleId) return `<div class="empty-state">${icon('shield')}<p>No schedule selected.</p></div>`;

  const totalBlocks = state.program?.total_blocks || 13;
  const startDate = state.program?.academic_year_start ? new Date(state.program.academic_year_start) : null;
  const blockLen = state.program?.block_length_weeks || 4;
  const lookup = {};
  for (const r of rows) lookup[r.block_number] = r;

  function blockDates(b) {
    if (!startDate) return '';
    const d = new Date(startDate);
    d.setDate(d.getDate() + (b - 1) * blockLen * 7);
    const end = new Date(d);
    end.setDate(end.getDate() + blockLen * 7 - 1);
    return `${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
  }

  return `
    <table class="data-table">
      <thead>
        <tr><th>Block</th><th>Dates</th><th>Backup Resident</th><th>Notes</th><th>Action</th></tr>
      </thead>
      <tbody>
        ${Array.from({length: totalBlocks}, (_, i) => {
          const b = i + 1;
          const assigned = lookup[b];
          return `
            <tr id="jeopardy-row-${b}">
              <td><strong>Block ${b}</strong></td>
              <td style="color:var(--text-muted);font-size:0.8rem">${blockDates(b)}</td>
              <td>
                <select class="form-select" style="width:auto;min-width:200px" id="jeopardy-res-${b}">
                  <option value="">— Not assigned —</option>
                  ${residents.map(r => `<option value="${r.id}" ${assigned?.resident_id === r.id ? 'selected' : ''}>${r.name} (PGY-${r.pgy_year})</option>`).join('')}
                </select>
              </td>
              <td>
                <input type="text" class="form-input" style="width:180px" id="jeopardy-notes-${b}"
                  value="${assigned?.notes || ''}" placeholder="Optional notes…" />
              </td>
              <td>
                <button class="btn btn-primary btn-sm" onclick="saveJeopardy(${scheduleId}, ${b})">
                  ${icon('check')} Save
                </button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

window.saveJeopardy = async function(scheduleId, blockNumber) {
  const resId = document.getElementById(`jeopardy-res-${blockNumber}`).value;
  const notes = document.getElementById(`jeopardy-notes-${blockNumber}`).value;
  try {
    await api('PUT', `/jeopardy/schedule/${scheduleId}/block/${blockNumber}`, {
      resident_id: resId ? parseInt(resId) : null,
      notes: notes || null,
    });
    toast(`Block ${blockNumber} jeopardy ${resId ? 'assigned' : 'cleared'}`);
  } catch (err) { toast(err.message, 'error'); }
};

window.loadJeopardyForSchedule = async function(scheduleId) {
  const [rows, residents] = await Promise.all([
    api('GET', `/jeopardy/schedule/${scheduleId}`) || [],
    api('GET', `/residents/program/${state.programId}`),
  ]);
  document.getElementById('jeopardy-container').innerHTML = renderJeopardyTable(rows || [], scheduleId, residents);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function closeModal() {
  const c = document.getElementById('modal-container');
  if (c) c.innerHTML = '';
}

window.exportSchedule = async function(scheduleId) {
  try {
    const res = await fetch(`/api/schedules/${scheduleId}/export?token=${state.token}`);
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disp = res.headers.get('Content-Disposition') || '';
    const match = disp.match(/filename="([^"]+)"/);
    a.download = match ? match[1] : `schedule_${scheduleId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    toast(err.message, 'error');
  }
};

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const params = new URLSearchParams(window.location.search);

  // Check for password reset link
  const resetToken = params.get('reset');
  if (resetToken) {
    return navigate('reset-password', { token: resetToken });
  }

  // Check for resident PTO invite link
  if (params.get('token')) {
    return navigate('pto-submit');
  }

  if (!state.token) {
    return navigate('login');
  }

  try {
    await loadProgram();
    if (!state.program) { logout(); return; }
    navigate('dashboard');
  } catch {
    logout();
  }
}

// ─── Shared Services ──────────────────────────────────────────────────────────
async function renderSharedServices() {
  let services = await api('GET', '/shared-services') || [];
  let years = await api('GET', '/shared-services/academic-years') || [];

  renderShell('Shared Services', buildSharedServicesHTML(services, years, null, null, null));
  attachSharedServicesHandlers(services, years);
}

function buildSharedServicesHTML(services, years, activeId, rotations, coverage) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <p style="margin:0;color:var(--text-muted);font-size:0.88rem">
          Shared services are hospital-wide rotations (e.g. Adult Inpatient) that residents from multiple programs staff simultaneously.
          Link rotations from any program to a service to track combined coverage per block.
        </p>
      </div>
      <button class="btn btn-navy btn-sm" id="ss-new-btn" onclick="openSSModal()" style="white-space:nowrap;margin-left:16px">
        ${icon('plus')} New Service
      </button>
    </div>

    <div id="ss-modal-container"></div>

    ${services.length === 0 ? `
      <div class="card empty-state">
        ${icon('zap')}
        <p>No shared services defined yet. Create one to start tracking cross-program inpatient coverage.</p>
      </div>
    ` : `
      <div style="display:grid;gap:16px">
        ${services.map(s => `
          <div class="card" id="ss-card-${s.id}" style="padding:0;overflow:hidden">
            <div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border-bottom:1px solid var(--border)"
                 onclick="toggleSSCard(${s.id})">
              <div>
                <strong style="font-size:1rem">${escHtml(s.name)}</strong>
                ${s.description ? `<span style="margin-left:10px;color:var(--text-muted);font-size:0.85rem">${escHtml(s.description)}</span>` : ''}
                <span style="margin-left:12px;font-size:0.8rem;color:var(--text-muted);background:var(--bg-subtle);padding:2px 8px;border-radius:12px">
                  ${s.rotation_count} rotation${s.rotation_count !== 1 ? 's' : ''} linked
                </span>
                ${s.soft_max ? `<span style="margin-left:6px;font-size:0.8rem;color:#b45309;background:#fef3c7;padding:2px 8px;border-radius:12px">soft max: ${s.soft_max}</span>` : ''}
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openSSModal(${s.id},'${escHtml(s.name).replace(/'/g,"\\'")}','${escHtml(s.description||'').replace(/'/g,"\\'")}',${s.soft_max||''})">
                  ${icon('edit')}
                </button>
                <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="event.stopPropagation();deleteSSService(${s.id})">
                  ${icon('trash')}
                </button>
                <span id="ss-chevron-${s.id}" style="transition:transform 0.2s;display:inline-block">▼</span>
              </div>
            </div>
            <div id="ss-body-${s.id}" style="display:none;padding:20px">
              <div style="color:var(--text-muted);font-size:0.85rem">Loading…</div>
            </div>
          </div>
        `).join('')}
      </div>
    `}

    <!-- New / Edit modal -->
    <div id="ss-form-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;align-items:center;justify-content:center">
      <div class="card" style="width:420px;padding:28px;position:relative">
        <h3 id="ss-modal-title" style="margin:0 0 20px">New Shared Service</h3>
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" id="ss-m-name" class="form-input" placeholder="e.g. Adult Inpatient" />
        </div>
        <div class="form-group">
          <label class="form-label">Description <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
          <input type="text" id="ss-m-desc" class="form-input" placeholder="Brief description" />
        </div>
        <div class="form-group">
          <label class="form-label">Soft Max Residents <span style="font-weight:400;color:var(--text-muted)">(optional — for display only)</span></label>
          <input type="number" id="ss-m-max" class="form-input" placeholder="Leave blank for no limit" min="1" />
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
          <button class="btn btn-ghost" onclick="closeSSModal()">Cancel</button>
          <button class="btn btn-navy" id="ss-m-save" onclick="saveSSService()">Save</button>
        </div>
        <div id="ss-m-error" style="color:var(--error);font-size:0.85rem;margin-top:8px"></div>
      </div>
    </div>
  `;
}

let _ssEditId = null;

window.openSSModal = function(id, name, desc, softMax) {
  _ssEditId = id || null;
  document.getElementById('ss-modal-title').textContent = id ? 'Edit Shared Service' : 'New Shared Service';
  document.getElementById('ss-m-name').value = name || '';
  document.getElementById('ss-m-desc').value = desc || '';
  document.getElementById('ss-m-max').value = softMax || '';
  document.getElementById('ss-m-error').textContent = '';
  document.getElementById('ss-form-modal').style.display = 'flex';
};

window.closeSSModal = function() {
  document.getElementById('ss-form-modal').style.display = 'none';
  _ssEditId = null;
};

window.saveSSService = async function() {
  const name = document.getElementById('ss-m-name').value.trim();
  if (!name) { document.getElementById('ss-m-error').textContent = 'Name is required'; return; }
  const body = {
    name,
    description: document.getElementById('ss-m-desc').value.trim() || null,
    soft_max: parseInt(document.getElementById('ss-m-max').value) || null,
  };
  try {
    if (_ssEditId) {
      await api('PUT', `/shared-services/${_ssEditId}`, body);
    } else {
      await api('POST', '/shared-services', body);
    }
    closeSSModal();
    navigate('shared-services');
  } catch (err) {
    document.getElementById('ss-m-error').textContent = err.message;
  }
};

window.deleteSSService = async function(id) {
  if (!confirm('Delete this shared service and all its rotation links?')) return;
  try {
    await api('DELETE', `/shared-services/${id}`);
    navigate('shared-services');
  } catch (err) {
    toast(err.message, 'error');
  }
};

const _ssOpenCards = new Set();

window.toggleSSCard = async function(id) {
  const body = document.getElementById(`ss-body-${id}`);
  const chevron = document.getElementById(`ss-chevron-${id}`);
  if (_ssOpenCards.has(id)) {
    _ssOpenCards.delete(id);
    body.style.display = 'none';
    chevron.style.transform = '';
  } else {
    _ssOpenCards.add(id);
    body.style.display = 'block';
    chevron.style.transform = 'rotate(180deg)';
    await loadSSCardContent(id);
  }
};

async function loadSSCardContent(id) {
  const body = document.getElementById(`ss-body-${id}`);
  body.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem">Loading…</div>';

  const [rotations, years] = await Promise.all([
    api('GET', `/shared-services/${id}/available-rotations`),
    api('GET', '/shared-services/academic-years'),
  ]);

  const linked = (rotations || []).filter(r => r.linked);
  const unlinked = (rotations || []).filter(r => !r.linked);

  // Group linked by program
  const linkedByProgram = {};
  for (const r of linked) {
    if (!linkedByProgram[r.program_name]) linkedByProgram[r.program_name] = [];
    linkedByProgram[r.program_name].push(r);
  }

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <!-- Left: rotation mapping -->
      <div>
        <h4 style="margin:0 0 12px;font-size:0.9rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Linked Rotations</h4>
        ${Object.keys(linkedByProgram).length === 0 ? `
          <div style="color:var(--text-muted);font-size:0.85rem;padding:12px 0">No rotations linked yet.</div>
        ` : Object.entries(linkedByProgram).map(([prog, rots]) => `
          <div style="margin-bottom:10px">
            <div style="font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em">${escHtml(prog)}</div>
            ${rots.map(r => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg-subtle);border-radius:6px;margin-bottom:4px">
                <span style="font-size:0.88rem">${escHtml(r.name)}</span>
                <button class="btn btn-ghost btn-sm" style="color:var(--error);padding:2px 6px" onclick="ssUnlinkRotation(${id},${r.id})">
                  ${icon('x')}
                </button>
              </div>
            `).join('')}
          </div>
        `).join('')}

        ${unlinked.length > 0 ? `
          <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
            <select class="form-select" id="ss-add-rot-${id}" style="flex:1;font-size:0.85rem">
              <option value="">— Add rotation —</option>
              ${Object.entries(
                unlinked.reduce((acc, r) => {
                  if (!acc[r.program_name]) acc[r.program_name] = [];
                  acc[r.program_name].push(r);
                  return acc;
                }, {})
              ).map(([prog, rots]) => `
                <optgroup label="${escHtml(prog)}">
                  ${rots.map(r => `<option value="${r.id}">${escHtml(r.name)}</option>`).join('')}
                </optgroup>
              `).join('')}
            </select>
            <button class="btn btn-navy btn-sm" onclick="ssLinkRotation(${id})">Add</button>
          </div>
        ` : ''}
      </div>

      <!-- Right: coverage grid -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h4 style="margin:0;font-size:0.9rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Coverage by Block</h4>
          ${years.length > 0 ? `
            <select class="form-select" style="width:auto;font-size:0.82rem" id="ss-year-${id}" onchange="loadSSCoverage(${id})">
              ${years.map(y => `<option value="${y}">${y}</option>`).join('')}
            </select>
          ` : ''}
        </div>
        <div id="ss-coverage-${id}">
          ${linked.length === 0 ? `<div style="color:var(--text-muted);font-size:0.85rem">Link at least one rotation to see coverage.</div>` : '<div style="color:var(--text-muted);font-size:0.85rem">Loading coverage…</div>'}
        </div>
      </div>
    </div>
  `;

  if (linked.length > 0) loadSSCoverage(id);
}

window.ssLinkRotation = async function(serviceId) {
  const sel = document.getElementById(`ss-add-rot-${serviceId}`);
  const rotId = parseInt(sel.value);
  if (!rotId) return;
  try {
    await api('POST', `/shared-services/${serviceId}/rotations`, { rotation_id: rotId });
    await loadSSCardContent(serviceId);
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.ssUnlinkRotation = async function(serviceId, rotId) {
  try {
    await api('DELETE', `/shared-services/${serviceId}/rotations/${rotId}`);
    await loadSSCardContent(serviceId);
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.loadSSCoverage = async function(serviceId) {
  const yearSel = document.getElementById(`ss-year-${serviceId}`);
  const year = yearSel?.value || '';
  const container = document.getElementById(`ss-coverage-${serviceId}`);
  if (!container) return;
  container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem">Loading…</div>';

  const data = await api('GET', `/shared-services/${serviceId}/coverage${year ? '?academic_year=' + encodeURIComponent(year) : ''}`);
  if (!data || data.programs.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem">No generated schedules found for this period.</div>';
    return;
  }

  const { programs, blocks, service } = data;
  const softMax = service.soft_max;

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead>
          <tr>
            <th style="text-align:left;padding:4px 8px;border-bottom:2px solid var(--border);white-space:nowrap">Block</th>
            ${programs.map(p => `<th style="padding:4px 8px;border-bottom:2px solid var(--border);text-align:center;white-space:nowrap">${escHtml(p.name)}</th>`).join('')}
            <th style="padding:4px 8px;border-bottom:2px solid var(--border);text-align:center;font-weight:700">Total</th>
          </tr>
        </thead>
        <tbody>
          ${blocks.map(b => {
            const overLimit = softMax && b.total > softMax;
            return `
              <tr style="${overLimit ? 'background:#fff7ed' : ''}">
                <td style="padding:4px 8px;border-bottom:1px solid var(--border);font-weight:500;white-space:nowrap">Block ${b.block}</td>
                ${programs.map(p => `<td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center;color:${(b.byProgram[p.id]||0) > 0 ? 'var(--text)' : 'var(--text-muted)'}">${b.byProgram[p.id] || 0}</td>`).join('')}
                <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center;font-weight:700;color:${overLimit ? '#c2410c' : 'var(--text)'}">
                  ${b.total}${overLimit ? ' ⚠' : ''}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ${softMax ? `<div style="margin-top:8px;font-size:0.78rem;color:var(--text-muted)">⚠ indicates blocks exceeding soft max of ${softMax}</div>` : ''}
    </div>
  `;
};

function attachSharedServicesHandlers(services, years) {
  // Re-open any cards that were open before a re-render
  for (const id of _ssOpenCards) {
    const body = document.getElementById(`ss-body-${id}`);
    const chevron = document.getElementById(`ss-chevron-${id}`);
    if (body) {
      body.style.display = 'block';
      if (chevron) chevron.style.transform = 'rotate(180deg)';
      loadSSCardContent(id);
    }
  }
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function weekNumToDateRange(weekNum, academicYearStart) {
  if (!academicYearStart) return `Week ${weekNum}`;
  const start = new Date(academicYearStart + 'T12:00:00');
  const raw = new Date(start);
  raw.setDate(start.getDate() + (weekNum - 1) * 7);
  const day = raw.getDay();
  const daysBack = day === 0 ? 6 : day - 1;
  const weekStart = new Date(raw);
  weekStart.setDate(raw.getDate() - daysBack);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 4);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

function dateToWeekNum(dateStr, academicYearStart, totalWeeks) {
  if (!dateStr || !academicYearStart) return null;
  const date = new Date(dateStr + 'T12:00:00');
  const start = new Date(academicYearStart + 'T12:00:00');
  const days = Math.floor((date - start) / 86400000);
  const week = Math.floor(days / 7) + 1;
  if (week < 1 || (totalWeeks && week > totalWeeks)) return null;
  return week;
}

function academicYearDateBounds(academicYearStart, totalBlocks, blockLengthWeeks) {
  if (!academicYearStart) return {};
  const start = new Date(academicYearStart + 'T12:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + totalBlocks * blockLengthWeeks * 7 - 1);
  const toInputVal = d => d.toISOString().slice(0, 10);
  return { min: toInputVal(start), max: toInputVal(end) };
}

// ─── Multi-program switcher ───────────────────────────────────────────────────
window.switchProgram = async function(programId) {
  if (programId === state.programId) return;
  try {
    const data = await api('POST', '/auth/switch-program', { programId });
    state.token = data.token;
    state.programId = data.programId;
    localStorage.setItem('rf_token', data.token);
    localStorage.setItem('rf_programId', String(data.programId));
    await loadProgram();
    navigate(state.currentPage || 'dashboard');
    toast(`Switched to ${state.program?.name || 'program'}`);
  } catch (err) {
    toast(err.message, 'error');
  }
};

// ─── Programs management page ─────────────────────────────────────────────────
async function renderPrograms() {
  const programs = state.allPrograms.length ? state.allPrograms : (await api('GET', '/programs').catch(() => []));

  renderShell('Programs', `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;gap:16px">
      <div>
        <h2 style="margin:0 0 6px">Programs</h2>
        <p style="color:var(--text-muted);margin:0;font-size:0.875rem;max-width:520px">
          Each program has its own residents, rotations, and schedules. Use Shared Services to see combined coverage across programs (e.g., who covers inpatient from each program).
        </p>
      </div>
      <button class="btn btn-primary" style="white-space:nowrap" onclick="openAddProgramModal()">+ Add Program</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
      ${programs.map(p => `
        <div class="card" style="border:2px solid ${p.id === state.programId ? 'var(--teal)' : 'var(--border)'}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div>
              <div style="font-weight:600;font-size:1rem">${escHtml(p.name)}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">
                ${p.total_blocks} blocks · ${p.block_length_weeks}w each · starts ${p.academic_year_start}
              </div>
            </div>
            ${p.id === state.programId ? `<span style="font-size:0.72rem;background:var(--teal);color:#fff;padding:2px 10px;border-radius:99px;white-space:nowrap;flex-shrink:0;margin-top:2px">Active</span>` : ''}
          </div>
          <div style="margin-top:16px">
            ${p.id === state.programId
              ? `<span style="font-size:0.82rem;color:var(--text-muted)">Currently managing this program</span>`
              : `<button class="btn btn-primary btn-sm" onclick="switchProgram(${p.id})">Switch to this program</button>`
            }
          </div>
        </div>
      `).join('')}
    </div>

    <div id="add-program-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeAddProgramModal()">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h3>Add Program</h3>
          <button class="modal-close" onclick="closeAddProgramModal()">×</button>
        </div>
        <form onsubmit="submitAddProgram(event)">
          <div class="form-group">
            <label class="form-label">Program Name</label>
            <input type="text" id="ap-name" class="form-input" placeholder="e.g. Psychiatry Residency" required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Block Length (weeks)</label>
              <input type="number" id="ap-block" class="form-input" value="4" min="1" max="12" required />
            </div>
            <div class="form-group">
              <label class="form-label">Total Blocks / Year</label>
              <input type="number" id="ap-blocks" class="form-input" value="13" min="1" max="52" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Academic Year Start</label>
            <input type="date" id="ap-start" class="form-input" required />
          </div>
          <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:24px">
            <button type="button" class="btn btn-secondary" onclick="closeAddProgramModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="ap-submit-btn">Create Program</button>
          </div>
        </form>
      </div>
    </div>
  `);
}

window.openAddProgramModal = function() {
  document.getElementById('add-program-modal').style.display = 'flex';
};
window.closeAddProgramModal = function() {
  document.getElementById('add-program-modal').style.display = 'none';
};
window.submitAddProgram = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('ap-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    await api('POST', '/programs', {
      name: document.getElementById('ap-name').value,
      block_length_weeks: parseInt(document.getElementById('ap-block').value),
      total_blocks: parseInt(document.getElementById('ap-blocks').value),
      academic_year_start: document.getElementById('ap-start').value,
    });
    toast('Program created');
    await loadProgram();
    renderPrograms();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Create Program';
  }
};

init();
