const express = require('express');
const { db } = require('../db');
const { ensureOverdueNotifications } = require('../helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const users = db.prepare(`SELECT id,name,email,department,role,avatar_color FROM users ORDER BY id`).all();
  res.json(users);
});

router.get('/:id', (req, res) => {
  const u = db.prepare(`SELECT id,name,email,department,role,avatar_color FROM users WHERE id=?`).get(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  res.json(u);
});

router.get('/:id/notifications', (req, res) => {
  ensureOverdueNotifications();
  const rows = db.prepare(`SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC`).all(req.params.id);
  res.json(rows);
});

router.post('/notifications/:nid/read', (req, res) => {
  db.prepare(`UPDATE notifications SET read_at=datetime('now') WHERE id=? AND user_id=?`).run(req.params.nid, req.body.user_id);
  res.json({ ok: true });
});

module.exports = router;
