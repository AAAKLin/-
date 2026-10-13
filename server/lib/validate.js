'use strict';

/**
 * 极简输入校验器。
 * 所有外部输入都在边界（控制器）处校验，服务层只接收干净数据。
 * 用法：const v = new Validator(req.body); const data = v.string('name',{required:true}).number('grams',{min:0}).done();
 */

const { ValidationError } = require('../errors');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class Validator {
  constructor(source = {}) {
    this.source = source && typeof source === 'object' ? source : {};
    this.errors = [];
    this.out = {};
  }

  _fail(field, message) {
    this.errors.push({ field, message });
    return this;
  }

  string(field, opts = {}) {
    const { required = false, min = 0, max = 200, allowed = null, default: def, trim = true } = opts;
    let raw = this.source[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) return this._fail(field, `${field} 为必填项`);
      if (def !== undefined) this.out[field] = def;
      return this;
    }
    if (typeof raw !== 'string') return this._fail(field, `${field} 必须是字符串`);
    const value = trim ? raw.trim() : raw;
    if (value.length < min) return this._fail(field, `${field} 至少 ${min} 个字符`);
    if (value.length > max) return this._fail(field, `${field} 最多 ${max} 个字符`);
    if (allowed && !allowed.includes(value)) {
      return this._fail(field, `${field} 只能是：${allowed.join(' / ')}`);
    }
    this.out[field] = value;
    return this;
  }

  number(field, opts = {}) {
    const { required = false, min = -Infinity, max = Infinity, integer = false, default: def } = opts;
    let raw = this.source[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) return this._fail(field, `${field} 为必填项`);
      if (def !== undefined) this.out[field] = def;
      return this;
    }
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value)) return this._fail(field, `${field} 必须是数字`);
    if (integer && !Number.isInteger(value)) return this._fail(field, `${field} 必须是整数`);
    if (value < min) return this._fail(field, `${field} 不能小于 ${min}`);
    if (value > max) return this._fail(field, `${field} 不能大于 ${max}`);
    this.out[field] = value;
    return this;
  }

  date(field, opts = {}) {
    const { required = false, default: def } = opts;
    const raw = this.source[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) return this._fail(field, `${field} 为必填项`);
      if (def !== undefined) this.out[field] = def;
      return this;
    }
    if (typeof raw !== 'string' || !DATE_RE.test(raw)) {
      return this._fail(field, `${field} 必须是 YYYY-MM-DD 格式`);
    }
    const d = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(d.getTime())) return this._fail(field, `${field} 不是有效日期`);
    this.out[field] = raw;
    return this;
  }

  boolean(field, opts = {}) {
    const { default: def = false } = opts;
    const raw = this.source[field];
    if (raw === undefined || raw === null) {
      this.out[field] = def;
      return this;
    }
    if (typeof raw === 'boolean') {
      this.out[field] = raw;
      return this;
    }
    if (raw === 'true' || raw === 1 || raw === '1') {
      this.out[field] = true;
      return this;
    }
    if (raw === 'false' || raw === 0 || raw === '0') {
      this.out[field] = false;
      return this;
    }
    return this._fail(field, `${field} 必须是布尔值`);
  }

  /** 结束校验：有错误则抛 ValidationError，否则返回清洗后的对象 */
  done() {
    if (this.errors.length > 0) {
      throw new ValidationError('请求参数校验失败', this.errors);
    }
    return this.out;
  }
}

module.exports = { Validator, DATE_RE };
