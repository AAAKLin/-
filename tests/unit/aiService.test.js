'use strict';

/**
 * AI 建议服务单元测试：核心是验证"降级链"——
 * 没密钥 / 请求失败 / 超时，都必须自动降级为规则建议，绝不抛错。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

// DATA_DIR 必须在加载任何依赖 config 的模块之前设置
process.env.DATA_DIR = path.join(os.tmpdir(), `fitness-ai-test-${Date.now()}`);
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
delete process.env.AI_API_KEY;

const { runMigrations } = require('../../server/db/migrate');
const { seedReferenceData, ensureDefaultProfile } = require('../../server/db/seed');
const aiClient = require('../../server/lib/aiClient');
const aiService = require('../../server/services/aiService');
const { today } = require('../../server/lib/dates');

runMigrations();
seedReferenceData();
ensureDefaultProfile();

const realChat = aiClient.chat;

/** 清缓存并以"已配置密钥"状态重新加载 aiClient 与 aiService（todayService 无需重载） */
function loadWithKey() {
  process.env.AI_API_KEY = 'sk-test-fake-key-000111';
  for (const m of ['../../server/config', '../../server/lib/aiClient', '../../server/services/aiService']) {
    delete require.cache[require.resolve(m)];
  }
  return {
    client: require('../../server/lib/aiClient'),
    service: require('../../server/services/aiService'),
  };
}

test.afterEach(() => {
  aiClient.chat = realChat;
  delete process.env.AI_API_KEY;
  for (const m of ['../../server/config', '../../server/lib/aiClient', '../../server/services/aiService']) {
    delete require.cache[require.resolve(m)];
  }
});

test('未配置密钥：降级为规则建议，不抛错', async () => {
  aiClient.chat = async () => { throw new Error('不应被调用'); };
  const advice = await aiService.generateTrainingAdvice(today());
  assert.equal(advice.source, 'rule');
  assert.match(advice.reason, /未配置/);
  assert.ok(advice.text.length > 0);
  assert.ok(advice.generatedAt);
});

test('AI 调用失败：降级为规则建议并带上原因', async () => {
  const { client, service } = loadWithKey();
  client.chat = async () => {
    throw new client.AiError('AI_RATE_LIMIT', '请求太频繁被限流（HTTP 429），稍后再试');
  };
  const advice = await service.generateTrainingAdvice(today());
  assert.equal(advice.source, 'rule');
  assert.match(advice.reason, /429/);
  assert.ok(advice.text.length > 0);
});

test('AI 调用成功：返回 ai 来源与模型名', async () => {
  const { client, service } = loadWithKey();
  client.chat = async ({ messages }) => {
    // 验证发给模型的上下文里确实有系统提示与用户数据
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[1].role, 'user');
    return { content: '今天先把计划里的训练完成，蛋白质还差 30 克，晚饭加个鸡蛋。', model: 'glm-4.7-flash' };
  };
  const advice = await service.generateTrainingAdvice(today());
  assert.equal(advice.source, 'ai');
  assert.equal(advice.model, 'glm-4.7-flash');
  assert.match(advice.text, /蛋白质/);
  assert.equal(advice.reason, undefined);
});

test('prompt 载荷是合法 JSON 且只含汇总字段（无密钥、无明细流水账）', () => {
  const snap = require('../../server/services/todayService').snapshot(today());
  const payload = JSON.parse(aiService.buildUserPayload(snap));
  assert.ok(payload['日期']);
  assert.ok('体重' in payload);
  assert.ok('今日训练' in payload);
  assert.ok('饮食' in payload);
  // 载荷里绝不应出现任何疑似密钥的字段
  const raw = JSON.stringify(payload);
  assert.ok(!/apiKey|api_key|Authorization|Bearer/i.test(raw));
});

test('规则建议在无任何记录时也能给出可执行提示', () => {
  const fakeSnap = {
    training: { hasRecord: false, planDay: { restDay: false, title: '下肢基础' }, log: null },
    diet: { entryCount: 0, comparison: null },
    body: { daysSinceLastMeasurement: 9 },
  };
  const text = aiService.ruleBasedText(fakeSnap);
  assert.match(text, /下肢基础/);
  assert.match(text, /饮食/);
  assert.match(text, /9 天没称重/);
});
