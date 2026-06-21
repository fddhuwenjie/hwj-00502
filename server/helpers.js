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

function parseJsonArray(json) {
  if (!json) return [];
  try { return JSON.parse(json) || []; } catch (e) { return []; }
}

function enrichTemplate(t) {
  if (!t) return t;
  t.host = t.host_id ? getUser(t.host_id) : null;
  t.attendees = db.prepare(`
    SELECT u.id,u.name,u.email,u.department,u.role,u.avatar_color FROM meeting_template_attendees mta
    JOIN users u ON u.id = mta.user_id WHERE mta.template_id=? ORDER BY u.id`).all(t.id);
  t.default_action_items = parseJsonArray(t.default_action_items);
  t.meeting_count = db.prepare('SELECT COUNT(*) c FROM meetings WHERE template_id=?').get(t.id).c;
  return t;
}

function computeEndTime(startTime, durationMinutes) {
  const s = new Date(startTime.replace(' ', 'T'));
  const e = new Date(s.getTime() + (durationMinutes || 60) * 60000);
  const pad = n => String(n).padStart(2, '0');
  return `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())} ${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

function renderMinutesTemplate(template, meeting) {
  let md = (template && template.minutes_template) || '';
  if (!md) return '';
  const dateStr = meeting && meeting.start_time ? meeting.start_time.slice(0, 10) : '';
  const titleStr = meeting && meeting.title ? meeting.title : '';
  const hostName = template && template.host_id ? (getUser(template.host_id) || {}).name || '' : '';
  md = md.replace(/\{\{date\}\}/g, dateStr)
        .replace(/\{\{title\}\}/g, titleStr)
        .replace(/\{\{host\}\}/g, hostName);
  return md;
}

function generateRecurringDates(rule) {
  const pad = n => String(n).padStart(2, '0');
  const dates = [];
  const count = Math.max(1, Math.min(Number(rule.count) || 4, 60));
  const time = rule.time || '10:00';
  const startCut = rule.start_date ? new Date(rule.start_date + 'T00:00:00') : new Date();
  startCut.setHours(0, 0, 0, 0);

  function fmt(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
  }
  function tryPush(d) {
    if (d >= startCut && dates.length < count) dates.push(fmt(d));
  }

  if (rule.frequency === 'weekly' || rule.frequency === 'biweekly') {
    const stepDays = rule.frequency === 'biweekly' ? 14 : 7;
    const targetDow = rule.day_of_week != null ? Number(rule.day_of_week) : 1;
    let cur = new Date(startCut);
    let diff = (targetDow - cur.getDay() + 7) % 7;
    cur.setDate(cur.getDate() + diff);
    let guard = 0;
    while (dates.length < count && guard < count + 4) {
      tryPush(cur);
      cur.setDate(cur.getDate() + stepDays);
      guard++;
    }
  } else if (rule.frequency === 'monthly_first_workday') {
    let year = startCut.getFullYear(), month = startCut.getMonth();
    let guard = 0;
    while (dates.length < count && guard < count + 12) {
      let d = new Date(year, month, 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      tryPush(d);
      month++;
      if (month > 11) { month = 0; year++; }
      guard++;
    }
  } else if (rule.frequency === 'monthly') {
    let year = startCut.getFullYear(), month = startCut.getMonth();
    const dom = Number(rule.day_of_month) || 1;
    let guard = 0;
    while (dates.length < count && guard < count + 12) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      let d = new Date(year, month, Math.min(dom, daysInMonth));
      tryPush(d);
      month++;
      if (month > 11) { month = 0; year++; }
      guard++;
    }
  }
  return dates;
}

function touchTemplate(templateId) {
  if (!templateId) return;
  db.prepare(`UPDATE meeting_templates SET last_used_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(templateId);
}

function createMeetingFromTemplate(templateId, startTime, recurringRuleId, opts) {
  opts = opts || {};
  const t = db.prepare('SELECT * FROM meeting_templates WHERE id=?').get(templateId);
  if (!t) throw new Error('模板不存在');
  const title = opts.title || `${t.name} ${startTime.slice(0, 10)}`;
  const endTime = computeEndTime(startTime, t.duration_minutes || 60);
  const r = db.prepare(`INSERT INTO meetings (title,type,start_time,end_time,location,host_id,agenda,status,template_id,recurring_rule_id) VALUES (?,?,?,?,?,?,?,'planned',?,?)`)
    .run(title, t.type, startTime, endTime, t.location || '', t.host_id || null, t.agenda || '', templateId, recurringRuleId || null);
  const meetingId = r.lastInsertRowid;

  const attendeeRows = db.prepare('SELECT user_id FROM meeting_template_attendees WHERE template_id=?').all(templateId).map(a => a.user_id);
  const attendeeIds = [...new Set([...attendeeRows, ...(t.host_id ? [t.host_id] : [])])];
  const insAtt = db.prepare(`INSERT OR IGNORE INTO meeting_attendees (meeting_id,user_id) VALUES (?,?)`);
  attendeeIds.forEach(uid => insAtt.run(meetingId, uid));

  const minutesContent = opts.includeMinutes === false ? '' : renderMinutesTemplate(t, { title, start_time: startTime });
  db.prepare(`INSERT INTO minutes (meeting_id,content) VALUES (?,?)`).run(meetingId, minutesContent);

  if (opts.includeActionItems !== false) {
    const items = parseJsonArray(t.default_action_items);
    const insItem = db.prepare(`INSERT INTO action_items (meeting_id,title,owner_id,due_date,priority,status,progress) VALUES (?,?,?,?,?,?,?)`);
    items.forEach(it => {
      insItem.run(meetingId, it.title || '', it.owner_id || null, it.due_date || null, it.priority || '中', it.status || '待开始', it.progress || 0);
    });
  }
  touchTemplate(templateId);
  return meetingId;
}

function enrichDecision(d) {
  if (!d) return d;
  d.decision_maker = d.decision_maker_id ? getUser(d.decision_maker_id) : null;
  if (d.meeting_id) {
    d.meeting = db.prepare('SELECT id,title,type,start_time FROM meetings WHERE id=?').get(d.meeting_id);
  } else {
    d.meeting = null;
  }
  const actionItems = db.prepare(`
    SELECT ai.* FROM action_items ai
    JOIN decision_action_items dai ON dai.action_item_id = ai.id
    WHERE dai.decision_id = ?
    ORDER BY ai.created_at DESC
  `).all(d.id).map(enrichActionItem);
  d.action_items = actionItems;
  d.action_item_count = actionItems.length;
  const completedItems = actionItems.filter(i => i.status === '已完成');
  const validItems = actionItems.filter(i => i.status !== '取消');
  d.action_item_completion_rate = validItems.length ? Math.round((completedItems.length / validItems.length) * 100) : 0;
  d.is_overdue = actionItems.some(i => i.is_overdue && i.status !== '已完成' && i.status !== '取消');
  return d;
}

function addDecisionStatusLog(decisionId, fromStatus, toStatus, operatorId, remark) {
  db.prepare(`INSERT INTO decision_status_logs (decision_id,from_status,to_status,operator_id,remark) VALUES (?,?,?,?,?)`)
    .run(decisionId, fromStatus || null, toStatus, operatorId || null, remark || null);
  db.prepare(`UPDATE decisions SET updated_at=datetime('now') WHERE id=?`).run(decisionId);
}

module.exports = {
  getUser,
  resolveCollaborators,
  enrichActionItem,
  enrichMeeting,
  enrichTemplate,
  addTimeline,
  ensureOverdueNotifications,
  formatDate,
  parseJsonArray,
  computeEndTime,
  renderMinutesTemplate,
  generateRecurringDates,
  createMeetingFromTemplate,
  touchTemplate,
  enrichDecision,
  addDecisionStatusLog
};
