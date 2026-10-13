'use strict';

/**
 * 饮食业务：记录实际摄入、按份量/克数重算营养、与目标对比、生成低预算菜单建议。
 * 菜单建议只是"模板"，与实际摄入记录完全分离。
 */

const dietRepo = require('../repositories/dietRepo');
const foodRepo = require('../repositories/foodRepo');
const { NotFoundError, ConflictError } = require('../errors');
const { computeEntryNutrition, sumMacros, compareWithTargets, round, MACRO_KEYS } = require('./nutrition');
const { effectiveTargets } = require('./profileService');
const profileRepo = require('../repositories/profileRepo');

const MEALS = [
  { key: 'breakfast', label: '早餐', share: 0.25 },
  { key: 'lunch', label: '午餐', share: 0.35 },
  { key: 'dinner', label: '晚餐', share: 0.3 },
  { key: 'snack', label: '加餐', share: 0.1 },
];

function daySummary(date) {
  const entries = dietRepo.listByDate(date);
  const totals = sumMacros(entries);
  const profile = profileRepo.get();
  const targets = effectiveTargets(profile);
  const comparison = compareWithTargets(totals, {
    kcal: targets.kcal,
    protein: targets.protein,
    fat: targets.fat,
    carb: targets.carb,
  });

  const byMeal = MEALS.map((meal) => {
    const mealEntries = entries.filter((e) => e.meal === meal.key);
    return { key: meal.key, label: meal.label, entries: mealEntries, totals: sumMacros(mealEntries) };
  });

  return {
    date,
    entries,
    entryCount: entries.length,
    totals,
    targets: { kcal: targets.kcal, protein: targets.protein, fat: targets.fat, carb: targets.carb, source: targets.source },
    comparison,
    hasEstimate: entries.some((e) => e.isEstimate),
    byMeal,
  };
}

function addEntry({ date, meal, entryType, refId, servings, grams }) {
  if (entryType === 'recipe') {
    const recipe = foodRepo.findRecipe(refId);
    if (!recipe) throw new NotFoundError('食谱不存在');
    const computed = computeEntryNutrition({ entryType: 'recipe', recipe, servings: servings ?? 1 });
    return dietRepo.create({
      date,
      meal,
      entryType: 'recipe',
      refId: recipe.id,
      label: recipe.name,
      servings: computed.servings,
      grams: computed.grams,
      ...computed.macros,
      isEstimate: computed.isEstimate,
    });
  }

  const food = foodRepo.findFood(refId);
  if (!food) throw new NotFoundError('食物不存在');
  const computed = computeEntryNutrition({ entryType: 'food', food, servings, grams });
  return dietRepo.create({
    date,
    meal,
    entryType: 'food',
    refId: food.id,
    label: food.name,
    servings: computed.servings,
    grams: computed.grams,
    ...computed.macros,
    isEstimate: computed.isEstimate,
  });
}

function updateEntry(id, patch) {
  const existing = dietRepo.findById(id);
  if (!existing) throw new NotFoundError('饮食记录不存在');

  const next = { ...patch };
  const servingsChanged = patch.servings !== undefined && Number(patch.servings) !== existing.servings;
  const gramsChanged = patch.grams !== undefined && Number(patch.grams) !== existing.grams;

  if (servingsChanged || gramsChanged) {
    if (existing.entryType === 'recipe') {
      const recipe = foodRepo.findRecipe(existing.refId);
      if (!recipe) throw new ConflictError('关联食谱已不存在，无法重算营养');
      const computed = computeEntryNutrition({ entryType: 'recipe', recipe, servings: patch.servings ?? existing.servings });
      Object.assign(next, computed.macros, { grams: computed.grams, isEstimate: computed.isEstimate });
    } else {
      const food = foodRepo.findFood(existing.refId);
      if (!food) throw new ConflictError('关联食物已不存在，无法重算营养');
      const computed = computeEntryNutrition({
        entryType: 'food',
        food,
        servings: patch.servings,
        grams: patch.grams,
      });
      Object.assign(next, computed.macros, { grams: computed.grams, isEstimate: computed.isEstimate });
    }
  }

  return dietRepo.update(id, next);
}

function deleteEntry(id) {
  return dietRepo.remove(id);
}

/**
 * 低预算菜单建议：从标记为"平价"的食物中按热量占比拼三餐模板。
 * 只是建议，不会写入实际记录。
 */
function menuSuggestions(date) {
  const profile = profileRepo.get();
  const targets = effectiveTargets(profile);
  const budget = (profile.budget_level || 'low') !== 'high';
  const foods = foodRepo.listFoods({ limit: 300, budgetOnly: budget });

  const pick = (categories, preferNames = []) => {
    for (const name of preferNames) {
      const hit = foods.find((f) => f.name === name);
      if (hit) return hit;
    }
    for (const category of categories) {
      const hit = foods.find((f) => f.category === category);
      if (hit) return hit;
    }
    return null;
  };

  const proteinPool = ['鸡蛋（全蛋）', '鸡胸肉（水煮）', '北豆腐', '巴沙鱼'];
  const staplePool = ['米饭（熟）', '燕麦片（干）', '红薯（蒸熟）'];
  const vegPool = ['西兰花', '菠菜', '番茄'];

  const meals = MEALS.map((meal) => {
    const mealKcal = Math.round((Number(targets.kcal) || 2000) * meal.share);
    const plan = [
      { food: pick(['protein', 'dairy'], proteinPool), share: meal.key === 'snack' ? 0.7 : 0.45 },
      { food: pick(['staple'], staplePool), share: meal.key === 'snack' ? 0.0 : 0.4 },
      { food: pick(['vegetable', 'fruit'], vegPool), share: meal.key === 'snack' ? 0.3 : 0.15 },
    ].filter((p) => p.food);

    const items = plan.map(({ food, share }) => {
      const kcalForItem = mealKcal * share;
      const per100 = Number(food.kcal) || 100;
      const grams = Math.max(10, Math.round((kcalForItem / per100) * 100 / 5) * 5);
      return {
        foodId: food.id,
        foodName: food.name,
        grams,
        isEstimate: food.isEstimate,
        macros: {
          kcal: round((Number(food.kcal) * grams) / 100, 0),
          protein: round((Number(food.protein) * grams) / 100, 1),
          fat: round((Number(food.fat) * grams) / 100, 1),
          carb: round((Number(food.carb) * grams) / 100, 1),
        },
      };
    });

    const totals = sumMacros(items.map((i) => i.macros));
    return { key: meal.key, label: meal.label, targetKcal: mealKcal, items, totals };
  });

  return {
    date,
    budgetMode: budget,
    targets: { kcal: targets.kcal, protein: targets.protein, fat: targets.fat, carb: targets.carb },
    totals: sumMacros(meals.map((m) => m.totals)),
    meals,
    note: '这是可编辑的参考菜单模板，不是你的实际记录；点「记到今天」才会写入实际摄入。',
  };
}

/** 从建议菜单的一餐直接写入实际记录 */
function addMealFromSuggestion({ date, meal }) {
  const suggestions = menuSuggestions(date);
  const target = suggestions.meals.find((m) => m.key === meal);
  if (!target) throw new NotFoundError('没有该餐次的建议');
  const created = [];
  for (const item of target.items) {
    created.push(addEntry({ date, meal, entryType: 'food', refId: item.foodId, grams: item.grams }));
  }
  return created;
}

module.exports = {
  daySummary,
  addEntry,
  updateEntry,
  deleteEntry,
  menuSuggestions,
  addMealFromSuggestion,
  MEALS,
  MACRO_KEYS,
};
