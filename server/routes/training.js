'use strict';

const express = require('express');
const planService = require('../services/planService');
const workoutService = require('../services/workoutService');
const planRepo = require('../repositories/planRepo');
const workoutRepo = require('../repositories/workoutRepo');
const exerciseRepo = require('../repositories/exerciseRepo');
const profileRepo = require('../repositories/profileRepo');
const { Validator } = require('../lib/validate');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError } = require('../errors');
const { today, startOfWeek, addDays } = require('../lib/dates');

const router = express.Router();

/** 动作库（含用户自定义动作） */
router.get('/api/training/exercises', asyncHandler((req, res) => {
  const { category, equipment, level } = new Validator(req.query)
    .string('category', { max: 40 })
    .string('equipment', { max: 40 })
    .string('level', { max: 40 })
    .done();
  res.json({ items: exerciseRepo.list({ category, equipment, level }) });
}));

router.post('/api/training/exercises', asyncHandler((req, res) => {
  const data = new Validator(req.body)
    .string('name', { required: true, min: 1, max: 60 })
    .string('category', { allowed: ['strength', 'core', 'cardio', 'mobility'], default: 'strength' })
    .string('movement', { max: 40, default: 'other' })
    .string('equipment', { allowed: ['none', 'band', 'dumbbell', 'chair'], default: 'none' })
    .string('level', { allowed: ['beginner', 'intermediate'], default: 'beginner' })
    .boolean('isTimeBased', { default: false })
    .number('defaultSets', { min: 1, max: 10, integer: true, default: 3 })
    .number('defaultReps', { min: 1, max: 100, integer: true, default: 10 })
    .number('defaultDurationSec', { min: 5, max: 3600, integer: true, default: 30 })
    .number('restSec', { min: 0, max: 600, integer: true, default: 60 })
    .string('cue', { max: 300 })
    .done();
  res.status(201).json(exerciseRepo.create(data));
}));

/** 当前周计划（不存在则自动生成） */
router.get('/api/training/plan', asyncHandler((req, res) => {
  const { date, weekStart } = new Validator(req.query).date('date').date('weekStart').done();
  const profile = profileRepo.get();
  const target = weekStart || startOfWeek(date || today());
  const days = planRepo.getWeek(target);
  if (days.length === 0) {
    const generated = planService.generateWeek(profile, target);
    return res.json({ weekStart: target, days: generated, generated: true });
  }
  res.json({ weekStart: target, days, generated: false });
}));

/** 重新生成计划（会替换该周现有计划） */
router.post('/api/training/plan/generate', asyncHandler((req, res) => {
  const { date, weekStart } = new Validator(req.body).date('date').date('weekStart').done();
  const profile = profileRepo.get();
  const target = weekStart || startOfWeek(date || today());
  const days = planService.generateWeek(profile, target);
  res.json({ weekStart: target, days, generated: true });
}));

router.patch('/api/training/plan/items/:id', asyncHandler((req, res) => {
  const id = Number(req.params.id);
  const data = new Validator(req.body)
    .number('targetSets', { min: 1, max: 10, integer: true })
    .number('targetReps', { min: 0, max: 100, integer: true })
    .number('targetDurationSec', { min: 0, max: 3600, integer: true })
    .number('restSec', { min: 0, max: 600, integer: true })
    .string('note', { max: 300 })
    .done();
  const updated = planRepo.updateItem(id, data);
  if (!updated) throw new NotFoundError('计划项不存在');
  res.json(updated);
}));

/** 规则化调整建议 */
router.get('/api/training/suggestions', asyncHandler((req, res) => {
  const { date } = new Validator(req.query).date('date').done();
  const profile = profileRepo.get();
  const weekStart = startOfWeek(date || today());
  if (planRepo.getWeek(weekStart).length === 0) planService.generateWeek(profile, weekStart);
  res.json({ weekStart, items: planService.suggestionsForWeek(weekStart) });
}));

router.post('/api/training/suggestions/:planItemId/apply', asyncHandler((req, res) => {
  const result = planService.applySuggestion(Number(req.params.planItemId));
  if (!result) throw new NotFoundError('计划项不存在');
  res.json(result);
}));

/** 某天的训练上下文：计划 + 记录状态 */
router.get('/api/training/day', asyncHandler((req, res) => {
  const { date } = new Validator(req.query).date('date').done();
  const profile = profileRepo.get();
  const { weekStart, day } = planService.planDayForDate(profile, date || today());
  const context = workoutService.dayContext(date || today(), day ? day.id : null);
  res.json({ date: date || today(), weekStart, planDay: day, ...context });
}));

/** 写入训练记录（快速记录或详细记录） */
router.post('/api/training/logs', asyncHandler((req, res) => {
  const data = new Validator(req.body)
    .date('date', { required: true })
    .number('planDayId', { integer: true, min: 1 })
    .string('status', { required: true, allowed: workoutService.STATUSES })
    .number('perceivedDifficulty', { min: 1, max: 5, integer: true })
    .string('note', { max: 500 })
    .done();
  const log = workoutService.logWorkout({
    date: data.date,
    planDayId: data.planDayId ?? null,
    status: data.status,
    perceivedDifficulty: data.perceivedDifficulty ?? null,
    note: data.note ?? null,
    items: req.body.items,
  });
  res.status(201).json(log);
}));

router.get('/api/training/logs', asyncHandler((req, res) => {
  const { from, to } = new Validator(req.query).date('from').date('to').done();
  const toDate = to || today();
  const fromDate = from || addDays(toDate, -59);
  res.json({ from: fromDate, to: toDate, items: workoutService.history({ from: fromDate, to: toDate }) });
}));

router.delete('/api/training/logs/:id', asyncHandler((req, res) => {
  const removed = workoutRepo.remove(Number(req.params.id));
  if (!removed) throw new NotFoundError('训练记录不存在');
  res.json({ deleted: true, id: Number(req.params.id) });
}));

module.exports = router;
