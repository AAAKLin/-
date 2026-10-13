'use strict';

/**
 * 备份与恢复：导出为单个 JSON 文件，导入前先校验结构。
 * 恢复会整表替换（破坏性），必须由前端显式确认后调用。
 */

const { getDb } = require('../db');
const { ValidationError } = require('../errors');
const { logger } = require('../logger');

const TABLES = [
  'profile', 'exercises', 'plan_days', 'plan_items', 'workout_logs', 'workout_log_items',
  'foods', 'recipes', 'recipe_items', 'food_logs', 'measurements',
];

const BACKUP_FORMAT = 'fitness-backup';
const BACKUP_VERSION = 1;

function exportData() {
  const db = getDb();
  const data = {};
  for (const table of TABLES) {
    data[table] = db.prepare(`SELECT * FROM ${table}`).all().map((row) => ({ ...row }));
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
    data,
  };
}

function validatePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return ['备份内容必须是 JSON 对象'];
  if (payload.format !== BACKUP_FORMAT) errors.push(`format 必须为 ${BACKUP_FORMAT}`);
  if (!payload.data || typeof payload.data !== 'object') errors.push('缺少 data 字段');
  else {
    for (const table of Object.keys(payload.data)) {
      if (!TABLES.includes(table)) errors.push(`未知数据表：${table}`);
      else if (!Array.isArray(payload.data[table])) errors.push(`${table} 必须是数组`);
    }
  }
  return errors;
}

/**
 * 恢复数据。
 * @param {object} payload 备份内容
 * @param {{mode?: 'replace'|'merge', confirm?: boolean}} options
 */
function importData(payload, { mode = 'replace', confirm = false } = {}) {
  if (!confirm) throw new ValidationError('恢复会覆盖现有数据，请先确认');
  if (!['replace', 'merge'].includes(mode)) throw new ValidationError("mode 只能是 replace 或 merge");

  const errors = validatePayload(payload);
  if (errors.length > 0) throw new ValidationError('备份文件校验失败', errors);

  const db = getDb();
  // 注意：PRAGMA foreign_keys 在事务内无效，必须在 BEGIN 之前关闭
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    if (mode === 'replace') {
      // 先删子表再删父表，避免外键约束干扰
      for (const table of [...TABLES].reverse()) {
        if (payload.data[table]) db.exec(`DELETE FROM ${table}`);
      }
    }

    for (const table of TABLES) {
      const rows = payload.data[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const verb = mode === 'merge' ? 'INSERT OR IGNORE' : 'INSERT';
      const stmt = db.prepare(`${verb} INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
      for (const row of rows) stmt.run(...columns.map((c) => row[c] ?? null));
    }
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
  } catch (err) {
    db.exec('ROLLBACK');
    db.exec('PRAGMA foreign_keys = ON');
    logger.error('恢复备份失败', { err });
    throw new ValidationError(`恢复失败：${err.message}`);
  }

  const counts = {};
  for (const table of TABLES) {
    counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  }
  return { restored: true, mode, counts };
}

module.exports = { exportData, validatePayload, importData, TABLES, BACKUP_FORMAT, BACKUP_VERSION };
