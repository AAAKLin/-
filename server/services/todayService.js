'use strict';

/**
 * 今日行动中心聚合：把训练、饮食、体重、建议整合成一次请求可用的数据。
 */

const profileService = require('./profileService');
const planService = require('./planService');
const workoutRepo = require('../repositories/workoutRepo');
const measurementRepo = require('../repositories/measurementRepo');
const dietRepo = require('../repositories/dietRepo');
const planRepo = require('../repositories/planRepo');
const dietService = require('./dietService');
const { buildCoachRecommendations, resumeGuidance } = require('./rules');
const { linearTrend, adherenceStats } = require('./stats');
const { today, addDays, diffDays, startOfWeek } = require('../lib/dates');

function snapshot(dateKey = today()) {
  const { profile, targets, bmi } = profileService.getProfile();
  const { weekStart, day: planDay } = planService.planDayForDate(profile, dateKey);

  const logs = workoutRepo.findByDate(dateKey);
  const log = planDay ? logs.find((l) => l.planDayId === planDay.id) || null : logs[0] || null;

  const diet = dietService.daySummary(dateKey);

  const from = addDays(dateKey, -29);
  const measurements = measurementRepo.list({ from });
  const weightPoints = measurements
    .filter((m) => m.weightKg != null)
    .map((m) => ({ date: m.date, value: Number(m.weightKg), x: diffDays(from, m.date) }));
  const weightTrend = linearTrend(weightPoints);
  const latestMeasurement = measurementRepo.latest();

  // 近 14 天依从情况（仅用于展示趋势，不做奖惩判断）
  const plannedFrom = startOfWeek(addDays(dateKey, -20));
  const plannedDays = planRepo.daysBetween(plannedFrom, dateKey).filter((d) => d.date >= addDays(dateKey, -13));
  const recentLogs = workoutRepo.listBetween(addDays(dateKey, -13), dateKey);
  const adherence = adherenceStats({ plannedDays, logs: recentLogs });

  const lastSessionDate = workoutRepo.lastSessionDate();

  const recommendations = buildCoachRecommendations({
    date: dateKey,
    todayPlan: planDay ? { ...planDay, rest_day: planDay.restDay } : null,
    todayLog: log,
    diet: { comparison: diet.comparison, entryCount: diet.entryCount },
    targets: diet.targets,
    measurements: { weightTrend },
    training: { daysSinceLastSession: lastSessionDate ? diffDays(lastSessionDate, dateKey) : null },
  });

  const missedDays = lastSessionDate ? diffDays(lastSessionDate, dateKey) : null;

  return {
    date: dateKey,
    weekStart,
    profile,
    targets,
    bmi,
    training: {
      planDay,
      log,
      status: log ? log.status : 'not_recorded',
      hasRecord: Boolean(log),
      completedItems: log ? log.items.filter((i) => i.done).length : 0,
      totalItems: planDay ? planDay.items.length : 0,
    },
    diet: {
      date: diet.date,
      totals: diet.totals,
      targets: diet.targets,
      comparison: diet.comparison,
      entryCount: diet.entryCount,
      hasEstimate: diet.hasEstimate,
      byMeal: diet.byMeal,
    },
    body: {
      latest: latestMeasurement,
      weightTrend,
      points: weightPoints.map((p) => ({ date: p.date, value: p.value })),
      daysSinceLastMeasurement: latestMeasurement ? diffDays(latestMeasurement.date, dateKey) : null,
    },
    adherence,
    recommendations,
    resume: resumeGuidance({ missedDays: missedDays || 0 }),
    meta: { generatedAt: new Date().toISOString() },
  };
}

module.exports = { snapshot };
