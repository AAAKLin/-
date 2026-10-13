'use strict';

/**
 * 结构化日志：每行一个 JSON 对象，方便检索与排查。
 * 不记录密码、令牌、健康隐私明细；只记录必要的定位信息。
 */

const { config } = require('./config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const activeLevel = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level, payload) {
  if (LEVELS[level] < activeLevel) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: 'fitness-api',
    ...payload,
  });
  const stream = LEVELS[level] >= LEVELS.error ? process.stderr : process.stdout;
  if (config.isTest && LEVELS[level] < LEVELS.warn) return; // 测试环境保持输出干净
  stream.write(`${line}\n`);
}

const logger = {
  debug: (message, meta = {}) => emit('debug', { message, ...meta }),
  info: (message, meta = {}) => emit('info', { message, ...meta }),
  warn: (message, meta = {}) => emit('warn', { message, ...meta }),
  error: (message, meta = {}) => {
    const { err, ...rest } = meta;
    emit('error', {
      message,
      ...rest,
      error: err ? { name: err.name, message: err.message, stack: err.stack } : undefined,
    });
  },
};

module.exports = { logger };
