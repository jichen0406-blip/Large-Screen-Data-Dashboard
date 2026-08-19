// ============================================================
// 大屏数据生成脚本（每天运行一次，自动刷新 js/data.js）
// 数据源：rawdata/bs_order*.xlsx + masterdata.xlsx
// 统计逻辑与 fucaso-dashboard/build_poster.js 保持一致
// 用法：node build_data.js   （或 npm run data）
// ============================================================
var XLSX = require('xlsx');
var fs = require('fs');
var path = require('path');

// ── 1. 定位数据源 ──
// 优先 fucaso-board/rawdata，其次 fucaso-dashboard/rawdata
var rawDirs = [
  path.join(__dirname, 'rawdata'),
  path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata')
];
var rawDir = null, bsFile = null;
rawDirs.forEach(function(d) {
  if (rawDir || !fs.existsSync(d)) return;
  var bf = fs.readdirSync(d).find(function(f) { return f.startsWith('bs_order') && !f.startsWith('~$'); });
  if (bf && fs.existsSync(path.join(d, 'masterdata.xlsx'))) { rawDir = d; bsFile = bf; }
});
if (!rawDir) {
  console.error('❌ 未找到 bs_order*.xlsx / masterdata.xlsx，已检查：\n  ' + rawDirs.join('\n  '));
  process.exit(1);
}
console.log('数据源目录:', rawDir);
console.log('BS_ORDER:', bsFile);

// ── 2a. 数据更新时间（抓取 bs_order 文件时间） ──
var bsStat = fs.statSync(path.join(rawDir, bsFile));
function fmtDT(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
}
var UPDATED = fmtDT(bsStat.mtime);

// ── 2. 读取 Excel ──
var bsWb = XLSX.readFile(path.join(rawDir, bsFile));
var bsRows = XLSX.utils.sheet_to_json(bsWb.Sheets[bsWb.SheetNames[0]], { header: 1 });
var mdWb = XLSX.readFile(path.join(rawDir, 'masterdata.xlsx'));
var mdRows = XLSX.utils.sheet_to_json(mdWb.Sheets[mdWb.SheetNames[0]]);

// ── 3. 日期辅助函数（与 build_poster.js 相同） ──
function toLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function excelToDate(v) {
  if (typeof v === 'number') return toLocal(new Date((v - 25569) * 86400 * 1000));
  if (typeof v === 'string') { var m = v.match(/(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; }
  return null;
}
function parseDt(v) {
  if (!v) return null;
  var m = String(v).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ── 4. 主数据查找表（细胞追溯系统代码 → 标准医院名称 + 省份） ──
var masterMap = {};
mdRows.forEach(function(r) {
  var c = String(r['细胞追溯系统代码'] || '').trim();
  if (c) masterMap[c] = { name: String(r['标准医院名称'] || '').trim(), prov: String(r['省份'] || '').trim(), city: String(r['城市'] || '').trim(), coe: String(r['COE'] || '').trim() };
});
console.log('Master 记录数:', Object.keys(masterMap).length);

// ── 5. 关键列索引（动态匹配） ──
var headers = bsRows[1];
var ci = {};
headers.forEach(function(h, i) {
  h = String(h || '').replace(/\n/g, '');
  if (h === '医疗机构编码') ci.org = i;
  if (h === '医疗机构名称') ci.orgName = i;
  if (h.includes('合同创建') && h.includes('日期')) ci.od = i;
  if (h.includes('实际回输') && h.includes('结束时间')) ci.re = i;
  if (h.includes('实际单采') && h.includes('开始时间')) ci.ap = i;
  if (h.includes('生产质量') && h.includes('放行时间')) ci.qa = i;
});
console.log('关键列索引:', JSON.stringify(ci));

// ── 6. 处理数据行（与 build_poster.js 相同的匹配规则） ──
// 优先用医疗机构编码(col32)，空则用处方来源医疗机构编号(col5)
var records = [];
var unmatched = [];
for (var i = 2; i < bsRows.length; i++) {
  var row = bsRows[i];
  if (!row) continue;
  var code1 = String(row[ci.org] || '').trim();
  var code2 = String(row[5] || '').trim();
  var m = (code1 && masterMap[code1]) ? masterMap[code1] : ((code2 && masterMap[code2]) ? masterMap[code2] : null);

  var hosp = '', prov = '', city = '';
  if (m) {
    hosp = m.name; prov = m.prov; city = m.city;
  } else {
    var fallbackHosp = String(row[ci.orgName] || row[6] || '').trim();
    if (code1 || code2) unmatched.push({ row: i, code1: code1, code2: code2, rawHosp: fallbackHosp });
    hosp = fallbackHosp;
  }
  if (!hosp) hosp = '未知医院';
  if (prov === '新加坡' || prov.indexOf('新加坡') >= 0) { prov = ''; city = ''; } // 排除新加坡

  records.push({
    no: String(row[1] || '').trim(),
    hosp: hosp,
    prov: prov,
    city: city,
    coe: m ? m.coe : '',
    od: excelToDate(row[ci.od]),
    re: parseDt(row[ci.re]),
    ap: parseDt(row[ci.ap]),
    qa: parseDt(row[ci.qa])
  });
}

// ── 7. 主数据匹配质量门禁（与 build_poster.js 相同） ──
if (unmatched.length > 0) {
  console.error('\n========================================');
  console.error('⚠️  警告：发现 ' + unmatched.length + ' 条记录无法匹配主数据！');
  console.error('以下编码在 masterdata 中均未找到：');
  var seen = {};
  unmatched.forEach(function(w) {
    var key = w.code1 || w.code2;
    if (!seen[key]) {
      seen[key] = true;
      console.error('  · 编码: ' + key + '  原始医院名: ' + (w.rawHosp || '未知'));
    }
  });
  console.error('请将以上编码添加至 masterdata.xlsx 后重新运行！');
  console.error('========================================\n');
  process.exit(1);
}
console.log('有效记录数:', records.length);

// ── 8. 统计指标（口径与 build_poster.js 完全一致） ──
// 数据截止日 = 今天；YTD = 当年 1 月 1 日 ~ 今天
var DP = toLocal(new Date());
var Y = DP.slice(0, 4);
function inRange(d, f, t) { return d && d >= f && d <= t; }

var ytdO = 0, ytdR = 0, ytdA = 0, ytdQ = 0;
var provMap = {}; // 省份 → {o, r, a, q}
var cityMap = {}; // 城市 → {o, r, a, q}
function addProv(p, k) {
  if (!p) return;
  if (!provMap[p]) provMap[p] = { o: 0, r: 0, a: 0, q: 0 };
  provMap[p][k]++;
}
function addCity(c, k) {
  if (!c) return;
  if (!cityMap[c]) cityMap[c] = { o: 0, r: 0, a: 0, q: 0 };
  cityMap[c][k]++;
}
records.forEach(function(r) {
  if (inRange(r.od, Y + '-01-01', DP)) { ytdO++; addProv(r.prov, 'o'); addCity(r.city, 'o'); }
  if (inRange(r.re, Y + '-01-01', DP)) { ytdR++; addProv(r.prov, 'r'); addCity(r.city, 'r'); }
  if (inRange(r.ap, Y + '-01-01', DP)) { ytdA++; addProv(r.prov, 'a'); addCity(r.city, 'a'); }
  if (inRange(r.qa, Y + '-01-01', DP)) { ytdQ++; addProv(r.prov, 'q'); addCity(r.city, 'q'); }
});

// 省份名称 → GeoJSON 全称（与 build_poster.js 相同映射）
var provGeoMap = { '香港': '香港特别行政区', '澳门': '澳门特别行政区', '台湾': '台湾省' };
var PROV = {};
Object.keys(provMap).forEach(function(p) {
  var g = provGeoMap[p] !== undefined ? provGeoMap[p] : p;
  PROV[g] = provMap[p];
});

// ── 8b. 月度下单/回输（当年 + 去年 各 12 个月，用于双折线同比） ──
var LY = String(parseInt(Y, 10) - 1);
var monO = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var monR = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var monOLY = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var monRLY = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
records.forEach(function(r) {
  if (r.od) {
    var mi = parseInt(r.od.slice(5, 7), 10) - 1;
    if (mi >= 0 && mi < 12) {
      if (r.od.slice(0, 4) === Y) monO[mi]++;
      if (r.od.slice(0, 4) === LY) monOLY[mi]++;
    }
  }
  if (r.re) {
    var mj = parseInt(r.re.slice(5, 7), 10) - 1;
    if (mj >= 0 && mj < 12) {
      if (r.re.slice(0, 4) === Y) monR[mj]++;
      if (r.re.slice(0, 4) === LY) monRLY[mj]++;
    }
  }
});

// ── 8c. MTD（当月 1 日 ~ 今天）下单/回输/单采/放行 ──
var mtdStart = Y + '-' + DP.slice(5, 7) + '-01';
function mtdCount(f) { return records.filter(function(r) { return inRange(r[f], mtdStart, DP); }).length; }
var mtdO = mtdCount('od'), mtdR = mtdCount('re'), mtdA = mtdCount('ap'), mtdQ = mtdCount('qa');

// ── 8d. Top10 医院（下单 / 回输）+ 同比（去年同截止日 YTD） ──
var lyDP = LY + DP.slice(4); // 去年同月同日截止，用于 YTD 同比
var hospO = {}, hospR = {}, hospOly = {}, hospRly = {};
records.forEach(function(r) {
  if (!r.hosp || r.hosp === '未知医院') return;
  if (inRange(r.od, Y + '-01-01', DP)) hospO[r.hosp] = (hospO[r.hosp] || 0) + 1;
  if (inRange(r.re, Y + '-01-01', DP)) hospR[r.hosp] = (hospR[r.hosp] || 0) + 1;
  if (inRange(r.od, LY + '-01-01', lyDP)) hospOly[r.hosp] = (hospOly[r.hosp] || 0) + 1;
  if (inRange(r.re, LY + '-01-01', lyDP)) hospRly[r.hosp] = (hospRly[r.hosp] || 0) + 1;
});
function yoy(cur, ly) { return ly > 0 ? (cur - ly) / ly * 100 : null; } // null → 前端显示 --
function topHosp(map, lyMap, n) {
  return Object.keys(map).map(function(h) {
    var ly = lyMap[h] || 0;
    return { name: h, v: map[h], yoy: yoy(map[h], ly) };
  }).sort(function(a, b) { return b.v - a.v; }).slice(0, n);
}
var TOP_O = topHosp(hospO, hospOly, 30);
var TOP_R = topHosp(hospR, hospRly, 30);

// ── 8e. 当月每天 下单 / 回输（当月 1 号 ~ 今天，按日期 + 医院明细） ──
function hospList(cnt) {
  return Object.keys(cnt).map(function(h) { return { name: h, v: cnt[h] }; })
    .sort(function(a, b) { return b.v - a.v; });
}
var last7 = [];
var _cur = new Date((Y + '-' + DP.slice(5, 7) + '-01').replace(/-/g, '/')); // 斜杠=本地解析，与 _end 一致，避免时区差导致当天缺失
var _end = new Date(DP.replace(/-/g, '/'));
while (_cur <= _end) {
  var ds = toLocal(_cur);
  var oCnt = {}, rCnt = {};
  records.forEach(function(r) {
    if (!r.hosp || r.hosp === '未知医院') return;
    if (r.od === ds) oCnt[r.hosp] = (oCnt[r.hosp] || 0) + 1;
    if (r.re === ds) rCnt[r.hosp] = (rCnt[r.hosp] || 0) + 1;
  });
  last7.push({ date: ds, orders: hospList(oCnt), reinfusion: hospList(rCnt) });
  _cur.setDate(_cur.getDate() + 1);
}

// ── 8f. 各省份 Top 5 下单 / 回输医院（用于省份浮窗右侧榜单） ──
var provHospO = {}, provHospR = {}, provHospOly = {}, provHospRly = {};
records.forEach(function(r) {
  if (!r.hosp || r.hosp === '未知医院' || !r.prov) return;
  if (inRange(r.od, Y + '-01-01', DP)) {
    if (!provHospO[r.prov]) provHospO[r.prov] = {};
    provHospO[r.prov][r.hosp] = (provHospO[r.prov][r.hosp] || 0) + 1;
  }
  if (inRange(r.re, Y + '-01-01', DP)) {
    if (!provHospR[r.prov]) provHospR[r.prov] = {};
    provHospR[r.prov][r.hosp] = (provHospR[r.prov][r.hosp] || 0) + 1;
  }
  if (inRange(r.od, LY + '-01-01', lyDP)) {
    if (!provHospOly[r.prov]) provHospOly[r.prov] = {};
    provHospOly[r.prov][r.hosp] = (provHospOly[r.prov][r.hosp] || 0) + 1;
  }
  if (inRange(r.re, LY + '-01-01', lyDP)) {
    if (!provHospRly[r.prov]) provHospRly[r.prov] = {};
    provHospRly[r.prov][r.hosp] = (provHospRly[r.prov][r.hosp] || 0) + 1;
  }
});
function provTop(map, lyMap, n) {
  return Object.keys(map).map(function(h) {
    return { name: h, v: map[h], yoy: yoy(map[h], lyMap[h] || 0) };
  }).sort(function(a, b) { return b.v - a.v; }).slice(0, n);
}
var HOSP_PROV = { O: {}, R: {} };
Object.keys(provHospO).forEach(function(p) {
  var g = provGeoMap[p] !== undefined ? provGeoMap[p] : p;
  var list = provTop(provHospO[p], provHospOly[p] || {}, 5);
  if (list.length) HOSP_PROV.O[g] = list;
});
Object.keys(provHospR).forEach(function(p) {
  var g = provGeoMap[p] !== undefined ? provGeoMap[p] : p;
  var list = provTop(provHospR[p], provHospRly[p] || {}, 5);
  if (list.length) HOSP_PROV.R[g] = list;
});

// ── 8g. COE 医院销量占比（下单/回输 YTD，按 SCOE/COE/RCOE/Others 分类） ──
function coeCat(v) { return (v === 'COE' || v === 'SCOE' || v === 'RCOE') ? v : 'Others'; }
var coeO = { SCOE: 0, COE: 0, RCOE: 0, Others: 0 };
var coeR = { SCOE: 0, COE: 0, RCOE: 0, Others: 0 };
records.forEach(function(r) {
  var cat = coeCat(r.coe);
  if (inRange(r.od, Y + '-01-01', DP)) coeO[cat] = (coeO[cat] || 0) + 1;
  if (inRange(r.re, Y + '-01-01', DP)) coeR[cat] = (coeR[cat] || 0) + 1;
});

// ── 8i. 城市→省份（用于大地图轮播按省份分组） ──
var CITY_PROV = {};
records.forEach(function(r) {
  if (r.city && r.prov && !(r.city in CITY_PROV)) {
    CITY_PROV[r.city] = (provGeoMap[r.prov] !== undefined ? provGeoMap[r.prov] : r.prov);
  }
});

// ── 8h. YTD 异常订单（异常订单.xlsx 当年累计：PBMC分选失败+第一次+第二次生产失败） ──
var abnPath = path.join(rawDir, '异常订单.xlsx');
if (!fs.existsSync(abnPath)) abnPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', '异常订单.xlsx');
var abnWb = XLSX.readFile(abnPath);
var abnRows = XLSX.utils.sheet_to_json(abnWb.Sheets[abnWb.SheetNames[0]], { header: 1 });
var abnPbmc = 0, abnFirst = 0, abnSecond = 0;
for (var ai = 1; ai < abnRows.length; ai++) {
  var ar = abnRows[ai];
  if (!ar) continue;
  var ym = String(ar[0] || '').trim();
  if (ym.slice(0, 4) !== Y) continue;
  abnPbmc += Number(ar[1]) || 0;
  abnFirst += Number(ar[2]) || 0;
  abnSecond += Number(ar[3]) || 0;
}
var abnTotal = abnPbmc + abnFirst + abnSecond;

// ── 8j. Page2：海外/商业化数据（order dict.xlsx 按 订单号↔合同号 匹配） ──
// dict 列：1=订单号, 11=海外导流(国籍/常驻地), 12=患者首次付款时间, 21=导流
// 分类：空=国内导流, 医生导流/OB导流=海外导流(来华→中国), 国家+NPP/商业化=市场化(按订单医院国家), 国内三方导流=不计
var dictPath = path.join(rawDir, 'order dict.xlsx');
if (!fs.existsSync(dictPath)) dictPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', 'order dict.xlsx');
var dictRows = XLSX.utils.sheet_to_json(XLSX.readFile(dictPath).Sheets['Sheet1'], { header: 1, defval: '' });
var dictMap = {}, OVERSEAS = {};
dictRows.slice(1).forEach(function (r) {
  var no = String(r[1] || '').trim();
  if (!no) return;
  var flow = String(r[21] || '').trim();
  var natl = String(r[11] || '').trim();
  if (natl) OVERSEAS[natl] = true;
  var cat = 'dom';
  if (flow.indexOf('NPP') >= 0) cat = 'npp';
  else if (flow.indexOf('商业化') >= 0) cat = 'com';
  else if (flow === '医生导流' || flow === 'OB导流') cat = 'ref';
  else if (flow === '国内三方导流') cat = 'skip';
  var pm = flow.match(/^(.*?)(NPP|商业化)$/);
  dictMap[no] = { cat: cat, flow: flow, natl: natl, prefix: pm ? pm[1].trim() : '' };
});
// 医院名 → 国家（masterdata「省份」；境外医院即国家，含新加坡这种在上面被清空省份的）
var hospCountry = {};
mdRows.forEach(function (r) {
  var nm = String(r['标准医院名称'] || '').trim();
  var pv = String(r['省份'] || '').trim();
  if (nm && pv) hospCountry[nm] = pv;
});
function normCN(c) {
  if (!c) return null;
  return String(c).trim(); // 港澳台不并入中国，单独展示
}
function isOverseas(c) { return OVERSEAS[c] || c === '中国'; }
var p2Card = { all: { npO: 0, npR: 0, dO: 0, dR: 0 }, y: {} };
var p2Left = { all: {}, y: {} }, p2Right = { all: {}, y: {} };
var p2RightD = { all: {}, y: {} }; // 右侧表格：国家 × 导流分类
var p2Top = { all: {}, y: {} };
var yearSet = {};
function cnt(bucket, yk, country, k) {
  if (!country) return;
  bucket.all[country] = bucket.all[country] || { o: 0, r: 0 };
  bucket.all[country][k]++;
  bucket.y[yk] = bucket.y[yk] || {};
  bucket.y[yk][country] = bucket.y[yk][country] || { o: 0, r: 0 };
  bucket.y[yk][country][k]++;
}
function cntCat(bucket, yk, country, cat, k) {
  if (!country || !cat) return;
  bucket.all[country] = bucket.all[country] || {};
  bucket.all[country][cat] = bucket.all[country][cat] || { o: 0, r: 0 };
  bucket.all[country][cat][k]++;
  bucket.y[yk] = bucket.y[yk] || {};
  bucket.y[yk][country] = bucket.y[yk][country] || {};
  bucket.y[yk][country][cat] = bucket.y[yk][country][cat] || { o: 0, r: 0 };
  bucket.y[yk][country][cat][k]++;
}
function topCnt(yk, country, hosp, k) {
  if (!country || !hosp) return;
  var a = p2Top.all[country] || (p2Top.all[country] = { o: {}, r: {} });
  a[k][hosp] = (a[k][hosp] || 0) + 1;
  p2Top.y[yk] = p2Top.y[yk] || {};
  var b = p2Top.y[yk][country] || (p2Top.y[yk][country] = { o: {}, r: {} });
  b[k][hosp] = (b[k][hosp] || 0) + 1;
}
records.forEach(function (r) {
  var d = dictMap[r.no];
  if (!d || d.cat === 'skip') return;
  var country;
  if (d.cat === 'npp' || d.cat === 'com') {
    var hc = hospCountry[r.hosp];
    country = normCN(isOverseas(hc) ? hc : d.prefix);
  } else if (d.cat === 'ref') {
    country = normCN(d.natl);
  } else {
    country = '中国';
  }
  var isNp = (d.cat === 'npp' || d.cat === 'com');
  var isD = (d.cat === 'ref'); // 国内导流仅统计医生导流/OB导流；导流列为空的国内直接患者不计入
  // 与 page1 口径一致：下单按下单日期年，回输按回输日期年
  var oy = r.od ? r.od.slice(0, 4) : null;
  var ry = r.re ? r.re.slice(0, 4) : null;
  if (oy) {
    yearSet[oy] = true;
    var yko = String(oy);
    if (!p2Card.y[yko]) p2Card.y[yko] = { npO: 0, npR: 0, dO: 0, dR: 0 };
    if (isNp) { p2Card.all.npO++; p2Card.y[yko].npO++; }
    if (isD) { p2Card.all.dO++; p2Card.y[yko].dO++; }
    if (d.cat === 'ref') { cnt(p2Left, yko, country, 'o'); cntCat(p2RightD, yko, '中国', d.flow, 'o'); topCnt(yko, '中国', r.hosp, 'o'); }
    if (isNp) { cnt(p2Right, yko, country, 'o'); cnt(p2Left, yko, country, 'o'); cntCat(p2RightD, yko, country, d.cat === 'npp' ? 'NPP' : '商业化', 'o'); topCnt(yko, country, r.hosp, 'o'); }
  }
  if (ry) {
    yearSet[ry] = true;
    var ykr = String(ry);
    if (!p2Card.y[ykr]) p2Card.y[ykr] = { npO: 0, npR: 0, dO: 0, dR: 0 };
    if (isNp) { p2Card.all.npR++; p2Card.y[ykr].npR++; }
    if (isD) { p2Card.all.dR++; p2Card.y[ykr].dR++; }
    if (d.cat === 'ref') { cnt(p2Left, ykr, country, 'r'); cntCat(p2RightD, ykr, '中国', d.flow, 'r'); topCnt(ykr, '中国', r.hosp, 'r'); }
    if (isNp) { cnt(p2Right, ykr, country, 'r'); cnt(p2Left, ykr, country, 'r'); cntCat(p2RightD, ykr, country, d.cat === 'npp' ? 'NPP' : '商业化', 'r'); topCnt(ykr, country, r.hosp, 'r'); }
  }
});
function topToLists(tb) {
  var out = {};
  Object.keys(tb).forEach(function (c) {
    out[c] = {
      o: Object.keys(tb[c].o).map(function (h) { return { name: h, v: tb[c].o[h] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 10),
      r: Object.keys(tb[c].r).map(function (h) { return { name: h, v: tb[c].r[h] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 10)
    };
  });
  return out;
}
var p2TopList = { all: topToLists(p2Top.all), y: {} };
Object.keys(p2Top.y).forEach(function (yk) { p2TopList.y[yk] = topToLists(p2Top.y[yk]); });
var P2 = { YEARS: Object.keys(yearSet).sort(), CARD: p2Card, LEFT: p2Left, RIGHT: p2Right, RIGHTD: p2RightD, TOP10: p2TopList };

// ── 9. 输出 js/data.js（页面直接 <script> 引用） ──
var outJS = '/* 自动生成文件 — 请勿手动修改，运行 node build_data.js 刷新 */\n' +
  '/* 数据源: ' + bsFile + ' | 数据截止: ' + DP + ' */\n' +
  'var BOARD_DATA = ' + JSON.stringify({
    UPDATED: UPDATED,
    DP: DP,
    Y: Y,
    YTD: { O: ytdO, R: ytdR, A: ytdA, Q: ytdQ },
    MTD: { O: mtdO, R: mtdR, A: mtdA, Q: mtdQ },
    MONTH: { O: monO, R: monR, OLY: monOLY, RLY: monRLY },
    PROV: PROV,
    CITY: cityMap,
    TOP_O: TOP_O,
    TOP_R: TOP_R,
    LAST7: last7,
    HOSP_PROV: HOSP_PROV,
    COE: { O: coeO, R: coeR },
    ABN: { Y: Y, total: abnTotal, pbmc: abnPbmc, first: abnFirst, second: abnSecond },
    CITY_PROV: CITY_PROV,
    P2: P2
  }, null, 2) + ';\n';
var outPath = path.join(__dirname, 'js', 'data.js');
fs.writeFileSync(outPath, outJS, 'utf-8');

console.log('\n===== 数据摘要 =====');
console.log('数据截止日:', DP);
console.log('YTD 下单:', ytdO, '  YTD 回输:', ytdR, '  YTD 单采:', ytdA, '  YTD 放行:', ytdQ);
console.log('城市数:', Object.keys(cityMap).length);
console.log('MTD 下单:', mtdO, ' / 回输:', mtdR, ' / 单采:', mtdA, ' / 放行:', mtdQ);
console.log('月度下单:', monO.join(','));
console.log('月度回输:', monR.join(','));
console.log('Top30 下单医院:', TOP_O.map(function(h) { return h.name + '(' + h.v + ',' + (h.yoy === null ? '--' : h.yoy.toFixed(1) + '%') + ')'; }).join(' | '));
console.log('Top30 回输医院:', TOP_R.map(function(h) { return h.name + '(' + h.v + ',' + (h.yoy === null ? '--' : h.yoy.toFixed(1) + '%') + ')'; }).join(' | '));
var noCity = records.filter(function(r) { return r.prov && !r.city; }).length;
if (noCity > 0) console.log('⚠️ ' + noCity + ' 条记录城市为空（不计入城市维度）');
var citySumO = 0; Object.keys(cityMap).forEach(function(c) { citySumO += cityMap[c].o; });
var sgO = records.filter(function(r) { return !r.prov && inRange(r.od, Y + '-01-01', DP); }).length;
if (citySumO + sgO !== ytdO) console.log('⚠️ 城市下单合计 ' + citySumO + '（+新加坡 ' + sgO + '）≠ YTD ' + ytdO);
Object.keys(cityMap).sort(function(a, b) { return (cityMap[b].o + cityMap[b].r) - (cityMap[a].o + cityMap[a].r); }).forEach(function(c) {
  console.log('  ' + c + ': 下单 ' + cityMap[c].o + ' / 回输 ' + cityMap[c].r);
});
console.log('\n✅ 输出文件:', outPath);
