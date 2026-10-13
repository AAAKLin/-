/**
 * 极简 SVG 图表：不引入图表库，保证零构建、零外部依赖。
 */

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 16, right: 12, bottom: 26, left: 34 };

/** 当前是否深色模式（决定图表配色） */
function isDarkTheme() {
  return typeof document !== 'undefined'
    && document.documentElement.classList.contains('dark');
}

/** 数据线语义色：深浅模式各一套明度，保证两种主题下都清晰 */
const TONES = {
  blue: { light: '#2563eb', dark: '#60a5fa' },
  green: { light: '#16a34a', dark: '#4ade80' },
  violet: { light: '#7c3aed', dark: '#a78bfa' },
};

/**
 * 图表配色：
 * - 网格线/文字用 currentColor + 透明度，自动跟随主题文字色
 * - 数据线优先用显式颜色，否则按 tone + 当前主题取色
 */
function chartColor(explicit, tone) {
  if (explicit) return explicit;
  const t = TONES[tone] || TONES.blue;
  return isDarkTheme() ? t.dark : t.light;
}

function niceRange(min, max) {
  if (min === max) {
    const delta = Math.abs(min) * 0.02 || 1;
    return [min - delta, max + delta];
  }
  const padding = (max - min) * 0.12;
  return [min - padding, max + padding];
}

/**
 * 折线图。
 * @param {Array<{date:string, value:number}>} points 按日期升序
 * @param {{color?:string, height?:number, width?:number, unit?:string, showAxis?:boolean}} options
 */
export function lineChart(points, options = {}) {
  const color = chartColor(options.color, options.tone);
  const width = options.width || WIDTH;
  const height = options.height || HEIGHT;
  const unit = options.unit || '';

  const valid = (points || []).filter((p) => Number.isFinite(Number(p.value)));
  if (valid.length === 0) {
    return '<p class="empty">还没有足够的数据点，记录两次以上就会出现趋势线。</p>';
  }

  const values = valid.map((p) => Number(p.value));
  const [min, max] = niceRange(Math.min(...values), Math.max(...values));
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const x = (i) => PAD.left + (valid.length === 1 ? innerW / 2 : (innerW * i) / (valid.length - 1));
  const y = (v) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;

  const polyline = valid.map((p, i) => `${x(i).toFixed(1)},${y(Number(p.value)).toFixed(1)}`).join(' ');
  const areaPath = `M ${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L ${polyline.split(' ').join(' L ')} L ${x(valid.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  const gridLines = [0, 0.5, 1].map((ratio) => {
    const gy = PAD.top + innerH * ratio;
    const value = max - (max - min) * ratio;
    // 网格线与刻度文字用 currentColor + 透明度，自动适配深浅主题
    return `<line x1="${PAD.left}" y1="${gy.toFixed(1)}" x2="${width - PAD.right}" y2="${gy.toFixed(1)}" stroke="currentColor" opacity="0.1" />
      <text x="${PAD.left - 6}" y="${(gy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="currentColor" opacity="0.5">${value.toFixed(1)}</text>`;
  }).join('');

  const dots = valid.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(Number(p.value)).toFixed(1)}" r="2.6" fill="${color}" />`).join('');

  const labels = valid.length <= 10
    ? valid.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">${p.date.slice(5)}</text>`).join('')
    : [
      `<text x="${PAD.left}" y="${height - 8}" font-size="10" fill="currentColor" opacity="0.5">${valid[0].date.slice(5)}</text>`,
      `<text x="${(width - PAD.right).toFixed(1)}" y="${height - 8}" text-anchor="end" font-size="10" fill="currentColor" opacity="0.5">${valid[valid.length - 1].date.slice(5)}</text>`,
    ].join('');

  return `
    <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="趋势图">
      <path d="${areaPath}" fill="${color}" opacity="0.08" />
      ${gridLines}
      <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
      ${labels}
      ${unit ? `<text x="${PAD.left}" y="12" font-size="10" fill="currentColor" opacity="0.5">${unit}</text>` : ''}
    </svg>
  `;
}

/** 迷你趋势线（首页卡片用） */
export function sparkline(points, options = {}) {
  if (!points || points.length < 2) {
    return '<p class="text-muted">再记录一次体重，就能看到趋势。</p>';
  }
  return lineChart(points, { height: 120, ...options });
}

/** 柱状图（每周训练次数） */
export function barChart(items, options = {}) {
  if (!items || items.length === 0) return '<p class="empty">暂无数据。</p>';
  const width = options.width || WIDTH;
  const height = options.height || 160;
  const max = Math.max(...items.map((i) => i.count), 1);
  const innerW = width - 24;
  const barW = Math.min(36, innerW / items.length - 8);
  const accent = chartColor(options.color, options.tone);
  const bars = items.map((item, i) => {
    const h = (item.count / max) * (height - 40);
    const cx = 12 + (innerW / items.length) * (i + 0.5);
    return `
      <rect x="${(cx - barW / 2).toFixed(1)}" y="${(height - 24 - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 2).toFixed(1)}" rx="4" fill="${accent}" opacity="0.85" />
      <text x="${cx.toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">${item.week.slice(5)}</text>
      <text x="${cx.toFixed(1)}" y="${(height - 28 - h).toFixed(1)}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">${item.count}</text>
    `;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="每周训练次数">${bars}</svg>`;
}
