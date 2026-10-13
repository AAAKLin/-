/**
 * 首页：今日行动中心。
 * 只呈现"今天要做什么 + 现在的状态"，缺记录时明确显示"未记录"，不判定为没完成。
 */

import { api } from '../api.js';
import { escapeHtml, onAction, toast, openModal, closeModal, bar, num, dateLabel } from '../dom.js';
import { sparkline } from '../charts.js';
import { openFoodPicker } from '../components/foodPicker.js';

const STATUS_LABEL = {
  completed: { text: '已完成', chip: 'chip-success' },
  partial: { text: '部分完成', chip: 'chip-warn' },
  skipped: { text: '今天没练', chip: 'chip-muted' },
  not_recorded: { text: '未记录', chip: 'chip-muted' },
};

function macroRow(label, item, unit) {
  const percent = item.percent;
  const status = !percent ? 'primary' : item.status === 'over' ? 'danger' : item.status === 'low' ? 'warn' : 'success';
  const valueText = percent === null ? '未设置目标' : `${num(item.actual, unit === '千卡' ? 0 : 1)} / ${num(item.target, unit === '千卡' ? 0 : 1)} ${unit}（${percent}%）`;
  return `
    <div class="macro-row">
      <div class="macro-head">
        <span>${label}</span>
        <span class="macro-value">${valueText}</span>
      </div>
      ${bar(percent, status)}
    </div>
  `;
}

function trainingCard(data) {
  const t = data.training;
  const status = STATUS_LABEL[t.status] || STATUS_LABEL.not_recorded;

  if (!t.planDay) {
    return `
      <section class="card">
        <div class="card-head"><h3 class="card-title">今日训练</h3></div>
        <p class="empty">今天没有训练安排。可到「训练」页生成一周计划。</p>
        <div class="card-actions" style="margin-top:10px">
          <a class="btn btn-primary btn-sm" href="#/training">去生成计划</a>
        </div>
      </section>
    `;
  }

  if (t.planDay.restDay) {
    return `
      <section class="card">
        <div class="card-head">
          <h3 class="card-title">今日训练</h3>
          <span class="chip chip-muted">休息日</span>
        </div>
        <p class="text-sm">${escapeHtml(t.planDay.title)}：今天安排的是恢复，可以散步 15-30 分钟或做几分钟拉伸。</p>
      </section>
    `;
  }

  const items = t.planDay.items.map((item) => `
    <div class="list-item">
      <div>
        <div class="title">${escapeHtml(item.exercise.name)}</div>
        <div class="sub">${
          item.exercise.isTimeBased
            ? `${item.targetDurationSec} 秒`
            : `${item.targetSets} 组 × ${item.targetReps} 次`
        }</div>
      </div>
    </div>
  `).join('');

  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">今日训练</h3>
        <span class="chip ${status.chip}">${status.text}</span>
      </div>
      <p class="text-sm">${escapeHtml(t.planDay.title)} · ${escapeHtml(t.planDay.focus)} · 约 ${t.planDay.sessionMinutes} 分钟</p>
      <div class="list" style="margin-top:10px">${items}</div>
      <div class="card-actions" style="margin-top:12px">
        <button class="btn btn-success btn-sm" data-action="quick-log" data-status="completed" type="button">全部完成</button>
        <button class="btn btn-sm" data-action="quick-log" data-status="partial" type="button">部分完成</button>
        <button class="btn btn-ghost btn-sm" data-action="quick-log" data-status="skipped" type="button">今天没练</button>
        <a class="btn btn-ghost btn-sm" href="#/training">填写明细</a>
      </div>
    </section>
  `;
}

function dietCard(data) {
  const d = data.diet;
  const c = d.comparison;
  const meals = d.byMeal.map((m) => `
    <span class="chip">${m.label} ${num(m.totals.kcal)} 千卡</span>
  `).join(' ');

  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">今日饮食</h3>
        <span class="chip ${d.entryCount === 0 ? 'chip-muted' : 'chip-primary'}">${d.entryCount === 0 ? '还没有记录' : `${d.entryCount} 条记录`}</span>
      </div>
      ${macroRow('热量', c.kcal, '千卡')}
      ${macroRow('蛋白质', c.protein, '克')}
      ${macroRow('脂肪', c.fat, '克')}
      ${macroRow('碳水', c.carb, '克')}
      <div class="inline" style="margin-top:4px">${meals}</div>
      ${d.hasEstimate ? '<p class="quote">含估算值食物，实际以包装/称量为准，可在饮食页修正。</p>' : ''}
      <div class="card-actions" style="margin-top:12px">
        <button class="btn btn-primary btn-sm" data-action="quick-food" type="button">快速记一餐</button>
        <a class="btn btn-ghost btn-sm" href="#/diet">去饮食页</a>
      </div>
    </section>
  `;
}

function bodyCard(data) {
  const b = data.body;
  const latest = b.latest;
  const trend = b.weightTrend;
  const changeText = trend && trend.change !== null && trend.count >= 2
    ? `近 ${trend.count} 次记录变化 ${trend.change > 0 ? '+' : ''}${num(trend.change, 1)} 公斤`
    : '趋势需要至少两次记录';

  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">体重与腰围</h3>
        ${latest ? `<span class="chip">${dateLabel(latest.date)}</span>` : ''}
      </div>
      <div class="stat-grid" style="grid-template-columns: repeat(2, minmax(0,1fr))">
        <div class="stat">
          <div class="label">最近体重</div>
          <div class="value">${latest && latest.weightKg != null ? num(latest.weightKg, 1) : '—'}<span class="unit"> 公斤</span></div>
        </div>
        <div class="stat">
          <div class="label">最近腰围</div>
          <div class="value">${latest && latest.waistCm != null ? num(latest.waistCm, 1) : '—'}<span class="unit"> 厘米</span></div>
        </div>
      </div>
      <div style="margin-top:10px">${sparkline(b.points)}</div>
      <p class="text-muted" style="margin-top:6px">${changeText}${b.daysSinceLastMeasurement !== null ? ` · 距上次记录 ${b.daysSinceLastMeasurement} 天` : ''}</p>
      <div class="card-actions" style="margin-top:10px">
        <button class="btn btn-sm" data-action="quick-weight" type="button">记录体重/腰围</button>
        <a class="btn btn-ghost btn-sm" href="#/progress">看进度</a>
      </div>
    </section>
  `;
}

function aiCard() {
  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">AI 教练建议</h3>
        <span class="card-hint">大模型生成 · 仅供参考</span>
      </div>
      <div id="ai-advice-body">
        <p class="text-muted">让 AI 根据今天的训练、饮食和体重数据，给你一段个性化建议（需要配置 API Key）。</p>
        <div class="card-actions" style="margin-top:10px">
          <button class="btn btn-primary btn-sm" data-action="gen-ai" type="button">生成 AI 建议</button>
        </div>
      </div>
    </section>
  `;
}

/** 把 AI（或降级后的规则）建议渲染进卡片 */
function renderAdvice(container, advice) {
  const body = container.querySelector('#ai-advice-body');
  if (!body) return;
  const tag = advice.source === 'ai'
    ? `<span class="chip chip-success">AI 生成${advice.model ? ` · ${escapeHtml(advice.model)}` : ''}</span>`
    : '<span class="chip chip-muted">规则建议</span>';
  body.innerHTML = `
    <p class="text-sm" style="white-space:pre-line">${escapeHtml(advice.text)}</p>
    ${advice.reason ? `<p class="quote">${escapeHtml(advice.reason)}</p>` : ''}
    <div class="card-actions" style="margin-top:10px">
      ${tag}
      <button class="btn btn-ghost btn-sm" data-action="gen-ai" type="button">重新生成</button>
    </div>
  `;
}

function recoCard(data) {
  const items = data.recommendations.length
    ? data.recommendations.map((r) => `
      <div class="reco ${r.tone}">
        <div class="title">${escapeHtml(r.title)}</div>
        <div class="body">${escapeHtml(r.body)}</div>
      </div>
    `).join('')
    : '<p class="empty">今天没有特别提醒，保持节奏就好。</p>';

  return `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">今日建议</h3>
        <span class="card-hint">规则生成 · 非医疗建议</span>
      </div>
      ${items}
      ${data.resume ? `
        <div class="divider"></div>
        <div class="text-sm"><strong>${escapeHtml(data.resume.title)}</strong>
          <ul style="margin:6px 0 0 18px;padding:0">
            ${data.resume.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
          </ul>
        </div>` : ''}
    </section>
  `;
}

function template(data) {
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h2 style="font-size:16px">${dateLabel(data.date)} · 今日行动中心</h2>
          <p class="card-hint">目标 ${num(data.targets.kcal)} 千卡 · 蛋白 ${num(data.targets.protein)} 克（${data.targets.source === 'manual' ? '手动设置' : '自动估算'}）</p>
        </div>
        <span class="chip ${data.training.hasRecord ? 'chip-success' : 'chip-muted'}">${data.training.hasRecord ? '训练已记录' : '训练未记录'}</span>
      </div>
      <div class="stat-grid">
        <div class="stat">
          <div class="label">训练状态</div>
          <div class="value" style="font-size:16px">${(STATUS_LABEL[data.training.status] || STATUS_LABEL.not_recorded).text}</div>
        </div>
        <div class="stat">
          <div class="label">已摄入热量</div>
          <div class="value">${num(data.diet.totals.kcal)}<span class="unit"> 千卡</span></div>
        </div>
        <div class="stat">
          <div class="label">蛋白质</div>
          <div class="value">${num(data.diet.totals.protein, 1)}<span class="unit"> 克</span></div>
        </div>
        <div class="stat">
          <div class="label">近 14 天训练</div>
          <div class="value">${data.adherence.completed}<span class="unit"> / ${data.adherence.planned} 次</span></div>
        </div>
      </div>
    </section>

    <div class="grid">
      ${aiCard()}
      ${trainingCard(data)}
      ${dietCard(data)}
      ${bodyCard(data)}
      ${recoCard(data)}
    </div>
  `;
}

async function openWeightModal(date, onSaved) {
  openModal({
    title: '记录体重 / 腰围',
    body: `
      <div class="field-row">
        <div class="field">
          <label for="w-date">日期</label>
          <input class="input" type="date" id="w-date" value="${date}" />
        </div>
        <div class="field">
          <label for="w-weight">体重（公斤）</label>
          <input class="input" type="number" step="0.1" id="w-weight" placeholder="例如 85.5" />
        </div>
      </div>
      <div class="field">
        <label for="w-waist">腰围（厘米，可留空）</label>
        <input class="input" type="number" step="0.1" id="w-waist" placeholder="例如 95" />
      </div>
      <div class="field">
        <label for="w-note">备注（可留空）</label>
        <input class="input" id="w-note" placeholder="例如：晨起空腹" />
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" data-action="close-modal" type="button">取消</button>
      <button class="btn btn-primary" data-action="save-weight" type="button">保存</button>
    `,
    onMount(root) {
      root.querySelector('[data-action="save-weight"]').addEventListener('click', async () => {
        const payload = {
          date: root.querySelector('#w-date').value,
          weightKg: root.querySelector('#w-weight').value ? Number(root.querySelector('#w-weight').value) : undefined,
          waistCm: root.querySelector('#w-waist').value ? Number(root.querySelector('#w-waist').value) : undefined,
          note: root.querySelector('#w-note').value || undefined,
        };
        try {
          await api.post('/api/progress/measurements', payload);
          toast('已保存', 'success');
          closeModal();
          if (onSaved) onSaved();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  });
}

export async function renderHome(container, ctx) {
  container.innerHTML = '<div class="loading">正在加载今日数据…</div>';
  const data = await api.get(`/api/today?date=${ctx.date}`);
  container.innerHTML = template(data);

  onAction(container, {
    'gen-ai': async (target) => {
      const body = container.querySelector('#ai-advice-body');
      target.disabled = true;
      if (body) body.innerHTML = '<div class="loading">AI 正在思考…</div>';
      try {
        const advice = await api.post('/api/today/ai-advice', { date: ctx.date });
        renderAdvice(container, advice);
      } catch (err) {
        // 网络/服务异常：恢复初始状态并提示，不阻塞其他功能
        if (body) {
          body.innerHTML = `
            <p class="quote">生成失败：${escapeHtml(err.message)}</p>
            <div class="card-actions" style="margin-top:10px">
              <button class="btn btn-primary btn-sm" data-action="gen-ai" type="button">重试</button>
            </div>
          `;
        }
      }
    },
    'quick-log': async (target) => {
      const status = target.dataset.status;
      try {
        await api.post('/api/training/logs', {
          date: ctx.date,
          planDayId: data.training.planDay ? data.training.planDay.id : undefined,
          status,
        });
        toast('已记录', 'success');
        ctx.refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'quick-food': () => {
      openFoodPicker({ date: ctx.date, meal: guessMeal(), onAdded: () => ctx.refresh() });
    },
    'quick-weight': () => {
      openWeightModal(ctx.date, () => ctx.refresh());
    },
  });
}

function guessMeal() {
  const hour = new Date().getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}
