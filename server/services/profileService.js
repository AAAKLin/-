'use strict';

const profileRepo = require('../repositories/profileRepo');
const { computeTargets, bmiSummary } = require('./targets');

/** 生效中的目标：手动设置优先，否则按档案自动估算 */
function effectiveTargets(profile) {
  const manual = {
    kcal: profile.target_kcal,
    protein: profile.target_protein,
    fat: profile.target_fat,
    carb: profile.target_carb,
  };
  const hasManual = [manual.kcal, manual.protein, manual.fat, manual.carb].some((v) => Number.isFinite(Number(v)) && Number(v) > 0);
  const auto = computeTargets(profile);

  if (hasManual && profile.target_source === 'manual') {
    return {
      kcal: manual.kcal ?? auto.kcal,
      protein: manual.protein ?? auto.protein,
      fat: manual.fat ?? auto.fat,
      carb: manual.carb ?? auto.carb,
      source: 'manual',
      auto,
      assumptions: ['当前使用手动设置的目标值', ...(auto.assumptions || [])],
      confidence: 'user_defined',
    };
  }
  return { ...auto, source: 'auto', auto };
}

function getProfile() {
  const profile = profileRepo.get();
  const targets = effectiveTargets(profile);
  return {
    profile,
    targets,
    bmi: bmiSummary(profile.height_cm, profile.weight_kg),
  };
}

function updateProfile(patch) {
  const allowed = [
    'displayName', 'sex', 'age', 'heightCm', 'weightKg', 'activityLevel', 'goal',
    'experience', 'availableDays', 'sessionMinutes', 'equipment', 'limitations', 'budgetLevel',
    'targetKcal', 'targetProtein', 'targetFat', 'targetCarb', 'targetSource',
  ];
  const clean = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) clean[key] = patch[key];
  }
  if (Object.keys(clean).length === 0) return getProfile();

  const updated = profileRepo.update(clean);

  // 自动模式下，档案变化后重新推算目标
  if (updated.target_source !== 'manual') {
    const auto = computeTargets(updated);
    if (auto.confidence !== 'insufficient_data') {
      profileRepo.update({
        targetKcal: auto.kcal,
        targetProtein: auto.protein,
        targetFat: auto.fat,
        targetCarb: auto.carb,
      });
    }
  }
  return getProfile();
}

/** 强制按当前档案重新推算（放弃手动覆盖） */
function recomputeTargets() {
  const profile = profileRepo.get();
  const auto = computeTargets(profile);
  if (auto.confidence === 'insufficient_data') {
    return { updated: false, ...getProfile(), reason: auto.assumptions[0] };
  }
  profileRepo.update({
    targetKcal: auto.kcal,
    targetProtein: auto.protein,
    targetFat: auto.fat,
    targetCarb: auto.carb,
    targetSource: 'auto',
  });
  return { updated: true, ...getProfile() };
}

module.exports = { getProfile, updateProfile, recomputeTargets, effectiveTargets };
