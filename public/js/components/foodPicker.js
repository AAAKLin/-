/**
 * 食物/食谱选择器：搜索 → 选份量 → 写入某餐次。
 * 首页与饮食页共用，避免重复实现。
 */

import { api } from '../api.js';
import { escapeHtml, openModal, closeModal, toast, num } from '../dom.js';

const MEALS = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' },
];

export async function openFoodPicker({ date, meal = 'breakfast', onAdded }) {
  const [foodRes, recipeRes] = await Promise.all([
    api.get('/api/diet/foods?limit=300'),
    api.get('/api/diet/recipes'),
  ]);
  const foods = foodRes.items;
  const recipes = recipeRes.items;

  const mealOptions = MEALS.map((m) => `<option value="${m.key}" ${m.key === meal ? 'selected' : ''}>${m.label}</option>`).join('');

  openModal({
    title: '添加食物 / 食谱',
    body: `
      <div class="field">
        <label for="fp-search">搜索（支持名称关键字）</label>
        <input class="input" id="fp-search" placeholder="例如：鸡蛋、米饭、豆腐" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="fp-meal">餐次</label>
          <select class="select" id="fp-meal">${mealOptions}</select>
        </div>
        <div class="field">
          <label for="fp-amount">份量（克 或 份）</label>
          <div class="inline">
            <input class="input" id="fp-amount" type="number" min="1" step="1" placeholder="按克" />
            <select class="select" id="fp-unit" style="width:110px">
              <option value="grams">克</option>
              <option value="servings">份</option>
            </select>
          </div>
        </div>
      </div>
      <div class="section-title">食物库</div>
      <div class="list" id="fp-food-list" style="max-height:260px;overflow:auto"></div>
      <div class="section-title">我的食谱</div>
      <div class="list" id="fp-recipe-list" style="max-height:180px;overflow:auto"></div>
    `,
    onMount(root) {
      const search = root.querySelector('#fp-search');
      const foodList = root.querySelector('#fp-food-list');
      const recipeList = root.querySelector('#fp-recipe-list');
      let selected = null; // {type:'food'|'recipe', id, name, defaultGrams}

      function renderFoods() {
        const q = search.value.trim();
        const filtered = q ? foods.filter((f) => f.name.includes(q)) : foods;
        if (filtered.length === 0) {
          foodList.innerHTML = '<div class="empty">没有匹配的食物，可到饮食页「常用食物」里新建。</div>';
          return;
        }
        foodList.innerHTML = filtered.slice(0, 60).map((f) => `
          <div class="list-item">
            <div>
              <div class="title">${escapeHtml(f.name)} ${f.isEstimate ? '<span class="chip chip-warn">估算值</span>' : ''}</div>
              <div class="sub">每 100 克：${num(f.kcal)} 千卡 · 蛋白 ${num(f.protein, 1)} 克 · 脂肪 ${num(f.fat, 1)} 克 · 碳水 ${num(f.carb, 1)} 克</div>
            </div>
            <div class="right">
              <button class="btn btn-sm" type="button" data-pick="food" data-id="${f.id}" data-name="${escapeHtml(f.name)}" data-grams="${f.servingGrams}">选择</button>
            </div>
          </div>
        `).join('');
      }

      function renderRecipes() {
        if (recipes.length === 0) {
          recipeList.innerHTML = '<div class="empty">还没有食谱，可在饮食页新建。</div>';
          return;
        }
        recipeList.innerHTML = recipes.map((r) => `
          <div class="list-item">
            <div>
              <div class="title">${escapeHtml(r.name)} · ${num(r.servings, 1)} 份</div>
              <div class="sub">每份约 ${num(r.nutrition.perServing.kcal)} 千卡 · 蛋白 ${num(r.nutrition.perServing.protein, 1)} 克</div>
            </div>
            <div class="right">
              <button class="btn btn-sm" type="button" data-pick="recipe" data-id="${r.id}" data-name="${escapeHtml(r.name)}" data-grams="${num(r.nutrition.gramsPerServing, 0)}">选择</button>
            </div>
          </div>
        `).join('');
      }

      function refreshSelection() {
        const hint = root.querySelector('#fp-selection');
        if (selected) {
          hint.innerHTML = `已选择：<strong>${escapeHtml(selected.name)}</strong>（默认 ${selected.defaultGrams} 克），可直接点「加入记录」。`;
        } else {
          hint.innerHTML = '<span class="text-muted">先从上方列表里选择一个食物或食谱。</span>';
        }
      }

      const hint = document.createElement('div');
      hint.id = 'fp-selection';
      hint.className = 'text-sm';
      root.querySelector('.modal-body').insertBefore(hint, foodList);
      refreshSelection();

      search.addEventListener('input', renderFoods);

      root.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-pick]');
        if (!btn) return;
        selected = {
          type: btn.dataset.pick,
          id: Number(btn.dataset.id),
          name: btn.dataset.name,
          defaultGrams: Number(btn.dataset.grams) || 100,
        };
        root.querySelector('#fp-amount').value = selected.defaultGrams;
        root.querySelector('#fp-unit').value = 'grams';
        refreshSelection();
      });

      const footer = document.createElement('div');
      footer.className = 'modal-foot';
      footer.innerHTML = `
        <button class="btn btn-ghost" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="button" id="fp-submit">加入记录</button>
      `;
      root.querySelector('.modal').appendChild(footer);

      footer.querySelector('#fp-submit').addEventListener('click', async () => {
        if (!selected) {
          toast('请先选择一个食物或食谱');
          return;
        }
        const amount = Number(root.querySelector('#fp-amount').value);
        if (!Number.isFinite(amount) || amount <= 0) {
          toast('请填写大于 0 的份量');
          return;
        }
        const unit = root.querySelector('#fp-unit').value;
        const mealKey = root.querySelector('#fp-meal').value;
        try {
          await api.post('/api/diet/entries', {
            date,
            meal: mealKey,
            entryType: selected.type,
            refId: selected.id,
            ...(unit === 'grams' ? { grams: amount } : { servings: amount }),
          });
          toast('已加入记录', 'success');
          closeModal();
          if (onAdded) onAdded();
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      renderFoods();
      renderRecipes();
    },
  });
}
