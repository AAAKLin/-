'use strict';

const express = require('express');
const todayService = require('../services/todayService');
const { Validator } = require('../lib/validate');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get('/api/today', asyncHandler((req, res) => {
  const { date } = new Validator(req.query).date('date').done();
  res.json(todayService.snapshot(date));
}));

module.exports = router;
