'use strict';

/**
 * 训练计划生成与调整：完全确定性的模板逻辑（无 AI 依赖）。
 * 依据档案中的可用天数、单次时长、器械、经验与限制生成一周计划。
 */

const exerciseRepo = require('../repositories/exerciseRepo');
const planRepo = require('../repositories/planRepo');
const workoutRepo = require('../repositories/workoutRepo');
const { startOfWeek, dayIndex } = require('../lib/dates');
const { evaluateExerciseProgress } = require('./rules');

/** 不同可用天数下的训练日分布（0=周一 ... 6=周日） */
const DAY_PATTERNS = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 3, 4, 6],
};

/** 每次训练的模板：按顺序给出动作名与类型 */
const SESSION_TEMPLATES = {
  full_body_a: {
    title: '全身力量 A',
    focus: '下肢 + 推 + 核心',
    exercises: ['靠墙静蹲', '上斜俯卧撑（撑桌/台阶）', '毛巾划船（门把固定）', '臀桥', '平板支撑'],
  },
  full_body_b: {
    title: '全身力量 B',
    focus: '下肢 + 拉 + 核心',
    exercises: ['徒手深蹲', '跪姿俯卧撑', '俯卧 Y 字抬臂', '提踵', '死虫式'],
  },
  cardio_core: {
    title: '有氧 + 核心',
    focus: '心肺 + 核心稳定',
    exercises: ['快走 / 慢跑', '开合跳', '卷腹', '鸟狗式', '髋屈肌拉伸'],
  },
  full_body_c: {
    title: '全身力量 C',
    focus: '下肢 + 全身 + 平衡',
    exercises: ['臀桥', '上斜俯卧撑（撑桌/台阶）', '毛巾划船（门把固定）', '台阶上下', '平板支撑'],
  },
};

const SESSION_ORDER = ['full_body_a', 'full_body_b', 'cardio_core', 'full_body_c'];

const COOLDOWN = ['胸大肌静态拉伸', '髋屈肌拉伸', '腘绳肌拉伸'];

/** 根据限制关键词排除部分动作（启发式规则，可在 UI 中手动调整） */
const LIMITATION_EXCLUSIONS = [
  { keywords: ['膝', 'knee'], names: ['箭步蹲', '开合跳', '原地高抬腿', '台阶上下'] },
  { keywords: ['腰', 'back', '腰背'], names: ['卷腹', '俯卧 Y 字抬臂'] },
  { keywords: ['肩', 'shoulder'], names: ['标准俯卧撑', '跪姿俯卧撑', '上斜俯卧撑（撑桌/台阶）', '俯卧 Y 字抬臂'] },
  { keywords: ['踝', '脚踝', 'ankle'], names: ['开合跳', '原地高抬腿', '提踵'] },
  { keywords: ['腕', '手腕', 'wrist'], names: ['标准俯卧撑', '跪姿俯卧撑', '上斜俯卧撑（撑桌/台阶）'] },
];

function excludedNames(limitations) {
  const text = String(limitations || '').toLowerCase();
  if (!text.trim()) return new Set();
  const excluded = new Set();
  for (const rule of LIMITATION_EXCLUSIONS) {
    if (rule.keywords.some((k) => text.includes(k.toLowerCase()))) {
      rule.names.forEach((n) => excluded.add(n));
    }
  }
  return excluded;
}

function pickExercises(profile) {
  const equipment = profile.equipment || 'none';
  const allowedEquipment = new Set(['none', 'chair', equipment]);
  const level = profile.experience === 'intermediate' ? ['beginner', 'intermediate'] : ['beginner'];
  const excluded = excludedNames(profile.limitations);

  const pool = exerciseRepo.list({ equipment }).filter(
    (ex) => allowedEquipment.has(ex.equipment) && level.includes(ex.level) && !excluded.has(ex.name),
  );
  return pool;
}

function volumeFor(profile) {
  const minutes = Math.min(Math.max(Number(profile.session_minutes) || 40, 15), 120);
  const maxItems = Math.min(Math.max(Math.round(minutes / 8), 4), 8);
  const sets = profile.experience === 'intermediate' ? 3 : 3;
  return { minutes, maxItems, sets };
}

function buildSession(templateKey, pool, profile) {
  const template = SESSION_TEMPLATES[templateKey];
  const { maxItems, sets } = volumeFor(profile);
  const byName = new Map(pool.map((ex) => [ex.name, ex]));

  const items = [];
  for (const name of template.exercises) {
    const ex = byName.get(name);
    if (!ex) continue;
    items.push({
      exerciseId: ex.id,
      targetSets: ex.isTimeBased ? 1 : sets,
      targetReps: ex.isTimeBased ? 0 : ex.defaultReps,
      targetDurationSec: ex.isTimeBased ? (ex.defaultDurationSec || 30) : 0,
      restSec: ex.restSec,
      note: ex.cue || null,
    });
    if (items.length >= maxItems) break;
  }

  // 收尾拉伸（不计入主项数量）
  for (const name of COOLDOWN) {
    const ex = byName.get(name);
    if (!ex) continue;
    items.push({
      exerciseId: ex.id,
      targetSets: 1,
      targetReps: 0,
      targetDurationSec: 30,
      restSec: 20,
      note: '放松环节，动作缓慢、不憋气',
    });
    break;
  }

  return { title: template.title, focus: template.focus, items };
}

/**
 * 生成一周计划（覆盖写入）。
 * @param {object} profile 档案
 * @param {string} weekStart 周一日期 YYYY-MM-DD
 */
function generateWeek(profile, weekStart) {
  const daysCount = Math.min(Math.max(Number(profile.available_days) || 3, 1), 6);
  const pattern = DAY_PATTERNS[daysCount] || DAY_PATTERNS[3];
  const pool = pickExercises(profile);
  const { minutes } = volumeFor(profile);

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    if (!pattern.includes(i)) {
      days.push({
        dayIndex: i,
        title: '休息 / 轻度活动',
        focus: '恢复',
        sessionMinutes: 0,
        restDay: true,
        items: [],
      });
      continue;
    }
    const slot = pattern.indexOf(i);
    const templateKey = SESSION_ORDER[slot % SESSION_ORDER.length];
    const session = buildSession(templateKey, pool, profile);
    days.push({
      dayIndex: i,
      title: session.title,
      focus: session.focus,
      sessionMinutes: minutes,
      restDay: false,
      items: session.items,
    });
  }

  return planRepo.replaceWeek(weekStart, days);
}

/** 取当前周计划；不存在则按档案自动生成 */
function getOrCreateWeek(profile, date) {
  const weekStart = startOfWeek(date);
  const existing = planRepo.getWeek(weekStart);
  if (existing && existing.length > 0) return { weekStart, days: existing, generated: false };
  const days = generateWeek(profile, weekStart);
  return { weekStart, days, generated: true };
}

/** 某日期对应的计划日（含所属周） */
function planDayForDate(profile, date) {
  const { weekStart, days, generated } = getOrCreateWeek(profile, date);
  const idx = dayIndex(date);
  const day = days.find((d) => d.dayIndex === idx) || null;
  return { weekStart, day, generated };
}

/**
 * 基于历史记录给出该周每个动作的调整建议（规则化、可解释）。
 */
function suggestionsForWeek(weekStart) {
  const days = planRepo.getWeek(weekStart);
  const suggestions = [];
  const seen = new Set();
  for (const day of days) {
    for (const item of day.items) {
      if (seen.has(item.exerciseId)) continue;
      seen.add(item.exerciseId);
      const history = workoutRepo.historyForExercise(item.exerciseId, 10);
      const result = evaluateExerciseProgress({ exercise: item.exercise, history });
      suggestions.push({ ...result, planItemId: item.id });
    }
  }
  return suggestions;
}

/** 把建议应用到计划项（用户确认后调用） */
function applySuggestion(planItemId) {
  const db = require('../db').getDb();
  const row = db.prepare('SELECT * FROM plan_items WHERE id = ?').get(planItemId);
  if (!row) return null;
  const exercise = exerciseRepo.findById(row.exercise_id);
  const history = workoutRepo.historyForExercise(row.exercise_id, 10);
  const suggestion = evaluateExerciseProgress({ exercise, history });
  if (!suggestion.suggestion) return { applied: false, suggestion };

  const updated = planRepo.updateItem(planItemId, {
    targetSets: suggestion.suggestion.targetSets,
    targetReps: suggestion.suggestion.targetReps,
    targetDurationSec: suggestion.suggestion.targetDurationSec,
  });
  return { applied: true, suggestion, item: updated };
}

module.exports = {
  generateWeek,
  getOrCreateWeek,
  planDayForDate,
  suggestionsForWeek,
  applySuggestion,
  DAY_PATTERNS,
  SESSION_TEMPLATES,
  excludedNames,
};
