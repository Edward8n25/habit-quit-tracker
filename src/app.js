/* =========================================================================
   戒断 · Quit Tracker
   - 所有数据存 localStorage
   - 戒断计数器：每次"破戒"时新增一条记录，从最新记录时间开始计时
   ========================================================================= */

(function () {
  'use strict';

  // ---------- 常量 ----------
  var STORAGE_KEY = 'quit-tracker-v1';
  var STORAGE_BACKUP_KEY = 'quit-tracker-v1.bak'; // 双 key 冗余：主 key 损坏时可回退备份
  var THEME_KEY = 'quit-tracker-theme';
  var ACCENT_KEY = 'quit-tracker-accent'; // 配色方案（设置内切换）：green | ocean | teal | sunset，默认 green
  var ACCENT_LIST = ['green', 'ocean', 'teal', 'sunset'];
  var DEMO_KEY = 'quit-tracker-demo'; // 对外展示模式（全局开关，持久化：跨刷新保持隐藏，防演示时误刷新泄露）
  var SCHEMA_VERSION = 6; // v6: 顶层加 categories（分类列表，用户可增删改）
  var APP_VERSION = '1.0.0'; // 产品版本（口径：1.0.0 前均为开发期 0.x；与 CHANGELOG 对应，与 schema 版本相互独立）

  // 通用常量（集中定义，避免魔法数字散落）
  var DAY_MS = 86400000;
  var HOUR_MS = 3600000;
  var FUTURE_TOLERANCE_MS = 60000;    // 未来时间容差（输入控件默认值是当前时刻，允许 1 分钟偏差）
  var TOAST_DURATION = 2200;          // toast 显示时长
  var TICK_INTERVAL = 1000;           // ticker 刷新间隔
  var SEARCH_DEBOUNCE = 120;          // 搜索防抖
  var BANNER_DISMISS_DAYS = 3;        // 复盘横幅"忽略"后不再提示的天数
  var REVIEW_PROMPT_DELAY = 700;      // 新建项目后复盘提示延迟（避免与里程碑弹窗同框）

  // 项目分类（v5 引入，v6 起可自定义）：单选；'' = 未分类
  // 数组顺序 = 首页筛选胶囊的展示顺序；首次启动或迁移时用默认值填充
  var DEFAULT_CATEGORIES = ['饮食', '烟酒', '数字娱乐', '作息', '购物', '其他'];
  var MAX_CATEGORY_LEN = 8;     // 单个分类名长度上限（胶囊宽度约束）
  var MAX_CATEGORIES = 12;      // 分类数量上限（避免筛选栏过长）
  var FILTER_ALL = '';          // 首页筛选：全部
  var FILTER_NONE = '__none__'; // 首页筛选：未分类

  // 习惯戒断相关 emoji（按场景分类 + 运行时去重）
  var EMOJI_LIST = [
    // 🚬 烟酒相关
    '🚭','🚬','🚯','🍺','🍻','🥃','🍷','🥂','🍶','🍸','🍹','🍾',
    '🧊','🥤','🧃','🧋','☕','🍵','🫖',
    // 🍔 高热量/快餐/烧烤
    '🍔','🍕','🍟','🌭','🍿','🥓','🥩','🍗','🍖','🌮','🌯','🫔',
    '🥙','🧆','🥪','🍳','🍲','🍱','🍣','🍤','🍥','🍙','🍚','🍜',
    '🍝','🍠','🥟','🥠','🥡','🍢','🍡','🧂',
    '🥘','🍲','🥣','🥄','🍴','🥢','🍻','🥩','🥓','🍖',
    // 🍰 甜食零食
    '🍰','🎂','🧁','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🍦','🍨',
    '🥧','🥮','🥨','🥯','🥞','🧇','🥐','🍞','🥖','🫓','🥜','🌰',
    // 🍎 水果
    '🍎','🍏','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑',
    '🥭','🍍','🥥','🥝','🍐','🍅',
    // 🥦 蔬菜
    '🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍄',
    '🥗','🥑','🍆','🫛','🫘',
    // 🎮 屏幕/娱乐/游戏
    '🎮','🕹️','📱','💻','🖥️','⌨️','🖱️','📺','📷','🎥','📻',
    '🎧','🎵','🎶','🎤','🎸','🥁','🎬','🎭','🎨','🎰','🎲','🎯',
    '🃏','🎴','🎪','🎢','🎡','🎠',
    // 🌐 社交/上网
    '💬','💭','🗨️','📢','📣','📰','📖','📚','📝','✏️','📌',
    '📎','🔗','📡','🌐',
    // 💸 消费/购物
    '💸','💰','💵','💳','🛒','🛍️','🏷️','💎','🪙','💴','💶',
    '💷','🧾','🛒',
    // 🛏️ 睡眠/作息
    '🛏️','🛌','😴','💤','⏰','🕐','🌙','🌃','🌅','🌄','☀️','🌞',
    '🌜','🌛',
    // 🏃 运动/健康
    '🏃','🚴','🏋️','🤸','🧘','🏊','⚽','🏀','🎾','🏐','🏓','🏸',
    '🥊','🤾','⛹️','🤺','🎣','🥏','🛹','🛷','⛸️','🥎','🏌️','🏇',
    // 😡 情绪/冲动管理
    '😡','🤬','😤','😠','😭','😢','🥺','😞','😔','😟','😕','🙁',
    '😣','😖','😫','😩','😵','🤯','😳','🥵','🥶','😱','😨','😰',
    // 💊 药物/健康
    '💊','💉','🩺','🩹','🧬','🦠','🧪','⚗️','🧴',
    // 🧠 心理/冥想
    '🧠','🕉️','☯️','🕯️','🌸','🌺','🌻','🌷','🌹','🌼','🪷',
    // 💼 行为/工作
    '💼','📁','📂','📅','📆','🗓️','⏳','⌛','🔒','🔓','🔑','🚪',
    // 🚗 出行
    '✈️','🚗','🛵','🚲','🛴','⛺','🎒','🧳','🌍','🌎','🌏',
    // 🌟 庆祝/成就
    '⭐','🌟','✨','💫','🔥','💥','⚡','🌈','🏆','🥇','🥈',
    '🥉','🎖️','🏅','👑','💯','💪','🙏','❤️','💚','💙','💛','💜',
    '🤍','🖤','🤎'
  ];
  // 运行时去重
  EMOJI_LIST = Array.from(new Set(EMOJI_LIST));

  // 破戒原因标签（A1：可多选，可选填）
  var RELAPSE_REASONS = ['工作压力', '社交场合', '情绪低落', '习惯性动作', '无聊', '奖励自己', '生理需求', '其他'];

  // ---------- 数据层 ----------
  var state = loadState();

  // 数据迁移：把任意版本的 project 归一化到当前 schema（幂等，加载/导入共用）
  // 约定：绝不因 schema 不匹配直接清空用户数据
  // ⚠️ cats 必须由调用方显式传入：迁移发生在 `var state = loadState()` 赋值期间，
  //    此刻 state 还是 undefined，绝不能从 state 里读分类列表（否则会静默降级为空态）
  // id 白名单：只放行 [\w-]（uid() 的字符域）。导入数据的 id 会被拼进 onclick 与 data-* 属性，
  // 任意字符都是注入面（批次 2 BUG-D2）；不合规一律重生成
  function safeId(v) {
    return (typeof v === 'string' && /^[\w-]+$/.test(v)) ? v : uid();
  }

  function migrateProject(p, cats) {
    var valid = Array.isArray(cats) && cats.length ? cats : DEFAULT_CATEGORIES;
    if (!p || typeof p !== 'object') return null;
    p.id = safeId(p.id);
    if (typeof p.name !== 'string') p.name = '';
    if (typeof p.emoji !== 'string') p.emoji = '🚭';
    if (!Array.isArray(p.records)) p.records = [];
    // 旧格式：纯数字 records 升级为 {id, t, n} 对象
    p.records = p.records.map(function (r) {
      if (typeof r === 'number') return { id: uid(), t: r, n: '', tags: [] };
      if (r && typeof r === 'object' && typeof r.t === 'number') {
        r.id = safeId(r.id);
        if (typeof r.n !== 'string') r.n = '';
        if (!Array.isArray(r.tags)) r.tags = []; // v3：破戒原因标签
        return r;
      }
      return null;
    }).filter(Boolean).sort(function (a, b) { return a.t - b.t; });
    if (!Array.isArray(p.reviews)) p.reviews = [];
    p.reviews = p.reviews.filter(function (r) { return r && typeof r === 'object'; }).map(function (r) {
      r.id = safeId(r.id); // reviews[].id 同样会拼进 data-rid 与 onclick
      var cd = Number(r.cycleDays);
      r.cycleDays = isFinite(cd) ? cd : 0; // 非数字 cycleDays 曾可原样进 HTML（BUG-D2）
      return r;
    });
    if (!Array.isArray(p.seenMilestones)) p.seenMilestones = [];
    if (!Array.isArray(p.seenReviewCycles)) p.seenReviewCycles = [];
    if (typeof p.bestStreak !== 'number') p.bestStreak = 0;
    if (typeof p.goalDays !== 'number' || isNaN(p.goalDays) || p.goalDays < 0) p.goalDays = 0; // v3：目标坚持天数（0 = 未设置）
    if (typeof p.private !== 'boolean') p.private = false; // v4：隐私项目（列表/详情默认模糊）
    if (typeof p.eyeOpen !== 'boolean') p.eyeOpen = false; // v4：眼睛是否睁开（true=清晰 / false=模糊）
    // v5：项目分类（单选）。只接受目标分类列表内的值，其余归一化为"未分类"
    if (typeof p.category !== 'string' || valid.indexOf(p.category) === -1) p.category = '';
    // v5：自定义排序。未设置过的一律为 0，此时按数组原顺序稳定排序（老用户观感不变）
    if (typeof p.order !== 'number' || isNaN(p.order)) p.order = 0;
    if (!p.dismissedReviewBanner || typeof p.dismissedReviewBanner !== 'object') {
      p.dismissedReviewBanner = null;
    }
    if (typeof p.createdAt !== 'number') {
      p.createdAt = p.records.length ? recordTs(p.records[0]) : Date.now();
    }
    recalcBest(p);
    return p;
  }

  // 读取 localStorage 单键（部分浏览器隐私模式下 getItem 会抛异常）
  function readKey(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }

  // 安全解析：JSON 解析失败 / 结果为 null / 非对象 一律归一化为 null（不抛异常）
  // 关键：把"解析抛异常"和"解析成功但结构非法"归为同一种失败，备份回退才能覆盖全部损坏形态
  function safeParse(raw) {
    if (!raw) return null;
    try {
      var d = JSON.parse(raw);
      return (d && typeof d === 'object' && !Array.isArray(d)) ? d : null;
    } catch (e) { return null; }
  }

  // 空态（含 v6 的默认分类），保证任何路径返回的 state 结构都完整
  function emptyState() {
    return { v: SCHEMA_VERSION, projects: [], categories: DEFAULT_CATEGORIES.slice() };
  }

  function loadState() {
    var rawMain = readKey(STORAGE_KEY);
    var data = safeParse(rawMain);
    var recovered = false;
    if (!data) {
      // 主 key 缺失或损坏（含 JSON 解析失败）→ 回退备份
      data = safeParse(readKey(STORAGE_BACKUP_KEY));
      if (data) recovered = true;
    }
    if (!data) {
      if (rawMain) setTimeout(function () { toast('本地数据读取失败，已重置'); }, 0);
      return emptyState();
    }
    try {
      // v6：分类列表必须先于项目迁移确定 —— 项目迁移要用它校验分类归属，
      // 且此刻 `state` 尚未赋值（本函数正在为 state 求值），不能从 state 里读
      data.categories = sanitizeCategories(data.categories);
      if (!data.categories.length) data.categories = DEFAULT_CATEGORIES.slice();
      if (!Array.isArray(data.projects)) data.projects = [];
      // 任意版本数据都走迁移管道，再统一版本号；只有损坏数据才回退空态
      data.projects = data.projects.map(function (p) { return migrateProject(p, data.categories); }).filter(Boolean);
      data.v = SCHEMA_VERSION;
    } catch (e) {
      console.warn('Failed to migrate state', e);
      return emptyState();
    }
    if (recovered) {
      // 恢复成功后立刻写回主 key：否则下次加载会再走一遍恢复流程，且备份随时可能被后续写入覆盖
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
      setTimeout(function () {
        toast(rawMain ? '主数据损坏，已从备份恢复' : '已从备份恢复数据');
      }, 0);
    }
    return data;
  }

  function saveState() {
    var json = JSON.stringify(state);
    try {
      localStorage.setItem(STORAGE_KEY, json);         // 主 key
      localStorage.setItem(STORAGE_BACKUP_KEY, json);  // 备份 key（双写冗余防丢）
    } catch (e) {
      toast('保存失败：' + e.message);
    }
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function newProject(name, emoji, startTime, goalDays, isPrivate, category) {
    var start = typeof startTime === 'number' && !isNaN(startTime) ? startTime : Date.now();
    return {
      id: uid(),
      name: name.trim(),
      emoji: emoji || '🚭',
      category: normalizeCategory(category), // v5：项目分类（'' = 未分类）
      order: state.projects.length, // v5：自定义排序 —— 新项目追加到末尾
      records: [{ id: uid(), t: start, n: '', tags: [] }],   // 第一条：首次创建（起始计时，不计入破戒次数）
      reviews: [],          // 复盘记录：{id, cycleDays, ts, achievement, improvement, nextPlan}
      bestStreak: 0,        // 历史最长（ms）
      goalDays: typeof goalDays === 'number' && goalDays > 0 ? Math.floor(goalDays) : 0, // 目标坚持天数（0 = 未设置）
      private: !!isPrivate, // 隐私项目：列表/详情默认模糊，需睁眼查看
      eyeOpen: false,       // 眼睛开关（false=模糊 / true=清晰）
      seenMilestones: [],   // 已庆祝过的天数阈值
      seenReviewCycles: [], // 已提示过复盘的天数阈值
      dismissedReviewBanner: null, // 暂时关闭的复盘横幅（{cycle, until}）
      createdAt: Date.now()
    };
  }

  function getProject(id) {
    return state.projects.find(function (p) { return p.id === id; });
  }

  // ---------- 排序与筛选（v5） ----------
  // 按自定义顺序返回副本。order 全为 0 时依赖 Array.sort 的稳定性 → 保持数组原顺序（老用户观感不变）
  function sortedProjects() {
    return state.projects.slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
  }

  // 分类列表（用户可增删改，存 state.categories）
  // 防御：初始化期间 state 尚未赋值 → 返回空数组（迁移路径已改为显式传 cats，不依赖这里）
  function getCategories() {
    return (state && Array.isArray(state.categories)) ? state.categories : [];
  }

  // 分类名净化：去首尾空白 → 截断长度 → 去空 → 去重（保持原顺序）→ 限数量
  function sanitizeCategories(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (c) {
      if (typeof c !== 'string') return;
      var name = c.trim().slice(0, MAX_CATEGORY_LEN);
      if (!name || out.indexOf(name) >= 0) return;
      if (out.length >= MAX_CATEGORIES) return;
      out.push(name);
    });
    return out;
  }

  // 首页分类筛选：FILTER_ALL 不过滤；FILTER_NONE 只留未分类；其他值按分类精确匹配
  function filterProjects(list, filter) {
    if (!filter || filter === FILTER_ALL) return list;
    if (filter === FILTER_NONE) return list.filter(function (p) { return !p.category; });
    return list.filter(function (p) { return p.category === filter; });
  }

  // 当前实际出现过的分类（按 CATEGORIES 顺序），用于生成筛选胶囊（不显示空分类）
  function usedCategories() {
    return getCategories().filter(function (c) {
      return state.projects.some(function (p) { return p.category === c; });
    });
  }

  // 筛选态净化：分类被删除/改名后，落空的筛选回落"全部"（多标签同步、导入后都可能遇到）
  function sanitizeListFilter(f) {
    if (!f || f === FILTER_ALL) return FILTER_ALL;
    if (f === FILTER_NONE) return f;
    return getCategories().indexOf(f) >= 0 ? f : FILTER_ALL;
  }

  // 拖拽排序落点：把「排序后视图」里第 from 项移到第 to 项，并把全部 order 重排为 0..n-1（避免并列）
  function reorderProjects(from, to) {
    var list = sortedProjects();
    if (from < 0 || from >= list.length) return false;
    if (to < 0) to = 0;
    if (to > list.length - 1) to = list.length - 1;
    if (from === to) return false;
    var moved = list.splice(from, 1)[0];
    list.splice(to, 0, moved);
    list.forEach(function (p, i) { p.order = i; });
    saveState();
    return true;
  }

  // ---------- 隐私保护（v4） ----------
  // 对外展示模式：全局开关，持久化（演示中刷新页面仍保持隐藏，防泄露）
  function isDemoMode() {
    try { return localStorage.getItem(DEMO_KEY) === '1'; } catch (e) { return false; }
  }
  function setDemoMode(on) {
    try { localStorage.setItem(DEMO_KEY, on ? '1' : '0'); } catch (e) {}
  }
  // 隐私项目内容是否应模糊：
  // - 展示模式开启 → 一律模糊（即使眼睛已睁开，演示中强制隐藏）
  // - 平时 → 看眼睛：闭上(eyeOpen=false)模糊，睁开清晰
  function shouldBlur(p) {
    if (!p || !p.private) return false;
    if (isDemoMode()) return true;
    return !p.eyeOpen;
  }
  // 切换单项目眼睛（睁眼=清晰 / 闭眼=模糊）。展示模式下禁止睁眼（防误触泄露）
  function toggleEye(projectId) {
    var p = getProject(projectId);
    if (!p || !p.private) return;
    if (isDemoMode()) { toast('对外展示模式已开启，暂不能查看'); return; }
    p.eyeOpen = !p.eyeOpen;
    saveState();
    render();
    toast(p.eyeOpen ? '已睁眼查看' : '已闭眼隐藏');
  }
  // 隐私守卫：对外展示模式下，禁止打开任何会显示隐私项目内容的弹窗/操作
  // （编辑/记录/复盘/报告/删除确认里都会出现项目名与真实数据，演示时一律锁定）
  function guardPrivate(p) {
    if (p && p.private && isDemoMode()) {
      toast('对外展示模式中，隐私项目操作已锁定');
      return true;
    }
    return false;
  }
  // 全局对外展示模式开关
  function toggleDemoMode() {
    var on = !isDemoMode();
    if (on) {
      // 打开时若正停留在某个隐私项目详情页 → 强制回列表
      if (view === 'detail') {
        var cur = getProject(detailId);
        if (cur && cur.private) { view = 'list'; detailId = null; detailSearch = ''; }
      }
      setDemoMode(true);
      render();
      updateDemoBtn(true);
      toast('对外展示模式开启：隐私项目已隐藏');
    } else {
      setDemoMode(false);
      render();
      updateDemoBtn(false);
      toast('已退出对外展示模式');
    }
  }
  // 更新 Header 演示按钮视觉状态
  function updateDemoBtn(on) {
    var btn = document.getElementById('demo-btn');
    if (!btn) return;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-label', on ? '退出对外展示模式' : '对外展示模式');
    btn.title = on ? '对外展示模式已开启（点击退出）' : '对外展示模式：一键隐藏所有隐私项目';
    var icon = btn.querySelector('svg');
    if (icon) icon.innerHTML = on
      ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
      : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }

  // 计算从 latest record 到现在已经过去多久
  // 无记录时返回 null（表示"还没开始"）
  function currentStreak(project) {
    if (!project || !project.records || !project.records.length) return null;
    var last = project.records[project.records.length - 1];
    var ts = typeof last === 'number' ? last : last.t;
    if (typeof ts !== 'number' || isNaN(ts)) return null;
    return Date.now() - ts;
  }

  // 给定两条相邻记录的时间戳，返回前一条的坚持时长
  function streakBetween(prevTime, currentTime) {
    if (typeof prevTime !== 'number' || typeof currentTime !== 'number') return 0;
    return Math.max(0, currentTime - prevTime);
  }

  // 安全取出 record 的时间戳（兼容旧数据：早期 records 是纯数字数组）
  function recordTs(r) { return typeof r === 'number' ? r : (r && r.t); }
  function recordNote(r) { return typeof r === 'number' ? '' : (r && r.n) || ''; }
  function recordTags(r) { return (r && Array.isArray(r.tags)) ? r.tags : []; }
  // 记录是否命中搜索词（备注 或 破戒原因标签）——抽出纯函数，便于测试与复用
  function recordMatchesQuery(r, q) {
    if (!q) return true;
    if (recordNote(r).toLowerCase().indexOf(q) >= 0) return true;
    return recordTags(r).some(function (t) {
      return String(t).toLowerCase().indexOf(q) >= 0;
    });
  }

  // 添加新记录（破戒）
  function addRecord(projectId, ts, note, tags) {
    var p = getProject(projectId);
    if (!p) return;
    p.records.push({ id: uid(), t: ts, n: (note || '').trim(), tags: Array.isArray(tags) ? tags.filter(Boolean) : [] });
    p.records.sort(function (a, b) { return a.t - b.t; });
    recalcBest(p);
    saveState();
  }

  function deleteRecord(projectId, recordId) {
    var p = getProject(projectId);
    if (!p) return;
    p.records = p.records.filter(function (r) { return r.id !== recordId; });
    recalcBest(p);
    saveState();
  }

  // 编辑记录（时间 + 备注 + 原因标签）
  function updateRecord(projectId, recordId, ts, note, tags) {
    var p = getProject(projectId);
    if (!p) return;
    var r = p.records.find(function (x) { return x.id === recordId; });
    if (!r) return;
    r.t = ts;
    r.n = (note || '').trim();
    r.tags = Array.isArray(tags) ? tags.filter(Boolean) : [];
    p.records.sort(function (a, b) { return recordTs(a) - recordTs(b); });
    recalcBest(p);
    saveState();
  }

  // ============== 复盘 ==============
  // cycleDays 触发的复盘周期（如 3 / 7 / 15 / 30）
  function addReview(projectId, cycleDays, achievement, improvement, nextPlan) {
    var p = getProject(projectId);
    if (!p) return null;
    var r = {
      id: uid(),
      cycleDays: cycleDays,
      ts: Date.now(),
      achievement: (achievement || '').trim(),
      improvement: (improvement || '').trim(),
      nextPlan: (nextPlan || '').trim()
    };
    p.reviews.push(r);
    p.reviews.sort(function (a, b) { return a.ts - b.ts; });
    // 一旦用户填了复盘，把这个周期的"横幅提示"和"复盘去重"都关掉
    if (p.seenReviewCycles.indexOf(cycleDays) === -1) p.seenReviewCycles.push(cycleDays);
    p.dismissedReviewBanner = null;
    saveState();
    return r;
  }

  function updateReview(projectId, reviewId, cycleDays, achievement, improvement, nextPlan) {
    var p = getProject(projectId);
    if (!p) return;
    var r = p.reviews.find(function (x) { return x.id === reviewId; });
    if (!r) return;
    r.cycleDays = cycleDays;
    r.achievement = (achievement || '').trim();
    r.improvement = (improvement || '').trim();
    r.nextPlan = (nextPlan || '').trim();
    p.reviews.sort(function (a, b) { return a.ts - b.ts; });
    saveState();
  }

  function deleteReview(projectId, reviewId) {
    var p = getProject(projectId);
    if (!p) return;
    p.reviews = p.reviews.filter(function (r) { return r.id !== reviewId; });
    saveState();
  }

  // 用户点"忽略"横幅：把当前 cycle 加到 seenReviewCycles，3 天内不再提醒同一周期
  function dismissReviewBanner(projectId, cycleDays) {
    var p = getProject(projectId);
    if (!p) return;
    if (p.seenReviewCycles.indexOf(cycleDays) === -1) p.seenReviewCycles.push(cycleDays);
    p.dismissedReviewBanner = { cycle: cycleDays, until: Date.now() + BANNER_DISMISS_DAYS * DAY_MS };
    saveState();
  }

  // 重新计算历史最高
  // 语义：只统计"已完成间隔"的最大值（稳定）；当前正在进行的连胜由 currentStreak 独立承担，
  // 不计入历史最高，否则补录/删除记录会导致 bestStreak 波动下降（违反"历史最高"直觉）
  function recalcBest(project) {
    var best = 0;
    for (var i = 1; i < project.records.length; i++) {
      var s = streakBetween(recordTs(project.records[i - 1]), recordTs(project.records[i]));
      if (s > best) best = s;
    }
    project.bestStreak = best;
  }

  // ---------- 格式化 ----------
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function formatDuration(ms) {
    if (ms == null || ms < 0) ms = 0;
    var totalSec = Math.floor(ms / 1000);
    var d = Math.floor(totalSec / 86400);
    var h = Math.floor((totalSec % 86400) / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    return {
      d: d, h: h, m: m, s: s,
      str: d + ' 天 ' + pad2(h) + ':' + pad2(m) + ':' + pad2(s),
      short: d + '天 ' + h + '时 ' + m + '分',
      compact: d > 0 ? d + '天' : h > 0 ? h + '时' : m + '分'
    };
  }

  function formatDateTime(ts) {
    var d = new Date(ts);
    var y = d.getFullYear();
    var mo = pad2(d.getMonth() + 1);
    var da = pad2(d.getDate());
    var h = pad2(d.getHours());
    var mi = pad2(d.getMinutes());
    return y + '-' + mo + '-' + da + ' ' + h + ':' + mi;
  }

  function formatRelative(ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < HOUR_MS) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < DAY_MS) return Math.floor(diff / HOUR_MS) + ' 小时前';
    if (diff < 7 * DAY_MS) return Math.floor(diff / DAY_MS) + ' 天前';
    return formatDateTime(ts);
  }

  function inputDateTimeValue(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
      + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // ---------- 公共表单工具 ----------

  // 构建 emoji 选择器（新建/编辑项目共用），返回 { getValue() }
  function buildEmojiPicker(container, initialEmoji) {
    var selected = initialEmoji || EMOJI_LIST[0];
    EMOJI_LIST.forEach(function (e) {
      var b = document.createElement('button');
      b.className = 'emoji-opt' + (e === selected ? ' selected' : '');
      b.textContent = e;
      b.addEventListener('click', function () {
        selected = e;
        container.querySelectorAll('.emoji-opt').forEach(function (x) { x.classList.remove('selected'); });
        b.classList.add('selected');
      });
      container.appendChild(b);
    });
    return {
      getValue: function () { return selected; }
    };
  }

  // 构建破戒原因标签选择器（多选，可选填），返回 { getValue() }
  function buildTagPicker(container, initialTags) {
    var selected = Array.isArray(initialTags) ? initialTags.filter(Boolean).slice() : [];
    RELAPSE_REASONS.forEach(function (tag) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag-opt' + (selected.indexOf(tag) >= 0 ? ' selected' : '');
      b.textContent = tag;
      b.addEventListener('click', function () {
        var idx = selected.indexOf(tag);
        if (idx >= 0) { selected.splice(idx, 1); b.classList.remove('selected'); }
        else { selected.push(tag); b.classList.add('selected'); }
      });
      container.appendChild(b);
    });
    return {
      getValue: function () { return selected.slice(); }
    };
  }

  // 分类归一化（v5）：只接受预置列表内的值，其余一律归为"未分类"
  function normalizeCategory(v) {
    return (typeof v === 'string' && getCategories().indexOf(v) >= 0) ? v : '';
  }

  // 分类选择器（单选）：复用 .tag-picker/.tag-opt 样式，点第二次不取消（单选语义）
  // 末尾带「＋ 新建」与「管理」：分类的增 / 改 / 删不必离开当前弹窗，
  // 且改动后回调 paint() 重绘，避免选择器停留在过期的分类列表上
  function buildCategoryPicker(container, initial) {
    var current = normalizeCategory(initial);
    var editing = false; // 「＋ 新建」的内联输入态

    function paint() {
      // 选中的分类被删除 / 改名后自动回落，避免项目存在指向不存在分类的归属
      current = normalizeCategory(current);
      var html = '<button type="button" class="tag-opt' + (current === '' ? ' selected' : '') + '" data-c="">未分类</button>';
      getCategories().forEach(function (c) {
        html += '<button type="button" class="tag-opt' + (current === c ? ' selected' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>';
      });
      if (editing) {
        html += '<span class="cat-inline">'
             + '  <input class="input cat-inline-input" id="qt-cat-inline" maxlength="' + MAX_CATEGORY_LEN + '" placeholder="新分类名">'
             + '  <button type="button" class="btn primary small" id="qt-cat-inline-ok">添加</button>'
             + '  <button type="button" class="btn ghost small" id="qt-cat-inline-cancel">取消</button>'
             + '</span>';
      } else {
        html += '<button type="button" class="tag-opt cat-add-btn" id="qt-cat-new-btn" title="新建分类">＋ 新建</button>';
        html += '<button type="button" class="tag-opt cat-add-btn" id="qt-cat-manage-btn" title="重命名 / 删除分类">管理</button>';
      }
      container.innerHTML = html;

      Array.from(container.querySelectorAll('.tag-opt[data-c]')).forEach(function (btn) {
        btn.addEventListener('click', function () {
          current = normalizeCategory(btn.getAttribute('data-c'));
          paint();
        });
      });

      if (editing) {
        var input = container.querySelector('#qt-cat-inline');
        function submit() {
          var r = addCategory(input.value);
          if (!r.ok) { toast(r.msg); return; } // 失败保留输入，便于改名后重试
          current = r.name;                    // 新建后直接选中，少一次点击
          editing = false;
          paint();
          toast(r.msg);
        }
        container.querySelector('#qt-cat-inline-ok').addEventListener('click', submit);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.stopPropagation(); editing = false; paint(); }
        });
        container.querySelector('#qt-cat-inline-cancel').addEventListener('click', function () { editing = false; paint(); });
        input.focus();
      } else {
        container.querySelector('#qt-cat-new-btn').addEventListener('click', function () { editing = true; paint(); });
        container.querySelector('#qt-cat-manage-btn').addEventListener('click', function () {
          openCategoryManager(function (info) {
            // 重命名当前选中项 → 跟随改名；删除 → 由 normalizeCategory 回落未分类
            if (info && info.type === 'rename' && current === info.from) current = info.to;
            paint();
          });
        });
      }
    }

    paint();
    return { getValue: function () { return current; } };
  }

  // ============== 分类管理（v6）==============
  // 分类列表存在 state.categories，用户可新增 / 重命名 / 删除；默认分类只是初始值，同样可改可删
  // 分类变更后同步首页：筛选胶囊与卡片上的分类小标都依赖分类列表，
  // 不重绘就会停留在过期状态（设置弹窗 / 项目弹窗里改完分类后尤其明显）
  function syncListAfterCategoryChange() {
    if (view === 'list') render();
  }

  function countProjectsWithCategory(name) {
    return state.projects.filter(function (p) { return p.category === name; }).length;
  }

  function addCategory(raw) {
    var raw2 = (typeof raw === 'string' ? raw : '').trim();
    if (!raw2) return { ok: false, msg: '请输入分类名' };
    // 超长一律拒绝而不是静默截断 —— 否则用户输入的名字会被悄悄改掉
    if (raw2.length > MAX_CATEGORY_LEN) return { ok: false, msg: '分类名最多 ' + MAX_CATEGORY_LEN + ' 个字' };
    var name = raw2;
    if (getCategories().indexOf(name) >= 0) return { ok: false, msg: '该分类已存在' };
    if (getCategories().length >= MAX_CATEGORIES) return { ok: false, msg: '分类最多 ' + MAX_CATEGORIES + ' 个' };
    state.categories.push(name); // 追加到末尾 → 筛选胶囊按此顺序展示
    saveState();
    return { ok: true, msg: '已新增分类：' + name, name: name };
  }

  // 重命名：同步改名所有使用该分类的项目（不丢归属）
  function renameCategory(oldName, rawNew) {
    var raw2 = (typeof rawNew === 'string' ? rawNew : '').trim();
    if (!raw2) return { ok: false, msg: '请输入分类名' };
    if (raw2.length > MAX_CATEGORY_LEN) return { ok: false, msg: '分类名最多 ' + MAX_CATEGORY_LEN + ' 个字' };
    var next = raw2;
    var idx = getCategories().indexOf(oldName);
    if (idx < 0) return { ok: false, msg: '原分类不存在' };
    if (next === oldName) return { ok: false, msg: '名称未变化' };
    if (getCategories().indexOf(next) >= 0) return { ok: false, msg: '该分类已存在' };
    state.categories[idx] = next;
    var moved = 0;
    state.projects.forEach(function (p) {
      if (p.category === oldName) { p.category = next; moved++; }
    });
    // 首页若正筛选着这个分类，必须跟着改名；否则筛选态会指向一个已不存在的名字 → 列表变空
    if (listFilter === oldName) listFilter = next;
    saveState();
    syncListAfterCategoryChange();
    return { ok: true, msg: moved ? '已重命名，' + moved + ' 个项目已同步' : '已重命名', from: oldName, to: next };
  }

  // 删除：使用该分类的项目回落为"未分类"（项目与记录都不丢，只丢分类归属）
  function deleteCategory(name) {
    var idx = getCategories().indexOf(name);
    if (idx < 0) return { ok: false, msg: '分类不存在' };
    state.categories.splice(idx, 1);
    var freed = 0;
    state.projects.forEach(function (p) {
      if (p.category === name) { p.category = ''; freed++; }
    });
    if (listFilter === name) listFilter = FILTER_ALL; // 避免停在"空列表"上困惑
    saveState();
    syncListAfterCategoryChange();
    return { ok: true, msg: freed ? '已删除，' + freed + ' 个项目变为未分类' : '已删除分类', name: name };
  }

  function resetCategories() {
    state.categories = DEFAULT_CATEGORIES.slice();
    // 默认列表里不存在的分类归属 → 回落未分类（避免出现"幽灵分类"）
    state.projects.forEach(function (p) {
      if (p.category && getCategories().indexOf(p.category) < 0) p.category = '';
    });
    if (listFilter && listFilter !== FILTER_NONE && getCategories().indexOf(listFilter) < 0) listFilter = FILTER_ALL;
    saveState();
    syncListAfterCategoryChange();
  }

  // 分类管理弹窗。演示模式锁定：分类行上带"N 个项目"，属内容级信息
  // onChanged(info)：任何成功变更（新增 / 重命名 / 删除 / 恢复默认）后回调，
  // 供调用方（分类选择器）重绘。info = { type, name?, from?, to? }
  function openCategoryManager(onChanged) {
    if (isDemoMode()) { toast('对外展示模式中，分类管理已锁定'); return; }
    var notify = typeof onChanged === 'function' ? onChanged : function () {};
    var cats = getCategories();
    var rows = cats.map(function (c) {
      return '<div class="cat-row" data-c="' + esc(c) + '">'
           + '  <span class="cat-name">' + esc(c) + '</span>'
           + '  <span class="cat-num">' + countProjectsWithCategory(c) + ' 个项目</span>'
           + '  <button class="hi-edit" data-act="rename" aria-label="重命名" title="重命名">✎</button>'
           + '  <button class="hi-del" data-act="del" aria-label="删除" title="删除">✕</button>'
           + '</div>';
    }).join('');
    var html = ''
      + '<div class="field"><label>现有分类（' + cats.length + ' / ' + MAX_CATEGORIES + '）</label>'
      + '  <div class="cat-list">' + (rows || '<div class="cat-empty">还没有分类，添加一个试试</div>') + '</div></div>'
      + '<div class="field"><label>新增分类</label>'
      + '  <div class="row"><input class="input" id="qt-cat-new" maxlength="' + MAX_CATEGORY_LEN + '" placeholder="例如：宵夜 / 咖啡">'
      + '  <button class="btn primary cat-add" id="qt-cat-add">添加</button></div></div>'
      + '<div class="modal-actions">'
      + '  <button class="btn ghost" id="qt-cat-reset">恢复默认</button>'
      + '  <button class="btn" onclick="window.__qt.closeModal()">完成</button>'
      + '</div>';

    showModal('分类管理', html, function (back) {
      Array.from(back.querySelectorAll('.cat-row')).forEach(function (row) {
        var name = row.getAttribute('data-c');
        row.querySelector('[data-act="rename"]').addEventListener('click', function () { openRenameCategory(name, notify); });
        row.querySelector('[data-act="del"]').addEventListener('click', function () { confirmDeleteCategory(name, notify); });
      });
      function doAdd() {
        var r = addCategory(back.querySelector('#qt-cat-new').value);
        toast(r.msg);
        if (r.ok) {
          notify({ type: 'add', name: r.name });
          closeModal(); openCategoryManager(onChanged); // 重建以刷新列表
        }
      }
      back.querySelector('#qt-cat-add').addEventListener('click', doAdd);
      back.querySelector('#qt-cat-new').addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdd(); });
      back.querySelector('#qt-cat-reset').addEventListener('click', function () {
        resetCategories();
        notify({ type: 'reset' });
        closeModal(); openCategoryManager(onChanged);
        toast('已恢复默认分类');
      });
    });
  }

  function openRenameCategory(name, notify) {
    if (isDemoMode()) return;
    var html = ''
      + '<div class="field"><label>分类名</label><input class="input" id="qt-cat-rename" maxlength="' + MAX_CATEGORY_LEN + '" value="' + esc(name) + '"></div>'
      + '<div class="modal-actions">'
      + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
      + '  <button class="btn primary" id="qt-cat-rename-ok">保存</button>'
      + '</div>';
    showModal('重命名分类', html, function (back) {
      back.querySelector('#qt-cat-rename-ok').addEventListener('click', function () {
        var r = renameCategory(name, back.querySelector('#qt-cat-rename').value);
        toast(r.msg);
        if (r.ok) {
          if (typeof notify === 'function') notify({ type: 'rename', from: r.from, to: r.to });
          closeModal(); closeModal(); openCategoryManager(notify);
        }
      });
    });
  }

  function confirmDeleteCategory(name, notify) {
    if (isDemoMode()) return;
    var n = countProjectsWithCategory(name);
    var html = ''
      + '<p class="dlg-note">确认删除分类 <b>' + esc(name) + '</b>？</p>'
      + (n ? '<p class="dlg-note-sub">该分类下有 <b>' + n + '</b> 个项目，删除后它们会变成「未分类」。<br>项目本身与全部记录都不会丢失。</p>' : '')
      + '<div class="modal-actions">'
      + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
      + '  <button class="btn danger" id="qt-cat-del-ok">删除</button>'
      + '</div>';
    showModal('删除分类', html, function (back) {
      back.querySelector('#qt-cat-del-ok').addEventListener('click', function () {
        var r = deleteCategory(name);
        toast(r.msg);
        if (typeof notify === 'function') notify({ type: 'delete', name: r.name });
        closeModal(); closeModal(); openCategoryManager(notify);
      });
    });
  }

  // 解析并校验时间输入，返回 {ok, ts, msg}；ok=false 时 msg 为提示文案
  function parseRecordTime(value) {
    var ts = new Date(value).getTime();
    if (isNaN(ts)) return { ok: false, msg: '时间无效' }; // 不判 !ts：1970-01-01T00:00 的时间戳 0 是合法输入
    if (ts > Date.now() + FUTURE_TOLERANCE_MS) return { ok: false, msg: '时间不能在未来' };
    return { ok: true, ts: ts };
  }

  // 保存按钮防连点：提交瞬间禁用，返回解锁函数（校验失败分支调用）
  function lockSaveBtn(btn) {
    if (!btn || btn.disabled) return function () {};
    btn.disabled = true;
    return function () {
      btn.disabled = false;
    };
  }

  // ============== 里程碑系统 ==============
  // 包含常用阈值，单位"天"。1 表示刚满 1 天。
  var MILESTONES = [1, 3, 7, 14, 21, 30, 50, 60, 90, 100, 180, 365, 500, 730, 1000];

  // 复盘周期（用户要求：3/7/15/30 等）
  var REVIEW_CYCLES = [3, 7, 15, 30, 60, 90, 180, 365];

  // 不同天数的庆祝文案
  function milestoneMessage(days) {
    var msgs = {
      1: '第一天！新旅程已经开启 ✨',
      3: '三天！初见成效 💪',
      7: '整整一周，你做到了 🌟',
      14: '两周稳定期，越来越强 🔥',
      21: '21 天习惯养成，里程碑达成！🎉',
      30: '一个月！这是真正的改变 🏆',
      50: '50 天坚持，太强了 🚀',
      60: '两个月了！你的自控力在发光 ✨',
      90: '一个季度！行为已经被你重塑 🌈',
      100: '100 天达成！传奇之路 👑',
      180: '半年！这是了不起的成就 🏅',
      365: '一年！你是自己的英雄 🌟🎉🏆',
      500: '500 天！这不是普通人能做到的 💎',
      730: '两年！你的生活已经被改写 🌌',
      1000: '1000 天传奇！🌠'
    };
    return msgs[days] || (days + ' 天达成！🎉');
  }

  // 检查并弹里程碑弹窗（已庆祝过的不会重复弹）
  function maybeShowMilestone(project, dur) {
    if (!project || !dur) return;
    if (!Array.isArray(project.seenMilestones)) project.seenMilestones = [];
    var days = dur.d;
    var triggered = false;
    MILESTONES.forEach(function (m) {
      if (days >= m && project.seenMilestones.indexOf(m) === -1) {
        project.seenMilestones.push(m);
        triggered = true;
        // 多个里程碑一起到：合并弹一个
      }
    });
    if (triggered) {
      saveState();
      // 找最大的那个庆祝
      var max = 0;
      project.seenMilestones.forEach(function (m) { if (m <= days && m > max) max = m; });
      showMilestone(project, max);
    }
  }

  function showMilestone(project, days) {
    var msg = milestoneMessage(days);
    var html = ''
      + '<div style="text-align:center; padding: 8px 0 16px;">'
      + '  <div style="font-size: 64px; margin-bottom: 8px; animation: bounce .6s;">' + esc(project.emoji) + '</div>'
      + '  <div style="font-size: 48px; font-weight: 800; color: var(--accent); letter-spacing: -2px; line-height: 1;">' + days + '</div>'
      + '  <div style="font-size: 14px; color: var(--text-sub); margin-top: 4px;">天</div>'
      + '  <div style="font-size: 16px; font-weight: 600; margin-top: 20px;">' + esc(msg) + '</div>'
      + '  <div style="font-size: 13px; color: var(--text-mute); margin-top: 8px;">' + esc(project.name) + ' · 你的坚持正在被看见</div>'
      + '</div>'
      + '<div class="modal-actions">'
      + '  <button class="btn primary block" onclick="window.__qt.closeModal()">继续保持 💚</button>'
      + '</div>';

    // 自动弹窗：与用户弹窗互斥（用户正在填表时延后，避免 closeModal 吞掉未保存输入）
    runAutoModal(function () {
      pushModalBack(
        '  <h2 style="text-align:center; margin-bottom: 8px;">🎉 里程碑达成</h2>'
        + '  <div id="qt-modal-body">' + html + '</div>',
        null,
        'milestone-modal'
      );
    });
  }

  // ---------- 渲染 ----------
  var main = document.getElementById('main');
  var view = 'list'; // 'list' | 'detail'
  var detailId = null;
  var calMonthOffset = 0; // 用于日历翻月
  var calView = 'month'; // 'month' | 'year'  日历视图切换
  var detailTab = 'overview'; // 详情页页签：overview | records | reviews | badges（进详情重置为概览）
  var detailSearch = '';  // 详情页历史记录搜索关键字
  var listScrollY = 0;    // 离开首页时的滚动位置（返回时恢复，避免长列表回到头部）
  var listFilter = FILTER_ALL; // 首页分类筛选（v5）
  var sortMode = false;        // 首页排序模式（v5）
  // 拖拽排序临时状态（模块级：document 级监听在 init 里只注册一次，避免每次渲染重复绑定）
  var dragEl = null, dragFrom = -1, dragStartY = 0, dragCurY = 0, dragCards = [];
  var searchTimer = null; // 搜索防抖 timer（模块级，避免挂 DOM 节点）
  var lastCheckedDays = {}; // 里程碑/复盘检查缓存：{projectId: 天数}，天数变化才检查（避免每秒无效遍历）

  // 全局计时器：每秒刷新一次（只更新文本，不重建 DOM）
  var tickInterval = null;
  function startTicker() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(function () {
      if (view === 'list') updateListTicker();
      else if (view === 'detail') updateDetailTicker();
    }, TICK_INTERVAL);
  }

  // 列表页每秒只更新每个项目卡片的计时器文本
  // 同时检测是否到达了里程碑日（自然跨过）—— 仅在"天数刚变化"时检查，避免每秒无效遍历
  function updateListTicker() {
    if (view !== 'list') return;
    state.projects.forEach(function (p) {
      var card = main.querySelector('.project-card[data-id="' + p.id + '"]');
      if (!card) return;
      var streak = currentStreak(p);
      var timeEl = card.querySelector('.pc-time');
      var metaEl = card.querySelector('.pc-meta b');
      if (!timeEl) return;
      if (streak != null) {
        var dur = formatDuration(streak);
        // .streak-text 是 JS 选择器钩子（ticker 每秒靠它更新计时文本），有意不配样式，勿当死代码删除
        var t = timeEl.querySelector('.streak-text');
        if (t) t.textContent = dur.str;
        if (metaEl) metaEl.textContent = dur.short;
        // 里程碑/复盘检查：只在"天数刚变化"时执行
        if (lastCheckedDays[p.id] !== dur.d) {
          lastCheckedDays[p.id] = dur.d;
          checkMilestoneTick(p, dur);
          checkReviewTick(p, dur);
        }
      }
    });
  }

  // 详情页同理
  function updateDetailTicker() {
    if (view !== 'detail' || !detailId) return;
    var p = getProject(detailId);
    if (!p) return;
    var streak = currentStreak(p);
    var el = main.querySelector('[data-detail-timer]');
    if (!el) return;
    if (streak != null) {
      var dur = formatDuration(streak);
      el.textContent = dur.str;
      if (lastCheckedDays[p.id] !== dur.d) {
        lastCheckedDays[p.id] = dur.d;
        checkMilestoneTick(p, dur);
        checkReviewTick(p, dur);
      }
    }
  }

  // 用 seenMilestones 数组避免重复弹，跨过即标记
  function checkMilestoneTick(project, dur) {
    if (!Array.isArray(project.seenMilestones)) project.seenMilestones = [];
    var days = dur.d;
    var triggered = null;
    MILESTONES.forEach(function (m) {
      if (days >= m && project.seenMilestones.indexOf(m) === -1) {
        project.seenMilestones.push(m);
        if (!triggered || m > triggered) triggered = m;
      }
    });
    if (triggered) {
      saveState();
      // 只在 App 处于前台时弹
      showMilestone(project, triggered);
    }
  }

  // 复盘触发：跨过 REVIEW_CYCLES 任意一个周期就标记 + 弹窗提醒 + 详情页横幅
  function checkReviewTick(project, dur) {
    if (!Array.isArray(project.seenReviewCycles)) project.seenReviewCycles = [];
    var days = dur.d;
    REVIEW_CYCLES.forEach(function (c) {
      if (days >= c && project.seenReviewCycles.indexOf(c) === -1) {
        // 标记已提醒
        project.seenReviewCycles.push(c);
        saveState();
        // 弹窗提示用户做复盘
        showReviewPrompt(project, c);
      }
    });
  }

  // 复盘弹窗：提示"你已经成功坚持了 X 天"
  function showReviewPrompt(project, cycleDays) {
    var html = ''
      + '<div style="text-align:center; padding: 8px 0 16px;">'
      + '  <div style="font-size: 56px; margin-bottom: 8px;">' + esc(project.emoji) + '</div>'
      + '  <div style="font-size: 18px; font-weight: 600; line-height: 1.4; margin-bottom: 8px;">'
      + '    你已经成功坚持了 <span style="color: var(--accent); font-weight: 800;">' + cycleDays + '</span> 天'
      + '  </div>'
      + '  <div style="font-size: 14px; color: var(--text-sub); line-height: 1.5;">'
      + '    快来做一个周期性复盘吧 📝<br>'
      + '    记录成就、不足和下一步计划，帮助你走得更远。'
      + '  </div>'
      + '</div>'
      + '<div class="modal-actions">'
      + '  <button class="btn ghost" id="qt-skip">稍后再说</button>'
      + '  <button class="btn primary" id="qt-go">立即复盘</button>'
      + '</div>';

    // 自动弹窗：与用户弹窗互斥（用户正在填表时延后，避免 closeModal 吞掉未保存输入）
    runAutoModal(function () {
      // 遮罩点击 = 忽略本次复盘提示（3 天内不再提醒同一周期）
      var back = pushModalBack(
        '  <h2 style="text-align:center; margin-bottom: 8px;">' + cycleDays + ' 天复盘时间 🎉</h2>'
        + '  <div id="qt-modal-body">' + html + '</div>',
        null,
        'milestone-modal'
      );

      back.querySelector('#qt-go').addEventListener('click', function () {
        closeModal();
        // 切到详情页打开复盘表单
        view = 'detail';
        detailId = project.id;
        render();
        // 延迟打开，确保详情页已渲染
        setTimeout(function () { openNewReview(project.id, cycleDays); }, 50);
      });
      back.querySelector('#qt-skip').addEventListener('click', function () {
        dismissReviewBanner(project.id, cycleDays);
        closeModal();
      });
    });
  }

  function render() {
    if (view === 'list') renderList();
    else if (view === 'detail') renderDetail(detailId);
  }

  // ============== 列表视图 ==============
  // 首页分类筛选胶囊（复用 index.html 里早已定义却一直没被使用的 .tabs/.tab 样式）
  function renderFilterChips(all) {
    var cats = usedCategories();
    var hasNone = state.projects.some(function (p) { return !p.category; });
    if (!cats.length) return ''; // 一个分类都没设置 → 不显示，避免空占位
    // 分类值经 data-filter 属性传递（纯属性值上下文 esc 即安全）；
    // 禁止拼进 onclick 的 JS 字符串参数——分类名含撇号时会被 HTML 解码还原成引号，直接语法断裂（BUG-J1）
    var html = '<div class="tabs">';
    html += '<button class="tab' + (listFilter === FILTER_ALL ? ' active' : '')
          + '" data-filter="">全部 <span class="tab-n">' + all.length + '</span></button>';
    cats.forEach(function (c) {
      var n = all.filter(function (p) { return p.category === c; }).length;
      html += '<button class="tab' + (listFilter === c ? ' active' : '')
            + '" data-filter="' + esc(c) + '">' + esc(c)
            + ' <span class="tab-n">' + n + '</span></button>';
    });
    if (hasNone) {
      var n0 = all.filter(function (p) { return !p.category; }).length;
      html += '<button class="tab' + (listFilter === FILTER_NONE ? ' active' : '')
            + '" data-filter="' + FILTER_NONE + '">未分类 <span class="tab-n">' + n0 + '</span></button>';
    }
    return html + '</div>';
  }

  // 胶囊点击绑定：对当次渲染的 DOM 逐个挂监听（与卡片点击同模式；innerHTML 重建后旧监听随节点丢弃）
  function bindFilterChips() {
    Array.from(main.querySelectorAll('.tab')).forEach(function (el) {
      el.addEventListener('click', function () {
        setListFilter(el.getAttribute('data-filter'));
      });
    });
  }

  function renderList() {
    // 用数据属性保存时间戳，避免每秒重建 DOM
    var html = '';
    if (state.projects.length === 0) {
      html = ''
        + '<div class="empty">'
        + '  <div class="em">🌱</div>'
        + '  <h3>还没有追踪项目</h3>'
        + '  <p>从你想戒掉的第一件事开始</p>'
        + '  <button class="btn primary" onclick="window.__qt.openNewProject()">+ 新建项目</button>'
        + '</div>';
      main.innerHTML = html;
      return;
    }

    var all = sortedProjects();

    html += '<div class="row" style="margin-bottom: 12px;">'
         + '  <div style="font-size: 13px; color: var(--text-mute);">共 ' + all.length + ' 个项目</div>'
         + (all.length > 1
             ? '<button class="btn small' + (sortMode ? ' active' : '') + '" style="margin-left: auto;" onclick="window.__qt.toggleSortMode()">'
               + (sortMode ? '完成' : '排序') + '</button>'
             : '')
         + '  <button class="btn primary small" style="margin-left: ' + (all.length > 1 ? '8px' : 'auto') + ';" onclick="window.__qt.openNewProject()">+ 新建</button>'
         + '</div>';

    if (sortMode) {
      // 排序模式只展示全部项目，避免"筛选后的顺序"与"全局顺序"混淆
      html += '<div class="sort-hint">按住左侧 ⋮⋮ 手柄拖动调整顺序</div>';
    } else {
      html += renderFilterChips(all);
    }

    var list = sortMode ? all : filterProjects(all, listFilter);

    if (!list.length) {
      html += '<div class="empty" style="padding: 48px 24px;">'
           + '  <div class="em">🔍</div>'
           + '  <h3 style="font-size: 16px;">这个分类下还没有项目</h3>'
           + '  <p>换个分类看看，或者给项目设置分类</p>'
           + '</div>';
      main.innerHTML = html;
      bindFilterChips();
      return;
    }

    html += '<div class="project-grid">';
    list.forEach(function (p) {
      var streak = currentStreak(p);
      var dur = streak != null ? formatDuration(streak) : null;
      // 破戒次数：首条为"首次创建"记录（起始计时），不计入破戒
      var totalRecords = Math.max(0, p.records.length - 1);
      var isPriv = !!p.private;
      var blurred = isPriv && shouldBlur(p);
      var eyeCls = blurred ? '' : ' on'; // 眼睛睁开(清晰)时给高亮提示

      html += '<div class="project-card' + (sortMode ? ' sorting' : '') + '" data-id="' + p.id + '">'
           + (sortMode ? '<div class="drag-handle" aria-label="拖动排序">⋮⋮</div>' : '')
           + '  <div class="pc-head">'
           + '    <div class="pc-emoji' + (blurred ? ' is-blurred' : '') + '">' + esc(p.emoji) + '</div>'
           + '    <div class="pc-title' + (blurred ? ' is-blurred' : '') + '" style="flex:1;min-width:0;">'
           + (isPriv && !blurred ? '<span title="隐私项目" style="margin-right:4px;">🔒</span>' : '')
           + esc(p.name) + '</div>'
           + (isPriv
               ? '<button class="pc-eye' + eyeCls + '" aria-label="' + (blurred ? '睁眼查看' : '闭眼隐藏') + '" title="' + (blurred ? '点击查看内容' : '点击隐藏内容') + '" onclick="event.stopPropagation();window.__qt.toggleEye(\'' + p.id + '\')">'
               +   (blurred
               ?     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
               :     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>')
               + '</button>'
               : '')
           + '    <button class="icon-btn" aria-label="编辑" onclick="event.stopPropagation();window.__qt.openEditProject(\'' + p.id + '\')">'
           + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
           + '    </button>'
           + '  </div>'
           + '  <div class="pc-time' + (blurred ? ' is-blurred' : '') + '" data-streak-ts="' + (streak != null ? p.records[p.records.length - 1].t : '') + '">'
           + (streak != null
                ? '<span class="streak-text">' + dur.str + '</span>'
                : '<span style="color: var(--text-mute); font-size: 24px; font-weight: 600;">尚未开始</span>')
           + '  </div>'
           + '  <div class="pc-meta' + (blurred ? ' is-blurred' : '') + '">'
           + '    <span>已坚持<b data-streak-b="0">' + (streak != null ? dur.short : '—') + '</b></span>'
           + '    <span>历史最长 <b>' + (p.bestStreak ? formatDuration(p.bestStreak).short : '—') + '</b></span>'
           + '    <span>破戒 <b>' + totalRecords + '</b> 次</span>'
           + (p.category ? '    <span class="cat-chip">' + esc(p.category) + '</span>' : '')
           + '  </div>'
           + '  <div class="pc-actions" onclick="event.stopPropagation();">'
           + '    <button class="btn primary" style="flex: 1;" onclick="window.__qt.openAddRecord(\'' + p.id + '\')">+ 又做了</button>'
           + '    <button class="btn" onclick="window.__qt.openDetail(\'' + p.id + '\')">详情</button>'
           + '  </div>'
           + '</div>';
    });
    html += '</div>';

    main.innerHTML = html;
    bindFilterChips();

    if (sortMode) { bindSortDrag(); return; } // 排序模式下禁止点卡片进详情

    // 绑定卡片点击（整个卡片 → 详情）
    Array.from(main.querySelectorAll('.project-card')).forEach(function (el) {
      el.addEventListener('click', function () {
        openDetail(el.getAttribute('data-id'));
      });
    });
  }

  // ---------- 首页筛选 / 排序模式（v5） ----------
  function setListFilter(f) {
    listFilter = f || FILTER_ALL;
    render();
  }

  function toggleSortMode() {
    sortMode = !sortMode;
    if (sortMode) listFilter = FILTER_ALL; // 排序时只展示全部，避免"筛选后顺序"与"全局顺序"混淆
    render();
  }

  // 排序模式绑定：只给手柄挂按下事件；移动/抬起挂在 document（init 注册一次）
  function bindSortDrag() {
    var grid = main.querySelector('.project-grid');
    dragCards = grid ? Array.from(grid.querySelectorAll('.project-card')) : [];
    dragCards.forEach(function (card, idx) {
      var handle = card.querySelector('.drag-handle');
      if (!handle) return;
      handle.addEventListener('touchstart', function (e) { dragStart(e, idx); }, { passive: false });
      handle.addEventListener('mousedown', function (e) { dragStart(e, idx); });
    });
  }

  function dragPoint(e) { return e.touches && e.touches.length ? e.touches[0] : e; }

  function dragStart(e, idx) {
    var el = dragCards[idx];
    if (!el) return;
    dragEl = el;
    dragFrom = idx;
    dragStartY = dragCurY = dragPoint(e).clientY;
    el.classList.add('dragging');
    if (e.cancelable) e.preventDefault(); // 关键：阻止滚动抢走手势
  }

  function dragMove(e) {
    if (!dragEl) return;
    dragCurY = dragPoint(e).clientY;
    dragEl.style.transform = 'translateY(' + (dragCurY - dragStartY) + 'px) scale(1.02)';
    if (e.cancelable) e.preventDefault();
  }

  function dragEnd() {
    if (!dragEl) return;
    var from = dragFrom, to = dragCards.length - 1, i;
    // 用各卡片中线判断落点
    for (i = 0; i < dragCards.length; i++) {
      var r = dragCards[i].getBoundingClientRect();
      if (dragCurY < r.top + r.height / 2) { to = i; break; }
    }
    dragEl.classList.remove('dragging');
    dragEl.style.transform = '';
    dragEl = null;
    dragFrom = -1;
    if (reorderProjects(from, to)) render();
  }

  // ============== 详情视图 ==============
  function renderDetail(id) {
    var p = getProject(id);
    if (!p) { view = 'list'; return renderList(); }

    var streak = currentStreak(p);
    var dur = streak != null ? formatDuration(streak) : null;
    var best = p.bestStreak ? formatDuration(p.bestStreak) : null;
    var lastTs = p.records.length ? recordTs(p.records[p.records.length - 1]) : null;
    var firstTs = p.records.length ? recordTs(p.records[0]) : null;
    var isPriv = !!p.private;
    var blurred = isPriv && shouldBlur(p);
    var eyeCls = blurred ? '' : ' on';

    var html = ''
      + '<div class="detail-head">'
      + '  <button class="back-btn" onclick="window.__qt.goHome()" aria-label="返回">'
      + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>'
      + '  </button>'
      + '  <div class="detail-title' + (blurred ? ' is-blurred' : '') + '" style="flex:1;min-width:0;">'
      + (isPriv && !blurred ? '<span title="隐私项目" style="margin-right:4px;">🔒</span>' : '')
      + esc(p.emoji) + ' ' + esc(p.name) + '</div>'
      + (isPriv
          ? '<button class="pc-eye' + eyeCls + '" aria-label="' + (blurred ? '睁眼查看' : '闭眼隐藏') + '" title="' + (blurred ? '点击查看内容' : '点击隐藏内容') + '" onclick="window.__qt.toggleEye(\'' + p.id + '\')">'
          +   (blurred
          ?     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
          :     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>')
          + '</button>'
          : '')
      + '  <button class="icon-btn" onclick="window.__qt.openEditProject(\'' + p.id + '\')" aria-label="编辑">'
      + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
      + '  </button>'
      + '</div>';

    // 隐私横幅提示（模糊状态下解释如何查看）
    if (isPriv && blurred) {
      html += '<div class="privacy-note">🔒 这是一个隐私项目' + (isDemoMode() ? '（对外展示模式：内容已隐藏，退出后可查看）' : '，点击右上角 👁 睁眼查看') + '</div>';
    }

    // 页签栏（用户决策：详情页分区展示，单屏不再渲染全部 9 区块）
    // 概览=计时+数据+目标+周报+删除；记录=日历+历史；复盘=洞察+复盘；成就=徽章墙
    var banner = buildReviewBanner(p, streak);
    html += '<div class="tabs">'
         + '  <button class="tab' + (detailTab === 'overview' ? ' active' : '') + '" data-detail-tab="overview">概览</button>'
         + '  <button class="tab' + (detailTab === 'records' ? ' active' : '') + '" data-detail-tab="records">记录</button>'
         + '  <button class="tab' + (detailTab === 'reviews' ? ' active' : '') + '" data-detail-tab="reviews">复盘</button>'
         + '  <button class="tab' + (detailTab === 'badges' ? ' active' : '') + '" data-detail-tab="badges">成就</button>'
         + '</div>';

    if (detailTab === 'records') {
      // 日历
      html += '<div class="section-title">日历</div>';
      html += renderCalendar(p);
      // 历史记录（独立容器，搜索时只刷新这里，不重建整个详情页）
      html += '<div id="qt-history">' + renderHistoryList(p) + '</div>';
    } else if (detailTab === 'reviews') {
      // 洞察（B1）+ 复盘
      html += renderInsightSection(p);
      html += renderReviewSection(p);
    } else if (detailTab === 'badges') {
      // 成就徽章（C2）
      html += renderBadgeSection(p);
    } else {
      // 概览（默认）
      // 大计时器
      html += '<div class="big-timer' + (blurred ? ' is-blurred' : '') + '">'
           + '  <div class="emoji">' + esc(p.emoji) + '</div>'
           + '  <div class="time" data-detail-timer>' + (streak != null ? dur.str : '尚未开始') + '</div>'
           + '  <div class="since">' + (lastTs ? '自 ' + formatDateTime(lastTs) + ' · ' + formatRelative(lastTs) : '点击下方按钮记录你的第一次') + '</div>'
           + '</div>';
      // 操作按钮
      html += '<button class="btn primary block" onclick="window.__qt.openAddRecord(\'' + p.id + '\')">+ 我又做了这件事</button>';
      // 复盘横幅
      if (banner) html += banner;
      // 统计网格
      html += '<div class="section-title">数据</div>';
      html += '<div class="stat-grid' + (blurred ? ' is-blurred' : '') + '">'
           + statCard('历史最长', best ? best.short : '—', best ? best.str : '暂无')
           + statCard('破戒次数', String(Math.max(0, p.records.length - 1)), (p.records.length > 1 ? ('最近 ' + formatRelative(p.records[p.records.length - 1].t)) : (p.records.length ? '暂无破戒' : '暂无记录')))
           + statCard('首次记录', firstTs ? formatDateTime(firstTs).slice(5) : '—', firstTs ? formatRelative(firstTs) : '—')
           + statCard('当前连胜', streak != null ? dur.compact : '—', streak != null ? dur.short : '尚未开始')
           + '</div>';
      // 目标进度（C1：设置了 goalDays 时显示进度条）
      if (p.goalDays > 0) {
        var daysNow = streak != null ? Math.floor(streak / DAY_MS) : 0;
        var pct = Math.min(100, Math.round(daysNow / p.goalDays * 100));
        var goalDone = daysNow >= p.goalDays;
        html += '<div class="goal-card' + (blurred ? ' is-blurred' : '') + '">'
             + '  <div class="goal-head"><span>目标坚持 <b>' + p.goalDays + '</b> 天</span>'
             + '  <span class="' + (goalDone ? 'goal-done' : 'goal-now') + '">' + (goalDone ? '🎉 已达成' : '已坚持 ' + daysNow + ' 天 · ' + pct + '%') + '</span></div>'
             + '  <div class="goal-track"><div class="goal-fill' + (goalDone ? ' done' : '') + '" style="width:' + pct + '%"></div></div>'
             + '</div>';
      }
      // 报告生成（D1）
      html += '<div class="divider"></div>'
           + '<button class="btn block" onclick="window.__qt.openReport(\'' + p.id + '\')">📊 生成周报 / 月报</button>';
      // 删除项目
      html += '<div class="divider"></div>'
           + '<button class="btn danger block" onclick="window.__qt.confirmDeleteProject(\'' + p.id + '\')">删除整个项目</button>';
    }

    main.innerHTML = html;

    // 页签切换绑定（data-* 属性 + 渲染期绑定，同筛选胶囊模式）
    Array.from(main.querySelectorAll('[data-detail-tab]')).forEach(function (el) {
      el.addEventListener('click', function () {
        detailTab = el.getAttribute('data-detail-tab');
        render();
      });
    });

    // 复盘横幅"忽略"按钮
    var dismissBtn = main.querySelector('.rb-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var c = parseInt(dismissBtn.getAttribute('data-cycle'), 10);
        dismissReviewBanner(p.id, c);
        // 横幅要等下次重新计算（不能立刻消失，因为可能 streak 还在，但 seen 标记了）
        // 实际逻辑：banner 是从 seenReviewCycles + dismissedReviewBanner 决定的，
        // dismissReviewBanner 会把 cycle 加到 seenReviewCycles，所以下次 render 就消失了
        render();
      });
    }

    // 日历 tab 切换
    Array.from(main.querySelectorAll('.cal-tab')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        calView = btn.getAttribute('data-view');
        calMonthOffset = 0;
        render();
      });
    });

    // 搜索框事件（输入时只刷新历史列表容器，不重建整个详情页；用 setTimeout 0 避免和 IME 冲突）
    var searchInput = main.querySelector('#qt-search');
    if (searchInput) {
      var wasFocused = searchInput === document.activeElement;
      var cursorPos = searchInput.selectionStart;
      searchInput.addEventListener('input', function (e) {
        detailSearch = e.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          if (view !== 'detail') return;
          var box = main.querySelector('#qt-history');
          if (!box) return;
          box.innerHTML = renderHistoryList(p);
          // 还原焦点和光标
          var ni = box.querySelector('#qt-search');
          if (ni) {
            ni.focus();
            try { ni.setSelectionRange(cursorPos, cursorPos); } catch (e2) {}
          }
        }, SEARCH_DEBOUNCE);
      });
      if (wasFocused || detailSearch) searchInput.focus();
    }
  }

  // 历史记录区（独立渲染：搜索时只重建本容器，日历/统计/复盘不受影响）
  function renderHistoryList(p) {
    var blurred = p.private && shouldBlur(p); // 隐私项目：历史列表区模糊（搜索框保留可输入，但结果不可读）
    var html = '<div class="section-title">历史记录（' + p.records.length + '）</div>';
    if (p.records.length === 0) {
      html += '<div style="text-align: center; color: var(--text-mute); padding: 24px; font-size: 13px;">还没有任何记录</div>';
      return html;
    }
    // 搜索框（模糊态不模糊搜索框本身，但输入结果仍在模糊区内不可读）
    html += '<div class="field" style="margin-bottom: 12px;">'
         + '  <input class="input" id="qt-search" placeholder="搜索备注或破戒原因…" value="' + esc(detailSearch) + '">'
         + '</div>';

    // 倒序展示
    var sorted = p.records.slice().sort(function (a, b) { return recordTs(b) - recordTs(a); });
    var q = detailSearch.trim().toLowerCase();
    var filtered = sorted.filter(function (r) { return recordMatchesQuery(r, q); });

    if (filtered.length === 0) {
      html += '<div style="text-align: center; color: var(--text-mute); padding: 24px; font-size: 13px;">没有匹配的记录</div>';
      return html;
    }
    html += '<div class="history' + (blurred ? ' is-blurred' : '') + '">';
    filtered.forEach(function (r) {
      var rTs = recordTs(r);
      // 这一次的"坚持时长" = 与上一条的间隔
      var prevIdx = p.records.findIndex(function (x) { return x.id === r.id; });
      var s = prevIdx > 0 ? formatDuration(rTs - recordTs(p.records[prevIdx - 1])) : null;
      var note = recordNote(r);
      var tags = recordTags(r);
      var tagsHtml = (tags && tags.length)
        ? '<div class="hi-tags">' + tags.map(function (t) { return '<span class="hi-tag">' + esc(t) + '</span>'; }).join('') + '</div>'
        : '';
      html += '<div class="history-item">'
           + '  <div class="hi-emoji">' + esc(p.emoji) + '</div>'
           + '  <div class="hi-body">'
           + '    <div class="hi-time">' + formatDateTime(rTs) + '</div>'
           + (note ? '<div class="hi-note">' + esc(note) + '</div>' : '')
           + tagsHtml
           + '  </div>'
           + (s ? '<div class="hi-streak">坚持<br><b style="color:var(--text);">' + s.compact + '</b></div>' : '<div class="hi-streak">首次创建</div>')
           + '  <button class="hi-edit" onclick="window.__qt.openEditRecord(\'' + p.id + '\',\'' + r.id + '\')" aria-label="编辑" title="编辑">'
           + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
           + '  </button>'
           + '  <button class="hi-del" onclick="window.__qt.confirmDeleteRecord(\'' + p.id + '\',\'' + r.id + '\')" aria-label="删除" title="删除">'
           + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>'
           + '  </button>'
           + '</div>';
    });
    html += '</div>';
    return html;
  }

  function statCard(label, value, sub) {
    return '<div class="stat">'
         + '  <div class="label">' + esc(label) + '</div>'
         + '  <div class="value">' + esc(value) + '</div>'
         + '  <div class="sub">' + esc(sub || '') + '</div>'
         + '</div>';
  }

  // ============== B1：破戒模式分析（洞察） ==============
  // 纯前端计算，无数据模型改动。统计破戒记录（不含首条"开始"记录）的：
  // 星期分布 / 时段分布 / 平均间隔 与 趋势
  function buildInsights(p) {
    var recs = p.records.slice(1); // 首条为"开始"记录，不计入破戒
    var insight = { hasData: recs.length > 0, dow: [0, 0, 0, 0, 0, 0, 0], period: { 凌晨: 0, 上午: 0, 下午: 0, 晚上: 0 }, avgGapDays: null, trend: null, topTags: [] };
    if (recs.length === 0) return insight;

    var DOW_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var totalGap = 0;
    var gapCount = 0;
    var rising = 0, falling = 0;
    var prevGap = null;
    var tagCount = {};

    recs.forEach(function (r, i) {
      var ts = recordTs(r);
      if (typeof ts !== 'number') return;
      var d = new Date(ts);
      insight.dow[d.getDay()]++;
      var h = d.getHours();
      if (h < 6) insight.period['凌晨']++;
      else if (h < 12) insight.period['上午']++;
      else if (h < 18) insight.period['下午']++;
      else insight.period['晚上']++;
      recordTags(r).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; });
      // 间隔：与上一条破戒（或开始记录）的时间差
      var prevTs = recordTs(p.records[i]); // recs[i] 对应 p.records[i+1]，上一条是 p.records[i]
      if (typeof prevTs === 'number') {
        var gap = (ts - prevTs) / DAY_MS;
        totalGap += gap; gapCount++;
        if (prevGap != null) {
          if (gap > prevGap) rising++;
          else if (gap < prevGap) falling++;
        }
        prevGap = gap;
      }
    });
    insight.avgGapDays = gapCount ? Math.round(totalGap / gapCount * 10) / 10 : null;
    // 趋势：间隔变长 = 戒断在变好
    if (rising + falling > 0) {
      insight.trend = rising >= falling ? '变长 ↑' : '变短 ↓';
    }
    // Top 原因标签
    insight.topTags = Object.keys(tagCount).sort(function (a, b) { return tagCount[b] - tagCount[a]; }).slice(0, 3)
      .map(function (t) { return { tag: t, count: tagCount[t] }; });
    return insight;
  }

  // 渲染洞察卡片（星期条 + 时段条 + 间隔趋势 + Top 原因）
  function renderInsightSection(p) {
    var ins = buildInsights(p);
    var blurred = p.private && shouldBlur(p);
    var html = '<div class="section-title">洞察</div>';
    if (!ins.hasData) {
      html += '<div style="text-align:center; color:var(--text-mute); padding:20px 0; font-size:13px;">还没有破戒记录，坚持住，继续保持 💪</div>';
      return html;
    }
    html += '<div class="insight-card' + (blurred ? ' is-blurred' : '') + '">';
    // 星期分布（横向条）
    var DOW_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var maxDow = Math.max.apply(null, ins.dow);
    html += '<div class="insight-row"><span class="insight-label">星期</span><div class="insight-bars">';
    ins.dow.forEach(function (c, i) {
      var w = maxDow ? Math.round(c / maxDow * 100) : 0;
      html += '<div class="insight-bar-row"><span class="insight-bar-name">' + DOW_NAMES[i] + '</span>'
           + '<div class="insight-bar-track"><div class="insight-bar" style="width:' + (c ? Math.max(8, w) : 0) + '%"></div></div>'
           + '<span class="insight-bar-val">' + c + '</span></div>';
    });
    html += '</div></div>';
    // 时段分布
    html += '<div class="insight-row"><span class="insight-label">时段</span><div class="insight-bars">';
    ['凌晨', '上午', '下午', '晚上'].forEach(function (k) {
      var c = ins.period[k];
      var w = ins.period['凌晨'] + ins.period['上午'] + ins.period['下午'] + ins.period['晚上'];
      var pct = w ? Math.round(c / w * 100) : 0;
      html += '<div class="insight-bar-row"><span class="insight-bar-name">' + k + '</span>'
           + '<div class="insight-bar-track"><div class="insight-bar" style="width:' + (c ? Math.max(8, pct) : 0) + '%"></div></div>'
           + '<span class="insight-bar-val">' + pct + '%</span></div>';
    });
    html += '</div></div>';
    // 平均间隔 + 趋势
    html += '<div class="insight-summary">'
         + '  平均 <b>' + ins.avgGapDays + '</b> 天破戒一次'
         + (ins.trend ? ' · 间隔总体趋势 <b>' + ins.trend + '</b>' : '')
         + '</div>';
    // Top 原因
    if (ins.topTags.length) {
      html += '<div class="insight-summary">主要触发原因：'
           + ins.topTags.map(function (t) { return '<span class="hi-tag">' + esc(t.tag) + ' ×' + t.count + '</span>'; }).join(' ')
           + '</div>';
    }
    html += '</div>';
    return html;
  }

  // 复盘横幅：检测有没有"跨过复盘周期但还没做复盘"的周期
  function buildReviewBanner(p, streak) {
    if (!streak) return null;
    if (!Array.isArray(p.seenReviewCycles)) p.seenReviewCycles = [];
    var days = Math.floor(streak / DAY_MS);
    // 找最近一个"跨过但还没做复盘"的周期
    var pendingCycle = null;
    for (var i = REVIEW_CYCLES.length - 1; i >= 0; i--) {
      var c = REVIEW_CYCLES[i];
      if (days >= c) {
        // 已经被"已做复盘"标记 或 被"忽略 3 天"标记 的不算 pending
        var reviewed = (p.reviews || []).some(function (r) { return r.cycleDays === c; });
        var dismissedRecent = p.dismissedReviewBanner && p.dismissedReviewBanner.cycle === c && p.dismissedReviewBanner.until > Date.now();
        if (!reviewed && !dismissedRecent) {
          pendingCycle = c;
          break;
        }
      }
    }
    if (!pendingCycle) return null;
    return ''
      + '<div class="review-banner" data-cycle="' + pendingCycle + '">'
      + '  <div class="rb-icon">📝</div>'
      + '  <div class="rb-body">'
      + '    <div class="rb-title">你已经成功坚持了 ' + pendingCycle + ' 天</div>'
      + '    <div class="rb-sub">快来做一个周期性复盘吧</div>'
      + '  </div>'
      + '  <div class="rb-actions">'
      + '    <button class="btn primary small" onclick="window.__qt.openNewReview(\'' + p.id + '\',' + pendingCycle + ')">立即复盘</button>'
      + '    <button class="btn ghost small rb-dismiss" data-cycle="' + pendingCycle + '" title="3 天内不再提示">×</button>'
      + '  </div>'
      + '</div>';
  }

  // 复盘 section 渲染
  function renderReviewSection(p) {
    var reviews = (p.reviews || []).slice().sort(function (a, b) { return b.ts - a.ts; });
    var blurred = p.private && shouldBlur(p);
    var html = '<div class="section-title">复盘（' + reviews.length + '）</div>';
    if (reviews.length === 0) {
      html += '<div style="text-align: center; color: var(--text-mute); padding: 24px 0; font-size: 13px;">还没有复盘。跨过 3/7/15/30 天等周期时会自动提示你做复盘。</div>';
    } else {
      html += '<div class="review-list' + (blurred ? ' is-blurred' : '') + '">';
      reviews.forEach(function (r) {
        html += '<div class="review-card" data-rid="' + r.id + '" onclick="window.__qt.openEditReview(\'' + p.id + '\',\'' + r.id + '\')">'
             + '  <div class="rv-head">'
             + '    <span class="rv-cycle">' + esc(r.cycleDays) + ' 天复盘</span>'
             + '    <span class="rv-ts">' + esc(formatRelative(r.ts)) + '</span>'
             + '  </div>';
        if (r.achievement) html += '<div class="rv-field"><span class="rv-tag tag-ach">✨ 成就</span><div class="rv-text">' + esc(r.achievement) + '</div></div>';
        if (r.improvement) html += '<div class="rv-field"><span class="rv-tag tag-imp">🔧 不足</span><div class="rv-text">' + esc(r.improvement) + '</div></div>';
        if (r.nextPlan)    html += '<div class="rv-field"><span class="rv-tag tag-next">🎯 下一步</span><div class="rv-text">' + esc(r.nextPlan) + '</div></div>';
        html += '</div>';
      });
      html += '</div>';
    }
    // 主动新建按钮
    html += '<button class="btn block" style="margin-top: 8px;" onclick="window.__qt.openNewReview(\'' + p.id + '\')">+ 新建复盘</button>';
    return html;
  }

  // ============== C2：成就徽章 ==============
  // 基于现有数据计算徽章解锁状态，只展示不打扰（无弹窗、无去重记录）
  // streakDays = 当前连续坚持天数；每个徽章独立判断
  function computeBadges(p) {
    var days = (function () {
      var s = currentStreak(p);
      return s != null ? Math.floor(s / DAY_MS) : 0;
    })();
    var relapseCount = Math.max(0, p.records.length - 1); // 破戒次数（不含首条开始记录）
    var reviewCount = (p.reviews || []).length;
    // 历史最长（已完成间隔）
    var bestDays = p.bestStreak ? Math.floor(p.bestStreak / DAY_MS) : 0;
    // 是否有过破戒（至少 1 次破戒记录）
    var hasRelapse = relapseCount > 0;
    // 判据：任意相邻记录间隔 < 24h（含「开始 → 首次破戒」）——数据模型没有"重新出发"事件，
    // 徽章语义按批次 5 决策 3 定为"快速破戒仍如实记录"（原文案"重新出发"与判据相反，已修正）
    var fastRebound = false;
    for (var i = 1; i < p.records.length; i++) {
      var gap = recordTs(p.records[i]) - recordTs(p.records[i - 1]);
      if (typeof gap === 'number' && gap < DAY_MS && gap > 0) { fastRebound = true; break; }
    }

    return [
      { icon: '🌱', name: '启程', desc: '创建第一个戒断项目', unlocked: true },
      { icon: '📝', name: '首次破戒', desc: '诚实记录第一次破戒', unlocked: hasRelapse },
      { icon: '💪', name: '三天不倒', desc: '连续坚持 3 天', unlocked: days >= 3 || bestDays >= 3 },
      { icon: '🌟', name: '一周新星', desc: '连续坚持 7 天', unlocked: days >= 7 || bestDays >= 7 },
      { icon: '🔥', name: '两周突破', desc: '连续坚持 14 天', unlocked: days >= 14 || bestDays >= 14 },
      { icon: '🏆', name: '月度王者', desc: '连续坚持 30 天', unlocked: days >= 30 || bestDays >= 30 },
      { icon: '👑', name: '百天传奇', desc: '连续坚持 100 天', unlocked: days >= 100 || bestDays >= 100 },
      { icon: '⚡', name: '诚实记录', desc: '24 小时内又破戒，也如实记下', unlocked: fastRebound },
      { icon: '🧘', name: '复盘初体验', desc: '完成第一次复盘', unlocked: reviewCount >= 1 },
      { icon: '📚', name: '复盘达人', desc: '完成 3 次复盘', unlocked: reviewCount >= 3 },
      { icon: '🎯', name: '目标达成', desc: '完成设定的目标天数', unlocked: p.goalDays > 0 && days >= p.goalDays },
      { icon: '🛡️', name: '戒断勇士', desc: '破戒 ≥5 次仍不放弃', unlocked: relapseCount >= 5 }
    ];
  }

  function renderBadgeSection(p) {
    var badges = computeBadges(p);
    var unlockedCount = badges.filter(function (b) { return b.unlocked; }).length;
    var blurred = p.private && shouldBlur(p);
    var html = '<div class="section-title">成就（' + unlockedCount + '/' + badges.length + '）</div>';
    if (unlockedCount === 0) {
      html += '<div style="text-align:center; color:var(--text-mute); padding:20px 0; font-size:13px;">还没有解锁徽章，坚持记录会慢慢点亮它们 ✨</div>';
      return html;
    }
    html += '<div class="badge-grid' + (blurred ? ' is-blurred' : '') + '">';
    badges.forEach(function (b) {
      html += '<div class="badge' + (b.unlocked ? ' unlocked' : ' locked') + '" title="' + esc(b.name + '：' + b.desc) + '">'
           + '  <div class="badge-icon">' + b.icon + '</div>'
           + '  <div class="badge-name">' + esc(b.name) + '</div>'
           + '</div>';
    });
    html += '</div>';
    return html;
  }

  // ============== 日历 ==============
  // 把 records 按 yyyy-mm-dd 索引，返回 {key: count}
  function buildRecordCountMap(p) {
    var map = {};
    // 首条为"开始记录"，不算破戒 —— 与列表/详情/洞察/徽章口径一致（统一用 slice(1)）
    p.records.slice(1).forEach(function (r) {
      var ts = recordTs(r);
      if (typeof ts !== 'number') return;
      var d = new Date(ts);
      var key = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }

  // 破戒次数 -> 3 档色阶（用户偏好：简朴）
  // 0 = 无；1 = 一次；2+ = 多次
  function heatLevel(count) {
    if (!count) return 0;
    if (count === 1) return 1;
    return 2;
  }

  function renderCalendar(p) {
    var now = new Date();
    var recordMap = buildRecordCountMap(p);
    var total = 0;
    var max = 0;
    Object.keys(recordMap).forEach(function (k) {
      total += recordMap[k];
      if (recordMap[k] > max) max = recordMap[k];
    });
    var blurred = p.private && shouldBlur(p);
    var html = ''
      // Tab 切换
      + '<div class="cal-tabs">'
      + '  <button class="cal-tab' + (calView === 'month' ? ' active' : '') + '" data-view="month">月历</button>'
      + '  <button class="cal-tab' + (calView === 'year' ? ' active' : '') + '" data-view="year">年热力图</button>'
      + '</div>'
      + '<div class="calendar-wrap' + (blurred ? ' is-blurred' : '') + '">'
      + (calView === 'month' ? renderMonth(p, now, recordMap)
                              : renderYearHeatmap(p, now, recordMap, total, max))
      + '</div>';

    return html;
  }

  function renderMonth(p, now, recordMap) {
    var year = now.getFullYear();
    var month = now.getMonth() + calMonthOffset;
    while (month < 0) { month += 12; year--; }
    while (month > 11) { month -= 12; year++; }
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);
    var startDow = firstDay.getDay();
    var daysInMonth = lastDay.getDate();
    var monthName = firstDay.toLocaleString('zh-CN', { year: 'numeric', month: 'long' });

    var html = ''
      + '<div class="cal-head">'
      + '  <button class="icon-btn" onclick="window.__qt.calPrev()" aria-label="上月">'
      + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>'
      + '  </button>'
      + '  <h3>' + esc(monthName) + '</h3>'
      + '  <button class="icon-btn" onclick="window.__qt.calNext()" aria-label="下月">'
      + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polyline points="9 18 15 12 9 6"/></svg>'
      + '  </button>'
      + '</div>'
      + '<div class="cal-grid">'
      + calDows()
      + calCells()
      + '</div>'
      + calLegend();

    function calDows() {
      return ['日','一','二','三','四','五','六']
        .map(function (d) { return '<div class="cal-dow">' + d + '</div>'; })
        .join('');
    }

    function calCells() {
      var out = '';
      var todayKey = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
      for (var i = 0; i < startDow; i++) {
        out += '<div class="cal-day muted"></div>';
      }
      for (var d = 1; d <= daysInMonth; d++) {
        var key = year + '-' + pad2(month + 1) + '-' + pad2(d);
        var count = recordMap[key] || 0;
        var level = heatLevel(count);
        var classes = ['cal-day', 'lv-' + level];
        if (key === todayKey) classes.push('today');
        var label = (key === todayKey && count === 0) ? '今天' : d;
        // 破戒次数以右上角角标呈现，日期数字不再被"N 次"替换
        var badge = count > 0 ? '<span class="cal-count">' + count + '</span>' : '';
        var title = key + (count ? ' · ' + count + ' 次破戒' : '');
        out += '<div class="' + classes.join(' ') + '" title="' + esc(title) + '">' + label + badge + '</div>';
      }
      return out;
    }

    return html;
  }

  // 年热力图：365 天，GitHub 贡献图风格
  function renderYearHeatmap(p, now, recordMap, total, max) {
    var firstRecordTs = null;
    p.records.forEach(function (r) {
      var ts = recordTs(r);
      if (typeof ts === 'number' && (firstRecordTs == null || ts < firstRecordTs)) firstRecordTs = ts;
    });
    var endTs = Date.now();
    var startTs = firstRecordTs != null ? firstRecordTs : (endTs - 364 * DAY_MS);
    var startDate = new Date(startTs);
    startDate.setHours(0, 0, 0, 0);
    // 对齐到周日
    var startOffset = startDate.getDay();
    var alignedStart = new Date(startDate.getTime() - startOffset * DAY_MS);
    var days = Math.ceil((endTs - alignedStart.getTime()) / DAY_MS) + 1;
    var weeks = Math.ceil(days / 7);

    var html = ''
      + '<div class="cal-head"><h3>近 ' + days + ' 天 · 共 ' + total + ' 次破戒</h3></div>'
      + '<div class="heatmap-wrap">'
      + '  <div class="heatmap-grid">'
      + '    <div class="heatmap-dows">'
      +       ['日','一','二','三','四','五','六'].map(function (d) { return '<div class="hm-dow">' + d + '</div>'; }).join('')
      + '    </div>'
      + '    <div class="heatmap-cells">';

    // 月份标签 - 每列第一个新月份开始的位置标记
    var lastMonth = -1;
    var monthLabels = '';
    for (var w = 0; w < weeks; w++) {
      var firstDayOfCol = new Date(alignedStart.getTime() + w * 7 * DAY_MS);
      var m = firstDayOfCol.getMonth();
      if (m !== lastMonth) {
        monthLabels += '<div class="hm-month-label" style="grid-column: ' + (w + 1) + ';">' + (m + 1) + '月</div>';
        lastMonth = m;
      }
    }

    for (var w2 = 0; w2 < weeks; w2++) {
      html += '<div class="hm-col">';
      for (var r = 0; r < 7; r++) {
        var idx = w2 * 7 + r;
        var ts = alignedStart.getTime() + idx * DAY_MS;
        var day = new Date(ts);
        var future = ts > endTs;
        var key = day.getFullYear() + '-' + pad2(day.getMonth() + 1) + '-' + pad2(day.getDate());
        var count = recordMap[key] || 0;
        var level = future ? -1 : heatLevel(count);
        var cls = 'hm-cell';
        if (future) cls += ' future';
        else cls += ' lv-' + level;
        var title = key + (count ? ' · ' + count + ' 次' : ' · 0 次');
        html += '<div class="' + cls + '" title="' + esc(title) + '" data-key="' + key + '" data-count="' + count + '"></div>';
      }
      html += '</div>';
    }
    html += '    </div>'
         + '  </div>'
         + '  <div class="heatmap-months">' + monthLabels + '</div>'
         + '</div>'
         + calLegend();

    return html;
  }

  // 图例
  function calLegend() {
    return '<div class="cal-legend">'
         + '  <span class="cal-legend-text">0 次</span>'
         + '  <span class="hm-cell lv-0"></span>'
         + '  <span class="hm-cell lv-1"></span>'
         + '  <span class="hm-cell lv-2"></span>'
         + '  <span class="cal-legend-text">2+ 次</span>'
         + '</div>';
  }


  // ============== 模态框（弹窗栈） ==============
  // 支持叠加：编辑弹窗里点"删除"→ 确认弹窗压在编辑弹窗之上，取消后回到编辑弹窗不丢内容
  var modalStack = [];
  // 被延后的自动弹窗队列（用户弹窗打开时暂不打断）。
  // 必须是队列而非单槽：多个复盘周期同时跨过时逐个补弹——单槽会被最后一个覆盖，中间周期的提示永久丢失
  var pendingAutoModals = [];

  // 自动弹窗互斥：用户正在填表时不抢占，等弹窗栈清空后再补弹
  function runAutoModal(fn) {
    if (modalStack.length > 0) { pendingAutoModals.push(fn); return; }
    fn();
  }

  // modalClass 用于覆盖默认 modal 样式（如 milestone-modal）。
  // 防误关（用户要求）：单击遮罩不关闭弹窗——正在输入的内容不会因误触丢失；
  // 关闭途径只有「取消 / 确定 / 关闭」按钮与 ESC，因此每个弹窗必须自带关闭入口
  function pushModalBack(html, onMount, modalClass) {
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.style.zIndex = 100 + modalStack.length * 10; // 栈越深越靠上
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.innerHTML = '<div class="modal' + (modalClass ? ' ' + modalClass : '') + '" onclick="event.stopPropagation()">'
                   + html + '</div>';
    back._qtReturnFocus = document.activeElement; // 关闭时归还焦点（a11y：避免焦点落回 body）
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden'; // 锁定背景滚动，防遮罩穿透
    modalStack.push(back);
    if (onMount) onMount(back);
    return back;
  }

  function showModal(title, bodyHtml, onMount) {
    return pushModalBack(
      '  <h2>' + esc(title) + '</h2>'
      + '  <div id="qt-modal-body">' + bodyHtml + '</div>',
      onMount
    );
  }

  function closeModal() {
    var back = modalStack.pop();
    if (back) {
      back.remove();
      // 归还焦点到打开弹窗前的元素（该元素可能已被重渲染移除，focus 静默失败即可）
      if (back._qtReturnFocus && typeof back._qtReturnFocus.focus === 'function') {
        try { back._qtReturnFocus.focus(); } catch (e) {}
      }
    }
    if (modalStack.length === 0) {
      document.body.style.overflow = '';
      // 用户弹窗全部关闭后，按序补弹此前被延后的自动弹窗（延迟一帧，避免同一轮事件内重建 DOM）
      if (pendingAutoModals.length) {
        var fn = pendingAutoModals.shift();
        setTimeout(function () { if (modalStack.length === 0) fn(); }, 0);
      }
    }
  }

  // ---------- 新建/编辑项目 ----------
  function openNewProject() {
    closeModal(); // 排他性弹窗：先关已有弹窗（确认类弹窗才会叠加）
    var html = ''
      + '<div class="field"><label>项目名称</label><input class="input" id="qt-name" placeholder="例如：戒奶茶" maxlength="20"></div>'
      + '<div class="field"><label>开始戒断时间</label><input class="input" type="datetime-local" id="qt-start" value="' + inputDateTimeValue(Date.now()) + '"><div style="font-size:12px;color:var(--text-mute);margin-top:6px;">从此刻开始计时。可以改成更早的时间（回溯记录）。</div></div>'
      + '<div class="field"><label>目标坚持天数（可选）</label><input class="input" type="number" id="qt-goal" min="0" max="3650" placeholder="例如：30 天，留空则不限目标"><div style="font-size:12px;color:var(--text-mute);margin-top:6px;">设定目标后详情页会显示进度条。</div></div>'
      + '<div class="field"><label>分类（可选）</label><div class="tag-picker" id="qt-cat"></div></div>'
      + '<div class="field"><label>隐私项目</label><label class="privacy-toggle"><input type="checkbox" id="qt-private"> <span>设为隐私项目（对外展示时内容模糊，需点 👁 查看）</span></label></div>'
      + '<div class="field"><label>选择图标</label><div class="emoji-picker" id="qt-emoji"></div></div>'
      + '<div class="modal-actions">'
      + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
      + '  <button class="btn primary" id="qt-save-btn">创建</button>'
      + '</div>';

    showModal('新建项目', html, function (back) {
      var nameInput = back.querySelector('#qt-name');
      if (nameInput) nameInput.focus(); // autofocus 对 innerHTML 插入无效，显式聚焦
      var picker = back.querySelector('#qt-emoji');
      var emojiPicker = buildEmojiPicker(picker, EMOJI_LIST[0]);
      var catPicker = buildCategoryPicker(back.querySelector('#qt-cat'), '');
      back.querySelector('#qt-save-btn').addEventListener('click', function () {
        var unlock = lockSaveBtn(back.querySelector('#qt-save-btn'));
        var name = back.querySelector('#qt-name').value.trim();
        if (!name) { unlock(); toast('请填写项目名称'); return; }
        var startStr = back.querySelector('#qt-start').value;
        var parsed = parseRecordTime(startStr || inputDateTimeValue(Date.now()));
        if (!parsed.ok) { unlock(); toast(parsed.msg); return; }
        var goalVal = parseInt(back.querySelector('#qt-goal').value, 10);
        if (!isNaN(goalVal) && goalVal > 3650) { unlock(); toast('目标天数最多 3650 天'); return; } // input max 只是 UI 属性，手输可绕过
        var goal = (!isNaN(goalVal) && goalVal > 0) ? goalVal : 0;
        var isPrivate = back.querySelector('#qt-private').checked;
        var p = newProject(name, emojiPicker.getValue(), parsed.ts, goal, isPrivate, catPicker.getValue());
        state.projects.push(p);
        recalcBest(p);
        saveState();
        closeModal();
        render();
        var dur = formatDuration(currentStreak(p));
        toast('已创建：' + p.name + ' · 已坚持 ' + dur.short);
        // 弹里程碑庆祝（如果回溯到了某个里程碑）
        maybeShowMilestone(p, dur);
        // 复盘提示：跨过 3/7/15/30 周期时也会弹（延迟避免和里程碑同框）
        if (dur.d >= 3) {
          setTimeout(function () { checkReviewTick(p, dur); }, REVIEW_PROMPT_DELAY);
        }
      });
      // 回车提交
      back.querySelector('#qt-name').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') back.querySelector('#qt-save-btn').click();
      });
    });
  }

  function openEditProject(id) {
    var p = getProject(id);
    if (!p) return;
    if (guardPrivate(p)) return; // 演示模式锁定隐私项目
    closeModal(); // 排他性弹窗
    var html = ''
      + '<div class="field"><label>项目名称</label><input class="input" id="qt-name" value="' + esc(p.name) + '" maxlength="20"></div>'
      + '<div class="field"><label>目标坚持天数（可选，0 = 不限）</label><input class="input" type="number" id="qt-goal" min="0" max="3650" value="' + (p.goalDays || 0) + '"></div>'
      + '<div class="field"><label>分类</label><div class="tag-picker" id="qt-cat"></div></div>'
      + '<div class="field"><label>隐私项目</label><label class="privacy-toggle"><input type="checkbox" id="qt-private"' + (p.private ? ' checked' : '') + '> <span>设为隐私项目（对外展示时内容模糊，需点 👁 查看）</span></label></div>'
      + '<div class="field"><label>图标</label><div class="emoji-picker" id="qt-emoji"></div></div>'
      + '<div class="modal-actions">'
      + '  <button class="btn danger" onclick="window.__qt.confirmDeleteProject(\'' + p.id + '\')">删除</button>'
      + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
      + '  <button class="btn primary" id="qt-save-btn">保存</button>'
      + '</div>';
    showModal('编辑项目', html, function (back) {
      var nameInput = back.querySelector('#qt-name');
      if (nameInput) nameInput.focus(); // autofocus 对 innerHTML 插入无效，显式聚焦
      var picker = back.querySelector('#qt-emoji');
      var emojiPicker = buildEmojiPicker(picker, p.emoji);
      var catPicker = buildCategoryPicker(back.querySelector('#qt-cat'), p.category);
      back.querySelector('#qt-save-btn').addEventListener('click', function () {
        var unlock = lockSaveBtn(back.querySelector('#qt-save-btn'));
        var name = back.querySelector('#qt-name').value.trim();
        if (!name) { unlock(); toast('请填写项目名称'); return; }
        p.name = name;
        p.emoji = emojiPicker.getValue();
        var goalVal = parseInt(back.querySelector('#qt-goal').value, 10);
        if (!isNaN(goalVal) && goalVal > 3650) { unlock(); toast('目标天数最多 3650 天'); return; }
        p.goalDays = (!isNaN(goalVal) && goalVal > 0) ? goalVal : 0;
        // 隐私标记切换：勾选=设为隐私；取消勾选=转公开（同时清除可能残留的隐藏状态）
        p.private = back.querySelector('#qt-private').checked;
        p.category = catPicker.getValue();
        if (!p.private) p.eyeOpen = false;
        saveState();
        closeModal();
        render();
        toast('已保存');
      });
    });
  }

  // ---------- 新增记录（破戒） ----------
  function openAddRecord(id) {
    var p = getProject(id);
    if (!p) return;
    if (guardPrivate(p)) return; // 演示模式锁定隐私项目
    closeModal(); // 排他性弹窗
    var now = Date.now();
    var html = ''
      + '<div style="background:var(--bg-elev); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; color: var(--text-sub);">'
      + '  <div style="margin-bottom: 6px;">' + esc(p.emoji) + ' <b style="color:var(--text)">' + esc(p.name) + '</b></div>'
      + (p.records.length
          ? '  当前已坚持 <b style="color:var(--accent)">' + formatDuration(currentStreak(p)).short + '</b>，这次又会重置计时器。'
          : '  这是你的第一次记录。')
      + '</div>'
      + '<div class="field"><label>发生时间</label><input class="input" type="datetime-local" id="qt-time" value="' + inputDateTimeValue(now) + '"></div>'
      + '<div class="field"><label>原因（可选，可多选）</label><div class="tag-picker" id="qt-tags"></div></div>'
      + '<div class="field"><label>备注（可选）</label><textarea class="textarea" id="qt-note" placeholder="比如：朋友聚会 / 心情不好…" maxlength="200"></textarea></div>'
      + '<div class="modal-actions">'
      + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
      + '  <button class="btn primary" id="qt-save-btn">确认记录</button>'
      + '</div>';

    showModal('记录一次破戒', html, function (back) {
      var timeInput = back.querySelector('#qt-time');
      var tagPicker = buildTagPicker(back.querySelector('#qt-tags'), []);
      timeInput.focus();
      back.querySelector('#qt-save-btn').addEventListener('click', function () {
        var unlock = lockSaveBtn(back.querySelector('#qt-save-btn'));
        var parsed = parseRecordTime(timeInput.value);
        if (!parsed.ok) { unlock(); toast(parsed.msg); return; }
        // 补录早于首条记录：会重置"已坚持"计时，明确提示影响
        if (p.records.length && parsed.ts < recordTs(p.records[0])) {
          toast('该时间早于当前开始时间，计时将重新开始');
        }
        var note = back.querySelector('#qt-note').value;
        addRecord(p.id, parsed.ts, note, tagPicker.getValue());
        closeModal();
        render();
        var newStreak = currentStreak(p);
        if (newStreak != null) {
          toast('已记录，新的坚持从此刻开始：' + formatDuration(newStreak).compact);
        } else {
          toast('已记录');
        }
      });
    });
  }

  // ---------- 删除确认 ----------
  function confirmDeleteProject(id) {
    var p = getProject(id);
    if (!p) return;
    if (guardPrivate(p)) return; // 演示模式锁定隐私项目
    showModal('删除项目？', '<p style="color: var(--text-sub); font-size: 14px; margin: 0 0 8px;">将永久删除 <b>' + esc(p.name) + '</b> 及其所有 <b>' + p.records.length + '</b> 条记录，此操作不可撤销。</p>'
      + '<div class="modal-actions">'
      + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
      + '  <button class="btn danger" id="qt-confirm">确认删除</button>'
      + '</div>',
      function (back) {
        back.querySelector('#qt-confirm').addEventListener('click', function () {
          state.projects = state.projects.filter(function (x) { return x.id !== id; });
          saveState();
          closeModal();
          view = 'list'; detailId = null;
          render();
          toast('已删除');
        });
      });
  }

  function confirmDeleteRecord(pid, rid) {
    if (guardPrivate(getProject(pid))) return; // 演示模式锁定隐私项目
    showModal('删除这条记录？', '<p style="color: var(--text-sub); font-size: 14px; margin: 0 0 8px;">删除后会自动重新计算统计数据。</p>'
      + '<div class="modal-actions">'
      + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
      + '  <button class="btn danger" id="qt-confirm">删除</button>'
      + '</div>',
      function (back) {
        back.querySelector('#qt-confirm').addEventListener('click', function () {
          deleteRecord(pid, rid);
          closeModal();
          render();
          toast('已删除');
        });
      });
  }

  // 编辑单条记录
  function openEditRecord(pid, rid) {
    var p = getProject(pid);
    if (!p) return;
    if (guardPrivate(p)) return; // 演示模式锁定隐私项目
    closeModal(); // 排他性弹窗
    var r = p.records.find(function (x) { return x.id === rid; });
    if (!r) return;
    var rTs = recordTs(r);
    var rNote = recordNote(r);
    var html = ''
      + '<div class="field"><label>发生时间</label><input class="input" type="datetime-local" id="qt-time" value="' + inputDateTimeValue(rTs) + '"></div>'
      + '<div class="field"><label>原因（可选，可多选）</label><div class="tag-picker" id="qt-tags"></div></div>'
      + '<div class="field"><label>备注</label><textarea class="textarea" id="qt-note" maxlength="200">' + esc(rNote) + '</textarea></div>'
      + '<div class="modal-actions">'
      + '  <button class="btn danger" onclick="window.__qt.confirmDeleteRecord(\'' + pid + '\',\'' + rid + '\')">删除</button>'
      + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
      + '  <button class="btn primary" id="qt-save-btn">保存</button>'
      + '</div>';

    showModal('编辑记录', html, function (back) {
      var tagPicker = buildTagPicker(back.querySelector('#qt-tags'), recordTags(r));
      back.querySelector('#qt-save-btn').addEventListener('click', function () {
        var unlock = lockSaveBtn(back.querySelector('#qt-save-btn'));
        var parsed = parseRecordTime(back.querySelector('#qt-time').value);
        if (!parsed.ok) { unlock(); toast(parsed.msg); return; }
        var note = back.querySelector('#qt-note').value;
        updateRecord(pid, rid, parsed.ts, note, tagPicker.getValue());
        closeModal();
        render();
        toast('已保存');
      });
    });
  }

  // ============== 复盘表单 ==============
  // 通用表单渲染：prefill 可选 {achievement, improvement, nextPlan, cycleDays}
  function reviewFormHtml(prefill, title) {
    prefill = prefill || {};
    var cycleOptions = REVIEW_CYCLES.map(function (c) {
      var sel = (prefill.cycleDays === c) ? ' selected' : '';
      return '<option value="' + c + '"' + sel + '>' + c + ' 天</option>';
    }).join('');
    return ''
      + '<div class="field"><label>复盘周期</label>'
      + '  <select class="input" id="qt-cycle">' + cycleOptions + '</select>'
      + '  <div style="font-size:12px;color:var(--text-mute);margin-top:6px;">选择这次复盘对应的周期</div>'
      + '</div>'
      + '<div class="field"><label>✨ 成就</label>'
      + '  <textarea class="textarea" id="qt-ach" maxlength="500" placeholder="这周期你做到了什么？比如：连续 7 天没破戒，比上一次更稳">'
      + esc(prefill.achievement || '') + '</textarea></div>'
      + '<div class="field"><label>🔧 不足 & 改进</label>'
      + '  <textarea class="textarea" id="qt-imp" maxlength="500" placeholder="哪里做得不够好？下次怎么改？">'
      + esc(prefill.improvement || '') + '</textarea></div>'
      + '<div class="field"><label>🎯 下一步计划</label>'
      + '  <textarea class="textarea" id="qt-next" maxlength="500" placeholder="下一个周期的具体目标是什么？">'
      + esc(prefill.nextPlan || '') + '</textarea></div>'
      + '<div class="modal-actions">'
      + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
      + '  <button class="btn primary" id="qt-save-btn">' + esc(title || '保存') + '</button>'
      + '</div>';
  }

  function openNewReview(pid, cycleDays) {
    var p = getProject(pid);
    if (!p) return;
    if (guardPrivate(p)) return; // 演示模式锁定隐私项目
    closeModal(); // 排他性弹窗
    var streak = currentStreak(p);
    var defaultCycle = cycleDays;
    if (!defaultCycle) {
      // 找最近一个跨过但还没复盘的周期
      var days = streak ? Math.floor(streak / DAY_MS) : 0;
      defaultCycle = REVIEW_CYCLES.slice().reverse().find(function (c) { return c <= days; }) || REVIEW_CYCLES[0];
    }
    var html = reviewFormHtml({ cycleDays: defaultCycle }, '保存复盘');
    showModal('新建复盘', html, function (back) {
      back.querySelector('#qt-save-btn').addEventListener('click', function () {
        var unlock = lockSaveBtn(back.querySelector('#qt-save-btn'));
        var cycle = parseInt(back.querySelector('#qt-cycle').value, 10) || defaultCycle;
        var ach = back.querySelector('#qt-ach').value;
        var imp = back.querySelector('#qt-imp').value;
        var next = back.querySelector('#qt-next').value;
        if (!ach.trim() && !imp.trim() && !next.trim()) {
          unlock();
          toast('至少填写一项内容');
          return;
        }
        // FL-6：所选周期大于当前坚持天数时提示（不阻断，避免将来该周期不再提醒复盘）
        var currentDays = streak ? Math.floor(streak / DAY_MS) : 0;
        if (cycle > currentDays) {
          toast('当前仅坚持 ' + currentDays + ' 天，选择 ' + cycle + ' 天周期可能不准确');
        }
        addReview(pid, cycle, ach, imp, next);
        closeModal();
        render();
        toast('复盘已保存');
      });
    });
  }

  function openEditReview(pid, rid) {
    var p = getProject(pid);
    if (!p) return;
    if (guardPrivate(p)) return; // 演示模式锁定隐私项目
    closeModal(); // 排他性弹窗
    var r = p.reviews.find(function (x) { return x.id === rid; });
    if (!r) return;
    var html = ''
      + '<div class="field"><label>复盘日期</label><div style="padding:11px 14px; background:var(--bg-input); border-radius:8px; font-size:14px;">'
      + esc(formatDateTime(r.ts)) + '</div></div>'
      + reviewFormHtml({
          cycleDays: r.cycleDays,
          achievement: r.achievement,
          improvement: r.improvement,
          nextPlan: r.nextPlan
        }, '保存')
      + '<div style="margin-top: -8px;"><button class="btn danger block" id="qt-del-review">删除这条复盘</button></div>';

    showModal('编辑复盘', html, function (back) {
      back.querySelector('#qt-save-btn').addEventListener('click', function () {
        var unlock = lockSaveBtn(back.querySelector('#qt-save-btn'));
        var cycle = parseInt(back.querySelector('#qt-cycle').value, 10) || r.cycleDays;
        var ach = back.querySelector('#qt-ach').value;
        var imp = back.querySelector('#qt-imp').value;
        var next = back.querySelector('#qt-next').value;
        updateReview(pid, rid, cycle, ach, imp, next);
        closeModal();
        render();
        toast('已保存');
      });
      back.querySelector('#qt-del-review').addEventListener('click', function () {
        confirmDeleteReview(pid, rid);
      });
    });
  }

  function confirmDeleteReview(pid, rid) {
    if (guardPrivate(getProject(pid))) return; // 演示模式锁定隐私项目
    showModal('删除这条复盘？', '<p style="color: var(--text-sub); font-size: 14px; margin: 0 0 8px;">此操作不可撤销。</p>'
      + '<div class="modal-actions">'
      + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
      + '  <button class="btn danger" id="qt-confirm">删除</button>'
      + '</div>',
      function (back) {
        back.querySelector('#qt-confirm').addEventListener('click', function () {
          deleteReview(pid, rid);
          closeModal();
          render();
          toast('已删除');
        });
      });
  }

  // ============== D1：周报 / 月报生成 ==============
  // 汇总周期内的坚持天数、破戒次数、最长连胜、主要破戒原因（A1 tags）、复盘摘要
  // ---------- 周报 / 月报：海报（v5） ----------
  // 周期统计：破戒次数 + 最长坚持段（段起止都裁剪进窗口，避免把窗口外的时长算进来）
  // ⚠️ 这里刻意不返回"周期内坚持总时长"：各坚持段在窗口内首尾相接、无缝铺满，
  //    其总和恒等于窗口长度（近 7 天永远是"7 天"），没有信息量。原周报的"周期内坚持"就是这个问题。
  function periodStats(p, fromTs, toTs) {
    var recs = p.records, relapses = 0, maxSeg = 0, i, t, prev, seg;
    for (i = 1; i < recs.length; i++) { // 首条为"开始记录"，不计破戒
      t = recordTs(recs[i]);
      if (typeof t !== 'number' || t < fromTs || t > toTs) continue;
      relapses++;
      prev = recordTs(recs[i - 1]);
      seg = t - Math.max(typeof prev === 'number' ? prev : fromTs, fromTs);
      if (seg > maxSeg) maxSeg = seg;
    }
    // 进行中的那段：与窗口取交集
    var lastTs = recs.length ? recordTs(recs[recs.length - 1]) : null;
    if (typeof lastTs === 'number') {
      var a = Math.max(lastTs, fromTs);
      var b = Math.min(Date.now(), toTs);
      if (b > a && (b - a) > maxSeg) maxSeg = b - a;
    }
    return { relapses: relapses, maxSeg: maxSeg };
  }

  // 海报数据（纯计算，便于测试）。nowTs 可注入，测试时无需依赖真实时间
  function posterData(p, rangeDays, nowTs) {
    var now = typeof nowTs === 'number' ? nowTs : Date.now();
    var day = DAY_MS;
    var cur = periodStats(p, now - rangeDays * day, now);
    var prev = periodStats(p, now - 2 * rangeDays * day, now - rangeDays * day);
    var streakMs = currentStreak(p);
    var days = streakMs != null ? Math.floor(streakMs / day) : 0;
    var goal = p.goalDays > 0 ? p.goalDays : 0;
    var bestDays = p.bestStreak > 0 ? Math.floor(p.bestStreak / day) : 0;
    // 环的语义按优先级回落：目标进度 → 与"历史最长"的差距（有激励感）→ 无可比基准则不画弧
    var pct, ringLabel;
    if (goal > 0) {
      pct = Math.min(1, days / goal);
      ringLabel = days >= goal ? '🎉 已达成目标 ' + goal + ' 天'
                               : '目标 ' + goal + ' 天 · 还差 ' + Math.max(0, goal - days) + ' 天';
    } else if (bestDays > 0) {
      pct = Math.min(1, days / bestDays);
      ringLabel = '历史最长 ' + bestDays + ' 天 · 已完成 ' + Math.round(pct * 100) + '%';
    } else {
      pct = 0;
      ringLabel = '未设目标 · 每多一天都是净赚';
    }
    var badges = computeBadges(p);
    var unlocked = badges.filter(function (b) { return b.unlocked; });
    return {
      rangeDays: rangeDays,
      days: days,                                   // 主角：当前连胜天数
      goalDays: goal,
      bestDays: bestDays,
      pct: pct,
      ringLabel: ringLabel,
      goalDone: goal > 0 && days >= goal,
      cur: cur,
      prev: prev,
      relapseDelta: cur.relapses - prev.relapses,   // < 0 = 本期更少（更好）
      maxSegDelta: cur.maxSeg - prev.maxSeg,        // > 0 = 本期更长（更好）
      badgeTotal: badges.length,
      badgeUnlocked: unlocked.length,
      badgeIcons: unlocked.map(function (b) { return b.icon; })
    };
  }

  // 变化量渲染：goodWhenNegative 为 true 时"变小"算好（如破戒次数）
  // prevValue 为 0 时不给趋势判断（从 0 增长既不是进步也不是退步），改为中性提示
  function deltaTag(delta, goodWhenNegative, isDuration, prevValue) {
    if (!delta) return '<span class="pd-same">持平</span>';
    if (!prevValue) return '<span class="pd-same">本期新增</span>';
    var better = goodWhenNegative ? delta < 0 : delta > 0;
    var txt = isDuration ? formatDuration(Math.abs(delta)).short : Math.abs(delta) + ' 次';
    return '<span class="' + (better ? 'pd-good' : 'pd-bad') + '">'
         + (delta > 0 ? '↑' : '↓') + ' ' + txt + '</span>';
  }

  function renderPoster(p, d) {
    var C = 2 * Math.PI * 88; // 环周长（r=88）
    var offset = (C * (1 - d.pct)).toFixed(1);
    var today = formatDateTime(Date.now()).slice(0, 10);
    var goalText = d.ringLabel;
    var segCur = d.cur.maxSeg > 0 ? formatDuration(d.cur.maxSeg).short : '—';
    var segPrev = d.prev.maxSeg > 0 ? formatDuration(d.prev.maxSeg).short : '—';

    return ''
      + '<div class="poster" id="qt-poster">'
      + '  <div class="poster-top">'
      + '    <span>戒断 · 习惯追踪</span>'
      + '    <span>近 ' + d.rangeDays + ' 天</span>'
      + '  </div>'
      + '  <div class="poster-title">' + esc(p.emoji) + ' ' + esc(p.name) + '</div>'
      + '  <div class="poster-ringwrap">'
      + '    <svg class="poster-ring" viewBox="0 0 200 200" aria-hidden="true">'
      + '      <circle cx="100" cy="100" r="88" fill="none" stroke="#282828" stroke-width="14"></circle>'
      + (d.pct > 0
          ? '      <circle cx="100" cy="100" r="88" fill="none" stroke="#1db954" stroke-width="14"'
            + ' stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + offset + '"'
            + ' transform="rotate(-90 100 100)"></circle>'
          : '')
      + '    </svg>'
      + '    <div class="poster-ringin">'
      + '      <div class="poster-days">' + d.days + '</div>'
      + '      <div class="poster-unit">天</div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="poster-goal' + (d.goalDone ? ' done' : '') + '">' + goalText + '</div>'
      + '  <div class="poster-cmp">'
      + '    <div class="pd-col">'
      + '      <div class="pd-label">破戒次数</div>'
      + '      <div class="pd-val">' + d.cur.relapses + '</div>'
      + '      <div class="pd-sub">上期 ' + d.prev.relapses + ' ' + deltaTag(d.relapseDelta, true, false, d.prev.relapses) + '</div>'
      + '    </div>'
      + '    <div class="pd-col">'
      + '      <div class="pd-label">最长单段</div>'
      + '      <div class="pd-val">' + segCur + '</div>'
      + '      <div class="pd-sub">上期 ' + segPrev + ' ' + deltaTag(d.maxSegDelta, false, true, d.prev.maxSeg) + '</div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="poster-badges">'
      + '    <div class="pb-head">已解锁徽章 <b>' + d.badgeUnlocked + '</b> / ' + d.badgeTotal + '</div>'
      + '    <div class="pb-icons">' + d.badgeIcons.map(function (ic) { return '<span>' + ic + '</span>'; }).join('') + '</div>'
      + '  </div>'
      + '  <div class="poster-foot">数据只存在你的设备里 · ' + today + '</div>'
      + '</div>';
  }

  // 用 Canvas 画出同一张海报（零依赖导出 PNG；页面内看到的是 CSS/SVG 版，两者数值一致）
  function drawPosterCanvas(p, d) {
    var W = 900, H = 1240, PAD = 64;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var x = cv.getContext('2d');
    var CN = '"PingFang SC","Microsoft YaHei",sans-serif';
    var EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';

    x.fillStyle = '#121212'; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(29,185,84,.14)'; x.fillRect(0, 0, W, 8);

    x.fillStyle = '#6a6a6a'; x.font = '500 26px ' + CN;
    x.textAlign = 'left'; x.fillText('戒断 · 习惯追踪', PAD, 92);
    x.textAlign = 'right'; x.fillText('近 ' + d.rangeDays + ' 天', W - PAD, 92);

    x.textAlign = 'left';
    x.font = '60px ' + EMOJI; x.fillText(p.emoji, PAD, 182);
    x.fillStyle = '#ffffff'; x.font = 'bold 52px ' + CN; x.fillText(p.name, PAD + 82, 178);

    var cx = W / 2, cy = 500, r = 168, lw = 26;
    x.lineCap = 'round';
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2);
    x.strokeStyle = '#282828'; x.lineWidth = lw; x.stroke();
    if (d.pct > 0) {
      x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d.pct);
      x.strokeStyle = '#1db954'; x.stroke();
    }
    x.textAlign = 'center';
    x.fillStyle = '#ffffff'; x.font = 'bold 160px ' + CN;
    x.fillText(String(d.days), cx, cy + 40);
    x.fillStyle = '#b3b3b3'; x.font = '500 32px ' + CN; x.fillText('天', cx, cy + 94);
    x.fillStyle = d.goalDone ? '#1db954' : '#b3b3b3'; x.font = '500 30px ' + CN;
    x.fillText(d.ringLabel, cx, cy + r + 74);

    x.strokeStyle = '#282828'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(PAD, 848); x.lineTo(W - PAD, 848); x.stroke();

    function col(label, val, sub, cxp, align) {
      x.textAlign = align || 'left';
      x.fillStyle = '#6a6a6a'; x.font = '500 26px ' + CN; x.fillText(label, cxp, 906);
      x.fillStyle = '#ffffff'; x.font = 'bold 60px ' + CN; x.fillText(val, cxp, 972);
      x.fillStyle = '#b3b3b3'; x.font = '500 26px ' + CN; x.fillText(sub, cxp, 1014);
    }
    function plain(txt) { return txt.replace(/[↑↓]\s*/, ''); }
    col('破戒次数', String(d.cur.relapses),
        '上期 ' + d.prev.relapses + ' · ' + plain(deltaTag(d.relapseDelta, true, false, d.prev.relapses)), PAD);
    col('最长单段', d.cur.maxSeg > 0 ? formatDuration(d.cur.maxSeg).short : '—',
        '上期 ' + (d.prev.maxSeg > 0 ? formatDuration(d.prev.maxSeg).short : '—') + ' · ' + plain(deltaTag(d.maxSegDelta, false, true, d.prev.maxSeg)),
        W - PAD, 'right');

    x.textAlign = 'left';
    x.fillStyle = '#6a6a6a'; x.font = '500 26px ' + CN;
    x.fillText('已解锁徽章 ' + d.badgeUnlocked + ' / ' + d.badgeTotal, PAD, 1090);
    x.font = '40px ' + EMOJI;
    x.fillText(d.badgeIcons.slice(0, 10).join(' '), PAD, 1150);

    x.textAlign = 'center'; x.fillStyle = '#6a6a6a'; x.font = '500 24px ' + CN;
    x.fillText('数据只存在你的设备里 · ' + formatDateTime(Date.now()).slice(0, 10), cx, H - 56);
    return cv;
  }

  function exportCanvasPng(cv, filename) {
    function save(url, revoke) {
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    if (typeof cv.toBlob === 'function') {
      cv.toBlob(function (blob) {
        if (blob) save(URL.createObjectURL(blob), true);
        else save(cv.toDataURL('image/png'), false);
      }, 'image/png');
    } else {
      save(cv.toDataURL('image/png'), false); // 老 Safari 兜底
    }
  }

  function openReport(pid) {
    var p = getProject(pid);
    if (!p) return;
    if (guardPrivate(p)) return; // 演示模式锁定隐私项目
    closeModal(); // 排他性弹窗

    var html = ''
      + '<div class="field">'
      + '  <label>报告周期</label>'
      + '  <div class="row" style="gap: 8px;">'
      + '    <button class="btn" id="qt-rpt-week" style="flex:1; justify-content:center;">近 7 天</button>'
      + '    <button class="btn" id="qt-rpt-month" style="flex:1; justify-content:center;">近 30 天</button>'
      + '  </div>'
      + '</div>'
      + '<div id="qt-rpt-body"></div>'
      + '<div class="modal-actions">'
      + '  <button class="btn ghost small" id="qt-rpt-copy" style="flex: 0 0 auto;">复制文字版</button>'
      + '  <button class="btn primary" id="qt-rpt-save" style="flex: 1;">保存为图片</button>'
      + '  <button class="btn ghost" id="qt-rpt-close">关闭</button>'
      + '</div>';

    showModal('周报 / 月报', html, function (back) {
      var body = back.querySelector('#qt-rpt-body');
      var weekBtn = back.querySelector('#qt-rpt-week');
      var monthBtn = back.querySelector('#qt-rpt-month');
      var currentRange = 7;
      var lastData = null;

      function render() {
        var d = posterData(p, currentRange);
        lastData = d;
        body.innerHTML = renderPoster(p, d);
        weekBtn.classList.toggle('active', currentRange === 7);
        monthBtn.classList.toggle('active', currentRange === 30);
      }

      weekBtn.addEventListener('click', function () { currentRange = 7; render(); });
      monthBtn.addEventListener('click', function () { currentRange = 30; render(); });

      back.querySelector('#qt-rpt-save').addEventListener('click', function () {
        if (!lastData) return;
        exportCanvasPng(drawPosterCanvas(p, lastData),
          'quit-tracker-poster-' + formatDateTime(Date.now()).slice(0, 10) + '.png');
        toast('海报已保存');
      });

      // 防误关后弹窗必须自带关闭入口（周报弹窗原先只靠遮罩/ESC 关闭）
      back.querySelector('#qt-rpt-close').addEventListener('click', closeModal);

      // 文字版保留为次要入口（复制到剪贴板，供贴进日记或发给朋友）
      back.querySelector('#qt-rpt-copy').addEventListener('click', function () {
        var d = lastData;
        var lines = [
          '📊 ' + p.emoji + ' ' + p.name + ' 报告（近 ' + d.rangeDays + ' 天）',
          '━━━━━━━━━━━━━━━━',
          '⏱ 已坚持：' + d.days + ' 天' + (d.goalDays ? '（目标 ' + d.goalDays + ' 天）' : ''),
          '💥 本期破戒：' + d.cur.relapses + ' 次（上期 ' + d.prev.relapses + ' 次）',
          '🏅 本期最长单段：' + (d.cur.maxSeg > 0 ? formatDuration(d.cur.maxSeg).short : '—'),
          '🎖 已解锁徽章：' + d.badgeUnlocked + ' / ' + d.badgeTotal,
          '',
          '—— 戒断 · 习惯追踪 自动生成'
        ];
        var text = lines.join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { toast('已复制'); }, function () { toast('复制失败'); });
        } else {
          var ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败'); }
          ta.remove();
        }
      });

      render();
    });
  }

  // ---------- 设置面板 ----------
  function openSettings() {
    closeModal(); // 排他性弹窗（导入方式确认弹窗会叠加在其上）
    var html = ''
      + '<div class="field">'
      + '  <label>主题</label>'
      + '  <div class="row" style="gap: 8px;">'
      + '    <button class="btn" id="qt-theme-light" style="flex:1; justify-content:center;">浅色</button>'
      + '    <button class="btn" id="qt-theme-dark" style="flex:1; justify-content:center;">深色</button>'
      + '    <button class="btn" id="qt-theme-auto" style="flex:1; justify-content:center;">跟随系统</button>'
      + '  </div>'
      + '</div>'
      + '<div class="field">'
      + '  <label>配色</label>'
      + '  <div class="accent-row">'
      + '    <button class="btn" id="qt-accent-green"><span class="accent-dot dot-green"></span>Spotify 绿</button>'
      + '    <button class="btn" id="qt-accent-ocean"><span class="accent-dot dot-ocean"></span>海盐蓝</button>'
      + '    <button class="btn" id="qt-accent-teal"><span class="accent-dot dot-teal"></span>青瓷</button>'
      + '    <button class="btn" id="qt-accent-sunset"><span class="accent-dot dot-sunset"></span>落日橙</button>'
      + '  </div>'
      + '</div>'
      + '<div class="divider"></div>'
      + '<div class="field">'
      + '  <label>项目分类</label>'
      + '  <button class="btn block" id="qt-cat-manage">分类管理（新增 / 重命名 / 删除）</button>'
      + '</div>'
      + '<div class="divider"></div>'
      + '<div class="field">'
      + '  <label>数据管理</label>'
      + '  <div style="display: grid; gap: 8px;">'
      + '    <button class="btn block" id="qt-export">导出 JSON 备份</button>'
      + '    <button class="btn block" id="qt-import">导入备份</button>'
      + '    <button class="btn danger block" id="qt-wipe">清空所有数据</button>'
      + '    <input type="file" id="qt-import-file" accept="application/json,.json" style="display:none;">'
      + '  </div>'
      + '</div>'
      + '<div style="font-size: 12px; color: var(--text-mute); margin-top: 16px; line-height: 1.6;">'
      + '  你的所有数据都只存在本设备的浏览器中，<br>清除浏览器数据将永久丢失，请定期导出备份。'
      + '  <br>版本 v' + APP_VERSION + ' · 数据结构 v' + SCHEMA_VERSION
      + '</div>'
      + '<div class="modal-actions" style="margin-top: 20px;">'
      + '  <button class="btn ghost block" onclick="window.__qt.closeModal()">关闭</button>'
      + '</div>';

    showModal('设置', html, function (back) {
      function setTheme(t) {
        try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
        applyTheme();
        refreshThemeBtns();
      }
      // 高亮当前主题按钮（浅/深/跟随系统）
      function refreshThemeBtns() {
        var saved = 'auto';
        try { saved = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) {}
        var map = {
          light: back.querySelector('#qt-theme-light'),
          dark: back.querySelector('#qt-theme-dark'),
          auto: back.querySelector('#qt-theme-auto')
        };
        Object.keys(map).forEach(function (k) {
          if (map[k]) map[k].classList.toggle('active', saved === k);
        });
      }
      back.querySelector('#qt-theme-light').addEventListener('click', function () { setTheme('light'); });
      back.querySelector('#qt-theme-dark').addEventListener('click', function () { setTheme('dark'); });
      back.querySelector('#qt-theme-auto').addEventListener('click', function () { setTheme('auto'); });
      refreshThemeBtns();

      // 配色切换：持久化 + 立即生效（applyTheme 同时刷新 data-accent）
      function setAccent(t) {
        try { localStorage.setItem(ACCENT_KEY, t); } catch (e) {}
        applyTheme();
        refreshAccentBtns();
      }
      function refreshAccentBtns() {
        var saved = 'green';
        try { saved = localStorage.getItem(ACCENT_KEY) || 'green'; } catch (e) {}
        var map = {
          green: back.querySelector('#qt-accent-green'),
          ocean: back.querySelector('#qt-accent-ocean'),
          teal: back.querySelector('#qt-accent-teal'),
          sunset: back.querySelector('#qt-accent-sunset')
        };
        Object.keys(map).forEach(function (k) {
          if (map[k]) map[k].classList.toggle('active', saved === k);
        });
      }
      back.querySelector('#qt-accent-green').addEventListener('click', function () { setAccent('green'); });
      back.querySelector('#qt-accent-ocean').addEventListener('click', function () { setAccent('ocean'); });
      back.querySelector('#qt-accent-teal').addEventListener('click', function () { setAccent('teal'); });
      back.querySelector('#qt-accent-sunset').addEventListener('click', function () { setAccent('sunset'); });
      refreshAccentBtns();

      back.querySelector('#qt-cat-manage').addEventListener('click', openCategoryManager);

      back.querySelector('#qt-export').addEventListener('click', function () {
        // 对外展示模式：导出会把全部隐私项目明文落盘，与 guardPrivate 同源，必须一并锁定
        if (isDemoMode()) { toast('对外展示模式中，数据导出已锁定'); return; }
        var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'quit-tracker-backup-' + formatDateTime(Date.now()).slice(0, 10) + '.json'; // 本地日期（toISOString 是 UTC，东八区 0-8 点会标成昨天）
        a.click();
        URL.revokeObjectURL(url);
        toast('已导出');
      });

      var fileInput = back.querySelector('#qt-import-file');
      back.querySelector('#qt-import').addEventListener('click', function () {
        // 对外展示模式：导入可整库替换真实数据，与导出/清空同一威胁面（批次 2 BUG-P1）
        if (isDemoMode()) { toast('对外展示模式中，数据导入已锁定'); return; }
        fileInput.click();
      });
      fileInput.addEventListener('change', function (e) {
        // 双保险：即便文件选择器在开启演示模式前已被唤起，这里也必须拦下（批次 2 BUG-P1）
        if (isDemoMode()) { toast('对外展示模式中，数据导入已锁定'); return; }
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var data = JSON.parse(ev.target.result);
            if (!data || !Array.isArray(data.projects)) throw new Error('格式错误');
            // 询问合并还是覆盖
            showModal('导入方式',
              '<p style="color:var(--text-sub);font-size:14px;margin:0 0 8px;">检测到 <b>' + data.projects.length + '</b> 个项目。</p>'
              + '<div class="modal-actions">'
              + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
              + '  <button class="btn" id="qt-merge">合并</button>'
              + '  <button class="btn danger" id="qt-overwrite">覆盖</button>'
              + '</div>',
              function (back2) {
                back2.querySelector('#qt-merge').addEventListener('click', function () {
                  // 先做分类列表并集（本地在前、备份在后），再以并集校验项目归属——
                  // 否则备份里的自定义分类不在本地列表，会被迁移管道归一化成"未分类"（批次 2 BUG-D1）
                  var mergedCats = sanitizeCategories(getCategories().concat(sanitizeCategories(data.categories)));
                  if (mergedCats.length) state.categories = mergedCats;
                  (data.projects || []).forEach(function (p) {
                    var mp = migrateProject(p, state.categories);
                    if (!mp) return;
                    if (!getProject(mp.id)) state.projects.push(mp);
                  });
                  saveState();
                  closeModal();
                  render();
                  toast('已合并');
                });
                back2.querySelector('#qt-overwrite').addEventListener('click', function () {
                  // 覆盖语义 = 项目与分类列表都以备份为准；原 .map(migrateProject) 会把数组索引
                  // 当 cats 传入，自定义归属全部落空（批次 2 BUG-D1）
                  var importedCats = sanitizeCategories(data.categories);
                  if (importedCats.length) state.categories = importedCats; // 旧版本备份无 categories 字段时保留本地
                  state.projects = (data.projects || []).map(function (p) {
                    return migrateProject(p, state.categories);
                  }).filter(Boolean);
                  saveState();
                  closeModal();
                  render();
                  toast('已覆盖');
                });
              });
          } catch (err) {
            toast('导入失败：' + err.message);
          }
        };
        reader.readAsText(file);
      });

      // 清空所有数据：强二次确认（弹窗叠加在设置弹窗之上）
      back.querySelector('#qt-wipe').addEventListener('click', function () {
        // 对外展示模式：清空与导出/导入同一威胁面（批次 2 BUG-P1）；需要清空时先退出演示模式
        if (isDemoMode()) { toast('对外展示模式中，数据清空已锁定'); return; }
        var count = state.projects.length;
        if (count === 0) { toast('当前没有数据可清空'); return; }
        showModal('清空所有数据？',
          '<p style="color: var(--danger); font-size: 14px; font-weight: 600; margin: 0 0 8px;">此操作不可撤销！</p>'
          + '<p style="color: var(--text-sub); font-size: 14px; margin: 0 0 8px;">将永久删除全部 <b>' + count + '</b> 个项目及其所有记录、复盘。</p>'
          + '<p style="color: var(--text-mute); font-size: 13px; margin: 0 0 8px;">建议先导出备份再操作。</p>'
          + '<div class="modal-actions">'
          + '  <button class="btn ghost" onclick="window.__qt.closeModal()">取消</button>'
          + '  <button class="btn danger" id="qt-wipe-confirm">确认清空</button>'
          + '</div>',
          function (back2) {
            back2.querySelector('#qt-wipe-confirm').addEventListener('click', function () {
              state.projects = [];
              saveState();
              closeModal(); // 关确认弹窗
              closeModal(); // 关设置弹窗
              view = 'list'; detailId = null;
              render();
              toast('已清空所有数据');
            });
          });
      });
    });
  }

  // ---------- 主题 ----------
  function applyTheme() {
    var saved = 'auto';
    try { saved = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) {}
    var dark;
    if (saved === 'dark') dark = true;
    else if (saved === 'light') dark = false;
    else dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    // 状态栏/启动画面颜色随主题同步（浅色 #ffffff / 深色 #121212）
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#121212' : '#ffffff');
    // 配色方案：只换 accent 系 token（green 为基线值，非法值回落默认）
    var accent = 'green';
    try { accent = localStorage.getItem(ACCENT_KEY) || 'green'; } catch (e) {}
    if (ACCENT_LIST.indexOf(accent) < 0) accent = 'green';
    document.documentElement.setAttribute('data-accent', accent);
  }

  // ---------- Toast ----------
  var toastTimer = null;
  function toast(msg) {
    // 先清掉页面上残留的旧 toast，保证同一时刻只有一条（修复连续触发残留 bug）
    Array.prototype.forEach.call(document.querySelectorAll('.toast'), function (el) { el.remove(); });
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, TOAST_DURATION);
  }

  // ---------- 工具 ----------
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- 路由 ----------
  function openDetail(id) {
    // 先记下离开首页时的滚动位置，goHome 时恢复（用户要求：返回不停在头部）
    listScrollY = window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || 0;
    view = 'detail';
    detailId = id;
    // 详情页子状态必须复位：否则上个项目切到"年热力图"或输入过搜索词，会带到下一个项目
    calMonthOffset = 0;
    calView = 'month';
    detailSearch = '';
    detailTab = 'overview';
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function goHome() {
    view = 'list';
    detailId = null;
    detailSearch = '';
    render();
    // 恢复离开首页时的滚动位置
    window.scrollTo({ top: listScrollY, behavior: 'instant' });
  }
  function calPrev() { calMonthOffset--; render(); }
  function calNext() { calMonthOffset++; render(); }
  function calTab(v) {
    calView = (v === 'year') ? 'year' : 'month';
    calMonthOffset = 0;
    render();
  }

  // ---------- 初始化 ----------
  function init() {
    applyTheme();
    document.getElementById('demo-btn').addEventListener('click', toggleDemoMode);
    updateDemoBtn(isDemoMode()); // 页面加载时同步演示按钮状态（持久化模式下刷新仍保持隐藏）
    document.getElementById('theme-btn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      try {
        localStorage.setItem(THEME_KEY, cur === 'dark' ? 'light' : 'dark');
      } catch (e) {}
      applyTheme();
    });
    document.getElementById('settings-btn').addEventListener('click', openSettings);

    // ESC 关闭最上层弹窗（配合弹窗栈）
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    // 拖拽排序：移动/抬起挂 document，只注册一次（排序模式下由 .drag-handle 触发 dragStart，避免每次渲染重复绑定）
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('touchend', dragEnd);
    document.addEventListener('touchcancel', dragEnd);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);

    // 多标签页同步：其他标签页写入数据时，本页自动重载最新 state（storage 事件不触发本页）
    window.addEventListener('storage', function (e) {
      // 对外展示模式：其他标签页开启/关闭时本页必须同步，否则隐私项目仍会明文显示
      if (e.key === DEMO_KEY) {
        render();
        updateDemoBtn(isDemoMode());
        return;
      }
      // 主题：跟随其他标签页的切换
      if (e.key === THEME_KEY) {
        applyTheme();
        return;
      }
      // 配色：跟随其他标签页的切换
      if (e.key === ACCENT_KEY) {
        applyTheme();
        return;
      }
      if (e.key === STORAGE_KEY) {
        state = loadState();
        // 若当前打开的详情项目已被删除，回退列表
        if (view === 'detail' && !getProject(detailId)) {
          view = 'list';
          detailId = null;
          detailSearch = '';
        }
        // 他标签可能删除/改名了分类：落空的筛选回落"全部"，避免首页假性空列表
        listFilter = sanitizeListFilter(listFilter);
        render();
      }
    });

    // 注册 Service Worker（PWA）
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (e) {
          console.warn('SW register failed', e);
        });
      });
    }

    // 监听系统主题变化（仅当设为 auto 时）
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    }

    render();
    startTicker();

    // 调试入口：URL 带 #seed 时灌入测试数据（仅用于截图/调试）
    // 守卫：已有真实数据时绝不覆盖，避免误点链接/书签导致数据丢失
    if (location.hash === '#seed') {
      if (state.projects.length === 0) {
        installSeedData();
        render();
      } else {
        toast('检测到已有数据，跳过示例注入');
      }
    }
    // 调试入口：URL 带 ?detail=xxx 直接打开详情
    var detailMatch = location.search.match(/detail=([\w-]+)/);
    if (detailMatch && getProject(detailMatch[1])) {
      openDetail(detailMatch[1]);
    }
    // 调试入口：?cal=year 强制显示年热力图
    if (/cal=year/.test(location.search)) {
      calView = 'year';
      render();
    }
    // 调试入口：?theme=dark / ?theme=light 强制主题（截图/演示用）
    var themeMatch = location.search.match(/theme=(\w+)/);
    if (themeMatch && (themeMatch[1] === 'dark' || themeMatch[1] === 'light')) {
      try { localStorage.setItem(THEME_KEY, themeMatch[1]); } catch (e) {}
      applyTheme();
    }
    // 调试入口：?report=<id> 自动打开周报弹窗（截图用）
    var reportMatch = location.search.match(/report=([\w-]+)/);
    if (reportMatch && getProject(reportMatch[1])) {
      setTimeout(function () { openReport(reportMatch[1]); }, 60);
    }
    // 调试入口：?add=<id> 自动打开"记录破戒"弹窗（截图用）
    var addMatch = location.search.match(/add=([\w-]+)/);
    if (addMatch && getProject(addMatch[1])) {
      setTimeout(function () { openAddRecord(addMatch[1]); }, 60);
    }
    // 调试入口：?demo=1 一键开启对外展示模式（截图用）
    if (/demo=1/.test(location.search)) {
      setDemoMode(true);
      updateDemoBtn(true);
    }

    // 暴露给内联事件
    window.__qt = {
      openNewProject: openNewProject,
      openEditProject: openEditProject,
      openAddRecord: openAddRecord,
      openEditRecord: openEditRecord,
      openNewReview: openNewReview,
      openEditReview: openEditReview,
      confirmDeleteReview: confirmDeleteReview,
      dismissReviewBanner: dismissReviewBanner,
      checkReviewTick: checkReviewTick,
      recordMatchesQuery: recordMatchesQuery,
      setListFilter: setListFilter,
      toggleSortMode: toggleSortMode,
      // v5 纯函数测试钩子（与 checkReviewTick / recordMatchesQuery 同理，供 tests/smoke-test.js 直接驱动）
      normalizeCategory: normalizeCategory,
      getCategories: getCategories,
      addCategory: addCategory,
      renameCategory: renameCategory,
      deleteCategory: deleteCategory,
      resetCategories: resetCategories,
      sanitizeCategories: sanitizeCategories,
      sanitizeListFilter: sanitizeListFilter,
      parseRecordTime: parseRecordTime,
      reorderProjects: reorderProjects,
      periodStats: periodStats,
      posterData: posterData,
      renderPoster: renderPoster,
      openDetail: openDetail,
      goHome: goHome,
      calPrev: calPrev,
      calNext: calNext,
      calTab: calTab,
      setDetailTab: function (v) { detailTab = v; render(); }, // 测试钩子：详情页页签切换
      confirmDeleteProject: confirmDeleteProject,
      confirmDeleteRecord: confirmDeleteRecord,
      openReport: openReport,
      toggleEye: toggleEye,
      closeModal: closeModal,
      openSettings: openSettings,
      // 测试钩子（与 normalizeCategory 等同理）：延后自动弹窗队列长度，供 tests 验证多周期不丢失
      pendingAutoModalCount: function () { return pendingAutoModals.length; }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ---------- 调试：种子数据 ----------
  function installSeedData() {
    var now = Date.now();
    var day = DAY_MS;
    state.projects = [
      {
        id: 'demo1',
        name: '戒奶茶',
        emoji: '🧋',
        category: '饮食',
        order: 0,
        goalDays: 30,
        records: [
          { id: 'r1', t: now - 7 * day, n: '开始戒断', tags: [] },
          { id: 'r2', t: now - 5 * day, n: '下午犯困喝了一杯', tags: ['工作压力'] },
          { id: 'r3', t: now - 1 * day, n: '同事请的，不好拒绝', tags: ['社交场合'] },
          { id: 'r4', t: now - 6 * HOUR_MS, n: '晚饭后嘴馋', tags: ['习惯性动作'] }
        ],
        reviews: [
          { id: 'rv1', cycleDays: 3, ts: now - 4 * day,
            achievement: '前 3 天完全没喝，靠白水和黑咖啡顶过',
            improvement: '下午 3-5 点容易犯困，忍不住想点奶茶',
            nextPlan: '每天下午泡一壶茶放工位，提前避开这个时间段' }
        ],
        bestStreak: 0,
        seenMilestones: [1, 3],
        seenReviewCycles: [3],
        dismissedReviewBanner: null,
        createdAt: now - 7 * day
      },
      {
        id: 'demo2',
        name: '戒熬夜',
        emoji: '😴',
        category: '作息',
        order: 1,
        goalDays: 21,
        private: true,   // 隐私项目示例：默认模糊（演示隐私保护功能）
        eyeOpen: false,
        records: [
          { id: 'r5', t: now - 30 * day, n: '开始', tags: [] },
          { id: 'r6', t: now - 22 * day, n: '朋友聚餐', tags: ['社交场合'] },
          { id: 'r7', t: now - 15 * day, n: '刷手机', tags: ['习惯性动作'] },
          { id: 'r8', t: now - 9 * day, n: '赶方案', tags: ['工作压力'] },
          { id: 'r9', t: now - 4 * day, n: '双十一熬夜', tags: ['奖励自己'] },
          { id: 'r10', t: now - 18 * HOUR_MS, n: '又刷剧了', tags: ['无聊'] }
        ],
        reviews: [
          { id: 'rv2', cycleDays: 7, ts: now - 23 * day,
            achievement: '一周有 5 天在 12 点前睡',
            improvement: '睡前躺床上刷手机，一刷就到 1 点',
            nextPlan: '把手机充电器挪到客厅' },
          { id: 'rv3', cycleDays: 15, ts: now - 15 * day,
            achievement: '已经形成习惯，最晚 12 点半',
            improvement: '赶方案时还是管不住',
            nextPlan: '设定 23:30 自动锁屏' }
        ],
        bestStreak: 7 * day,
        seenMilestones: [1, 3, 7, 14],
        seenReviewCycles: [7, 15],
        dismissedReviewBanner: null,
        createdAt: now - 30 * day
      },
      {
        id: 'demo3',
        name: '少刷抖音',
        emoji: '🎮',
        category: '数字娱乐',
        order: 2,
        goalDays: 0,
        records: [
          { id: 'r11', t: now - 10 * day, n: '开始', tags: [] }
        ],
        reviews: [],
        bestStreak: 10 * day,
        seenMilestones: [1, 3, 7],
        seenReviewCycles: [3],
        dismissedReviewBanner: null,
        createdAt: now - 10 * day
      }
    ];
    state.projects.forEach(recalcBest);
    saveState();
  }
})();
