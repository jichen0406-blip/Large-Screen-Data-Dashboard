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

// ── 2b. 合并手工补录订单（manual bs order.xlsx；列顺序与 bs_order 一致，仅表头在第 0 行） ──
var manualFile = 'manual bs order.xlsx';
var manualPath = path.join(rawDir, manualFile);
if (!fs.existsSync(manualPath)) manualPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', manualFile);
if (fs.existsSync(manualPath)) {
  var mWb = XLSX.readFile(manualPath);
  var mRows = XLSX.utils.sheet_to_json(mWb.Sheets[mWb.SheetNames[0]], { header: 1 });
  for (var mi = 1; mi < mRows.length; mi++) { if (mRows[mi]) bsRows.push(mRows[mi]); }
  console.log('已合并手工订单:', mRows.length - 1, '条（' + manualFile + '）');
} else {
  console.warn('⚠️ 未找到', manualFile, '，跳过手工订单合并');
}

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
  if (h === '支付方式') ci.pay = i;
  if (h === '单采预约时间') ci.apmt = i;
  if (h === '仓库接收单采血时间') ci.receive = i;
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
    qa: parseDt(row[ci.qa]),
    pay: String(row[ci.pay] || '').trim(),
    apmt: excelToDate(row[ci.apmt]),
    receive: excelToDate(row[ci.receive])
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
var curEnd = Y + '-' + DP.slice(5, 7) + '-31'; // 当年当月最后一天（同比按完整月，即使当月未结束）
var lyDP = LY + '-' + DP.slice(5, 7) + '-31'; // 去年同月最后一天，用于 YTD 同比
var hospO = {}, hospR = {}, hospOly = {}, hospRly = {};
records.forEach(function(r) {
  if (!r.hosp || r.hosp === '未知医院') return;
  if (inRange(r.od, Y + '-01-01', curEnd)) hospO[r.hosp] = (hospO[r.hosp] || 0) + 1;
  if (inRange(r.re, Y + '-01-01', curEnd)) hospR[r.hosp] = (hospR[r.hosp] || 0) + 1;
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

// ── 8k. Page3：目标（Target.xlsx 公司目标）+ 月度实际下单/回输 ──
var tgtPath = path.join(rawDir, 'Target.xlsx');
if (!fs.existsSync(tgtPath)) tgtPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', 'Target.xlsx');
var tgtWb = null;
try { tgtWb = XLSX.readFile(tgtPath); } catch (e) { console.error('⚠️ 读取 Target.xlsx 失败:', e.message); }
var TARGET = {};
try {
  var tgtRows = XLSX.utils.sheet_to_json(tgtWb.Sheets['公司目标'], { header: 1, defval: '' });
  for (var ti = 1; ti < tgtRows.length; ti++) {
    var tr = tgtRows[ti];
    var ym = String(tr[0] || '').trim();
    if (!ym || !/^\d{6}$/.test(ym)) continue;
    var yk = ym.slice(0, 4) + '-' + ym.slice(4, 6); // 'YYYYMM' → 'YYYY-MM'，与月度实际键一致
    TARGET[yk] = { o: Number(tr[1]) || 0, r: Number(tr[2]) || 0 };
  }
} catch (e) { console.error('⚠️ 读取 Target.xlsx 失败:', e.message); }
var p3MO = {}, p3MR = {}; // 每月实际下单/回输（'YYYY-MM'）
records.forEach(function(r) {
  if (r.od) { var k = r.od.slice(0, 7); p3MO[k] = (p3MO[k] || 0) + 1; }
  if (r.re) { var k2 = r.re.slice(0, 7); p3MR[k2] = (p3MR[k2] || 0) + 1; }
});
var P3 = { TARGET: TARGET, MONTH_O: p3MO, MONTH_R: p3MR };

// ── 8l. Page3 新表：挑战目标（挑战指标）+ 辖区 AM/地区 月度达成（4.1/4.2/4.3/6.1/6.2） ──
// 目标：Target.xlsx「挑战目标」sheet（Region: DOM=国内 / HK=香港 / SG=新加坡 / KSA=沙特）
var CHAL = {};
try {
  var chalRows = XLSX.utils.sheet_to_json(tgtWb.Sheets['挑战目标'], { header: 1, defval: '' });
  for (var chi = 1; chi < chalRows.length; chi++) {
    var cr = chalRows[chi];
    var cym = String(cr[0] || '').trim();
    if (!/^\d{6}$/.test(cym)) continue;
    var cyk = cym.slice(0, 4) + '-' + cym.slice(4, 6);
    var creg = String(cr[1] || '').trim();
    var cam = String(cr[2] || '').trim();
    var regB = CHAL[cyk] || (CHAL[cyk] = {});
    if (creg === 'DOM') {
      var domB = regB.DOM || (regB.DOM = {});
      var s1 = domB[cam] || (domB[cam] = { o: 0, r: 0 });
      s1.o += Number(cr[3]) || 0; s1.r += Number(cr[4]) || 0;
    } else {
      var regB2 = regB[creg] || (regB[creg] = {});
      var s2 = regB2._ || (regB2._ = { o: 0, r: 0 });
      s2.o += Number(cr[3]) || 0; s2.r += Number(cr[4]) || 0;
    }
  }
} catch (e) { console.error('⚠️ 读取挑战目标失败:', e.message); }

// 表格 1/2 目标：Target.xlsx「公司DOM&OB目标」sheet（分类: DOM=国内 / OB=海外）
var COMP = {};
try {
  var compRows = XLSX.utils.sheet_to_json(tgtWb.Sheets['公司DOM&OB目标'], { header: 1, defval: '' });
  for (var ci2 = 1; ci2 < compRows.length; ci2++) {
    var cr2 = compRows[ci2];
    var cym2 = String(cr2[0] || '').trim();
    if (!/^\d{6}$/.test(cym2)) continue;
    var cyk2 = cym2.slice(0, 4) + '-' + cym2.slice(4, 6);
    var cat2 = String(cr2[1] || '').trim();
    if (cat2 !== 'DOM' && cat2 !== 'OB') continue;
    var cb = COMP[cyk2] || (COMP[cyk2] = {});
    var cs = cb[cat2] || (cb[cat2] = { o: 0, r: 0 });
    cs.o += Number(cr2[2]) || 0; cs.r += Number(cr2[3]) || 0;
  }
} catch (e) { console.error('⚠️ 读取 公司DOM&OB目标 失败:', e.message); }

// 达成归属所需映射：masterdata 医院→(AM,Region) + Sheet3 离职AM清洗 + orderdict(AM/回输AM/回输医院/导流)
var mdRowsS1 = XLSX.utils.sheet_to_json(mdWb.Sheets['Sheet1'], { header: 1, defval: '' });
var mdByName = {};
mdRowsS1.slice(1).forEach(function (mr) {
  var nm = String(mr[3] || '').trim();
  var info = { am: String(mr[5] || '').trim(), reg: String(mr[7] || '').trim() };
  if (nm) mdByName[nm] = info;
});
var amClean = {};
try {
  var s3Rows = XLSX.utils.sheet_to_json(mdWb.Sheets['Sheet3'], { header: 1, defval: '' });
  s3Rows.forEach(function (sr) { var k = String(sr[0] || '').trim(); if (k) amClean[k] = String(sr[1] || '').trim(); });
} catch (e) { console.error('⚠️ 读取 masterdata Sheet3(AM清洗) 失败:', e.message); }
var dictInfo = {};
try {
  dictRows.slice(1).forEach(function (dr) {
    var no = String(dr[1] || '').trim();
    if (!no) return;
    dictInfo[no] = { am: String(dr[3] || '').trim(), ram: String(dr[27] || '').trim(), rhc: String(dr[25] || '').trim(), rhn: String(dr[26] || '').trim(), flow: String(dr[21] || '').trim(), cancel: String(dr[6] || '').trim(), resume: excelToDate(dr[13]), note: String(dr[10] || '').trim(), modZq: String(dr[15] || '').trim() };
  });
} catch (e) { console.error('⚠️ 读取 order dict(AM) 失败:', e.message); }
var OV_AM = { HK_AM1: 'HK', SG_AM: 'SG', KSA_AM: 'KSA' }; // 海外AM兜底 → 对应地区
var REG_LABEL = { HK: '香港', SG: '新加坡', KSA: '沙特' };
var P3T_AMS = ['崔珺', '赵蕊', '赵俊兴', '龚卉', '高威龙', '董硕', '兰明金', '李磊'];

var ptND = {}, ptREG = {}, ptOV = {}; // 键：'YYYY-MM'
function ptInit(k) {
  if (!ptND[k]) {
    ptND[k] = { dom: { o: 0, r: 0 }, ov: { o: 0, r: 0 } };
    ptREG[k] = {};
    ptOV[k] = { docRef: { o: 0, r: 0 }, obRef: { o: 0, r: 0 }, hk: { o: 0, r: 0 }, sg: { o: 0, r: 0 }, ksa: { o: 0, r: 0 }, total: { o: 0, r: 0 } };
  }
}
function ptReg(k, ent) { var b = ptREG[k]; if (!b[ent]) b[ent] = { o: 0, r: 0 }; return b[ent]; }
// 返回 { ov, regKey, am }：ov=海外; regKey=海外地区键或''; am=清洗后AM
// 回输与下单统一用下单医院（回输医院字段基本全空，仅个别记录，不采用）
function attribP3(r, d, isRe) {
  var info = mdByName[r.hosp];
  var reg = info ? info.reg : '';
  var raw = isRe ? (d.ram || d.am || (info && info.am) || '') : (d.am || (info && info.am) || '');
  var am = amClean[raw] || raw;
  if (OV_AM[am]) reg = OV_AM[am];
  return { ov: !!(reg && reg !== 'DOM'), regKey: (reg && reg !== 'DOM') ? reg : '', am: am };
}
// 统计一单（fld='o'下单 / 'r'回输）到 ND/REG/OV 三桶；未知海外地区安全兜底
function addP3(k, d, fld, a) {
  if (a.ov) ptND[k].ov[fld]++; else ptND[k].dom[fld]++;
  var ent = a.ov ? (REG_LABEL[a.regKey] || a.regKey) : a.am;
  ptReg(k, ent)[fld]++;
  if (!a.ov) ptReg(k, '国内')[fld]++;
  ptReg(k, 'total')[fld]++;
  var cat = a.ov
    ? (ptOV[k][a.regKey.toLowerCase()] ? a.regKey.toLowerCase() : null)
    : (d.flow === '医生导流' ? 'docRef' : d.flow === 'OB导流' ? 'obRef' : null);
  if (cat) { ptOV[k][cat][fld]++; ptOV[k].total[fld]++; }
}
records.forEach(function (r) {
  var d = dictInfo[r.no] || {};
  if (r.od) { var k1 = r.od.slice(0, 7); ptInit(k1); addP3(k1, d, 'o', attribP3(r, d, false)); }
  if (r.re) { var k2 = r.re.slice(0, 7); ptInit(k2); addP3(k2, d, 'r', attribP3(r, d, true)); }
});

// ── 8l2. Page7 辖区数据管理3：医院/省份 月度明细（仅国内 DOM；AM 归属同 P3T） ──
// 键：'YYYY-MM' → 'AM|省份|城市|医院' → {o, r}；下单/回输分别按订单归属AM统计
var ptHOSP = {}; // P3T.HOSP
function hpInit(k) { if (!ptHOSP[k]) ptHOSP[k] = {}; }
records.forEach(function (r) {
  var d = dictInfo[r.no] || {};
  if (r.od) {
    var a1 = attribP3(r, d, false);
    if (!a1.ov && r.prov) {
      var k1 = r.od.slice(0, 7); hpInit(k1);
      var key1 = a1.am + '|' + r.prov + '|' + (r.city || '') + '|' + r.hosp;
      var b1 = ptHOSP[k1][key1] || (ptHOSP[k1][key1] = { o: 0, r: 0 });
      b1.o++;
    }
  }
  if (r.re) {
    var a2 = attribP3(r, d, true);
    if (!a2.ov && r.prov) {
      var k2 = r.re.slice(0, 7); hpInit(k2);
      var key2 = a2.am + '|' + r.prov + '|' + (r.city || '') + '|' + r.hosp;
      var b2 = ptHOSP[k2][key2] || (ptHOSP[k2][key2] = { o: 0, r: 0 });
      b2.r++;
    }
  }
});
// ── 8l3. Page7 医院「最近一次下单日期」：按医院实体（省份|城市|医院名）合并，历史全量、不随任何筛选变动 ──
// 仅国内 DOM；取该医院全部下单（跨 AM）的最大合同创建日期 od（'YYYY-MM-DD'）
var ptHSLast = {}; // P3T.HSLAST：'省份|城市|医院名' → 'YYYY-MM-DD'
records.forEach(function (r) {
  if (!r.od) return;
  var d = dictInfo[r.no] || {};
  var a = attribP3(r, d, false);
  if (a.ov || !r.prov) return;
  var hk = r.prov + '|' + (r.city || '') + '|' + r.hosp;
  if (!ptHSLast[hk] || r.od > ptHSLast[hk]) ptHSLast[hk] = r.od;
});
var P3T = { AMS: P3T_AMS, CHAL: CHAL, COMP: COMP, ND: ptND, REG: ptREG, OV: ptOV, HOSP: ptHOSP, HSLAST: ptHSLast };

// ── 8m. Page3 全球注册进度：注册项目数据.xlsx（世界地图 + 甘特图） ──
var regPath = path.join(rawDir, '注册项目数据.xlsx');
if (!fs.existsSync(regPath)) regPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', '注册项目数据.xlsx');
var REG = { updated: '', regions: [], items: [] };
try {
  var regWb = XLSX.readFile(regPath);
  var regRows = XLSX.utils.sheet_to_json(regWb.Sheets[regWb.SheetNames[0]], { header: 1, defval: '' });
  var regHdr = regRows[0] || [];
  var rci = {};
  regHdr.forEach(function (h, i) {
    h = String(h || '').trim();
    if (h === '区域') rci.region = i;
    else if (h === '国家/地区') rci.name = i;
    else if (h === '运营方式') rci.mode = i;
    else if (h === '申报状态') rci.status = i;
    else if (h === '申报路径/资格认定') rci.path = i;
    else if (h === '预估获批时间') rci.approval = i;
  });
  var STATUS_MAP = { '已获批': 'approved', 'NDA申请已提交': 'submitted', '评审中': 'review', 'NDA申报计划中': 'planned' };
  var STATUS_LABEL = { 'approved': '已获批', 'submitted': '已提交', 'review': '评审中', 'planned': '计划中' };
  var GEO_NAME = {
    '中国澳门': '澳门', '中国香港': '香港', '新加坡': 'Singapore', '马来西亚': 'Malaysia',
    '泰国': 'Thailand', '越南': 'Vietnam', '印尼': 'Indonesia', '沙特阿拉伯': 'Saudi Arabia',
    '阿联酋': 'United Arab Emirates', '科威特': 'Kuwait', '日本': 'Japan', '韩国': 'Korea',
    '巴西': 'Brazil', '俄罗斯': 'Russia', '澳大利亚': 'Australia', '加拿大': 'Canada'
  };
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function parseApproval(v) {
    if (v === '' || v == null) return { txt: '', ts: null };
    if (typeof v === 'number') {
      var s = String(v);
      var p = s.split('.');
      var y = parseInt(p[0], 10) || 0;
      var m = p[1] ? parseInt(p[1], 10) : 1;
      if (m < 1 || m > 12) m = 1;
      return { txt: y + '.' + pad2(m), ts: y + '-' + pad2(m) + '-01' };
    }
    var s2 = String(v).trim();
    var m2 = s2.match(/(\d{4})\.Q([1-4])/);
    if (m2) {
      var yy = m2[1], q = parseInt(m2[2], 10);
      var em = q * 3;
      return { txt: yy + ' Q' + q, ts: yy + '-' + pad2(em) + '-01' };
    }
    return { txt: s2, ts: null };
  }
  var regSeen = {};
  for (var ri = 1; ri < regRows.length; ri++) {
    var rr = regRows[ri];
    if (!rr) continue;
    var rname = String(rr[rci.name] || '').trim();
    if (!rname || regSeen[rname]) continue;
    regSeen[rname] = true;
    var rstatus = String(rr[rci.status] || '').trim();
    var status = STATUS_MAP[rstatus] || 'planned';
    var ap = parseApproval(rr[rci.approval]);
    REG.items.push({
      region: String(rr[rci.region] || '').trim(),
      name: rname,
      geo: GEO_NAME[rname] || rname,
      mode: String(rr[rci.mode] || '').trim(),
      status: status,
      statusLabel: STATUS_LABEL[status],
      path: String(rr[rci.path] || '').trim(),
      approvalTxt: ap.txt,
      approvalTs: ap.ts
    });
  }
  REG.items.push({
    region: '东亚',
    name: '中国',
    geo: 'China',
    mode: '自营',
    status: 'approved',
    statusLabel: '已获批',
    path: '',
    approvalTxt: '2023.06',
    approvalTs: '2023-06-01'
  });
  REG.items.forEach(function (it) { if (REG.regions.indexOf(it.region) < 0) REG.regions.push(it.region); });
  REG.updated = fmtDT(fs.statSync(regPath).mtime);
  console.log('注册项目国家数:', REG.items.length, '| 区域:', REG.regions.join('/'));
} catch (e) {
  console.error('⚠️ 读取 注册项目数据.xlsx 失败:', e.message);
}

// ── 8o. Page3 福可苏全流程跟进：订单明细（前端按时间段计算 13 列漏斗） ──
// 每单字段：od 下单日期 / pay 支付方式 / apmt 单采预约时间 / receive 仓库接收单采血时间 / qa 质量放行 / re 实际回输结束
//           cancel 取消回输标记 / resume 恢复生产时间 / note 备注 / modZq 申请修改为择期生产（非空=全流程转择期）
var FLOW = { orders: [] };
records.forEach(function (r) {
  var d = dictInfo[r.no] || {};
  FLOW.orders.push({
    no: r.no, od: r.od, pay: r.pay, apmt: r.apmt, receive: r.receive, qa: r.qa, re: r.re,
    cancel: d.cancel || '', resume: d.resume || '', note: d.note || '', modZq: d.modZq || ''
  });
});

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
    P2: P2,
    P3: P3,
    P3T: P3T,
    REG: REG,
    FLOW: FLOW
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
