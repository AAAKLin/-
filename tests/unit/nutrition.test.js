'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  macrosForGrams, sumMacros, computeRecipeNutrition, computeEntryNutrition, compareWithTargets,
} = require('../../server/services/nutrition');

const chicken = { id: 1, name: '鸡胸肉（水煮）', kcal: 165, protein: 31, fat: 3.6, carb: 0, is_estimate: 0, serving_grams: 120 };

test('按克数换算：200 克应为每 100 克值的两倍', () => {
  const macros = macrosForGrams(chicken, 200);
  assert.equal(macros.kcal, 330);
  assert.equal(macros.protein, 62);
  assert.equal(macros.fat, 7.2);
  assert.equal(macros.carb, 0);
});

test('多条目求和', () => {
  const totals = sumMacros([
    { kcal: 100, protein: 10, fat: 1, carb: 12 },
    { kcal: 50.4, protein: 5.2, fat: 0.4, carb: 6.1 },
  ]);
  assert.equal(totals.kcal, 150);
  assert.equal(totals.protein, 15.2);
  assert.equal(totals.fat, 1.4);
  assert.equal(totals.carb, 18.1);
});

test('食谱：合计与每份营养一致，份数变化时每份不变', () => {
  const rice = { id: 2, name: '米饭（熟）', kcal: 116, protein: 2.6, fat: 0.3, carb: 25.9, is_estimate: 0 };
  const recipe = {
    servings: 2,
    items: [
      { food: rice, grams: 300 },
      { food: chicken, grams: 200 },
    ],
  };
  const result = computeRecipeNutrition(recipe);
  assert.equal(result.totalGrams, 500);
  assert.equal(result.gramsPerServing, 250);
  // 合计 = 米饭 300g + 鸡胸 200g
  assert.equal(result.totals.kcal, Math.round(116 * 3 + 165 * 2));
  assert.equal(result.perServing.kcal, Math.round((116 * 3 + 165 * 2) / 2));
  assert.equal(result.isEstimate, false);
});

test('食谱含估算食材时标记为估算', () => {
  const estimated = { id: 3, name: '自制酱汁', kcal: 200, protein: 1, fat: 10, carb: 20, is_estimate: 1 };
  const result = computeRecipeNutrition({ servings: 1, items: [{ food: estimated, grams: 20 }] });
  assert.equal(result.isEstimate, true);
});

test('饮食记录：按份数换算（份 → 克）', () => {
  const entry = computeEntryNutrition({ entryType: 'food', food: chicken, servings: 1.5 });
  assert.equal(entry.grams, 180);
  assert.equal(entry.macros.kcal, Math.round(165 * 1.8));
});

test('饮食记录：直接给克数时优先使用克数', () => {
  const entry = computeEntryNutrition({ entryType: 'food', food: chicken, grams: 100 });
  assert.equal(entry.grams, 100);
  assert.equal(entry.macros.kcal, 165);
});

test('目标对比：低于 60% 标记 low，超过 110% 标记 over', () => {
  const comparison = compareWithTargets(
    { kcal: 900, protein: 100, fat: 50, carb: 200 },
    { kcal: 2000, protein: 120, fat: 60, carb: 200 },
  );
  assert.equal(comparison.kcal.status, 'low');
  assert.equal(comparison.protein.status, 'on_track');
  assert.equal(comparison.carb.status, 'on_track');
  assert.equal(comparison.kcal.percent, 45);
});

test('目标缺失时返回 no_target，不给出负面判断', () => {
  const comparison = compareWithTargets({ kcal: 500 }, { kcal: null });
  assert.equal(comparison.kcal.status, 'no_target');
  assert.equal(comparison.kcal.percent, null);
});
