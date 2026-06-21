const { db, isOverdue } = require('./db');

function getUser(id) {
  return db.prepare('SELECT id,name,email,department,role,avatar_color FROM users WHERE id=?').get(id);
}

function resolveCollaborators(json) {
  if (!json) return [];
  let ids = [];
  try { ids = JSON.parse(json) || []; } catch (e) { ids = []; }
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT id,name,email,department,role,avatar_color FROM users WHERE id IN (${placeholders})`).all(...ids);
}

function enrichActionItem(item) {
  if (!item) return item;
  item.collaborators = resolveCollaborators(item.collaborators);
  item.owner = item.owner_id ? getUser(item.owner_id) : null;
  item.is_overdue = isOverdue(item);
  if (item.meeting_id) {
    item.meeting = db.prepare('SELECT id,title,type,start_time FROM meetings WHERE id=?').get(item.meeting_id);
  } else {
    item.meeting = null;
  }
  return item;
}

function enrichMeeting(m) {
  if (!m) return m;
  m.host = m.host_id ? getUser(m.host_id) : null;
  m.attendees = db.prepare(`
    SELECT u.id,u.name,u.email,u.department,u.role,u.avatar_color FROM meeting_attendees ma
    JOIN users u ON u.id = ma.user_id WHERE ma.meeting_id=? ORDER BY u.id`).all(m.id);
  const minutes = db.prepare('SELECT id,published_at,published_by FROM minutes WHERE meeting_id=? ORDER BY id DESC LIMIT 1').get(m.id);
  m.minutes = minutes || null;
  if (m.start_time && m.end_time) {
    const s = new Date(m.start_time.replace(' ', 'T'));
    const e = new Date(m.end_time.replace(' ', 'T'));
    m.duration_minutes = Math.max(0, Math.round((e - s) / 60000));
  } else {
    m.duration_minutes = 0;
  }
  m.action_item_count = db.prepare('SELECT COUNT(*) c FROM action_items WHERE meeting_id=?').get(m.id).c;
  return m;
}

function addTimeline(actionItemId, eventType, description, fromValue, toValue, userId) {
  db.prepare(`INSERT INTO action_item_timeline (action_item_id,event_type,description,from_value,to_value,user_id) VALUES (?,?,?,?,?,?)`)
    .run(actionItemId, eventType, description, fromValue || null, toValue || null, userId || null);
  db.prepare(`UPDATE action_items SET updated_at=datetime('now') WHERE id=?`).run(actionItemId);
}

function ensureOverdueNotifications() {
  const items = db.prepare(`SELECT * FROM action_items WHERE status NOT IN ('已完成','取消')`).all();
  const insNotif = db.prepare(`INSERT INTO notifications (user_id,type,title,ref_id) VALUES (?,?,?,?)`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  items.forEach(it => {
    if (it.due_date) {
      const due = new Date(it.due_date + 'T00:00:00');
      if (due < today && !it.overdue_notified) {
        if (it.owner_id) {
          insNotif.run(it.owner_id, 'overdue', `行动项「${it.title}」已逾期，请尽快处理`, it.id);
        }
        db.prepare(`UPDATE action_items SET overdue_notified=1 WHERE id=?`).run(it.id);
      }
    }
  });
}

function formatDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  getUser,
  resolveCollaborators,
  enrichActionItem,
  enrichMeeting,
  addTimeline,
  ensureOverdueNotifications,
  formatDate
};
