'use strict';

/**
 * 数据库连接：使用 Node 内置的 node:sqlite（无需安装任何原生依赖）。
 * 单实例 + WAL + 外键约束。
 */

const { DatabaseSync } = require('node:sqlite');
const { config } = require('../config');
const { logger } = require('../logger');

let db = null;

function getDb() {
  if (db) return db;
  db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  logger.info('数据库连接已建立', { dbPath: config.dbPath });
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/** 便于测试：关闭当前连接（数据仍在磁盘上） */
function resetForTests() {
  closeDb();
}

module.exports = { getDb, closeDb, resetForTests };
