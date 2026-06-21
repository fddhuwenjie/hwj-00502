const { db, initSchema, MEETING_TYPES } = require('./db');

function reset() {
  ['notifications', 'extension_requests', 'action_item_timeline',
   'action_item_comments', 'read_confirmations', 'minutes',
   'action_items', 'meeting_attendees', 'meetings', 'users'].forEach(t => {
    db.exec(`DELETE FROM ${t};`);
  });
  db.exec(`
    DELETE FROM sqlite_sequence;
    SELECT 'ok';
  `);
}

function seed() {
  initSchema();
  reset();

  const users = [
    { name: '张伟', email: 'zhangwei@example.com', department: '产品部', role: '产品经理', avatar_color: '#4f6df5' },
    { name: '李娜', email: 'lina@example.com', department: '研发部', role: '前端工程师', avatar_color: '#e8590c' },
    { name: '王强', email: 'wangqiang@example.com', department: '研发部', role: '后端工程师', avatar_color: '#0ca678' },
    { name: '刘洋', email: 'liuyang@example.com', department: '测试部', role: '测试工程师', avatar_color: '#ae3ec9' },
    { name: '陈静', email: 'chenjing@example.com', department: '设计部', role: 'UI设计师', avatar_color: '#1098ad' },
    { name: '赵磊', email: 'zhaolei@example.com', department: '项目部', role: '项目经理', avatar_color: '#f06595' },
    { name: '孙芳', email: 'sunfang@example.com', department: '运营部', role: '运营专员', avatar_color: '#7048e8' },
    { name: '周明', email: 'zhouming@example.com', department: '销售部', role: '客户经理', avatar_color: '#f59f00' },
  ];
  const insUser = db.prepare(`INSERT INTO users (name,email,department,role,avatar_color) VALUES (@name,@email,@department,@role,@avatar_color)`);
  users.forEach(u => insUser.run(u));

  const meetings = [
    { title: '产品周会-第21周', type: '周会', start: '2026-04-13 10:00', end: '2026-04-13 11:00', location: '会议室A-301', host: 1, attendees: [1,2,3,4,6],
      agenda: '1. 上周进度回顾\n2. 本周计划对齐\n3. 风险与阻塞\n4. 其他事项',
      minutes: `# 产品周会纪要\n\n## 一、议题\n1. 上周进度回顾\n2. 本周计划对齐\n3. 风险与阻塞\n\n## 二、讨论内容\n- 前端组件库升级进度滞后，主要原因为接口联调阻塞\n- 后端订单服务压测 QPS 未达预期\n- 测试环境不稳定，影响回归\n\n## 三、决议\n- 组件库升级本周完成联调，由李娜负责\n- 订单服务本周五前完成性能优化\n- 测试环境稳定性由刘洋排查\n\n## 四、风险\n- 客户演示节点临近，需确保关键链路可用\n\n## 五、附件\n- [上周周报](https://example.com/report-21)` },
    { title: '产品周会-第22周', type: '周会', start: '2026-04-20 10:00', end: '2026-04-20 11:00', location: '会议室A-301', host: 1, attendees: [1,2,3,4,6],
      agenda: '1. 上周进度回顾\n2. 本周计划对齐\n3. 风险与阻塞\n4. 其他事项',
      minutes: `# 产品周会纪要\n\n## 一、议题\n1. 上周遗留事项跟进\n2. 本周计划对齐\n\n## 二、讨论内容\n- 组件库联调已完成，但部分样式需回归\n- 订单服务性能优化方案已评审通过\n\n## 三、决议\n- 组件库回归测试本周完成\n- 性能优化本周三上线\n\n## 四、风险\n- 上线窗口与客户活动冲突\n\n## 五、附件\n- [性能压测报告](https://example.com/perf-22)` },
    { title: '产品周会-第23周', type: '周会', start: '2026-06-01 10:00', end: '2026-06-01 11:00', location: '会议室A-301', host: 1, attendees: [1,2,3,4,6],
      agenda: '1. 上周进度回顾\n2. 本周计划对齐\n3. 风险与阻塞\n4. 其他事项',
      minutes: `# 产品周会纪要\n\n## 一、议题\n1. 月度复盘遗留\n2. 6月排期对齐\n\n## 二、讨论内容\n- 6月需交付三个客户定制模块\n- 数据看板需求待确认\n\n## 三、决议\n- 客户定制模块按优先级排期\n- 数据看板需求本周确认\n\n## 四、风险\n- 多模块并行人力紧张\n\n## 五、附件\n- [6月排期表](https://example.com/plan-6)` },
    { title: '产品周会-第24周', type: '周会', start: '2026-06-08 10:00', end: '2026-06-08 11:00', location: '会议室A-301', host: 1, attendees: [1,2,3,4,6,5],
      agenda: '1. 上周进度回顾\n2. 本周计划对齐\n3. 风险与阻塞\n4. 其他事项',
      minutes: `# 产品周会纪要\n\n## 一、议题\n1. 进度同步\n2. 设计走查\n\n## 二、讨论内容\n- 设计走查发现 5 处交互问题\n- 客户模块A 已完成开发\n\n## 三、决议\n- 设计问题本周修复\n- 模块A 进入测试\n\n## 四、风险\n- 测试资源不足\n\n## 五、附件\n- [走查清单](https://example.com/walkthrough-24)` },
    { title: '产品周会-第25周', type: '周会', start: '2026-06-15 10:00', end: '2026-06-15 11:00', location: '会议室A-301', host: 1, attendees: [1,2,3,4,6],
      agenda: '1. 上周进度回顾\n2. 本周计划对齐\n3. 风险与阻塞\n4. 其他事项',
      minutes: `# 产品周会纪要\n\n## 一、议题\n1. 周中冲刺对齐\n2. 风险跟进\n\n## 二、讨论内容\n- 数据看板接口对接中\n- 客户模块B 评审未通过\n\n## 三、决议\n- 看板接口周四联调\n- 模块B 修改后重新评审\n\n## 四、风险\n- 模块B 可能影响演示\n\n## 五、附件\n- [评审记录](https://example.com/review-25)` },
    { title: '客户定制模块A 评审', type: '评审', start: '2026-05-20 14:00', end: '2026-05-20 15:30', location: '会议室B-201', host: 6, attendees: [1,2,3,4,6,8],
      agenda: '1. 方案评审\n2. 风险评估\n3. 排期确认',
      minutes: `# 评审纪要\n\n## 一、议题\n1. 客户定制模块A 方案评审\n\n## 二、讨论内容\n- 接口设计需兼容旧版本\n- 权限模型需简化\n\n## 三、决议\n- 接口保持向后兼容\n- 权限模型精简为 3 类角色\n\n## 四、风险\n- 旧版本数据迁移复杂度高\n\n## 五、附件\n- [方案文档](https://example.com/spec-a)` },
    { title: '数据看板需求评审', type: '评审', start: '2026-06-05 14:00', end: '2026-06-05 15:00', location: '线上-腾讯会议', host: 1, attendees: [1,2,3,5,6],
      agenda: '1. 需求评审\n2. 视觉方案确认',
      minutes: `# 需求评审纪要\n\n## 一、议题\n1. 数据看板需求评审\n\n## 二、讨论内容\n- 看板需支持自定义指标卡片\n- 数据刷新频率 5 分钟\n\n## 三、决议\n- 支持指标卡片拖拽\n- 刷新频率 5 分钟\n\n## 四、风险\n- 大数据量下前端性能\n\n## 五、附件\n- [原型链接](https://example.com/proto-board)` },
    { title: 'Q2 复盘会', type: '复盘', start: '2026-06-18 09:30', end: '2026-06-18 11:30', location: '会议室C-101', host: 6, attendees: [1,2,3,4,5,6,7],
      agenda: '1. 季度目标回顾\n2. 经验总结\n3. 改进计划',
      minutes: `# Q2 复盘纪要\n\n## 一、议题\n1. Q2 目标完成情况\n2. 经验与教训\n3. Q3 改进方向\n\n## 二、讨论内容\n- Q2 交付率 85%，未达标项为数据看板\n- 跨团队协作流程需优化\n- 测试自动化率偏低\n\n## 三、决议\n- 建立跨团队周例会机制\n- Q3 测试自动化覆盖率提升到 60%\n- 数据看板 Q3 初完成\n\n## 四、风险\n- 人力扩张计划未落地\n\n## 五、附件\n- [Q2 总结报告](https://example.com/q2-summary)` },
    { title: '上线问题复盘', type: '复盘', start: '2026-05-28 16:00', end: '2026-05-28 17:00', location: '线上-飞书会议', host: 6, attendees: [2,3,4,6],
      agenda: '1. 问题回顾\n2. 根因分析\n3. 改进措施',
      minutes: `# 复盘纪要\n\n## 一、议题\n1. 5.26 上线问题复盘\n\n## 二、讨论内容\n- 上线后订单导出超时\n- 根因：SQL 未走索引\n\n## 三、决议\n- 补建索引并加监控\n- 建立上线前慢 SQL 检查清单\n\n## 四、风险\n- 历史数据量大，索引创建耗时\n\n## 五、附件\n- [事故报告](https://example.com/incident-526)` },
    { title: 'A客户季度沟通会', type: '客户会议', start: '2026-06-10 10:00', end: '2026-06-10 11:00', location: '客户现场', host: 8, attendees: [1,6,8],
      agenda: '1. 客户反馈收集\n2. 下阶段需求对齐',
      minutes: `# 客户会议纪要\n\n## 一、议题\n1. A 客户季度沟通\n\n## 二、讨论内容\n- 客户对数据看板期望较高\n- 希望增加导出 PDF 功能\n\n## 三、决议\n- 数据看板纳入下版本优先级\n- 导出 PDF 排入迭代\n\n## 四、风险\n- 客户对交付时间敏感\n\n## 五、附件\n- [客户需求清单](https://example.com/client-a-req)` },
    { title: 'B客户需求对接', type: '客户会议', start: '2026-06-12 15:00', end: '2026-06-12 16:00', location: '线上-腾讯会议', host: 8, attendees: [1,8,7],
      agenda: '1. 需求澄清\n2. 报价沟通',
      minutes: `# 客户会议纪要\n\n## 一、议题\n1. B 客户需求对接\n\n## 二、讨论内容\n- B 客户需要定制报表\n- 报价需含一年维护\n\n## 三、决议\n- 定制报表按人天报价\n- 维护费单列\n\n## 四、风险\n- 报价超客户预算\n\n## 五、附件\n- [报价单草稿](https://example.com/quote-b)` },
    { title: '紧急修复协调会', type: '临时会议', start: '2026-06-17 18:00', end: '2026-06-17 18:30', location: '线上-飞书会议', host: 6, attendees: [2,3,4,6],
      agenda: '1. 紧急问题定级\n2. 修复分工',
      minutes: `# 临时会议纪要\n\n## 一、议题\n1. 线上紧急问题修复协调\n\n## 二、讨论内容\n- 支付回调偶发失败\n- 影响范围约 2% 订单\n\n## 三、决议\n- 当晚发布热修复\n- 增加回调重试与告警\n\n## 四、风险\n- 热修复回归风险\n\n## 五、附件\n- [问题分析](https://example.com/hotfix-617)` },
  ];

  const insMeeting = db.prepare(`INSERT INTO meetings (title,type,start_time,end_time,location,host_id,agenda,status,created_at) VALUES (@title,@type,@start,@end,@location,@host,@agenda,'已发布',@created_at)`);
  const insAttendee = db.prepare(`INSERT OR IGNORE INTO meeting_attendees (meeting_id,user_id) VALUES (?,?)`);
  const insMinutes = db.prepare(`INSERT INTO minutes (meeting_id,content,published_at,published_by,created_at,updated_at) VALUES (?,?,?,?,?,?)`);
  const insConfirm = db.prepare(`INSERT OR IGNORE INTO read_confirmations (minutes_id,user_id,confirmed_at) VALUES (?,?,?)`);

  meetings.forEach((m, idx) => {
    const created = m.start.replace(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, '$1 $2:00');
    const res = insMeeting.run({
      title: m.title, type: m.type, start: m.start, end: m.end,
      location: m.location, host: m.host, agenda: m.agenda, created_at: created
    });
    const mid = res.lastInsertRowid;
    m.attendees.forEach(uid => insAttendee.run(mid, uid));
    const minutesRes = insMinutes.run(mid, m.minutes, m.start.replace(' ', 'T') + ':00', m.host, created, created);
    const minutesId = minutesRes.lastInsertRowid;
    const confirmers = m.attendees.filter(u => u !== m.host);
    confirmers.slice(0, Math.min(confirmers.length, 3)).forEach((uid, i) => {
      insConfirm.run(minutesId, uid, created);
    });
    m._id = mid;
    m._minutesId = minutesId;
  });

  const actionItems = [
    { meeting: 1, title: '完成前端组件库联调', owner: 2, collab: [3], due: '2026-04-18', priority: '高', status: '已完成', progress: 100, note: '联调完成并提交回归', link: 'https://example.com/pr-101' },
    { meeting: 1, title: '订单服务性能优化', owner: 3, collab: [2], due: '2026-04-25', priority: '高', status: '已完成', progress: 100, note: 'QPS 提升 40%', link: 'https://example.com/pr-102' },
    { meeting: 1, title: '测试环境稳定性排查', owner: 4, collab: [], due: '2026-04-23', priority: '中', status: '已完成', progress: 100, note: '定位为资源不足', link: '' },
    { meeting: 2, title: '组件库回归测试', owner: 4, collab: [2], due: '2026-04-24', priority: '中', status: '已完成', progress: 100, note: '回归通过', link: '' },
    { meeting: 2, title: '性能优化方案上线', owner: 3, collab: [], due: '2026-04-29', priority: '高', status: '已完成', progress: 100, note: '上线稳定', link: '' },
    { meeting: 3, title: '6月排期评审', owner: 6, collab: [1], due: '2026-06-05', priority: '高', status: '已完成', progress: 100, note: '排期确认', link: '' },
    { meeting: 3, title: '数据看板需求确认', owner: 1, collab: [5], due: '2026-06-06', priority: '高', status: '已完成', progress: 100, note: '需求已确认', link: '' },
    { meeting: 4, title: '修复设计走查问题', owner: 2, collab: [5], due: '2026-06-13', priority: '中', status: '已完成', progress: 100, note: '5 处问题修复', link: '' },
    { meeting: 4, title: '客户模块A进入测试', owner: 4, collab: [], due: '2026-06-14', priority: '高', status: '已完成', progress: 100, note: '测试通过', link: '' },
    { meeting: 5, title: '数据看板接口联调', owner: 2, collab: [3], due: '2026-06-19', priority: '高', status: '进行中', progress: 70, note: '', link: '' },
    { meeting: 5, title: '客户模块B修改重新评审', owner: 1, collab: [2,3], due: '2026-06-20', priority: '高', status: '进行中', progress: 50, note: '', link: '' },
    { meeting: 6, title: '接口向后兼容改造', owner: 3, collab: [], due: '2026-06-25', priority: '高', status: '进行中', progress: 40, note: '', link: '' },
    { meeting: 6, title: '权限模型精简为3类角色', owner: 1, collab: [3], due: '2026-06-28', priority: '中', status: '待开始', progress: 0, note: '', link: '' },
    { meeting: 6, title: '旧版本数据迁移方案', owner: 3, collab: [4], due: '2026-06-10', priority: '高', status: '延期', progress: 30, note: '', link: '' },
    { meeting: 7, title: '看板指标卡片拖拽实现', owner: 2, collab: [5], due: '2026-06-22', priority: '高', status: '进行中', progress: 60, note: '', link: '' },
    { meeting: 7, title: '看板数据刷新频率配置', owner: 3, collab: [], due: '2026-06-24', priority: '中', status: '进行中', progress: 20, note: '', link: '' },
    { meeting: 7, title: '大数据量前端性能优化', owner: 2, collab: [], due: '2026-07-05', priority: '中', status: '待开始', progress: 0, note: '', link: '' },
    { meeting: 8, title: '建立跨团队周例会机制', owner: 6, collab: [1], due: '2026-06-25', priority: '高', status: '进行中', progress: 40, note: '', link: '' },
    { meeting: 8, title: '测试自动化覆盖率提升到60%', owner: 4, collab: [2,3], due: '2026-06-15', priority: '高', status: '延期', progress: 35, note: '', link: '' },
    { meeting: 8, title: '数据看板Q3初完成规划', owner: 1, collab: [6], due: '2026-06-30', priority: '中', status: '进行中', progress: 25, note: '', link: '' },
    { meeting: 9, title: '补建订单索引', owner: 3, collab: [], due: '2026-06-02', priority: '高', status: '已完成', progress: 100, note: '索引已建', link: '' },
    { meeting: 9, title: '建立慢SQL检查清单', owner: 4, collab: [3], due: '2026-06-05', priority: '中', status: '已完成', progress: 100, note: '清单已建', link: '' },
    { meeting: 10, title: '数据看板纳入下版本', owner: 1, collab: [6], due: '2026-06-18', priority: '高', status: '延期', progress: 45, note: '', link: '' },
    { meeting: 10, title: '导出PDF功能排入迭代', owner: 6, collab: [], due: '2026-06-20', priority: '中', status: '进行中', progress: 30, note: '', link: '' },
    { meeting: 11, title: 'B客户定制报表报价', owner: 8, collab: [7], due: '2026-06-17', priority: '高', status: '已完成', progress: 100, note: '报价已发', link: 'https://example.com/quote-b' },
    { meeting: 11, title: '维护费方案确认', owner: 7, collab: [], due: '2026-06-16', priority: '中', status: '已完成', progress: 100, note: '方案确认', link: '' },
    { meeting: 12, title: '发布支付热修复', owner: 3, collab: [2], due: '2026-06-18', priority: '高', status: '已完成', progress: 100, note: '热修复发布', link: '' },
    { meeting: 12, title: '增加回调重试与告警', owner: 3, collab: [4], due: '2026-06-23', priority: '高', status: '进行中', progress: 55, note: '', link: '' },
    { meeting: 12, title: '热修复回归验证', owner: 4, collab: [], due: '2026-06-19', priority: '中', status: '已完成', progress: 100, note: '验证通过', link: '' },
    { meeting: 8, title: 'Q3人力扩张计划落地', owner: 6, collab: [], due: '2026-07-10', priority: '低', status: '待开始', progress: 0, note: '', link: '' },
  ];

  const insItem = db.prepare(`INSERT INTO action_items (meeting_id,title,owner_id,collaborators,due_date,priority,status,progress,completion_note,result_link,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insTimeline = db.prepare(`INSERT INTO action_item_timeline (action_item_id,event_type,description,from_value,to_value,user_id,created_at) VALUES (?,?,?,?,?,?,?)`);
  const insComment = db.prepare(`INSERT INTO action_item_comments (action_item_id,user_id,content,created_at) VALUES (?,?,?,?)`);

  actionItems.forEach((it, idx) => {
    const meetingId = meetings[it.meeting - 1]._id;
    const created = meetings[it.meeting - 1].start.replace(' ', ' ') + ':00';
    const res = insItem.run(
      meetingId, it.title, it.owner, JSON.stringify(it.collab || []),
      it.due, it.priority, it.status, it.progress, it.note || '', it.link || '',
      created, created
    );
    const aid = res.lastInsertRowid;
    insTimeline.run(aid, 'create', '行动项创建', null, it.status, it.owner, created);
    if (it.status === '进行中' && it.progress > 0) {
      insTimeline.run(aid, 'progress', `进度更新为 ${it.progress}%`, null, String(it.progress), it.owner, created);
    }
    if (it.status === '已完成') {
      insTimeline.run(aid, 'status', '状态变更为 已完成', '进行中', '已完成', it.owner, it.due + ' 12:00:00');
    }
    if (it.status === '延期') {
      insTimeline.run(aid, 'status', '状态变更为 延期', '进行中', '延期', it.owner, it.due + ' 12:00:00');
    }
    if (idx % 3 === 0) {
      insComment.run(aid, it.collab && it.collab[0] ? it.collab[0] : it.owner, '进度同步中，遇到联调问题正在排查。', created);
      insComment.run(aid, it.owner, '收到，我这边跟进。', created);
    }
    if (it.status === '延期' && it.meeting === 6) {
      insComment.run(aid, it.owner, '数据迁移复杂度高于预期，申请延期到 6/20。', created);
    }
    it._id = aid;
  });

  const extReqItem = actionItems.find(a => a.title === '旧版本数据迁移方案');
  const insExt = db.prepare(`INSERT INTO extension_requests (action_item_id,requester_id,current_due_date,requested_due_date,reason,status,approver_id,decided_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  insExt.run(extReqItem._id, extReqItem.owner, '2026-06-10', '2026-06-20', '数据迁移涉及历史数据校验，需要额外测试时间。', '已批准', 6, '2026-06-09 10:00:00', '2026-06-08 09:00:00');
  insExt.run(actionItems.find(a => a.title === '测试自动化覆盖率提升到60%')._id, 4, '2026-06-15', '2026-06-30', '自动化框架升级，需重构用例。', '待审批', null, null, '2026-06-14 16:00:00');

  console.log('Seed completed: 8 users, 12 meetings, 30 action items (+comments/timelines/extension requests).');
}

if (require.main === module) {
  seed();
}
module.exports = { seed };
