/* 静态资源校验（N-31）
 *
 * 为什么需要：sw.js 的 install 用 caches.addAll(ASSETS)，这是**原子操作** ——
 * 7 个路径任一 404，整个 install 直接 reject，skipWaiting 不执行，离线能力静默失效。
 * 除了 DevTools 之外没有任何可见报错，上线后才发现。
 *
 * 覆盖：
 *  1. SW 的 ASSETS 列表每一项在磁盘上存在
 *  2. CACHE 名以 quit-tracker- 开头（同源互删防护前提）
 *  3. manifest 的 icons 路径存在且 PNG 尺寸与声明一致
 *  4. index.html 引用的本地资源存在
 *  5. index.html 无绝对路径引用（GitHub Pages 子路径会 404）
 *  6. index.html 仍在注册 sw.js
 *
 * 用法：node scripts/check-assets.js（零依赖，可进 CI）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const results = [];
const t = (name, ok, detail) => results.push([name, ok, detail || '']);

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ---- 1. SW ASSETS 与磁盘一致性 ----
const sw = read('sw.js');
const assetsBlock = sw.match(/const ASSETS\s*=\s*\[([\s\S]*?)\]/);
if (!assetsBlock) {
  t('sw.js 能解析出 ASSETS 列表', false, '未找到 const ASSETS = [...]');
} else {
  const list = assetsBlock[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter((s) => s && !s.startsWith('//'));
  t('sw.js 能解析出 ASSETS 列表', list.length > 0, list.length + ' 项');

  const missing = list.filter((p) => !exists(p.replace(/^\.\//, '')));
  t('SW 缓存的每个资源都存在（addAll 原子失败防线）',
    missing.length === 0,
    missing.length ? '缺失：' + missing.join(', ') : list.length + ' 项全部存在');
}

// ---- 2. CACHE 名前缀 ----
const cacheName = (sw.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || '';
t('CACHE 名以 quit-tracker- 开头（前缀隔离前提）',
  cacheName.indexOf('quit-tracker-') === 0, cacheName || '未找到');

// ---- 3. manifest 图标路径与尺寸 ----
const manifest = JSON.parse(read('manifest.json'));
const icons = manifest.icons || [];
t('manifest 声明了图标', icons.length > 0, icons.length + ' 个');

const iconProblems = [];
icons.forEach((ic) => {
  const rel = (ic.src || '').replace(/^\.\//, '');
  if (!exists(rel)) { iconProblems.push(rel + ' 不存在'); return; }
  // 只对 PNG 校验尺寸（SVG 无法用简单方式读）
  if (!rel.endsWith('.png')) return;
  const declared = (ic.sizes || '').split('x');
  if (declared.length !== 2) return;
  const buf = fs.readFileSync(path.join(ROOT, rel));
  // PNG IHDR：宽在偏移 16，高在偏移 20（大端 4 字节）
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') {
    iconProblems.push(rel + ' 不是合法 PNG');
    return;
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (String(w) !== declared[0] || String(h) !== declared[1]) {
    iconProblems.push(rel + ' 实际 ' + w + 'x' + h + '，声明 ' + ic.sizes);
  }
});
t('manifest 图标路径存在且尺寸与声明一致',
  iconProblems.length === 0,
  iconProblems.length ? iconProblems.join('; ') : '全部一致');

// ---- 4/5. index.html 本地资源 ----
const html = read('index.html');

// 抓 src= / href= 里指向本地（非 http/data/#）的路径
const refs = [];
const re = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
let m;
while ((m = re.exec(html)) !== null) {
  const v = m[1];
  if (/^(https?:|data:|#|mailto:|tel:)/i.test(v)) continue;
  if (v.endsWith('manifest.json')) { refs.push(v); continue; }
  refs.push(v);
}
const brokenRefs = refs.filter((v) => !exists(v.replace(/^\.\//, '')));
t('index.html 引用的本地资源都存在',
  brokenRefs.length === 0,
  brokenRefs.length ? '缺失：' + brokenRefs.join(', ') : refs.length + ' 个引用全部存在');

// 绝对路径（以 / 开头）在 GitHub Pages 子路径下会 404
const absRefs = refs.filter((v) => v.startsWith('/'));
t('index.html 无绝对路径引用（Pages 子路径安全）',
  absRefs.length === 0, absRefs.length ? absRefs.join(', ') : '无');

// ---- 6. SW 注册调用仍在 ----
const app = read('src/app.js');
t('app.js 仍注册 sw.js（离线能力前置）',
  /serviceWorker\.register\(\s*['"]sw\.js['"]\s*\)/.test(app));

// ---- 输出 ----
let pass = 0;
results.forEach(([name, ok, detail]) => {
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? '   → ' + detail : ''));
  if (ok) pass++;
});
console.log('\n' + pass + '/' + results.length + ' 通过');
process.exit(pass === results.length ? 0 : 1);
