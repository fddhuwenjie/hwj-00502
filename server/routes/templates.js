const express = require('express');
const { db, RECURRENCE_FREQUENCIES } = require('../db');
const {
  enrichTemplate,
  parseJsonArray,
  generateRecurringDates,
  createMeetingFromTemplate,
  touchTemplate
} = require('../helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const { type, keyword } = req.query;
  let sql = `SELECT * FROM meeting_templates WHERE 1=1`;
  const params = [];
  if (type) { sql += ` AND type=?`; params.push(type); }
  if (keyword) { sql += ` AND (name LIKE ? OR agenda LIKE ? OR minutes_template LIKE ?)`; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  sql += ` ORDER BY last_used_at DESC NULLS LAST, id DESC`;
  const list = db.prepare(sql).all(...params).map(t => {
    enrichTemplate(t);
    t.default_action_items = t.default_action_items.length;
    return t;
  });
  res.json(list);
});

router.get('/meta', (req, res) => {
  res.json({ frequencies: RECURRENCE_FREQUENCIES });
});

router.get('/:id', (req, res) => {
  const t = db.prepare(`SELECT * FROM meeting_templates WHERE id=?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: '模板不存在' });
  enrichTemplate(t);
  res.json(t);
});

function writeTemplate(id, body) {
  const { name, type, host_id, location, agenda, minutes_template, default_action_items, duration_minutes, attendee_ids } = body;
  const itemsJson = JSON.stringify((Array.isArray(default_action_items) ? default_action_items : []).filter(i => i && i.title));
  if (id) {
    db.prepare(`UPDATE meeting_templates SET name=?,type=?,host_id=?,location=?,agenda=?,minutes_template=?,default_action_items=?,duration_minutes=?,updated_at=datetime('now') WHERE id=?`)
      .run(name, type, host_id || null, location || '', agenda || '', minutes_template || '', itemsJson, Number(duration_minutes) || 60, id);
  } else {
    const r = db.prepare(`INSERT INTO meeting_templates (name,type,host_id,location,agenda,minutes_template,default_action_items,duration_minutes) VALUES (?,?,?,?,?,?,?,?)`)
      .run(name, type, host_id || null, location || '', agenda || '', minutes_template || '', itemsJson, Number(duration_minutes) || 60);
    id = Number(r.lastInsertRowid);
  }
  db.prepare(`DELETE FROM meeting_template_attendees WHERE template_id=?`).run(id);
  const ids = Array.isArray(attendee_ids) ? attendee_ids : [];
  const ins = db.prepare(`INSERT OR IGNORE INTO meeting_template_attendees (template_id,user_id) VALUES (?,?)`);
  [...new Set([...ids, ...(host_id ? [host_id] : [])])].forEach(uid => ins.run(id, Number(uid)));
  return id;
}

router.post('/', (req, res) => {
  if (!req.body.name || !req.body.type) return res.status(400).json({ error: '模板名称与会议类型为必填项' });
  const id = writeTemplate(null, req.body);
  res.status(201).json({ id });
});

router.put('/:id', (req, res) => {
  const t = db.prepare(`SELECT * FROM meeting_templates WHERE id=?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: '模板不存在' });
  writeTemplate(Number(req.params.id), { ...t, ...req.body, default_action_items: req.body.default_action_items !== undefined ? req.body.default_action_items : parseJsonArray(t.default_action_items) });
  res.json({ id: Number(req.params.id) });
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM meeting_templates WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/generate-meeting', (req, res) => {
  const t = db.prepare(`SELECT * FROM meeting_templates WHERE id=?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: '模板不存在' });
  const startTime = req.body.start_time;
  if (!startTime) return res.status(400).json({ error: '开始时间为必填项' });
  const meetingId = createMeetingFromTemplate(Number(req.params.id), startTime, null, { title: req.body.title });
  res.status(201).json({ id: meetingId });
});

router.post('/:id/minutes-draft', (req, res) => {
  const t = db.prepare(`SELECT * FROM meeting_templates WHERE id=?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: '模板不存在' });
  const { renderMinutesTemplate } = require('../helpers');
  const content = renderMinutesTemplate(t, { title: req.body.title || '', start_time: req.body.date ? req.body.date + ' 00:00' : '' });
  res.json({ content });
});

router.post('/:id/default-action-items', (req, res) => {
  const t = db.prepare(`SELECT * FROM meeting_templates WHERE id=?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: '模板不存在' });
  const meetingId = Number(req.body.meeting_id);
  if (!meetingId) return res.status(400).json({ error: '缺少会议 ID' });
  const items = parseJsonArray(t.default_action_items);
  const insItem = db.prepare(`INSERT INTO action_items (meeting_id,title,owner_id,due_date,priority,status,progress) VALUES (?,?,?,?,?,?,?)`);
  items.forEach(it => {
    insItem.run(meetingId, it.title || '', it.owner_id || null, it.due_date || null, it.priority || '中', it.status || '待开始', it.progress || 0);
  });
  touchTemplate(t.id);
  res.status(201).json({ created: items.length });
});

router.post('/:id/recurring/generate', (req, res) => {
  const t = db.prepare(`SELECT * FROM meeting_templates WHERE id=?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: '模板不存在' });
  const { frequency, day_of_week, day_of_month, time, count, start_date, name } = req.body;
  if (!RECURRENCE_FREQUENCIES.includes(frequency)) return res.status(400).json({ error: '无效的周期类型' });
  if (!time) return res.status(400).json({ error: '时间为必填项' });
  const rule = { frequency, day_of_week: day_of_week != null ? Number(day_of_week) : null, day_of_month: day_of_month != null ? Number(day_of_month) : null, time, count: Number(count) || 4, start_date: start_date || null };
  const dates = generateRecurringDates(rule);
  if (!dates.length) return res.status(400).json({ error: '无法生成会议日期' });

  const ruleRes = db.prepare(`INSERT INTO recurring_rules (name,template_id,frequency,day_of_week,day_of_month,time,count,start_date,last_generated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(name || `${t.name}周期规则`, t.id, frequency, rule.day_of_week, rule.day_of_month, time, dates.length, rule.start_date);
  const ruleId = Number(ruleRes.lastInsertRowid);

  const meetingIds = dates.map(d => Number(createMeetingFromTemplate(t.id, d, ruleId, {})));
  touchTemplate(t.id);
  res.status(201).json({ rule_id: ruleId, meeting_ids: meetingIds, dates });
});

module.exports = router;
