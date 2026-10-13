'use strict';

const { getDb } = require('../db');
const { toCamel } = require('../lib/rows');
const { diffDays } = require('../lib/dates');

const DAY_COLUMNS = ['id', 'week_start', 'day_index', 'title', 'focus', 'session_minutes', 'rest_day', 'created_at'];
const ITEM_COLUMNS = [
  'plan_items.id', 'plan_items.plan_day_id', 'plan_items.exercise_id', 'plan_items.sort_order',
  'plan_items.target_sets', 'plan_items.target_reps', 'plan_items.target_duration_sec', 'plan_items.rest_sec',
  'plan_items.note', 'plan_items.origin',
];

function itemsForDay(planDayId) {
  const rows = getDb().prepare(`
    SELECT ${ITEM_COLUMNS.join(', ')},
           exercises.id AS ex_id, exercises.name AS ex_name, exercises.category AS ex_category,
           exercises.equipment AS ex_equipment, exercises.is_time_based AS ex_is_time_based,
           exercises.default_sets AS ex_default_sets, exercises.default_reps AS ex_default_reps,
           exercises.default_duration_sec AS ex_default_duration_sec, exercises.rest_sec AS ex_rest_sec,
           exercises.cue AS ex_cue, exercises.easier_alternative_id AS ex_easier_alternative_id,
           exercises.harder_alternative_id AS ex_harder_alternative_id
    FROM plan_items
    JOIN exercises ON exercises.id = plan_items.exercise_id
    WHERE plan_items.plan_day_id = ?
    ORDER BY plan_items.sort_order, plan_items.id
  `).all(planDayId);

  return rows.map((row) => {
    const item = toCamel(row);
    return {
      id: item.id,
      planDayId: item.planDayId,
      exerciseId: item.exerciseId,
      sortOrder: item.sortOrder,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
      targetDurationSec: item.targetDurationSec,
      restSec: item.restSec,
      note: item.note,
      origin: item.origin,
      exercise: {
        id: row.ex_id,
        name: row.ex_name,
        category: row.ex_category,
        equipment: row.ex_equipment,
        isTimeBased: row.ex_is_time_based === 1,
        defaultSets: row.ex_default_sets,
        defaultReps: row.ex_default_reps,
        defaultDurationSec: row.ex_default_duration_sec,
        restSec: row.ex_rest_sec,
        cue: row.ex_cue,
        easierAlternativeId: row.ex_easier_alternative_id,
        harderAlternativeId: row.ex_harder_alternative_id,
      },
    };
  });
}

function getWeek(weekStart) {
  const days = getDb()
    .prepare(`SELECT ${DAY_COLUMNS.join(', ')} FROM plan_days WHERE week_start = ? ORDER BY day_index`)
    .all(weekStart)
    .map(toCamel);
  return days.map((day) => ({ ...day, restDay: day.restDay === 1, items: itemsForDay(day.id) }));
}

function latestWeekStart() {
  const row = getDb().prepare('SELECT week_start FROM plan_days ORDER BY week_start DESC, day_index DESC LIMIT 1').get();
  return row ? row.week_start : null;
}

function listWeeks(limit = 12) {
  const rows = getDb()
    .prepare('SELECT week_start, COUNT(*) AS day_count FROM plan_days GROUP BY week_start ORDER BY week_start DESC LIMIT ?')
    .all(limit);
  return rows.map((r) => ({ weekStart: r.week_start, dayCount: r.day_count }));
}

function getDay(weekStart, dayIndex) {
  const row = getDb()
    .prepare(`SELECT ${DAY_COLUMNS.join(', ')} FROM plan_days WHERE week_start = ? AND day_index = ?`)
    .get(weekStart, dayIndex);
  if (!row) return null;
  const day = toCamel(row);
  return { ...day, restDay: day.restDay === 1, items: itemsForDay(day.id) };
}

function getDayById(id) {
  const row = getDb().prepare(`SELECT ${DAY_COLUMNS.join(', ')} FROM plan_days WHERE id = ?`).get(id);
  if (!row) return null;
  const day = toCamel(row);
  return { ...day, restDay: day.restDay === 1, items: itemsForDay(day.id) };
}

/** 覆盖式写入一周计划（同一周重复生成会替换，避免堆积重复数据） */
function replaceWeek(weekStart, days) {
  const db = getDb();
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const existing = db.prepare('SELECT id FROM plan_days WHERE week_start = ?').all(weekStart).map((r) => r.id);
    for (const id of existing) {
      db.prepare('DELETE FROM plan_items WHERE plan_day_id = ?').run(id);
    }
    db.prepare('DELETE FROM plan_days WHERE week_start = ?').run(weekStart);

    const insertDay = db.prepare(`
      INSERT INTO plan_days (week_start, day_index, title, focus, session_minutes, rest_day, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO plan_items (plan_day_id, exercise_id, sort_order, target_sets, target_reps, target_duration_sec, rest_sec, note, origin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const day of days) {
      const info = insertDay.run(
        weekStart,
        day.dayIndex,
        day.title,
        day.focus,
        day.sessionMinutes ?? 40,
        day.restDay ? 1 : 0,
        now,
      );
      const dayId = Number(info.lastInsertRowid);
      (day.items || []).forEach((item, index) => {
        insertItem.run(
          dayId,
          item.exerciseId,
          index,
          item.targetSets ?? 3,
          item.targetReps ?? 10,
          item.targetDurationSec ?? 0,
          item.restSec ?? 60,
          item.note || null,
          item.origin || 'auto',
        );
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return getWeek(weekStart);
}

function updateItem(itemId, patch) {
  const fields = [];
  const values = [];
  const map = {
    targetSets: 'target_sets',
    targetReps: 'target_reps',
    targetDurationSec: 'target_duration_sec',
    restSec: 'rest_sec',
    sortOrder: 'sort_order',
    note: 'note',
    exerciseId: 'exercise_id',
  };
  for (const [key, column] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(patch[key]);
    }
  }
  if (fields.length === 0) return null;
  values.push(itemId);
  getDb().prepare(`UPDATE plan_items SET ${fields.join(', ')}, origin = 'manual' WHERE id = ?`).run(...values);
  const row = getDb().prepare('SELECT * FROM plan_items WHERE id = ?').get(itemId);
  return toCamel(row);
}

function deleteItem(itemId) {
  getDb().prepare('DELETE FROM plan_items WHERE id = ?').run(itemId);
}

/** 区间内的计划日（用于依从统计） */
function daysBetween(from, to) {
  const rows = getDb()
    .prepare(`SELECT ${DAY_COLUMNS.join(', ')} FROM plan_days WHERE week_start >= ? AND week_start <= ? ORDER BY week_start, day_index`)
    .all(from, to);
  return rows.map((row) => {
    const day = toCamel(row);
    const offset = day.dayIndex;
    const date = new Date(`${day.weekStart}T00:00:00`);
    date.setDate(date.getDate() + offset);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { ...day, restDay: day.restDay === 1, date: iso };
  });
}

module.exports = { getWeek, latestWeekStart, listWeeks, getDay, getDayById, replaceWeek, updateItem, deleteItem, daysBetween, diffDays };
