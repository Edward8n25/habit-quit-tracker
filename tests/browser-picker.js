/* 真浏览器端到端测试（零依赖）
 *
 * 为什么需要它：tests/smoke-test.js 与 tests/picker-interaction.js 都基于自建 stub DOM。
 * stub 的 querySelector 只能返回"代理对象"，因此"弹窗挂载之后的真实交互"证明不了 ——
 * 本次「分类管理入口缺失、选择器不刷新」的缺陷，正是在 55/55 全绿的情况下漏出去的。
 * 这一层用真实浏览器 + 真实 DOM 补齐。
 *
 * 用法：
 *   node tests/browser-picker.js                 起本地只读服务 → headless 浏览器跑夹具 → 断言
 *   node tests/browser-picker.js <dump.html>     跳过浏览器，直接解析已有的 --dump-dom 产物
 *                                                （受限环境或无浏览器时可用，解析逻辑与上面完全一致）
 * 未检测到浏览器时跳过（exit 0）；可用 EDGE_PATH / CHROME_PATH 指定可执行文件。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ---------------- 解析与报告（可被独立调用） ----------------
function report(dom, source) {
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  if (!m) {
    console.log('❌ 未取到夹具输出（浏览器可能启动失败、被沙箱拦截，或产物不完整）');
    console.log('   来源: ' + source);
    console.log('   片段: ' + String(dom).slice(0, 300).replace(/\s+/g, ' '));
    return 1;
  }
  const body = m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

  const lines = body.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.some(l => l.indexOf('SKIPPED') === 0)) {
    console.log('❌ 夹具被安全守卫拦下（URL 未正确带上 ?run=1）');
    return 1;
  }
  if (!lines.length) { console.log('❌ 夹具输出为空'); return 1; }

  let pass = 0, fail = 0;
  lines.forEach(line => {
    if (line.indexOf('PASS') === 0) {
      pass++;
      console.log('✅ ' + line.slice(4).replace(/^\s*\|\s*/, ''));
    } else if (line.indexOf('FAIL') === 0) {
      fail++;
      console.log('❌ ' + line.slice(4).replace(/^\s*\|\s*/, ''));
    } else {
      fail++;
      console.log('❌ ' + line);
    }
  });
  console.log('\n' + pass + '/' + (pass + fail) + ' 通过  (' + source + ')');
  return fail === 0 ? 0 : 1;
}

// ---------------- 模式一：解析已有的 dump 产物 ----------------
const localFile = process.argv[2];
if (localFile) {
  if (!fs.existsSync(localFile)) {
    console.log('❌ 找不到文件：' + localFile);
    process.exit(1);
  }
  process.exit(report(fs.readFileSync(localFile, 'utf8'), path.basename(localFile)));
}

// ---------------- 模式二：自己起服务 + 跑浏览器 ----------------
const CANDIDATES = [
  process.env.EDGE_PATH, process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const browser = CANDIDATES.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!browser) {
  console.log('⏭  未检测到 Edge / Chrome，跳过真浏览器端到端测试');
  console.log('   （用 EDGE_PATH 或 CHROME_PATH 指定浏览器可执行文件即可运行）');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};
// 只读、只绑定回环地址
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

function finish(code) {
  try { server.close(); } catch (e) {}
  process.exit(code);
}

server.listen(0, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/tests/fixture-picker.html?run=1';
  const profile = path.join(os.tmpdir(), 'qt-browser-test-' + Date.now());

  function dump(flag) {
    const r = spawnSync(browser, [
      flag, '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=15000',
      '--dump-dom', url
    ], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
    if (r.error) {
      console.log('❌ 无法启动浏览器：' + (r.error.code || r.error.message));
      console.log('   可执行文件: ' + browser);
      if (r.error.code === 'EBUSY' || r.error.code === 'EPERM') {
        console.log('   提示：当前环境禁止创建子进程。可先用外部命令生成 --dump-dom 产物，');
        console.log('        再执行 `node tests/browser-picker.js <dump.html>` 解析同一套断言。');
      }
      return null;
    }
    return (r.stdout || '') + '\n' + (r.stderr || '');
  }

  let dom = dump('--headless=new');   // 较新语法
  if (dom !== null && dom.indexOf('<pre id="out">') < 0) dom = dump('--headless'); // 旧版 Chrome
  if (dom === null) finish(1);

  finish(report(dom, path.basename(browser)));
});
