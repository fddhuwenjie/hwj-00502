const express = require('express');
const cors = require('cors');
const path = require('path');
const { db, initSchema } = require('./db');
const { seed, seedTemplates } = require('./seed');

initSchema();
const userCount = db.prepare(`SELECT COUNT(*) c FROM users`).get().c;
if (userCount === 0) {
  seed();
}
seedTemplates();

const meetingsRouter = require('./routes/meetings');
const minutesRouter = require('./routes/minutes');
const actionItemsRouter = require('./routes/actionItems');
const usersRouter = require('./routes/users');
const statsRouter = require('./routes/stats');
const templatesRouter = require('./routes/templates');
const decisionsRouter = require('./routes/decisions');

const api = express();
api.use(cors());
api.use(express.json({ limit: '5mb' }));
api.use(express.urlencoded({ extended: true }));

api.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
api.use('/api/meetings', meetingsRouter);
api.use('/api/meetings/:meetingId/minutes', minutesRouter);
api.use('/api/action-items', actionItemsRouter);
api.use('/api/users', usersRouter);
api.use('/api/stats', statsRouter);
api.use('/api/templates', templatesRouter);
api.use('/api/decisions', decisionsRouter);

api.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

const API_PORT = 8502;
api.listen(API_PORT, () => {
  console.log(`[API] 后端服务运行于 http://localhost:${API_PORT}`);
});

const frontend = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
frontend.use(express.static(PUBLIC_DIR));
frontend.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});
const FE_PORT = 3502;
frontend.listen(FE_PORT, () => {
  console.log(`[Web] 前端服务运行于 http://localhost:${FE_PORT}`);
});
