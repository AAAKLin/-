'use strict';

/**
 * 规则化训练调整与教练建议：透明、可解释、确定性，不依赖任何 AI 服务。
 * 阈值是实现默认值，用于产品体验，不构成医学权威。
 */

const DIFFICULTY_LABELS = {
  1: '很轻松',
  2: '轻松',
  3: '适中',
  4: '有点吃力',
  5: '很吃力',
};

const MAX_REPS = 15;
const MIN_REPS = 5;
const MAX_SETS = 5;
const MIN_SETS = 2;
const MAX_DURATION_SEC = 300;
const MIN_DURATION_SEC = 20;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * 单个动作的进度评估与下一次建议。
 * history：该动作最近若干次训练记录（按日期升序），字段见 workout_log_items
 */
function evaluateExerciseProgress({ exercise, history = [] }) {
  const logged = history.filter((h) => h.done === 1 || h.done === true);
  const base = {
    exerciseId: exercise?.id ?? null,
    exerciseName: exercise?.name ?? '',
    // 兼容 camelCase（仓储层返回）与 snake_case（数据库行）两种输入
    isTimeBased: Boolean(exercise?.isTimeBased ?? exercise?.is_time_based),
  };

  if (logged.length < 2) {
    return {
      ...base,
      status: 'insufficient',
      title: '先保持当前安排',
      reason: logged.length === 0 ? '还没有该动作的完成记录' : '只有 1 次记录，样本不足',
      suggestion: null,
      confidence: 'low',
    };
  }

  const last2 = logged.slice(-2);
  const hasDiscomfort = last2.some((h) => (h.discomfort || '').trim().length > 0);
  const bothEasy = last2.every((h) => Number(h.difficulty || 3) <= 2);
  const bothHard = last2.every((h) => Number(h.difficulty || 3) >= 4);

  const latest = last2[last2.length - 1];
  const isTimeBased = Boolean(exercise?.isTimeBased ?? exercise?.is_time_based);
  const currentSets = clamp(Number(latest.actualSets ?? latest.actual_sets ?? exercise?.defaultSets ?? exercise?.default_sets ?? 3), 1, 10);
  const currentReps = clamp(Number(latest.actualReps ?? latest.actual_reps ?? exercise?.defaultReps ?? exercise?.default_reps ?? 10), 1, 60);
  const currentDuration = clamp(
    Number(latest.actualDurationSec ?? latest.actual_duration_sec ?? exercise?.defaultDurationSec ?? exercise?.default_duration_sec ?? 30),
    MIN_DURATION_SEC,
    3600,
  );

  if (hasDiscomfort) {
    const reason = `最近记录提到不适：${last2.filter((h) => (h.discomfort || '').trim()).map((h) => h.discomfort).slice(-1)[0]}`;
    return {
      ...base,
      isTimeBased,
      status: 'regress',
      title: '降低强度并注意动作感觉',
      reason,
      suggestion: isTimeBased
        ? { targetSets: currentSets, targetReps: 0, targetDurationSec: clamp(Math.round(currentDuration * 0.7), MIN_DURATION_SEC, MAX_DURATION_SEC) }
        : { targetSets: clamp(currentSets - 1, MIN_SETS, MAX_SETS), targetReps: clamp(currentReps - 2, MIN_REPS, MAX_REPS), targetDurationSec: 0 },
      swapToExerciseId: exercise?.easierAlternativeId ?? exercise?.easier_alternative_id ?? null,
      swapNote: (exercise?.easierAlternativeId ?? exercise?.easier_alternative_id) ? '如仍有不适，可换成更简单的退阶动作' : null,
      confidence: 'medium',
      safetyNote: '出现疼痛、胸闷、头晕或异常心慌时应停止训练并咨询专业人士',
    };
  }

  if (bothHard) {
    return {
      ...base,
      status: 'deload',
      title: '上次偏吃力，这次减一点',
      reason: '最近两次都记录为吃力，先降低一点强度保持动作质量',
      suggestion: isTimeBased
        ? { targetSets: currentSets, targetReps: 0, targetDurationSec: clamp(Math.round(currentDuration * 0.8), MIN_DURATION_SEC, MAX_DURATION_SEC) }
        : { targetSets: clamp(currentSets - 1, MIN_SETS, MAX_SETS), targetReps: currentReps, targetDurationSec: 0 },
      confidence: 'medium',
    };
  }

  if (bothEasy) {
    if (isTimeBased) {
      return {
        ...base,
        status: 'progress',
        title: '可以适当加一点时间',
        reason: '最近两次都感觉轻松，按 10% 的幅度增加时长',
        suggestion: {
          targetSets: currentSets,
          targetReps: 0,
          targetDurationSec: clamp(Math.round(currentDuration * 1.1), MIN_DURATION_SEC, MAX_DURATION_SEC),
        },
        confidence: 'medium',
      };
    }
    if (currentReps >= MAX_REPS && currentSets < MAX_SETS) {
      return {
        ...base,
        status: 'progress',
        title: '可以增加一组',
        reason: `每组次数已达 ${MAX_REPS} 次且感觉轻松，增加 1 组`,
        suggestion: { targetSets: clamp(currentSets + 1, MIN_SETS, MAX_SETS), targetReps: MAX_REPS, targetDurationSec: 0 },
        confidence: 'medium',
      };
    }
    return {
      ...base,
      status: 'progress',
      title: '每组可以加 1 次',
      reason: '最近两次都感觉轻松，每次加 1 个重复次数更稳妥',
      suggestion: { targetSets: currentSets, targetReps: clamp(currentReps + 1, MIN_REPS, MAX_REPS), targetDurationSec: 0 },
      confidence: 'medium',
    };
  }

  return {
    ...base,
    status: 'keep',
    title: '保持当前安排',
    reason: '最近两次强度适中，维持现有次数/时长即可',
    suggestion: {
      targetSets: currentSets,
      targetReps: isTimeBased ? 0 : currentReps,
      targetDurationSec: isTimeBased ? currentDuration : 0,
    },
    confidence: 'medium',
  };
}

/** 批量评估：输入 [{exercise, history}] */
function buildTrainingSuggestions(entries = []) {
  return entries.map((entry) => evaluateExerciseProgress(entry));
}

/**
 * 首页教练建议：确定性规则，最多返回 4 条，语气中性、不制造负罪感。
 * context: {date, todayPlan, todayLog, diet, targets, measurements, training}
 */
function buildCoachRecommendations(context = {}) {
  const out = [];
  const { todayPlan = null, todayLog = null, diet = null, targets = null, measurements = null, training = null } = context;

  // 1. 训练状态
  if (!todayPlan) {
    out.push({
      id: 'no_plan',
      tone: 'neutral',
      title: '还没有训练计划',
      body: '先在「训练」页面生成一份新手周计划，系统会按你的可用天数和器械情况安排。',
    });
  } else if (todayPlan.rest_day) {
    out.push({
      id: 'rest_day',
      tone: 'positive',
      title: '今天安排的是休息日',
      body: '休息也是训练的一部分；可以散散步或做 5 分钟拉伸。',
    });
  } else if (!todayLog) {
    out.push({
      id: 'training_not_recorded',
      tone: 'neutral',
      title: '今天的训练还没有记录',
      body: '系统只显示「未记录」，不会判定你没有完成。练完后点一次快速记录即可。',
    });
  } else if (todayLog.status === 'completed') {
    out.push({
      id: 'training_done',
      tone: 'positive',
      title: '今天的训练已完成',
      body: '很好，记得补充蛋白质并留出睡眠时间。',
    });
  } else if (todayLog.status === 'partial') {
    out.push({
      id: 'training_partial',
      tone: 'positive',
      title: '今天完成了部分训练',
      body: '部分完成也有价值，下次按身体状态继续即可，不需要额外补练。',
    });
  }

  // 2. 蛋白质
  const protein = diet?.comparison?.protein;
  if (protein && protein.target && protein.percent !== null && protein.percent < 70) {
    out.push({
      id: 'protein_low',
      tone: 'attention',
      title: `蛋白质还差约 ${Math.round(protein.remaining)} 克`,
      body: '优先选择鸡蛋、鸡胸肉、豆腐、无糖酸奶等低预算高蛋白食物，下一餐补上即可。',
    });
  }

  // 3. 热量
  const kcal = diet?.comparison?.kcal;
  if (kcal && kcal.target && kcal.percent !== null && kcal.percent > 110) {
    out.push({
      id: 'calorie_over',
      tone: 'attention',
      title: '今天热量已超过目标',
      body: '先看看食用油、酱料和零食这部分，通常是最容易少记的热量来源。',
    });
  } else if (kcal && kcal.target && kcal.percent !== null && kcal.percent < 50 && diet?.entryCount > 0) {
    out.push({
      id: 'calorie_low',
      tone: 'neutral',
      title: '今天记录的热量偏低',
      body: '如果确实吃得少，注意别长期低于目标太多；也可能是还有餐次没记录。',
    });
  }

  // 4. 体重趋势
  const trend = measurements?.weightTrend;
  if (trend && trend.count >= 3 && Number.isFinite(trend.slopePerWeek)) {
    const weeklyLoss = -trend.slopePerWeek;
    if (weeklyLoss > 1.2) {
      out.push({
        id: 'weight_fast',
        tone: 'attention',
        title: '体重下降偏快',
        body: `最近趋势约每周 -${Math.round(weeklyLoss * 10) / 10} 公斤，可考虑把热量上调 100-200 千卡，避免掉肌肉。`,
      });
    } else if (weeklyLoss > 0.1) {
      out.push({
        id: 'weight_good',
        tone: 'positive',
        title: '体重趋势平稳下降',
        body: `最近趋势约每周 -${Math.round(weeklyLoss * 10) / 10} 公斤，属于比较理想的区间，继续保持。`,
      });
    } else if (trend.slopePerWeek > 0.4) {
      out.push({
        id: 'weight_up',
        tone: 'neutral',
        title: '体重近期略有上升',
        body: '单次波动很常见，先看 2 周趋势；如持续上升再检查饮食记录是否完整。',
      });
    }
  }

  // 5. 漏练后的回归
  if (training?.daysSinceLastSession !== null && training?.daysSinceLastSession >= 5) {
    out.push({
      id: 'resume',
      tone: 'neutral',
      title: `已有 ${training.daysSinceLastSession} 天没有训练记录`,
      body: '直接从下一个计划日继续即可，不需要补之前的训练，强度可以先用退阶动作找回感觉。',
    });
  }

  return out.slice(0, 4);
}

/** 漏练后的回归建议（单独用于训练页） */
function resumeGuidance({ missedDays = 0 }) {
  if (missedDays < 3) return null;
  return {
    title: '回到计划的简单做法',
    steps: [
      '从下一个计划日开始，不需要把漏掉的训练补齐',
      '第一周把每组次数或时长降到计划的 70%，找动作感觉',
      '如果某动作感觉吃力，换成退阶动作（系统会给出建议）',
      '连续 2 次感觉轻松后，再按建议加量',
    ],
  };
}

module.exports = {
  DIFFICULTY_LABELS,
  evaluateExerciseProgress,
  buildTrainingSuggestions,
  buildCoachRecommendations,
  resumeGuidance,
};
