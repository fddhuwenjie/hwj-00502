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

    CREATE TABLE IF NOT EXISTS meeting_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      host_id INTEGER,
      location TEXT,
      agenda TEXT,
      minutes_template TEXT,
      default_action_items TEXT,
      duration_minutes INTEGER DEFAULT 60,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT,
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_template_attendees (
      template_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (template_id, user_id),
      FOREIGN KEY (template_id) REFERENCES meeting_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      template_id INTEGER NOT NULL,
      frequency TEXT NOT NULL,
      day_of_week INTEGER,
      day_of_month INTEGER,
      time TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 4,
      start_date TEXT,
      last_generated_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (template_id) REFERENCES meeting_templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      background TEXT,
      content TEXT,
      decision_maker_id INTEGER,
      impact_scope TEXT,
      priority TEXT DEFAULT '中',
      effective_date TEXT,
      meeting_id INTEGER,
      minutes_id INTEGER,
      status TEXT DEFAULT '草稿',
      risk TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (decision_maker_id) REFERENCES users(id),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL,
      FOREIGN KEY (minutes_id) REFERENCES minutes(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS decision_status_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_id INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      operator_id INTEGER,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS decision_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS decision_action_items (
      decision_id INTEGER NOT NULL,
      action_item_id INTEGER NOT NULL,
      PRIMARY KEY (decision_id, action_item_id),
      FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE,
      FOREIGN KEY (action_item_id) REFERENCES action_items(id) ON DELETE CASCADE
    );
  `);

  const meetingsCols = db.prepare(`PRAGMA table_info(meetings)`).all().map(c => c.name);
  if (!meetingsCols.includes('template_id')) {
    db.exec(`ALTER TABLE meetings ADD COLUMN template_id INTEGER`);
  }
  if (!meetingsCols.includes('recurring_rule_id')) {
    db.exec(`ALTER TABLE meetings ADD COLUMN recurring_rule_id INTEGER`);
  }
}

const MEETING_TYPES = ['周会', '评审', '复盘', '客户会议', '临时会议'];
const PRIORITIES = ['高', '中', '低'];
const STATUSES = ['待开始', '进行中', '已完成', '延期', '取消'];
const DECISION_STATUSES = ['草稿', '已确认', '执行中', '已完成', '已废弃'];
const RECURRENCE_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'monthly_first_workday'];
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

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
  DECISION_STATUSES,
  RECURRENCE_FREQUENCIES,
  WEEKDAYS,
  isOverdue,
  DB_PATH
};
