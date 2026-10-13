'use strict';

const { getDb } = require('../db');

function hydrate(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.date,
    weightKg: row.weight_kg,
    waistCm: row.waist_cm,
    note: row.note,
    createdAt: row.created_at,
  };
}

function list({ from, to, limit = 365 } = {}) {
  const where = [];
  const params = [];
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to) { where.push('date <= ?'); params.push(to); }
  const sql = `SELECT id, date, weight_kg, waist_cm, note, created_at FROM measurements
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY date ASC LIMIT ?`;
  return getDb().prepare(sql).all(...params, limit).map(hydrate);
}

function findByDate(date) {
  return hydrate(getDb().prepare('SELECT id, date, weight_kg, waist_cm, note, created_at FROM measurements WHERE date = ?').get(date));
}

/** 同一天重复记录视为更新，避免同一天多条互相矛盾的体重 */
function upsert({ date, weightKg, waistCm, note }) {
  const existing = findByDate(date);
  if (existing) {
    getDb().prepare('UPDATE measurements SET weight_kg = ?, waist_cm = ?, note = ? WHERE id = ?')
      .run(weightKg ?? null, waistCm ?? null, note ?? null, existing.id);
    return findByDate(date);
  }
  const info = getDb().prepare('INSERT INTO measurements (date, weight_kg, waist_cm, note, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(date, weightKg ?? null, waistCm ?? null, note ?? null, new Date().toISOString());
  return findByDate(date) || hydrate(getDb().prepare('SELECT * FROM measurements WHERE id = ?').get(Number(info.lastInsertRowid)));
}

function remove(id) {
  return getDb().prepare('DELETE FROM measurements WHERE id = ?').run(id).changes > 0;
}

function latest() {
  const row = getDb().prepare('SELECT id, date, weight_kg, waist_cm, note, created_at FROM measurements ORDER BY date DESC LIMIT 1').get();
  return hydrate(row);
}

module.exports = { list, findByDate, upsert, remove, latest };
