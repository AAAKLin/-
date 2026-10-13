'use strict';

const express = require('express');
const dietService = require('../services/dietService');
const foodRepo = require('../repositories/foodRepo');
const { Validator } = require('../lib/validate');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError } = require('../errors');
const { today } = require('../lib/dates');

const router = express.Router();

const FOOD_FIELDS = (v) => v
  .string('name', { required: true, min: 1, max: 60 })
  .string('category', {
    allowed: ['staple', 'protein', 'dairy', 'vegetable', 'fruit', 'fat', 'condiment', 'supplement', 'other'],
    default: 'other',
  })
  .string('servingLabel', { max: 40, default: '100 克' })
  .number('servingGrams', { min: 1, max: 2000, default: 100 })
  .number('kcal', { min: 0, max: 1000, default: 0 })
  .number('protein', { min: 0, max: 100, default: 0 })
  .number('fat', { min: 0, max: 100, default: 0 })
  .number('carb', { min: 0, max: 100, default: 0 })
  .boolean('isEstimate', { default: false })
  .boolean('budgetFriendly', { default: false });

router.get('/api/diet/day', asyncHandler((req, res) => {
  const { date } = new Validator(req.query).date('date').done();
  res.json(dietService.daySummary(date || today()));
}));

router.post('/api/diet/entries', asyncHandler((req, res) => {
  const data = new Validator(req.body)
    .date('date', { required: true })
    .string('meal', { allowed: ['breakfast', 'lunch', 'dinner', 'snack'], default: 'snack' })
    .string('entryType', { allowed: ['food', 'recipe'], default: 'food' })
    .number('refId', { required: true, integer: true, min: 1 })
    .number('servings', { min: 0.01, max: 50 })
    .number('grams', { min: 1, max: 5000 })
    .done();
  res.status(201).json(dietService.addEntry(data));
}));

router.put('/api/diet/entries/:id', asyncHandler((req, res) => {
  const data = new Validator(req.body)
    .date('date')
    .string('meal', { allowed: ['breakfast', 'lunch', 'dinner', 'snack'] })
    .number('servings', { min: 0.01, max: 50 })
    .number('grams', { min: 1, max: 5000 })
    .done();
  res.json(dietService.updateEntry(Number(req.params.id), data));
}));

router.delete('/api/diet/entries/:id', asyncHandler((req, res) => {
  const removed = dietService.deleteEntry(Number(req.params.id));
  if (!removed) throw new NotFoundError('饮食记录不存在');
  res.json({ deleted: true, id: Number(req.params.id) });
}));

router.get('/api/diet/foods', asyncHandler((req, res) => {
  const { q, category, budgetOnly } = new Validator(req.query)
    .string('q', { max: 40 })
    .string('category', { max: 40 })
    .boolean('budgetOnly', { default: false })
    .done();
  res.json({ items: foodRepo.listFoods({ q, category, budgetOnly }) });
}));

router.post('/api/diet/foods', asyncHandler((req, res) => {
  const data = FOOD_FIELDS(new Validator(req.body)).done();
  res.status(201).json(foodRepo.createFood(data));
}));

router.put('/api/diet/foods/:id', asyncHandler((req, res) => {
  const data = FOOD_FIELDS(new Validator(req.body).string('name', { min: 1, max: 60 })).done();
  const updated = foodRepo.updateFood(Number(req.params.id), data);
  if (!updated) throw new NotFoundError('食物不存在');
  res.json(updated);
}));

router.delete('/api/diet/foods/:id', asyncHandler((req, res) => {
  const removed = foodRepo.deleteFood(Number(req.params.id));
  if (!removed) throw new NotFoundError('食物不存在');
  res.json({ deleted: true, id: Number(req.params.id) });
}));

router.get('/api/diet/recipes', asyncHandler((req, res) => {
  res.json({ items: foodRepo.listRecipes() });
}));

router.post('/api/diet/recipes', asyncHandler((req, res) => {
  const data = new Validator(req.body)
    .string('name', { required: true, min: 1, max: 60 })
    .number('servings', { min: 0.5, max: 20, default: 1 })
    .string('note', { max: 300 })
    .done();
  const items = Array.isArray(req.body.items) ? req.body.items.map((i) => ({ foodId: Number(i.foodId), grams: Number(i.grams) })) : [];
  res.status(201).json(foodRepo.createRecipe({ ...data, items }));
}));

router.put('/api/diet/recipes/:id', asyncHandler((req, res) => {
  const data = new Validator(req.body)
    .string('name', { min: 1, max: 60 })
    .number('servings', { min: 0.5, max: 20 })
    .string('note', { max: 300 })
    .done();
  const items = Array.isArray(req.body.items) ? req.body.items.map((i) => ({ foodId: Number(i.foodId), grams: Number(i.grams) })) : undefined;
  const updated = foodRepo.updateRecipe(Number(req.params.id), { ...data, ...(items ? { items } : {}) });
  if (!updated) throw new NotFoundError('食谱不存在');
  res.json(updated);
}));

router.delete('/api/diet/recipes/:id', asyncHandler((req, res) => {
  const removed = foodRepo.deleteRecipe(Number(req.params.id));
  if (!removed) throw new NotFoundError('食谱不存在');
  res.json({ deleted: true, id: Number(req.params.id) });
}));

router.get('/api/diet/suggestions', asyncHandler((req, res) => {
  const { date } = new Validator(req.query).date('date').done();
  res.json(dietService.menuSuggestions(date || today()));
}));

router.post('/api/diet/suggestions/apply', asyncHandler((req, res) => {
  const data = new Validator(req.body)
    .date('date', { required: true })
    .string('meal', { required: true, allowed: ['breakfast', 'lunch', 'dinner', 'snack'] })
    .done();
  res.status(201).json({ created: dietService.addMealFromSuggestion(data) });
}));

module.exports = router;
