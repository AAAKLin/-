'use strict';

const crypto = require('node:crypto');
const { logger } = require('../logger');

/** 请求 ID + 访问日志：贯穿同一请求的日志链路 */
function requestContext(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info('请求完成', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}

/** 基础安全头（本地单机应用，仅做最低限度的加固） */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.originalUrl.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
}

module.exports = { requestContext, securityHeaders };
