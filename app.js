'use strict';
/* Ingresos Familiares — PWA de control de ingresos con meta mensual.
   App aislada: solo colección 'ingresos' + config 'ingresos_app' en Firebase.
   No lee ni mezcla datos de Finanzas Familiares (corrección de Ramiro, 2026-10-27). */

const LS_KEY = 'ingresos-familiares-v1';
const APP_VERSION = '1.2';
const DEFAULT_SOURCES = ['Trabajo Ensign', 'Trabajo Nicole', 'Pastelería', 'Fotografía', 'Arriendo Chile', 'Otro'];
const SOURCE_COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171', '#2dd4bf', '#f472b6', '#9ca3af'];
const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
const SOURCE_SVG = {
  'Trabajo Ensign': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  'Trabajo Nicole': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  'Pastelería': '<path d="M4 21h16"/><path d="M5 21v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6"/><path d="M12 9V6"/><circle cx="12" cy="4.5" r="1.6"/>',
  'Fotografía': '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  'Arriendo Chile': '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M10 20v-6h4v6"/>',
  'Otro': '<path d="M20.6 13.4 12.2 5a2 2 0 0 0-1.4-.6H4a1 1 0 0 0-1 1v6.8c0 .5.2 1 .6 1.4l8.4 8.4a2 2 0 0 0 2.8 0l5.8-5.8a2 2 0 0 0 0-2.8z"/><path d="M7.5 7.5h.01"/>'
};
const PEOPLE = ['Ramiro', 'Nicole'];
const PEOPLE_COLORS = { 'Ramiro': '#34d399', 'Nicole': '#a78bfa' };

// ---------- Nube (Firebase) — mismo proyecto que Finanzas ----------
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBa4XTJo47f3ZutCwIabO89SNTopQqTljc",
  authDomain: "finanzas-bugueno.firebaseapp.com",
  projectId: "finanzas-bugueno",
  storageBucket: "finanzas-bugueno.firebasestorage.app",
  messagingSenderId: "745240953305",
  appId: "1:745240953305:web:37595a80c087fef80799c8"
};
let db = null, cloudOn = false, cloudErr = '';
let currentView = 'dash';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return Object.assign({ goal: 0, sources: DEFAULT_SOURCES.slice(), txs: [] }, JSON.parse(raw));
  } catch (e) {}
  return { goal: 0, sources: DEFAULT_SOURCES.slice(), txs: [] };
}
function persistLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}

// ---------- Operaciones de datos (nube o local) ----------
async function addTx(tx) {
  if (cloudOn && db) { try { await db.collection('ingresos').doc(tx.id).set(tx); return; } catch (e) {} }
  state.txs.push(tx); persistLocal(); renderAll();
}
async function removeTx(id) {
  if (cloudOn && db) { try { await db.collection('ingresos').doc(id).delete(); return; } catch (e) {} }
  state.txs = state.txs.filter(t => t.id !== id); persistLocal(); renderAll();
}
async function updateTx(tx) {
  if (cloudOn && db) { try { await db.collection('ingresos').doc(tx.id).set(tx); return; } catch (e) {} }
  persistLocal(); renderAll();
}
async function setGoal(v) {
  state.goal = v;
  if (cloudOn && db) { try { await db.collection('config').doc('ingresos_app').set({ goal: v }, { merge: true }); } catch (e) {} }
  else persistLocal();
  renderAll();
}
async function addSource(name) {
  if (!name || state.sources.includes(name)) return false;
  state.sources.push(name);
  if (cloudOn && db) { try { await db.collection('config').doc('ingresos_app').set({ sources: state.sources }, { merge: true }); } catch (e) {} }
  else persistLocal();
  return true;
}
async function removeSourceAt(i) {
  state.sources.splice(i, 1);
  if (cloudOn && db) { try { await db.collection('config').doc('ingresos_app').set({ sources: state.sources }, { merge: true }); } catch (e) {} }
  else persistLocal();
}

async function initCloud() {
  try {
    if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) return;
    if (typeof firebase === 'undefined') return;
    if (firebase.apps && firebase.apps.length) { db = firebase.firestore(); }
    else {
      firebase.initializeApp(FIREBASE_CONFIG);
      await firebase.auth().signInAnonymously();
      db = firebase.firestore();
      try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) {}
    }
    cloudOn = true;
    await migrateLocalToCloud();
    if (currentView === 'set') renderSettings();
    if (currentView === 'dash') renderDashboard();
    db.collection('ingresos').onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => { const x = d.data(); x.id = d.id; arr.push(x); });
      state.txs = arr;
      renderAll();
      if (currentView === 'hist') renderHistory();
    });
    db.collection('config').doc('ingresos_app').onSnapshot(doc => {
      if (doc.exists) {
        const c = doc.data() || {};
        if (typeof c.goal === 'number' && c.goal >= 0) state.goal = c.goal;
        if (Array.isArray(c.sources) && c.sources.length) state.sources = c.sources;
        renderAll();
        if (currentView === 'hist') renderHistory();
      }
    });
  } catch (e) {
    cloudOn = false; db = null;
    cloudErr = (e && e.message) ? String(e.message).slice(0, 140) : 'error desconocido';
    if (currentView === 'set') renderSettings();
  }
}

async function migrateLocalToCloud() {
  try {
    if (localStorage.getItem('ingresos-migrated') === '1') return;
    const snap = await db.collection('ingresos').limit(1).get();
    const cfg = await db.collection('config').doc('ingresos_app').get();
    const batch = db.batch();
    let n = 0;
    if (snap.empty && state.txs.length) {
      state.txs.forEach(t => { batch.set(db.collection('ingresos').doc(t.id), t); n++; });
    }
    if (!cfg.exists) {
      batch.set(db.collection('config').doc('ingresos_app'), { goal: state.goal, sources: state.sources });
      n++;
    }
    if (n) await batch.commit();
    localStorage.setItem('ingresos-migrated', '1');
  } catch (e) {}
}

let state = load();
let viewMonth = currentMonthKey();
let formPerson = 'Ramiro';
let editId = null;

function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return MESES[m - 1] + ' ' + y;
}
function shiftMonth(key, delta) {
  let [y, m] = key.split('-').map(Number);
  m += delta;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return y + '-' + String(m).padStart(2, '0');
}
function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function uid() { return 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
function sourceColor(src) {
  const i = state.sources.indexOf(src);
  return SOURCE_COLORS[(i < 0 ? 7 : i) % SOURCE_COLORS.length];
}
function sourceIcon(src) {
  const p = SOURCE_SVG[src];
  if (p) return SVG_OPEN + p + '</svg>';
  return SVG_OPEN + '<path d="M20.6 13.4 12.2 5a2 2 0 0 0-1.4-.6H4a1 1 0 0 0-1 1v6.8c0 .5.2 1 .6 1.4l8.4 8.4a2 2 0 0 0 2.8 0l5.8-5.8a2 2 0 0 0 0-2.8z"/><path d="M7.5 7.5h.01"/>' + '</svg>';
}

// ---------- Dashboard ----------
function monthTxs() {
  return state.txs.filter(t => (t.date || '').slice(0, 7) === viewMonth);
}
function renderDashboard() {
  const txs = monthTxs();
  const total = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
  const goal = Number(state.goal) || 0;
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

  let pill = 'ok', status = '';
  if (goal <= 0) { status = 'Sin meta — configúrala en Ajustes'; }
  else if (total >= goal) { status = 'Meta alcanzada · ' + fmt(total - goal) + ' sobre la meta'; }
  else { status = 'Faltan ' + fmt(goal - total) + ' para la meta'; }

  const R = 54, CIRC = 2 * Math.PI * R;
  let html = '<div class="hero"><div class="hero-top"><div>' +
    '<div class="hero-label">' + esc(monthLabel(viewMonth)) + '</div>' +
    '<div class="hero-amount">' + fmt(total) + '</div>' +
    '<div class="hero-cap">' + (goal > 0 ? 'de ' + fmt(goal) + ' · ' : '') + txs.length + ' ingresos</div></div>' +
    '<div class="ring-wrap"><svg viewBox="0 0 120 120" class="ring">' +
    '<circle cx="60" cy="60" r="' + R + '" class="ring-bg"/>' +
    '<circle cx="60" cy="60" r="' + R + '" class="ring-fg" style="stroke:#34d399' +
    ';stroke-dasharray:' + CIRC.toFixed(1) + ';stroke-dashoffset:' + (CIRC * (1 - pct / 100)).toFixed(1) + '"/>' +
    '</svg><div class="ring-pct">' + (goal > 0 ? Math.round(pct) + '%' : '—') + '</div></div></div>' +
    '<div><span class="statuspill ' + pill + '">' + esc(status) + '</span></div></div>';

  // Por fuente
  const bySrc = {};
  txs.forEach(t => { bySrc[t.source] = (bySrc[t.source] || 0) + Number(t.amount || 0); });
  const srcs = Object.entries(bySrc).sort((a, b) => b[1] - a[1]);
  html += '<div class="card"><h2>Por fuente</h2>';
  if (!srcs.length) html += '<div class="empty">Sin ingresos este mes.</div>';
  const maxSrc = srcs.length ? srcs[0][1] : 1;
  srcs.forEach(([c, v]) => {
    const cc = sourceColor(c);
    html += '<div class="catrow"><div class="cico" style="color:' + cc + ';background:' + cc + '1c">' + sourceIcon(c) + '</div>' +
      '<div class="cinfo"><div class="cname">' + esc(c) + '</div>' +
      '<div class="cbar"><div style="width:' + (v / maxSrc * 100).toFixed(1) + '%;background:' + cc + '"></div></div></div>' +
      '<div class="camt">' + fmt(v) + '</div></div>';
  });
  html += '</div>';

  // Por persona
  const byP = { Ramiro: 0, Nicole: 0 };
  txs.forEach(t => { if (byP[t.person] == null) byP[t.person] = 0; byP[t.person] += Number(t.amount || 0); });
  html += '<div class="card"><h2>Por persona</h2><div class="personrow">';
  PEOPLE.forEach(p => {
    const col = PEOPLE_COLORS[p] || '#34d399';
    html += '<div class="person"><div class="avatar" style="background:' + col + '">' + esc(p[0]) + '</div>' +
      '<div class="pname">' + esc(p) + '</div><div class="pamt">' + fmt(byP[p] || 0) + '</div></div>';
  });
  html += '</div></div>';

  // Últimos movimientos
  const recent = txs.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0)).slice(0, 5);
  html += '<div class="card"><h2>Últimos ingresos</h2>';
  if (!recent.length) html += '<div class="empty">Nada por aquí todavía.</div>';
  recent.forEach(t => { html += txRow(t); });
  html += '</div>';

  document.getElementById('dash').innerHTML =
    '<div class="monthnav"><button id="mPrev" aria-label="Mes anterior">‹</button>' +
    '<div class="mname">' + esc(monthLabel(viewMonth)) + '</div>' +
    '<button id="mNext" aria-label="Mes siguiente">›</button></div>' + html;
  document.getElementById('mPrev').onclick = () => { viewMonth = shiftMonth(viewMonth, -1); renderDashboard(); };
  document.getElementById('mNext').onclick = () => { viewMonth = shiftMonth(viewMonth, 1); renderDashboard(); };
  bindTxButtons(document.getElementById('dash'));
}

function txRow(t) {
  const cc = sourceColor(t.source);
  return '<div class="tx"><div class="cico" style="width:38px;height:38px;color:' + cc + ';background:' + cc + '1c">' + sourceIcon(t.source) + '</div>' +
    '<div class="tinfo"><div class="tnote">' + esc(t.note || t.source) + '</div>' +
    '<div class="tmeta">' + esc(t.date || '') + ' · ' + esc(t.source || '') + ' · ' + esc(t.person || '') + '</div></div>' +
    '<div class="tamt" style="color:var(--accent-bright)">+' + fmt(t.amount) + '</div>' +
    '<button class="tdel" data-edit="' + t.id + '" aria-label="Editar" style="font-size:15px">✎</button>' +
    '<button class="tdel" data-del="' + t.id + '" aria-label="Eliminar">×</button></div>';
}
function bindTxButtons(root) {
  root.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      if (confirm('¿Eliminar este ingreso?')) removeTx(b.getAttribute('data-del'));
    };
  });
  root.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => startEdit(b.getAttribute('data-edit'));
  });
}
function startEdit(id) {
  const t = state.txs.find(x => x.id === id);
  if (!t) return;
  editId = id;
  formPerson = t.person || 'Ramiro';
  showView('form');
  document.getElementById('fAmount').value = Number(t.amount || 0).toFixed(2);
  document.getElementById('fSource').value = t.source || state.sources[0];
  document.getElementById('fDate').value = t.date || todayISO();
  document.getElementById('fNote').value = t.note || '';
}

// ---------- Formulario ----------
function renderForm() {
  const sources = state.sources.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
  document.getElementById('form').innerHTML =
    '<div class="card"><h2>' + (editId ? 'Editar ingreso' : 'Nuevo ingreso') + '</h2>' +
    '<label>Monto (USD)</label>' +
    '<input id="fAmount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00">' +
    '<label>Fuente</label><select id="fSource">' + sources + '</select>' +
    '<label>Fecha</label><input id="fDate" type="date" value="' + todayISO() + '">' +
    '<label>¿Quién lo recibió?</label><div class="seg" id="fPerson">' +
    PEOPLE.map(p => '<button type="button" data-p="' + p + '" class="' + (p === formPerson ? 'on' : '') + '">' + p + '</button>').join('') +
    '</div>' +
    '<label>Nota (opcional)</label><input id="fNote" type="text" placeholder="Ej: pago quincena" maxlength="80">' +
    '<button class="btn" id="fSave">' + (editId ? 'Guardar cambios' : 'Agregar ingreso') + '</button>' +
    (editId ? '<button class="btn ghost" id="fCancel">Cancelar</button>' : '') +
    '</div>';

  document.querySelectorAll('#fPerson button').forEach(b => {
    b.onclick = () => {
      formPerson = b.getAttribute('data-p');
      document.querySelectorAll('#fPerson button').forEach(x => x.classList.toggle('on', x === b));
    };
  });
  document.getElementById('fSave').onclick = saveForm;
  const c = document.getElementById('fCancel');
  if (c) c.onclick = () => { editId = null; renderForm(); };
}

function saveForm() {
  const amount = parseFloat(document.getElementById('fAmount').value);
  if (!(amount > 0)) { alert('Ingresa un monto válido.'); return; }
  const source = document.getElementById('fSource').value;
  const date = document.getElementById('fDate').value || todayISO();
  const note = document.getElementById('fNote').value.trim();
  if (editId) {
    const t = state.txs.find(x => x.id === editId);
    if (t) {
      t.amount = Math.round(amount * 100) / 100; t.source = source; t.date = date; t.note = note; t.person = formPerson;
      updateTx(t);
    }
    editId = null;
  } else {
    addTx({ id: uid(), amount: Math.round(amount * 100) / 100, source, date, note, person: formPerson, ts: Date.now() });
  }
  viewMonth = date.slice(0, 7);
  renderForm();
  showView('dash');
}

// ---------- Historial ----------
function renderHistory() {
  const txs = monthTxs().slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0));
  let html = '<div class="monthnav"><button id="hPrev" aria-label="Mes anterior">‹</button>' +
    '<div class="mname">' + esc(monthLabel(viewMonth)) + '</div>' +
    '<button id="hNext" aria-label="Mes siguiente">›</button></div>';
  html += '<div class="card"><h2>' + txs.length + ' movimientos</h2>';
  if (!txs.length) html += '<div class="empty">Sin movimientos este mes.</div>';
  let lastDate = '';
  txs.forEach(t => {
    if (t.date !== lastDate) { lastDate = t.date; html += '<div class="hint" style="margin-top:10px">' + esc(t.date) + '</div>'; }
    html += txRow(t);
  });
  html += '</div>';
  const el = document.getElementById('hist');
  el.innerHTML = html;
  document.getElementById('hPrev').onclick = () => { viewMonth = shiftMonth(viewMonth, -1); renderHistory(); };
  document.getElementById('hNext').onclick = () => { viewMonth = shiftMonth(viewMonth, 1); renderHistory(); };
  bindTxButtons(el);
}

// ---------- Ajustes ----------
function renderSettings() {
  const el = document.getElementById('set');
  el.innerHTML =
    '<div class="card"><h2>Sincronización</h2>' +
    '<div class="hint" style="margin-top:0">' +
    (cloudOn
      ? '☁️ <b>Nube activada.</b> Lo que anoten tú o Nicole aparece en ambos teléfonos.'
      : '📱 <b>Modo local.</b> Los datos viven solo en este teléfono.') +
    ((!cloudOn && cloudErr && FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey)
      ? '<br><span style="color:var(--red)">No se pudo conectar: ' + esc(cloudErr) + '</span>' : '') +
    '</div></div>' +

    '<div class="card"><h2>Meta mensual</h2>' +
    '<label>Meta de ingresos mensual (USD) · 0 = sin meta</label>' +
    '<input id="sGoal" type="number" inputmode="decimal" step="10" min="0" value="' + esc(state.goal) + '">' +
    '<button class="btn" id="sSaveGoal">Guardar meta</button></div>' +

    '<div class="card"><h2>Fuentes</h2><div id="srcList">' +
    state.sources.map((c, i) => {
      const cc = sourceColor(c);
      return '<div class="tx"><div class="cico" style="width:38px;height:38px;color:' + cc + ';background:' + cc + '1c">' + sourceIcon(c) + '</div>' +
      '<div class="tinfo"><div class="tnote">' + esc(c) + '</div></div>' +
      (state.sources.length > 1 ? '<button class="tdel" data-src="' + i + '" aria-label="Eliminar fuente">×</button>' : '') +
      '</div>'; }).join('') +
    '</div><label>Nueva fuente</label><input id="sNewSrc" type="text" maxlength="30" placeholder="Ej: Intereses">' +
    '<button class="btn" id="sAddSrc">Agregar fuente</button></div>' +

    '<div class="card"><h2>Respaldo</h2>' +
    '<button class="btn ghost" id="sExport">Exportar datos (JSON)</button>' +
    '<button class="btn danger" id="sWipe" style="margin-top:10px">Borrar todos los ingresos</button>' +
    '<div class="hint">Exporta un respaldo de vez en cuando.</div></div>' +
    '<div class="ver">Ingresos Familiares · v' + APP_VERSION + '</div>';

  document.getElementById('sSaveGoal').onclick = () => {
    const v = parseFloat(document.getElementById('sGoal').value);
    if (!(v >= 0)) { alert('Ingresa una meta válida.'); return; }
    setGoal(Math.round(v * 100) / 100);
    alert(v > 0 ? 'Meta actualizada a ' + fmt(Math.round(v * 100) / 100) + '.' : 'Meta desactivada.');
  };
  document.getElementById('sAddSrc').onclick = async () => {
    const v = document.getElementById('sNewSrc').value.trim();
    if (!v) return;
    if (state.sources.includes(v)) { alert('Esa fuente ya existe.'); return; }
    await addSource(v); renderSettings();
  };
  el.querySelectorAll('[data-src]').forEach(b => {
    b.onclick = () => {
      const i = Number(b.getAttribute('data-src'));
      const name = state.sources[i];
      if (state.txs.some(t => t.source === name)) { alert('No se puede eliminar: hay ingresos con esa fuente.'); return; }
      if (confirm('¿Eliminar la fuente "' + name + '"?')) { removeSourceAt(i).then(() => renderSettings()); }
    };
  });
  document.getElementById('sExport').onclick = () => {
    const blob = new Blob([JSON.stringify({ goal: state.goal, sources: state.sources, txs: state.txs }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ingresos-respaldo-' + todayISO() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  document.getElementById('sWipe').onclick = async () => {
    if (confirm('¿Borrar TODOS los ingresos? Esto no se puede deshacer.') &&
        confirm('¿Seguro? Se perderán todos los ingresos registrados.')) {
      if (cloudOn && db) {
        try {
          const snap = await db.collection('ingresos').get();
          const batch = db.batch();
          snap.forEach(d => batch.delete(d.ref));
          batch.set(db.collection('config').doc('ingresos_app'), { goal: 0, sources: DEFAULT_SOURCES.slice() });
          await batch.commit();
        } catch (e) {}
      }
      state = { goal: 0, sources: DEFAULT_SOURCES.slice(), txs: [] };
      persistLocal(); renderAll();
    }
  };
}

// ---------- Navegación ----------
function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  document.getElementById(name === 'dash' ? 'vdash' : name === 'form' ? 'vform' : name === 'hist' ? 'vhist' : 'vset').classList.add('on');
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.getAttribute('data-v') === name));
  if (name === 'dash') renderDashboard();
  if (name === 'hist') renderHistory();
  if (name === 'set') renderSettings();
  if (name === 'form') renderForm();
  window.scrollTo(0, 0);
}
function renderAll() { renderDashboard(); }

document.querySelectorAll('nav button').forEach(b => {
  b.onclick = () => showView(b.getAttribute('data-v'));
});

if ('serviceWorker' in navigator) {
  // Sin auto-recarga al detectar SW nuevo: ese reload era una fuente del loop.
  // La actualización la maneja el aviso de version.json, con limpieza total.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

renderForm();
showView('dash');
initCloud();
checkForUpdate();
if (!window.__updWatch) window.__updWatch = setInterval(checkForUpdate, 60000);

// ---------- Actualización visible con un toque ----------
async function checkForUpdate() {
  try {
    const r = await fetch('./version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (!j.v || j.v === APP_VERSION || document.getElementById('updBtn')) return;
    const target = j.v;
    const b = document.createElement('button');
    b.id = 'updBtn';
    b.textContent = '↓ Hay una versión nueva — toca para actualizar';
    b.onclick = async () => {
      b.textContent = 'Actualizando…';
      // Limpieza total: desregistra el SW y borra todos los cachés, luego
      // recarga con URL anti-caché. Salir del loop exige partir de cero,
      // no parchar el caché viejo (eso era lo que fallaba en v1.0/v1.1).
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        const names = await caches.keys();
        await Promise.all(names.map(k => caches.delete(k)));
      } catch (e) {}
      setTimeout(() => {
        window.location.replace('./index.html?upd=' + target + '-' + Date.now());
      }, 400);
    };
    document.body.appendChild(b);
  } catch (e) {}
}
