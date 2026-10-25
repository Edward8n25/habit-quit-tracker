/* 样式一致性守门（零依赖，可进 CI）
   目的：防止"收敛完又退化" —— 死 CSS / 失配类名 / 未使用 keyframes 重新出现，或内联 style 继续增长。
   用法：node tests/style-consistency.js
   说明：间隔与圆角的"违规计数"采用**棘轮阈值**（只许降不许升），因为完整收敛属批次 3 的范围。
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
const style = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
const body = html.slice(html.indexOf('</style>'));

// ---- 棘轮基线（批次 1/2 完成后的实测值；只许下调，下调后请同步改这里）
const BASELINE = {
  spacingViolations: 63,  // 结构性间距（>4px）不落在六档栅格内的次数
  bareRadius: 2,          // 裸 px 圆角（.cal-day / .emoji-opt 的 6px，待批次 3 处理）
  inlineStyles: 66,       // src/app.js 里的内联 style="..." 数量
};
// 有意不配样式的 JS 选择器钩子（不是遗漏，加进来需要写明原因）
const STYLE_HOOKS = ['streak-text']; // ticker 每秒靠它更新计时文本

const results = [];
const hitWord = (name, src) => new RegExp('(^|[^\\w-])' + name.replace(/-/g, '\\-') + '([^\\w-]|$)').test(src);
const hasRule = c => new RegExp('\\.' + c.replace(/-/g, '\\-') + '([^\\w-]|$)').test(style);

// 1. 死 CSS
const cssClasses = [...new Set((style.match(/\.[a-zA-Z][\w-]*/g) || []).map(s => s.slice(1)))];
const dead = cssClasses.filter(c => !hitWord(c, app) && !hitWord(c, body)).sort();
results.push(['无死 CSS', dead.length === 0, dead.join('  ')]);

// 2. 未使用 @keyframes
const kf = [...new Set((style.match(/@keyframes\s+([\w-]+)/g) || []).map(s => s.split(/\s+/)[1]))];
const unusedKf = kf.filter(k => !new RegExp('animation[^;]*' + k).test(style) && !new RegExp('animation[^;"]*' + k).test(app));
results.push(['无未使用 @keyframes', unusedKf.length === 0, unusedKf.join('  ')]);

// 3. 失配类名（JS 产出但 CSS 无规则）
// 提取口径：只取 class=" 后的**首个**标识符（避免把 'cal-tab' + (calView === 'month' ? ...) 里的
// 变量名 month / calView 误当类名），再补上 className= 与 classList.* 两个字面量来源。
// 局限：单个字符串里的第 2 个类名（如 class="btn primary" 的 primary）不会被采集 ——
//      这类名字都在 CSS 里，因此不会产生假阳性，只会漏报，属可接受偏差。
const produced = new Set();
(app.match(/class=\\?"([a-zA-Z][\w-]*)/g) || []).forEach(m => {
  const mm = m.match(/([a-zA-Z][\w-]*)$/); if (mm) produced.add(mm[1]);
});
(app.match(/className\s*=\s*'([a-zA-Z][\w-]*)'/g) || []).forEach(m => {
  const mm = m.match(/'([a-zA-Z][\w-]*)'/); if (mm) produced.add(mm[1]);
});
(app.match(/classList\.(?:add|remove|toggle)\('([a-zA-Z][\w-]*)'/g) || []).forEach(m => {
  const mm = m.match(/'([a-zA-Z][\w-]*)'/); if (mm) produced.add(mm[1]);
});
const unstyled = [...produced].filter(c => !hasRule(c) && STYLE_HOOKS.indexOf(c) < 0).sort();
results.push(['无失配类名', unstyled.length === 0, unstyled.join('  ')]);

// 4. 结构性间距棘轮（>4px 的值必须落在六档内；微调值 ≤4px 豁免，理由见 UI一致性盘点 §1.2）
const SPACE = [4, 8, 12, 16, 24, 32];
const badSpacing = [];
(style.match(/(?:padding|margin|gap)(?:-(?:top|right|bottom|left))?:\s*[^;{}]+;/g) || []).forEach(decl => {
  (decl.match(/([0-9.]+)px/g) || []).forEach(v => {
    const n = parseFloat(v);
    if (n <= 4) return;
    if (SPACE.indexOf(n) < 0) badSpacing.push(n);
  });
});
results.push(['结构性间距越界次数 ≤ 基线 ' + BASELINE.spacingViolations,
  badSpacing.length <= BASELINE.spacingViolations, '当前 ' + badSpacing.length]);

// 5. 裸 px 圆角棘轮
const bareRadius = (style.match(/border-radius:\s*(?!var\(|999px)[0-9.]+px/g) || []);
results.push(['裸 px 圆角 ≤ 基线 ' + BASELINE.bareRadius,
  bareRadius.length <= BASELINE.bareRadius, '当前 ' + bareRadius.length]);

// 6. 内联 style 预算棘轮
const inlineCount = (app.match(/\sstyle=\\?"/g) || []).length;
results.push(['内联 style 数量 ≤ 基线 ' + BASELINE.inlineStyles,
  inlineCount <= BASELINE.inlineStyles, '当前 ' + inlineCount]);

// 7. 纯黑字面量（统一规范 §2.1「永远不用纯黑」）
const blacks = (style.match(/#000\b/g) || []).length;
results.push(['无 #000 字面量（应走 --on-accent）', blacks === 0, '当前 ' + blacks]);

// 8. 关键 Token 必须存在
const NEED = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-6', '--space-8',
  '--radius-lg', '--radius-xs', '--shadow-raised', '--on-accent'];
const missing = NEED.filter(t => style.indexOf(t) < 0);
results.push(['Design Token 齐备（间距六档 / 圆角 / 阴影 / 强调色文字）', missing.length === 0, missing.join('  ')]);

let pass = 0;
results.forEach(([name, ok, detail]) => {
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? '   → ' + detail : ''));
  if (ok) pass++;
});
console.log('\n' + pass + '/' + results.length + ' 通过');
process.exit(pass === results.length ? 0 : 1);
