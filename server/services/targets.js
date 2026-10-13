'use strict';

/**
 * 目标推算：Mifflin-St Jeor 公式 + 活动系数 + 目标热量调整 + 三大宏量分配。
 * 全部为确定性计算（无 AI 依赖），输出同时给出假设说明，标记为"估算"。
 */

const ACTIVITY_FACTORS = {
  sedentary: 1.2, // 坐办公室，几乎不运动
  light: 1.375, // 每周 1-3 次轻中度运动
  moderate: 1.55, // 每周 3-5 次运动
  high: 1.725, // 每周 6-7 次高强度
};

const GOAL_PROFILES = {
  fat_loss: { deficit: 400, proteinPerKg: 1.8, label: '减脂（尽量保住肌肉）' },
  recomp: { deficit: 200, proteinPerKg: 1.7, label: '体重维持/体态改善' },
  maintain: { deficit: 0, proteinPerKg: 1.6, label: '维持现状' },
};

/** 安全下限：过低热量不建议长期执行 */
function calorieFloor(sex) {
  return sex === 'female' ? 1200 : 1500;
}

function bmrMifflin({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

/**
 * 计算每日能量与宏量目标。
 * @returns {{kcal:number, protein:number, fat:number, carb:number, bmr:number, tdee:number, assumptions:string[], confidence:'estimate'}}
 */
function computeTargets(profile) {
  const sex = profile.sex === 'female' ? 'female' : 'male';
  const weightKg = Number(profile.weight_kg ?? profile.weightKg);
  const heightCm = Number(profile.height_cm ?? profile.heightCm);
  const age = Number(profile.age);
  const activityLevel = ACTIVITY_FACTORS[profile.activity_level ?? profile.activityLevel] ? profile.activity_level ?? profile.activityLevel : 'light';
  const goal = GOAL_PROFILES[profile.goal] ? profile.goal : 'fat_loss';

  const missing = [];
  if (!Number.isFinite(weightKg) || weightKg <= 0) missing.push('体重');
  if (!Number.isFinite(heightCm) || heightCm <= 0) missing.push('身高');
  if (!Number.isFinite(age) || age <= 0) missing.push('年龄');
  if (missing.length > 0) {
    return {
      kcal: null,
      protein: null,
      fat: null,
      carb: null,
      bmr: null,
      tdee: null,
      assumptions: [`缺少${missing.join('、')}，无法估算目标，请在档案中补齐后重试`],
      confidence: 'insufficient_data',
    };
  }

  const bmr = bmrMifflin({ sex, weightKg, heightCm, age });
  const tdee = bmr * ACTIVITY_FACTORS[activityLevel];
  const goalProfile = GOAL_PROFILES[goal];
  const floor = calorieFloor(sex);
  const rawTarget = tdee - goalProfile.deficit;
  const kcal = Math.max(Math.round(rawTarget), floor);

  const protein = Math.round(weightKg * goalProfile.proteinPerKg);
  const fat = Math.round(weightKg * 0.8);
  const carbByRemainder = (kcal - protein * 4 - fat * 9) / 4;
  const carb = Math.max(50, Math.round(carbByRemainder));

  const assumptions = [
    `基础代谢（Mifflin-St Jeor 公式）约 ${Math.round(bmr)} 千卡/天`,
    `活动系数 ${ACTIVITY_FACTORS[activityLevel]}（${
      { sedentary: '久坐少动', light: '每周 1-3 次运动', moderate: '每周 3-5 次运动', high: '每周高强度训练' }[activityLevel]
    }）`,
    `每日总消耗估算约 ${Math.round(tdee)} 千卡，按「${goalProfile.label}」${goalProfile.deficit > 0 ? `减少 ${goalProfile.deficit} 千卡` : '不做热量调整'}`,
    `蛋白质按体重每公斤 ${goalProfile.proteinPerKg} 克；脂肪按每公斤 0.8 克；剩余热量分配给碳水（不低于 50 克/天）`,
    rawTarget < floor ? `计算结果低于安全下限，已上调至 ${floor} 千卡` : null,
    '以上均为估算值，实际以体重与体感变化为准，可在设置中手动覆盖',
  ].filter(Boolean);

  return {
    kcal,
    protein,
    fat,
    carb,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    assumptions,
    confidence: 'estimate',
  };
}

/** 根据体重/身高给出参考区间说明（仅作参考，不构成医疗建议） */
function bmiSummary(heightCm, weightKg) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return null;
  const bmi = Math.round((w / (h / 100) ** 2) * 10) / 10;
  let category = '参考范围';
  if (bmi < 18.5) category = '偏瘦';
  else if (bmi < 24) category = '正常范围';
  else if (bmi < 28) category = '超重';
  else category = '肥胖';
  return { bmi, category, note: 'BMI 仅供粗略参考，不区分肌肉与脂肪' };
}

module.exports = { computeTargets, bmrMifflin, bmiSummary, ACTIVITY_FACTORS, GOAL_PROFILES, calorieFloor };
