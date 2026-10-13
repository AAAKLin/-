'use strict';

/**
 * 数据库迁移：按顺序执行、事务包裹、版本记录。
 * 每个迁移只向前追加，不修改历史迁移（保持可回滚与可复现）。
 */

const { getDb } = require('./index');
const { logger } = require('../logger');

const migrations = [
  {
    version: 1,
    name: 'init_schema',
    up(db) {
      db.exec(`
        CREATE TABLE profile (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          display_name TEXT,
          sex TEXT NOT NULL DEFAULT 'male',
          age INTEGER,
          height_cm REAL,
          weight_kg REAL,
          activity_level TEXT NOT NULL DEFAULT 'light',
          goal TEXT NOT NULL DEFAULT 'fat_loss',
          experience TEXT NOT NULL DEFAULT 'beginner',
          available_days INTEGER NOT NULL DEFAULT 3,
          session_minutes INTEGER NOT NULL DEFAULT 40,
          equipment TEXT NOT NULL DEFAULT 'none',
          limitations TEXT,
          budget_level TEXT NOT NULL DEFAULT 'low',
          target_kcal REAL,
          target_protein REAL,
          target_fat REAL,
          target_carb REAL,
          target_source TEXT NOT NULL DEFAULT 'auto',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE exercises (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          movement TEXT NOT NULL,
          equipment TEXT NOT NULL DEFAULT 'none',
          level TEXT NOT NULL DEFAULT 'beginner',
          is_time_based INTEGER NOT NULL DEFAULT 0,
          default_sets INTEGER NOT NULL DEFAULT 3,
          default_reps INTEGER NOT NULL DEFAULT 10,
          default_duration_sec INTEGER NOT NULL DEFAULT 0,
          rest_sec INTEGER NOT NULL DEFAULT 60,
          cue TEXT,
          easier_alternative_id INTEGER REFERENCES exercises(id),
          harder_alternative_id INTEGER REFERENCES exercises(id),
          origin TEXT NOT NULL DEFAULT 'seed'
        );

        CREATE TABLE plan_days (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_start TEXT NOT NULL,
          day_index INTEGER NOT NULL,
          title TEXT NOT NULL,
          focus TEXT NOT NULL,
          session_minutes INTEGER NOT NULL DEFAULT 40,
          rest_day INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          UNIQUE (week_start, day_index)
        );

        CREATE TABLE plan_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_day_id INTEGER NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
          exercise_id INTEGER NOT NULL REFERENCES exercises(id),
          sort_order INTEGER NOT NULL DEFAULT 0,
          target_sets INTEGER NOT NULL DEFAULT 3,
          target_reps INTEGER NOT NULL DEFAULT 10,
          target_duration_sec INTEGER NOT NULL DEFAULT 0,
          rest_sec INTEGER NOT NULL DEFAULT 60,
          note TEXT,
          origin TEXT NOT NULL DEFAULT 'auto'
        );

        CREATE TABLE workout_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          plan_day_id INTEGER REFERENCES plan_days(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'completed',
          perceived_difficulty INTEGER,
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (date, plan_day_id)
        );

        CREATE TABLE workout_log_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
          exercise_id INTEGER NOT NULL REFERENCES exercises(id),
          plan_item_id INTEGER REFERENCES plan_items(id) ON DELETE SET NULL,
          done INTEGER NOT NULL DEFAULT 0,
          actual_sets INTEGER,
          actual_reps INTEGER,
          actual_duration_sec INTEGER,
          weight_kg REAL,
          difficulty INTEGER,
          discomfort TEXT,
          note TEXT
        );

        CREATE TABLE foods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL DEFAULT 'other',
          serving_label TEXT NOT NULL DEFAULT '100 克',
          serving_grams REAL NOT NULL DEFAULT 100,
          kcal REAL NOT NULL DEFAULT 0,
          protein REAL NOT NULL DEFAULT 0,
          fat REAL NOT NULL DEFAULT 0,
          carb REAL NOT NULL DEFAULT 0,
          is_estimate INTEGER NOT NULL DEFAULT 0,
          budget_friendly INTEGER NOT NULL DEFAULT 0,
          origin TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE recipes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          servings REAL NOT NULL DEFAULT 1,
          note TEXT,
          origin TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE recipe_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
          food_id INTEGER NOT NULL REFERENCES foods(id),
          grams REAL NOT NULL DEFAULT 100
        );

        CREATE TABLE food_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          meal TEXT NOT NULL DEFAULT 'snack',
          entry_type TEXT NOT NULL DEFAULT 'food',
          ref_id INTEGER,
          label TEXT NOT NULL,
          servings REAL NOT NULL DEFAULT 1,
          grams REAL NOT NULL DEFAULT 0,
          kcal REAL NOT NULL DEFAULT 0,
          protein REAL NOT NULL DEFAULT 0,
          fat REAL NOT NULL DEFAULT 0,
          carb REAL NOT NULL DEFAULT 0,
          is_estimate INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE measurements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL UNIQUE,
          weight_kg REAL,
          waist_cm REAL,
          note TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX idx_plan_items_day ON plan_items(plan_day_id);
        CREATE INDEX idx_workout_items_log ON workout_log_items(workout_log_id);
        CREATE INDEX idx_food_logs_date ON food_logs(date);
        CREATE INDEX idx_workout_logs_date ON workout_logs(date);
        CREATE INDEX idx_measurements_date ON measurements(date);
      `);
    },
  },
];

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function appliedVersions(db) {
  return new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => Number(r.version)));
}

/**
 * 执行所有未应用的迁移。
 * @param {{db?: import('node:sqlite').DatabaseSync}} options
 * @returns {string[]} 本次实际执行的迁移名称
 */
function runMigrations(options = {}) {
  const db = options.db || getDb();
  ensureMigrationTable(db);
  const done = appliedVersions(db);
  const executed = [];

  for (const migration of migrations) {
    if (done.has(migration.version)) continue;
    db.exec('BEGIN');
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      executed.push(migration.name);
      logger.info('迁移已执行', { version: migration.version, name: migration.name });
    } catch (err) {
      db.exec('ROLLBACK');
      logger.error('迁移失败，已回滚', { version: migration.version, name: migration.name, err });
      throw err;
    }
  }

  return executed;
}

module.exports = { runMigrations, migrations };
