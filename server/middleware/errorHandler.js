'use strict';

const { AppError } = require('../errors');
const { logger } = require('../logger');

/** 未捕获的异步错误转发给错误中间件 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function notFoundHandler(req, res, next) {
  const err = new AppError(`接口不存在：${req.method} ${req.originalUrl}`, { status: 404, code: 'NOT_FOUND' });
  next(err);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;
  const status = isAppError ? err.status : 500;
  const payload = {
    error: {
      code: isAppError ? err.code : 'INTERNAL_ERROR',
      message: isAppError ? err.message : '服务器内部错误，请稍后重试',
      details: isAppError ? err.details : undefined,
      requestId: req.id,
    },
  };

  if (!isAppError) {
    logger.error('未处理异常', { requestId: req.id, path: req.originalUrl, err });
  } else if (status >= 500) {
    logger.error('业务错误（服务端）', { requestId: req.id, code: err.code, err });
  } else {
    logger.warn('业务错误（客户端）', { requestId: req.id, code: err.code, message: err.message });
  }

  res.status(status).json(payload);
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
