/* 冒烟测试：用 vm 沙箱 + stub DOM/localStorage 加载 app.js，
   验证：加载不崩、#seed 注入后双 key 写入一致、__qt API 完整 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // 相对路径：tests/ 的上一级 = 项目根
const code = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

// ---- stub DOM ----
function makeEl() {
  return {
    innerHTML: '',
    style: {},
    className: '',
    classList: { add(){}, remove(){}, toggle(){} },
    setAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, removeEventListener(){},
    appendChild(){}, remove(){}, focus(){}, click(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    textContent: ''
  };
}
const body = makeEl();
const main = makeEl();
const documentStub = {
  readyState: 'complete',
  documentElement: { setAttribute(){}, getAttribute(){ return 'light'; } },
  body: body,
  getElementById: () => main,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: makeEl,
  addEventListener(){},
  activeElement: null
};

const store = {};
const localStorageStub = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

const windowStub = {
  scrollTo(){}, addEventListener(){},
  matchMedia: () => ({ matches: false, addEventListener(){} }),
  location: { hash: '#seed', search: '' },
  navigator: {},
  document: documentStub,
  localStorage: localStorageStub,
  setInterval: () => 1, clearInterval(){},
  setTimeout, clearTimeout
};

const sandbox = {
  window: windowStub, document: documentStub, localStorage: localStorageStub,
  navigator: {}, location: windowStub.location, console, setTimeout, clearTimeout,
  setInterval: () => 1, clearInterval(){},
  Date, Math, JSON, Array, Object, String, Number, isNaN, parseInt
};
vm.createContext(sandbox);

let threw = null;
try {
  vm.runInContext(code, sandbox);
} catch (e) { threw = e; }

const results = [];
results.push(['加载不抛异常', threw === null]);
if (threw) { console.error('LOAD ERROR:', threw.message); process.exit(1); }

// 1. #seed 注入后应有数据
const raw1 = store['quit-tracker-v1'];
results.push(['#seed 注入后主 key 有数据', !!raw1 && JSON.parse(raw1).projects.length === 3]);

// 2. 双 key 写入一致
results.push(['备份 key 存在且内容一致', store['quit-tracker-v1.bak'] === raw1]);

// 3. __qt API 暴露完整
const qt = sandbox.window.__qt;
const required = ['openNewProject','openEditProject','openAddRecord','openEditRecord','openNewReview','openEditReview','confirmDeleteReview','dismissReviewBanner','openDetail','goHome','calPrev','calNext','confirmDeleteProject','confirmDeleteRecord','closeModal','openSettings','openReport'];
results.push(['__qt API 完整', !!qt && required.every(k => typeof qt[k] === 'function')]);

// 4. seed 数据 recalcBest 语义：demo3 只有一条记录 → bestStreak 应为 0（当前进行中不再计入历史最高）
const data = JSON.parse(raw1);
const demo3 = data.projects.find(p => p.id === 'demo3');
results.push(['recalcBest 新语义：单条记录 bestStreak=0', demo3 && demo3.bestStreak === 0]);

// 5. demo2 历史最高 = 已完成间隔最大值（30-22=8 天）
const demo2 = data.projects.find(p => p.id === 'demo2');
const expectedBest = 8 * 86400000;
results.push(['recalcBest 新语义：demo2 历史最高=8天', demo2 && Math.abs(demo2.bestStreak - expectedBest) < 60000]);

// 5.5 v3/v4 新功能：goalDays + tags + private/eyeOpen 字段
const demo1 = data.projects.find(p => p.id === 'demo1');
const demo2p = data.projects.find(p => p.id === 'demo2');
results.push(['v3 goalDays 生效', demo1 && demo1.goalDays === 30 && demo3.goalDays === 0]);
results.push(['v3 records.tags 生效', demo1 && Array.isArray(demo1.records[1].tags) && demo1.records[1].tags.indexOf('工作压力') >= 0]);
results.push(['schema 版本为 v6', data.v === 6]);
results.push(['v6 默认分类写入 state', Array.isArray(data.categories) && data.categories.length === 6 && data.categories[0] === '饮食']);
results.push(['v5 分类与排序字段生效', demo1 && demo1.category === '饮食' && typeof demo1.order === 'number'
                                     && demo2p && demo2p.category === '作息']);
results.push(['v4 隐私字段生效', demo2p && demo2p.private === true && demo2p.eyeOpen === false && demo1 && !demo1.private]);

// 6. 渲染层：openDetail('demo1') 后按页签断言（详情页已分区：概览/记录/复盘/成就）
try {
  qt.openDetail('demo1');
  const html = main.innerHTML;
  results.push(['详情页（概览）渲染目标进度（C1）', html.indexOf('goal-card') >= 0 && html.indexOf('30') >= 0]);
  results.push(['详情页（概览）渲染报告按钮（D1）', html.indexOf('生成周报') >= 0]);
  qt.setDetailTab('reviews');
  const htmlR = main.innerHTML;
  results.push(['详情页（复盘）渲染洞察区块（B1）', htmlR.indexOf('洞察') >= 0 && htmlR.indexOf('insight-card') >= 0]);
  results.push(['详情页（复盘）渲染原因标签（A1）', htmlR.indexOf('hi-tag') >= 0 && htmlR.indexOf('工作压力') >= 0]);
  qt.setDetailTab('badges');
  results.push(['详情页（成就）渲染徽章（C2）', main.innerHTML.indexOf('badge-grid') >= 0]);
} catch (e) {
  results.push(['详情页渲染不抛异常', false]);
  console.error('RENDER ERROR:', e.message);
}

// 6.5 隐私保护：openDetail('demo2')(隐私项目默认闭眼) 应包含 is-blurred 与眼睛按钮
try {
  qt.goHome();
  qt.openDetail('demo2');
  const html2 = main.innerHTML;
  results.push(['隐私详情渲染模糊类（v4）', html2.indexOf('is-blurred') >= 0]);
  results.push(['隐私详情渲染眼睛按钮（v4）', html2.indexOf('pc-eye') >= 0]);
  results.push(['隐私详情渲染提示条（v4）', html2.indexOf('privacy-note') >= 0]);
} catch (e) {
  results.push(['隐私详情渲染不抛异常', false]);
  console.error('PRIVACY RENDER ERROR:', e.message);
}

// 7. 迁移管道：手动塞一个 v1 旧格式数据（records 为纯数字）能正常加载且不丢数据
// 注：loadState 迁移后的 state 在内存中，需等下一次 saveState 才写回（设计如此），
// 因此这里验证的是"旧数据加载不崩 + 原始数据未被清空 + 应用正常初始化"
store['quit-tracker-v1'] = JSON.stringify({ v: 1, projects: [{ id: 'old1', name: '旧数据', emoji: '🍺', records: [1111111111111, 2222222222222] }] });
delete store['quit-tracker-v1.bak'];
// 全新沙箱（location 不带 #seed，避免再次触发 seed 注入覆盖旧数据），复用同一 localStorage
const win2 = {
  scrollTo(){}, addEventListener(){},
  matchMedia: () => ({ matches: false, addEventListener(){} }),
  location: { hash: '', search: '' },
  navigator: {}, document: documentStub, localStorage: localStorageStub,
  setInterval: () => 1, clearInterval(){}, setTimeout, clearTimeout
};
const sandbox2 = {
  window: win2, document: documentStub, localStorage: localStorageStub,
  navigator: {}, location: win2.location, console, setTimeout, clearTimeout,
  setInterval: () => 1, clearInterval(){},
  Date, Math, JSON, Array, Object, String, Number, isNaN, parseInt
};
vm.createContext(sandbox2);
let migrateThrew = null;
try {
  vm.runInContext(code, sandbox2);
} catch (e) { migrateThrew = e; }
results.push(['旧格式数据加载不崩', migrateThrew === null]);
if (migrateThrew) console.error('MIGRATE ERROR:', migrateThrew.message);
// 旧数据未被清空（仍保留在 localStorage 中）
const afterMigrate = JSON.parse(store['quit-tracker-v1']);
results.push(['旧数据未被清空', afterMigrate && afterMigrate.projects.some(p => p.id === 'old1')]);
// 应用正常初始化（__qt 存在）
results.push(['旧数据下应用正常初始化', typeof win2.__qt === 'object' && typeof win2.__qt.openDetail === 'function']);

// ============ 损坏恢复（回归 N-P0-1：主 key 解析失败时备份回退必须可达）============
// 旧缺陷：JSON.parse 抛异常 → 直接走 catch 返回空态，备份回退分支不可达
// 修复后：截断 / 非法字符 / 空串 / 主缺失 四种形态都必须能恢复；主+备同时损坏则安全空态
function bootWith(storeSeed, opts) {
  opts = opts || {};
  const store = Object.assign({}, storeSeed);
  const main2 = makeEl();
  const body2 = makeEl();
  const doc = {
    readyState: 'complete',
    documentElement: { setAttribute(){}, getAttribute(){ return 'light'; } },
    body: body2,
    getElementById: () => main2,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: makeEl,
    addEventListener(){},
    activeElement: null
  };
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const win3 = {
    scrollTo(){}, addEventListener(){},
    matchMedia: () => ({ matches: false, addEventListener(){} }),
    location: { hash: '', search: opts.search || '' },
    navigator: {}, document: doc, localStorage: ls,
    setInterval: () => 1, clearInterval(){}, setTimeout, clearTimeout
  };
  const sb = {
    window: win3, document: doc, localStorage: ls,
    navigator: {}, location: win3.location, console, setTimeout, clearTimeout,
    setInterval: () => 1, clearInterval(){},
    Date, Math, JSON, Array, Object, String, Number, isNaN, parseInt
  };
  vm.createContext(sb);
  let err = null;
  try { vm.runInContext(code, sb); } catch (e) { err = e; }
  return { store, main: main2, err, qt: win3.__qt };
}

const MAIN_K = 'quit-tracker-v1';
const BAK_K = 'quit-tracker-v1.bak';
const goodData = JSON.stringify({
  v: 4,
  projects: [{
    id: 'bk1', name: '备份项目', emoji: '🚭',
    records: [{ id: 'bkr1', t: Date.now() - 86400000, n: '', tags: [] }],
    reviews: [], bestStreak: 0, goalDays: 0, private: false, eyeOpen: false,
    seenMilestones: [], seenReviewCycles: [], dismissedReviewBanner: null, createdAt: Date.now()
  }]
});

// 8.1 主 key 截断（JSON.parse 抛异常）→ 必须从备份恢复
{
  const r = bootWith({ [MAIN_K]: '{"v":4,"projects":[{"id":"a","name":"被截断', [BAK_K]: goodData });
  results.push(['损坏恢复：主 key 截断 → 从备份恢复', r.err === null && r.main.innerHTML.indexOf('备份项目') >= 0]);
  let wroteBack = false;
  try { wroteBack = JSON.parse(r.store[MAIN_K]).projects[0].id === 'bk1'; } catch (e) {}
  results.push(['损坏恢复：恢复后已写回主 key', wroteBack]);
}
// 8.2 主 key 含非法字符（非 JSON）
{
  const r = bootWith({ [MAIN_K]: '<<<not json>>>', [BAK_K]: goodData });
  results.push(['损坏恢复：主 key 非法字符 → 从备份恢复', r.err === null && r.main.innerHTML.indexOf('备份项目') >= 0]);
}
// 8.3 主 key 为空字符串
{
  const r = bootWith({ [MAIN_K]: '', [BAK_K]: goodData });
  results.push(['损坏恢复：主 key 空字符串 → 从备份恢复', r.err === null && r.main.innerHTML.indexOf('备份项目') >= 0]);
}
// 8.4 主 key 缺失、备份存在
{
  const r = bootWith({ [BAK_K]: goodData });
  results.push(['损坏恢复：主 key 缺失 → 从备份恢复', r.err === null && r.main.innerHTML.indexOf('备份项目') >= 0]);
}
// 8.5 主 + 备同时损坏 → 安全空态，且不抛异常
{
  const r = bootWith({ [MAIN_K]: '{"v":4,', [BAK_K]: 'also broken{' });
  results.push(['损坏恢复：主+备同时损坏 → 空态不崩', r.err === null && r.main.innerHTML.indexOf('还没有追踪项目') >= 0]);
}
// 8.6 全新用户（无任何 key）→ 空态且不崩（回归：修复不得让首次访问也走恢复提示）
{
  const r = bootWith({});
  results.push(['损坏恢复：全新用户空存储 → 空态不崩', r.err === null && r.main.innerHTML.indexOf('还没有追踪项目') >= 0]);
}

// 8.7 月历口径：只有 1 条「开始记录」时，月历不得出现"1 次"标记（回归 N-P1-1）
{
  const now = Date.now();
  const st = JSON.stringify({
    v: 4,
    projects: [{
      id: 'cal1', name: '口径测试', emoji: '🧋',
      records: [{ id: 'cr1', t: now - 3600000, n: '开始', tags: [] }],
      reviews: [], bestStreak: 0, goalDays: 0, private: false, eyeOpen: false,
      seenMilestones: [], seenReviewCycles: [], dismissedReviewBanner: null, createdAt: now - 3600000
    }]
  });
  const r = bootWith({ [MAIN_K]: st, [BAK_K]: st });
  r.qt.openDetail('cal1');
  r.qt.setDetailTab('records');
  results.push(['月历口径：首条开始记录不计入破戒', r.main.innerHTML.indexOf('>1 次</div>') < 0]);
}

// ============ 阶段 B 回归（搜索含标签 / 月历日期 / 编辑按钮类名 / 子状态复位）============
const projWithTag = JSON.stringify({
  v: 4,
  projects: [{
    id: 'b1', name: '标签检索', emoji: '🧋',
    records: [
      { id: 'b1r0', t: Date.now() - 5 * 86400000, n: '开始戒断', tags: [] },
      { id: 'b1r1', t: Date.now() - 4 * 86400000, n: '今天没忍住', tags: ['工作压力', '无聊'] }
    ],
    reviews: [], bestStreak: 0, goalDays: 0, private: false, eyeOpen: false,
    seenMilestones: [], seenReviewCycles: [], dismissedReviewBanner: null,
    createdAt: Date.now() - 5 * 86400000
  }]
});

// 9.1 搜索命中破戒原因标签（原先只匹配备注，A1 标签检索不到）
{
  const r = bootWith({ [MAIN_K]: projWithTag, [BAK_K]: projWithTag });
  const f = r.qt.recordMatchesQuery;
  results.push(['搜索：命中破戒原因标签', f({ id: 'x', t: 1, n: '', tags: ['工作压力'] }, '工作压力') === true]);
  results.push(['搜索：标签为部分匹配且不误报', f({ id: 'x', t: 1, n: '', tags: ['工作压力'] }, '工作压') === true
                                              && f({ id: 'x', t: 1, n: '', tags: ['无聊'] }, '工作压') === false]);
  results.push(['搜索：仍能命中备注', f({ id: 'x', t: 1, n: '今天没忍住', tags: [] }, '没忍住') === true]);
}

// 9.2 月历：日期数字保留，破戒次数以右上角角标呈现（原先用"N 次"整体替换日期）
{
  const r = bootWith({ [MAIN_K]: projWithTag, [BAK_K]: projWithTag });
  r.qt.openDetail('b1');
  r.qt.setDetailTab('records');
  const html = r.main.innerHTML;
  const cell = html.match(/<div class="cal-day lv-1"[^>]*>([\s\S]*?)<\/div>/);
  const inner = cell ? cell[1] : '';
  results.push(['月历：日期数字未被"N 次"替换', inner !== '' && inner.indexOf('cal-count') >= 0 && inner.indexOf('次') < 0]);
}

// 9.3 历史记录：编辑按钮不再与删除按钮共用 .hi-del
{
  const r = bootWith({ [MAIN_K]: projWithTag, [BAK_K]: projWithTag });
  r.qt.openDetail('b1');
  r.qt.setDetailTab('records');
  const html = r.main.innerHTML;
  results.push(['历史记录：编辑按钮独立为 .hi-edit', html.indexOf('class="hi-edit"') >= 0 && html.indexOf('class="hi-del"') >= 0]);
}

// 9.4 openDetail 复位子状态：带 ?cal=year 进入后打开详情，应回到月历而非年热力图
{
  const r = bootWith({ [MAIN_K]: projWithTag, [BAK_K]: projWithTag }, { search: '?cal=year' });
  r.qt.openDetail('b1');
  r.qt.setDetailTab('records');
  const html = r.main.innerHTML;
  results.push(['openDetail 复位日历视图（年热力图 → 月历）', html.indexOf('heatmap-wrap') < 0 && html.indexOf('cal-grid') >= 0]);
}

// ============ v5 回归（分类筛选 / 自定义排序 / 海报）============
const D = 86400000;
const nowV5 = Date.now();
const mkProj = (id, name, emoji, category, order, extra) => Object.assign({
  id, name, emoji, category, order,
  records: [{ id: id + 'r0', t: nowV5 - 20 * D, n: '开始', tags: [] }],
  reviews: [], bestStreak: 0, goalDays: 0, private: false, eyeOpen: false,
  seenMilestones: [], seenReviewCycles: [], dismissedReviewBanner: null,
  createdAt: nowV5 - 20 * D
}, extra || {});
const projV5 = JSON.stringify({
  v: 5,
  projects: [
    mkProj('a1', '戒奶茶', '🧋', '饮食', 2, {
      goalDays: 10,
      records: [{ id: 'a1r0', t: nowV5 - 20 * D, n: '开始', tags: [] },
                { id: 'a1r1', t: nowV5 - 3 * D, n: '嘴馋', tags: ['工作压力'] }]
    }),
    mkProj('a2', '戒熬夜', '😴', '作息', 0),
    mkProj('a3', '无名项目', '🚭', '', 1)
  ]
});
const seedV5 = { [MAIN_K]: projV5, [BAK_K]: projV5 };

// 10.1 分类筛选：只显示该分类下的项目
{
  const r = bootWith(seedV5);
  r.qt.setListFilter('饮食');
  const h = r.main.innerHTML;
  results.push(['v5 分类筛选：只显示该分类项目', h.indexOf('戒奶茶') >= 0 && h.indexOf('戒熬夜') < 0 && h.indexOf('无名项目') < 0]);
}
// 10.2 筛选胶囊：渲染全部 / 各分类 / 未分类
{
  const r = bootWith(seedV5);
  const h = r.main.innerHTML;
  results.push(['v5 筛选胶囊渲染（含未分类项）',
    h.indexOf('class="tabs"') >= 0 && h.indexOf('全部') >= 0
    && h.indexOf('饮食') >= 0 && h.indexOf('作息') >= 0 && h.indexOf('未分类') >= 0]);
}
// 10.3 自定义排序：order 小者在前
{
  const r = bootWith(seedV5);
  const h = r.main.innerHTML;
  results.push(['v5 自定义排序：order 小者在前',
    h.indexOf('戒熬夜') < h.indexOf('无名项目') && h.indexOf('无名项目') < h.indexOf('戒奶茶')]);
}
// 10.4 拖拽落点：移动后重编号为 0..n-1（避免并列导致后续排序不确定）
{
  const r = bootWith(seedV5);
  const ok = r.qt.reorderProjects(0, 2); // 排序视图 [a2,a3,a1] → 把 a2 移到最后
  const st = JSON.parse(r.store[MAIN_K]);
  const ord = {}; st.projects.forEach(x => { ord[x.id] = x.order; });
  results.push(['v5 拖拽排序：重编号 0..n-1', ok === true && ord.a3 === 0 && ord.a1 === 1 && ord.a2 === 2]);
}
// 10.5 排序模式：出现拖拽柄、隐藏筛选胶囊（避免"筛选后顺序"与"全局顺序"混淆）
{
  const r = bootWith(seedV5);
  r.qt.toggleSortMode();
  const h = r.main.innerHTML;
  results.push(['v5 排序模式：显示拖拽柄且不显示筛选胶囊', h.indexOf('drag-handle') >= 0 && h.indexOf('class="tabs"') < 0]);
}
// 10.6 分类归一化：预置列表外的值一律归为未分类
{
  const r = bootWith(seedV5);
  const f = r.qt.normalizeCategory;
  results.push(['v5 分类归一化：非法值归为未分类',
    f('饮食') === '饮食' && f('不存在') === '' && f('') === '' && f(null) === '' && f(123) === '']);
}
// 10.7 周期统计：破戒次数与最长坚持段（不含窗口外时长）
{
  const r = bootWith(seedV5);
  const fake = { records: [{ id: 'f0', t: nowV5 - 20 * D }, { id: 'f1', t: nowV5 - 10 * D }, { id: 'f2', t: nowV5 - 3 * D }] };
  const s = r.qt.periodStats(fake, nowV5 - 7 * D, nowV5);
  // 破戒在 3 天前 → 窗口内 1 次；该段起于 10 天前，须裁剪到窗口起点 → 4 天（而不是 7 天）
  results.push(['v5 周期统计：破戒数正确 + 段起止裁剪进窗口',
    s.relapses === 1 && Math.abs(s.maxSeg - 4 * D) < 60000
    && typeof s.totalMs === 'undefined']); // 刻意不提供"周期内坚持总时长"（恒等于窗口长度，无信息量）
}
// 10.8 海报数据：天数 / 目标进度 / 本期对比 / 徽章
{
  const r = bootWith(seedV5);
  const pp = { id: 'pp', name: 'X', emoji: '🧋', goalDays: 10, private: false, eyeOpen: false,
    records: [{ id: 'pr0', t: nowV5 - 20 * D, n: '', tags: [] }, { id: 'pr1', t: nowV5 - 3 * D, n: '', tags: [] }],
    reviews: [], bestStreak: 0, seenMilestones: [], seenReviewCycles: [] };
  const pd = r.qt.posterData(pp, 7, nowV5);
  results.push(['v5 海报数据：天数/进度/对比/徽章',
    pd.days === 3 && pd.goalDays === 10 && Math.abs(pd.pct - 0.3) < 0.001 && pd.goalDone === false
    && pd.badgeTotal === 12 && pd.cur.relapses === 1 && pd.prev.relapses === 0 && pd.relapseDelta === 1
    && pd.ringLabel.indexOf('还差 7 天') >= 0]);
  // 未设目标但有过历史最长 → 环回落为"与历史最好的差距"，而不是画空环
  const pp2 = Object.assign({}, pp, { goalDays: 0, bestStreak: 20 * D });
  const pd2 = r.qt.posterData(pp2, 7, nowV5);
  results.push(['v5 环语义回落：无目标时对比历史最长',
    Math.abs(pd2.pct - 0.15) < 0.001 && pd2.goalDone === false && pd2.ringLabel.indexOf('历史最长 20 天') >= 0]);
}
// 10.9 海报渲染：核心区块齐备，且"破戒变少"着绿色、"变多"着红色
{
  const r = bootWith(seedV5);
  const good = r.qt.renderPoster({ emoji: '🧋', name: 'X' },
    { rangeDays: 7, days: 3, goalDays: 10, pct: 0.3, goalDone: false, ringLabel: '目标 10 天 · 还差 7 天',
      cur: { relapses: 1, maxSeg: 2 * D }, prev: { relapses: 3, maxSeg: 1 * D },
      relapseDelta: -2, maxSegDelta: 1 * D, badgeTotal: 12, badgeUnlocked: 4, badgeIcons: ['🌱', '💪'] });
  const bad = r.qt.renderPoster({ emoji: '🧋', name: 'X' },
    { rangeDays: 7, days: 3, goalDays: 0, pct: 0, goalDone: false, ringLabel: '未设目标 · 每多一天都是净赚',
      cur: { relapses: 5, maxSeg: 0 }, prev: { relapses: 1, maxSeg: 0 },
      relapseDelta: 4, maxSegDelta: 0, badgeTotal: 12, badgeUnlocked: 12, badgeIcons: ['🌱'] });
  const zero = r.qt.renderPoster({ emoji: '🧋', name: 'X' },
    { rangeDays: 7, days: 3, goalDays: 30, pct: 0.1, goalDone: false, ringLabel: '目标 30 天 · 还差 27 天',
      cur: { relapses: 2, maxSeg: 1 * D }, prev: { relapses: 0, maxSeg: 0 },
      relapseDelta: 2, maxSegDelta: 1 * D, badgeTotal: 12, badgeUnlocked: 3, badgeIcons: ['🌱'] });
  results.push(['v5 海报渲染：区块齐备 + 对比着色方向正确',
    good.indexOf('poster-days') >= 0 && good.indexOf('poster-ring') >= 0 && good.indexOf('poster-cmp') >= 0
    && good.indexOf('pb-icons') >= 0 && good.indexOf('poster-foot') >= 0
    && good.indexOf('pd-good') >= 0                 // 破戒 3→1 变少 → 绿
    && bad.indexOf('pd-bad') >= 0                   // 破戒 1→5 变多 → 红
    && good.indexOf('未设目标') < 0 && bad.indexOf('未设目标') >= 0
    && good.indexOf('还差 7 天') >= 0
    && zero.indexOf('本期新增') >= 0                // 上期为 0 → 不给趋势箭头
    && zero.indexOf('stroke="#1db954"') >= 0]);     // pct > 0 → 画进度弧
}
// 10.10 卡片显示分类小标
{
  const r = bootWith(seedV5);
  const h = r.main.innerHTML;
  results.push(['v5 卡片渲染分类小标', h.indexOf('cat-chip') >= 0 && h.indexOf('>饮食<') >= 0]);
}

// 10.11 筛选胶囊改 data-filter 承载分类值（回归 BUG-J1：撇号分类名不再断裂 onclick）
{
  const r = bootWith(seedV5);
  const h = r.main.innerHTML;
  results.push(['v5 筛选胶囊：分类值走 data-filter（全部/各分类/未分类），不再拼 onclick 字符串',
    h.indexOf('data-filter=""') >= 0 && h.indexOf('data-filter="饮食"') >= 0
    && h.indexOf('data-filter="__none__"') >= 0
    && h.indexOf('window.__qt.setListFilter') < 0]);
}
{
  const apo = JSON.stringify({ v: 6, categories: ["奶茶'"],
    projects: [mkProj('j1', 'X', '🧋', "奶茶'", 0)] });
  const r = bootWith({ [MAIN_K]: apo, [BAK_K]: apo });
  const h = r.main.innerHTML;
  results.push(['v5 筛选胶囊：撇号分类名经 esc 进属性安全渲染，不产生 onclick',
    h.indexOf('data-filter="奶茶&#39;"') >= 0 && h.indexOf('window.__qt.setListFilter') < 0]);
}

// 10.12 时间校验：零时间戳（1970-01-01T00:00，UTC 下 ts=0）不再被判"时间无效"（回归 BUG-E1；TZ=UTC 下才与旧实现有区分度）
{
  const r = bootWith(seedV5);
  results.push(['时间校验：去掉 !ts 后零时间戳合法、乱串仍拒绝',
    r.qt.parseRecordTime('1970-01-01T00:00').ok === true && r.qt.parseRecordTime('not-a-date').ok === false]);
}
// 10.13 筛选态净化：落空筛选回落"全部"（回归 BUG-S2 的纯函数面）
{
  const r = bootWith(seedV5);
  const f = r.qt.sanitizeListFilter;
  results.push(['筛选态净化：合法保留 / 未分类保留 / 非法回落全部',
    f('饮食') === '饮食' && f('__none__') === '__none__' && f('不存在的分类') === '' && f('') === '']);
}
// 10.14 年热力图标题与实际渲染范围一致（回归 BUG-E3：首条记录超一年时不再恒写"近 365 天"）
{
  const now = Date.now();
  const st = JSON.stringify({ v: 6, categories: ['饮食'], projects: [Object.assign(mkProj('h1', 'H', '🧋', '饮食', 0),
    { records: [{ id: 'h0', t: now - 400 * 86400000, n: '开始', tags: [] }], createdAt: now - 400 * 86400000 })] });
  const r = bootWith({ [MAIN_K]: st, [BAK_K]: st });
  r.qt.openDetail('h1');
  r.qt.setDetailTab('records');
  r.qt.calTab('year');
  const m = r.main.innerHTML.match(/近 (\d+) 天/);
  results.push(['年热力图：标题显示真实渲染天数（400 天前开始 → >365）',
    !!m && parseInt(m[1], 10) > 365, m ? m[1] : '未匹配']);
}
// 10.15 徽章文案与判据对齐（回归 BUG-P3，批次 5 决策 3）：改名「诚实记录」，语义如实
{
  const r = bootWith(seedV5);
  r.qt.openDetail('a1');
  r.qt.setDetailTab('badges');
  const h = r.main.innerHTML;
  results.push(['徽章：改名诚实记录且不再出现"重新出发"文案',
    h.indexOf('诚实记录') >= 0 && h.indexOf('重新出发') < 0 && h.indexOf('badge-grid') >= 0]);
}
// 10.16 导入消毒（回归 BUG-D2）：恶意 id / cycleDays 在渲染层不可注入
{
  const evil = JSON.stringify({ v: 6, categories: ['饮食'], projects: [{
    id: "x');alert(1);//", name: '注入尝试', emoji: '🧋', category: '饮食', order: 0, goalDays: 0,
    records: [{ id: "r');alert(2);//", t: Date.now() - 86400000, n: '', tags: [] }],
    reviews: [{ id: "rv');alert(3);//", cycleDays: '<img src=x onerror=alert(4)>', ts: Date.now(), achievement: '', improvement: '', nextPlan: '' }],
    bestStreak: 0, private: false, eyeOpen: false, seenMilestones: [], seenReviewCycles: [], dismissedReviewBanner: null, createdAt: Date.now()
  }] });
  const r = bootWith({ [MAIN_K]: evil, [BAK_K]: evil });
  const h1 = r.main.innerHTML;
  results.push(['导入消毒：恶意项目/记录 id 被重生成，列表无注入面',
    /data-id="[\w-]+"/.test(h1) && h1.indexOf('alert(1)') < 0 && h1.indexOf('alert(2)') < 0]);
  const idMatch = h1.match(/data-id="([\w-]+)"/);
  if (idMatch) r.qt.openDetail(idMatch[1]);
  r.qt.setDetailTab('reviews');
  const h2 = r.main.innerHTML;
  results.push(['导入消毒：cycleDays 非数字归 0，<img> 注入不可达',
    h2.indexOf('alert(3)') < 0 && h2.indexOf('alert(4)') < 0 && h2.indexOf('<img') < 0 && h2.indexOf('0 天复盘') >= 0]);
}

// ============ v6 回归（分类可自定义：增 / 改 / 删 / 重置 / 迁移保留）============
// 11.1 默认分类 + 新增 + 去重 + 长度上限
{
  const r = bootWith(seedV5);
  const defOk = r.qt.getCategories().length === 6 && r.qt.getCategories()[0] === '饮食';
  const added = r.qt.addCategory('咖啡');
  const dup = r.qt.addCategory('咖啡');
  const tooLong = r.qt.addCategory('这个名字明显超过八字符上限');
  results.push(['v6 分类：默认值 + 新增 + 去重 + 长度上限',
    defOk && added.ok === true && r.qt.getCategories().indexOf('咖啡') >= 0
    && dup.ok === false && tooLong.ok === false && r.qt.getCategories().length === 7]);
}
// 11.2 重命名要同步改所有使用该分类的项目
{
  const r = bootWith(seedV5);
  const res = r.qt.renameCategory('饮食', '奶茶咖啡');
  const st = JSON.parse(r.store[MAIN_K]);
  const p1 = st.projects.find(x => x.id === 'a1');
  results.push(['v6 分类：重命名同步更新项目归属',
    res.ok === true && r.qt.getCategories().indexOf('奶茶咖啡') >= 0
    && r.qt.getCategories().indexOf('饮食') < 0 && p1.category === '奶茶咖啡']);
}
// 11.3 删除分类 → 项目回落未分类，且项目数与记录都不丢
{
  const r = bootWith(seedV5);
  const before = JSON.parse(r.store[MAIN_K]).projects.length;
  const res = r.qt.deleteCategory('饮食');
  const st = JSON.parse(r.store[MAIN_K]);
  const p1 = st.projects.find(x => x.id === 'a1');
  results.push(['v6 分类：删除后项目回落未分类且不丢项目',
    res.ok === true && r.qt.getCategories().indexOf('饮食') < 0
    && p1.category === '' && st.projects.length === before]);
}
// 11.4 自定义分类必须能被迁移管道保留（这是初始化顺序 bug 的回归断言）
// 判别依据必须是"分类小标渲染出来"，而不是"项目名渲染出来" —— 项目名与分类存活无关，
// 早期版本用项目名做断言时，即便分类被误清空也照样通过（反向验证抓到的假通过）
{
  const custom = JSON.stringify({ v: 6, categories: ['咖啡', '夜间'],
    projects: [mkProj('c1', '戒咖啡', '☕', '咖啡', 0)] });
  const r = bootWith({ [MAIN_K]: custom, [BAK_K]: custom });
  const st = JSON.parse(r.store[MAIN_K]);
  results.push(['v6 分类：自定义分类经迁移保留（不依赖 state 初始化顺序）',
    r.err === null && r.qt.getCategories().join(',') === '咖啡,夜间'
    && st.projects[0].category === '咖啡'
    && r.main.innerHTML.indexOf('cat-chip') >= 0
    && r.main.innerHTML.indexOf('>咖啡<') >= 0]);
}
// 11.5 非法分类归属归一化为未分类，且不抛异常
// 注：迁移结果只在内存中，store 要等下一次 saveState 才写回（设计如此），所以用渲染结果验证
{
  const bad = JSON.stringify({ v: 6, categories: ['咖啡'],
    projects: [mkProj('d1', 'X', '🚭', '不存在的分类', 0)] });
  const r = bootWith({ [MAIN_K]: bad, [BAK_K]: bad });
  results.push(['v6 分类：非法归属归一化为未分类（渲染无分类小标）',
    r.err === null && r.main.innerHTML.indexOf('cat-chip') < 0
    && r.main.innerHTML.indexOf('>X<') >= 0]); // 项目本身仍在
}
// 11.6 恢复默认：清理"幽灵分类"归属
{
  const custom = JSON.stringify({ v: 6, categories: ['咖啡'],
    projects: [mkProj('c1', '戒咖啡', '☕', '咖啡', 0)] });
  const r = bootWith({ [MAIN_K]: custom, [BAK_K]: custom });
  r.qt.resetCategories();
  const st = JSON.parse(r.store[MAIN_K]);
  results.push(['v6 分类：恢复默认并清理幽灵分类',
    r.qt.getCategories().length === 6 && st.projects[0].category === '']);
}
// 11.6b 重命名「当前正在筛选的分类」→ 首页筛选态必须跟随
// 回归：renameCategory 曾漏同步 listFilter（deleteCategory / resetCategories 都处理了），
// 改名后首页直接变空列表 —— 项目其实还在，只是筛选取了一个已不存在的分类名
{
  const seed = JSON.stringify({ v: 6, categories: ['饮食', '作息'],
    projects: [mkProj('f1', '戒奶茶', '🧋', '饮食', 0), mkProj('f2', '戒熬夜', '😴', '作息', 1)] });
  const r = bootWith({ [MAIN_K]: seed, [BAK_K]: seed });
  r.qt.goHome();
  r.qt.setListFilter('饮食');
  const onlyFirst = r.main.innerHTML.indexOf('戒奶茶') >= 0 && r.main.innerHTML.indexOf('戒熬夜') < 0;
  r.qt.renameCategory('饮食', '餐饮');
  // 未再手动 goHome()：分类变更应自行触发首页重绘
  const afterRename = r.main.innerHTML.indexOf('戒奶茶') >= 0 && r.main.innerHTML.indexOf('戒熬夜') < 0;
  const st = JSON.parse(r.store[MAIN_K]);
  results.push(['v6 分类：重命名当前筛选分类后列表不为空（筛选态跟随 + 自动重绘）',
    onlyFirst && afterRename && st.projects[0].category === '餐饮']);
}
// 11.7 sanitizeCategories 的边界：去空 / 去重 / 截断 / 上限
{
  const r = bootWith(seedV5);
  const f = r.qt.sanitizeCategories;
  const out = f(['  A  ', 'A', '', null, 123, 'A', 'B']);
  results.push(['v6 分类：sanitize 去空去重截断',
    out.join('|') === 'A|B' && f('not-an-array').length === 0 && f([]).length === 0]);
}

// 输出
let pass = 0;
results.forEach(([name, ok]) => {
  console.log((ok ? '✅' : '❌') + ' ' + name);
  if (ok) pass++;
});
console.log(`\n${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
