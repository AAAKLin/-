'use strict';

/**
 * 合成演示数据（仅用于功能验证与演示，不是真实健康数据）。
 * 设计原则：只补充缺失数据，不删除/覆盖用户已有记录。
 */

const profileRepo = require('../repositories/profileRepo');
const planRepo = require('../repositories/planRepo');
const planService = require('./planService');
const workoutRepo = require('../repositories/workoutRepo');
const dietRepo = require('../repositories/dietRepo');
const measurementRepo = require('../repositories/measurementRepo');
const foodRepo = require('../repositories/foodRepo');
const { computeEntryNutrition } = require('./nutrition');
const { today, addDays, startOfWeek, diffDays } = require('../lib/dates');

/** 固定种子的伪随机，保证每次生成结果一致、可复现 */
function pseudoRandom(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function foodByName(name) {
  const list = foodRepo.listFoods({ q: name, limit: 5 });
  return list.find((f) => f.name === name) || list[0] || null;
}

function ensurePlans(profile, weeks = 5) {
  const todayKey = today();
  let created = 0;
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const weekStart = startOfWeek(addDays(todayKey, -7 * w));
    const existing = planRepo.getWeek(weekStart);
    if (existing && existing.length > 0) continue;
    planService.generateWeek(profile, weekStart);
    created += 1;
  }
  return created;
}

function seedMeasurements(days = 28) {
  const todayKey = today();
  let added = 0;
  for (let i = days - 1; i >= 0; i -= 2) {
    const date = addDays(todayKey, -i);
    if (measurementRepo.findByDate(date)) continue;
    const progress = (days - 1 - i) / (days - 1);
    const noise = (pseudoRandom(i) - 0.5) * 0.6;
    const weight = Math.round((86 - progress * 2.4 + noise) * 10) / 10;
    const waist = Math.round((96 - progress * 2.2 + (pseudoRandom(i + 100) - 0.5) * 0.8) * 10) / 10;
    measurementRepo.upsert({ date, weightKg: weight, waistCm: waist, note: '合成演示数据' });
    added += 1;
  }
  return added;
}

function seedWorkouts(days = 21) {
  const todayKey = today();
  const from = addDays(todayKey, -(days - 1));
  const planned = planRepo.daysBetween(startOfWeek(addDays(from, -7)), todayKey)
    .filter((d) => !d.restDay && d.date >= from && d.date <= todayKey);

  let added = 0;
  planned.forEach((day, index) => {
    if (day.date === todayKey) return; // 今天留给真实记录
    if (workoutRepo.findByDate(day.date).length > 0) return;

    const r = pseudoRandom(index + 3);
    let status = 'completed';
    if (r > 0.88) status = 'skipped';
    else if (r > 0.72) status = 'partial';

    const planDay = planRepo.getDayById(day.id);
    const items = (planDay?.items || []).map((item, itemIndex) => {
      const done = status === 'completed' ? 1 : status === 'partial' ? (itemIndex < Math.ceil((planDay?.items.length || 1) / 2) ? 1 : 0) : 0;
      const difficulty = Math.min(5, Math.max(1, Math.round(2 + pseudoRandom(index * 7 + itemIndex) * 2)));
      return {
        exerciseId: item.exerciseId,
        planItemId: item.id,
        done,
        actualSets: item.targetSets,
        actualReps: item.targetReps || null,
        actualDurationSec: item.targetDurationSec || null,
        difficulty: done ? difficulty : null,
        discomfort: null,
      };
    });

    workoutRepo.upsert({
      date: day.date,
      planDayId: day.id,
      status,
      perceivedDifficulty: status === 'skipped' ? null : 3,
      note: '合成演示数据',
      items,
    });
    added += 1;
  });
  return added;
}

function seedDiet(days = 7) {
  const todayKey = today();
  const menu = [
    ['breakfast', [['燕麦片（干）', 40], ['鸡蛋（全蛋）', 100], ['全脂牛奶', 200]]],
    ['lunch', [['米饭（熟）', 200], ['鸡胸肉（水煮）', 120], ['西兰花', 150]]],
    ['dinner', [['红薯（蒸熟）', 180], ['北豆腐', 150], ['菠菜', 150], ['菜籽油', 5]]],
    ['snack', [['无糖希腊酸奶', 150]]],
  ];

  let added = 0;
  for (let i = days - 1; i >= 1; i -= 1) {
    const date = addDays(todayKey, -i);
    if (dietRepo.listByDate(date).length > 0) continue;
    for (const [meal, items] of menu) {
      for (const [name, grams] of items) {
        const food = foodByName(name);
        if (!food) continue;
        const variation = 0.9 + pseudoRandom(i * 31 + grams) * 0.2;
        const computed = computeEntryNutrition({ entryType: 'food', food, grams: Math.round(grams * variation) });
        dietRepo.create({
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
        added += 1;
      }
    }
  }
  return added;
}

function loadSyntheticData({ days = 28 } = {}) {
  const profile = profileRepo.get();
  const plansCreated = ensurePlans(profile);
  const measurementsAdded = seedMeasurements(days);
  const workoutsAdded = seedWorkouts(21);
  const dietEntriesAdded = seedDiet(7);

  return {
    synthetic: true,
    plansCreated,
    measurementsAdded,
    workoutsAdded,
    dietEntriesAdded,
    note: '合成数据仅用于演示与测试；只补充缺失日期，不会覆盖已有记录。',
  };
}

module.exports = { loadSyntheticData, pseudoRandom, diffDays };
