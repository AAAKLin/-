'use strict';

const { getDb } = require('../db');
const { toCamel } = require('../lib/rows');

const LOG_COLUMNS = ['id', 'date', 'plan_day_id', 'status', 'perceived_difficulty', 'note', 'created_at', 'updated_at'];

function itemsForLog(logId) {
  return getDb()
    .prepare(`
      SELECT workout_log_items.*, exercises.name AS exercise_name, exercises.is_time_based AS exercise_is_time_based,
             exercises.cue AS exercise_cue
      FROM workout_log_items
      JOIN exercises ON exercises.id = workout_log_items.exercise_id
      WHERE workout_log_items.workout_log_id = ?
      ORDER BY workout_log_items.id
    `)
    .all(logId)
    .map((row) => ({
      id: row.id,
      workoutLogId: row.workout_log_id,
      exerciseId: row.exercise_id,
      planItemId: row.plan_item_id,
      done: row.done === 1,
      actualSets: row.actual_sets,
      actualReps: row.actual_reps,
      actualDurationSec: row.actual_duration_sec,
      weightKg: row.weight_kg,
      difficulty: row.difficulty,
      discomfort: row.discomfort,
      note: row.note,
      exerciseName: row.exercise_name,
      exerciseIsTimeBased: row.exercise_is_time_based === 1,
      exerciseCue: row.exercise_cue,
    }));
}

function hydrate(row) {
  if (!row) return null;
  const log = toCamel(row);
  return { ...log, items: itemsForLog(log.id) };
}

function listBetween(from, to) {
  const rows = getDb()
    .prepare(`SELECT ${LOG_COLUMNS.join(', ')} FROM workout_logs WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC`)
    .all(from, to)
    .map(toCamel);
  return rows.map((row) => ({ ...row, items: itemsForLog(row.id) }));
}

function listByPlanDay(planDayId) {
  const rows = getDb()
    .prepare(`SELECT ${LOG_COLUMNS.join(', ')} FROM workout_logs WHERE plan_day_id = ? ORDER BY date DESC`)
    .all(planDayId)
    .map(toCamel);
  return rows.map((row) => ({ ...row, items: itemsForLog(row.id) }));
}

function findByDate(date) {
  const rows = getDb().prepare(`SELECT ${LOG_COLUMNS.join(', ')} FROM workout_logs WHERE date = ? ORDER BY id DESC`).all(date);
  return rows.map((row) => ({ ...toCamel(row), items: itemsForLog(row.id) }));
}

function findById(id) {
  const row = getDb().prepare(`SELECT ${LOG_COLUMNS.join(', ')} FROM workout_logs WHERE id = ?`).get(id);
  return hydrate(row);
}

function findByDateAndPlanDay(date, planDayId) {
  const row = getDb()
    .prepare(`SELECT ${LOG_COLUMNS.join(', ')} FROM workout_logs WHERE date = ? AND plan_day_id IS ?`)
    .get(date, planDayId ?? null);
  return hydrate(row);
}

/**
 * 写入（或覆盖）一条训练记录。
 * 同一天 + 同一计划日只保留一条，重复提交视为更新，避免产生重复记录。
 */
function upsert({ date, planDayId, status, perceivedDifficulty, note, items }) {
  const db = getDb();
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const existing = planDayId
      ? db.prepare('SELECT id FROM workout_logs WHERE date = ? AND plan_day_id = ?').get(date, planDayId)
      : db.prepare('SELECT id FROM workout_logs WHERE date = ? AND plan_day_id IS NULL').get(date);

    let logId;
    if (existing) {
      logId = existing.id;
      db.prepare('UPDATE workout_logs SET status = ?, perceived_difficulty = ?, note = ?, updated_at = ? WHERE id = ?')
        .run(status, perceivedDifficulty ?? null, note ?? null, now, logId);
      db.prepare('DELETE FROM workout_log_items WHERE workout_log_id = ?').run(logId);
    } else {
      const info = db.prepare(`
        INSERT INTO workout_logs (date, plan_day_id, status, perceived_difficulty, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(date, planDayId ?? null, status, perceivedDifficulty ?? null, note ?? null, now, now);
      logId = Number(info.lastInsertRowid);
    }

    const insertItem = db.prepare(`
      INSERT INTO workout_log_items (workout_log_id, exercise_id, plan_item_id, done, actual_sets, actual_reps,
        actual_duration_sec, weight_kg, difficulty, discomfort, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items || []) {
      insertItem.run(
        logId,
        item.exerciseId,
        item.planItemId ?? null,
        item.done ? 1 : 0,
        item.actualSets ?? null,
        item.actualReps ?? null,
        item.actualDurationSec ?? null,
        item.weightKg ?? null,
        item.difficulty ?? null,
        item.discomfort ?? null,
        item.note ?? null,
      );
    }
    db.exec('COMMIT');
    return findById(logId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function remove(id) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM workout_log_items WHERE workout_log_id = ?').run(id);
    const info = db.prepare('DELETE FROM workout_logs WHERE id = ?').run(id);
    db.exec('COMMIT');
    return info.changes > 0;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** 某动作的历史表现（用于规则化调整建议） */
function historyForExercise(exerciseId, limit = 10) {
  return getDb()
    .prepare(`
      SELECT workout_logs.date AS date, workout_log_items.*
      FROM workout_log_items
      JOIN workout_logs ON workout_logs.id = workout_log_items.workout_log_id
      WHERE workout_log_items.exercise_id = ?
      ORDER BY workout_logs.date ASC, workout_log_items.id ASC
      LIMIT ?
    `)
    .all(exerciseId, limit)
    .map((row) => ({
      date: row.date,
      done: row.done === 1,
      difficulty: row.difficulty,
      discomfort: row.discomfort,
      actualSets: row.actual_sets,
      actualReps: row.actual_reps,
      actualDurationSec: row.actual_duration_sec,
      targetSets: null,
      targetReps: null,
    }));
}

function lastSessionDate() {
  const row = getDb().prepare('SELECT date FROM workout_logs ORDER BY date DESC, id DESC LIMIT 1').get();
  return row ? row.date : null;
}

module.exports = { listBetween, listByPlanDay, findByDate, findById, findByDateAndPlanDay, upsert, remove, historyForExercise, lastSessionDate };
