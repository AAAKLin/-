'use strict';

const { getDb } = require('../db');

const COLUMNS = [
  'id', 'date', 'meal', 'entry_type', 'ref_id', 'label', 'servings', 'grams',
  'kcal', 'protein', 'fat', 'carb', 'is_estimate', 'created_at',
];

function hydrate(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.date,
    meal: row.meal,
    entryType: row.entry_type,
    refId: row.ref_id,
    label: row.label,
    servings: row.servings,
    grams: row.grams,
    kcal: row.kcal,
    protein: row.protein,
    fat: row.fat,
    carb: row.carb,
    isEstimate: row.is_estimate === 1,
    createdAt: row.created_at,
  };
}

function listByDate(date) {
  return getDb().prepare(`SELECT ${COLUMNS.join(', ')} FROM food_logs WHERE date = ? ORDER BY meal, id`).all(date).map(hydrate);
}

function listBetween(from, to) {
  return getDb()
    .prepare(`SELECT ${COLUMNS.join(', ')} FROM food_logs WHERE date >= ? AND date <= ? ORDER BY date, id`)
    .all(from, to)
    .map(hydrate);
}

function findById(id) {
  return hydrate(getDb().prepare(`SELECT ${COLUMNS.join(', ')} FROM food_logs WHERE id = ?`).get(id));
}

function create(entry) {
  const info = getDb().prepare(`
    INSERT INTO food_logs (date, meal, entry_type, ref_id, label, servings, grams, kcal, protein, fat, carb, is_estimate, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.date,
    entry.meal || 'snack',
    entry.entryType || 'food',
    entry.refId ?? null,
    entry.label,
    entry.servings ?? 1,
    entry.grams ?? 0,
    entry.kcal ?? 0,
    entry.protein ?? 0,
    entry.fat ?? 0,
    entry.carb ?? 0,
    entry.isEstimate ? 1 : 0,
    new Date().toISOString(),
  );
  return findById(Number(info.lastInsertRowid));
}

function update(id, patch) {
  const map = {
    date: 'date', meal: 'meal', label: 'label', servings: 'servings', grams: 'grams',
    kcal: 'kcal', protein: 'protein', fat: 'fat', carb: 'carb', isEstimate: 'is_estimate',
  };
  const fields = [];
  const values = [];
  for (const [key, column] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(typeof patch[key] === 'boolean' ? (patch[key] ? 1 : 0) : patch[key]);
    }
  }
  if (fields.length === 0) return findById(id);
  getDb().prepare(`UPDATE food_logs SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  return findById(id);
}

function remove(id) {
  return getDb().prepare('DELETE FROM food_logs WHERE id = ?').run(id).changes > 0;
}

function loggedDatesBetween(from, to) {
  return getDb()
    .prepare('SELECT DISTINCT date FROM food_logs WHERE date >= ? AND date <= ? ORDER BY date')
    .all(from, to)
    .map((r) => r.date);
}

/** 常用食物：按使用次数排序，便于"快速添加" */
function frequentlyUsedFoods(limit = 8) {
  return getDb()
    .prepare(`
      SELECT ref_id AS food_id, COUNT(*) AS uses, MAX(date) AS last_date
      FROM food_logs WHERE entry_type = 'food' AND ref_id IS NOT NULL
      GROUP BY ref_id ORDER BY uses DESC, last_date DESC LIMIT ?
    `)
    .all(limit)
    .map((r) => ({ foodId: r.food_id, uses: r.uses, lastDate: r.last_date }));
}

module.exports = { listByDate, listBetween, findById, create, update, remove, loggedDatesBetween, frequentlyUsedFoods };
