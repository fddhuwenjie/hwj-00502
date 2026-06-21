const API = 'http://localhost:8502/api';

let ME = null;
let USERS = [];
const MEETING_TYPES = ['周会', '评审', '复盘', '客户会议', '临时会议'];
const PRIORITIES = ['高', '中', '低'];
const STATUSES = ['待开始', '进行中', '已完成', '延期', '取消'];
const TYPE_COLOR = { '周会': '#4f6df5', '评审': '#f08c00', '复盘': '#0ca678', '客户会议': '#d6336c', '临时会议': '#7048e8' };
const STATUS_COLOR = { '待开始': '#adb5bd', '进行中': '#4f6df5', '已完成': '#0ca678', '延期': '#e03131', '取消': '#868e96' };

const app = document.getElementById('app');
const modalRoot = document.getElementById('modalRoot');

/* ---------- helpers ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function initials(name) { return name ? name.slice(-2) : '?'; }
function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (isNaN(d)) return s;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDay(s) { return s ? s.slice(0, 10) : '-'; }
function isOverdue(item) {
  if (!item.due_date || ['已完成', '取消'].includes(item.status)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(item.due_date + 'T00:00:00') < today;
}
function typeClass(t) {
  const map = { '周会': 'zhou', '评审': 'ping', '复盘': 'fu', '客户会议': 'ke', '临时会议': 'lin' };
  return map[t] || 'lin';
}
function avatar(u) {
  if (!u) return '<span class="avatar" style="background:#adb5bd">?</span>';
  return `<span class="avatar" style="background:${u.avatar_color || '#4f6df5'}" title="${escapeHtml(u.name)}">${escapeHtml(initials(u.name))}</span>`;
}
function avatars(list) {
  if (!list || !list.length) return '<span class="muted">-</span>';
  return `<span class="avatars">${list.map(avatar).join('')}</span>`;
}
function badge(html, cls) { return `<span class="badge ${cls}">${escapeHtml(html)}</span>`; }
function priorityBadge(p) { return badge(p, 'pri-' + p); }
function statusBadge(s) { return badge(s, 'st-' + s); }
function typeBadge(t) { return badge(t, 'type-' + typeClass(t)); }

async function api(path, options = {}) {
  const opt = { headers: { 'Content-Type': 'application/json' }, ...options };
  if (opt.body && typeof opt.body !== 'string') opt.body = JSON.stringify(opt.body);
  const res = await fetch(API + path, opt);
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try { const j = await res.json(); msg = j.error || msg; } catch (e) {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toastWrap').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
function openModal(title, bodyHtml, footHtml = '', cls = '') {
  modalRoot.innerHTML = `<div class="modal-overlay"><div class="modal ${cls}">
    <div class="modal-head"><h3>${title}</h3><button class="btn ghost sm" data-close="1">✕</button></div>
    <div class="modal-body">${bodyHtml}</div>
    ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}
  </div></div>`;
  modalRoot.querySelector('.modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget || e.target.dataset.close) closeModal();
  });
}
function closeModal() { modalRoot.innerHTML = ''; }

function renderMarkdown(md) {
  if (!md) return '<p class="muted">（暂无内容）</p>';
  const lines = escapeHtml(md).split(/\r?\n/);
  let html = '', inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  lines.forEach(line => {
    let m;
    if (/^\s*$/.test(line)) { closeList(); return; }
    if ((m = line.match(/^######\s+(.*)$/))) { closeList(); html += `<h6>${m[1]}</h6>`; return; }
    if ((m = line.match(/^#####\s+(.*)$/))) { closeList(); html += `<h5>${m[1]}</h5>`; return; }
    if ((m = line.match(/^####\s+(.*)$/))) { closeList(); html += `<h4>${m[1]}</h4>`; return; }
    if ((m = line.match(/^###\s+(.*)$/))) { closeList(); html += `<h3>${m[1]}</h3>`; return; }
    if ((m = line.match(/^##\s+(.*)$/))) { closeList(); html += `<h2>${m[1]}</h2>`; return; }
    if ((m = line.match(/^#\s+(.*)$/))) { closeList(); html += `<h1>${m[1]}</h1>`; return; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${m[1]}</li>`; return; }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) { closeList(); html += `<p>${m[1]}</p>`; return; }
    closeList();
    html += `<p>${line}</p>`;
  });
  closeList();
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
}

function barChart(rows, colorFn) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return rows.map(r => {
    const pct = Math.round((r.value / max) * 100);
    const color = colorFn ? colorFn(r) : 'var(--primary)';
    return `<div class="bar-row">
      <div class="bar-label">${escapeHtml(r.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="bar-val">${r.value}${r.suffix || ''}</div>
    </div>`;
  }).join('');
}
function donut(data) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const r = 60, c = 2 * Math.PI * r;
  let offset = 0;
  const segs = data.map(d => {
    const len = (d.value / total) * c;
    const seg = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${d.color}" stroke-width="26" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}"></circle>`;
    offset += len;
    return seg;
  }).join('');
  return `<svg width="160" height="160" viewBox="0 0 160 160" style="transform:rotate(-90deg)">
    <circle r="${r}" cx="80" cy="80" fill="none" stroke="#f1f3f5" stroke-width="26"></circle>${segs}
  </svg>`;
}

/* ---------- router ---------- */
async function route() {
  const hash = location.hash.slice(2) || 'dashboard';
  const [view, ...rest] = hash.split('/');
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === view));
  try {
    if (view === 'dashboard') await viewDashboard();
    else if (view === 'meetings') {
      if (rest[0] === 'new') await viewMeetingForm(null);
      else if (rest[0]) await viewMeetingDetail(rest[0]);
      else await viewMeetings();
    }
    else if (view === 'actions') {
      if (rest[0]) await viewActionDetail(rest[0]);
      else await viewActions();
    }
    else if (view === 'search') await viewSearch();
    else if (view === 'people') await viewPeople();
    else await viewDashboard();
  } catch (e) {
    app.innerHTML = `<div class="card"><div class="empty"><div class="big">⚠️</div>${escapeHtml(e.message)}</div></div>`;
  }
  window.scrollTo(0, 0);
}

/* ---------- dashboard ---------- */
async function viewDashboard() {
  app.innerHTML = `<h1 class="page-title">仪表盘</h1><p class="page-desc">本月会议与行动项全局概览</p>
    <div id="dash"><div class="empty">加载中…</div></div>`;
  const [ov, owners] = await Promise.all([api('/stats/overview'), api('/stats/owners')]);
  const st = ov.action_item_status;
  const totalItems = ov.total_action_items;
  const typeRows = MEETING_TYPES.map(t => ({ label: t, value: ov.meeting_type_ratio[t] || 0 }));
  const statusRows = STATUSES.map(s => ({ label: s, value: st[s] || 0 }));
  const top = owners.slice(0, 6);
  app.querySelector('#dash').innerHTML = `
    <div class="grid cols-4">
      <div class="stat accent"><div class="label">本月会议数</div><div class="value">${ov.monthly_meetings}</div><div class="hint">总会议 ${ov.total_meetings} 场</div></div>
      <div class="stat success"><div class="label">平均会议时长（本月）</div><div class="value">${ov.monthly_avg_duration}<span style="font-size:14px"> 分钟</span></div><div class="hint">整体均值 ${ov.total_avg_duration} 分钟</div></div>
      <div class="stat"><div class="label">行动项总数</div><div class="value">${totalItems}</div><div class="hint">已完成 ${st['已完成'] || 0} · 进行中 ${st['进行中'] || 0}</div></div>
      <div class="stat danger"><div class="label">逾期率</div><div class="value">${ov.overdue_rate}%</div><div class="hint">逾期 ${ov.overdue_count} 项</div></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title">行动项状态分布</div>
        <div class="donut-wrap">
          ${donut(statusRows.map(r => ({ value: r.value, color: STATUS_COLOR[r.label] })))}
          <div class="legend">${statusRows.map(r => `<div class="li"><span class="dot" style="background:${STATUS_COLOR[r.label]}"></span>${r.label}：${r.value}</div>`).join('')}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">会议类型占比</div>
        <div class="donut-wrap">
          ${donut(typeRows.map(r => ({ value: r.value, color: TYPE_COLOR[r.label] })))}
          <div class="legend">${typeRows.map(r => `<div class="li"><span class="dot" style="background:${TYPE_COLOR[r.label]}"></span>${r.label}：${r.value}</div>`).join('')}</div>
        </div>
      </div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title">负责人完成率排行</div>
        ${barChart(top.map(o => ({ label: o.name, value: o.completion_rate, suffix: '%' })), () => 'var(--success)')}
      </div>
      <div class="card">
        <div class="card-title">月度会议趋势</div>
        ${barChart(ov.monthly_trend.map(t => ({ label: t.month.slice(5), value: t.count })), () => 'var(--primary)')}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-title">负责人明细</div>
      <table class="tbl">
        <thead><tr><th>负责人</th><th>部门</th><th>负责项</th><th>已完成</th><th>进行中</th><th>逾期</th><th>完成率</th></tr></thead>
        <tbody>${owners.map(o => `<tr>
          <td>${avatar(o)} ${escapeHtml(o.name)}</td>
          <td>${escapeHtml(o.department)}</td>
          <td>${o.total}</td>
          <td>${o.completed}</td>
          <td>${o.in_progress}</td>
          <td>${o.overdue ? `<span class="overdue-flag">${o.overdue}</span>` : 0}</td>
          <td><div class="progress ${o.completion_rate >= 100 ? 'done' : ''}"><span style="width:${o.completion_rate}%"></span></div> ${o.completion_rate}%</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

/* ---------- meetings list ---------- */
let meetingsFilters = { type: '', attendee: '', keyword: '' };
async function viewMeetings() {
  app.innerHTML = `<div class="page-head">
      <div><h1 class="page-title">会议管理</h1><p class="page-desc">创建会议、编辑纪要并追踪行动项</p></div>
      <button class="btn primary" onclick="location.hash='#/meetings/new'">+ 新建会议</button>
    </div>
    <div class="toolbar">
      <select id="fType"><option value="">全部类型</option>${MEETING_TYPES.map(t => `<option ${meetingsFilters.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select id="fAttendee"><option value="">全部参会人</option>${USERS.map(u => `<option value="${u.id}" ${String(meetingsFilters.attendee) === String(u.id) ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select>
      <input id="fKw" placeholder="搜索标题/议程" value="${escapeHtml(meetingsFilters.keyword)}" style="flex:1;max-width:260px" />
      <button class="btn primary" id="fGo">搜索</button>
    </div>
    <div class="card"><div id="mList"><div class="empty">加载中…</div></div></div>`;
  const go = async () => {
    meetingsFilters = { type: fType.value, attendee: fAttendee.value, keyword: fKw.value };
    const qs = new URLSearchParams();
    if (meetingsFilters.type) qs.set('type', meetingsFilters.type);
    if (meetingsFilters.attendee) qs.set('attendee', meetingsFilters.attendee);
    if (meetingsFilters.keyword) qs.set('keyword', meetingsFilters.keyword);
    const list = await api('/meetings?' + qs.toString());
    document.getElementById('mList').innerHTML = list.length ? `<table class="tbl">
      <thead><tr><th>标题</th><th>类型</th><th>时间</th><th>地点</th><th>主持人</th><th>参会人</th><th>行动项</th></tr></thead>
      <tbody>${list.map(m => `<tr onclick="location.hash='#/meetings/${m.id}'">
        <td><strong>${escapeHtml(m.title)}</strong><div class="muted" style="font-size:11px">${m.minutes && m.minutes.published_at ? '纪要已发布' : '纪要未发布'}</div></td>
        <td>${typeBadge(m.type)}</td>
        <td>${fmtDate(m.start_time)}<div class="muted" style="font-size:11px">${m.duration_minutes} 分钟</div></td>
        <td>${escapeHtml(m.location || '-')}</td>
        <td>${m.host ? escapeHtml(m.host.name) : '-'}</td>
        <td>${avatars(m.attendees)}</td>
        <td>${m.action_item_count}</td>
      </tr>`).join('')}</tbody></table>` : `<div class="empty"><div class="big">📭</div>暂无符合条件的会议</div>`;
  };
  document.getElementById('fGo').onclick = go;
  go();
}

/* ---------- meeting form ---------- */
async function viewMeetingForm(id) {
  let m = { title: '', type: '周会', start_time: '', end_time: '', location: '', host_id: ME?.id, agenda: '', attendees: [] };
  let minutesContent = '';
  if (id) {
    m = await api('/meetings/' + id);
    m.attendees = (m.attendees || []).map(a => a.id);
  }
  openModal(id ? '编辑会议' : '新建会议', `
    <div class="form-row"><label>会议标题 *</label><input id="mTitle" value="${escapeHtml(m.title)}" placeholder="如：产品周会-第26周" /></div>
    <div class="form-grid">
      <div class="form-row"><label>会议类型 *</label><select id="mType">${MEETING_TYPES.map(t => `<option ${m.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="form-row"><label>主持人</label><select id="mHost"><option value="">请选择</option>${USERS.map(u => `<option value="${u.id}" ${m.host_id === u.id ? 'selected' : ''}>${escapeHtml(u.name)}（${escapeHtml(u.role)}）</option>`).join('')}</select></div>
    </div>
    <div class="form-grid">
      <div class="form-row"><label>开始时间 *</label><input id="mStart" type="datetime-local" value="${(m.start_time || '').replace(' ', 'T').slice(0, 16)}" /></div>
      <div class="form-row"><label>结束时间</label><input id="mEnd" type="datetime-local" value="${(m.end_time || '').replace(' ', 'T').slice(0, 16)}" /></div>
    </div>
    <div class="form-row"><label>地点 / 线上链接</label><input id="mLoc" value="${escapeHtml(m.location)}" placeholder="会议室或会议链接" /></div>
    <div class="form-row"><label>参会人</label><div class="form-checks" id="mAttendees">${USERS.map(u => `<label><input type="checkbox" value="${u.id}" ${m.attendees.includes(u.id) ? 'checked' : ''} /> ${escapeHtml(u.name)}</label>`).join('')}</div></div>
    <div class="form-row"><label>议程 <button type="button" class="btn sm" id="copyAgenda">📋 从上次同类型会议复制议程</button></label>
      <textarea id="mAgenda" rows="5" placeholder="1. 议题一&#10;2. 议题二">${escapeHtml(m.agenda)}</textarea>
    </div>
  `, `<button class="btn" data-close="1">取消</button><button class="btn primary" id="saveMeeting">保存</button>`, 'lg');
  document.getElementById('copyAgenda').onclick = async () => {
    const type = document.getElementById('mType').value;
    const last = await api('/meetings/types/' + encodeURIComponent(type) + '/last');
    if (last && last.agenda) { document.getElementById('mAgenda').value = last.agenda; toast('已复制上次「' + type + '」的议程'); }
    else toast('未找到同类型历史会议', 'error');
  };
  document.getElementById('saveMeeting').onclick = async () => {
    const body = {
      title: mTitle.value.trim(), type: mType.value,
      start_time: mStart.value.replace('T', ' '), end_time: mEnd.value.replace('T', ' '),
      location: mLoc.value, host_id: Number(mHost.value) || null,
      agenda: mAgenda.value,
      attendee_ids: [...document.querySelectorAll('#mAttendees input:checked')].map(c => Number(c.value))
    };
    try {
      if (id) { await api('/meetings/' + id, { method: 'PUT', body }); toast('会议已更新', 'success'); }
      else { await api('/meetings', { method: 'POST', body }); toast('会议已创建', 'success'); }
      closeModal(); location.hash = '#/meetings';
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ---------- meeting detail ---------- */
async function viewMeetingDetail(id) {
  app.innerHTML = `<div id="md"><div class="empty">加载中…</div></div>`;
  const [m, minutes] = await Promise.all([api('/meetings/' + id), api('/meetings/' + id + '/minutes')]);
  const myConfirmed = minutes.confirmations.some(c => c.user_id === ME.id);
  const isPublished = !!minutes.is_published;
  document.getElementById('md').innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">${escapeHtml(m.title)}</h1><div class="row wrap">${typeBadge(m.type)} <span class="muted">${fmtDate(m.start_time)} ~ ${fmtDate(m.end_time)}（${m.duration_minutes} 分钟）</span></div></div>
      <div class="row"><button class="btn" id="editMeeting">✏️ 编辑</button><button class="btn" id="exportPdf">📄 导出PDF风格HTML</button></div>
    </div>
    <div class="detail-layout">
      <div>
        <div class="card">
          <div class="card-title">会议纪要 ${isPublished ? '<span class="badge st-已完成" style="margin-left:6px">已发布</span>' : '<span class="badge st-待开始" style="margin-left:6px">草稿</span>'}
            <span class="actions">${isPublished ? `<button class="btn sm ${myConfirmed ? '' : 'primary'}" id="confirmRead">${myConfirmed ? '✓ 已确认已读' : '确认已读'}</button>` : ''}</span>
          </div>
          <div class="md-tabs"><button data-tab="edit" class="active">编辑</button><button data-tab="preview">预览</button></div>
          <div id="mdEdit">
            <div class="md-toolbar">
              <button data-md="## ">H2</button><button data-md="### ">H3</button><button data-md="- ">列表</button><button data-md="**" wrap="1">粗体</button><button data-md="[文字](https://)" wrap="1">链接</button>
            </div>
            <textarea class="md-editor" id="mdArea">${escapeHtml(minutes.content)}</textarea>
          </div>
          <div id="mdPreview" class="md-preview" hidden>${renderMarkdown(minutes.content)}</div>
          <div class="row" style="margin-top:12px"><button class="btn" id="saveDraft">保存草稿</button>${!isPublished ? '<button class="btn primary" id="publishBtn">发布纪要</button>' : ''}</div>
        </div>
        <div class="card">
          <div class="card-title">关联行动项 <span class="actions"><button class="btn sm primary" id="addAction">+ 从纪要创建行动项</button></span></div>
          <div id="mActions"><div class="empty">加载中…</div></div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title">会议信息</div>
          <div class="kv"><span class="k">主持人</span>${m.host ? avatar(m.host) + ' ' + escapeHtml(m.host.name) : '-'}</div>
          <div class="kv"><span class="k">地点</span>${escapeHtml(m.location || '-')}</div>
          <div class="kv"><span class="k">参会人</span>${avatars(m.attendees)}</div>
          <div class="kv"><span class="k">议程</div>
          <pre style="white-space:pre-wrap;font-family:inherit;margin:4px 0 0;background:#f8fafc;padding:10px;border-radius:8px;font-size:12px">${escapeHtml(m.agenda || '（无）')}</pre>
        </div></div>
        <div class="card">
          <div class="card-title">已读确认 ${isPublished ? `<span class="muted" style="font-weight:400;font-size:12px">${minutes.confirmations.length}/${minutes.attendees.length}</span>` : ''}</div>
          <div class="confirm-list">${isPublished ? minutes.attendees.map(a => {
            const cf = minutes.confirmations.find(c => c.user_id === a.id);
            return `<div class="cf ${cf ? 'read' : 'unread'}">${avatar(a)} ${escapeHtml(a.name)} ${cf ? '<span>✓ 已读 ' + fmtDate(cf.confirmed_at) + '</span>' : '<span>未确认</span>'}</div>`;
          }).join('') : '<div class="muted" style="font-size:12px">纪要发布后参会人可确认已读</div>'}</div>
        </div>
      </div>
    </div>`;
  loadMeetingActions(id);

  let mdContent = minutes.content;
  const mdArea = document.getElementById('mdArea');
  mdArea.addEventListener('input', () => { mdContent = mdArea.value; });
  document.querySelectorAll('.md-tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.md-tabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const edit = b.dataset.tab === 'edit';
    document.getElementById('mdEdit').hidden = !edit;
    document.getElementById('mdPreview').hidden = edit;
    if (!edit) document.getElementById('mdPreview').innerHTML = renderMarkdown(mdContent);
  });
  document.querySelectorAll('.md-toolbar button').forEach(b => b.onclick = () => {
    const t = b.dataset.md; const wrap = b.dataset.wrap;
    const s = mdArea.selectionStart, e = mdArea.selectionEnd;
    const sel = mdArea.value.slice(s, e) || '文字';
    if (wrap) mdArea.value = mdArea.value.slice(0, s) + t + sel + t + mdArea.value.slice(e);
    else mdArea.value = mdArea.value.slice(0, s) + t + sel + mdArea.value.slice(e);
    mdContent = mdArea.value; mdArea.focus();
  });
  document.getElementById('saveDraft').onclick = async () => {
    await api('/meetings/' + id + '/minutes', { method: 'PUT', body: { content: mdArea.value } });
    toast('草稿已保存', 'success');
  };
  if (document.getElementById('publishBtn')) document.getElementById('publishBtn').onclick = async () => {
    await api('/meetings/' + id + '/minutes/publish', { method: 'POST', body: { content: mdArea.value, user_id: ME.id } });
    toast('纪要已发布，参会人可确认已读', 'success'); viewMeetingDetail(id);
  };
  if (document.getElementById('confirmRead')) document.getElementById('confirmRead').onclick = async () => {
    await api('/meetings/' + id + '/minutes/confirm', { method: 'POST', body: { user_id: ME.id } });
    toast('已确认已读', 'success'); viewMeetingDetail(id);
  };
  document.getElementById('exportPdf').onclick = () => {
    window.open(`http://localhost:8502/api/meetings/${id}/minutes/export`, '_blank');
  };
  document.getElementById('editMeeting').onclick = () => viewMeetingForm(id);
  document.getElementById('addAction').onclick = () => actionForm(null, id);
}

async function loadMeetingActions(meetingId) {
  const list = await api('/action-items?meeting=' + meetingId);
  document.getElementById('mActions').innerHTML = list.length ? `<table class="tbl">
    <thead><tr><th>标题</th><th>负责人</th><th>截止</th><th>优先级</th><th>进度</th><th>状态</th></tr></thead>
    <tbody>${list.map(a => `<tr onclick="location.hash='#/actions/${a.id}'">
      <td>${a.is_overdue ? '<span class="overdue-flag">●</span> ' : ''}${escapeHtml(a.title)}</td>
      <td>${a.owner ? escapeHtml(a.owner.name) : '-'}</td>
      <td>${fmtDay(a.due_date)}${a.is_overdue ? ' <span class="overdue-flag">逾期</span>' : ''}</td>
      <td>${priorityBadge(a.priority)}</td>
      <td><div class="progress ${a.is_overdue ? 'overdue' : ''} ${a.status === '已完成' ? 'done' : ''}"><span style="width:${a.progress}%"></span></div><span class="muted" style="font-size:11px">${a.progress}%</span></td>
      <td>${statusBadge(a.status)}</td>
    </tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:24px"><div class="big">📝</div>暂无行动项，可从纪要创建</div>`;
}

/* ---------- action items list ---------- */
let actionsFilters = { status: '', owner: '', priority: '', overdue: '' };
async function viewActions() {
  app.innerHTML = `<div class="page-head"><div><h1 class="page-title">行动项</h1><p class="page-desc">追踪所有行动项的进度、评论与状态</p></div></div>
    <div class="toolbar">
      <select id="aStatus"><option value="">全部状态</option>${STATUSES.map(s => `<option ${actionsFilters.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select id="aOwner"><option value="">全部负责人</option>${USERS.map(u => `<option value="${u.id}" ${String(actionsFilters.owner) === String(u.id) ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select>
      <select id="aPri"><option value="">全部优先级</option>${PRIORITIES.map(p => `<option ${actionsFilters.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <label class="form-checks" style="margin:0"><input type="checkbox" id="aOverdue" ${actionsFilters.overdue ? 'checked' : ''} /> 仅看逾期</label>
      <button class="btn primary" id="aGo">筛选</button>
    </div>
    <div class="card"><div id="aList"><div class="empty">加载中…</div></div></div>`;
  const go = async () => {
    actionsFilters = { status: aStatus.value, owner: aOwner.value, priority: aPri.value, overdue: aOverdue.checked ? '1' : '' };
    const qs = new URLSearchParams();
    if (actionsFilters.status) qs.set('status', actionsFilters.status);
    if (actionsFilters.owner) qs.set('owner', actionsFilters.owner);
    if (actionsFilters.priority) qs.set('priority', actionsFilters.priority);
    if (actionsFilters.overdue) qs.set('overdue', '1');
    const list = await api('/action-items?' + qs.toString());
    document.getElementById('aList').innerHTML = list.length ? `<table class="tbl">
      <thead><tr><th>标题</th><th>负责人</th><th>协作人</th><th>截止日期</th><th>优先级</th><th>进度</th><th>状态</th></tr></thead>
      <tbody>${list.map(a => `<tr onclick="location.hash='#/actions/${a.id}'">
        <td>${a.is_overdue ? '<span class="overdue-flag" title="逾期">●</span> ' : ''}${escapeHtml(a.title)}<div class="muted" style="font-size:11px">${a.meeting ? escapeHtml(a.meeting.title) : '未关联会议'}</div></td>
        <td>${a.owner ? escapeHtml(a.owner.name) : '-'}</td>
        <td>${avatars(a.collaborators)}</td>
        <td>${fmtDay(a.due_date)}${a.is_overdue ? ' <span class="overdue-flag">逾期</span>' : ''}</td>
        <td>${priorityBadge(a.priority)}</td>
        <td><div class="progress ${a.is_overdue ? 'overdue' : ''} ${a.status === '已完成' ? 'done' : ''}"><span style="width:${a.progress}%"></span></div><span class="muted" style="font-size:11px">${a.progress}%</span></td>
        <td>${statusBadge(a.status)}</td>
      </tr>`).join('')}</tbody></table>` : `<div class="empty"><div class="big">📭</div>暂无符合条件的行动项</div>`;
  };
  document.getElementById('aGo').onclick = go; go();
}

/* ---------- action form ---------- */
function actionForm(item, meetingId) {
  const a = item || { title: '', owner_id: ME?.id, collaborators: [], due_date: '', priority: '中', status: '待开始', progress: 0, meeting_id: meetingId || null };
  openModal(item ? '编辑行动项' : '从纪要创建行动项', `
    <div class="form-row"><label>标题 *</label><input id="aiTitle" value="${escapeHtml(a.title)}" /></div>
    <div class="form-grid">
      <div class="form-row"><label>负责人</label><select id="aiOwner"><option value="">请选择</option>${USERS.map(u => `<option value="${u.id}" ${a.owner_id === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="form-row"><label>协作人</label><select id="aiCollab" multiple style="height:90px">${USERS.map(u => `<option value="${u.id}" ${(a.collaborators || []).some(c => c.id === u.id) ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
    </div>
    <div class="form-grid">
      <div class="form-row"><label>截止日期</label><input id="aiDue" type="date" value="${a.due_date ? a.due_date.slice(0, 10) : ''}" /></div>
      <div class="form-row"><label>优先级</label><select id="aiPri">${PRIORITIES.map(p => `<option ${a.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
    </div>
    <div class="form-row"><label>关联会议</label><select id="aiMeeting"><option value="">未关联</option></select></div>
  `, `<button class="btn" data-close="1">取消</button><button class="btn primary" id="saveAi">保存</button>`);
  api('/meetings').then(ms => {
    const sel = document.getElementById('aiMeeting');
    sel.innerHTML = `<option value="">未关联</option>` + ms.map(m => `<option value="${m.id}" ${a.meeting_id === m.id ? 'selected' : ''}>${escapeHtml(m.title)}</option>`).join('');
  });
  document.getElementById('saveAi').onclick = async () => {
    const body = {
      title: aiTitle.value.trim(),
      owner_id: Number(aiOwner.value) || null,
      collaborators: [...aiCollab.selectedOptions].map(o => Number(o.value)),
      due_date: aiDue.value || null,
      priority: aiPri.value,
      meeting_id: Number(aiMeeting.value) || null
    };
    try {
      if (item) { await api('/action-items/' + item.id, { method: 'PUT', body, user_id: ME.id }); toast('行动项已更新', 'success'); }
      else { await api('/action-items', { method: 'POST', body }); toast('行动项已创建', 'success'); }
      closeModal(); if (location.hash.startsWith('#/meetings/')) loadMeetingActions(meetingId); else viewActions();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ---------- action detail ---------- */
async function viewActionDetail(id) {
  app.innerHTML = `<div id="ad"><div class="empty">加载中…</div></div>`;
  const a = await api('/action-items/' + id);
  const overdue = a.is_overdue;
  document.getElementById('ad').innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">${overdue ? '<span class="overdue-flag">●</span> ' : ''}${escapeHtml(a.title)}</h1>
        <div class="row wrap">${statusBadge(a.status)} ${priorityBadge(a.priority)} ${a.meeting ? `<a href="#/meetings/${a.meeting.id}">📎 ${escapeHtml(a.meeting.title)}</a>` : ''}</div></div>
      <div><button class="btn" id="editAi">✏️ 编辑</button></div>
    </div>
    <div class="detail-layout">
      <div>
        <div class="card">
          <div class="card-title">跟进</div>
          <div class="kv"><span class="k">负责人</span>${a.owner ? avatar(a.owner) + ' ' + escapeHtml(a.owner.name) : '-'}</div>
          <div class="kv"><span class="k">协作人</span>${avatars(a.collaborators)}</div>
          <div class="kv"><span class="k">截止日期</span>${fmtDay(a.due_date)} ${overdue ? '<span class="overdue-flag">已逾期</span>' : ''}</div>
          <div class="kv"><span class="k">优先级</span>${priorityBadge(a.priority)}</div>
          <div class="row" style="margin-top:8px">
            <span class="k muted" style="min-width:72px">进度</span>
            <div class="progress ${overdue ? 'overdue' : ''} ${a.status === '已完成' ? 'done' : ''}" style="flex:1;max-width:300px"><span style="width:${a.progress}%"></span></div>
            <span style="font-size:12px">${a.progress}%</span>
            <input type="range" min="0" max="100" value="${a.progress}" id="progRange" style="max-width:160px" />
            <button class="btn sm" id="saveProg">更新</button>
          </div>
          <div class="row" style="margin-top:12px">
            <span class="k muted" style="min-width:72px">状态</span>
            <select id="stSel" style="padding:5px 8px;border:1px solid var(--border);border-radius:8px">${STATUSES.map(s => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
            <button class="btn sm primary" id="saveSt">变更</button>
            ${a.status !== '已完成' ? '<button class="btn sm success" id="completeBtn">标记完成</button>' : ''}
          </div>
        </div>
        ${a.status === '已完成' && (a.completion_note || a.result_link) ? `<div class="card">
          <div class="card-title">完成说明</div>
          <p>${escapeHtml(a.completion_note || '（无）')}</p>
          ${a.result_link ? `<p>成果链接：<a href="${escapeHtml(a.result_link)}" target="_blank">${escapeHtml(a.result_link)}</a></p>` : ''}
        </div>` : ''}
        <div class="card">
          <div class="card-title">评论</div>
          <div class="comment-list">${a.comments.map(c => `<div class="cmt">
            <div class="cmt-head">${avatar({ name: c.name, avatar_color: c.avatar_color })}<span class="cmt-name">${escapeHtml(c.name)}</span><span class="cmt-time">${fmtDate(c.created_at)}</span></div>
            <div class="cmt-body">${escapeHtml(c.content)}</div>
          </div>`).join('') || '<div class="muted">暂无评论</div>'}</div>
          <div class="row" style="margin-top:10px"><input id="cmtInput" placeholder="发表评论…" style="flex:1" /><button class="btn primary" id="postCmt">发送</button></div>
        </div>
        <div class="card">
          <div class="card-title">延期申请</div>
          <div id="extArea"></div>
          ${['待开始','进行中','延期'].includes(a.status) ? `<div class="row" style="margin-top:10px">
            <input id="extDate" type="date" style="max-width:180px" />
            <input id="extReason" placeholder="延期原因" style="flex:1" />
            <button class="btn" id="reqExt">申请延期</button>
          </div>` : ''}
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title">时间线</div>
          <div class="timeline">${a.timeline.map(t => `<div class="tl-item ${t.event_type}">
            <div class="tl-desc">${escapeHtml(t.description)}</div>
            <div class="tl-meta">${t.name ? escapeHtml(t.name) + ' · ' : ''}${fmtDate(t.created_at)}${t.from_value && t.to_value ? '（' + escapeHtml(t.from_value) + ' → ' + escapeHtml(t.to_value) + '）' : ''}</div>
          </div>`).join('')}</div>
        </div>
      </div>
    </div>`;
  renderExtensions(a);

  document.getElementById('editAi').onclick = () => actionForm(a, a.meeting_id);
  document.getElementById('saveProg').onclick = async () => {
    await api('/action-items/' + id + '/progress', { method: 'POST', body: { progress: Number(progRange.value), user_id: ME.id } });
    toast('进度已更新', 'success'); viewActionDetail(id);
  };
  document.getElementById('saveSt').onclick = async () => {
    await api('/action-items/' + id + '/status', { method: 'POST', body: { status: stSel.value, user_id: ME.id } });
    toast('状态已变更', 'success'); viewActionDetail(id);
  };
  if (document.getElementById('completeBtn')) document.getElementById('completeBtn').onclick = () => completeForm(a);
  document.getElementById('postCmt').onclick = async () => {
    if (!cmtInput.value.trim()) return;
    await api('/action-items/' + id + '/comments', { method: 'POST', body: { user_id: ME.id, content: cmtInput.value.trim() } });
    viewActionDetail(id);
  };
  if (document.getElementById('reqExt')) document.getElementById('reqExt').onclick = async () => {
    if (!extDate.value) return toast('请选择延期日期', 'error');
    await api('/action-items/' + id + '/extension-request', { method: 'POST', body: { requester_id: ME.id, requested_due_date: extDate.value, reason: extReason.value } });
    toast('延期申请已提交', 'success'); viewActionDetail(id);
  };
}

function renderExtensions(a) {
  const area = document.getElementById('extArea');
  if (!a.extension_requests.length) { area.innerHTML = '<div class="muted" style="font-size:12px">暂无延期申请</div>'; return; }
  area.innerHTML = a.extension_requests.map(e => `<div style="padding:8px 0;border-bottom:1px solid #f1f3f7">
    <div class="row"><span class="badge st-${e.status === '已批准' ? '已完成' : e.status === '已拒绝' ? '取消' : '待开始'}">${e.status}</span>
    <span class="muted" style="font-size:12px">${fmtDay(e.current_due_date)} → <strong>${fmtDay(e.requested_due_date)}</strong></span></div>
    <div class="muted" style="font-size:12px;margin-top:4px">申请人：${escapeHtml(e.requester_name || '-')} · ${fmtDate(e.created_at)}</div>
    ${e.reason ? `<div style="font-size:12px;margin-top:4px">原因：${escapeHtml(e.reason)}</div>` : ''}
    ${e.status === '待审批' ? `<div class="row" style="margin-top:6px"><button class="btn sm primary" onclick="approveExt(${e.id})">批准</button><button class="btn sm danger" onclick="rejectExt(${e.id})">拒绝</button></div>` : ''}
  </div>`).join('');
}
async function approveExt(reqId) {
  await api('/action-items/extension-requests/' + reqId + '/approve', { method: 'POST', body: { user_id: ME.id } });
  toast('延期申请已批准', 'success'); route();
}
async function rejectExt(reqId) {
  await api('/action-items/extension-requests/' + reqId + '/reject', { method: 'POST', body: { user_id: ME.id } });
  toast('延期申请已拒绝', 'success'); route();
}

function completeForm(a) {
  openModal('标记完成', `
    <div class="form-row"><label>完成说明</label><textarea id="cmpNote" rows="4" placeholder="说明完成情况、交付内容等">${escapeHtml(a.completion_note || '')}</textarea></div>
    <div class="form-row"><label>成果链接</label><input id="cmpLink" value="${escapeHtml(a.result_link || '')}" placeholder="https://…" /></div>
  `, `<button class="btn" data-close="1">取消</button><button class="btn primary" id="doComplete">确认完成</button>`);
  document.getElementById('doComplete').onclick = async () => {
    await api('/action-items/' + a.id + '/complete', { method: 'POST', body: { completion_note: cmpNote.value, result_link: cmpLink.value, user_id: ME.id } });
    toast('行动项已完成 🎉', 'success'); closeModal(); viewActionDetail(a.id);
  };
}

/* ---------- search/archive ---------- */
async function viewSearch() {
  app.innerHTML = `<div class="page-head"><div><h1 class="page-title">检索归档</h1><p class="page-desc">按类型、参会人、关键词、时间范围搜索历史会议纪要</p></div></div>
    <div class="card">
      <div class="grid cols-4">
        <div class="form-row"><label>会议类型</label><select id="sType"><option value="">全部</option>${MEETING_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
        <div class="form-row"><label>参会人</label><select id="sAtt"><option value="">全部</option>${USERS.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}</select></div>
        <div class="form-row"><label>开始日期</label><input id="sStart" type="date" /></div>
        <div class="form-row"><label>结束日期</label><input id="sEnd" type="date" /></div>
      </div>
      <div class="form-row"><label>关键词</label><input id="sKw" placeholder="搜索标题或议程内容" /></div>
      <button class="btn primary" id="sGo">搜索</button>
    </div>
    <div class="card" style="margin-top:16px"><div id="sResult"><div class="empty">输入条件后开始搜索</div></div></div>`;
  document.getElementById('sGo').onclick = async () => {
    const qs = new URLSearchParams();
    if (sType.value) qs.set('type', sType.value);
    if (sAtt.value) qs.set('attendee', sAtt.value);
    if (sKw.value) qs.set('keyword', sKw.value);
    if (sStart.value) qs.set('start', sStart.value + ' 00:00');
    if (sEnd.value) qs.set('end', sEnd.value + ' 23:59');
    const list = await api('/meetings?' + qs.toString());
    document.getElementById('sResult').innerHTML = list.length ? `<table class="tbl">
      <thead><tr><th>标题</th><th>类型</th><th>时间</th><th>主持人</th><th>参会人</th><th>行动项</th></tr></thead>
      <tbody>${list.map(m => `<tr onclick="location.hash='#/meetings/${m.id}'">
        <td><strong>${escapeHtml(m.title)}</strong></td><td>${typeBadge(m.type)}</td>
        <td>${fmtDate(m.start_time)}</td><td>${m.host ? escapeHtml(m.host.name) : '-'}</td>
        <td>${avatars(m.attendees)}</td><td>${m.action_item_count}</td>
      </tr>`).join('')}</tbody></table>` : `<div class="empty"><div class="big">🔍</div>未找到匹配的会议纪要</div>`;
  };
}

/* ---------- people view ---------- */
async function viewPeople() {
  app.innerHTML = `<div class="page-head"><div><h1 class="page-title">人员视图</h1><p class="page-desc">查看某人的全部待办行动项与历史完成率</p></div>
    <select id="pUser" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px">${USERS.map(u => `<option value="${u.id}" ${ME.id === u.id ? 'selected' : ''}>${escapeHtml(u.name)}（${escapeHtml(u.role)}）</option>`).join('')}</select></div>
    <div id="pBody"><div class="empty">加载中…</div></div>`;
  const load = async (uid) => {
    const s = await api('/action-items/summary?owner=' + uid);
    document.getElementById('pBody').innerHTML = `
      <div class="grid cols-4">
        <div class="stat accent"><div class="label">负责行动项</div><div class="value">${s.total}</div></div>
        <div class="stat"><div class="label">待办中</div><div class="value">${s.pending}</div></div>
        <div class="stat danger"><div class="label">逾期</div><div class="value">${s.overdue}</div></div>
        <div class="stat success"><div class="label">历史完成率</div><div class="value">${s.completion_rate}%</div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-title">状态分布</div>
        <div class="grid cols-3">${STATUSES.map(st => `<div class="stat"><div class="label">${st}</div><div class="value">${s.by_status[st] || 0}</div></div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-title">待办行动项 ${s.overdue ? '<span class="overdue-flag" style="font-size:12px">含 ' + s.overdue + ' 项逾期</span>' : ''}</div>
        ${s.pending_items.length ? `<table class="tbl"><thead><tr><th>标题</th><th>截止</th><th>优先级</th><th>进度</th><th>状态</th></tr></thead>
        <tbody>${s.pending_items.map(a => `<tr onclick="location.hash='#/actions/${a.id}'">
          <td>${a.is_overdue ? '<span class="overdue-flag">●</span> ' : ''}${escapeHtml(a.title)}</td>
          <td>${fmtDay(a.due_date)}${a.is_overdue ? ' <span class="overdue-flag">逾期</span>' : ''}</td>
          <td>${priorityBadge(a.priority)}</td>
          <td><div class="progress ${a.is_overdue ? 'overdue' : ''}"><span style="width:${a.progress}%"></span></div></td>
          <td>${statusBadge(a.status)}</td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">暂无待办</div>'}
      </div>
      <div class="card">
        <div class="card-title">近期完成</div>
        ${s.recent_completed.length ? `<table class="tbl"><thead><tr><th>标题</th><th>截止</th><th>完成说明</th></tr></thead>
        <tbody>${s.recent_completed.map(a => `<tr onclick="location.hash='#/actions/${a.id}'">
          <td>${escapeHtml(a.title)}</td><td>${fmtDay(a.due_date)}</td>
          <td>${escapeHtml(a.completion_note || '-')}</td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">暂无完成记录</div>'}
      </div>`;
  };
  document.getElementById('pUser').onchange = e => load(e.target.value);
  load(document.getElementById('pUser').value);
}

/* ---------- notifications ---------- */
async function loadNotif() {
  if (!ME) return;
  const list = await api('/users/' + ME.id + '/notifications');
  const dot = document.getElementById('notifDot');
  const unread = list.filter(n => !n.read_at);
  dot.hidden = !unread.length;
  dot.textContent = unread.length || '';
  const panel = document.getElementById('notifPanel');
  panel.innerHTML = list.length ? list.map(n => `<div class="nf-item">
    <div class="nf-title">${n.read_at ? '' : '🔴 '}${escapeHtml(n.title)}</div>
    <div class="nf-time">${fmtDate(n.created_at)}</div>
  </div>`).join('') : '<div class="nf-empty">暂无通知</div>';
}

document.getElementById('notifBtn').onclick = async () => {
  const panel = document.getElementById('notifPanel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    await loadNotif();
    const me = ME.id;
    const list = await api('/users/' + me + '/notifications');
    list.filter(n => !n.read_at).forEach(n => api('/users/notifications/' + n.id + '/read', { method: 'POST', body: { user_id: me } }));
    setTimeout(() => { document.getElementById('notifDot').hidden = true; }, 1500);
  }
};

/* ---------- init ---------- */
async function init() {
  USERS = await api('/users');
  const sel = document.getElementById('meSelect');
  sel.innerHTML = USERS.map(u => `<option value="${u.id}">${escapeHtml(u.name)} · ${escapeHtml(u.role)}</option>`).join('');
  const saved = localStorage.getItem('meId');
  ME = USERS.find(u => String(u.id) === saved) || USERS[0];
  sel.value = ME.id;
  sel.onchange = e => { ME = USERS.find(u => String(u.id) === e.target.value); localStorage.setItem('meId', ME.id); loadNotif(); route(); };
  window.addEventListener('hashchange', route);
  loadNotif();
  setInterval(loadNotif, 60000);
  route();
}
init();
