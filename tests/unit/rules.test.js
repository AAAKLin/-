'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateExerciseProgress, buildCoachRecommendations } = require('../../server/services/rules');

const pushup = {
  id: 1, name: '跪姿俯卧撑', isTimeBased: false, defaultSets: 3, defaultReps: 8,
  defaultDurationSec: 0, easierAlternativeId: 7,
};
const plank = { id: 2, name: '平板支撑', isTimeBased: true, defaultSets: 3, defaultReps: 0, defaultDurationSec: 30 };

function session(overrides = {}) {
  return {
    date: '2026-01-01',
    done: 1,
    difficulty: 3,
    discomfort: null,
    actualSets: 3,
    actualReps: 8,
    actualDurationSec: null,
    ...overrides,
  };
}

test('记录不足 2 次时不给调整建议', () => {
  const result = evaluateExerciseProgress({ exercise: pushup, history: [] });
  assert.equal(result.status, 'insufficient');
  assert.equal(result.suggestion, null);

  const one = evaluateExerciseProgress({ exercise: pushup, history: [session()] });
  assert.equal(one.status, 'insufficient');
});

test('连续两次轻松 → 建议每组加 1 次', () => {
  const history = [session({ date: '2026-01-01', difficulty: 2 }), session({ date: '2026-01-03', difficulty: 2 })];
  const result = evaluateExerciseProgress({ exercise: pushup, history });
  assert.equal(result.status, 'progress');
  assert.equal(result.suggestion.targetReps, 9);
  assert.equal(result.suggestion.targetSets, 3);
});

test('次数达上限且轻松 → 改为增加组数', () => {
  const history = [
    session({ difficulty: 2, actualReps: 15 }),
    session({ difficulty: 1, actualReps: 15 }),
  ];
  const result = evaluateExerciseProgress({ exercise: pushup, history });
  assert.equal(result.status, 'progress');
  assert.equal(result.suggestion.targetSets, 4);
  assert.equal(result.suggestion.targetReps, 15);
});

test('连续两次吃力 → 建议减量（deload）', () => {
  const history = [session({ difficulty: 4 }), session({ difficulty: 5 })];
  const result = evaluateExerciseProgress({ exercise: pushup, history });
  assert.equal(result.status, 'deload');
  assert.equal(result.suggestion.targetSets, 2); // 3 - 1
});

test('记录中提到不适 → 降强度并提示退阶动作', () => {
  const history = [session({ difficulty: 3 }), session({ difficulty: 3, discomfort: '膝盖有点疼' })];
  const result = evaluateExerciseProgress({ exercise: pushup, history });
  assert.equal(result.status, 'regress');
  assert.equal(result.swapToExerciseId, 7);
  assert.ok(result.safetyNote.includes('停止训练'));
});

test('计时动作按 10% 幅度增加时长，并有上限', () => {
  const history = [
    { ...session(), difficulty: 2, actualDurationSec: 30 },
    { ...session(), difficulty: 2, actualDurationSec: 30 },
  ];
  const result = evaluateExerciseProgress({ exercise: plank, history });
  assert.equal(result.suggestion.targetDurationSec, 33);

  const long = [
    { ...session(), difficulty: 2, actualDurationSec: 300 },
    { ...session(), difficulty: 2, actualDurationSec: 300 },
  ];
  assert.equal(evaluateExerciseProgress({ exercise: plank, history: long }).suggestion.targetDurationSec, 300);
});

test('未完成的记录不参与评估', () => {
  const history = [
    { ...session(), done: 0, difficulty: 1 },
    { ...session(), done: 0, difficulty: 1 },
  ];
  assert.equal(evaluateExerciseProgress({ exercise: pushup, history }).status, 'insufficient');
});

test('首页建议：未记录训练时给出中性提示，不判定未完成', () => {
  const recos = buildCoachRecommendations({
    todayPlan: { rest_day: false },
    todayLog: null,
    diet: { comparison: {}, entryCount: 0 },
  });
  const item = recos.find((r) => r.id === 'training_not_recorded');
  assert.ok(item);
  assert.equal(item.tone, 'neutral');
  assert.ok(item.body.includes('未记录'));
});

test('首页建议：蛋白质不足时给出提醒', () => {
  const recos = buildCoachRecommendations({
    todayPlan: { rest_day: false },
    todayLog: { status: 'completed' },
    diet: { comparison: { protein: { target: 120, actual: 50, percent: 42, remaining: 70 } }, entryCount: 3 },
  });
  const item = recos.find((r) => r.id === 'protein_low');
  assert.ok(item);
  assert.ok(item.title.includes('70'));
});

test('首页建议：长时间没训练给"从下一计划日继续"的回归建议', () => {
  const recos = buildCoachRecommendations({
    todayPlan: null,
    training: { daysSinceLastSession: 9 },
  });
  assert.ok(recos.some((r) => r.id === 'resume'));
});
