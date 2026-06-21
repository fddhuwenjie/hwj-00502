const express = require('express');
const { db, MEETING_TYPES, STATUSES, DECISION_STATUSES } = require('../db');
const { enrichActionItem, ensureOverdueNotifications, enrichDecision } = require('../helpers');

const router = express.Router();

function durationMinutes(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start.replace(' ', 'T'));
  const e = new Date(end.replace(' ', 'T'));
  return Math.max(0, Math.round((e - s) / 60000));
}

router.get('/overview', (req, res) => {
  ensureOverdueNotifications();
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const allMeetings = db.prepare(`SELECT * FROM meetings`).all();
  const monthlyMeetings = allMeetings.filter(m => m.start_time.startsWith(ym));
  const allDurations = allMeetings.map(m => durationMinutes(m.start_time, m.end_time)).filter(d => d > 0);
  const monthlyDurations = monthlyMeetings.map(m => durationMinutes(m.start_time, m.end_time)).filter(d => d > 0);
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const items = db.prepare(`SELECT * FROM action_items`).all().map(enrichActionItem);
  const statusDist = STATUSES.reduce((acc, s) => { acc[s] = items.filter(i => i.status === s).length; return acc; }, {});
  const typeRatio = MEETING_TYPES.reduce((acc, t) => { acc[t] = allMeetings.filter(m => m.type === t).length; return acc; }, {});
  const overdueItems = items.filter(i => i.is_overdue);
  const validItems = items.filter(i => i.status !== '取消');
  const overdueRate = validItems.length ? Math.round((overdueItems.length / validItems.length) * 100) : 0;

  const monthlyMap = {};
  allMeetings.forEach(m => {
    const mo = m.start_time.slice(0, 7);
    monthlyMap[mo] = (monthlyMap[mo] || 0) + 1;
  });
  const monthlyTrend = Object.keys(monthlyMap).sort().map(mo => ({ month: mo, count: monthlyMap[mo] }));

  const decisions = db.prepare(`SELECT * FROM decisions`).all().map(enrichDecision);
  const monthlyDecisions = decisions.filter(d => d.created_at.startsWith(ym));
  const inProgressDecisions = decisions.filter(d => d.status === '执行中');
  const validDecisions = decisions.filter(d => d.status !== '已废弃');
  const completedDecisions = decisions.filter(d => d.status === '已完成');
  const overdueDecisions = decisions.filter(d => d.is_overdue);
  const decisionCompletionRate = validDecisions.length ? Math.round((completedDecisions.length / validDecisions.length) * 100) : 0;
  const decisionByMeetingType = MEETING_TYPES.reduce((acc, t) => {
    acc[t] = decisions.filter(d => d.meeting && d.meeting.type === t).length;
    return acc;
  }, {});
  const decisionByStatus = DECISION_STATUSES.reduce((acc, s) => {
    acc[s] = decisions.filter(d => d.status === s).length;
    return acc;
  }, {});

  res.json({
    month: ym,
    monthly_meetings: monthlyMeetings.length,
    monthly_avg_duration: avg(monthlyDurations),
    total_meetings: allMeetings.length,
    total_avg_duration: avg(allDurations),
    total_action_items: items.length,
    action_item_status: statusDist,
    overdue_count: overdueItems.length,
    overdue_rate: overdueRate,
    meeting_type_ratio: typeRatio,
    monthly_trend: monthlyTrend,
    decisions: {
      total: decisions.length,
      monthly_new: monthlyDecisions.length,
      in_progress: inProgressDecisions.length,
      completed: completedDecisions.length,
      overdue: overdueDecisions.length,
      completion_rate: decisionCompletionRate,
      by_status: decisionByStatus,
      by_meeting_type: decisionByMeetingType
    }
  });
});

router.get('/owners', (req, res) => {
  const users = db.prepare(`SELECT id,name,department,role,avatar_color FROM users ORDER BY id`).all();
  const allItems = db.prepare(`SELECT * FROM action_items`).all().map(enrichActionItem);
  const ranking = users.map(u => {
    const owned = allItems.filter(i => i.owner_id === u.id);
    const valid = owned.filter(i => i.status !== '取消');
    const completed = owned.filter(i => i.status === '已完成');
    const overdue = owned.filter(i => i.is_overdue);
    const rate = valid.length ? Math.round((completed.length / valid.length) * 100) : 0;
    return {
      ...u,
      total: owned.length,
      valid: valid.length,
      completed: completed.length,
      in_progress: owned.filter(i => ['进行中', '待开始', '延期'].includes(i.status)).length,
      overdue: overdue.length,
      completion_rate: rate
    };
  }).sort((a, b) => b.completion_rate - a.completion_rate || b.completed - a.completed);
  res.json(ranking);
});

module.exports = router;
