'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { linearTrend, adherenceStats, dietCoverage } = require('../../server/services/stats');

test('线性回归：稳定下降序列的周斜率约为 -0.7', () => {
  const points = [
    { x: 0, value: 86 }, { x: 7, value: 85.3 }, { x: 14, value: 84.6 }, { x: 21, value: 83.9 },
  ];
  const trend = linearTrend(points);
  assert.equal(trend.count, 4);
  assert.ok(Math.abs(trend.slopePerWeek - (-0.7)) < 0.01);
  assert.ok(Math.abs(trend.change - (-2.1)) < 0.01);
});

test('单点数据不报趋势，也不报错', () => {
  const trend = linearTrend([{ x: 0, value: 80 }]);
  assert.equal(trend.count, 1);
  assert.equal(trend.slopePerWeek, 0);
  assert.equal(trend.change, 0);
});

test('空数据返回 null 斜率而不是 0', () => {
  const trend = linearTrend([]);
  assert.equal(trend.count, 0);
  assert.equal(trend.slopePerDay, null);
});

test('依从统计：严格区分"未记录"与"没完成"', () => {
  const plannedDays = [
    { date: '2026-01-01', rest_day: false },
    { date: '2026-01-02', rest_day: true },
    { date: '2026-01-03', rest_day: false },
    { date: '2026-01-04', rest_day: false },
  ];
  const logs = [
    { date: '2026-01-01', status: 'completed' },
    { date: '2026-01-03', status: 'skipped' },
  ];
  const stats = adherenceStats({ plannedDays, logs });
  assert.equal(stats.planned, 3); // 休息日不计入
  assert.equal(stats.completed, 1);
  assert.equal(stats.skipped, 1);
  assert.equal(stats.notRecorded, 1); // 2026-01-04 没有任何记录
  assert.equal(stats.coverageRate, 67);
});

test('依从统计：没有计划时不产生除零错误', () => {
  const stats = adherenceStats({ plannedDays: [], logs: [] });
  assert.equal(stats.planned, 0);
  assert.equal(stats.completionRate, null);
});

test('饮食覆盖率按天统计', () => {
  const coverage = dietCoverage({ dates: ['2026-01-01', '2026-01-02', '2026-01-03'], loggedDates: ['2026-01-01', '2026-01-03'] });
  assert.equal(coverage.covered, 2);
  assert.equal(coverage.total, 3);
  assert.equal(coverage.coverageRate, 67);
});
