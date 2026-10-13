'use strict';

const express = require('express');
const todayService = require('../services/todayService');
const aiService = require('../services/aiService');
const { Validator } = require('../lib/validate');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get('/api/today', asyncHandler((req, res) => {
  const { date } = new Validator(req.query).date('date').done();
  res.json(todayService.snapshot(date));
}));

/**
 * 生成今日 AI 建议（POST 因为是"生成"动作，且可能耗时数秒）。
 * 永远返回 200：AI 不可用时 body.source === 'rule'，前端展示降级结果。
 */
router.post('/api/today/ai-advice', asyncHandler(async (req, res) => {
  const { date } = new Validator(req.body || {}).date('date').done();
  const advice = await aiService.generateTrainingAdvice(date);
  res.json(advice);
}));

module.exports = router;
