'use strict';

const express = require('express');
const demoService = require('../services/demoService');
const { Validator } = require('../lib/validate');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * 载入合成演示数据（仅补充缺失日期，不删除已有记录）。
 * 用于在空数据库上快速验证图表、趋势与统计是否正常。
 */
router.post('/api/demo/load', asyncHandler((req, res) => {
  const { days } = new Validator(req.body || {}).number('days', { min: 7, max: 90, integer: true, default: 28 }).done();
  res.json(demoService.loadSyntheticData({ days }));
}));

module.exports = router;
