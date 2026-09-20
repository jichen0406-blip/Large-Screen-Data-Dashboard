// palette.js — 全站统一图表色板（饼图 / 柱状图 / 堆积图共用，单一来源）
// 分类色 BOARD_PALETTE 按序取用；状态语义色 / 业务语义色 / 主色独立，勿混入分类循环
// 用法：<script src="js/palette.js"></script> 后调用 boardColor(i) / boardRamp(n)
window.BOARD_PALETTE = [
  '#62c98d', '#4cb9cf', '#2f89cf', '#6f7fd6', '#e0c828', '#7ecfd6', '#a3d977',
  '#f0a35e', '#d98cb0', '#9b8fd6', '#5fa8d3', '#c9d16a', '#8fb8a0', '#b9a06a',
  '#e05c5c'
];
// 热力 / 渐变色阶（冷 → 暖，低位 → 高位），供热力图、地图着色使用
window.BOARD_RAMP = ['#1f7fd4', '#2f89cf', '#4cb9cf', '#7ecfd6', '#a3d977', '#e0c828', '#f0a35e', '#e05c5c'];
// 状态语义色（红/黄/绿/灰）：全站表格与图表共用，不参与分类色循环
window.BOARD_STATUS = { red: '#ff4d4f', yellow: '#ffb800', green: '#62c98d', gray: '#9aa0a6' };
// 业务语义色：下单 / 回输 / 放行 / 单采（跨页复用，表格与图表一致）
window.BOARD_SEMANTIC = { order: '#2f89cf', reinfuse: '#62c98d', release: '#ffb800', apheresis: '#b18aff' };
// 主色（标题 / 高亮文字）
window.BOARD_ACCENT = '#4fe3ff';
// COE 四分类专用（与饼图一致的固定映射）
window.BOARD_COE_COLORS = { SCOE: '#62c98d', COE: '#2f89cf', RCOE: '#4cb9cf', Others: '#e0c828' };
function boardColor(i) {
  var p = window.BOARD_PALETTE;
  return p[((i % p.length) + p.length) % p.length];
}
// 从 BOARD_RAMP 均匀取 n 段（n<=1 时返回最低位色）
function boardRamp(n) {
  var r = window.BOARD_RAMP, out = [];
  if (n <= 1) return [r[0]];
  for (var i = 0; i < n; i++) out.push(r[Math.round(i * (r.length - 1) / (n - 1))]);
  return out;
}
