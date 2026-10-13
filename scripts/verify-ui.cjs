'use strict';

/**
 * UI 回归验证（开发辅助）：通过 CDP 驱动无头 Chrome，对关键交互做真实点击断言。
 * 覆盖：弹窗关闭按钮、档案保存的前端预校验提示、按档案估算的原地刷新。
 *
 * 用法：
 *   1. 启动应用：npm start（默认 3100 端口）
 *   2. 启动浏览器：chrome --headless=new --remote-debugging-port=9222 about:blank
 *   3. node scripts/verify-ui.cjs [url]（默认 http://127.0.0.1:3100/）
 *
 * 全部通过退出码为 0，任一失败退出码为 1。
 */

const fs = require('node:fs');
const path = require('path');

const URL_TARGET = process.argv[2] || 'http://127.0.0.1:3100/';
const SHOT_DIR = path.join(__dirname, '..', 'screenshots');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('找不到浏览器页面目标，请先以 --remote-debugging-port=9222 启动 Chrome');

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

  // 手机视口 + 禁用缓存，保证验的是最新代码
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Network.enable', {});
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: URL_TARGET });

  /** 在页面里执行表达式并取回值 */
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true });
    return res?.result?.value;
  };
  /** 轮询直到条件成立或超时 */
  const waitFor = async (expression, timeout = 6000) => {
    const start = Date.now();
    for (;;) {
      const value = await evaluate(expression);
      if (value) return value;
      if (Date.now() - start > timeout) return null;
      await sleep(150);
    }
  };

  // 等应用启动完成（顶部栏设置按钮出现）
  const ready = await waitFor(`!!document.querySelector('#btn-settings-top')`, 10000);
  check('应用可以打开', Boolean(ready));

  // 1. 打开设置弹窗
  await evaluate(`document.querySelector('#btn-settings-top').click()`);
  const modalOpen = await waitFor(`!!document.querySelector('.modal-backdrop .modal')`);
  check('点击右上角设置，弹窗打开', Boolean(modalOpen));

  // 2. 点弹窗右上角关闭按钮（本次修复的核心）
  await evaluate(`document.querySelector('.modal-close').click()`);
  await sleep(400);
  const modalClosedByX = await evaluate(`!document.querySelector('.modal-backdrop')`);
  check('点右上角 ✕ 能关闭弹窗', Boolean(modalClosedByX));

  // 3. 重新打开，清空年龄后保存：应得到明确中文提示且弹窗不关
  await evaluate(`document.querySelector('#btn-settings-top').click()`);
  await waitFor(`!!document.querySelector('#s-age')`);
  const originalAge = await evaluate(`document.querySelector('#s-age').value`);
  await evaluate(`document.querySelector('#s-age').value = ''`);
  await evaluate(`document.querySelector('#s-save').click()`);
  const emptyToast = await waitFor(`(document.getElementById('toast-root').textContent || '').includes('请填写年龄')`);
  check('年龄留空保存时提示「请填写年龄」', Boolean(emptyToast), emptyToast ? '提示文案正确' : '未出现预期提示');
  const stillOpen = await evaluate(`!!document.querySelector('.modal-backdrop')`);
  check('校验不通过时弹窗保持打开', Boolean(stillOpen));

  // 4. 填回年龄保存：应提示成功并关闭
  await evaluate(`document.querySelector('#s-age').value = ${JSON.stringify(originalAge)}`);
  await evaluate(`document.querySelector('#s-save').click()`);
  const savedToast = await waitFor(`(document.getElementById('toast-root').textContent || '').includes('档案已保存')`);
  check('填写完整后保存成功', Boolean(savedToast));
  await sleep(400);
  const closedAfterSave = await evaluate(`!document.querySelector('.modal-backdrop')`);
  check('保存成功后弹窗关闭', Boolean(closedAfterSave));

  // 5. 重新按档案估算：弹窗内原地刷新目标值，不关闭
  await evaluate(`document.querySelector('#btn-settings-top').click()`);
  await waitFor(`!!document.querySelector('#s-recompute')`);
  await evaluate(`document.querySelector('#s-recompute').click()`);
  const recomputeToast = await waitFor(`(document.getElementById('toast-root').textContent || '').includes('已按档案重新估算')`);
  check('估算成功有明确提示', Boolean(recomputeToast));
  await sleep(300);
  const targetState = await evaluate(`(() => {
    const v = (s) => (document.querySelector(s).value || '').trim();
    return {
      kcal: v('#s-kcal'), protein: v('#s-protein'),
      open: !!document.querySelector('.modal-backdrop'),
      title: (document.querySelector('#s-targets-title') || {}).textContent || '',
    };
  })()`);
  check('目标值在弹窗内原地刷新', Boolean(targetState && Number(targetState.kcal) > 0 && Number(targetState.protein) > 0),
    targetState ? `热量 ${targetState.kcal} / 蛋白质 ${targetState.protein}` : '读取失败');
  check('估算后弹窗不关闭', Boolean(targetState && targetState.open));
  check('目标标题切换为自动估算', Boolean(targetState && targetState.title.includes('自动估算')), targetState ? targetState.title : '');

  // 留一张弹窗截图作为视觉确认
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const out = path.join(SHOT_DIR, 'verify-settings-modal.png');
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(`截图已保存: ${out}`);
  } catch (err) {
    console.log(`截图跳过: ${err.message}`);
  }

  ws.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n共 ${results.length} 项检查，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('验证脚本执行失败:', err.message);
  process.exit(1);
});
