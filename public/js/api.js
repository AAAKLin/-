/**
 * 前端 API 客户端：统一封装 fetch，把后端错误结构映射为可读中文提示。
 * 规则：4xx 不重试；5xx 与网络错误自动重试（最多 3 次）；失败给出明确提示。
 */

const MAX_RETRIES = 3;

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const CODE_MESSAGES = {
  VALIDATION_ERROR: '填写的内容有问题，请检查后重试',
  NOT_FOUND: '没有找到对应的数据',
  CONFLICT: '数据存在冲突，请刷新后重试',
  INTERNAL_ERROR: '服务器内部错误，请稍后重试',
};

function friendlyMessage(code, message, status) {
  if (status === 0) return '无法连接服务器，请确认应用已启动（在项目目录执行 npm start）';
  if (code && CODE_MESSAGES[code]) {
    // 校验错误保留后端返回的明细，便于用户知道改哪里
    return message || CODE_MESSAGES[code];
  }
  return message || '请求失败，请稍后重试';
}

async function request(path, { method = 'GET', body, retry = method === 'GET' } = {}) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) options.body = JSON.stringify(body);

  let lastError = null;
  const attempts = retry ? MAX_RETRIES : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(path, options);
      const text = await res.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }

      if (!res.ok) {
        const err = new ApiError(friendlyMessage(payload?.error?.code, payload?.error?.message, res.status), {
          status: res.status,
          code: payload?.error?.code || 'UNKNOWN',
          details: payload?.error?.details,
        });
        if (res.status < 500 || attempt === attempts - 1) throw err;
        lastError = err;
      } else {
        return payload;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status && err.status < 500) throw err;
      lastError = err instanceof ApiError ? err : new ApiError(friendlyMessage(null, null, 0), { status: 0, code: 'NETWORK' });
      if (attempt === attempts - 1) throw lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw lastError || new ApiError('请求失败');
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE', retry: false }),
};
