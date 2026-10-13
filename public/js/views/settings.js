/**
 * 档案与备份：基础档案、目标设置、备份导出/恢复、演示数据。
 * 恢复备份属于破坏性操作，必须二次确认。
 */

import { api } from '../api.js';
import { escapeHtml, openModal, closeModal, toast, confirmDialog, num } from '../dom.js';

function options(list, current) {
  return list.map(([value, label]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`).join('');
}

export async function openSettings({ onChanged } = {}) {
  const [data, net] = await Promise.all([
    api.get('/api/profile'),
    api.get('/api/settings/network').catch(() => null),
  ]);
  const p = data.profile;

  const body = `
    ${net ? `
    <div class="section-title">访问方式</div>
    <div class="stack-sm">
      <p class="text-muted">电脑本机：<code>${escapeHtml(net.localUrl)}</code></p>
      ${net.lanUrls.length > 0
        ? net.lanUrls.map((u) => `<p class="text-muted">手机 / 平板：<code>${escapeHtml(u)}</code></p>`).join('')
        : '<p class="text-muted">手机 / 平板：未检测到局域网地址</p>'}
      <p class="quote">${escapeHtml(net.hint)}</p>
      ${net.lanEnabled ? `<p class="text-muted">⚠ ${escapeHtml(net.securityNote)}</p>` : ''}
    </div>
    <div class="divider"></div>` : ''}

    <div class="section-title">基础档案</div>
    <div class="field-row">
      <div class="field">
        <label for="s-sex">性别（用于估算公式）</label>
        <select class="select" id="s-sex">${options([['male', '男'], ['female', '女']], p.sex)}</select>
      </div>
      <div class="field">
        <label for="s-age">年龄</label>
        <input class="input" id="s-age" type="number" min="10" max="100" value="${p.age ?? ''}" />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="s-height">身高（厘米）</label>
        <input class="input" id="s-height" type="number" step="0.5" value="${p.heightCm ?? ''}" />
      </div>
      <div class="field">
        <label for="s-weight">当前体重（公斤）</label>
        <input class="input" id="s-weight" type="number" step="0.1" value="${p.weightKg ?? ''}" />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="s-activity">日常活动量</label>
        <select class="select" id="s-activity">${options([
          ['sedentary', '久坐少动'], ['light', '每周 1-3 次运动'], ['moderate', '每周 3-5 次运动'], ['high', '每周高强度训练'],
        ], p.activityLevel)}</select>
      </div>
      <div class="field">
        <label for="s-goal">目标</label>
        <select class="select" id="s-goal">${options([
          ['fat_loss', '减脂（尽量保住肌肉）'], ['recomp', '体重维持 / 体态改善'], ['maintain', '维持现状'],
        ], p.goal)}</select>
      </div>
    </div>

    <div class="section-title">训练安排</div>
    <div class="field-row">
      <div class="field">
        <label for="s-experience">训练经验</label>
        <select class="select" id="s-experience">${options([['beginner', '新手'], ['intermediate', '有一定基础']], p.experience)}</select>
      </div>
      <div class="field">
        <label for="s-days">每周可训练天数</label>
        <input class="input" id="s-days" type="number" min="1" max="6" value="${p.availableDays}" />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="s-minutes">单次时长（分钟）</label>
        <input class="input" id="s-minutes" type="number" min="15" max="120" value="${p.sessionMinutes}" />
      </div>
      <div class="field">
        <label for="s-equipment">可用器械</label>
        <select class="select" id="s-equipment">${options([
          ['none', '无器械（徒手）'], ['band', '弹力带'], ['dumbbell', '哑铃'], ['chair', '椅子/台阶'],
        ], p.equipment)}</select>
      </div>
    </div>
    <div class="field">
      <label for="s-limitations">身体限制（会影响动作选择，可留空）</label>
      <input class="input" id="s-limitations" value="${escapeHtml(p.limitations || '')}" placeholder="例如：膝盖不适、腰部不适" />
    </div>
    <div class="field">
      <label for="s-budget">预算偏好</label>
      <select class="select" id="s-budget">${options([['low', '低预算'], ['medium', '中等'], ['high', '不敏感']], p.budgetLevel)}</select>
    </div>

    <div class="section-title">每日目标（${data.targets.source === 'manual' ? '当前：手动设置' : '当前：按档案自动估算'}）</div>
    <div class="field-row">
      <div class="field"><label for="s-kcal">热量（千卡）</label><input class="input" id="s-kcal" type="number" value="${data.targets.kcal ?? ''}" /></div>
      <div class="field"><label for="s-protein">蛋白质（克）</label><input class="input" id="s-protein" type="number" value="${data.targets.protein ?? ''}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="s-fat">脂肪（克）</label><input class="input" id="s-fat" type="number" value="${data.targets.fat ?? ''}" /></div>
      <div class="field"><label for="s-carb">碳水（克）</label><input class="input" id="s-carb" type="number" value="${data.targets.carb ?? ''}" /></div>
    </div>
    <p class="quote">修改这四个数值会切换为「手动目标」；点下面的按钮可恢复自动估算。</p>
    <div class="card-actions">
      <button class="btn btn-sm" id="s-recompute" type="button">重新按档案估算</button>
    </div>
    <div class="stack-sm">
      ${(data.targets.assumptions || []).map((a) => `<p class="text-muted">· ${escapeHtml(a)}</p>`).join('')}
    </div>
    ${data.bmi ? `<p class="text-muted">BMI 参考：${num(data.bmi.bmi, 1)}（${escapeHtml(data.bmi.category)}），${escapeHtml(data.bmi.note)}</p>` : ''}

    <div class="divider"></div>
    <div class="section-title">数据备份</div>
    <div class="card-actions">
      <button class="btn btn-sm" id="s-export" type="button">导出备份（JSON）</button>
      <label class="btn btn-sm" for="s-import-file" style="margin:0">选择备份文件恢复…</label>
      <input type="file" id="s-import-file" accept="application/json,.json" style="display:none" />
      <button class="btn btn-ghost btn-sm" id="s-demo" type="button">载入合成演示数据</button>
    </div>
    <p class="quote">恢复会覆盖现有数据，执行前会再次确认。演示数据只补充缺失日期，不会删除已有记录。</p>
  `;

  openModal({
    title: '档案与备份',
    body,
    footer: `
      <button class="btn btn-ghost" data-action="close-modal" type="button">取消</button>
      <button class="btn btn-primary" id="s-save" type="button">保存档案</button>
    `,
    onMount(root) {
      const val = (id) => root.querySelector(id).value;

      root.querySelector('#s-save').addEventListener('click', async () => {
        const payload = {
          sex: val('#s-sex'),
          age: Number(val('#s-age')),
          heightCm: Number(val('#s-height')),
          weightKg: Number(val('#s-weight')),
          activityLevel: val('#s-activity'),
          goal: val('#s-goal'),
          experience: val('#s-experience'),
          availableDays: Number(val('#s-days')),
          sessionMinutes: Number(val('#s-minutes')),
          equipment: val('#s-equipment'),
          limitations: val('#s-limitations'),
          budgetLevel: val('#s-budget'),
          targetKcal: Number(val('#s-kcal')),
          targetProtein: Number(val('#s-protein')),
          targetFat: Number(val('#s-fat')),
          targetCarb: Number(val('#s-carb')),
          targetSource: 'manual',
        };
        try {
          await api.put('/api/profile', payload);
          toast('档案已保存', 'success');
          closeModal();
          if (onChanged) onChanged();
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      root.querySelector('#s-recompute').addEventListener('click', async () => {
        try {
          await api.post('/api/profile/targets/recompute', {});
          toast('已按档案重新估算', 'success');
          closeModal();
          if (onChanged) onChanged();
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      root.querySelector('#s-export').addEventListener('click', async () => {
        try {
          const payload = await api.get('/api/backup/export');
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `fitness-backup-${payload.exportedAt.slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          toast('备份已导出', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      root.querySelector('#s-import-file').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (!confirmDialog('恢复备份会覆盖当前所有数据，确定继续吗？')) {
          event.target.value = '';
          return;
        }
        try {
          const text = await file.text();
          const payload = JSON.parse(text);
          const result = await api.post('/api/backup/import', { mode: 'replace', confirm: true, payload });
          toast(`恢复完成，共 ${Object.values(result.counts).reduce((a, b) => a + b, 0)} 条记录`, 'success');
          closeModal();
          if (onChanged) onChanged();
        } catch (err) {
          toast(err.message || '备份文件解析失败', 'error');
        } finally {
          event.target.value = '';
        }
      });

      root.querySelector('#s-demo').addEventListener('click', async () => {
        if (!confirmDialog('载入合成演示数据？（只补充缺失日期，不会删除已有记录）')) return;
        try {
          const res = await api.post('/api/demo/load', { days: 28 });
          toast(`已载入：计划 ${res.plansCreated} 周、体重 ${res.measurementsAdded} 条、训练 ${res.workoutsAdded} 次`, 'success');
          closeModal();
          if (onChanged) onChanged();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  });
}
