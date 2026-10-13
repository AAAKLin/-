/**
 * 饮食页：每日摄入记录、目标对比、建议菜单、常用食物与食谱管理。
 * 建议菜单与实际记录严格分离，只有点「记到今天」才会写入实际摄入。
 */

import { api } from '../api.js';
import {
  escapeHtml, onAction, toast, openModal, closeModal, confirmDialog, bar, num,
} from '../dom.js';
import { openFoodPicker } from '../components/foodPicker.js';

const MEALS = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' },
];

const state = {
  day: null,
  foods: [],
  recipes: [],
  suggestions: null,
};

function macroRow(label, item, unit) {
  const percent = item.percent;
  const status = percent === null ? 'primary' : item.status === 'over' ? 'danger' : item.status === 'low' ? 'warn' : 'success';
  const digits = unit === '千卡' ? 0 : 1;
  const valueText = percent === null
    ? '未设置目标（先在档案里补全身高体重）'
    : `${num(item.actual, digits)} / ${num(item.target, digits)} ${unit}（${percent}%）`;
  return `
    <div class="macro-row">
      <div class="macro-head"><span>${label}</span><span class="macro-value">${valueText}</span></div>
      ${bar(percent, status)}
    </div>
  `;
}

function entryRow(entry) {
  return `
    <div class="list-item" data-entry-id="${entry.id}">
      <div style="flex:1;min-width:0">
        <div class="title">${escapeHtml(entry.label)} ${entry.isEstimate ? '<span class="chip chip-warn">估算</span>' : ''}</div>
        <div class="sub">${num(entry.kcal)} 千卡 · 蛋白 ${num(entry.protein, 1)} · 脂肪 ${num(entry.fat, 1)} · 碳水 ${num(entry.carb, 1)}</div>
      </div>
      <div class="right">
        <input class="input entry-grams" type="number" min="1" step="1" value="${num(entry.grams, 0)}" style="width:88px" title="克数" />
        <button class="btn btn-sm" data-action="update-entry" data-id="${entry.id}" type="button">更新</button>
        <button class="btn btn-ghost btn-sm" data-action="delete-entry" data-id="${entry.id}" type="button">删除</button>
      </div>
    </div>
  `;
}

function mealCard(meal, day) {
  const entries = day.entries.filter((e) => e.meal === meal.key);
  const totals = day.byMeal.find((m) => m.key === meal.key)?.totals || { kcal: 0, protein: 0 };
  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">${meal.label}</h3>
        <span class="card-hint">${num(totals.kcal)} 千卡 · 蛋白 ${num(totals.protein, 1)} 克</span>
      </div>
      ${entries.length ? `<div class="list">${entries.map(entryRow).join('')}</div>`
        : '<p class="empty">这一餐还没有记录（不代表没吃）</p>'}
      <div class="card-actions" style="margin-top:10px">
        <button class="btn btn-sm" data-action="add-entry" data-meal="${meal.key}" type="button">添加食物</button>
      </div>
    </section>
  `;
}

function suggestionCard() {
  const s = state.suggestions;
  if (!s) return '';
  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">建议菜单（参考模板）</h3>
        <span class="card-hint">合计 ${num(s.totals.kcal)} 千卡 · 蛋白 ${num(s.totals.protein, 1)} 克${s.budgetMode ? ' · 平价优先' : ''}</span>
      </div>
      <div class="stack">
        ${s.meals.map((m) => `
          <div class="list-item" style="align-items:flex-start">
            <div style="flex:1">
              <div class="title">${m.label} · 约 ${num(m.totals.kcal)} 千卡</div>
              <div class="sub">${m.items.map((i) => `${escapeHtml(i.foodName)} ${i.grams}克`).join('、') || '（无）'}</div>
            </div>
            <div class="right">
              <button class="btn btn-sm" data-action="apply-meal" data-meal="${m.key}" type="button">记到今天</button>
            </div>
          </div>
        `).join('')}
      </div>
      <p class="quote">${escapeHtml(s.note)}</p>
    </section>
  `;
}

function foodsCard() {
  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">常用食物（共 ${state.foods.length} 项）</h3>
        <button class="btn btn-sm" data-action="new-food" type="button">新建食物</button>
      </div>
      <div class="list" style="max-height:320px;overflow:auto">
        ${state.foods.slice(0, 60).map((f) => `
          <div class="list-item">
            <div>
              <div class="title">${escapeHtml(f.name)} ${f.isEstimate ? '<span class="chip chip-warn">估算</span>' : ''} ${f.budgetFriendly ? '<span class="chip chip-success">平价</span>' : ''}</div>
              <div class="sub">每 100 克：${num(f.kcal)} 千卡 · 蛋白 ${num(f.protein, 1)} · 脂肪 ${num(f.fat, 1)} · 碳水 ${num(f.carb, 1)} ｜ 一份 ${escapeHtml(f.servingLabel)} = ${num(f.servingGrams, 0)} 克</div>
            </div>
            <div class="right">
              <button class="btn btn-sm" data-action="edit-food" data-id="${f.id}" type="button">编辑</button>
              <button class="btn btn-ghost btn-sm" data-action="delete-food" data-id="${f.id}" type="button">删除</button>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function recipesCard() {
  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">我的食谱（${state.recipes.length}）</h3>
        <button class="btn btn-sm" data-action="new-recipe" type="button">新建食谱</button>
      </div>
      <div class="list">
        ${state.recipes.length ? state.recipes.map((r) => `
          <div class="list-item" style="align-items:flex-start">
            <div style="flex:1">
              <div class="title">${escapeHtml(r.name)} · ${num(r.servings, 1)} 份</div>
              <div class="sub">每份：${num(r.nutrition.perServing.kcal)} 千卡 · 蛋白 ${num(r.nutrition.perServing.protein, 1)} · 脂肪 ${num(r.nutrition.perServing.fat, 1)} · 碳水 ${num(r.nutrition.perServing.carb, 1)}</div>
              <div class="sub">食材：${r.items.map((i) => `${escapeHtml(i.food.name)} ${num(i.grams, 0)}克`).join('、') || '（无）'}</div>
            </div>
            <div class="right">
              <button class="btn btn-sm" data-action="log-recipe" data-id="${r.id}" type="button">记一份</button>
              <button class="btn btn-ghost btn-sm" data-action="edit-recipe" data-id="${r.id}" type="button">编辑</button>
              <button class="btn btn-ghost btn-sm" data-action="delete-recipe" data-id="${r.id}" type="button">删除</button>
            </div>
          </div>
        `).join('') : '<p class="empty">还没有食谱，点「新建食谱」把常吃的组合存下来。</p>'}
      </div>
    </section>
  `;
}

function template() {
  const day = state.day;
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">${day.date} 营养总览</h3>
          <p class="card-hint">目标来源：${day.targets.source === 'manual' ? '手动设置' : '自动估算'} · ${day.entryCount} 条记录</p>
        </div>
        <button class="btn btn-primary btn-sm" data-action="add-entry" data-meal="snack" type="button">添加食物</button>
      </div>
      ${macroRow('热量', day.comparison.kcal, '千卡')}
      ${macroRow('蛋白质', day.comparison.protein, '克')}
      ${macroRow('脂肪', day.comparison.fat, '克')}
      ${macroRow('碳水', day.comparison.carb, '克')}
      ${day.hasEstimate ? '<p class="quote">含估算值，可在下方「常用食物」中修正具体数值。</p>' : ''}
    </section>

    <div class="grid">
      ${MEALS.map((m) => mealCard(m, day)).join('')}
    </div>

    <div class="grid">
      ${suggestionCard()}
      ${recipesCard()}
    </div>

    ${foodsCard()}
  `;
}

/* ---------------- 弹窗 ---------------- */

function foodFormModal(food, onSaved) {
  const isEdit = Boolean(food);
  openModal({
    title: isEdit ? '编辑食物' : '新建食物',
    body: `
      <div class="field">
        <label for="f-name">名称</label>
        <input class="input" id="f-name" value="${food ? escapeHtml(food.name) : ''}" placeholder="例如：自制鸡胸肉" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-category">类别</label>
          <select class="select" id="f-category">
            ${[['staple', '主食'], ['protein', '蛋白类'], ['dairy', '奶类'], ['vegetable', '蔬菜'], ['fruit', '水果'], ['fat', '油脂坚果'], ['condiment', '调味'], ['supplement', '补剂'], ['other', '其他']]
              .map(([v, l]) => `<option value="${v}" ${food?.category === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-serving-label">一份的描述</label>
          <input class="input" id="f-serving-label" value="${food ? escapeHtml(food.servingLabel) : '100 克'}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-serving-grams">一份等于多少克</label>
          <input class="input" id="f-serving-grams" type="number" min="1" step="1" value="${food ? food.servingGrams : 100}" />
        </div>
        <div class="field">
          <label for="f-kcal">每 100 克热量（千卡）</label>
          <input class="input" id="f-kcal" type="number" min="0" step="1" value="${food ? food.kcal : 0}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label for="f-protein">每 100 克蛋白质（克）</label><input class="input" id="f-protein" type="number" min="0" step="0.1" value="${food ? food.protein : 0}" /></div>
        <div class="field"><label for="f-fat">每 100 克脂肪（克）</label><input class="input" id="f-fat" type="number" min="0" step="0.1" value="${food ? food.fat : 0}" /></div>
      </div>
      <div class="field">
        <label for="f-carb">每 100 克碳水（克）</label>
        <input class="input" id="f-carb" type="number" min="0" step="0.1" value="${food ? food.carb : 0}" />
      </div>
      <label class="inline text-sm"><input type="checkbox" id="f-estimate" ${food?.isEstimate ? 'checked' : ''} /> 营养值是估算值</label>
      <label class="inline text-sm"><input type="checkbox" id="f-budget" ${food?.budgetFriendly ? 'checked' : ''} /> 平价食材</label>
    `,
    footer: `
      <button class="btn btn-ghost" data-action="close-modal" type="button">取消</button>
      <button class="btn btn-primary" data-action="save-food" type="button">保存</button>
    `,
    onMount(root) {
      root.querySelector('[data-action="save-food"]').addEventListener('click', async () => {
        const payload = {
          name: root.querySelector('#f-name').value.trim(),
          category: root.querySelector('#f-category').value,
          servingLabel: root.querySelector('#f-serving-label').value.trim() || '100 克',
          servingGrams: Number(root.querySelector('#f-serving-grams').value),
          kcal: Number(root.querySelector('#f-kcal').value),
          protein: Number(root.querySelector('#f-protein').value),
          fat: Number(root.querySelector('#f-fat').value),
          carb: Number(root.querySelector('#f-carb').value),
          isEstimate: root.querySelector('#f-estimate').checked,
          budgetFriendly: root.querySelector('#f-budget').checked,
        };
        try {
          if (isEdit) await api.put(`/api/diet/foods/${food.id}`, payload);
          else await api.post('/api/diet/foods', payload);
          toast('已保存', 'success');
          closeModal();
          onSaved();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  });
}

function recipeFormModal(recipe, foods, onSaved) {
  const isEdit = Boolean(recipe);
  const items = recipe?.items || [{ foodId: foods[0]?.id, grams: 100 }];
  openModal({
    title: isEdit ? '编辑食谱' : '新建食谱',
    body: `
      <div class="field-row">
        <div class="field">
          <label for="r-name">名称</label>
          <input class="input" id="r-name" value="${recipe ? escapeHtml(recipe.name) : ''}" placeholder="例如：鸡胸肉饭" />
        </div>
        <div class="field">
          <label for="r-servings">份数</label>
          <input class="input" id="r-servings" type="number" min="0.5" step="0.5" value="${recipe ? recipe.servings : 1}" />
        </div>
      </div>
      <div class="field">
        <label for="r-note">备注（可留空）</label>
        <input class="input" id="r-note" value="${recipe ? escapeHtml(recipe.note || '') : ''}" />
      </div>
      <div class="section-title">食材</div>
      <div class="stack" id="r-items">
        ${items.map((item) => `
          <div class="inline r-item">
            <select class="select r-food" style="flex:2">
              ${foods.map((f) => `<option value="${f.id}" ${f.id === item.foodId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}
            </select>
            <input class="input r-grams" type="number" min="1" step="1" value="${num(item.grams, 0)}" style="width:100px" />
            <button class="btn btn-ghost btn-sm r-remove" type="button">移除</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-sm" id="r-add-item" type="button">添加食材</button>
    `,
    footer: `
      <button class="btn btn-ghost" data-action="close-modal" type="button">取消</button>
      <button class="btn btn-primary" data-action="save-recipe" type="button">保存</button>
    `,
    onMount(root) {
      const container = root.querySelector('#r-items');
      container.addEventListener('click', (event) => {
        if (event.target.classList.contains('r-remove')) {
          if (container.querySelectorAll('.r-item').length <= 1) return;
          event.target.closest('.r-item').remove();
        }
      });
      root.querySelector('#r-add-item').addEventListener('click', () => {
        const div = document.createElement('div');
        div.className = 'inline r-item';
        div.innerHTML = `
          <select class="select r-food" style="flex:2">
            ${foods.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}
          </select>
          <input class="input r-grams" type="number" min="1" step="1" value="100" style="width:100px" />
          <button class="btn btn-ghost btn-sm r-remove" type="button">移除</button>
        `;
        container.appendChild(div);
      });
      root.querySelector('[data-action="save-recipe"]').addEventListener('click', async () => {
        const payload = {
          name: root.querySelector('#r-name').value.trim(),
          servings: Number(root.querySelector('#r-servings').value),
          note: root.querySelector('#r-note').value.trim(),
          items: [...container.querySelectorAll('.r-item')].map((row) => ({
            foodId: Number(row.querySelector('.r-food').value),
            grams: Number(row.querySelector('.r-grams').value),
          })),
        };
        try {
          if (isEdit) await api.put(`/api/diet/recipes/${recipe.id}`, payload);
          else await api.post('/api/diet/recipes', payload);
          toast('已保存', 'success');
          closeModal();
          onSaved();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  });
}

/* ---------------- 页面 ---------------- */

async function load(ctx) {
  const [day, foodsRes, recipesRes, suggestions] = await Promise.all([
    api.get(`/api/diet/day?date=${ctx.date}`),
    api.get('/api/diet/foods?limit=300'),
    api.get('/api/diet/recipes'),
    api.get(`/api/diet/suggestions?date=${ctx.date}`),
  ]);
  state.day = day;
  state.foods = foodsRes.items;
  state.recipes = recipesRes.items;
  state.suggestions = suggestions;
}

export async function renderDiet(container, ctx) {
  container.innerHTML = '<div class="loading">正在加载饮食数据…</div>';
  await load(ctx);

  const refresh = async () => {
    await load(ctx);
    container.innerHTML = template();
  };

  onAction(container, {
    'add-entry': (target) => {
      openFoodPicker({ date: ctx.date, meal: target.dataset.meal, onAdded: refresh });
    },
    'update-entry': async (target) => {
      const id = Number(target.dataset.id);
      const row = container.querySelector(`[data-entry-id="${id}"]`);
      const grams = Number(row.querySelector('.entry-grams').value);
      if (!Number.isFinite(grams) || grams <= 0) {
        toast('请填写大于 0 的克数');
        return;
      }
      try {
        await api.put(`/api/diet/entries/${id}`, { grams });
        toast('已更新并重新计算', 'success');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'delete-entry': async (target) => {
      if (!confirmDialog('删除这条饮食记录？')) return;
      try {
        await api.del(`/api/diet/entries/${target.dataset.id}`);
        toast('已删除');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'apply-meal': async (target) => {
      try {
        await api.post('/api/diet/suggestions/apply', { date: ctx.date, meal: target.dataset.meal });
        toast('已写入实际摄入', 'success');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'log-recipe': async (target) => {
      try {
        await api.post('/api/diet/entries', { date: ctx.date, meal: 'lunch', entryType: 'recipe', refId: Number(target.dataset.id), servings: 1 });
        toast('已记录 1 份', 'success');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'new-food': () => foodFormModal(null, refresh),
    'edit-food': (target) => {
      const food = state.foods.find((f) => f.id === Number(target.dataset.id));
      if (food) foodFormModal(food, refresh);
    },
    'delete-food': async (target) => {
      if (!confirmDialog('删除该食物？已记录的饮食不受影响，但食谱中的该食材会被移除。')) return;
      try {
        await api.del(`/api/diet/foods/${target.dataset.id}`);
        toast('已删除');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'new-recipe': () => recipeFormModal(null, state.foods, refresh),
    'edit-recipe': (target) => {
      const recipe = state.recipes.find((r) => r.id === Number(target.dataset.id));
      if (recipe) recipeFormModal(recipe, state.foods, refresh);
    },
    'delete-recipe': async (target) => {
      if (!confirmDialog('删除该食谱？')) return;
      try {
        await api.del(`/api/diet/recipes/${target.dataset.id}`);
        toast('已删除');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });

  container.innerHTML = template();
}
