'use strict';

const { getDb } = require('../db');
const { toCamel } = require('../lib/rows');

const COLUMNS = [
  'id', 'name', 'category', 'movement', 'equipment', 'level', 'is_time_based',
  'default_sets', 'default_reps', 'default_duration_sec', 'rest_sec', 'cue',
  'easier_alternative_id', 'harder_alternative_id', 'origin',
];

function list({ category, equipment, level } = {}) {
  const where = [];
  const params = [];
  if (category) { where.push('category = ?'); params.push(category); }
  if (equipment) { where.push("equipment IN ('none', ?)"); params.push(equipment); }
  if (level) { where.push("level IN ('beginner', ?)"); params.push(level); }
  const sql = `SELECT ${COLUMNS.join(', ')} FROM exercises ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`;
  return getDb().prepare(sql).all(...params).map(toCamel);
}

function findById(id) {
  const row = getDb().prepare(`SELECT ${COLUMNS.join(', ')} FROM exercises WHERE id = ?`).get(id);
  return toCamel(row);
}

function findByName(name) {
  const row = getDb().prepare(`SELECT ${COLUMNS.join(', ')} FROM exercises WHERE name = ?`).get(name);
  return toCamel(row);
}

function create(data) {
  const now = new Date().toISOString();
  const info = getDb().prepare(`
    INSERT INTO exercises (name, category, movement, equipment, level, is_time_based, default_sets, default_reps, default_duration_sec, rest_sec, cue, origin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
  `).run(
    data.name,
    data.category || 'strength',
    data.movement || 'other',
    data.equipment || 'none',
    data.level || 'beginner',
    data.isTimeBased ? 1 : 0,
    data.defaultSets ?? 3,
    data.defaultReps ?? 10,
    data.defaultDurationSec ?? 30,
    data.restSec ?? 60,
    data.cue || '',
  );
  return findById(Number(info.lastInsertRowid));
}

module.exports = { list, findById, findByName, create };
