/* 弹窗交互测试（零依赖）
 *
 * 为什么单独一个文件：tests/smoke-test.js 的 stub DOM 里 querySelector 恒返回 null，
 * 因此"弹窗挂载后的内部逻辑"完全不可达 —— 分类管理入口缺失、选择器不刷新这类
 * 缺陷能在 55/55 全绿的情况下漏过去。这里补一层「按 selector 缓存的元素代理」，
 * 让 showModal 的 onMount 回调真正执行，从而驱动弹窗内部交互。
 *
 * 覆盖：分类选择器自带的新建 / 管理入口、内联新建链路、失败时保留输入态。
 * 更深一层的真实浏览器端到端见 tests/browser-picker.js。
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

const results = [];

// ---- 元素代理：同一 selector 多次查询返回同一对象，便于读取其 innerHTML ----
let proxies = new Map();
function makeEl(tag) {
  return {
    tagName: tag || 'div',
    innerHTML: '', textContent: '', value: '', checked: false,
    style: {}, className: '', dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, getAttribute() { return null; },
    removeAttribute() {},
    _handlers: {},
    addEventListener(type, fn) { this._handlers[type] = fn; },
    removeEventListener() {},
    appendChild() {}, remove() {}, focus() {}, click() {},
    querySelector(sel) { return proxy(sel); },
    querySelectorAll() { return []; }
  };
}
function proxy(sel) {
  if (!proxies.has(sel)) proxies.set(sel, makeEl());
  return proxies.get(sel);
}
function clickOn(sel) {
  const el = proxies.get(sel);
  if (!el || !el._handlers.click) return false;
  el._handlers.click();
  return true;
}
// 触发任意类型的事件处理器（导入链路走 change，不走 click）
function fire(sel, type, ev) {
  const el = proxies.get(sel);
  if (!el || !el._handlers[type]) return false;
  el._handlers[type](ev || {});
  return true;
}
// FileReader 桩：同步回调 onload（批次 2 导入链路测试用）
function FileReaderStub() { this.onload = null; }
FileReaderStub.prototype.readAsText = function (file) {
  this.onload({ target: { result: file.content } });
};

function boot(seedObj, opts) {
  opts = opts || {};
  proxies = new Map();
  const store = Object.assign({}, seedObj || {});
  const main = makeEl();
  const body = makeEl();
  const doc = {
    readyState: 'complete',
    documentElement: { setAttribute() {}, getAttribute() { return 'light'; } },
    body,
    getElementById: () => main,
    querySelector: (s) => proxy(s),
    querySelectorAll: () => [],
    createElement: makeEl,
    addEventListener() {},
    activeElement: null
  };
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const win = {
    scrollTo(o) { win._lastScroll = o; }, // 滚动记忆断言用：记录最后一次 scrollTo 参数
    pageYOffset: 0,
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { hash: '', search: opts.search || '' },
    navigator: {}, document: doc, localStorage: ls,
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout
  };
  const sb = {
    window: win, document: doc, localStorage: ls,
    navigator: {}, location: win.location, console, setTimeout, clearTimeout,
    setInterval: () => 1, clearInterval() {},
    FileReader: FileReaderStub,
    Date, Math, JSON, Array, Object, String, Number, isNaN, parseInt
  };
  vm.createContext(sb);
  let err = null;
  try { vm.runInContext(code, sb); } catch (e) { err = e; }
  return { qt: win.__qt, store, main, err, win };
}

const SEED = JSON.stringify({
  v: 6, categories: ['饮食', '烟酒'],
  projects: [{
    id: 'p1', name: '戒奶茶', emoji: '🧋', category: '饮食', goalDays: 30,
    private: false, eyeOpen: false, order: 0, bestStreak: 0,
    records: [{ id: 'r1', t: Date.now() - 86400000, n: '', tags: [] }], reviews: []
  }]
});
const STORE = { 'quit-tracker-v1': SEED, 'quit-tracker-v1.bak': SEED };
function fresh() { return boot(STORE); }

// ---------- 1. 加载与初始化 ----------
{
  const r = fresh();
  results.push(['加载不抛异常', r.err === null, r.err ? r.err.message : '']);
  results.push(['__qt 暴露分类管理 API',
    !!r.qt && ['getCategories', 'addCategory', 'renameCategory', 'deleteCategory', 'resetCategories']
      .every(k => typeof r.qt[k] === 'function')]);
}

// ---------- 2. 编辑已有项目：分类选择器必须自带管理入口 ----------
{
  const r = fresh();
  r.qt.openEditProject('p1');
  const html = (proxies.get('#qt-cat') || {}).innerHTML || '';
  results.push(['编辑弹窗：选择器含「＋ 新建」入口', html.indexOf('qt-cat-new-btn') >= 0]);
  results.push(['编辑弹窗：选择器含「管理」入口', html.indexOf('qt-cat-manage-btn') >= 0]);
  results.push(['编辑弹窗：已有分类与当前选中都在', html.indexOf('饮食') >= 0 && html.indexOf('selected') >= 0]);
}

// ---------- 3. 新建项目：同样自带入口（用户要求"新增项目也能设置"）----------
{
  const r = fresh();
  r.qt.openNewProject();
  const html = (proxies.get('#qt-cat') || {}).innerHTML || '';
  results.push(['新建弹窗：同样含「＋ 新建」与「管理」入口',
    html.indexOf('qt-cat-new-btn') >= 0 && html.indexOf('qt-cat-manage-btn') >= 0]);
}

// ---------- 4. 点「＋ 新建」→ 内联输入态 ----------
{
  const r = fresh();
  r.qt.openEditProject('p1');
  const clicked = clickOn('#qt-cat-new-btn');
  const html = (proxies.get('#qt-cat') || {}).innerHTML || '';
  results.push(['点「＋ 新建」→ 切到内联输入态',
    clicked && html.indexOf('qt-cat-inline') >= 0
    && html.indexOf('qt-cat-inline-ok') >= 0 && html.indexOf('qt-cat-inline-cancel') >= 0]);
}

// ---------- 5. 输入 → 添加：落盘 + 自动选中 + 入口恢复 ----------
{
  const r = fresh();
  r.qt.openEditProject('p1');
  clickOn('#qt-cat-new-btn');
  proxies.get('#qt-cat-inline').value = '宵夜';
  const ok = clickOn('#qt-cat-inline-ok');
  const cats = JSON.parse(r.store['quit-tracker-v1']).categories;
  const html = (proxies.get('#qt-cat') || {}).innerHTML || '';
  results.push(['内联新建：分类已写入 state.categories',
    ok && cats.indexOf('宵夜') >= 0, 'categories=' + cats.join(',')]);
  results.push(['内联新建：新分类被自动选中且入口恢复',
    html.indexOf('宵夜') >= 0 && html.indexOf('qt-cat-new-btn') >= 0 && html.indexOf('qt-cat-inline') < 0]);
}

// ---------- 6. 失败时保留输入态（重复名 / 超长名）----------
{
  const r = fresh();
  r.qt.openEditProject('p1');
  clickOn('#qt-cat-new-btn');
  proxies.get('#qt-cat-inline').value = '饮食'; // 与已有分类重名
  clickOn('#qt-cat-inline-ok');
  const html = (proxies.get('#qt-cat') || {}).innerHTML || '';
  const cats = JSON.parse(r.store['quit-tracker-v1']).categories;
  results.push(['重复名被拒绝：仍在输入态且数据未污染',
    html.indexOf('qt-cat-inline') >= 0 && cats.length === 2, 'categories=' + cats.join(',')]);
}
{
  const r = fresh();
  r.qt.openEditProject('p1');
  clickOn('#qt-cat-new-btn');
  proxies.get('#qt-cat-inline').value = '这个名字明显超过八字的限制';
  clickOn('#qt-cat-inline-ok');
  const html = (proxies.get('#qt-cat') || {}).innerHTML || '';
  const cats = JSON.parse(r.store['quit-tracker-v1']).categories;
  results.push(['超长名被拒绝（不静默截断）：仍在输入态',
    html.indexOf('qt-cat-inline') >= 0 && cats.length === 2]);
}

// ---------- 7. 「管理」入口可点通（叠加弹窗不抛异常）----------
{
  const r = fresh();
  r.qt.openEditProject('p1');
  let err = null;
  try { clickOn('#qt-cat-manage-btn'); } catch (e) { err = e; }
  results.push(['点「管理」→ 打开分类管理不抛异常', err === null, err ? err.message : '']);
}

// ---------- 8. 管理弹窗用到的 CRUD 语义 ----------
// 「管理弹窗内的行点击 → 通知选择器刷新」这条链路依赖 querySelectorAll 解析，
// 假 DOM 无法可靠驱动，交由 tests/browser-picker.js 在真实浏览器里端到端覆盖。
{
  const r = fresh();
  const rn = r.qt.renameCategory('饮食', '餐饮');
  const st1 = JSON.parse(r.store['quit-tracker-v1']);
  results.push(['重命名：分类列表与项目归属同步更新',
    rn.ok === true && r.qt.getCategories().indexOf('餐饮') >= 0
    && r.qt.getCategories().indexOf('饮食') < 0 && st1.projects[0].category === '餐饮']);

  const del = r.qt.deleteCategory('餐饮');
  const st2 = JSON.parse(r.store['quit-tracker-v1']);
  // v7：夹具是 v6 形态（1 条"起点"记录），迁移后该记录变成 startTs，records 归空。
  // 断言意图不变：项目与记录都不丢 —— 起点完整保留在 startTs。
  results.push(['删除：项目回落未分类（项目与记录都不丢）',
    del.ok === true && r.qt.getCategories().indexOf('餐饮') < 0
    && st2.projects[0].category === '' && st2.projects[0].records.length === 0
    && typeof st2.projects[0].startTs === 'number']);
}

// ---------- 9. 自动弹窗队列：多周期同时跨过不丢失（回归 BUG-S1，旧单槽 pendingAutoModal 会被最后一个覆盖） ----------
{
  const r = fresh();
  const p = JSON.parse(r.store['quit-tracker-v1']).projects[0];
  r.qt.checkReviewTick(p, { d: 20 }); // 20 天同时跨过 3/7/15 三个周期
  results.push(['自动弹窗队列：3 周期跨过 → 首个弹出 + 2 个排队（旧单槽实现此处只剩 1）',
    r.qt.pendingAutoModalCount() === 2, 'queue=' + r.qt.pendingAutoModalCount()]);
  results.push(['自动弹窗队列：三个周期全部标记 seenReviewCycles',
    p.seenReviewCycles.join(',') === '3,7,15']);
}

// ---------- 10. 目标天数上限：>3650 在 JS 层拒绝（回归 BUG-E2，input max 可被手输绕过） ----------
{
  const r = fresh();
  r.qt.openNewProject();
  proxies.get('#qt-name').value = '测试上限';
  proxy('#qt-goal').value = '99999'; // #qt-goal 在点击保存前不会被 app 查询，需用工厂显式预建代理
  clickOn('#qt-save-btn');
  const st = JSON.parse(r.store['quit-tracker-v1']);
  results.push(['目标上限：新建 99999 天被拒绝，不落库',
    st.projects.length === 1, 'projects=' + st.projects.length]);
}
{
  const r = fresh();
  r.qt.openNewProject();
  proxies.get('#qt-name').value = '边界值';
  proxy('#qt-goal').value = '3650';
  clickOn('#qt-save-btn');
  const st = JSON.parse(r.store['quit-tracker-v1']);
  results.push(['目标上限：3650 天边界值放行并落库',
    st.projects.length === 2 && st.projects[1].goalDays === 3650]);
}
{
  const r = fresh();
  r.qt.openEditProject('p1');
  proxies.get('#qt-name').value = '改名尝试';
  proxy('#qt-goal').value = '99999';
  clickOn('#qt-save-btn');
  const st = JSON.parse(r.store['quit-tracker-v1']);
  results.push(['目标上限：编辑弹窗 99999 天被拒绝，名称与目标均未变',
    st.projects[0].name === '戒奶茶' && st.projects[0].goalDays === 30]);
}

// ---------- 11. 导入链路（回归 BUG-D1）：FileReader 桩 + change 事件直驱 ----------
const mkBackup = (cats, proj) => JSON.stringify({ v: 6, categories: cats, projects: [proj] });
function importBackup(r, content, mode) {
  r.qt.openSettings();
  clickOn('#qt-import');
  fire('#qt-import-file', 'change', { target: { files: [{ content: content }] } });
  clickOn(mode === 'overwrite' ? '#qt-overwrite' : '#qt-merge');
}
{
  const r = fresh();
  importBackup(r, mkBackup(['饮食', '咖啡'], { id: 'bk1', name: '备份项目', emoji: '🧋', category: '咖啡', order: 0, goalDays: 0,
    records: [{ id: 'bk1r0', t: Date.now(), n: '', tags: [] }], reviews: [] }), 'merge');
  const st = JSON.parse(r.store['quit-tracker-v1']);
  results.push(['导入合并：备份自定义分类并入列表，项目归属不再被归一化掉',
    st.categories.indexOf('咖啡') >= 0 && st.projects.some(p => p.id === 'bk1' && p.category === '咖啡'),
    'categories=' + st.categories.join(',')]);
}
{
  const r = fresh();
  importBackup(r, mkBackup(['饮食', '咖啡'], { id: 'bk2', name: '覆盖项目', emoji: '🧋', category: '咖啡', order: 0, goalDays: 0,
    records: [{ id: 'bk2r0', t: Date.now(), n: '', tags: [] }], reviews: [] }), 'overwrite');
  const st = JSON.parse(r.store['quit-tracker-v1']);
  results.push(['导入覆盖：categories 采用备份列表（旧实现从不消费）',
    st.categories.join(',') === '饮食,咖啡']);
  results.push(['导入覆盖：.map(migrateProject) 传参缺陷已修（自定义归属保留）',
    st.projects.length === 1 && st.projects[0].category === '咖啡']);
}
// ---------- 12. 演示模式补锁导入/清空（回归 BUG-P1） ----------
{
  const r = boot({ 'quit-tracker-v1': SEED, 'quit-tracker-v1.bak': SEED, 'quit-tracker-demo': '1' });
  r.qt.openSettings();
  clickOn('#qt-wipe');
  results.push(['演示模式：点清空 → 确认弹窗不出现', !proxies.has('#qt-wipe-confirm')]);
  importBackup(r, mkBackup(['饮食'], { id: 'bk3', name: 'X', emoji: '🧋', category: '饮食', order: 0, goalDays: 0,
    records: [{ id: 'bk3r0', t: Date.now(), n: '', tags: [] }], reviews: [] }), 'merge');
  const st = JSON.parse(r.store['quit-tracker-v1']);
  results.push(['演示模式：change 直驱导入被守卫拦截，数据未变',
    st.projects.length === 1 && st.categories.length === 2, 'projects=' + st.projects.length]);
}

// ---------- 13. 配色方案切换（accent 持久化） ----------
{
  const r = fresh();
  r.qt.openSettings();
  clickOn('#qt-accent-ocean');
  results.push(['配色：点海盐蓝 → ACCENT_KEY 持久化为 ocean',
    r.store['quit-tracker-accent'] === 'ocean', 'store=' + r.store['quit-tracker-accent']]);
  clickOn('#qt-accent-teal');
  clickOn('#qt-accent-green');
  results.push(['配色：切回 Spotify 绿 → 持久化为 green（默认）',
    r.store['quit-tracker-accent'] === 'green']);
}

// ---------- 14. 首页滚动位置记忆 ----------
{
  const r = fresh();
  r.win.pageYOffset = 500;
  r.qt.openDetail('p1');
  results.push(['滚动记忆：进详情时先滚回顶部', !!r.win._lastScroll && r.win._lastScroll.top === 0,
    'top=' + (r.win._lastScroll || {}).top]);
  r.qt.goHome();
  results.push(['滚动记忆：返回首页恢复离开时的 500px', !!r.win._lastScroll && r.win._lastScroll.top === 500,
    'top=' + (r.win._lastScroll || {}).top]);
}

// ============ A-3 批次（交互与反馈）新增断言 ============
// 15.1 N-01：搜索框与结果行必须是两个独立节点（否则防抖重绘会把输入框连同监听器一起换掉）
{
  const r = fresh();
  const p = JSON.parse(r.store['quit-tracker-v1']).projects[0];
  const listHtml = r.qt.renderHistoryList(p);
  results.push(['A-3 N-01：搜索框与结果行分离（输入框不在结果容器内）',
    listHtml.indexOf('id="qt-search"') >= 0 && listHtml.indexOf('id="qt-history-rows"') >= 0
    && listHtml.indexOf('qt-history-rows') > listHtml.indexOf('id="qt-search"')]);
  // 结果行渲染函数不得包含搜索框
  results.push(['A-3 N-01：结果行渲染不含搜索框',
    r.qt.renderHistoryRows(p).indexOf('id="qt-search"') < 0]);
}
// 15.2 N-01：二次搜索仍生效（detailSearch 变化后结果行内容随之变化）
{
  const r = fresh();
  const p = JSON.parse(r.store['quit-tracker-v1']).projects[0];
  r.qt.setDetailSearch('');
  const all = r.qt.renderHistoryRows(p);
  r.qt.setDetailSearch('不存在的关键词');
  const none = r.qt.renderHistoryRows(p);
  results.push(['A-3 N-01：搜索词变化后结果行内容随之变化',
    all.indexOf('history-item') >= 0 && none.indexOf('history-item') < 0
    && none.indexOf('没有匹配的记录') >= 0]);
}
// 15.3 N-02：删除记录后弹窗栈必须收回到调用前深度（不留幽灵编辑弹窗）
{
  // 用 v7 夹具（v6 的唯一记录会被迁移成 startTs，就没有可编辑的破戒记录了）
  const v7 = JSON.stringify({ v: 7, categories: ['饮食', '烟酒'], projects: [{
    id: 'n2', name: '幽灵弹窗', emoji: '🧋', category: '饮食', order: 0,
    startTs: Date.now() - 5 * 86400000,
    records: [{ id: 'n2r', t: Date.now() - 2 * 86400000, n: '', tags: [] }],
    reviews: [], bestStreak: 0, goalDays: 0, private: false, eyeOpen: false,
    seenMilestones: [], seenReviewCycles: [], dismissedReviewBanner: null, createdAt: Date.now() - 5 * 86400000
  }] });
  const r = boot({ 'quit-tracker-v1': v7, 'quit-tracker-v1.bak': v7 });
  r.qt.openEditRecord('n2', 'n2r');          // 栈深 1
  const before = r.qt.modalDepth();
  r.qt.confirmDeleteRecord('n2', 'n2r');     // 栈深 2
  const stacked = r.qt.modalDepth();
  const ok = clickOn('#qt-confirm');         // 模拟点击确认删除
  const after = r.qt.modalDepth();
  results.push(['A-3 N-02：编辑记录内删除后弹窗栈归零',
    before === 1 && stacked === 2 && ok && after === 0,
    'before=' + before + ' stacked=' + stacked + ' after=' + after]);
}
// 15.4 N-02：删除复盘后弹窗栈同样归零
{
  const v7 = JSON.stringify({ v: 7, categories: ['饮食'], projects: [{
    id: 'n3', name: '幽灵复盘', emoji: '🧋', category: '', order: 0,
    startTs: Date.now() - 5 * 86400000, records: [], reviews: [], bestStreak: 0,
    goalDays: 0, private: false, eyeOpen: false, seenMilestones: [],
    seenReviewCycles: [], dismissedReviewBanner: null, createdAt: Date.now() - 5 * 86400000
  }] });
  const r = boot({ 'quit-tracker-v1': v7, 'quit-tracker-v1.bak': v7 });
  r.qt.addReview('n3', 3, '成就', '不足', '计划');
  const st = JSON.parse(r.store['quit-tracker-v1']);
  const rid = st.projects[0].reviews[0].id;
  r.qt.openEditReview('n3', rid);         // 栈深 1
  r.qt.confirmDeleteReview('n3', rid);    // 栈深 2
  const stacked = r.qt.modalDepth();
  const ok = clickOn('#qt-confirm');
  results.push(['A-3 N-02：编辑复盘内删除后弹窗栈归零',
    stacked === 2 && ok && r.qt.modalDepth() === 0,
    'stacked=' + stacked + ' after=' + r.qt.modalDepth()]);
}
// 15.5 A14：排序模式在只剩 1 个项目时仍可退出，且退出后恢复原筛选
{
  const r = fresh();
  r.qt.setListFilter('饮食');
  const filterBefore = r.qt.getListFilter();
  r.qt.toggleSortMode();
  const inSort = r.qt.isSortMode();
  const sortFilter = r.qt.getListFilter();
  r.qt.toggleSortMode();
  results.push(['A-3 A14：排序模式可退出且恢复原筛选',
    filterBefore === '饮食' && inSort === true && sortFilter === ''
    && r.qt.isSortMode() === false && r.qt.getListFilter() === '饮食',
    'before=' + filterBefore + ' inSort=' + inSort + ' restored=' + r.qt.getListFilter()]);
}
// 15.6 A14：只剩 1 个项目时首页仍渲染"完成"按钮（否则排序模式死锁）
{
  const one = JSON.stringify({ v: 7, categories: ['饮食'], projects: [{
    id: 'solo', name: '唯一项目', emoji: '🧋', category: '饮食', order: 0,
    startTs: Date.now() - 86400000, records: [], reviews: [], bestStreak: 0, goalDays: 0,
    private: false, eyeOpen: false, seenMilestones: [], seenReviewCycles: [],
    dismissedReviewBanner: null, createdAt: Date.now() - 86400000
  }] });
  const r = boot({ 'quit-tracker-v1': one, 'quit-tracker-v1.bak': one });
  r.qt.toggleSortMode();
  const html = r.main.innerHTML;
  results.push(['A-3 A14：仅 1 个项目时排序模式仍可退出',
    r.qt.isSortMode() === true && html.indexOf('完成') >= 0]);
}
// 15.7 N-12：隐私项目模糊态下拒绝打开"记录破戒"弹窗（防明文泄露名称与时长）
{
  const priv = JSON.stringify({ v: 7, categories: ['饮食'], projects: [{
    id: 'pv', name: '隐私项目', emoji: '🔒', category: '', order: 0,
    startTs: Date.now() - 86400000, records: [], reviews: [], bestStreak: 0, goalDays: 0,
    private: true, eyeOpen: false, seenMilestones: [], seenReviewCycles: [],
    dismissedReviewBanner: null, createdAt: Date.now() - 86400000
  }] });
  const r = boot({ 'quit-tracker-v1': priv, 'quit-tracker-v1.bak': priv });
  const depthBefore = r.qt.modalDepth();
  r.qt.openAddRecord('pv');
  results.push(['A-3 N-12：隐私项目模糊态拒绝打开记录弹窗',
    r.qt.modalDepth() === depthBefore]);
}
// 15.8 A17：?demo=1 开启后必须重绘（首帧不得残留明文）
{
  const priv = JSON.stringify({ v: 7, categories: ['饮食'], projects: [{
    id: 'pv2', name: '隐私项目2', emoji: '🔒', category: '', order: 0,
    startTs: Date.now() - 86400000, records: [], reviews: [], bestStreak: 0, goalDays: 0,
    private: true, eyeOpen: true, seenMilestones: [], seenReviewCycles: [],
    dismissedReviewBanner: null, createdAt: Date.now() - 86400000
  }] });
  const r = boot({ 'quit-tracker-v1': priv, 'quit-tracker-v1.bak': priv }, { search: '?demo=1' });
  results.push(['A-3 A17：?demo=1 首帧即模糊（已重绘）',
    r.qt._isDemoMode() === true && r.main.innerHTML.indexOf('is-blurred') >= 0]);
}
// 15.9 A13：恢复默认分类必须走二次确认（不得直接执行）
{
  const r = fresh();
  r.qt.openSettings();
  clickOn('#qt-cat-manage');            // 打开分类管理
  const depthBefore = r.qt.modalDepth();
  clickOn('#qt-cat-reset');             // 点"恢复默认"→ 应弹出确认而不是直接执行
  const depthAfter = r.qt.modalDepth();
  const cats = JSON.parse(r.store['quit-tracker-v1']).categories;
  results.push(['A-3 A13：恢复默认分类先弹确认（未直接执行）',
    depthAfter === depthBefore + 1 && cats.join('|') === '饮食|烟酒',
    'depth ' + depthBefore + '→' + depthAfter + ' cats=' + cats.join('|')]);
}

// ---------- 输出 ----------
let pass = 0;
results.forEach(([name, ok, detail]) => {
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? '   → ' + detail : ''));
  if (ok) pass++;
});
console.log('\n' + pass + '/' + results.length + ' 通过');
process.exit(pass === results.length ? 0 : 1);
