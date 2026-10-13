'use strict';

/**
 * 日期工具：全应用统一使用本地时区的 YYYY-MM-DD 字符串，避免时区来回换算。
 */

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function today(now = new Date()) {
  return toDateKey(now);
}

function parseDateKey(key) {
  return new Date(`${key}T00:00:00`);
}

function addDays(key, days) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

function diffDays(fromKey, toKey) {
  const a = parseDateKey(fromKey).getTime();
  const b = parseDateKey(toKey).getTime();
  return Math.round((b - a) / 86400000);
}

/** 周一为一周起点，返回该日期所在周的周一 */
function startOfWeek(key) {
  const d = parseDateKey(key);
  const jsDay = d.getDay(); // 0=周日
  const offset = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + offset);
  return toDateKey(d);
}

/** 0=周一 ... 6=周日 */
function dayIndex(key) {
  const jsDay = parseDateKey(key).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function dateRange(fromKey, toKey) {
  const out = [];
  let cursor = fromKey;
  // 防止异常输入导致死循环
  for (let i = 0; i < 3650 && diffDays(cursor, toKey) >= 0; i += 1) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

module.exports = { toDateKey, today, parseDateKey, addDays, diffDays, startOfWeek, dayIndex, dateRange, pad };
