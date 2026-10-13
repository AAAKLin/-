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

/** 校验明细里的字段名 → 中文名（覆盖全站表单字段，未知字段按原名展示） */
const FIELD_LABELS = {
  displayName: '昵称', sex: '性别', age: '年龄', heightCm: '身高', weightKg: '体重',
  activityLevel: '日常活动量', goal: '目标', experience: '训练经验', availableDays: '每周可训练天数',
  sessionMinutes: '单次时长', equipment: '可用器械', limitations: '身体限制', budgetLevel: '预算偏好',
  targetKcal: '目标热量', targetProtein: '目标蛋白质', targetFat: '目标脂肪', targetCarb: '目标碳水',
  targetSource: '目标来源',
  name: '名称', category: '分类', servingLabel: '份量标签', servingGrams: '每份克数',
  kcal: '热量', protein: '蛋白质', fat: '脂肪', carb: '碳水', isEstimate: '是否估算值',
  budgetFriendly: '是否低预算', date: '日期', meal: '餐次', entryType: '记录类型', refId: '关联内容',
  servings: '份数', grams: '克数', q: '搜索关键词', budgetOnly: '仅看低预算', note: '备注',
  days: '天数', from: '开始日期', to: '结束日期', waistCm: '腰围',
  movement: '动作模式', level: '难度', isTimeBased: '是否计时动作', defaultSets: '默认组数',
  defaultReps: '默认次数', defaultDurationSec: '默认时长', restSec: '休息秒数', cue: '动作要领',
  weekStart: '周开始日期', targetSets: '目标组数', targetReps: '目标次数', targetDurationSec: '目标时长',
  planDayId: '计划日', status: '状态', perceivedDifficulty: '难度感受',
  mode: '模式', confirm: '确认',
};

/** 餐次枚举值中文化 */
const MEAL_LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

/** 把后端 ValidationError 的 details 拼成用户能看懂的提示，例如「年龄」需在 10 - 100 之间 */
function validationMessage(details) {
  if (!Array.isArray(details) || details.length === 0) return null;
  const parts = details
    .map((d) => {
      const field = d && typeof d.field === 'string' ? d.field : '';
      const label = FIELD_LABELS[field] || field;
      let msg = d && typeof d.message === 'string' ? d.message : '';
      if (!msg) return label ? `「${label}」填写有误` : '';
      if (field && msg.includes(field)) {
        msg = msg.replace(field, `「${label}」`);
      } else if (label) {
        msg = `「${label}」：${msg}`;
      }
      return msg.replace(/\b(breakfast|lunch|dinner|snack)\b/g, (m) => MEAL_LABELS[m]);
    })
    .filter(Boolean);
  return parts.length > 0 ? `请检查填写内容：${parts.join('；')}` : null;
}

function friendlyMessage(code, message, status, details) {
  if (status === 0) return '无法连接服务器，请确认应用已启动（在项目目录执行 npm start）';
  if (code === 'VALIDATION_ERROR') {
    // 校验错误优先展示具体字段的中文明细，让用户知道改哪里
    return validationMessage(details) || message || CODE_MESSAGES[code];
  }
  if (code && CODE_MESSAGES[code]) {
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
        const err = new ApiError(friendlyMessage(payload?.error?.code, payload?.error?.message, res.status, payload?.error?.details), {
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
