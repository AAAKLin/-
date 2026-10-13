'use strict';

/**
 * 训练记录业务：快速记录、详细记录、与计划的对照。
 * 计划值会自动预填，只有实际表现不同时才需要编辑。
 */

const workoutRepo = require('../repositories/workoutRepo');
const planRepo = require('../repositories/planRepo');
const exerciseRepo = require('../repositories/exerciseRepo');
const { NotFoundError, ValidationError } = require('../errors');

const STATUSES = ['completed', 'partial', 'skipped'];

function prefillItems(planDay, status) {
  const items = (planDay?.items || []).map((item) => ({
    exerciseId: item.exerciseId,
    planItemId: item.id,
    done: 0,
    actualSets: item.targetSets,
    actualReps: item.targetReps,
    actualDurationSec: item.targetDurationSec,
  }));
  if (status === 'completed') {
    items.forEach((i) => { i.done = 1; });
  } else if (status === 'partial') {
    const count = Math.max(1, Math.ceil(items.length / 2));
    items.slice(0, count).forEach((i) => { i.done = 1; });
  }
  return items;
}

function validateItems(items) {
  if (!Array.isArray(items)) throw new ValidationError('训练项目必须是数组');
  return items.map((item) => {
    if (!Number.isFinite(Number(item.exerciseId))) {
      throw new ValidationError('每个训练项目都要有 exerciseId');
    }
    const exercise = exerciseRepo.findById(Number(item.exerciseId));
    if (!exercise) throw new NotFoundError(`动作不存在：${item.exerciseId}`);
    return {
      exerciseId: Number(item.exerciseId),
      planItemId: item.planItemId ? Number(item.planItemId) : null,
      done: item.done === undefined ? true : Boolean(item.done),
      actualSets: item.actualSets === undefined || item.actualSets === null ? null : Number(item.actualSets),
      actualReps: item.actualReps === undefined || item.actualReps === null ? null : Number(item.actualReps),
      actualDurationSec: item.actualDurationSec === undefined || item.actualDurationSec === null ? null : Number(item.actualDurationSec),
      weightKg: item.weightKg === undefined || item.weightKg === null ? null : Number(item.weightKg),
      difficulty: item.difficulty === undefined || item.difficulty === null ? null : Number(item.difficulty),
      discomfort: item.discomfort ? String(item.discomfort) : null,
      note: item.note ? String(item.note) : null,
    };
  });
}

/** 写入训练记录：未提供明细时按计划预填，保证"快速记录"只需一次点击 */
function logWorkout({ date, planDayId, status, perceivedDifficulty, note, items }) {
  if (!STATUSES.includes(status)) throw new ValidationError(`status 只能是：${STATUSES.join(' / ')}`);

  let finalItems = items;
  if (!finalItems || finalItems.length === 0) {
    const planDay = planDayId ? planRepo.getDayById(planDayId) : null;
    finalItems = prefillItems(planDay, status);
  }
  const cleanItems = validateItems(finalItems);

  return workoutRepo.upsert({
    date,
    planDayId: planDayId ?? null,
    status,
    perceivedDifficulty: perceivedDifficulty ?? null,
    note: note ?? null,
    items: cleanItems,
  });
}

/** 某天的训练上下文：计划 + 记录（缺记录时明确标记为 not_recorded） */
function dayContext(date, planDayId) {
  const logs = workoutRepo.findByDate(date);
  const log = planDayId ? logs.find((l) => l.planDayId === planDayId) || null : logs[0] || null;
  return {
    date,
    log,
    status: log ? log.status : 'not_recorded',
    hasRecord: Boolean(log),
  };
}

/** 训练历史（带计划标题） */
function history({ from, to }) {
  const logs = workoutRepo.listBetween(from, to);
  const dayTitleById = new Map();
  for (const log of logs) {
    if (log.planDayId && !dayTitleById.has(log.planDayId)) {
      const day = planRepo.getDayById(log.planDayId);
      dayTitleById.set(log.planDayId, day ? day.title : null);
    }
  }
  return logs.map((log) => ({ ...log, planTitle: log.planDayId ? dayTitleById.get(log.planDayId) || null : '自由训练' }));
}

module.exports = { logWorkout, dayContext, history, prefillItems, STATUSES };
