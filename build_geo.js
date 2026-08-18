// 把 js/geo/ 下 34 个省份 GeoJSON 打包成 js/geo-data.js（内联 window.GEO_DATA）
// 用途：file:// 双击打开时浏览器屏蔽 fetch 读取本地文件，内联后可完全离线、任意方式打开
// 用法：node build_geo.js（改动 js/geo/ 后重新生成）
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'js', 'geo');
const files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); });
const out = {};
files.forEach(function (f) {
    out[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
});
const js = '// 省份城市 GeoJSON 内联数据（由 build_geo.js 从 js/geo/ 生成；离线/file:// 打开无需 fetch）\nwindow.GEO_DATA = ' + JSON.stringify(out) + ';\n';
const target = path.join(__dirname, 'js', 'geo-data.js');
fs.writeFileSync(target, js);
console.log('✅ 已生成 js/geo-data.js（' + files.length + ' 个省份, ' + Math.round(Buffer.byteLength(js) / 1024) + ' KB）');
