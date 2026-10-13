'use strict';

const express = require('express');
const progressService = require('../services/progressService');
const measurementRepo = require('../repositories/measurementRepo');
const { Validator } = require('../lib/validate');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError, ValidationError } = require('../errors');
const { today } = require('../lib/dates');

const router = express.Router();

router.get('/api/progress/summary', asyncHandler((req, res) => {
  const { days } = new Validator(req.query).number('days', { min: 7, max: 365, integer: true, default: 30 }).done();
  res.json(progressService.summary({ days }));
}));

router.get('/api/progress/measurements', asyncHandler((req, res) => {
  const { from, to } = new Validator(req.query).date('from').date('to').done();
  res.json({ items: measurementRepo.list({ from, to }) });
}));

router.post('/api/progress/measurements', asyncHandler((req, res) => {
  const data = new Validator(req.body)
    .date('date', { required: true })
    .number('weightKg', { min: 20, max: 300 })
    .number('waistCm', { min: 40, max: 200 })
    .string('note', { max: 200 })
    .done();

  if (data.weightKg === undefined && data.waistCm === undefined) {
    throw new ValidationError('体重和腰围至少填写一项');
  }
  res.status(201).json(measurementRepo.upsert(data));
}));

router.delete('/api/progress/measurements/:id', asyncHandler((req, res) => {
  const removed = measurementRepo.remove(Number(req.params.id));
  if (!removed) throw new NotFoundError('记录不存在');
  res.json({ deleted: true, id: Number(req.params.id) });
}));

router.get('/api/progress/today', asyncHandler((req, res) => {
  res.json({ date: today() });
}));

module.exports = router;
