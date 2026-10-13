'use strict';

/**
 * 临时调试脚本：通过 CDP 在无头 Chrome 中打开页面并检查水平溢出。
 * 用法：先启动 chrome --remote-debugging-port=9222，再 node scripts/check-viewport.cjs <url> <width> <height>
 */

const [, , url = 'http://127.0.0.1:3100/#/home', w = '390', h = '844'] = process.argv;

async function main() {
  const listRes = await fetch('http://127.0.0.1:9222/json/list');
  const targets = await listRes.json();
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
    width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: true,
  });
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 4000));

  const expr = `(() => {
    const vw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const bad = [...document.querySelectorAll('*')]
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(x => x.r.right > vw + 1)
      .sort((a, b) => b.r.right - a.r.right)
      .slice(0, 10)
      .map(x => x.el.tagName + '.' + String(x.el.className).split(' ').slice(0,2).join('.') + ' right=' + Math.round(x.r.right) + ' text=' + (x.el.textContent || '').slice(0, 24));
    return JSON.stringify({ vw, sw, bad }, null, 1);
  })()`;

  const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(result.result.value);
  ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('failed:', err.message);
  process.exit(1);
});
