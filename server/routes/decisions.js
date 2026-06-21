const express = require('express');
const { db, DECISION_STATUSES, PRIORITIES, MEETING_TYPES } = require('../db');
const { enrichDecision, addDecisionStatusLog, getUser, enrichActionItem } = require('../helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const { status, priority, decision_maker, meeting_type, keyword, start, end, meeting } = req.query;
  let sql = `SELECT d.* FROM decisions d WHERE 1=1`;
  const params = [];

  if (status) { sql += ` AND d.status=?`; params.push(status); }
  if (priority) { sql += ` AND d.priority=?`; params.push(priority); }
  if (decision_maker) { sql += ` AND d.decision_maker_id=?`; params.push(decision_maker); }
  if (meeting) { sql += ` AND d.meeting_id=?`; params.push(meeting); }
  if (keyword) {
    sql += ` AND (d.title LIKE ? OR d.content LIKE ? OR d.background LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (start) { sql += ` AND d.created_at >= ?`; params.push(start); }
  if (end) { sql += ` AND d.created_at <= ?`; params.push(end); }
  if (meeting_type) {
    sql += ` AND EXISTS (SELECT 1 FROM meetings m WHERE m.id=d.meeting_id AND m.type=?)`;
    params.push(meeting_type);
  }

  sql += ` ORDER BY d.updated_at DESC`;
  const decisions = db.prepare(sql).all(...params).map(enrichDecision);
  res.json(decisions);
});

router.get('/stats', (req, res) => {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const all = db.prepare(`SELECT * FROM decisions`).all().map(enrichDecision);
  const monthlyNew = all.filter(d => d.created_at.startsWith(ym));
  const inProgress = all.filter(d => d.status === '执行中');
  const completed = all.filter(d => d.status === '已完成');
  const abandoned = all.filter(d => d.status === '已废弃');
  const valid = all.filter(d => d.status !== '已废弃');
  const overdue = all.filter(d => d.is_overdue);

  const completionRate = valid.length ? Math.round((completed.length / valid.length) * 100) : 0;

  const byStatus = DECISION_STATUSES.reduce((acc, s) => {
    acc[s] = all.filter(d => d.status === s).length;
    return acc;
  }, {});

  const byPriority = PRIORITIES.reduce((acc, p) => {
    acc[p] = all.filter(d => d.priority === p).length;
    return acc;
  }, {});

  const byMeetingType = MEETING_TYPES.reduce((acc, t) => {
    acc[t] = all.filter(d => d.meeting && d.meeting.type === t).length;
    return acc;
  }, {});

  res.json({
    total: all.length,
    monthly_new: monthlyNew.length,
    in_progress: inProgress.length,
    completed: completed.length,
    abandoned: abandoned.length,
    overdue: overdue.length,
    completion_rate: completionRate,
    by_status: byStatus,
    by_priority: byPriority,
    by_meeting_type: byMeetingType
  });
});

router.get('/:id', (req, res) => {
  const d = db.prepare(`SELECT * FROM decisions WHERE id=?`).get(req.params.id);
  if (!d) return res.status(404).json({ error: '决议不存在' });
  enrichDecision(d);

  d.status_logs = db.prepare(`
    SELECT l.*, u.name, u.avatar_color FROM decision_status_logs l
    LEFT JOIN users u ON u.id=l.operator_id
    WHERE l.decision_id=? ORDER BY l.created_at
  `).all(d.id);

  d.comments = db.prepare(`
    SELECT c.*, u.name, u.avatar_color FROM decision_comments c
    JOIN users u ON u.id=c.user_id
    WHERE c.decision_id=? ORDER BY c.created_at
  `).all(d.id);

  res.json(d);
});

router.post('/', (req, res) => {
  const {
    title, background, content, decision_maker_id, impact_scope,
    priority, effective_date, meeting_id, minutes_id, status, risk
  } = req.body;

  if (!title) return res.status(400).json({ error: '标题为必填项' });

  const r = db.prepare(`
    INSERT INTO decisions (title,background,content,decision_maker_id,impact_scope,priority,effective_date,meeting_id,minutes_id,status,risk)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    title, background || '', content || '', decision_maker_id || null,
    impact_scope || '', priority || '中', effective_date || null,
    meeting_id || null, minutes_id || null, status || '草稿', risk || ''
  );

  const id = r.lastInsertRowid;
  addDecisionStatusLog(id, null, status || '草稿', decision_maker_id || null, '决议创建');
  res.status(201).json({ id });
});

router.put('/:id', (req, res) => {
  const d = db.prepare(`SELECT * FROM decisions WHERE id=?`).get(req.params.id);
  if (!d) return res.status(404).json({ error: '决议不存在' });

  const {
    title, background, content, decision_maker_id, impact_scope,
    priority, effective_date, meeting_id, minutes_id, risk
  } = req.body;

  db.prepare(`
    UPDATE decisions SET
      title=?, background=?, content=?, decision_maker_id=?,
      impact_scope=?, priority=?, effective_date=?, meeting_id=?,
      minutes_id=?, risk=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    title ?? d.title, background ?? d.background, content ?? d.content,
    decision_maker_id ?? d.decision_maker_id, impact_scope ?? d.impact_scope,
    priority ?? d.priority, effective_date ?? d.effective_date,
    meeting_id ?? d.meeting_id, minutes_id ?? d.minutes_id,
    risk ?? d.risk, d.id
  );

  res.json({ id: d.id });
});

router.delete('/:id', (req, res) => {
  const d = db.prepare(`SELECT * FROM decisions WHERE id=?`).get(req.params.id);
  if (!d) return res.status(404).json({ error: '决议不存在' });
  db.prepare(`DELETE FROM decisions WHERE id=?`).run(d.id);
  res.json({ ok: true });
});

router.post('/:id/status', (req, res) => {
  const d = db.prepare(`SELECT * FROM decisions WHERE id=?`).get(req.params.id);
  if (!d) return res.status(404).json({ error: '决议不存在' });

  const { status, user_id, remark } = req.body;
  if (!DECISION_STATUSES.includes(status)) return res.status(400).json({ error: '无效状态' });
  if (status === d.status) return res.json({ id: d.id, unchanged: true });

  db.prepare(`UPDATE decisions SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, d.id);
  addDecisionStatusLog(d.id, d.status, status, user_id || null, remark || '');
  res.json({ id: d.id, status });
});

router.get('/:id/comments', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.name, u.avatar_color FROM decision_comments c
    JOIN users u ON u.id=c.user_id
    WHERE c.decision_id=? ORDER BY c.created_at
  `).all(req.params.id);
  res.json(rows);
});

router.post('/:id/comments', (req, res) => {
  const { user_id, content } = req.body;
  if (!content) return res.status(400).json({ error: '评论内容不能为空' });
  const r = db.prepare(`INSERT INTO decision_comments (decision_id,user_id,content) VALUES (?,?,?)`)
    .run(req.params.id, user_id || null, content);
  db.prepare(`UPDATE decisions SET updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.get('/:id/action-items', (req, res) => {
  const items = db.prepare(`
    SELECT ai.* FROM action_items ai
    JOIN decision_action_items dai ON dai.action_item_id = ai.id
    WHERE dai.decision_id = ?
    ORDER BY ai.created_at DESC
  `).all(req.params.id).map(enrichActionItem);
  res.json(items);
});

router.post('/:id/action-items/:actionItemId', (req, res) => {
  const d = db.prepare(`SELECT * FROM decisions WHERE id=?`).get(req.params.id);
  if (!d) return res.status(404).json({ error: '决议不存在' });
  const ai = db.prepare(`SELECT * FROM action_items WHERE id=?`).get(req.params.actionItemId);
  if (!ai) return res.status(404).json({ error: '行动项不存在' });

  const exists = db.prepare(`SELECT 1 FROM decision_action_items WHERE decision_id=? AND action_item_id=?`)
    .get(d.id, ai.id);
  if (exists) return res.json({ id: d.id, unchanged: true });

  db.prepare(`INSERT OR IGNORE INTO decision_action_items (decision_id,action_item_id) VALUES (?,?)`)
    .run(d.id, ai.id);
  db.prepare(`UPDATE decisions SET updated_at=datetime('now') WHERE id=?`).run(d.id);
  res.status(201).json({ id: d.id });
});

router.delete('/:id/action-items/:actionItemId', (req, res) => {
  db.prepare(`DELETE FROM decision_action_items WHERE decision_id=? AND action_item_id=?`)
    .run(req.params.id, req.params.actionItemId);
  db.prepare(`UPDATE decisions SET updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/action-items/batch-create', (req, res) => {
  const d = db.prepare(`SELECT * FROM decisions WHERE id=?`).get(req.params.id);
  if (!d) return res.status(404).json({ error: '决议不存在' });

  const { items, user_id } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '行动项列表不能为空' });
  }

  const createdIds = [];
  const insItem = db.prepare(`INSERT INTO action_items (meeting_id,title,owner_id,collaborators,due_date,priority,status,progress) VALUES (?,?,?,?,?,?,?,?)`);
  const insLink = db.prepare(`INSERT OR IGNORE INTO decision_action_items (decision_id,action_item_id) VALUES (?,?)`);

  const tx = db.transaction(() => {
    items.forEach(it => {
      const r = insItem.run(
        d.meeting_id || null, it.title || '', it.owner_id || null,
        JSON.stringify(it.collaborators || []), it.due_date || null,
        it.priority || d.priority || '中', it.status || '待开始', 0
      );
      insLink.run(d.id, r.lastInsertRowid);
      createdIds.push(r.lastInsertRowid);
    });
    db.prepare(`UPDATE decisions SET updated_at=datetime('now') WHERE id=?`).run(d.id);
  });
  tx();

  res.status(201).json({ created: createdIds.length, ids: createdIds });
});

module.exports = router;
