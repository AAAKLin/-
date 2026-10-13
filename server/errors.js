'use strict';

/**
 * 类型化错误体系：控制器/服务只抛出类型化错误，
 * 全局错误中间件统一转换为规范化 JSON，客户端永远看不到堆栈。
 */

class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true; // 类型化错误默认对外可见
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

class ValidationError extends AppError {
  constructor(message = '请求参数校验失败', details) {
    super(message, { status: 400, code: 'VALIDATION_ERROR', details });
  }
}

class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(message, { status: 404, code: 'NOT_FOUND' });
  }
}

class ConflictError extends AppError {
  constructor(message = '资源冲突', details) {
    super(message, { status: 409, code: 'CONFLICT', details });
  }
}

class BadRequestError extends AppError {
  constructor(message = '请求无法处理', details) {
    super(message, { status: 400, code: 'BAD_REQUEST', details });
  }
}

module.exports = { AppError, ValidationError, NotFoundError, ConflictError, BadRequestError };
