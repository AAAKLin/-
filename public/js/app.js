/**
 * 应用外壳：路由、导航、全局日期与设置入口。
 * 零构建原生 ES 模块，四个主页面通过 hash 路由切换。
 */

import { api } from './api.js';
import { qs, qsa, todayKey, escapeHtml } from './dom.js';
import { renderHome } from './views/home.js';
import { renderTraining } from './views/training.js';
import { renderDiet } from './views/diet.js';
import { renderProgress } from './views/progress.js';
import { openSettings } from './views/settings.js';

const ROUTES = {
  home: { title: '今日行动中心', sub: '今天该做什么、现在什么状态', render: renderHome },
  training: { title: '训练', sub: '本周计划、快速与详细记录、调整建议', render: renderTraining },
  diet: { title: '饮食', sub: '记录实际摄入、管理常用食物与食谱', render: renderDiet },
  progress: { title: '我的进度', sub: '体重腰围趋势与记录覆盖情况', render: renderProgress },
};

const ctx = {
  date: todayKey(),
  todayKey: todayKey(),
  refresh: () => render(),
  openSettings: () => openSettings({ onChanged: () => render() }),
};

function currentRoute() {
  const key = (location.hash || '').replace(/^#\/?/, '');
  return ROUTES[key] ? key : 'home';
}

function updateChrome(route) {
  const meta = ROUTES[route];
  qs('#topbar-title').textContent = meta.title;
  qs('#topbar-sub').textContent = meta.sub;
  qsa('[data-route]').forEach((node) => {
    node.classList.toggle('active', node.dataset.route === route);
  });
}

async function render() {
  const route = currentRoute();
  updateChrome(route);
  const container = qs('#view');

  try {
    await ROUTES[route].render(container, ctx);
  } catch (err) {
    container.innerHTML = `
      <section class="card">
        <div class="card-head"><h3 class="card-title">页面加载失败</h3></div>
        <p class="text-sm">${escapeHtml(err.message || '未知错误')}</p>
        <p class="quote">请确认后端服务已启动（项目目录执行 npm start），然后重试。</p>
        <div class="card-actions" style="margin-top:10px">
          <button class="btn btn-primary btn-sm" id="retry-btn" type="button">重试</button>
        </div>
      </section>
    `;
    qs('#retry-btn').addEventListener('click', () => render());
  }
}

function bindShell() {
  const dateInput = qs('#global-date');
  dateInput.value = ctx.date;
  dateInput.addEventListener('change', () => {
    if (!dateInput.value) {
      dateInput.value = ctx.date;
      return;
    }
    ctx.date = dateInput.value;
    render();
  });

  qs('#btn-settings').addEventListener('click', ctx.openSettings);
  qs('#btn-settings-top').addEventListener('click', ctx.openSettings);

  window.addEventListener('hashchange', render);
}

async function main() {
  bindShell();
  // 启动时探活一次，失败时给出明确提示而不是空白页
  try {
    await api.get('/health');
  } catch (err) {
    qs('#view').innerHTML = `
      <section class="card">
        <div class="card-head"><h3 class="card-title">无法连接后端服务</h3></div>
        <p class="text-sm">${escapeHtml(err.message)}</p>
        <p class="quote">在项目目录执行 <code>npm start</code> 后刷新本页面。</p>
      </section>
    `;
    return;
  }
  render();
}

main();
