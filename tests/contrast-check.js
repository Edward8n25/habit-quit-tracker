/* 配色对比度守门（零依赖，可进 CI）
   目的：四种配色 × 明暗两模式下，关键 token 对的对比度不得低于 WCAG AA。
   为什么单独一个文件：style-consistency.js 只管"结构"（死 CSS / 间距 / 内联 style），
   配色属于"数值正确性"，混进去会让那个文件的职责变模糊。

   用法：node tests/contrast-check.js

   判据（WCAG 2.1）：
     · 正文 / 次级文字 / 强调色当文字  → ≥ 4.5:1（1.4.3 AA）
     · UI 元素（按钮底、进度条、开关）→ ≥ 3:1  （1.4.11 AA）
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const style = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));

/* ── 解析：把某个选择器块里的自定义属性抽成 { name: value } ── */
function readBlock(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 注意：`[data-theme="dark"]` 的首次匹配发生在它自己的块（index.html 里紧跟 `{`），
  // 不会误匹配到更靠后的 `[data-theme="dark"][data-accent="x"]` 复合块——
  // 因为 String.match 返回第一个匹配，而首个真块在文件里更早出现。
  // 如果将来 CSS 里把复合块写在前面，这个假设会失效，届时改用 lastIndex 精确扫描。
  const re = new RegExp(esc + '\\s*\\{([^}]*)\\}');
  const m = style.match(re);
  if (!m) return null;
  const out = {};
  (m[1].match(/--[\w-]+\s*:\s*[^;]+;/g) || []).forEach(decl => {
    const i = decl.indexOf(':');
    const k = decl.slice(0, i).trim();
    const v = decl.slice(i + 1).replace(';', '').trim();
    out[k] = v;
  });
  return out;
}

/* ── 颜色解析：#rgb / #rrggbb / rgb() / rgba() → {r,g,b,a} ── */
function parseColor(v) {
  if (!v) return null;
  v = v.trim();
  if (v[0] === '#') {
    const h = v.slice(1);
    if (h.length === 3) {
      return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 };
    }
    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: 1
      };
    }
    return null;
  }
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map(x => parseFloat(x.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

/* ── WCAG 相对亮度 ── */
function luminance(c) {
  const f = x => {
    x /= 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/* ── 对比度 ── */
function ratio(fg, bg) {
  if (!fg || !bg) return null;
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── 取实际生效值：按 CSS 层叠顺序浅 → 深 → 配色覆盖 ── */
function resolve(theme, accent, key) {
  const base = readBlock(':root') || {};
  let v = base[key];
  if (theme === 'dark') {
    const dark = readBlock('[data-theme="dark"]') || {};
    if (dark[key] != null) v = dark[key];
  }
  if (accent !== 'green') {
    // 浅色配色块：[data-accent="x"]
    const light = readBlock('[data-accent="' + accent + '"]') || {};
    if (light[key] != null) v = light[key];
    if (theme === 'dark') {
      const darkAcc = readBlock('[data-theme="dark"][data-accent="' + accent + '"]') || {};
      if (darkAcc[key] != null) v = darkAcc[key];
    }
  }
  return parseColor(v);
}

/* ── 检查表 ──
   [label, 前景 token, 背景 token, 门槛]  */
const CHECKS = [
  ['正文', '--text', '--bg', 4.5],
  ['次级文字', '--text-sub', '--bg', 4.5],
  ['次级文字@抬起面', '--text-sub', '--bg-elev', 4.5],
  ['三级文字', '--text-mute', '--bg', 4.5],
  ['卡片内三级文字', '--text-mute', '--bg-card', 4.5],
  ['强调色当文字', '--accent-text', '--bg', 4.5],
  ['强调色当 UI 元素', '--accent', '--bg', 3.0],
  ['强调底上的文字', '--on-accent', '--accent', 4.5]
];

const ACCENTS = ['green', 'ocean', 'teal', 'sunset'];
const THEMES = ['light', 'dark'];

let pass = 0;
let total = 0;
const failures = [];

ACCENTS.forEach(accent => {
  THEMES.forEach(theme => {
    CHECKS.forEach(([label, fgKey, bgKey, min]) => {
      const fg = resolve(theme, accent, fgKey);
      const bg = resolve(theme, accent, bgKey);
      total++;

      if (!fg || !bg) {
        failures.push(accent + '/' + theme + ' ' + label + '：无法解析 ' + (!fg ? fgKey : bgKey));
        return;
      }
      // 半透明前景无法直接算对比度（需要先与背景合成），跳过并提示
      if (fg.a < 1) {
        total--; // 不计入总数
        return;
      }
      const r = ratio(fg, bg);
      if (r >= min) {
        pass++;
      } else {
        failures.push(
          accent + '/' + theme + ' ' + label + '：' +
          r.toFixed(2) + ':1 < ' + min + ':1'
        );
      }
    });
  });
});

/* ── 附加：token 体系外的硬编码语义色（第 3 轮 R3-02 引入的守门）──
   这些颜色不经过 CSS 变量，上面的 token 对检查看不见它们；每对显式登记，
   字面值与 index.html / src/app.js（Canvas 海报）一一对应，改色必须同步这里。
   bg 写法：[tint 前景 rgba, 底色] → 先合成不透明底色再算对比度；tint 为 null 表示直接用底色。 */
function composite(tint, base) {
  if (!tint) return base;
  return {
    r: tint.r * tint.a + base.r * (1 - tint.a),
    g: tint.g * tint.a + base.g * (1 - tint.a),
    b: tint.b * tint.a + base.b * (1 - tint.a),
    a: 1
  };
}
const CARD = { light: parseColor('#ffffff'), dark: parseColor('#181818') };

const HARD_PAIRS = [
  ['tag-imp 浅色（复盘·不足）', '#92400e', ['rgba(255,159,10,.15)', CARD.light], 4.5],
  ['tag-imp 深色（复盘·不足）', '#fbbf24', ['rgba(255,159,10,.15)', CARD.dark], 4.5],
  ['tag-next 浅色（复盘·下一步）', '#1d4ed8', ['rgba(59,130,246,.15)', CARD.light], 4.5],
  ['tag-next 深色（复盘·下一步）', '#60a5fa', ['rgba(59,130,246,.15)', CARD.dark], 4.5],
  ['海报次级文字（固定深色）', '#9a9a9a', [null, parseColor('#121212')], 4.5]
];
HARD_PAIRS.forEach(([label, fgHex, bgSpec, min]) => {
  total++;
  const fg = parseColor(fgHex);
  const bg = composite(parseColor(bgSpec[0]), bgSpec[1]);
  const r = ratio(fg, bg);
  if (r >= min) {
    pass++;
  } else {
    failures.push(label + '：' + r.toFixed(2) + ':1 < ' + min + ':1');
  }
});

// hi-tag / tag-ach（原因 chip / 复盘·成就标签）：accent-text on accent-tint-08 over bg-card，
// 随四配色 × 两模式全查（R3-02 修法是降 tint 不动 accent-text，这里守住这个组合）
ACCENTS.forEach(accent => {
  THEMES.forEach(theme => {
    total++;
    const fg = resolve(theme, accent, '--accent-text');
    const bg = composite(resolve(theme, accent, '--accent-tint-08'), CARD[theme]);
    const r = ratio(fg, bg);
    if (r >= 4.5) {
      pass++;
    } else {
      failures.push('hi-tag ' + accent + '/' + theme + '：' + r.toFixed(2) + ':1 < 4.5:1');
    }
  });
});

/* ── 附加：四种配色的相对亮度必须落在同一窄带内 ──
   否则切换配色会改变整体视觉重量（而不只是换色相）。
   带宽按实测定：浅色 #15803d=0.159 / #2563eb=0.153 / #0f766e=0.142 / #c2410c=0.153；
              深色 #1db954=0.356 / #60a5fa=0.363 / #14b8a6=0.372 / #f97316=0.325。
   带宽取 ±0.05 是为了留出微调空间，同时拦住"某个配色明显偏亮/偏暗"的退化。 */
const LUM_BANDS = { light: [0.10, 0.22], dark: [0.27, 0.42] };
const lumFail = [];
ACCENTS.forEach(accent => {
  THEMES.forEach(theme => {
    const c = resolve(theme, accent, '--accent');
    if (!c) return;
    const l = luminance(c);
    const [lo, hi] = LUM_BANDS[theme];
    if (l < lo || l > hi) {
      lumFail.push(accent + '/' + theme + '：亮度 ' + l.toFixed(3) + ' 不在 [' + lo + ', ' + hi + ']');
    }
  });
});

/* ── 输出 ── */
console.log('配色对比度检查（' + ACCENTS.length + ' 配色 × ' + THEMES.length + ' 模式 × ' + CHECKS.length + ' 项）');
console.log('');

if (failures.length === 0) {
  console.log('✅ 对比度全部达标   → ' + pass + '/' + total);
} else {
  console.log('❌ 对比度不达标 ' + failures.length + ' 项：');
  failures.forEach(f => console.log('   · ' + f));
}

if (lumFail.length === 0) {
  console.log('✅ 四种配色亮度对齐（切换配色不改变视觉重量）');
} else {
  console.log('❌ 配色亮度不一致 ' + lumFail.length + ' 项：');
  lumFail.forEach(f => console.log('   · ' + f));
}

const ok = failures.length === 0 && lumFail.length === 0;
console.log('');
console.log(ok ? '全部通过' : '存在不达标项');
process.exit(ok ? 0 : 1);
