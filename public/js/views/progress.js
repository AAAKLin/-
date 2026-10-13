/**
 * 进度页：体重/腰围趋势、训练依从、饮食记录覆盖、测量记录管理。
 * 强调趋势，且明确区分"未记录"与"未完成"。
 */

import { api } from '../api.js';
import {
  escapeHtml, onAction, toast, confirmDialog, num,
} from '../dom.js';
import { lineChart, barChart } from '../charts.js';

const state = {
  days: 30,
  summary: null,
  measurements: [],
};

function trendText(trend, unit) {
  if (!trend || trend.count < 2) return '数据点不足（至少 2 次记录）';
  const perWeek = trend.slopePerWeek;
  const sign = perWeek > 0 ? '+' : '';
  return `每周约 ${sign}${num(perWeek, 2)} ${unit}（区间合计 ${trend.change > 0 ? '+' : ''}${num(trend.change, 1)} ${unit}）`;
}

function template() {
  const s = state.summary;
  const a = s.adherence;
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">趋势概览（近 ${s.range.days} 天）</h3>
          <p class="card-hint">${s.range.from} 至 ${s.range.to}</p>
        </div>
        <div class="card-actions">
          ${[14, 30, 90].map((d) => `<button class="btn btn-sm ${d === state.days ? 'btn-primary' : ''}" data-action="range" data-days="${d}" type="button">${d} 天</button>`).join('')}
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat">
          <div class="label">最近体重</div>
          <div class="value">${s.weight.latest ? num(s.weight.latest.weightKg, 1) : '—'}<span class="unit"> 公斤</span></div>
        </div>
        <div class="stat">
          <div class="label">体重趋势</div>
          <div class="value" style="font-size:15px">${s.weight.trend.count >= 2 ? `${num(s.weight.trend.slopePerWeek, 2)}<span class="unit"> 公斤/周</span>` : '—'}</div>
        </div>
        <div class="stat">
          <div class="label">最近腰围</div>
          <div class="value">${s.waist.latest ? num(s.waist.latest.waistCm, 1) : '—'}<span class="unit"> 厘米</span></div>
        </div>
        <div class="stat">
          <div class="label">BMI（参考）</div>
          <div class="value">${s.bmi ? num(s.bmi.bmi, 1) : '—'}<span class="unit"> ${s.bmi ? s.bmi.category : ''}</span></div>
        </div>
      </div>
      <p class="quote">${escapeHtml(trendText(s.weight.trend, '公斤'))} · ${escapeHtml(trendText(s.waist.trend, '厘米'))}</p>
    </section>

    <div class="grid">
      <section class="card">
        <div class="card-head"><h3 class="card-title">体重趋势</h3><span class="card-hint">单位：公斤</span></div>
        ${lineChart(s.weight.points, { tone: 'blue', unit: '公斤' })}
      </section>
      <section class="card">
        <div class="card-head"><h3 class="card-title">腰围趋势</h3><span class="card-hint">单位：厘米</span></div>
        ${lineChart(s.waist.points, { tone: 'green', unit: '厘米' })}
      </section>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head"><h3 class="card-title">训练依从（近 ${s.range.days} 天）</h3></div>
        <div class="stat-grid" style="grid-template-columns: repeat(2, minmax(0,1fr))">
          <div class="stat"><div class="label">计划训练日</div><div class="value">${a.planned}<span class="unit"> 天</span></div></div>
          <div class="stat"><div class="label">完成 / 部分完成</div><div class="value">${a.completed}<span class="unit"> / ${a.partial}</span></div></div>
          <div class="stat"><div class="label">记录为没练</div><div class="value">${a.skipped}<span class="unit"> 次</span></div></div>
          <div class="stat"><div class="label">未记录</div><div class="value">${a.notRecorded}<span class="unit"> 天</span></div></div>
        </div>
        <p class="quote">未记录只是"还没填"，不代表没训练；补记会立即更新这里。</p>
        <div style="margin-top:10px">${barChart(s.weeklySessions)}</div>
        <p class="text-muted">上图为每周训练次数（不含记录为"没练"的日期）。</p>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title">饮食记录覆盖</h3></div>
        <div class="stat-grid" style="grid-template-columns: repeat(2, minmax(0,1fr))">
          <div class="stat"><div class="label">有饮食记录的天数</div><div class="value">${s.dietCoverage.covered}<span class="unit"> / ${s.dietCoverage.total} 天</span></div></div>
          <div class="stat"><div class="label">覆盖率</div><div class="value">${s.dietCoverage.coverageRate ?? '—'}<span class="unit"> %</span></div></div>
        </div>
        <p class="quote">覆盖率低不一定代表吃得不好，可能只是没记；记起来才有参考价值。</p>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <h3 class="card-title">体重 / 腰围记录</h3>
        <button class="btn btn-sm" data-action="add-measurement" type="button">添加记录</button>
      </div>
      <div class="scroll-x">
        <table class="table">
          <thead><tr><th>日期</th><th>体重（公斤）</th><th>腰围（厘米）</th><th>备注</th><th></th></tr></thead>
          <tbody>
            ${state.measurements.length ? state.measurements.map((m) => `
              <tr>
                <td>${m.date}</td>
                <td>${m.weightKg != null ? num(m.weightKg, 1) : '—'}</td>
                <td>${m.waistCm != null ? num(m.waistCm, 1) : '—'}</td>
                <td>${escapeHtml(m.note || '')}</td>
                <td><button class="btn btn-ghost btn-sm" data-action="delete-measurement" data-id="${m.id}" type="button">删除</button></td>
              </tr>
            `).join('') : '<tr><td colspan="5" class="text-muted">还没有记录，点右上角添加。</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h3 class="card-title">档案与数据</h3>
        <span class="card-hint">修改档案、导出备份、载入演示数据</span>
      </div>
      <div class="card-actions">
        <button class="btn btn-sm" data-action="open-settings" type="button">档案与备份</button>
      </div>
    </section>
  `;
}

async function load(ctx) {
  const [summary, measurements] = await Promise.all([
    api.get(`/api/progress/summary?days=${state.days}`),
    api.get(`/api/progress/measurements?from=${new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)}`),
  ]);
  state.summary = summary;
  state.measurements = measurements.items.slice().reverse();
}

export async function renderProgress(container, ctx) {
  container.innerHTML = '<div class="loading">正在加载进度数据…</div>';
  await load(ctx);

  const refresh = async () => {
    await load(ctx);
    container.innerHTML = template();
  };

  onAction(container, {
    'range': async (target) => {
      state.days = Number(target.dataset.days);
      await refresh();
    },
    'add-measurement': async () => {
      const date = ctx.date;
      const weight = window.prompt('请输入体重（公斤，可留空）', '');
      if (weight === null) return;
      const waist = window.prompt('请输入腰围（厘米，可留空）', '');
      if (waist === null) return;
      const payload = { date };
      if (weight.trim()) payload.weightKg = Number(weight);
      if (waist.trim()) payload.waistCm = Number(waist);
      if (!payload.weightKg && !payload.waistCm) {
        toast('至少需要填写一项');
        return;
      }
      try {
        await api.post('/api/progress/measurements', payload);
        toast('已保存', 'success');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'delete-measurement': async (target) => {
      if (!confirmDialog('删除这条测量记录？')) return;
      try {
        await api.del(`/api/progress/measurements/${target.dataset.id}`);
        toast('已删除');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    'open-settings': () => {
      ctx.openSettings();
    },
  });

  container.innerHTML = template();
}
