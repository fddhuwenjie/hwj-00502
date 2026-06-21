const express = require('express');
const { db } = require('../db');
const { getUser, enrichMeeting } = require('../helpers');

const router = express.Router({ mergeParams: true });

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderMarkdown(md) {
  if (!md) return '';
  const lines = escapeHtml(md).split(/\r?\n/);
  let html = '';
  let inList = false;
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
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${m[1]}</li>`;
      return;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      html += `<p>${m[1]}</p>`;
      return;
    }
    closeList();
    html += `<p>${line}</p>`;
  });
  closeList();
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
}

router.get('/', (req, res) => {
  const meetingId = req.params.meetingId;
  const m = db.prepare(`SELECT * FROM meetings WHERE id=?`).get(meetingId);
  if (!m) return res.status(404).json({ error: '会议不存在' });
  let minutes = db.prepare(`SELECT * FROM minutes WHERE meeting_id=? ORDER BY id DESC LIMIT 1`).get(meetingId);
  if (!minutes) {
    const r = db.prepare(`INSERT INTO minutes (meeting_id,content) VALUES (?,?)`).run(meetingId, '');
    minutes = db.prepare(`SELECT * FROM minutes WHERE id=?`).get(r.lastInsertRowid);
  }
  minutes.is_published = !!minutes.published_at;
  minutes.published_by_user = minutes.published_by ? getUser(minutes.published_by) : null;
  minutes.confirmations = db.prepare(`
    SELECT rc.*, u.name, u.avatar_color FROM read_confirmations rc
    JOIN users u ON u.id = rc.user_id WHERE rc.minutes_id=? ORDER BY rc.confirmed_at`).all(minutes.id);
  minutes.attendees = db.prepare(`
    SELECT u.id,u.name,u.avatar_color FROM meeting_attendees ma JOIN users u ON u.id=ma.user_id WHERE ma.meeting_id=?`).all(meetingId);
  res.json(minutes);
});

router.put('/', (req, res) => {
  const meetingId = req.params.meetingId;
  let minutes = db.prepare(`SELECT * FROM minutes WHERE meeting_id=? ORDER BY id DESC LIMIT 1`).get(meetingId);
  if (!minutes) {
    const r = db.prepare(`INSERT INTO minutes (meeting_id,content) VALUES (?,?)`).run(meetingId, req.body.content || '');
    minutes = db.prepare(`SELECT * FROM minutes WHERE id=?`).get(r.lastInsertRowid);
  } else {
    db.prepare(`UPDATE minutes SET content=?, updated_at=datetime('now') WHERE id=?`).run(req.body.content || '', minutes.id);
  }
  res.json({ id: minutes.id });
});

router.post('/publish', (req, res) => {
  const meetingId = req.params.meetingId;
  let minutes = db.prepare(`SELECT * FROM minutes WHERE meeting_id=? ORDER BY id DESC LIMIT 1`).get(meetingId);
  if (!minutes) {
    const r = db.prepare(`INSERT INTO minutes (meeting_id,content) VALUES (?,?)`).run(meetingId, req.body.content || '');
    minutes = db.prepare(`SELECT * FROM minutes WHERE id=?`).get(r.lastInsertRowid);
  } else {
    db.prepare(`UPDATE minutes SET content=?, updated_at=datetime('now') WHERE id=?`).run(req.body.content || '', minutes.id);
  }
  if (!minutes.published_at) {
    db.prepare(`UPDATE minutes SET published_at=datetime('now'), published_by=? WHERE id=?`).run(req.body.user_id || null, minutes.id);
    db.prepare(`UPDATE meetings SET status='已发布' WHERE id=?`).run(meetingId);
  }
  res.json({ id: minutes.id, published: true });
});

router.post('/confirm', (req, res) => {
  const meetingId = req.params.meetingId;
  const minutes = db.prepare(`SELECT * FROM minutes WHERE meeting_id=? ORDER BY id DESC LIMIT 1`).get(meetingId);
  if (!minutes) return res.status(404).json({ error: '纪要不存在' });
  if (!minutes.published_at) return res.status(400).json({ error: '纪要尚未发布' });
  const userId = req.body.user_id;
  if (!userId) return res.status(400).json({ error: '缺少用户' });
  db.prepare(`INSERT OR IGNORE INTO read_confirmations (minutes_id,user_id) VALUES (?,?)`).run(minutes.id, userId);
  res.json({ ok: true });
});

router.get('/export', (req, res) => {
  const meetingId = req.params.meetingId;
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id=?`).get(meetingId);
  if (!meeting) return res.status(404).json({ error: '会议不存在' });
  const minutes = db.prepare(`SELECT * FROM minutes WHERE meeting_id=? ORDER BY id DESC LIMIT 1`).get(meetingId);
  const host = meeting.host_id ? getUser(meeting.host_id) : null;
  const attendees = db.prepare(`
    SELECT u.name FROM meeting_attendees ma JOIN users u ON u.id=ma.user_id WHERE ma.meeting_id=? ORDER BY u.id`).all(meetingId).map(a => a.name);
  const confirmations = db.prepare(`
    SELECT u.name FROM read_confirmations rc JOIN users u ON u.id=rc.user_id WHERE rc.minutes_id=?`).all((minutes && minutes.id) || -1).map(c => c.name);
  const contentHtml = renderMarkdown(minutes ? minutes.content : '');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meeting.title)}.html"`);
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(meeting.title)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: "PingFang SC", "Microsoft YaHei", Arial, sans-serif; color: #1f2937; line-height: 1.7; }
    .doc { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 24px; border-bottom: 3px solid #4f6df5; padding-bottom: 8px; }
    h2 { font-size: 18px; color: #4f6df5; margin-top: 22px; border-left: 4px solid #4f6df5; padding-left: 8px; }
    h3 { font-size: 15px; }
    .meta { background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:12px 16px; margin:14px 0; font-size:13px; }
    .meta table { width:100%; border-collapse:collapse; }
    .meta td { padding:4px 8px; }
    .meta td.k { color:#6b7280; width:90px; }
    .tag { display:inline-block; background:#eef2ff; color:#4f6df5; border-radius:4px; padding:2px 8px; font-size:12px; }
    .badge { color:#0ca678; font-weight:600; }
    .footer { margin-top:30px; border-top:1px dashed #d1d5db; padding-top:10px; font-size:12px; color:#9ca3af; }
    a { color:#4f6df5; }
    ul { padding-left: 22px; }
    code { background:#f3f4f6; padding:1px 4px; border-radius:3px; }
  </style></head><body><div class="doc">
    <h1>${escapeHtml(meeting.title)}</h1>
    <div class="meta"><table>
      <tr><td class="k">会议类型</td><td><span class="tag">${escapeHtml(meeting.type)}</span></td></tr>
      <tr><td class="k">时间</td><td>${escapeHtml(meeting.start_time)} ~ ${escapeHtml(meeting.end_time)}</td></tr>
      <tr><td class="k">地点/链接</td><td>${escapeHtml(meeting.location || '-')}</td></tr>
      <tr><td class="k">主持人</td><td>${escapeHtml(host ? host.name : '-')}</td></tr>
      <tr><td class="k">参会人</td><td>${attendees.map(escapeHtml).join('、') || '-'}</td></tr>
      <tr><td class="k">已确认</td><td><span class="badge">${confirmations.length}</span> / ${attendees.length} ${confirmations.length ? '（' + confirmations.map(escapeHtml).join('、') + '）' : ''}</td></tr>
    </table></div>
    ${contentHtml || '<p style="color:#9ca3af">（暂无纪要内容）</p>'}
    <div class="footer">本文件由会议纪要系统导出 · ${new Date().toLocaleString('zh-CN')}</div>
  </div></body></html>`;
  res.send(html);
});

module.exports = router;
module.exports.renderMarkdown = renderMarkdown;
