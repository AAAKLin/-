'use strict';

/**
 * 集成测试：在临时数据库上启动真实服务，逐个验证核心业务流程。
 * 使用临时目录，不触碰开发数据库。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-it-'));
process.env.DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { runMigrations } = require('../../server/db/migrate');
const { seedReferenceData, ensureDefaultProfile } = require('../../server/db/seed');
const { createApp } = require('../../server/app');
const { getDb } = require('../../server/db');

let server;
let baseUrl;

async function call(method, endpoint, body) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

const get = (endpoint) => call('GET', endpoint);
const post = (endpoint, body) => call('POST', endpoint, body);
const put = (endpoint, body) => call('PUT', endpoint, body);
const del = (endpoint) => call('DELETE', endpoint);

test.before(() => {
  runMigrations();
  seedReferenceData();
  ensureDefaultProfile();
  const app = createApp();
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(() => {
  if (server) server.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // 清理失败不影响测试结果
  }
});

test('健康检查与就绪检查', async () => {
  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');

  const ready = await get('/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.body.status, 'ready');
});

test('未知接口返回规范化的 404 错误结构', async () => {
  const res = await get('/api/not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
  assert.ok(res.body.error.message);
});

test('档案更新后目标自动重算', async () => {
  const updated = await put('/api/profile', {
    sex: 'male', age: 30, heightCm: 180, weightKg: 80, activityLevel: 'light', goal: 'fat_loss',
    availableDays: 3, sessionMinutes: 40, equipment: 'none', budgetLevel: 'low',
  });
  assert.equal(updated.status, 200);
  const { targets } = updated.body;
  assert.ok(targets.kcal > 0);
  assert.equal(targets.protein, Math.round(80 * 1.8));

  const fetched = await get('/api/profile');
  assert.equal(fetched.body.profile.weightKg, 80);
});

test('非法档案输入被拒绝（400 + 明细）', async () => {
  const res = await put('/api/profile', { heightCm: 20 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(res.body.error.details.some((d) => d.field === 'heightCm'));
});

test('生成周计划：训练日数量与档案一致，休息日无动作', async () => {
  const res = await post('/api/training/plan/generate', { date: '2026-02-10' });
  assert.equal(res.status, 200);
  const days = res.body.days;
  assert.equal(days.length, 7);
  const trainingDays = days.filter((d) => !d.restDay);
  assert.equal(trainingDays.length, 3);
  assert.ok(trainingDays.every((d) => d.items.length > 0));
  assert.ok(days.filter((d) => d.restDay).every((d) => d.items.length === 0));
});

/** 相对今天的日期，保证测试数据落在统计窗口内 */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 计划日只返回 dayIndex，前端/测试需要自行换算日期 */
function dayDate(weekStart, dayIndex) {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + dayIndex);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('训练记录：快速记录写入并出现在历史中', async () => {
  const plan = await get('/api/training/plan?date=2026-02-10');
  const day = plan.body.days.find((d) => !d.restDay);
  const date = dayDate(plan.body.weekStart, day.dayIndex);
  const res = await post('/api/training/logs', { date, planDayId: day.id, status: 'completed' });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'completed');
  assert.equal(res.body.items.length, day.items.length);
  assert.ok(res.body.items.every((i) => i.done === 1 || i.done === true));

  const history = await get('/api/training/logs?from=2026-02-01&to=2026-02-28');
  assert.ok(history.body.items.some((l) => l.date === date));
});

test('同一天重复提交是更新而不是新增', async () => {
  const plan = await get('/api/training/plan?date=2026-02-10');
  const day = plan.body.days.find((d) => !d.restDay);
  const date = dayDate(plan.body.weekStart, day.dayIndex);
  await post('/api/training/logs', { date, planDayId: day.id, status: 'partial' });
  const logs = await get(`/api/training/logs?from=${date}&to=${date}`);
  assert.equal(logs.body.items.length, 1);
  assert.equal(logs.body.items[0].status, 'partial');
});

test('非法训练状态被拒绝', async () => {
  const res = await post('/api/training/logs', { date: '2026-02-10', status: 'maybe' });
  assert.equal(res.status, 400);
});

test('饮食记录：新增后当日总热量重算，修改克数后再次更新', async () => {
  const foods = await get('/api/diet/foods?q=鸡蛋');
  const egg = foods.body.items.find((f) => f.name === '鸡蛋（全蛋）');
  assert.ok(egg, '食物库应包含鸡蛋');

  const created = await post('/api/diet/entries', { date: '2026-02-10', meal: 'breakfast', entryType: 'food', refId: egg.id, grams: 100 });
  assert.equal(created.status, 201);
  assert.equal(created.body.kcal, 143);

  const day1 = await get('/api/diet/day?date=2026-02-10');
  assert.equal(day1.body.totals.kcal, 143);

  const updated = await put(`/api/diet/entries/${created.body.id}`, { grams: 200 });
  assert.equal(updated.body.kcal, 286);

  const day2 = await get('/api/diet/day?date=2026-02-10');
  assert.equal(day2.body.totals.kcal, 286);

  const removed = await del(`/api/diet/entries/${created.body.id}`);
  assert.equal(removed.status, 200);
  const day3 = await get('/api/diet/day?date=2026-02-10');
  assert.equal(day3.body.totals.kcal, 0);
});

test('饮食记录：引用不存在的食物返回 404', async () => {
  const res = await post('/api/diet/entries', { date: '2026-02-10', meal: 'lunch', entryType: 'food', refId: 999999, grams: 100 });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('自定义食物与食谱：可创建并按份计算营养', async () => {
  const food = await post('/api/diet/foods', {
    name: '测试鸡胸', category: 'protein', servingLabel: '一块 100 克', servingGrams: 100,
    kcal: 165, protein: 31, fat: 3.6, carb: 0, isEstimate: true,
  });
  assert.equal(food.status, 201);

  const tofu = (await get('/api/diet/foods?q=北豆腐')).body.items[0];
  const recipe = await post('/api/diet/recipes', {
    name: '测试食谱', servings: 2, items: [
      { foodId: food.body.id, grams: 200 },
      { foodId: tofu.id, grams: 300 },
    ],
  });
  assert.equal(recipe.status, 201);
  // 合计 330 + 348 = 678 千卡，每份 339
  assert.equal(recipe.body.nutrition.totals.kcal, 678);
  assert.equal(recipe.body.nutrition.perServing.kcal, 339);

  const entry = await post('/api/diet/entries', {
    date: '2026-02-11', meal: 'dinner', entryType: 'recipe', refId: recipe.body.id, servings: 1,
  });
  assert.equal(entry.status, 201);
  assert.equal(entry.body.kcal, 339);
  assert.equal(entry.body.isEstimate, true);
});

test('体重记录：同一天重复提交是更新，趋势可计算', async () => {
  const day1 = daysAgo(9);
  const day2 = daysAgo(0);

  const first = await post('/api/progress/measurements', { date: day1, weightKg: 86, waistCm: 96 });
  assert.equal(first.status, 201);
  const second = await post('/api/progress/measurements', { date: day1, weightKg: 85.5, waistCm: 95.5 });
  assert.equal(second.status, 201);
  assert.equal(second.body.weightKg, 85.5);

  await post('/api/progress/measurements', { date: day2, weightKg: 84.8, waistCm: 95 });

  const list = await get(`/api/progress/measurements?from=${day1}&to=${day2}`);
  assert.equal(list.body.items.length, 2);

  const summary = await get('/api/progress/summary?days=30');
  assert.equal(summary.status, 200);
  assert.equal(summary.body.weight.trend.count, 2);
  assert.ok(summary.body.weight.trend.slopePerWeek < 0);
});

test('体重与腰围都为空时拒绝保存', async () => {
  const res = await post('/api/progress/measurements', { date: '2026-02-12' });
  assert.equal(res.status, 400);
});

test('今日接口聚合训练、饮食与建议', async () => {
  await post('/api/progress/measurements', { date: '2026-02-10', weightKg: 84.8 });
  const res = await get('/api/today?date=2026-02-10');
  assert.equal(res.status, 200);
  assert.equal(res.body.date, '2026-02-10');
  assert.ok(res.body.training.planDay, '应有计划日');
  assert.ok(Array.isArray(res.body.recommendations));
  assert.ok(res.body.diet.targets.kcal > 0);
  assert.ok('adherence' in res.body);
});

test('非法日期参数返回 400', async () => {
  const res = await get('/api/today?date=2026-13-40');
  assert.equal(res.status, 400);
});

test('备份导出 → 恢复：未确认时拒绝，确认后数据一致', async () => {
  const exported = await get('/api/backup/export');
  assert.equal(exported.status, 200);
  assert.equal(exported.body.format, 'fitness-backup');
  assert.ok(exported.body.data.foods.length > 0);

  const before = getDb().prepare('SELECT COUNT(*) AS n FROM foods').get().n;

  const noConfirm = await post('/api/backup/import', { mode: 'replace', payload: exported.body });
  assert.equal(noConfirm.status, 400);

  const restored = await post('/api/backup/import', { mode: 'replace', confirm: true, payload: exported.body });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.counts.foods, before);
});

test('损坏的备份文件被拒绝且不破坏数据', async () => {
  const before = getDb().prepare('SELECT COUNT(*) AS n FROM foods').get().n;
  const res = await post('/api/backup/import', { mode: 'replace', confirm: true, payload: { format: 'nope', data: { foods: [] } } });
  assert.equal(res.status, 400);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM foods').get().n, before);
});

test('合成演示数据：只补充缺失数据，不覆盖已有记录', async () => {
  const before = getDb().prepare('SELECT COUNT(*) AS n FROM food_logs').get().n;
  const res = await post('/api/demo/load', { days: 28 });
  assert.equal(res.status, 200);
  assert.ok(res.body.measurementsAdded >= 0);
  assert.ok(res.body.workoutsAdded >= 0);
  const after = getDb().prepare('SELECT COUNT(*) AS n FROM food_logs').get().n;
  assert.ok(after >= before);

  const second = await post('/api/demo/load', { days: 28 });
  const after2 = getDb().prepare('SELECT COUNT(*) AS n FROM food_logs').get().n;
  assert.equal(after2, after + second.body.dietEntriesAdded);
});

test('静态首页可访问', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('今日行动中心'));
});
