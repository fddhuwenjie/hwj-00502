const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      department TEXT,
      role TEXT,
      avatar_color TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      location TEXT,
      host_id INTEGER,
      agenda TEXT,
      status TEXT DEFAULT 'planned',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_attendees (
      meeting_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (meeting_id, user_id),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS minutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      content TEXT,
      published_at TEXT,
      published_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS read_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      minutes_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      confirmed_at TEXT DEFAULT (datetime('now')),
      UNIQUE (minutes_id, user_id),
      FOREIGN KEY (minutes_id) REFERENCES minutes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS action_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER,
      title TEXT NOT NULL,
      owner_id INTEGER,
      collaborators TEXT,
      due_date TEXT,
      priority TEXT DEFAULT '中',
      status TEXT DEFAULT '待开始',
      progress INTEGER DEFAULT 0,
      completion_note TEXT,
      result_link TEXT,
      overdue_notified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS action_item_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_item_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (action_item_id) REFERENCES action_items(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS action_item_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_item_id INTEGER NOT NULL,
      event_type TEXT,
      description TEXT,
      from_value TEXT,
      to_value TEXT,
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (action_item_id) REFERENCES action_items(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS extension_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_item_id INTEGER NOT NULL,
      requester_id INTEGER NOT NULL,
      current_due_date TEXT,
      requested_due_date TEXT,
      reason TEXT,
      status TEXT DEFAULT '待审批',
      approver_id INTEGER,
      decided_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (action_item_id) REFERENCES action_items(id) ON DELETE CASCADE,
      FOREIGN KEY (requester_id) REFERENCES users(id),
      FOREIGN KEY (approver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT,
      title TEXT,
      ref_id INTEGER,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

const MEETING_TYPES = ['周会', '评审', '复盘', '客户会议', '临时会议'];
const PRIORITIES = ['高', '中', '低'];
const STATUSES = ['待开始', '进行中', '已完成', '延期', '取消'];

function isOverdue(item) {
  if (!item || !item.due_date) return false;
  if (['已完成', '取消'].includes(item.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(item.due_date + 'T00:00:00');
  return due < today;
}

module.exports = {
  db,
  initSchema,
  MEETING_TYPES,
  PRIORITIES,
  STATUSES,
  isOverdue,
  DB_PATH
};
