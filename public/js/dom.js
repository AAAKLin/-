/**
 * 轻量 DOM 工具：转义、渲染、事件委托、提示条、弹窗。
 * 使用原生 API，不引入任何前端框架或构建步骤。
 */

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function num(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

export function setHtml(node, html) {
  node.innerHTML = html;
}

/** 事件委托：在容器上监听带 data-action 的元素点击 */
export function onAction(root, handlers) {
  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const handler = handlers[action];
    if (!handler) return;
    event.preventDefault();
    handler(target, event);
  });
}

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  root.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

/**
 * 打开弹窗。
 * @param {{title:string, body:string, footer?:string, onMount?: (root:HTMLElement)=>void}} options
 */
export function openModal({ title, body, footer = '', onMount }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${escapeHtml(title)}</h3>
          <button class="btn btn-ghost btn-sm" data-action="close-modal" type="button">关闭</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>
  `;
  const backdrop = root.querySelector('.modal-backdrop');
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModal();
  });
  document.addEventListener('keydown', escHandler);
  if (onMount) onMount(root);
  return root;
}

function escHandler(event) {
  if (event.key === 'Escape') closeModal();
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  document.removeEventListener('keydown', escHandler);
}

/** 进度条：percent 为 null 时显示"未设目标" */
export function bar(percent, status = 'primary') {
  const pct = percent === null || percent === undefined ? 0 : Math.max(0, Math.min(percent, 100));
  const cls = status === 'success' ? 'bar-success' : status === 'warn' ? 'bar-warn' : status === 'danger' ? 'bar-danger' : '';
  return `<div class="bar ${cls}"><span style="width:${pct}%"></span></div>`;
}

export function confirmDialog(message) {
  // 危险操作统一走浏览器确认，避免误触
  return window.confirm(message);
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateLabel(key) {
  if (!key) return '';
  const [, m, d] = key.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export function weekdayShort(index) {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][index] || '';
}
