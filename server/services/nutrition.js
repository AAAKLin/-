'use strict';

/**
 * 营养计算：纯函数、确定性、不依赖任何外部服务。
 * 所有食物营养值按"每 100 克"存储，记录时按实际克数换算。
 */

const MACRO_KEYS = ['kcal', 'protein', 'fat', 'carb'];

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function emptyMacros() {
  return { kcal: 0, protein: 0, fat: 0, carb: 0 };
}

/** 按克数换算食物营养（food 为每 100 克基准） */
function macrosForGrams(food, grams) {
  const g = Number(grams) || 0;
  const factor = g / 100;
  return {
    kcal: round((Number(food.kcal) || 0) * factor, 0),
    protein: round((Number(food.protein) || 0) * factor, 1),
    fat: round((Number(food.fat) || 0) * factor, 1),
    carb: round((Number(food.carb) || 0) * factor, 1),
  };
}

function sumMacros(list = []) {
  return list.reduce((acc, item) => {
    for (const key of MACRO_KEYS) acc[key] = round((acc[key] || 0) + (Number(item?.[key]) || 0), key === 'kcal' ? 0 : 1);
    return acc;
  }, emptyMacros());
}

function addMacros(a, b) {
  return sumMacros([a, b]);
}

/**
 * 食谱营养：按食材用量求和，再按份数分摊。
 * @param {{items: Array<{food: object, grams: number}>, servings: number}} recipe
 */
function computeRecipeNutrition(recipe) {
  const items = (recipe.items || []).map((item) => {
    const grams = Number(item.grams) || 0;
    return {
      foodId: item.food?.id ?? item.food_id ?? null,
      foodName: item.food?.name ?? item.food_name ?? '',
      grams,
      macros: macrosForGrams(item.food || {}, grams),
      isEstimate: Boolean(item.food?.isEstimate ?? item.food?.is_estimate),
    };
  });

  const totals = sumMacros(items.map((i) => i.macros));
  const totalGrams = round(items.reduce((acc, i) => acc + i.grams, 0), 0);
  const servings = Math.max(Number(recipe.servings) || 1, 0.01);
  const perServing = sumMacros([
    {
      kcal: totals.kcal / servings,
      protein: totals.protein / servings,
      fat: totals.fat / servings,
      carb: totals.carb / servings,
    },
  ]);

  return {
    totals,
    perServing,
    totalGrams,
    servings,
    gramsPerServing: round(totalGrams / servings, 0),
    items,
    isEstimate: items.some((i) => i.isEstimate),
  };
}

/**
 * 计算一条饮食记录的营养快照。
 * @param {{entryType: 'food'|'recipe', food?: object, recipe?: object, servings?: number, grams?: number}} input
 */
function computeEntryNutrition(input) {
  const { entryType = 'food' } = input;

  if (entryType === 'recipe') {
    const recipe = input.recipe;
    if (!recipe) throw new Error('缺少食谱数据');
    const nutrition = computeRecipeNutrition(recipe);
    const servings = Number(input.servings) || 1;
    return {
      grams: round(nutrition.gramsPerServing * servings, 0),
      servings,
      macros: {
        kcal: round(nutrition.perServing.kcal * servings, 0),
        protein: round(nutrition.perServing.protein * servings, 1),
        fat: round(nutrition.perServing.fat * servings, 1),
        carb: round(nutrition.perServing.carb * servings, 1),
      },
      isEstimate: nutrition.isEstimate,
    };
  }

  const food = input.food;
  if (!food) throw new Error('缺少食物数据');
  const servingGrams = Number(food.serving_grams) || 100;
  const grams = input.grams !== undefined && input.grams !== null
    ? Number(input.grams)
    : round((Number(input.servings) || 1) * servingGrams, 0);
  const servings = round(grams / (servingGrams || 100), 2);
  return {
    grams: round(grams, 0),
    servings,
    macros: macrosForGrams(food, grams),
    isEstimate: Boolean(food.is_estimate),
  };
}

/** 与目标对比：返回达成率与状态（不因缺失记录给出负面判断） */
function compareWithTargets(totals, targets) {
  const result = {};
  for (const key of MACRO_KEYS) {
    const target = Number(targets?.[key]);
    const actual = Number(totals?.[key]) || 0;
    if (!Number.isFinite(target) || target <= 0) {
      result[key] = { target: null, actual: round(actual, key === 'kcal' ? 0 : 1), percent: null, remaining: null, status: 'no_target' };
      continue;
    }
    const percent = round((actual / target) * 100, 0);
    const remaining = round(target - actual, key === 'kcal' ? 0 : 1);
    let status = 'on_track';
    if (percent < 60) status = 'low';
    else if (percent > 110) status = 'over';
    result[key] = { target: round(target, key === 'kcal' ? 0 : 1), actual: round(actual, key === 'kcal' ? 0 : 1), percent, remaining, status };
  }
  return result;
}

module.exports = {
  MACRO_KEYS,
  round,
  emptyMacros,
  macrosForGrams,
  sumMacros,
  addMacros,
  computeRecipeNutrition,
  computeEntryNutrition,
  compareWithTargets,
};
