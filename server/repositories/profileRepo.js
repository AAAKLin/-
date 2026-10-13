'use strict';

const { getDb } = require('../db');
const { toCamel } = require('../lib/rows');

const COLUMNS = [
  'id', 'display_name', 'sex', 'age', 'height_cm', 'weight_kg', 'activity_level', 'goal',
  'experience', 'available_days', 'session_minutes', 'equipment', 'limitations', 'budget_level',
  'target_kcal', 'target_protein', 'target_fat', 'target_carb', 'target_source', 'created_at', 'updated_at',
];

function get() {
  const row = getDb().prepare(`SELECT ${COLUMNS.join(', ')} FROM profile WHERE id = 1`).get();
  return toCamel(row);
}

function update(patch) {
  const allowed = COLUMNS.filter((c) => c !== 'id' && c !== 'created_at');
  const keys = Object.keys(patch).map((k) => k.replace(/([A-Z])/g, '_$1').toLowerCase()).filter((k) => allowed.includes(k));
  if (keys.length === 0) return get();

  const assignments = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => {
    const camel = k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    return patch[camel] ?? null;
  });
  const sql = `UPDATE profile SET ${assignments}, updated_at = ? WHERE id = 1`;
  getDb().prepare(sql).run(...values, new Date().toISOString());
  return get();
}

module.exports = { get, update };
