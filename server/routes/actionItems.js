const express = require('express');
const { db, STATUSES } = require('../db');
const { enrichActionItem, getUser, addTimeline, ensureOverdueNotifications } = require('../helpers');

const router = express.Router();

router.use((req, res, next) => { ensureOverdueNotifications(); next(); });

router.get('/', (req, res) => {
  const { owner, status, meeting, overdue, priority, keyword } = req.query;
  let sql = `SELECT * FROM action_items WHERE 1=1`;
  const params = [];
  if (owner) { sql += ` AND owner_id=?`; params.push(owner); }
  if (status) { sql += ` AND status=?`; params.push(status); }
  if (priority) { sql += ` AND priority=?`; params.push(priority); }
  if (meeting) { sql += ` AND meeting_id=?`; params.push(meeting); }
  if (keyword) { sql += ` AND title LIKE ?`; params.push(`%${keyword}%`); }
  sql += ` ORDER BY created_at DESC`;
  let items = db.prepare(sql).all(...params).map(enrichActionItem);
  if (overdue === '1' || overdue === 'true') {
    items = items.filter(i => i.is_overdue);
  }
  res.json(items);
});

router.get('/summary', (req, res) => {
  const { owner } = req.query;
  if (!owner) return res.status(400).json({ error: '缺少 owner 参数' });
  const all = db.prepare(`SELECT * FROM action_items WHERE owner_id=?`).all(owner).map(enrichActionItem);
  const pending = all.filter(i => ['待开始', '进行中', '延期'].includes(i.status));
  const completed = all.filter(i => i.status === '已完成');
  const cancelled = all.filter(i => i.status === '取消');
  const valid = all.length - cancelled.length;
  const completionRate = valid > 0 ? Math.round((completed.length / valid) * 100) : 0;
  const overdueCount = all.filter(i => i.is_overdue).length;
  res.json({
    owner: getUser(owner),
    total: all.length,
    pending: pending.length,
    completed: completed.length,
    overdue: overdueCount,
    completion_rate: completionRate,
    by_status: STATUSES.reduce((acc, s) => { acc[s] = all.filter(i => i.status === s).length; return acc; }, {}),
    pending_items: pending,
    recent_completed: completed.slice(0, 5)
  });
});

router.get('/:id', (req, res) => {
  const item = db.prepare(`SELECT * FROM action_items WHERE id=?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: '行动项不存在' });
  enrichActionItem(item);
  item.comments = db.prepare(`
    SELECT c.*, u.name, u.avatar_color FROM action_item_comments c
    JOIN users u ON u.id=c.user_id WHERE c.action_item_id=? ORDER BY c.created_at`).all(item.id);
  item.timeline = db.prepare(`
    SELECT t.*, u.name FROM action_item_timeline t
    LEFT JOIN users u ON u.id=t.user_id WHERE t.action_item_id=? ORDER BY t.created_at`).all(item.id);
  item.extension_requests = db.prepare(`
    SELECT e.*, u.name AS requester_name, a.name AS approver_name FROM extension_requests e
    LEFT JOIN users u ON u.id=e.requester_id
    LEFT JOIN users a ON a.id=e.approver_id
    WHERE e.action_item_id=? ORDER BY e.created_at DESC`).all(item.id);
  res.json(item);
});

router.post('/', (req, res) => {
  const { meeting_id, title, owner_id, collaborators, due_date, priority, status, progress } = req.body;
  if (!title) return res.status(400).json({ error: '标题为必填项' });
  const r = db.prepare(`INSERT INTO action_items (meeting_id,title,owner_id,collaborators,due_date,priority,status,progress) VALUES (?,?,?,?,?,?,?,?)`)
    .run(meeting_id || null, title, owner_id || null, JSON.stringify(collaborators || []), due_date || null, priority || '中', status || '待开始', progress || 0);
  const id = r.lastInsertRowid;
  addTimeline(id, 'create', '行动项创建', null, status || '待开始', owner_id || null);
  res.status(201).json({ id });
});

router.put('/:id', (req, res) => {
  const item = db.prepare(`SELECT * FROM action_items WHERE id=?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: '行动项不存在' });
  const { title, owner_id, collaborators, due_date, priority, meeting_id } = req.body;
  const before = { ...item };
  db.prepare(`UPDATE action_items SET title=?,owner_id=?,collaborators=?,due_date=?,priority=?,meeting_id=?,updated_at=datetime('now') WHERE id=?`)
    .run(title ?? item.title, owner_id ?? item.owner_id, JSON.stringify(collaborators || JSON.parse(item.collaborators || '[]')), due_date ?? item.due_date, priority ?? item.priority, meeting_id ?? item.meeting_id, item.id);
  if (due_date && due_date !== before.due_date) {
    addTimeline(item.id, 'due_date', `截止日期变更为 ${due_date}`, before.due_date, due_date, req.body.user_id || null);
  }
  if (owner_id && owner_id !== before.owner_id) {
    addTimeline(item.id, 'owner', '负责人变更', before.owner_id ? getUser(before.owner_id).name : '-', getUser(owner_id) ? getUser(owner_id).name : '-', req.body.user_id || null);
  }
  res.json({ id: item.id });
});

router.post('/:id/status', (req, res) => {
  const item = db.prepare(`SELECT * FROM action_items WHERE id=?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: '行动项不存在' });
  const { status, user_id } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: '无效状态' });
  if (status === item.status) return res.json({ id: item.id, unchanged: true });
  db.prepare(`UPDATE action_items SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, item.id);
  addTimeline(item.id, 'status', `状态变更为 ${status}`, item.status, status, user_id || null);
  res.json({ id: item.id, status });
});

router.post('/:id/progress', (req, res) => {
  const item = db.prepare(`SELECT * FROM action_items WHERE id=?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: '行动项不存在' });
  const progress = Math.max(0, Math.min(100, Number(req.body.progress) || 0));
  const before = item.progress;
  db.prepare(`UPDATE action_items SET progress=?, updated_at=datetime('now') WHERE id=?`).run(progress, item.id);
  if (progress !== before) {
    const status = progress >= 100 ? '已完成' : (progress > 0 && item.status === '待开始' ? '进行中' : item.status);
    if (status !== item.status) {
      db.prepare(`UPDATE action_items SET status=? WHERE id=?`).run(status, item.id);
      addTimeline(item.id, 'status', `进度达到 ${progress}%，状态自动变更为 ${status}`, item.status, status, req.body.user_id || null);
    }
    addTimeline(item.id, 'progress', `进度更新为 ${progress}%`, String(before), String(progress), req.body.user_id || null);
  }
  res.json({ id: item.id, progress, status });
});

router.post('/:id/complete', (req, res) => {
  const item = db.prepare(`SELECT * FROM action_items WHERE id=?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: '行动项不存在' });
  const { completion_note, result_link, user_id } = req.body;
  db.prepare(`UPDATE action_items SET status='已完成', progress=100, completion_note=?, result_link=?, updated_at=datetime('now') WHERE id=?`)
    .run(completion_note || '', result_link || '', item.id);
  addTimeline(item.id, 'status', '状态变更为 已完成', item.status, '已完成', user_id || null);
  addTimeline(item.id, 'complete', '完成说明已填写', null, completion_note || '', user_id || null);
  res.json({ id: item.id, status: '已完成' });
});

router.get('/:id/comments', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.name, u.avatar_color FROM action_item_comments c
    JOIN users u ON u.id=c.user_id WHERE c.action_item_id=? ORDER BY c.created_at`).all(req.params.id);
  res.json(rows);
});

router.post('/:id/comments', (req, res) => {
  const { user_id, content } = req.body;
  if (!content) return res.status(400).json({ error: '评论内容不能为空' });
  const r = db.prepare(`INSERT INTO action_item_comments (action_item_id,user_id,content) VALUES (?,?,?)`).run(req.params.id, user_id || null, content);
  addTimeline(req.params.id, 'comment', '新增评论', null, content.slice(0, 30), user_id || null);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.get('/:id/timeline', (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, u.name FROM action_item_timeline t
    LEFT JOIN users u ON u.id=t.user_id WHERE t.action_item_id=? ORDER BY t.created_at`).all(req.params.id);
  res.json(rows);
});

router.post('/:id/extension-request', (req, res) => {
  const item = db.prepare(`SELECT * FROM action_items WHERE id=?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: '行动项不存在' });
  const { requester_id, requested_due_date, reason } = req.body;
  if (!requested_due_date) return res.status(400).json({ error: '请填写申请的延期日期' });
  const r = db.prepare(`INSERT INTO extension_requests (action_item_id,requester_id,current_due_date,requested_due_date,reason,status) VALUES (?,?,?,?,?, '待审批')`)
    .run(item.id, requester_id || item.owner_id, item.due_date, requested_due_date, reason || '');
  addTimeline(item.id, 'extension_request', `申请延期至 ${requested_due_date}`, item.due_date, requested_due_date, requester_id || null);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.post('/extension-requests/:reqId/approve', (req, res) => {
  const ext = db.prepare(`SELECT * FROM extension_requests WHERE id=?`).get(req.params.reqId);
  if (!ext) return res.status(404).json({ error: '延期申请不存在' });
  db.prepare(`UPDATE extension_requests SET status='已批准', approver_id=?, decided_at=datetime('now') WHERE id=?`).run(req.body.user_id || null, ext.id);
  const item = db.prepare(`SELECT * FROM action_items WHERE id=?`).get(ext.action_item_id);
  const before = item.due_date;
  db.prepare(`UPDATE action_items SET due_date=?, status=?, overdue_notified=0, updated_at=datetime('now') WHERE id=?`)
    .run(ext.requested_due_date, item.status === '已完成' ? '已完成' : '进行中', item.id);
  addTimeline(item.id, 'extension_approve', `延期申请已批准，截止日期更新为 ${ext.requested_due_date}`, before, ext.requested_due_date, req.body.user_id || null);
  res.json({ ok: true, new_due_date: ext.requested_due_date });
});

router.post('/extension-requests/:reqId/reject', (req, res) => {
  const ext = db.prepare(`SELECT * FROM extension_requests WHERE id=?`).get(req.params.reqId);
  if (!ext) return res.status(404).json({ error: '延期申请不存在' });
  db.prepare(`UPDATE extension_requests SET status='已拒绝', approver_id=?, decided_at=datetime('now') WHERE id=?`).run(req.body.user_id || null, ext.id);
  addTimeline(ext.action_item_id, 'extension_reject', '延期申请已拒绝', ext.current_due_date, ext.current_due_date, req.body.user_id || null);
  res.json({ ok: true });
});

module.exports = router;
