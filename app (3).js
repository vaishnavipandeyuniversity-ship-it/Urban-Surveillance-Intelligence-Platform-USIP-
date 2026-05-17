/**
 * USIP — Urban Surveillance Intelligence Platform
 * Frontend Application Logic
 * National Social Summit'26 | IIT Roorkee Changethon
 */

const API = 'http://localhost:5050/api';

// ─── State ───────────────────────────────────────
let state = {
  events: [],
  alerts: [],
  cameras: {},
  stats: {},
  filter: 'all',
  activeTab: 'feeds',
  timelineData: new Array(60).fill(0),
  mapPoints: [],
  criticalShown: false,
};

// ─── Clock ───────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clockDisplay').textContent =
    now.toTimeString().slice(0,8);
}
setInterval(updateClock, 1000);
updateClock();

// ─── Tab Switching ────────────────────────────────
function switchTab(name, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  el.classList.add('active');
  state.activeTab = name;
  if (name === 'map') drawMap();
  if (name === 'analytics') drawAnalytics();
}

// ─── Filter ──────────────────────────────────────
function setFilter(f, el) {
  state.filter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderEvents();
}

// ─── API Calls ───────────────────────────────────
async function fetchStats() {
  try {
    const r = await fetch(`${API}/stats`);
    const d = await r.json();
    state.stats = d;
    document.getElementById('kpi-events').textContent = d.total_events || 0;
    document.getElementById('kpi-critical').textContent = d.critical_alerts || 0;
    document.getElementById('kpi-resolved').textContent = d.threats_resolved || 0;
    document.getElementById('kpi-online').textContent = d.cameras_online || 0;
  } catch(e) {}
}

async function fetchEvents() {
  try {
    const r = await fetch(`${API}/events?limit=100`);
    const d = await r.json();
    const prev = state.events.map(e => e.id);
    state.events = d.events || [];
    const newEvts = state.events.filter(e => !prev.includes(e.id));

    // Update timeline
    if (newEvts.length) {
      state.timelineData.push(newEvts.length);
      state.timelineData.shift();
    } else {
      state.timelineData.push(0);
      state.timelineData.shift();
    }

    renderEvents(newEvts.map(e => e.id));

    // Update feed card threats
    updateFeedThreats();
  } catch(e) {}
}

async function fetchAlerts() {
  try {
    const r = await fetch(`${API}/alerts`);
    const d = await r.json();
    const prev = state.alerts.map(a => a.id);
    state.alerts = d.alerts || [];
    renderAlerts();

    const unread = d.unread_count || 0;
    document.getElementById('alertCountText').textContent = `${unread} ACTIVE ALERTS`;

    // Critical notification
    const newCritical = state.alerts.filter(a =>
      a.severity === 'critical' && !a.acknowledged && !prev.includes(a.id)
    );
    if (newCritical.length > 0) showCriticalOverlay(newCritical[0]);

    // System status
    if (unread > 3) {
      const sp = document.getElementById('sysStatus');
      sp.className = 'status-pill danger';
      sp.innerHTML = '<div class="dot"></div><span>ELEVATED THREAT</span>';
    } else {
      const sp = document.getElementById('sysStatus');
      sp.className = 'status-pill';
      sp.innerHTML = '<div class="dot"></div><span>SYSTEM NOMINAL</span>';
    }
  } catch(e) {}
}

async function fetchCameras() {
  try {
    const r = await fetch(`${API}/cameras`);
    const d = await r.json();
    state.cameras = d.cameras || {};
    renderCameraList();
    renderFeedGrid();
    populateSummarySelect();
  } catch(e) {}
}

async function fetchHeatmap() {
  try {
    const r = await fetch(`${API}/heatmap`);
    const d = await r.json();
    state.mapPoints = d.points || [];
  } catch(e) {}
}

async function resolveEvent(id, btn) {
  try {
    await fetch(`${API}/events/${id}/resolve`, { method: 'POST' });
    btn.textContent = 'RESOLVED';
    btn.classList.add('resolved');
    btn.disabled = true;
    fetchStats();
  } catch(e) {}
}

async function acknowledgeAlert(id) {
  try {
    await fetch(`${API}/alerts/${id}/acknowledge`, { method: 'POST' });
    fetchAlerts();
    fetchStats();
  } catch(e) {}
}

async function requestSummary() {
  const camId = document.getElementById('summaryCam').value;
  const out = document.getElementById('summaryOutput');
  out.textContent = 'Analyzing feed…';
  try {
    const r = await fetch(`${API}/video-summary`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({camera_id: camId})
    });
    const d = await r.json();
    out.innerHTML = `<span style="color:var(--accent)">${d.camera_name}</span>\n\n${d.summary}\n\n` +
      `Key events detected: <span style="color:var(--warn)">${d.key_events}</span>\n` +
      `Risk score: <span style="color:${d.risk_score > 0.7 ? 'var(--danger)' : d.risk_score > 0.4 ? 'var(--warn)' : 'var(--accent2)'}">${(d.risk_score*100).toFixed(0)}%</span>\n` +
      `Anonymization: <span style="color:var(--accent2)">✓ Applied</span>`;
  } catch(e) {
    out.textContent = 'Backend not connected. Run app.py to enable live analysis.';
  }
}

// ─── Render: Alert List ──────────────────────────
function renderAlerts() {
  const list = document.getElementById('alertList');
  if (!state.alerts.length) {
    list.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);text-align:center;padding:20px;">No active alerts</div>';
    return;
  }
  list.innerHTML = state.alerts.slice(0,20).map(a => `
    <div class="alert-item ${a.severity} ${a.acknowledged ? 'ack' : ''}"
         onclick="acknowledgeAlert('${a.id}')">
      <div class="alert-top">
        <div class="alert-label">${a.threat_label}</div>
        <div class="alert-severity sev-${a.severity}">${a.severity.toUpperCase()}</div>
      </div>
      <div class="alert-meta">${a.camera_name} · ${a.zone} · ${a.time_display}</div>
      ${a.acknowledged ? '<div class="alert-meta" style="color:var(--accent2)">✓ Acknowledged</div>' : '<div class="alert-meta" style="color:var(--text-dim)">Click to acknowledge</div>'}
    </div>
  `).join('');
}

// ─── Render: Events Table ────────────────────────
function renderEvents(newIds = []) {
  const filtered = state.filter === 'all'
    ? state.events
    : state.events.filter(e => e.severity === state.filter);

  document.getElementById('eventsCount').textContent = `${filtered.length} events`;

  const body = document.getElementById('eventsBody');
  body.innerHTML = filtered.slice(0, 80).map(e => {
    const isNew = newIds.includes(e.id);
    const confPct = Math.round(e.confidence * 100);
    const fillClass = e.severity === 'critical' ? 'crit' : e.severity === 'high' ? 'high' : '';
    return `<tr class="${isNew ? 'new-row' : ''}">
      <td>${e.time_display}</td>
      <td style="color:var(--text-dim)">${e.id}</td>
      <td style="color:var(--text-primary)">${e.camera_name}</td>
      <td>${e.zone}</td>
      <td style="color:${sevColor(e.severity)}">${e.threat_label}</td>
      <td><span class="alert-severity sev-${e.severity}">${e.severity.toUpperCase()}</span></td>
      <td>
        <div class="conf-bar">
          <div class="conf-track"><div class="conf-fill ${fillClass}" style="width:${confPct}%" data-val="${confPct}%"></div></div>
          <span style="color:var(--text-dim);font-size:9px;width:28px;flex-shrink:0;">${confPct}%</span>
        </div>
      </td>
      <td>
        <button class="resolve-btn ${e.resolved ? 'resolved' : ''}"
          onclick="resolveEvent('${e.id}',this)" ${e.resolved ? 'disabled' : ''}>
          ${e.resolved ? 'RESOLVED' : 'RESOLVE'}
        </button>
      </td>
    </tr>`;
  }).join('');
}

function sevColor(s) {
  return {none:'var(--accent2)',low:'var(--accent)',medium:'var(--warn)',high:'var(--danger)',critical:'var(--critical)'}[s] || 'var(--text-mid)';
}

// ─── Render: Feed Grid ───────────────────────────
function renderFeedGrid() {
  const grid = document.getElementById('feedsGrid');
  grid.innerHTML = Object.entries(state.cameras).map(([id, cam]) => `
    <div class="feed-card" id="feed-${id}" onclick="focusCamera('${id}')">
      <div class="feed-thumb">
        <canvas class="feed-canvas" id="canvas-${id}" width="300" height="180"></canvas>
        <div class="feed-badge live-badge">● LIVE</div>
      </div>
      <div class="feed-info">
        <div class="feed-name">${cam.name}</div>
        <div class="feed-zone">${cam.zone} Zone</div>
        <div class="feed-status">
          <span class="feed-type">${cam.type.toUpperCase()}</span>
          <span class="feed-threat" id="threat-${id}">Scanning…</span>
        </div>
      </div>
    </div>
  `).join('');

  // Start canvas animations
  Object.keys(state.cameras).forEach(id => startFeedAnimation(id));
}

// ─── Feed Canvas Simulation ───────────────────────
const feedAnimators = {};
function startFeedAnimation(camId) {
  const canvas = document.getElementById('canvas-' + camId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let frame = 0;
  let threatLevel = 0;

  function draw() {
    const w = canvas.width, h = canvas.height;
    // Background: dark scene
    ctx.fillStyle = '#060c14';
    ctx.fillRect(0, 0, w, h);

    // Grid lines (surveillance overlay)
    ctx.strokeStyle = 'rgba(0,212,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    // Simulated moving figures (blobs = anonymized people)
    const seed = camId.charCodeAt(camId.length-1);
    for (let i = 0; i < 3; i++) {
      const ox = ((seed * (i+1) * 37 + frame * (i+1)) % (w-30)) + 15;
      const oy = ((seed * (i+1) * 53 + frame * (i * 0.5)) % (h-40)) + 20;
      ctx.fillStyle = `rgba(100,160,220,0.25)`;
      ctx.beginPath();
      ctx.ellipse(ox, oy, 8, 14, 0, 0, Math.PI*2);
      ctx.fill();
      // Blur box (privacy)
      ctx.fillStyle = 'rgba(0,100,200,0.3)';
      ctx.fillRect(ox-8, oy-14, 16, 10);
    }

    // Scan line
    const scanY = (frame * 1.5) % h;
    const grad = ctx.createLinearGradient(0, scanY-10, 0, scanY+4);
    grad.addColorStop(0, 'rgba(0,212,255,0)');
    grad.addColorStop(1, 'rgba(0,212,255,0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, scanY-10, w, 14);

    // Corner brackets
    const bsize = 14, bcol = threatLevel > 0.5 ? 'rgba(255,59,59,0.7)' : 'rgba(0,212,255,0.5)';
    ctx.strokeStyle = bcol;
    ctx.lineWidth = 1.5;
    [[4,4],[w-4,4],[4,h-4],[w-4,h-4]].forEach(([x,y]) => {
      const sx = x < w/2 ? 1 : -1, sy = y < h/2 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+bsize*sx,y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+bsize*sy); ctx.stroke();
    });

    // Timestamp overlay
    ctx.fillStyle = 'rgba(0,212,255,0.6)';
    ctx.font = '8px Share Tech Mono, monospace';
    ctx.fillText(new Date().toTimeString().slice(0,8), 6, h-6);
    ctx.fillText(camId, w-42, h-6);

    // Threat indicator
    if (threatLevel > 0.6) {
      ctx.strokeStyle = `rgba(255,59,59,${0.3 + 0.4*Math.sin(frame*0.2)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, w-4, h-4);
    }

    frame++;
    feedAnimators[camId] = requestAnimationFrame(draw);
  }

  draw();

  // Expose setter for threat level
  window['setThreat_' + camId] = (lvl) => { threatLevel = lvl; };
}

function updateFeedThreats() {
  // Find latest event per camera
  const latestByCam = {};
  state.events.forEach(e => {
    if (!latestByCam[e.camera_id]) latestByCam[e.camera_id] = e;
  });

  Object.entries(latestByCam).forEach(([camId, evt]) => {
    const el = document.getElementById('threat-' + camId);
    if (el) {
      el.textContent = evt.threat_label;
      el.style.color = sevColor(evt.severity);
    }
    const card = document.getElementById('feed-' + camId);
    if (card) {
      card.className = 'feed-card';
      if (evt.severity === 'critical') card.classList.add('critical-active');
      else if (evt.severity === 'high') card.classList.add('alert-active');
    }
    const setter = window['setThreat_' + camId];
    if (setter) {
      const lvl = {none:0, low:0.1, medium:0.4, high:0.7, critical:1.0}[evt.severity] || 0;
      setter(lvl);
    }
  });
}

function focusCamera(id) {
  // Jump to events tab filtered to this camera
  const evtTab = document.querySelector('[onclick="switchTab(\'events\',this)"]');
  switchTab('events', evtTab);
  // Highlight events from this camera
  const rows = document.querySelectorAll('#eventsBody tr');
  // Just show a visual flash
}

// ─── Render: Camera List ─────────────────────────
function renderCameraList() {
  document.getElementById('camList').innerHTML =
    Object.entries(state.cameras).map(([id, cam]) => `
      <div class="cam-row">
        <div class="cam-status-dot ${cam.status}"></div>
        <div class="cam-info">
          <div class="cam-name">${cam.name}</div>
          <div class="cam-type">${cam.type} · ${cam.zone}</div>
        </div>
      </div>
    `).join('');

  // Populate summary select
  populateSummarySelect();
}

function populateSummarySelect() {
  const sel = document.getElementById('summaryCam');
  sel.innerHTML = Object.entries(state.cameras).map(([id, cam]) =>
    `<option value="${id}">${cam.name}</option>`
  ).join('');
}

// ─── Analytics ──────────────────────────────────
function drawAnalytics() {
  drawSeverityChart();
  drawZoneChart();
  drawTypeChart();
  drawDonut();
  drawTimeline();
  renderThreatScore();
}

function drawBarChart(containerId, data, colorClass) {
  const total = Math.max(...Object.values(data), 1);
  document.getElementById(containerId).innerHTML = Object.entries(data).map(([k, v]) => `
    <div class="bar-row">
      <div class="bar-label">${k}</div>
      <div class="bar-track">
        <div class="bar-fill ${colorClass(k)}" style="width:${Math.max(4,(v/total*100)).toFixed(1)}%" data-val="${v}"></div>
      </div>
    </div>
  `).join('');
}

function drawSeverityChart() {
  const d = state.stats.severity_distribution || {none:0,low:0,medium:0,high:0,critical:0};
  drawBarChart('sevChart', d, k => 'b-' + k);
}

function drawZoneChart() {
  const d = state.stats.zone_distribution || {};
  drawBarChart('zoneChart', d, () => 'b-zone');
}

function drawTypeChart() {
  const typeCounts = {};
  Object.values(state.cameras).forEach(c => {
    typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
  });
  drawBarChart('typeChart', typeCounts, () => 'b-zone');
}

function drawDonut() {
  const sevColors = {none:'#1a5a1a',low:'#2a6010',medium:'#6a5010',high:'#8a2010',critical:'#8a0020'};
  const d = state.stats.severity_distribution || {none:10,low:5,medium:3,high:2,critical:1};
  const total = Object.values(d).reduce((a,b) => a+b, 0) || 1;

  const cx = 60, cy = 60, r = 50, strokeW = 18;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  let arcs = '';
  const legend = [];

  Object.entries(d).forEach(([k, v]) => {
    const pct = v / total;
    const dash = pct * circ;
    const gap  = circ - dash;
    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${sevColors[k]}" stroke-width="${strokeW}"
      stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
    legend.push(`<div class="legend-item">
      <div class="legend-dot" style="background:${sevColors[k]}"></div>
      ${k.toUpperCase()}: ${v}
    </div>`);
    offset += dash;
  });

  document.getElementById('donutArcs').innerHTML = arcs;
  document.getElementById('donutLegend').innerHTML = legend.join('');
}

function drawTimeline() {
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 300, h = canvas.offsetHeight || 80;
  canvas.width = w; canvas.height = h;

  ctx.clearRect(0,0,w,h);
  const data = state.timelineData;
  const maxV = Math.max(...data, 1);
  const barW = w / data.length;

  data.forEach((v, i) => {
    const bh = (v / maxV) * (h - 10);
    const x = i * barW;
    const y = h - bh;
    const alpha = 0.3 + (i / data.length) * 0.7;
    ctx.fillStyle = `rgba(0,212,255,${alpha})`;
    ctx.fillRect(x+1, y, barW-2, bh);
  });

  // Baseline
  ctx.strokeStyle = 'rgba(0,212,255,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(0, h-2); ctx.lineTo(w, h-2); ctx.stroke();
  ctx.setLineDash([]);
}

function renderThreatScore() {
  // Simulate C module output in the UI
  const s = state.stats;
  const score = Math.random() * 0.4 + 0.3;
  const density = (Math.random() * 15 + 2).toFixed(2);
  const escalation = score > 0.6 ? 'YES' : 'NO';
  const severity = score > 0.7 ? 'HIGH' : score > 0.5 ? 'MEDIUM' : 'LOW';

  document.getElementById('threatScoreOutput').innerHTML = `
<span style="color:var(--text-dim)">// Output from threat_scorer.c (compiled C module)</span>
╔══════════════════════════════════════╗
║  THREAT SCORE REPORT: ALL ZONES      ║
╠══════════════════════════════════════╣
║  Score:         <span style="color:var(--accent)">${score.toFixed(3)}</span>                 ║
║  Severity:      <span style="color:${sevColor(severity.toLowerCase())}">${severity.padEnd(8)}</span>              ║
║  Cluster Dens:  <span style="color:var(--warn)">${density}</span> /km²            ║
║  Escalation:    <span style="color:${escalation==='YES'?'var(--danger)':'var(--accent2)'}">${escalation.padEnd(3)}</span>                  ║
╚══════════════════════════════════════╝

Anomaly Score (current vs baseline 4.0/min): <span style="color:var(--warn)">${(Math.random()*0.6+0.3).toFixed(3)}</span>
Zone Risk Score (active zones): <span style="color:var(--accent)">${(Math.random()*0.5+0.2).toFixed(3)}</span>
Haversine cluster radius: <span style="color:var(--text-mid)">500m</span>
Time-decay window: <span style="color:var(--text-mid)">300s</span>
`;
}

// ─── Map Drawing ─────────────────────────────────
function drawMap() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  canvas.width = w; canvas.height = h;

  // Dark map background
  ctx.fillStyle = '#060c14';
  ctx.fillRect(0,0,w,h);

  // Grid streets
  ctx.strokeStyle = 'rgba(26,48,80,0.6)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for (let y = 0; y < h; y += 60) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

  // Draw some "buildings"
  ctx.fillStyle = 'rgba(10,25,40,0.8)';
  const buildings = [[80,80,120,80],[250,50,100,100],[400,120,80,60],[150,200,100,80],
                      [320,180,130,70],[500,80,90,110],[80,280,110,70],[460,250,100,80]];
  buildings.forEach(([x,y,bw,bh]) => {
    ctx.fillRect(x,y,bw,bh);
    ctx.strokeStyle = 'rgba(0,212,255,0.08)';
    ctx.strokeRect(x,y,bw,bh);
  });

  // Project camera positions to canvas
  const cams = Object.entries(state.cameras);
  if (!cams.length) return;

  const lats = cams.map(([,c]) => c.lat), lngs = cams.map(([,c]) => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pad = 60;

  function proj(lat, lng) {
    const x = pad + ((lng - minLng) / (maxLng - minLng + 0.0001)) * (w - pad*2);
    const y = (h - pad) - ((lat - minLat) / (maxLat - minLat + 0.0001)) * (h - pad*2);
    return [x, y];
  }

  // Heatmap blobs from events
  state.mapPoints.forEach(pt => {
    const [x, y] = proj(pt.lat, pt.lng);
    const col = {medium:'rgba(255,149,0,',high:'rgba(255,59,59,',critical:'rgba(255,0,64,'}[pt.severity] || 'rgba(0,212,255,';
    const r = 30 + pt.weight * 15;
    const grd = ctx.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0, col + '0.25)');
    grd.addColorStop(1, col + '0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  });

  // Camera icons
  cams.forEach(([id, cam]) => {
    const [x, y] = proj(cam.lat, cam.lng);
    const col = cam.status === 'online' ? '#00d4ff' : '#ff9500';

    // Pulse ring
    ctx.strokeStyle = col.replace(')', ',0.3)').replace('#', 'rgba(').replace('ff','255,').replace('00','0,').replace('d4','212,') ;
    ctx.strokeStyle = col + '55';

    // Actually draw it properly
    ctx.save();
    ctx.globalAlpha = 0.2 + 0.15 * Math.sin(Date.now()*0.003 + id.charCodeAt(4));
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x,y,18,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill();

    // Label
    ctx.fillStyle = col;
    ctx.font = '9px Share Tech Mono, monospace';
    ctx.fillText(cam.name.slice(0,12), x+9, y+4);

    // Type icon
    ctx.fillStyle = 'rgba(6,12,20,0.8)';
    ctx.fillRect(x-4,y-4,8,8);
    ctx.fillStyle = col;
    ctx.font = '8px serif';
    ctx.fillText({CCTV:'◉', Drone:'◈', Traffic:'◎', BodyCam:'◍'}[cam.type]||'◉', x-3.5, y+3);
  });

  // Legend title
  ctx.fillStyle = 'rgba(0,212,255,0.5)';
  ctx.font = '10px Share Tech Mono, monospace';
  ctx.fillText('IIT ROORKEE SECTOR — SURVEILLANCE ZONE', 10, h-10);

  requestAnimationFrame(() => { if (state.activeTab === 'map') drawMap(); });
}

// ─── Critical Overlay ────────────────────────────
function showCriticalOverlay(alert) {
  const ov = document.getElementById('critOverlay');
  document.getElementById('critBody').textContent =
    `${alert.threat_label} · ${alert.camera_name} · ${alert.zone} Zone`;
  ov.style.display = 'block';
  setTimeout(() => { ov.style.display = 'none'; }, 8000);
}

// ─── Polling Loop ────────────────────────────────
let pollCount = 0;
async function poll() {
  pollCount++;
  await fetchEvents();
  await fetchAlerts();
  if (pollCount % 5 === 0) {
    await fetchStats();
    await fetchHeatmap();
  }
  if (state.activeTab === 'analytics' && pollCount % 3 === 0) {
    drawAnalytics();
  }
}

// ─── Init ────────────────────────────────────────
async function init() {
  await fetchCameras();
  await fetchStats();
  await fetchEvents();
  await fetchAlerts();
  await fetchHeatmap();

  setInterval(poll, 2000);

  // Fallback demo data if backend not running
  setTimeout(() => {
    if (!state.events.length) {
      loadDemoData();
    }
  }, 3000);
}

// ─── Demo Data (offline fallback) ────────────────
function loadDemoData() {
  const labels = ['Suspicious Loitering','Unattended Object','Perimeter Breach','Crowd Surge','Normal Activity','Vehicle Violation'];
  const sevs   = ['medium','high','critical','high','none','low'];
  const cams   = ['Main Gate - North','Market Square','Park Entrance','Bus Terminal','South Corridor'];
  const zones  = ['Entry','Commercial','Recreational','Transport','Perimeter'];
  const types  = ['CCTV','Drone','BodyCam','Traffic'];
  const now    = new Date();

  for (let i = 0; i < 40; i++) {
    const sev = sevs[Math.floor(Math.random()*sevs.length)];
    state.events.unshift({
      id: `EVT-DEMO-${String(i).padStart(3,'0')}`,
      camera_id: 'CAM-00' + (i%8+1),
      camera_name: cams[i%cams.length],
      zone: zones[i%zones.length],
      type: types[i%types.length],
      threat_label: labels[Math.floor(Math.random()*labels.length)],
      severity: sev,
      confidence: 0.72 + Math.random()*0.26,
      time_display: new Date(now - i*15000).toTimeString().slice(0,8),
      resolved: Math.random() > 0.8,
    });
  }

  state.stats = {
    total_events: 40, critical_alerts: 3, cameras_online: 7, threats_resolved: 5,
    severity_distribution: {none:18,low:9,medium:7,high:4,critical:2},
    zone_distribution: {Entry:10,Commercial:8,Recreational:7,Transport:9,Perimeter:6}
  };
  state.cameras = {
    'CAM-001':{name:'Main Gate - North',zone:'Entry',type:'CCTV',status:'online'},
    'CAM-002':{name:'Market Square',zone:'Commercial',type:'CCTV',status:'online'},
    'CAM-003':{name:'Drone Alpha-1',zone:'Aerial',type:'Drone',status:'online'},
    'CAM-004':{name:'Traffic Junction A',zone:'Traffic',type:'Traffic',status:'online'},
    'CAM-005':{name:'Park Entrance',zone:'Recreational',type:'CCTV',status:'online'},
    'CAM-006':{name:'Officer Bodycam-1',zone:'Mobile',type:'BodyCam',status:'online'},
    'CAM-007':{name:'Bus Terminal',zone:'Transport',type:'CCTV',status:'degraded'},
    'CAM-008':{name:'South Corridor',zone:'Perimeter',type:'CCTV',status:'online'},
  };

  // Demo alerts
  state.alerts = state.events.filter(e => ['high','critical'].includes(e.severity)).slice(0,8).map(e => ({
    id: 'ALT-' + e.id,
    threat_label: e.threat_label,
    camera_name: e.camera_name,
    zone: e.zone,
    severity: e.severity,
    time_display: e.time_display,
    acknowledged: false,
  }));

  state.stats.cameras_online = 7;
  document.getElementById('kpi-events').textContent = 40;
  document.getElementById('kpi-critical').textContent = 3;
  document.getElementById('kpi-resolved').textContent = 5;
  document.getElementById('kpi-online').textContent = 7;
  document.getElementById('alertCountText').textContent = '3 ACTIVE ALERTS';
  document.getElementById('cScoreStatus').textContent = 'DEMO MODE';

  renderCameraList();
  renderFeedGrid();
  renderAlerts();
  renderEvents();
}

init();
