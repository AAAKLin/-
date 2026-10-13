'use strict';

/**
 * AI 客户端单元测试：用假 fetch 覆盖各种失败场景。
 * 绝不发起真实网络请求（也不需要真密钥）。
 *
 * 注意：config 在模块加载时读取一次密钥，所以"带密钥"的用例需要
 * 清掉 require 缓存后重新加载 aiClient（每个测试文件是独立进程，互不影响）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
delete process.env.AI_API_KEY;
// 超时用例不必真等 30 秒：模块加载前把超时压到 300ms
process.env.AI_TIMEOUT_MS = '300';

const aiClient = require('../../server/lib/aiClient');
const { AI_ERROR_CODES } = aiClient;

const realFetch = globalThis.fetch;

/** 清缓存并以"已配置密钥"状态重新加载客户端 */
function loadClientWithKey() {
  process.env.AI_API_KEY = 'sk-test-fake-key-000111';
  delete require.cache[require.resolve('../../server/config')];
  delete require.cache[require.resolve('../../server/lib/aiClient')];
  return require('../../server/lib/aiClient');
}

/** 恢复"未配置密钥"状态 */
function restoreNoKey() {
  delete process.env.AI_API_KEY;
  delete require.cache[require.resolve('../../server/config')];
  delete require.cache[require.resolve('../../server/lib/aiClient')];
}

function mockFetch(impl) {
  globalThis.fetch = impl;
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
  restoreNoKey();
});

test('未配置密钥时 isConfigured() 为 false', () => {
  assert.equal(aiClient.isConfigured(), false);
});

test('describeConfig 不泄露密钥：无密钥时 maskedKey 为 null', () => {
  const d = aiClient.describeConfig();
  assert.equal(d.configured, false);
  assert.equal(d.maskedKey, null);
  assert.equal(d.provider, 'glm');
  assert.equal(d.model, 'glm-4.7-flash');
  assert.match(d.baseUrl, /bigmodel\.cn/);
});

test('describeConfig 只返回脱敏密钥（前2后2位），不含原文', () => {
  const client = loadClientWithKey();
  const d = client.describeConfig();
  assert.equal(d.configured, true);
  assert.ok(d.maskedKey.startsWith('sk'));
  assert.ok(d.maskedKey.endsWith('11'));
  assert.ok(!d.maskedKey.includes('test-fake'));
  assert.ok(!JSON.stringify(d).includes('sk-test-fake-key-000111'));
});

test('未配置密钥时 chat() 抛 AI_NOT_CONFIGURED', async () => {
  await assert.rejects(
    () => aiClient.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    (err) => err instanceof aiClient.AiError && err.code === AI_ERROR_CODES.NOT_CONFIGURED,
  );
});

test('正常返回：解析 content 与 model', async () => {
  const client = loadClientWithKey();
  let capturedBody = null;
  let capturedAuth = null;
  mockFetch(async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    capturedAuth = opts.headers.Authorization;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'glm-4.7-flash',
        choices: [{ message: { role: 'assistant', content: '今天先把腿部训练完成。' } }],
        usage: { total_tokens: 42 },
      }),
    };
  });
  const result = await client.chat({ messages: [{ role: 'user', content: '给我建议' }] });
  assert.equal(result.content, '今天先把腿部训练完成。');
  assert.equal(result.model, 'glm-4.7-flash');
  assert.equal(result.usage.total_tokens, 42);
  // 鉴权头确实带上了密钥
  assert.equal(capturedAuth, 'Bearer sk-test-fake-key-000111');
  // 请求体包含模型与消息
  assert.equal(capturedBody.model, 'glm-4.7-flash');
  assert.equal(capturedBody.messages.length, 1);
});

test('401 映射为 AUTH 错误', async () => {
  const client = loadClientWithKey();
  mockFetch(async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: { message: 'invalid api key' } }),
  }));
  await assert.rejects(
    () => client.chat({ messages: [] }),
    (err) => err.code === AI_ERROR_CODES.AUTH && /invalid api key/.test(err.message),
  );
});

test('429 映射为 RATE_LIMIT 错误', async () => {
  const client = loadClientWithKey();
  mockFetch(async () => ({ ok: false, status: 429, text: async () => 'too many requests' }));
  await assert.rejects(
    () => client.chat({ messages: [] }),
    (err) => err.code === AI_ERROR_CODES.RATE_LIMIT,
  );
});

test('500 映射为 SERVER 错误', async () => {
  const client = loadClientWithKey();
  mockFetch(async () => ({ ok: false, status: 503, text: async () => 'upstream error' }));
  await assert.rejects(
    () => client.chat({ messages: [] }),
    (err) => err.code === AI_ERROR_CODES.SERVER,
  );
});

test('网络断开映射为 NETWORK 错误', async () => {
  const client = loadClientWithKey();
  mockFetch(async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(
    () => client.chat({ messages: [] }),
    (err) => err.code === AI_ERROR_CODES.NETWORK,
  );
});

test('超时（AbortError）映射为 TIMEOUT 错误', async () => {
  const client = loadClientWithKey();
  mockFetch((url, opts) => new Promise((resolve, reject) => {
    // 模拟服务端永不响应，只在被 abort 时拒绝
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  }));
  await assert.rejects(
    () => client.chat({ messages: [] }),
    (err) => err.code === AI_ERROR_CODES.TIMEOUT,
  );
});

test('返回非 JSON 映射为 BAD_RESPONSE', async () => {
  const client = loadClientWithKey();
  mockFetch(async () => ({ ok: true, status: 200, text: async () => '<html>not json</html>' }));
  await assert.rejects(
    () => client.chat({ messages: [] }),
    (err) => err.code === AI_ERROR_CODES.BAD_RESPONSE,
  );
});

test('返回结构缺少 choices 映射为 BAD_RESPONSE', async () => {
  const client = loadClientWithKey();
  mockFetch(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'x' }) }));
  await assert.rejects(
    () => client.chat({ messages: [] }),
    (err) => err.code === AI_ERROR_CODES.BAD_RESPONSE,
  );
});
