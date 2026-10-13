'use strict';

/**
 * 进度统计：体重/腰围趋势、训练依从、饮食记录覆盖、每周训练次数。
 * 强调趋势而非单点波动；未记录 ≠ 未完成。
 */

const measurementRepo = require('../repositories/measurementRepo');
const planRepo = require('../repositories/planRepo');
const workoutRepo = require('../repositories/workoutRepo');
const dietRepo = require('../repositories/dietRepo');
const { linearTrend, adherenceStats, dietCoverage } = require('./stats');
const { today, addDays, dateRange, diffDays, startOfWeek } = require('../lib/dates');
const { bmiSummary } = require('./targets');
const profileRepo = require('../repositories/profileRepo');

function toPoints(records, key, from) {
  return records
    .filter((r) => r[key] !== null && r[key] !== undefined)
    .map((r) => ({ date: r.date, value: Number(r[key]), x: diffDays(from, r.date) }))
    .filter((p) => Number.isFinite(p.value));
}

function weeklySessionCounts(logs) {
  const map = new Map();
  for (const log of logs) {
    if (log.status === 'skipped') continue;
    const week = startOfWeek(log.date);
    map.set(week, (map.get(week) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([week, count]) => ({ week, count }));
}

function summary({ days = 30 } = {}) {
  const todayKey = today();
  const from = addDays(todayKey, -(days - 1));
  const profile = profileRepo.get();

  const measurements = measurementRepo.list({ from });
  const weightPoints = toPoints(measurements, 'weightKg', from);
  const waistPoints = toPoints(measurements, 'waistCm', from);

  const plannedFrom = startOfWeek(addDays(from, -7));
  const plannedDays = planRepo.daysBetween(plannedFrom, todayKey).filter((d) => d.date >= from && d.date <= todayKey);
  const logs = workoutRepo.listBetween(from, todayKey);
  const adherence = adherenceStats({ plannedDays, logs });

  const dates = dateRange(from, todayKey);
  const loggedDates = dietRepo.loggedDatesBetween(from, todayKey);
  const diet = dietCoverage({ dates, loggedDates });

  const lastSessionDate = workoutRepo.lastSessionDate();

  return {
    range: { from, to: todayKey, days },
    measurements: measurements.slice().reverse(),
    weight: {
      points: weightPoints.map((p) => ({ date: p.date, value: p.value })),
      trend: linearTrend(weightPoints),
      latest: measurements.filter((m) => m.weightKg != null).slice(-1)[0] || null,
    },
    waist: {
      points: waistPoints.map((p) => ({ date: p.date, value: p.value })),
      trend: linearTrend(waistPoints),
      latest: measurements.filter((m) => m.waistCm != null).slice(-1)[0] || null,
    },
    adherence,
    dietCoverage: diet,
    weeklySessions: weeklySessionCounts(logs),
    lastSessionDate,
    daysSinceLastSession: lastSessionDate ? diffDays(lastSessionDate, todayKey) : null,
    bmi: bmiSummary(profile.height_cm, profile.weight_kg),
  };
}

module.exports = { summary, weeklySessionCounts };
