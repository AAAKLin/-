'use strict';

const { getDb } = require('../db');
const { toCamel } = require('../lib/rows');
const { computeRecipeNutrition } = require('../services/nutrition');

const FOOD_COLUMNS = [
  'id', 'name', 'category', 'serving_label', 'serving_grams', 'kcal', 'protein', 'fat', 'carb',
  'is_estimate', 'budget_friendly', 'origin', 'created_at', 'updated_at',
];

function hydrateFood(row) {
  if (!row) return null;
  const food = toCamel(row);
  return { ...food, isEstimate: food.isEstimate === 1, budgetFriendly: food.budgetFriendly === 1 };
}

function listFoods({ q, category, limit = 200, budgetOnly = false } = {}) {
  const where = [];
  const params = [];
  if (q) { where.push('name LIKE ?'); params.push(`%${q}%`); }
  if (category) { where.push('category = ?'); params.push(category); }
  if (budgetOnly) where.push('budget_friendly = 1');
  const sql = `SELECT ${FOOD_COLUMNS.join(', ')} FROM foods
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY (origin = 'seed') DESC, name ASC LIMIT ?`;
  return getDb().prepare(sql).all(...params, limit).map(hydrateFood);
}

function findFood(id) {
  return hydrateFood(getDb().prepare(`SELECT ${FOOD_COLUMNS.join(', ')} FROM foods WHERE id = ?`).get(id));
}

function createFood(data) {
  const now = new Date().toISOString();
  const info = getDb().prepare(`
    INSERT INTO foods (name, category, serving_label, serving_grams, kcal, protein, fat, carb, is_estimate, budget_friendly, origin, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)
  `).run(
    data.name,
    data.category || 'other',
    data.servingLabel || '100 克',
    data.servingGrams ?? 100,
    data.kcal ?? 0,
    data.protein ?? 0,
    data.fat ?? 0,
    data.carb ?? 0,
    data.isEstimate ? 1 : 0,
    data.budgetFriendly ? 1 : 0,
    now,
    now,
  );
  return findFood(Number(info.lastInsertRowid));
}

function updateFood(id, patch) {
  const map = {
    name: 'name', category: 'category', servingLabel: 'serving_label', servingGrams: 'serving_grams',
    kcal: 'kcal', protein: 'protein', fat: 'fat', carb: 'carb',
    isEstimate: 'is_estimate', budgetFriendly: 'budget_friendly',
  };
  const fields = [];
  const values = [];
  for (const [key, column] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(typeof patch[key] === 'boolean' ? (patch[key] ? 1 : 0) : patch[key]);
    }
  }
  if (fields.length === 0) return findFood(id);
  values.push(id);
  getDb().prepare(`UPDATE foods SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`)
    .run(...values.slice(0, -1), new Date().toISOString(), id);
  return findFood(id);
}

function deleteFood(id) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM recipe_items WHERE food_id = ?').run(id);
    const info = db.prepare('DELETE FROM foods WHERE id = ?').run(id);
    db.exec('COMMIT');
    return info.changes > 0;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function recipeItems(recipeId) {
  return getDb()
    .prepare(`
      SELECT recipe_items.id, recipe_items.grams, ${FOOD_COLUMNS.map((c) => `foods.${c}`).join(', ')}
      FROM recipe_items JOIN foods ON foods.id = recipe_items.food_id
      WHERE recipe_items.recipe_id = ? ORDER BY recipe_items.id
    `)
    .all(recipeId)
    .map((row) => ({
      id: row.id,
      grams: row.grams,
      food: hydrateFood({
        id: row.id,
        name: row.name,
        category: row.category,
        serving_label: row.serving_label,
        serving_grams: row.serving_grams,
        kcal: row.kcal,
        protein: row.protein,
        fat: row.fat,
        carb: row.carb,
        is_estimate: row.is_estimate,
        budget_friendly: row.budget_friendly,
        origin: row.origin,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }),
    }));
}

/** 食谱附带计算好的营养（每份 / 合计） */
function hydrateRecipe(row) {
  if (!row) return null;
  const recipe = toCamel(row);
  const items = recipeItems(recipe.id);
  const nutrition = computeRecipeNutrition({ items, servings: recipe.servings });
  return { ...recipe, items, nutrition };
}

function listRecipes() {
  return getDb()
    .prepare('SELECT id, name, servings, note, origin, created_at, updated_at FROM recipes ORDER BY (origin = \'seed\') DESC, name')
    .all()
    .map(hydrateRecipe);
}

function findRecipe(id) {
  const row = getDb().prepare('SELECT id, name, servings, note, origin, created_at, updated_at FROM recipes WHERE id = ?').get(id);
  return hydrateRecipe(row);
}

function createRecipe({ name, servings = 1, note = '', items = [] }) {
  const db = getDb();
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const info = db.prepare("INSERT INTO recipes (name, servings, note, origin, created_at, updated_at) VALUES (?, ?, ?, 'user', ?, ?)")
      .run(name, servings, note, now, now);
    const recipeId = Number(info.lastInsertRowid);
    const insertItem = db.prepare('INSERT INTO recipe_items (recipe_id, food_id, grams) VALUES (?, ?, ?)');
    for (const item of items) insertItem.run(recipeId, item.foodId, item.grams);
    db.exec('COMMIT');
    return findRecipe(recipeId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function updateRecipe(id, patch) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const fields = [];
    const values = [];
    if (patch.name !== undefined) { fields.push('name = ?'); values.push(patch.name); }
    if (patch.servings !== undefined) { fields.push('servings = ?'); values.push(patch.servings); }
    if (patch.note !== undefined) { fields.push('note = ?'); values.push(patch.note); }
    if (fields.length > 0) {
      db.prepare(`UPDATE recipes SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...values, new Date().toISOString(), id);
    }
    if (patch.items) {
      db.prepare('DELETE FROM recipe_items WHERE recipe_id = ?').run(id);
      const insertItem = db.prepare('INSERT INTO recipe_items (recipe_id, food_id, grams) VALUES (?, ?, ?)');
      for (const item of patch.items) insertItem.run(id, item.foodId, item.grams);
    }
    db.exec('COMMIT');
    return findRecipe(id);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function deleteRecipe(id) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM recipe_items WHERE recipe_id = ?').run(id);
    const info = db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
    db.exec('COMMIT');
    return info.changes > 0;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = {
  listFoods, findFood, createFood, updateFood, deleteFood,
  listRecipes, findRecipe, createRecipe, updateRecipe, deleteRecipe,
};
