'use strict';

/** 数据库行（snake_case）与业务层对象（camelCase）之间的转换 */

function camelKey(key) {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function snakeKey(key) {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function toCamel(row) {
  if (!row) return row;
  if (Array.isArray(row)) return row.map(toCamel);
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[camelKey(key)] = value;
  }
  return out;
}

function toSnake(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    out[snakeKey(key)] = value;
  }
  return out;
}

module.exports = { toCamel, toSnake, camelKey, snakeKey };
