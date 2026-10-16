/* =============================================================================
 * glb-export.mjs —— 无头导出 GLB 模型文件
 *   通过 Chrome DevTools Protocol 打开场景页面，触发页面内的 GLTFExporter，
 *   并把浏览器下载的 wanda-plaza.glb 收集到项目根目录。
 *
 *   用法:  node tools/glb-export.mjs
 * ========================================================================== */
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, statSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const PORT = 9411;
const PROFILE = path.join(process.env.TEMP || '.', 'wanda-glb-profile');
const DOWNLOADS = path.join(process.env.TEMP || '.', 'wanda-glb-downloads');
const OUT = path.join(ROOT, 'wanda-plaza.glb');
const PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?glb=1';

rmSync(DOWNLOADS, { recursive: true, force: true });
mkdirSync(DOWNLOADS, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${PORT}`,
  '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files',
  '--window-size=900,600',
  PAGE
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const t = list.find(x => x.type === 'page' && String(x.url).includes('index.html'));
      if (t && t.webSocketDebuggerUrl) return t;
    } catch { /* 浏览器尚未就绪 */ }
    await sleep(500);
  }
  throw new Error('未能连接到 Chrome 调试端口');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')), { once: true });
    });
    const cdp = new CDP(ws);
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
    return cdp;
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' +
      (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  }
}

try {
  const target = await findTarget();
  const cdp = await CDP.connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });

  // 等待场景初始化完成
  console.log('等待场景构建…');
  for (let i = 0; i < 120; i++) {
    const err = await cdp.eval('window.__WANDA_ERROR__ || ""');
    if (err) throw new Error('页面初始化失败: ' + err);
    const ready = await cdp.eval('!!window.__WANDA_READY__');
    if (ready) break;
    await sleep(500);
  }
  console.log('场景就绪，开始导出 GLB…');

  const started = Date.now();
  await cdp.eval('window.WANDA.app.exportGLB(); true');

  // 等待下载文件出现并稳定
  let file = null;
  for (let i = 0; i < 240; i++) {
    const names = readdirSync(DOWNLOADS).filter(n => n.toLowerCase().endsWith('.glb'));
    if (names.length) {
      const f = path.join(DOWNLOADS, names[0]);
      const s1 = statSync(f).size;
      await sleep(1200);
      const s2 = statSync(f).size;
      if (s1 === s2 && s1 > 0) { file = f; break; }
    }
    await sleep(1000);
  }
  if (!file) throw new Error('导出超时，未生成 GLB 文件');

  if (existsSync(OUT)) rmSync(OUT, { force: true });
  renameSync(file, OUT);
  const mb = (statSync(OUT).size / 1048576).toFixed(2);
  console.log(`✓ 导出成功: ${OUT}  (${mb} MB, 耗时 ${((Date.now() - started) / 1000).toFixed(1)}s)`);
} catch (e) {
  console.error('✗ 导出失败:', e.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
  await sleep(400);
  process.exit();
}
