/**
 * 训练页：本周计划、快速/详细记录、规则化调整建议、历史记录。
 * 计划值自动预填，只有实际表现不同时才需要编辑。
 * 事件只绑定一次（事件委托），后续刷新仅替换内容。
 */

import { api } from '../api.js';
import { escapeHtml, onAction, toast, confirmDialog, weekdayShort } from '../dom.js';

const STATUS_LABEL = {
  completed: '已完成',
  partial: '部分完成',
  skipped: '今天没练',
  not_recorded: '未记录',
};

const DIFFICULTY_OPTIONS = [
  [1, '1 很轻松'], [2, '2 轻松'], [3, '3 适中'], [4, '4 有点吃力'], [5, '5 很吃力'],
];

const state = {
  weekStart: null,
  days: [],
  selectedDayIndex: 0,
  logsByDate: new Map(),
  suggestions: [],
  history: [],
  todayKey: null,
};

function dateOfDayIndex(weekStart, dayIndex) {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + dayIndex);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayIndexFromDate(weekStart, date) {
  const a = new Date(`${weekStart}T00:00:00`).getTime();
  const b = new Date(`${date}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

function statusChip(status) {
  const map = {
    completed: 'chip-success',
    partial: 'chip-warn',
    skipped: 'chip-muted',
    not_recorded: 'chip-muted',
  };
  return `<span class="chip ${map[status] || 'chip-muted'}">${STATUS_LABEL[status] || '未记录'}</span>`;
}

function daySelector() {
  return `
    <div class="day-selector">
      ${state.days.map((day) => {
        const status = state.logsByDate.get(day.date)?.status || (day.restDay ? 'rest' : 'not_recorded');
        const dotClass = status === 'completed' ? 'dot-success' : status === 'partial' ? 'dot-warn' : 'dot-muted';
        const isToday = day.date === state.todayKey;
        return `
          <button class="day-btn ${day.dayIndex === state.selectedDayIndex ? 'active' : ''} ${isToday ? 'today' : ''}"
            data-action="select-day" data-index="${day.dayIndex}" type="button">
            <span class="dow">${weekdayShort(day.dayIndex)}</span>
            <span class="status-dot dot ${dotClass}"></span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function exerciseBlock(item, logItem) {
  const isTime = item.exercise.isTimeBased;
  const done = logItem ? logItem.done : false;
  const actualSets = logItem?.actualSets ?? item.targetSets;
  const actualReps = logItem?.actualReps ?? item.targetReps;
  const actualDuration = logItem?.actualDurationSec ?? item.targetDurationSec;
  const difficulty = logItem?.difficulty ?? '';
  const discomfort = logItem?.discomfort ?? '';
  const amountValue = isTime ? (actualDuration ?? '') : (actualReps ?? '');

  return `
    <div class="exercise" data-exercise-id="${item.exercise.id}" data-plan-item-id="${item.id}" data-time="${isTime ? 1 : 0}">
      <div class="exercise-head">
        <div>
          <div class="exercise-name">${escapeHtml(item.exercise.name)}</div>
          <div class="exercise-target">计划：${
            isTime ? `${item.targetDurationSec} 秒` : `${item.targetSets} 组 × ${item.targetReps} 次`
          } · 组间休息 ${item.restSec} 秒</div>
        </div>
        <label class="inline text-sm">
          <input type="checkbox" class="ex-done" ${done ? 'checked' : ''} /> 完成
        </label>
      </div>
      ${item.exercise.cue ? `<div class="exercise-cue">动作提示：${escapeHtml(item.exercise.cue)}</div>` : ''}
      <div class="exercise-form">
        <div class="field">
          <label>实际组数</label>
          <input class="input ex-sets" type="number" min="0" max="20" value="${actualSets ?? ''}" />
        </div>
        <div class="field">
          <label>${isTime ? '实际秒数' : '实际次数/组'}</label>
          <input class="input ex-amount" type="number" min="0" max="3600" value="${amountValue}" />
        </div>
        <div class="field">
          <label>主观强度</label>
          <select class="select ex-difficulty">
            <option value="">未填</option>
            ${DIFFICULTY_OPTIONS.map(([v, label]) => `<option value="${v}" ${String(difficulty) === String(v) ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>不适（可留空）</label>
          <input class="input ex-discomfort" placeholder="如：膝盖轻微不适" value="${escapeHtml(discomfort)}" />
        </div>
      </div>
    </div>
  `;
}

function selectedDayCard() {
  const day = state.days.find((d) => d.dayIndex === state.selectedDayIndex);
  if (!day) return '';
  const log = state.logsByDate.get(day.date);

  if (day.restDay) {
    return `
      <section class="card">
        <div class="card-head">
          <h3 class="card-title">${weekdayShort(day.dayIndex)} · ${escapeHtml(day.title)}</h3>
          <span class="chip chip-muted">休息日</span>
        </div>
        <p class="text-sm">今天安排的是恢复。可以散步 15-30 分钟，或做几组轻柔拉伸。</p>
      </section>
    `;
  }

  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">${weekdayShort(day.dayIndex)} · ${escapeHtml(day.title)}</h3>
        <div class="inline">${statusChip(log?.status || 'not_recorded')}<span class="card-hint">${day.date}</span></div>
      </div>
      <p class="text-sm">${escapeHtml(day.focus)} · 约 ${day.sessionMinutes} 分钟 · ${day.items.length} 个动作</p>
      <div class="card-actions" style="margin:10px 0">
        <button class="btn btn-success btn-sm" data-action="quick-log" data-status="completed" type="button">全部完成</button>
        <button class="btn btn-sm" data-action="quick-log" data-status="partial" type="button">部分完成</button>
        <button class="btn btn-ghost btn-sm" data-action="quick-log" data-status="skipped" type="button">今天没练</button>
      </div>
      <div class="divider"></div>
      ${day.items.map((item) => exerciseBlock(item, log?.items.find((i) => i.planItemId === item.id))).join('')}
      <div class="card-actions" style="margin-top:12px">
        <button class="btn btn-primary" data-action="save-detail" type="button">保存明细记录</button>
        ${log ? '<button class="btn btn-ghost btn-sm" data-action="delete-log" type="button">删除本次记录</button>' : ''}
      </div>
      <p class="quote">计划值已预填，只有实际表现不同时才需要修改。</p>
    </section>
  `;
}

function suggestionsCard() {
  if (!state.suggestions.length) {
    return '<section class="card"><div class="card-head"><h3 class="card-title">调整建议</h3></div><p class="empty">本周还没有可评估的动作。</p></section>';
  }
  const chipByStatus = {
    progress: 'chip-primary',
    keep: 'chip-muted',
    deload: 'chip-warn',
    regress: 'chip-danger',
    insufficient: 'chip-muted',
  };
  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">本周调整建议</h3>
        <span class="card-hint">规则生成 · 可逐条应用</span>
      </div>
      <div class="list">
        ${state.suggestions.map((s) => `
          <div class="list-item">
            <div>
              <div class="title">${escapeHtml(s.exerciseName)} <span class="chip ${chipByStatus[s.status] || 'chip-muted'}">${escapeHtml(s.title)}</span></div>
              <div class="sub">${escapeHtml(s.reason)}${s.suggestion ? ` · 建议：${
                s.isTimeBased ? `${s.suggestion.targetDurationSec} 秒` : `${s.suggestion.targetSets} 组 × ${s.suggestion.targetReps} 次`
              }` : ''}</div>
              ${s.safetyNote ? `<div class="sub">注意：${escapeHtml(s.safetyNote)}</div>` : ''}
            </div>
            <div class="right">
              ${s.suggestion ? `<button class="btn btn-sm" data-action="apply-suggestion" data-id="${s.planItemId}" type="button">应用</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function historyCard() {
  if (!state.history.length) {
    return '<section class="card"><div class="card-head"><h3 class="card-title">训练历史</h3></div><p class="empty">还没有训练记录。</p></section>';
  }
  return `
    <section class="card">
      <div class="card-head"><h3 class="card-title">训练历史（近 60 天）</h3></div>
      <div class="list">
        ${state.history.slice(0, 20).map((log) => `
          <div class="list-item">
            <div>
              <div class="title">${log.date} · ${escapeHtml(log.planTitle || '自由训练')}</div>
              <div class="sub">${log.items.filter((i) => i.done).length}/${log.items.length} 个动作完成${
                log.perceivedDifficulty ? ` · 主观强度 ${log.perceivedDifficulty}/5` : ''
              }</div>
            </div>
            <div class="right">${statusChip(log.status)}</div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function template() {
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">本周计划（${state.weekStart} 起）</h3>
          <p class="card-hint">点击日期切换；圆点表示记录状态（灰=未记录）</p>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm" data-action="regenerate" type="button">重新生成本周</button>
        </div>
      </div>
      ${daySelector()}
    </section>
    <div class="grid">
      ${selectedDayCard()}
      <div class="stack">
        ${suggestionsCard()}
        ${historyCard()}
      </div>
    </div>
  `;
}

async function load(ctx) {
  const planRes = await api.get(`/api/training/plan?date=${ctx.date}`);
  state.weekStart = planRes.weekStart;
  state.days = planRes.days.map((d) => ({ ...d, date: dateOfDayIndex(planRes.weekStart, d.dayIndex) }));
  state.todayKey = ctx.todayKey;
  const idx = dayIndexFromDate(planRes.weekStart, ctx.date);
  state.selectedDayIndex = idx >= 0 && idx <= 6 ? idx : 0;

  const from = state.days[0].date;
  const to = state.days[state.days.length - 1].date;
  const [logsRes, suggestionRes, historyRes] = await Promise.all([
    api.get(`/api/training/logs?from=${from}&to=${to}`),
    api.get(`/api/training/suggestions?date=${ctx.date}`),
    api.get('/api/training/logs'),
  ]);

  state.logsByDate = new Map(logsRes.items.map((l) => [l.date, l]));
  state.suggestions = suggestionRes.items;
  state.history = historyRes.items;
}

export async function renderTraining(container, ctx) {
  container.innerHTML = '<div class="loading">正在加载训练计划…</div>';
  await load(ctx);

  const refresh = async () => {
    await load(ctx);
    container.innerHTML = template();
  };

  const selectedDay = () => state.days.find((d) => d.dayIndex === state.selectedDayIndex);

  onAction(container, {
    'select-day': async (target) => {
      state.selectedDayIndex = Number(target.dataset.index);
      container.innerHTML = template();
    },
    'quick-log': async (target) => {
      const day = selectedDay();
      if (!day || day.restDay) return;
      try {
        await api.post('/api/training/logs', { date: day.date, planDayId: day.id, status: target.dataset.status });
        toast('已记录', 'success');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'save-detail': async () => {
      const day = selectedDay();
      if (!day || day.restDay) return;
      const blocks = [...container.querySelectorAll('.exercise')];
      const items = blocks.map((block) => {
        const isTime = block.dataset.time === '1';
        const amount = block.querySelector('.ex-amount').value;
        const difficulty = block.querySelector('.ex-difficulty').value;
        return {
          exerciseId: Number(block.dataset.exerciseId),
          planItemId: Number(block.dataset.planItemId),
          done: block.querySelector('.ex-done').checked,
          actualSets: block.querySelector('.ex-sets').value === '' ? null : Number(block.querySelector('.ex-sets').value),
          actualReps: isTime ? null : (amount === '' ? null : Number(amount)),
          actualDurationSec: isTime ? (amount === '' ? null : Number(amount)) : null,
          difficulty: difficulty === '' ? null : Number(difficulty),
          discomfort: block.querySelector('.ex-discomfort').value || null,
        };
      });
      const doneCount = items.filter((i) => i.done).length;
      const status = doneCount === 0 ? 'skipped' : doneCount === items.length ? 'completed' : 'partial';
      try {
        await api.post('/api/training/logs', { date: day.date, planDayId: day.id, status, items });
        toast('明细已保存', 'success');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'delete-log': async () => {
      const day = selectedDay();
      const log = state.logsByDate.get(day.date);
      if (!log) return;
      if (!confirmDialog(`确定删除 ${day.date} 的训练记录吗？此操作不可撤销。`)) return;
      try {
        await api.del(`/api/training/logs/${log.id}`);
        toast('已删除');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'apply-suggestion': async (target) => {
      try {
        const res = await api.post(`/api/training/suggestions/${target.dataset.id}/apply`);
        toast(res.applied ? '已应用建议' : '该动作暂无可应用建议');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'regenerate': async () => {
      if (!confirmDialog('重新生成会替换本周现有计划（不会删除训练记录），继续？')) return;
      try {
        await api.post('/api/training/plan/generate', { date: ctx.date });
        toast('计划已重新生成', 'success');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });

  container.innerHTML = template();
}
