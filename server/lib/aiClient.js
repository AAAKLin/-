'use strict';

/**
 * AI 客户端：OpenAI 兼容协议的极简实现（零第三方依赖，用 Node 22 内置 fetch）。
 *
 * 设计原则：
 * 1. 只做"发一次对话请求"这一件事，不掺业务逻辑（业务在 aiService）
 * 2. 所有失败都转成带 code 的 AiError，方便上层决定"降级还是报错"
 * 3. 密钥只能从 config.getApiKey() 取，任何日志/错误信息里都不出现密钥原文
 * 4. 没有配置密钥时直接抛 AI_NOT_CONFIGURED，调用方应降级到规则建议
 */

const { config, getApiKey } = require('../config');

/** 错误码一览（前端与上层服务都靠这些 code 做分支，不要改字符串） */
const AI_ERROR_CODES = {
  NOT_CONFIGURED: 'AI_NOT_CONFIGURED', // 没配密钥 → 应降级
  TIMEOUT: 'AI_TIMEOUT', //             // 超时 → 可降级
  NETWORK: 'AI_NETWORK', //             // 网络不通 → 可降级
  AUTH: 'AI_AUTH', //                   // 401/密钥无效 → 提示用户检查配置
  RATE_LIMIT: 'AI_RATE_LIMIT', //       // 429 免费额度限流 → 稍后重试
  BAD_RESPONSE: 'AI_BAD_RESPONSE', //   // 返回结构不符合预期 → 降级
  SERVER: 'AI_SERVER', //               // 5xx → 降级
};

class AiError extends Error {
  /**
   * @param {string} code AI_ERROR_CODES 之一
   * @param {string} message 给人看的说明（绝不包含密钥）
   * @param {object} [extra] 附带信息（status 等）
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.status = extra.status ?? null;
  }
}

/** 是否已配置密钥（不读密钥内容） */
function isConfigured() {
  return Boolean(getApiKey());
}

/** 脱敏后的密钥（仅供设置页展示，确认加载的是哪把钥匙） */
function describeConfig() {
  return {
    provider: config.ai.provider,
    model: config.ai.model,
    baseUrl: config.ai.baseUrl,
    configured: config.ai.configured,
    source: config.ai.source,
    error: config.ai.error,
    maskedKey: config.ai.maskedKey,
    timeoutMs: config.ai.timeoutMs,
  };
}

/**
 * 把 HTTP 错误状态翻译成 AiError。智谱的错误体形如 { error: { code, message } }。
 */
function errorFromStatus(status, bodyText) {
  let detail = '';
  try {
    const parsed = JSON.parse(bodyText);
    detail = parsed?.error?.message || parsed?.message || '';
  } catch {
    detail = bodyText ? String(bodyText).slice(0, 200) : '';
  }
  if (status === 401 || status === 403) {
    return new AiError(AI_ERROR_CODES.AUTH, `API Key 无效或已过期（HTTP ${status}）${detail ? `：${detail}` : ''}`, { status });
  }
  if (status === 429) {
    return new AiError(AI_ERROR_CODES.RATE_LIMIT, `请求太频繁被限流（HTTP 429），稍后再试${detail ? `：${detail}` : ''}`, { status });
  }
  if (status >= 500) {
    return new AiError(AI_ERROR_CODES.SERVER, `AI 服务端异常（HTTP ${status}）${detail ? `：${detail}` : ''}`, { status });
  }
  return new AiError(AI_ERROR_CODES.BAD_RESPONSE, `AI 接口返回异常（HTTP ${status}）${detail ? `：${detail}` : ''}`, { status });
}

/**
 * 发一次对话补全请求。
 * @param {object} options
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} options.messages
 * @param {number} [options.temperature] 随机性，越低越稳定（默认 0.4，建议类场景要稳定）
 * @param {number} [options.maxTokens] 最大输出长度
 * @param {AbortSignal} [options.signal] 外部取消信号（可选）
 * @returns {Promise<{content:string, model:string, usage:object|null}>}
 */
async function chat({ messages, temperature = 0.4, maxTokens, signal }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AiError(AI_ERROR_CODES.NOT_CONFIGURED, '尚未配置 API Key，AI 功能未启用');
  }

  const url = `${config.ai.baseUrl}/chat/completions`;
  const timeoutMs = config.ai.timeoutMs;

  // 超时控制：AbortController 是 Node 15+ 内置能力
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 调用方如果传了自己的 signal，取消时一并中断
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 智谱的 OpenAI 兼容鉴权头
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages,
        temperature,
        max_tokens: maxTokens || config.ai.maxTokens,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // abort 分两种：自己超时的、外部取消的
    if (err && err.name === 'AbortError') {
      throw new AiError(AI_ERROR_CODES.TIMEOUT, `AI 请求超时（${timeoutMs}ms 无响应）`);
    }
    throw new AiError(AI_ERROR_CODES.NETWORK, `无法连接 AI 服务：${err.message}`);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }

  const text = await response.text();
  if (!response.ok) {
    throw errorFromStatus(response.status, text);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new AiError(AI_ERROR_CODES.BAD_RESPONSE, 'AI 返回的不是合法 JSON');
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string' || !content.trim()) {
    throw new AiError(AI_ERROR_CODES.BAD_RESPONSE, 'AI 返回内容为空');
  }

  return {
    content: content.trim(),
    model: payload.model || config.ai.model,
    usage: payload.usage || null,
  };
}

module.exports = { chat, isConfigured, describeConfig, AiError, AI_ERROR_CODES };
