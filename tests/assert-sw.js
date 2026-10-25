/* SW 防互删断言（1.0.1 修复；2026-10-25 subscription-manager 上线核验发现的同源问题）
   背景：GitHub Pages 项目站共享 origin（edward8n25.github.io），各项目 SW 的
   activate 若无差别清理「名字 ≠ 自己」的缓存，会互相删除对方缓存。
   用法：node tests/assert-sw.js */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

const results = [];
const t = (name, ok, detail) => results.push([name, ok, detail || '']);

t('activate 清理限定 quit-tracker- 前缀（同源共存不互删）',
  /k\.startsWith\('quit-tracker-'\) && k !== CACHE/.test(sw));
t('CACHE 名以 quit-tracker- 开头（前缀过滤自身可达）', /const CACHE = 'quit-tracker-/.test(sw));
t('SW 注册调用存在（离线能力前置）', /serviceWorker\.register\('sw\.js'\)/.test(app));
t('APP_VERSION 为 1.0.1（与 CHANGELOG 对应）', /APP_VERSION = '1\.0\.1'/.test(app));

let pass = 0;
results.forEach(([name, ok, detail]) => {
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? '   → ' + detail : ''));
  if (ok) pass++;
});
console.log('\n' + pass + '/' + results.length + ' 通过');
process.exit(pass === results.length ? 0 : 1);
