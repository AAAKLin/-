'use strict';

/**
 * AI 建议服务：把今日行动中心的数据交给大模型，生成一段个性化建议。
 *
 * 三条铁律：
 * 1. AI 只是"增强"：没配密钥、请求失败、超时——一律降级到规则建议，
 *    核心功能永远不依赖外部服务（这也是本项目的第一设计原则）
 * 2. 发给 AI 的只有训练/饮食汇总数据，绝不含密钥、绝不含其他用户数据
 * 3. prompt 里明确约束：不做医疗诊断、给可执行的小建议、控制篇幅
 */

const aiClient = require('../lib/aiClient');
const todayService = require('./todayService');
const { today } = require('../lib/dates');

/** 系统提示词：定义 AI 的角色、边界和输出格式 */
const SYSTEM_PROMPT = [
  '你是一位经验丰富的家庭健身教练，服务对象是 mostly 在家训练的新手。',
  '根据用户提供的今日数据（体重趋势、训练计划与完成情况、饮食达成、近期依从性），',
  '给出 1 段中文建议，要求：',
  '1. 只聚焦今天最值得做的 1-2 件事，说清"做什么、为什么"',
  '2. 语气像教练对学员说话，直接、具体、鼓励，不空洞',
  '3. 120 字以内，不要列表符号，不要标题',
  '4. 只基于给定数据判断，不要编造用户没有的信息',
  '5. 用户提到疼痛或不适时，优先建议休息并视情况就医，绝不开具训练处方',
].join('\n');

/** 把今日快照压缩成 prompt 用的紧凑 JSON（只挑 AI 需要的字段，省 token） */
function buildUserPayload(snap) {
  return JSON.stringify({
    日期: snap.date,
    体重: {
      最新: snap.body.latest ? `${snap.body.latest.weightKg}kg` : '未记录',
      近期趋势: snap.body.weightTrend
        ? `每周${snap.body.weightTrend.slopePerWeek >= 0 ? '+' : ''}${Number(snap.body.weightTrend.slopePerWeek).toFixed(2)}kg`
        : '数据不足',
    },
    今日训练: snap.training.planDay && !snap.training.planDay.restDay
      ? {
          计划: snap.training.planDay.title,
          状态: snap.training.hasRecord ? snap.training.log.status : '未记录',
          完成度: `${snap.training.completedItems}/${snap.training.totalItems}`,
        }
      : { 计划: '休息日' },
    饮食: {
      记录餐数: snap.diet.entryCount,
      热量达成: snap.diet.comparison ? `${snap.diet.comparison.caloriesPct}%` : '无记录',
      蛋白质达成: snap.diet.comparison ? `${snap.diet.comparison.proteinPct}%` : '无记录',
    },
    近两周依从: `${snap.adherence.completed}/${snap.adherence.planned} 次完成`,
  });
}

/** 规则建议拼成一段话（AI 不可用时的兜底） */
function ruleBasedText(snap) {
  const parts = [];
  if (snap.training.hasRecord) {
    parts.push(`今天训练已记录（${snap.training.log.status === 'completed' ? '全部完成' : snap.training.log.status === 'partial' ? '部分完成' : '没练'}）。`);
  } else if (snap.training.planDay && !snap.training.planDay.restDay) {
    parts.push(`今天有计划「${snap.training.planDay.title}」，还没记录。`);
  }
  if (snap.diet.entryCount === 0) {
    parts.push('饮食还没记录，记一下才知道离目标多远。');
  } else if (snap.diet.comparison && snap.diet.comparison.proteinPct < 70) {
    parts.push('蛋白质离目标还差不少，优先补上。');
  }
  if (snap.body.daysSinceLastMeasurement != null && snap.body.daysSinceLastMeasurement >= 7) {
    parts.push(`已经 ${snap.body.daysSinceLastMeasurement} 天没称重了，早上空腹称一个。`);
  }
  if (parts.length === 0) {
    parts.push('今天状态不错，按计划推进就好。');
  }
  return parts.join('');
}

/**
 * 生成今日 AI 建议。
 * @param {string} [dateKey] 日期（默认今天）
 * @returns {Promise<{source:'ai'|'rule', text:string, model?:string, reason?:string, generatedAt:string}>}
 *          永远 resolve，绝不 reject——AI 出问题就降级，调用方无感知
 */
async function generateTrainingAdvice(dateKey = today()) {
  const snap = todayService.snapshot(dateKey);

  // 没配密钥：直接降级，不浪费一次请求
  if (!aiClient.isConfigured()) {
    return {
      source: 'rule',
      text: ruleBasedText(snap),
      reason: 'AI 未配置（未设置 API Key），已显示规则建议',
      generatedAt: new Date().toISOString(),
    };
  }

  try {
    const result = await aiClient.chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPayload(snap) },
      ],
      temperature: 0.4,
    });
    return {
      source: 'ai',
      text: result.content,
      model: result.model,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    // AI 挂了不影响的正常使用：降级 + 说明原因（错误信息已确保不含密钥）
    return {
      source: 'rule',
      text: ruleBasedText(snap),
      reason: err instanceof aiClient.AiError ? err.message : `AI 调用失败：${err.message}`,
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = { generateTrainingAdvice, buildUserPayload, ruleBasedText, SYSTEM_PROMPT };
