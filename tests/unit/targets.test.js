'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeTargets, bmrMifflin, calorieFloor, bmiSummary } = require('../../server/services/targets');

test('Mifflin-St Jeor 公式（男性）：10*70 + 6.25*175 - 5*30 + 5', () => {
  const bmr = bmrMifflin({ sex: 'male', weightKg: 70, heightCm: 175, age: 30 });
  assert.equal(bmr, 700 + 1093.75 - 150 + 5);
});

test('Mifflin-St Jeor 公式（女性常数 -161，男性 +5，相差 166）', () => {
  const male = bmrMifflin({ sex: 'male', weightKg: 70, heightCm: 175, age: 30 });
  const female = bmrMifflin({ sex: 'female', weightKg: 70, heightCm: 175, age: 30 });
  assert.equal(male - female, 166);
  assert.equal(female, 700 + 1093.75 - 150 - 161);
});

test('减脂目标 = TDEE - 400，并按安全下限兜底', () => {
  const result = computeTargets({
    sex: 'male', age: 30, height_cm: 175, weight_kg: 70, activity_level: 'light', goal: 'fat_loss',
  });
  const expectedTdee = Math.round(bmrMifflin({ sex: 'male', weightKg: 70, heightCm: 175, age: 30 }) * 1.375);
  assert.equal(result.tdee, expectedTdee);
  // 70*1.375*... 目标 = TDEE - 400（高于下限 1500 时）
  const expected = Math.max(Math.round(expectedTdee - 400), calorieFloor('male'));
  assert.equal(result.kcal, expected);
  assert.ok(result.kcal >= calorieFloor('male'));
});

test('极低体重场景也不会低于安全下限', () => {
  const result = computeTargets({
    sex: 'female', age: 60, height_cm: 150, weight_kg: 45, activity_level: 'sedentary', goal: 'fat_loss',
  });
  assert.equal(result.kcal, calorieFloor('female'));
  assert.ok(result.assumptions.some((a) => a.includes('安全下限')));
});

test('宏量分配：蛋白 1.8g/kg（减脂）、脂肪 0.8g/kg、碳水不低于 50 克', () => {
  const result = computeTargets({
    sex: 'male', age: 30, height_cm: 180, weight_kg: 80, activity_level: 'moderate', goal: 'fat_loss',
  });
  assert.equal(result.protein, Math.round(80 * 1.8));
  assert.equal(result.fat, Math.round(80 * 0.8));
  assert.ok(result.carb >= 50);
});

test('缺少身高/体重时不编造数字，返回 insufficient_data', () => {
  const result = computeTargets({ sex: 'male', age: 30, height_cm: null, weight_kg: null, goal: 'fat_loss' });
  assert.equal(result.confidence, 'insufficient_data');
  assert.equal(result.kcal, null);
  assert.ok(result.assumptions[0].includes('缺少'));
});

test('BMI 计算与分类', () => {
  const bmi = bmiSummary(180, 80);
  assert.equal(bmi.bmi, 24.7);
  assert.equal(bmi.category, '超重');
  assert.equal(bmiSummary(null, null), null);
});
