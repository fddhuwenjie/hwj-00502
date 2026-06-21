const express = require('express');
const { db } = require('../db');
const { enrichMeeting } = require('../helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const { type, attendee, keyword, start, end, host } = req.query;
  let sql = `SELECT m.* FROM meetings m WHERE 1=1`;
  const params = [];
  if (type) { sql += ` AND m.type=?`; params.push(type); }
  if (host) { sql += ` AND m.host_id=?`; params.push(host); }
  if (attendee) {
    sql += ` AND EXISTS (SELECT 1 FROM meeting_attendees ma WHERE ma.meeting_id=m.id AND ma.user_id=?)`;
    params.push(attendee);
  }
  if (keyword) { sql += ` AND (m.title LIKE ? OR m.agenda LIKE ?)`; params.push(`%${keyword}%`, `%${keyword}%`); }
  if (start) { sql += ` AND m.start_time >= ?`; params.push(start); }
  if (end) { sql += ` AND m.start_time <= ?`; params.push(end); }
  sql += ` ORDER BY m.start_time DESC`;
  const meetings = db.prepare(sql).all(...params).map(enrichMeeting);
  res.json(meetings);
});

router.get('/types/:type/last', (req, res) => {
  const last = db.prepare(`SELECT * FROM meetings WHERE type=? ORDER BY start_time DESC LIMIT 1`).get(req.params.type);
  if (!last) return res.json({ agenda: '' });
  res.json(enrichMeeting(last));
});

router.get('/:id', (req, res) => {
  const m = db.prepare(`SELECT * FROM meetings WHERE id=?`).get(req.params.id);
  if (!m) return res.status(404).json({ error: '会议不存在' });
  res.json(enrichMeeting(m));
});

router.post('/', (req, res) => {
  const { title, type, start_time, end_time, location, host_id, agenda, attendee_ids, copy_from } = req.body;
  if (!title || !type || !start_time) {
    return res.status(400).json({ error: '标题、类型、开始时间为必填项' });
  }
  let finalAgenda = agenda || '';
  if (copy_from) {
    const src = db.prepare(`SELECT agenda FROM meetings WHERE id=?`).get(copy_from);
    if (src) finalAgenda = src.agenda || finalAgenda;
  }
  const r = db.prepare(`INSERT INTO meetings (title,type,start_time,end_time,location,host_id,agenda,status) VALUES (?,?,?,?,?,?,?,'planned')`)
    .run(title, type, start_time, end_time || start_time, location || '', host_id || null, finalAgenda);
  const meetingId = r.lastInsertRowid;
  const ids = Array.isArray(attendee_ids) ? attendee_ids : [];
  const ins = db.prepare(`INSERT OR IGNORE INTO meeting_attendees (meeting_id,user_id) VALUES (?,?)`);
  ids.forEach(uid => ins.run(meetingId, uid));
  const minutes = db.prepare(`INSERT INTO minutes (meeting_id,content) VALUES (?,?)`).run(meetingId, '');
  res.status(201).json({ id: meetingId, minutes_id: minutes.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const m = db.prepare(`SELECT * FROM meetings WHERE id=?`).get(req.params.id);
  if (!m) return res.status(404).json({ error: '会议不存在' });
  const { title, type, start_time, end_time, location, host_id, agenda, attendee_ids, status } = req.body;
  db.prepare(`UPDATE meetings SET title=?,type=?,start_time=?,end_time=?,location=?,host_id=?,agenda=?,status=? WHERE id=?`)
    .run(title ?? m.title, type ?? m.type, start_time ?? m.start_time, end_time ?? m.end_time, location ?? m.location, host_id ?? m.host_id, agenda ?? m.agenda, status ?? m.status, req.params.id);
  if (Array.isArray(attendee_ids)) {
    db.prepare(`DELETE FROM meeting_attendees WHERE meeting_id=?`).run(req.params.id);
    const ins = db.prepare(`INSERT OR IGNORE INTO meeting_attendees (meeting_id,user_id) VALUES (?,?)`);
    attendee_ids.forEach(uid => ins.run(req.params.id, uid));
  }
  res.json({ id: Number(req.params.id) });
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM meetings WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
