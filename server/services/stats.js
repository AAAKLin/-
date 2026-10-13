'use strict';

/**
 * 统计与趋势：纯函数，输入数组输出结果，便于单元测试。
 * 强调"看趋势"，并且严格区分"未记录"与"未完成"。
 */

const { diffDays } = require('../lib/dates');

/** 简单线性回归：返回每天/每周变化斜率 */
function linearTrend(points = []) {
  const valid = points
    .filter((p) => p && Number.isFinite(Number(p.value)))
    .map((p) => ({ x: Number(p.x), value: Number(p.value) }))
    .sort((a, b) => a.x - b.x);

  if (valid.length === 0) {
    return { count: 0, slopePerDay: null, slopePerWeek: null, first: null, last: null, change: null, percentChange: null };
  }
  if (valid.length === 1) {
    return { count: 1, slopePerDay: 0, slopePerWeek: 0, first: valid[0].value, last: valid[0].value, change: 0, percentChange: 0 };
  }

  const n = valid.length;
  const sumX = valid.reduce((a, p) => a + p.x, 0);
  const sumY = valid.reduce((a, p) => a + p.value, 0);
  const sumXY = valid.reduce((a, p) => a + p.x * p.value, 0);
  const sumXX = valid.reduce((a, p) => a + p.x * p.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;

  const first = valid[0].value;
  const last = valid[n - 1].value;
  const change = last - first;
  const percentChange = first === 0 ? null : (change / first) * 100;

  return {
    count: n,
    slopePerDay: Math.round(slope * 1000) / 1000,
    slopePerWeek: Math.round(slope * 7 * 100) / 100,
    first,
    last,
    change: Math.round(change * 100) / 100,
    percentChange: percentChange === null ? null : Math.round(percentChange * 100) / 100,
  };
}

/**
 * 训练依从统计：
 * plannedDays: [{date, rest_day}]，logs: [{date, status}]
 * status: completed / partial / skipped；没有记录 = not_recorded（不等于没完成）
 */
function adherenceStats({ plannedDays = [], logs = [] }) {
  const logByDate = new Map(logs.map((l) => [l.date, l]));
  let planned = 0;
  let completed = 0;
  let partial = 0;
  let skipped = 0;
  let notRecorded = 0;

  for (const day of plannedDays) {
    if (day.rest_day || day.restDay) continue;
    planned += 1;
    const log = logByDate.get(day.date);
    if (!log) {
      notRecorded += 1;
      continue;
    }
    if (log.status === 'completed') completed += 1;
    else if (log.status === 'partial') partial += 1;
    else if (log.status === 'skipped') skipped += 1;
    else notRecorded += 1;
  }

  const logged = completed + partial + skipped;
  return {
    planned,
    completed,
    partial,
    skipped,
    notRecorded,
    logged,
    completionRate: planned === 0 ? null : Math.round(((completed + partial * 0.5) / planned) * 100),
    coverageRate: planned === 0 ? null : Math.round((logged / planned) * 100),
  };
}

/** 饮食记录覆盖率：某区间内有饮食记录的日期比例 */
function dietCoverage({ dates = [], loggedDates = [] }) {
  const set = new Set(loggedDates);
  const total = dates.length;
  const covered = dates.filter((d) => set.has(d)).length;
  return { total, covered, coverageRate: total === 0 ? null : Math.round((covered / total) * 100) };
}

/** 序列采样：按日期补点，便于画折线图 */
function buildSeries(records = [], { key = 'weight_kg', from, to } = {}) {
  return records
    .map((r) => ({ date: r.date, value: Number(r[key]) }))
    .filter((p) => Number.isFinite(p.value))
    .filter((p) => (!from || p.date >= from) && (!to || p.date <= to))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** 相对最近一次记录的间隔天数（用于"多久没记录"提醒） */
function daysSince(dateKey, todayKey) {
  if (!dateKey) return null;
  return diffDays(dateKey, todayKey);
}

module.exports = { linearTrend, adherenceStats, dietCoverage, buildSeries, daysSince };
