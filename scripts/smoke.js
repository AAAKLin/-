'use strict';

/**
 * 冒烟脚本：对"已经在运行"的服务做一次端到端检查。
 * 用法：先 npm start（或 node server/index.js），再另开终端执行 npm run smoke
 * 可通过 BASE_URL 环境变量指定地址，默认 http://127.0.0.1:3100
 */

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3100';

const checks = [];
let failed = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
  } catch (err) {
    failed += 1;
    checks.push({ name, ok: false, detail: err.message });
  }
}

async function json(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`冒烟检查目标：${BASE_URL}\n`);

  await check('健康检查 /health', async () => {
    const res = await json('/health');
    if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
    return `version=${res.body.version}`;
  });

  await check('今日聚合 /api/today', async () => {
    const res = await json('/api/today');
    if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
    if (!res.body.date) throw new Error('缺少 date 字段');
    return `训练状态=${res.body.training.status}，建议 ${res.body.recommendations.length} 条`;
  });

  await check('训练计划 /api/training/plan', async () => {
    const res = await json('/api/training/plan');
    if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
    const trainingDays = res.body.days.filter((d) => !d.restDay).length;
    return `${res.body.weekStart} 起，训练日 ${trainingDays} 天`;
  });

  await check('饮食日汇总 /api/diet/day', async () => {
    const res = await json('/api/diet/day');
    if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
    return `热量 ${res.body.totals.kcal}/${res.body.targets.kcal} 千卡，记录 ${res.body.entryCount} 条`;
  });

  await check('进度汇总 /api/progress/summary', async () => {
    const res = await json('/api/progress/summary?days=30');
    if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
    return `体重数据点 ${res.body.weight.trend.count} 个，饮食覆盖 ${res.body.dietCoverage.coverageRate}%`;
  });

  await check('食物库 /api/diet/foods', async () => {
    const res = await json('/api/diet/foods?limit=5');
    if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
    if (!res.body.items.length) throw new Error('食物库为空，种子数据未写入');
    return `示例：${res.body.items[0].name}`;
  });

  await check('备份导出 /api/backup/export', async () => {
    const res = await json('/api/backup/export');
    if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
    return `包含 ${Object.keys(res.body.data).length} 张表`;
  });

  await check('前端首页 /', async () => {
    const res = await fetch(`${BASE_URL}/`);
    const text = await res.text();
    if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
    if (!text.includes('今日行动中心')) throw new Error('首页内容异常');
    return 'HTML 正常返回';
  });

  console.log('检查结果：');
  for (const item of checks) {
    console.log(`  ${item.ok ? '✓' : '✗'} ${item.name} — ${item.detail}`);
  }
  console.log(`\n合计 ${checks.length} 项，失败 ${failed} 项。`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('冒烟脚本执行失败：', err.message);
  console.error('请确认服务已启动：在项目目录执行 npm start');
  process.exitCode = 1;
});
