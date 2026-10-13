'use strict';

const express = require('express');
const profileService = require('../services/profileService');
const { Validator } = require('../lib/validate');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get('/api/profile', asyncHandler((req, res) => {
  res.json(profileService.getProfile());
}));

router.put('/api/profile', asyncHandler((req, res) => {
  const data = new Validator(req.body)
    .string('displayName', { max: 40 })
    .string('sex', { allowed: ['male', 'female'] })
    .number('age', { min: 10, max: 100, integer: true })
    .number('heightCm', { min: 100, max: 250 })
    .number('weightKg', { min: 30, max: 300 })
    .string('activityLevel', { allowed: ['sedentary', 'light', 'moderate', 'high'] })
    .string('goal', { allowed: ['fat_loss', 'recomp', 'maintain'] })
    .string('experience', { allowed: ['beginner', 'intermediate'] })
    .number('availableDays', { min: 1, max: 6, integer: true })
    .number('sessionMinutes', { min: 15, max: 120, integer: true })
    .string('equipment', { allowed: ['none', 'band', 'dumbbell', 'chair'] })
    .string('limitations', { max: 300 })
    .string('budgetLevel', { allowed: ['low', 'medium', 'high'] })
    .number('targetKcal', { min: 800, max: 6000 })
    .number('targetProtein', { min: 20, max: 400 })
    .number('targetFat', { min: 10, max: 300 })
    .number('targetCarb', { min: 20, max: 800 })
    .string('targetSource', { allowed: ['auto', 'manual'] })
    .done();

  res.json(profileService.updateProfile(data));
}));

router.post('/api/profile/targets/recompute', asyncHandler((req, res) => {
  res.json(profileService.recomputeTargets());
}));

module.exports = router;
