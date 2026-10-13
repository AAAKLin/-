'use strict';

/**
 * 截图脚本（开发辅助）：通过 CDP 驱动无头 Chrome 截取指定视口的页面截图。
 * 用法：先启动 chrome --headless=new --remote-debugging-port=9222 about:blank
 * 然后：node scripts/screenshot.cjs <url> <宽> <高> <输出.png> [mobile:0|1] [light|dark] [点击选择器]
 *
 * 最后一个参数可选，传入 CSS 选择器时会在截图前点击它（用于截取弹窗等交互态）。
 * 例：node scripts/screenshot.cjs "http://127.0.0.1:3100/#/home" 1440 1100 shots/dlg.png 0 light "[data-action=\"open-settings\"]"
 */

const fs = require('node:fs');
const [, , url = 'http://127.0.0.1:3100/#/home', w = '390', h = '844', out = 'screenshots/shot.png',
  mobile = '1', theme = 'light', clickSelector = ''] = process.argv;

async function main() {
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: mobile === '1',
  });
  // 禁用 HTTP 缓存，保证每次截到的是最新样式
  await send('Network.enable', {});
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 1200));

  // 显式写入主题并刷新，保证截图时页面（含图表）按目标主题渲染
  await send('Runtime.evaluate', {
    expression: `try { localStorage.setItem('theme', ${JSON.stringify(theme)}); } catch(e) {}`,
  });
  await send('Page.reload', {});
  await new Promise((r) => setTimeout(r, 4000));

  // 可选：点击某个元素后再截图（用于验证弹窗等交互态）
  if (clickSelector) {
    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(clickSelector)});
        if (!el) return 'NOT_FOUND';
        el.click();
        return 'CLICKED';
      })()`,
      returnByValue: true,
    });
    console.log(`click ${clickSelector} -> ${res?.result?.value}`);
    await new Promise((r) => setTimeout(r, 2500));
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`saved: ${out}`);
  ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('failed:', err.message);
  process.exit(1);
});
