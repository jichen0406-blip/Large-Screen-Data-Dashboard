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
  if (c) masterMap[c] = { name: String(r['标准医院名称'] || '').trim(), prov: String(r['省份'] || '').trim(), city: String(r['城市'] || '').trim(), coe: String(r['COE'] || '').trim(), area: String(r['Area'] || '').trim() };
});
console.log('Master 记录数:', Object.keys(masterMap).length);

// ── 5. 关键列索引（动态匹配） ──
var headers = bsRows[1];
var ci = {};
headers.forEach(function(h, i) {
  h = String(h || '').replace(/[\r\n]/g, '');
  if (h === '医疗机构编码') ci.org = i;
  if (h === '医疗机构名称') ci.orgName = i;
  if (h.includes('合同创建') && h.includes('日期')) ci.od = i;
  if (h.includes('实际回输') && h.includes('结束时间')) ci.re = i;
  if (h.includes('实际单采') && h.includes('开始时间')) ci.ap = i;
  if (h.includes('生产质量') && h.includes('放行时间')) ci.qa = i;
  if (h === '支付方式') ci.pay = i;
  if (h === '单采预约时间') ci.apmt = i;
  if (h === '计划回输时间') ci.planRe = i;
  if (h.includes('实际回输') && h.includes('开始时间')) ci.reStart = i;
  if (h === '仓库接收单采血时间') ci.receive = i;
  if (h === '患者姓名') ci.patient = i;
  if (h === '追溯码') ci.code = i;
  if (h === 'COS') ci.cos = i;
});
console.log('关键列索引:', JSON.stringify(ci));

// 患者姓名脱敏（与 build_poster.js maskName 相同规则）
function maskName(name) {
  if (!name) return '';
  name = String(name).trim();
  if (name.length <= 1) return name + '*';
  if (/[a-zA-Z]/.test(name) && name.indexOf(' ') >= 0) {
    return name.split(' ').map(function(seg) {
      if (seg.length <= 2) return seg[0] + '*';
      return seg[0] + '*' + seg[seg.length - 1];
    }).join(' ');
  }
  if (/[a-zA-Z]/.test(name)) {
    if (name.length <= 2) return name[0] + '*';
    return name[0] + '*' + name[name.length - 1];
  }
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*' + name[name.length - 1];
}

// 追溯码清洗：手工订单的追溯码列是占位值「手工订单」，视为空
function sanCode(v) {
  v = String(v == null ? '' : v).trim();
  return (v === '手工订单') ? '' : v;
}

// ── 6. 处理数据行（与 build_poster.js 相同的匹配规则） ──
// 优先用医疗机构编码(col32)，空则用处方来源医疗机构编号(col5)
var records = [];
var unmatched = [];
var code2Missing = []; // 反馈：code2(处方来源编号) 非空但主数据未收录
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
  // 反馈机制：处方来源医疗机构编号(col5) 非空但主数据未收录 → 即使本单已用 code1 匹配成功也需报告
  if (code2 && !masterMap[code2]) code2Missing.push({ row: i, no: String(row[1] || '').trim(), code2: code2, hosp: hosp });
  if (!hosp) hosp = '未知医院';
  if (prov === '新加坡' || prov.indexOf('新加坡') >= 0) { prov = ''; city = ''; } // 排除新加坡

  records.push({
    no: String(row[1] || '').trim(),
    code: sanCode(row[ci.code]),
    hosp: hosp,
    prov: prov,
    city: city,
    coe: m ? m.coe : '',
    area: m ? m.area : '',
    od: excelToDate(row[ci.od]),
    re: parseDt(row[ci.re]),
    ap: parseDt(row[ci.ap]),
    qa: parseDt(row[ci.qa]),
    pay: String(row[ci.pay] || '').trim(),
    apmt: excelToDate(row[ci.apmt]),
    planRe: excelToDate(row[ci.planRe]),
    reStart: excelToDate(row[ci.reStart]),
    receive: excelToDate(row[ci.receive]),
    patient: maskName(String(row[ci.patient] || '')),
    cos: String(row[ci.cos] || '').trim()
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
// 反馈机制：处方来源医疗机构编号(col5) 非空但主数据未收录 → 也需报错
if (code2Missing.length > 0) {
  console.error('\n========================================');
  console.error('⚠️  警告：' + code2Missing.length + ' 条记录「处方来源医疗机构编号」(col5) 未在主数据中收录！');
  console.error('以下编号在 masterdata.xlsx 中未找到：');
  code2Missing.forEach(function(w) {
    console.error('  · ' + w.code2 + '   合同号 ' + w.no + '  归属医院: ' + (w.hosp || '未知'));
  });
  console.error('请将以上「处方来源医疗机构编号」添加至 masterdata.xlsx 后重新运行！');
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

// ── 8e2. 过去30天 逐日 下单/回输/单采/质量放行（DP-29 ~ DP，按日期 + 医院+脱敏患者明细） ──
var daily30 = [];
var _d30 = new Date(DP.replace(/-/g, '/'));
_d30.setDate(_d30.getDate() - 29);
while (_d30 <= _end) {
  var ds30 = toLocal(_d30);
  var dO = [], dR = [], dA = [], dQ = [];
  records.forEach(function(r) {
    if (!r.hosp || r.hosp === '未知医院') return;
    if (r.od === ds30) dO.push({ code: r.code, hosp: r.hosp, name: r.patient });
    if (r.re === ds30) dR.push({ code: r.code, hosp: r.hosp, name: r.patient });
    if (r.ap === ds30) dA.push({ code: r.code, hosp: r.hosp, name: r.patient });
    if (r.qa === ds30) dQ.push({ code: r.code, hosp: r.hosp, name: r.patient });
  });
  daily30.push({ date: ds30, orders: dO, reinfusion: dR, apheresis: dA, release: dQ });
  _d30.setDate(_d30.getDate() + 1);
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

// ── 8h. YTD 异常订单（生产异常订单.xlsx 当年累计：PBMC分选失败+第一次+第二次生产失败） ──
var abnPath = path.join(rawDir, '生产异常订单.xlsx');
if (!fs.existsSync(abnPath)) abnPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', '生产异常订单.xlsx');
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
var OVERSEAS = { YEARS: Object.keys(yearSet).sort(), CARD: p2Card, LEFT: p2Left, RIGHT: p2Right, RIGHTD: p2RightD, TOP10: p2TopList };

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
var REGION1_KPI = { TARGET: TARGET, MONTH_O: p3MO, MONTH_R: p3MR };

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
    dictInfo[no] = { am: String(dr[3] || '').trim(), ram: String(dr[27] || '').trim(), rhc: String(dr[25] || '').trim(), rhn: String(dr[26] || '').trim(), flow: String(dr[21] || '').trim(), cancel: String(dr[6] || '').trim(), cancelMonth: (/^\d{6}$/.test(String(dr[18] || '').trim()) ? String(dr[18]).trim().slice(0, 4) + '-' + String(dr[18]).trim().slice(4, 6) : ''), resume: excelToDate(dr[13]), note: String(dr[10] || '').trim(), modZq: String(dr[15] || '').trim() };
  });
} catch (e) { console.error('⚠️ 读取 order dict(AM) 失败:', e.message); }
var OV_AM = { HK_AM1: 'HK', SG_AM: 'SG', KSA_AM: 'KSA' }; // 海外AM兜底 → 对应地区
var REG_LABEL = { HK: '香港', SG: '新加坡', KSA: '沙特' };
var REGION_AMS = ['崔珺', '赵蕊', '赵俊兴', '龚卉', '高威龙', '董硕', '兰明金', '李磊'];

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
// 统计一单（fld='o'下单 / 'r'回输）到 ND/ATTAIN/OV 三桶；未知海外地区安全兜底
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

// ── 8l2. 省份&医院数据（key region3）：医院/省份 月度明细（仅国内 DOM；AM 归属同 REGIONS） ──
// 键：'YYYY-MM' → 'AM|省份|城市|医院' → {o, r}；下单/回输分别按订单归属AM统计
var ptHOSP = {}; // REGIONS.HOSP
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
var ptHSLast = {}; // REGIONS.HSLAST：'省份|城市|医院名' → 'YYYY-MM-DD'
records.forEach(function (r) {
  if (!r.od) return;
  var d = dictInfo[r.no] || {};
  var a = attribP3(r, d, false);
  if (a.ov || !r.prov) return;
  var hk = r.prov + '|' + (r.city || '') + '|' + r.hosp;
  if (!ptHSLast[hk] || r.od > ptHSLast[hk]) ptHSLast[hk] = r.od;
});
// ── 8l4. 医院 COE 分类：按医院实体（省份|城市|医院名）→ SCOE/COE/RCOE/Others（源自 masterdata COE 列，经 coeCat 归一） ──
// 仅国内 DOM；同一医院取首条非空（COE 属医院主数据属性，理论上 1:1）
var ptCoeHosp = {}; // REGIONS.COEHOSP
records.forEach(function (r) {
  if (!r.prov || !r.hosp) return;
  var hk = r.prov + '|' + (r.city || '') + '|' + r.hosp;
  if (!ptCoeHosp[hk]) ptCoeHosp[hk] = coeCat(r.coe);
});
var REGIONS = { AMS: REGION_AMS, CHAL: CHAL, COMP: COMP, ND: ptND, ATTAIN: ptREG, OV: ptOV, HOSP: ptHOSP, HSLAST: ptHSLast, COEHOSP: ptCoeHosp };

// ── 8s. COE 分类页（SCOE/COE/RCOE）：masterdata 全量医院名单 + 逐月下单/回输（跨 AM 聚合自 REGIONS.HOSP） ──
// 名单取 masterdata 该分类的**全部**医院（即使本期无数据也保留行，前端显示 0）；逐月数据仅国内 DOM
var COE_CATS = ['SCOE', 'COE', 'RCOE'];
var COE_PAGES = { at: '', cats: COE_CATS, pages: {}, totals: {} };
(function () {
  function z12() { var a = []; for (var i = 0; i < 12; i++) a.push(0); return a; }
  var YEAR_LIST = [];
  (function () { var ys = {}; Object.keys(REGIONS.HOSP).forEach(function (ym) { ys[ym.slice(0, 4)] = true; }); YEAR_LIST = Object.keys(ys).sort(); })();
  COE_PAGES.at = Object.keys(REGIONS.HOSP).sort().pop() || '';

  // 1) masterdata 全量名单（按 省份|城市|医院名 去重）
  var uni = {};
  mdRows.forEach(function (r) {
    var cat = String(r['COE'] || '').trim();
    if (COE_CATS.indexOf(cat) < 0) return;
    var nm = String(r['标准医院名称'] || '').trim();
    if (!nm) return;
    var pv = String(r['省份'] || '').trim(), ct = String(r['城市'] || '').trim();
    (uni[cat] = uni[cat] || {})[pv + '|' + ct + '|' + nm] = { am: String(r['AM'] || '').trim(), prov: pv, city: ct, hosp: nm };
  });

  // 2) 逐年逐月：HOSP 去掉 AM 前缀聚合到 '省份|城市|医院'
  var byHosp = {};
  Object.keys(REGIONS.HOSP).forEach(function (ym) {
    var bucket = REGIONS.HOSP[ym];
    Object.keys(bucket).forEach(function (k) {
      var p = k.split('|'), hk = p[1] + '|' + (p[2] || '') + '|' + p[3];
      var t = byHosp[hk] || (byHosp[hk] = {}), v = t[ym] || (t[ym] = { o: 0, r: 0 });
      v.o += bucket[k].o || 0; v.r += bucket[k].r || 0;
    });
  });

  // 3) 每分类：医院 + 逐年 {o:[12], r:[12]}
  COE_CATS.forEach(function (cat) {
    var list = [];
    Object.keys(uni[cat] || {}).forEach(function (k) {
      var h = uni[cat][k], m = byHosp[k] || {}, ys = {};
      YEAR_LIST.forEach(function (y) {
        var o = z12(), r2 = z12(), any = false;
        for (var i = 1; i <= 12; i++) {
          var v = m[y + '-' + (i < 10 ? '0' : '') + i];
          if (v) { o[i - 1] = v.o || 0; r2[i - 1] = v.r || 0; if (o[i - 1] || r2[i - 1]) any = true; }
        }
        if (any) ys[y] = { o: o, r: r2 };
      });
      list.push({ am: h.am, prov: h.prov, city: h.city, hosp: h.hosp, years: ys });
    });
    COE_PAGES.pages[cat] = { hospitals: list };
  });

  // 4) totals：四类（含 Others）逐年逐月 —— 贡献比例的分母
  var T = {};
  YEAR_LIST.forEach(function (y) {
    T[y] = {};
    ['SCOE', 'COE', 'RCOE', 'Others'].forEach(function (c) { T[y][c] = { o: z12(), r: z12() }; });
  });
  Object.keys(REGIONS.HOSP).forEach(function (ym) {
    var y = ym.slice(0, 4), mi = parseInt(ym.slice(5, 7), 10) - 1;
    if (!T[y] || mi < 0 || mi > 11) return;
    var bucket = REGIONS.HOSP[ym];
    Object.keys(bucket).forEach(function (k) {
      var p = k.split('|'), hk = p[1] + '|' + (p[2] || '') + '|' + p[3];
      var cat = REGIONS.COEHOSP[hk] || 'Others';
      if (!T[y][cat]) cat = 'Others';
      T[y][cat].o[mi] += bucket[k].o || 0;
      T[y][cat].r[mi] += bucket[k].r || 0;
    });
  });
  COE_PAGES.totals = T;
})();
console.log('COE_PAGES: ' + COE_CATS.map(function (c) { return c + '=' + COE_PAGES.pages[c].hospitals.length + '家'; }).join(' / ') + ' | 最新月=' + COE_PAGES.at);

// ── 8t. 取消订单管理：取消单的阶段 / 取消月 / AM / 医院（来源 order dict 取消回输=1 + 取消回输月 col18） ──
// 阶段**独立判定**（不沿用 page_flow.js 的 used[] 顺序刨除漏斗——它先把「择期」整单占位，会漏掉部分取消单）
var CANCEL_STAGES = ['单采预约前取消', '单采前取消', '单采后取消', '生产中取消', '生产完成取消回输'];
function cancelStageOf(note) {
  note = String(note || '');
  if (note.indexOf('单采预约前取消') >= 0) return CANCEL_STAGES[0]; // 必须先于「单采前取消」判定
  if (note.indexOf('单采前取消') >= 0) return CANCEL_STAGES[1];
  if (note.indexOf('单采后取消') >= 0) return CANCEL_STAGES[2];
  if (note.indexOf('生产中取消') >= 0) return CANCEL_STAGES[3];
  if (note.indexOf('生产完成取消回输') >= 0) return CANCEL_STAGES[4];
  return '其他';
}
var CANCEL_MGMT = { at: '', stages: CANCEL_STAGES, years: [], cancels: [], totals: {} };
(function () {
  var byYear = {}, byYearAm = {}, all = 0, byHosp = {}, cmMax = '';
  records.forEach(function (r) {
    var d = dictInfo[r.no] || {};
    var oy = r.od ? r.od.slice(0, 4) : '';
    var amv = amClean[d.am] || d.am || ''; // AM 用 masterdata Sheet3（离职AM清洗）映射后统计
    // 分母：全部订单（按下单年 / 按 AM / 按医院）
    all++;
    if (oy) {
      byYear[oy] = (byYear[oy] || 0) + 1;
      if (amv) { if (!byYearAm[oy]) byYearAm[oy] = {}; byYearAm[oy][amv] = (byYearAm[oy][amv] || 0) + 1; }
    }
    if (r.prov && r.hosp) { var hk = r.prov + '|' + (r.city || '') + '|' + r.hosp; byHosp[hk] = (byHosp[hk] || 0) + 1; }
    // 分子：取消单
    if (d.cancel !== '1') return;
    var cm = d.cancelMonth || '';
    if (cm && cm > cmMax) cmMax = cm;
    CANCEL_MGMT.cancels.push({
      no: r.no, cm: cm, stage: cancelStageOf(d.note),
      am: amv, prov: r.prov || '', city: r.city || '', hosp: r.hosp || '',
      oy: oy, sameYear: !!(cm && oy && cm.slice(0, 4) === oy)
    });
  });
  CANCEL_MGMT.totals = { byYear: byYear, byYearAm: byYearAm, all: all, byHosp: byHosp };
  CANCEL_MGMT.at = cmMax;
  var ys = {}; Object.keys(byYear).forEach(function (y) { ys[y] = true; }); CANCEL_MGMT.years = Object.keys(ys).sort();
})();
console.log('CANCEL_MGMT: 取消单 ' + CANCEL_MGMT.cancels.length + ' | ' +
  CANCEL_STAGES.map(function (s) { return s + '=' + CANCEL_MGMT.cancels.filter(function (c) { return c.stage === s; }).length; }).join(' ') +
  ' | 其他=' + CANCEL_MGMT.cancels.filter(function (c) { return c.stage === '其他'; }).length +
  ' | 最新取消月=' + CANCEL_MGMT.at + ' | 全量订单=' + CANCEL_MGMT.totals.all);



// ── 8m. Page3 全球注册进度：注册项目数据.xlsx（世界地图 + 甘特图） ──
var regPath = path.join(rawDir, '注册项目数据.xlsx');
if (!fs.existsSync(regPath)) regPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', '注册项目数据.xlsx');
var GLOBAL_REG = { updated: '', regions: [], items: [] };
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
  var STATUS_MAP = { '已获批': 'approved', 'NDA申请已提交': 'submitted', '评审中': 'review', 'NDA申报计划中': 'planned', '开展临床研究': 'clinical' };
  var STATUS_LABEL = { 'approved': '已获批', 'submitted': '已提交', 'review': '评审中', 'planned': '计划中', 'clinical': '临床研究' };
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
    GLOBAL_REG.items.push({
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
  GLOBAL_REG.items.push({
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
  GLOBAL_REG.items.forEach(function (it) { if (GLOBAL_REG.regions.indexOf(it.region) < 0) GLOBAL_REG.regions.push(it.region); });
  GLOBAL_REG.updated = fmtDT(fs.statSync(regPath).mtime);
  console.log('注册项目国家数:', GLOBAL_REG.items.length, '| 区域:', GLOBAL_REG.regions.join('/'));
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

// ── 8p. CART运营每日跟进：单采/回输 双记录明细（取消/终止或未排期 不产出） ──
// 取消/终止 = order dict 取消回输标记='1'（整单过滤）；计划时间为空的那条不生成（未排期不展示）
// 状态灯由前端按「今天(客户端UTC+8)」实时判定，本层只给原始计划/实际时间
var CART_DAILY = [];
records.forEach(function (r) {
  var d = dictInfo[r.no] || {};
  if (d.cancel === '1') return;
  if (r.apmt) {
    CART_DAILY.push({ code: r.code, hosp: r.hosp, patient: r.patient, cos: r.cos, type: 'apheresis', plan: r.apmt, actual: r.ap || '' });
  }
  if (r.planRe) {
    CART_DAILY.push({ code: r.code, hosp: r.hosp, patient: r.patient, cos: r.cos, type: 'reinfusion', plan: r.planRe, actual: r.reStart || '' });
  }
});
console.log('CART_DAILY 记录数:', CART_DAILY.length);

// ── 8q. 异常订单管理：三类异常订单（从 bs_order + order dict 重算；人工字段取自 异常订单管理.xlsx） ──
// 长期未单采 = 有单 且 无实际单采开始；长期未转生产 = 已单采 且 无质量放行；长期未回输 = 已放行 且 无实际回输开始
// 三者均剔除取消/终止单（order dict 取消回输标记='1'）；按流程阶段递进，天然互斥不重叠
// 预估时间列归一化：源表同一列混用三种写法，统一成 YYYY-MM-DD / YYYY-MM
//   ① Excel 日期单元格（导出成裸序列号，如 46289）      → 2026-09-24
//   ② 手输小数日期（11.28 / 9.16 / 10.25 / 9.26 / 9.28） → 当年 11-28 / 09-16 / …
//   ③ 手输「年.月」（2026.9）                           → 2026-09
//   其它文本（"待定" / "10月" / "9月底" / "不回输"）原样保留
// ② 的年份取当年 Y：预估时间是前瞻性的，实测真日期单元格也全在当年（与订单年份无关）
function abnPlanTime(v) {
  if (typeof v === 'number' && isFinite(v)) {
    if (Number.isInteger(v) && v >= 30000 && v <= 80000) return excelToDate(v);
    var p = String(v).split('.'); // 用字符串拆，避开浮点（9.16 不能按数学取余）
    if (p.length === 2) {
      var a = parseInt(p[0], 10), b = parseInt(p[1], 10);
      if (a >= 1900 && b >= 1 && b <= 12) return a + '-' + String(b).padStart(2, '0');
      if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return Y + '-' + String(a).padStart(2, '0') + '-' + String(b).padStart(2, '0');
    }
  }
  return String(v == null ? '' : v).trim();
}
var ABN_SHEET_CFG = {
  nosample:     { sheet: '长期未单采订单',   cols: ['长期未单采原因', '如何尽快预约单采（行动计划）', '预估单采时间'] },
  noproduction: { sheet: '冻存长期未转生产', cols: ['长期未转生产原因', '如何尽快转生产（行动计划）', '预估生产时间'] },
  noreinfusion: { sheet: '长期未回输订单',   cols: ['具体原因', '如何争取加快回输（行动计划）', '预估回输时间'] }
};
var abnManual = {}; // key → { 合同号 → {reason, action, planTime} }
(function () {
  var abnPath = path.join(rawDir, '运营异常订单管理.xlsx');
  if (!fs.existsSync(abnPath)) abnPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', '运营异常订单管理.xlsx');
  if (!fs.existsSync(abnPath)) { console.warn('⚠️ 未找到 运营异常订单管理.xlsx，人工字段将留空'); return; }
  try {
    var abnWb = XLSX.readFile(abnPath);
    Object.keys(ABN_SHEET_CFG).forEach(function (k) {
      var cfg = ABN_SHEET_CFG[k], map = {};
      try {
        XLSX.utils.sheet_to_json(abnWb.Sheets[cfg.sheet], { defval: '' }).forEach(function (raw) {
          var r = {}; // 该 sheet 表头带首尾空格，先归一化列名
          Object.keys(raw).forEach(function (k) { r[String(k).trim()] = raw[k]; });
          var no = String(r['合同号'] || '').trim();
          if (!no) return;
          map[no] = {
            reason: String(r[cfg.cols[0]] || '').trim(),
            action: String(r[cfg.cols[1]] || '').trim(),
            planTime: abnPlanTime(r[cfg.cols[2]])
          };
        });
      } catch (e) { console.warn('⚠️ 读取 sheet「' + cfg.sheet + '」失败: ' + e.message); }
      abnManual[k] = map;
    });
    console.log('异常订单管理人工字段:', Object.keys(abnManual).map(function (k) { return k + '=' + Object.keys(abnManual[k]).length; }).join(' / '));
  } catch (e) { console.warn('⚠️ 读取 运营异常订单管理.xlsx 失败:', e.message); }
})();
['nosample', 'noproduction', 'noreinfusion'].forEach(function (k) { if (!abnManual[k]) abnManual[k] = {}; });

// 时长分档（左闭右开 [a,b)）与过期阈值（月）
var ABN_BUCKETS = {
  nosample:     [[0, 1], [1, 2], [2, 3], [3, 6], [6, 12], [12, Infinity]],
  noproduction: [[0, 6], [6, 12], [12, 24], [24, Infinity]],
  noreinfusion: [[0, 3], [3, 6], [6, Infinity]]
};
var ABN_EXPIRE = { noproduction: 12, noreinfusion: 6 };
function abnLabel(a, b) { return b === Infinity ? ('≥' + a + ' 月') : (a === 0 ? ('0~' + b + ' 月') : (a + '~' + b + ' 月')); }
function abnBucketOf(m, key) {
  var bs = ABN_BUCKETS[key];
  for (var i = 0; i < bs.length; i++) if (m >= bs[i][0] && m < bs[i][1]) return abnLabel(bs[i][0], bs[i][1]);
  var last = bs[bs.length - 1];
  return abnLabel(last[0], last[1]);
}
function abnMonths(d) {
  if (!d) return null;
  var t1 = new Date(String(d).slice(0, 10).replace(/-/g, '/'));
  if (isNaN(t1.getTime())) return null;
  var t0 = new Date(DP.replace(/-/g, '/'));
  return Math.round(((t0 - t1) / 86400000) / 30 * 10) / 10;
}
function abnRisk(m, key) {
  var th = ABN_EXPIRE[key];
  if (!th || m === null) return '';
  if (m >= th) return '已过期';
  if (m >= th - 1) return '即将过期';
  return '未过期';
}
var ABN_SPECS = [
  { key: 'nosample',     pred: function (r) { return !r.ap; },               base: function (r) { return r.od; } },
  { key: 'noproduction', pred: function (r) { return !!r.ap && !r.qa; },     base: function (r) { return r.receive; } },
  { key: 'noreinfusion', pred: function (r) { return !!r.qa && !r.reStart; }, base: function (r) { return r.qa; } }
];
var ABN_MGMT = { UPDATED: UPDATED, summaryAt: '', pages: {} };
ABN_SPECS.forEach(function (spec) {
  var rows = [];
  records.forEach(function (r) {
    var d = dictInfo[r.no] || {};
    if (d.cancel === '1') return;            // 剔除取消/终止单
    if (!spec.pred(r)) return;
    var months = abnMonths(spec.base(r));
    if (months === null) return;             // 基准时间缺失，无法算时长
    var info = mdByName[r.hosp];
    var am = amClean[d.am] || d.am || (info && info.am) || '';
    var man = abnManual[spec.key][r.no] || {};
    rows.push({
      code: r.code, no: r.no, ym: r.od ? r.od.slice(0, 7) : '',
      patient: r.patient, area: r.area || '', am: am, prov: r.prov, city: r.city, hosp: r.hosp,
      // 冻存判定与「福可苏全流程跟进」页同口径（js/page_flow.js:49）：择期且**未恢复生产**才算冻存；
      // 已「恢复生产」的择期单已走生产流程，属全流程（取消单上面已剔除）
      status: ((String(r.pay || '').indexOf('择期') >= 0 || !!d.modZq) && !d.resume) ? '冻存' : '全流程',
      baseTime: spec.base(r), months: months, planRe: r.planRe || '',
      bucket: abnBucketOf(months, spec.key),
      risk: abnRisk(months, spec.key),
      reason: man.reason || '', action: man.action || '', planTime: man.planTime || ''
    });
  });
  rows.sort(function (a, b) { return b.months - a.months; });
  ABN_MGMT.pages[spec.key] = { rows: rows };
});
console.log('异常订单（重算）: 未单采=' + ABN_MGMT.pages.nosample.rows.length +
  ' 未转生产=' + ABN_MGMT.pages.noproduction.rows.length +
  ' 未回输=' + ABN_MGMT.pages.noreinfusion.rows.length);


// ── 8u. 订单生产运营管理（3 页）：生产等待期 / 产品生产周期 / 回输等待期 ──
// 数据源：pbs_d1（D1执行时间，按追溯码 join）+ bs order（receive/qa/re）+ order dict（resume 恢复生产时间，按合同号 join）
// 本层输出原始日期 + 三段天数，三页共用同一份数组，各自按需筛选（不做任何过滤）
var PROD_OPS = { at: '', ai: {}, aiAt: '', rows: [] };
(function () {
  // pbs_d1：表头不在首行、列可能带偏移 → 按「列名」在前 10 行里找表头，不写死列索引
  // 一个追溯码可能有多条 D1（首次生产批 C + 返工批 CR）→ **两条都留**：
  //   生产等待期用**最早**的（等待只算到首次开始生产）、产品生产周期用**最晚**的（只算最后一次实际生产）
  //   这样「返工占用的那段间隔」不会抬高任何一个 KPI
  var pbsPath = path.join(rawDir, 'pbs_d1.xlsx');
  if (!fs.existsSync(pbsPath)) pbsPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', 'pbs_d1.xlsx');
  var pbsMap = {}, pbsHit = 0, pbsBlank = 0, pbsMulti = 0;
  try {
    var pbsWb = XLSX.readFile(pbsPath);
    var pbsWs = pbsWb.Sheets[pbsWb.SheetNames[0]];
    // 展开合并单元格：Excel 合并区只有左上角存值，其余读出来是空
    // （pbs_d1 的「追溯码」列把同一次单采的「生产批 C」与「返工批 CR」两行**纵向合并**，
    //   不展开则 CR 行的追溯码读成空、整行被丢掉，D1 就取不到「最新」的那次 —— 如 A1D0315）
    var pbsMerged = 0;
    (pbsWs['!merges'] || []).forEach(function (m) {
      var anchor = pbsWs[XLSX.utils.encode_cell(m.s)];
      if (!anchor || anchor.v === undefined || anchor.v === '') return;
      for (var R = m.s.r; R <= m.e.r; R++) {
        for (var C = m.s.c; C <= m.e.c; C++) {
          if (R === m.s.r && C === m.s.c) continue;
          var ad = XLSX.utils.encode_cell({ r: R, c: C });
          if (!pbsWs[ad] || pbsWs[ad].v === undefined || pbsWs[ad].v === '') { pbsWs[ad] = { t: anchor.t, v: anchor.v }; pbsMerged++; }
        }
      }
    });
    var pbsArr = XLSX.utils.sheet_to_json(pbsWs, { header: 1, defval: '' });
    var pbsC = {}, pbsHdr = -1, hi;
    for (hi = 0; hi < Math.min(pbsArr.length, 10); hi++) {
      var cand = (pbsArr[hi] || []).map(function (x) { return String(x == null ? '' : x).replace(/[\r\n\s]/g, ''); });
      if (cand.indexOf('追溯码') >= 0 && cand.indexOf('D1执行时间') >= 0) {
        cand.forEach(function (h, i) { if (h === '追溯码') pbsC.code = i; if (h === 'D1执行时间') pbsC.d1 = i; });
        pbsHdr = hi; break;
      }
    }
    if (pbsHdr < 0) console.warn('⚠️ pbs_d1.xlsx 未找到「追溯码 / D1执行时间」表头行，D1 数据留空');
    else {
      for (var pi = pbsHdr + 1; pi < pbsArr.length; pi++) {
        var pr = pbsArr[pi]; if (!pr) continue;
        var pk = String(pr[pbsC.code] == null ? '' : pr[pbsC.code]).trim();
        if (!pk) { pbsBlank++; continue; }
        var pv = String(pr[pbsC.d1] == null ? '' : pr[pbsC.d1]).trim().slice(0, 10); // 源值是「YYYY-MM-DD HH:mm:ss」
        if (!/^\d{4}-\d{2}-\d{2}$/.test(pv)) continue;
        pbsHit++;
        var cur = pbsMap[pk];
        if (!cur) pbsMap[pk] = { min: pv, max: pv, n: 1 };
        else {
          cur.n++;
          if (pv < cur.min) cur.min = pv;
          if (pv > cur.max) cur.max = pv;
        }
      }
    }
  } catch (e) { console.warn('⚠️ 读取 pbs_d1.xlsx 失败:', e.message); }

  // 天数差：用斜杠解析本地时间，避免 ISO 的 UTC 偏移（同 abnMonths）
  function days(a, b) {
    if (!a || !b) return null;
    var t1 = new Date(String(a).slice(0, 10).replace(/-/g, '/')).getTime();
    var t2 = new Date(String(b).slice(0, 10).replace(/-/g, '/')).getTime();
    if (isNaN(t1) || isNaN(t2)) return null;
    return Math.round((t2 - t1) / 86400000);
  }

  var neg = { w: 0, c: 0, r: 0 }, at = '';
  records.forEach(function (r) {
    var d = dictInfo[r.no] || {};
    var info = mdByName[r.hosp];                   // 下单 AM = masterdata Sheet1 的 AM 列（用户指定口径，非 order dict）
    var dd = pbsMap[r.code] || null;
    var d1 = dd ? dd.min : '';                     // 生产等待期：取**最早**的 D1（等待只算到首次开始生产）
    var d1last = dd ? dd.max : '';                 // 产品生产周期：取**最晚**的 D1（只算最后一次实际生产）
    var resume = d.resume || '';
    // 生产等待期起点：有恢复生产时间优先用，否则退回仓库接收单采血时间
    var start = resume || r.receive || '';
    // w=生产等待期（起点→最早D1） c=产品生产周期（最晚D1→放行） rw=回输等待期（放行→回输结束）
    var w = (d1 && start) ? days(start, d1) : null;
    var c = (d1last && r.qa) ? days(d1last, r.qa) : null;
    var rw = (r.qa && r.re) ? days(r.qa, r.re) : null;
    if (w !== null && w < 0) neg.w++;
    if (c !== null && c < 0) neg.c++;
    if (rw !== null && rw < 0) neg.r++;
    if (d1last > at) at = d1last;
    if (dd && dd.n > 1) pbsMulti++;
    PROD_OPS.rows.push({
      no: r.no, code: r.code || '',
      hosp: r.hosp, prov: r.prov || '', city: r.city || '',
      coe: coeCat(r.coe), ov: (info && info.reg && info.reg !== 'DOM') ? 1 : 0, am: (info ? info.am : '') || '',
      od: r.od || '', d1: d1, d1last: d1last, d1n: dd ? dd.n : 0,
      receive: r.receive || '', resume: resume, qa: r.qa || '', re: r.re || '',
      patient: r.patient || '',
      w: w, c: c, rw: rw
    });
  });
  PROD_OPS.at = at;
  function cnt(f) { return PROD_OPS.rows.filter(f).length; }
  console.log('PROD_OPS: 订单=' + PROD_OPS.rows.length +
    ' pbs_d1命中=' + pbsHit + ' 空码=' + pbsBlank + ' 展开合并=' + pbsMerged + ' 多D1订单=' + pbsMulti +
    ' | 有D1=' + cnt(function (x) { return !!x.d1; }) +
    ' 有resume=' + cnt(function (x) { return !!x.resume; }) +
    ' 有qa=' + cnt(function (x) { return !!x.qa; }) +
    ' 有re=' + cnt(function (x) { return !!x.re; }));
  console.log('PROD_OPS 可统计单数: 生产等待期=' + cnt(function (x) { return x.w !== null; }) +
    ' 产品生产周期=' + cnt(function (x) { return x.c !== null; }) +
    ' 回输等待期=' + cnt(function (x) { return x.rw !== null; }) +
    ' | 负数时长: 等待期=' + neg.w + ' 生产周期=' + neg.c + ' 回输等待期=' + neg.r);
})();

// ── 8r. 省份&医院数据页 AI 摘要的统计口径（与前端 page6.js 的 accumulate 一致：当年 1 月～最新数据月 YTD，仅国内 DOM） ──
var R3_YM = ''; // 最新有数据的月（前端默认月同源）
Object.keys(REGIONS.HOSP).forEach(function (k) { if (k > R3_YM) R3_YM = k; });
var R3_Y = R3_YM.slice(0, 4), R3_M = parseInt(R3_YM.slice(5, 7), 10);
var r3Acc = {}, r3LastYear = {};
(function () {
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  for (var i = 1; i <= R3_M; i++) {
    var b = REGIONS.HOSP[R3_Y + '-' + p2(i)], lb = REGIONS.HOSP[(R3_Y - 1) + '-' + p2(i)];
    if (b) Object.keys(b).forEach(function (k) { var v = r3Acc[k] || (r3Acc[k] = { o: 0, r: 0 }); v.o += b[k].o || 0; v.r += b[k].r || 0; });
    if (lb) Object.keys(lb).forEach(function (k) { var v = r3LastYear[k] || (r3LastYear[k] = { o: 0, r: 0 }); v.o += lb[k].o || 0; v.r += lb[k].r || 0; });
  }
})();
function r3RowsAcc() {
  var rows = [];
  Object.keys(r3Acc).forEach(function (k) {
    var v = r3Acc[k]; if (!(v.o > 0 || v.r > 0)) return;
    var p = k.split('|');
    rows.push({ am: p[0], prov: p[1], city: p[2], hosp: p[3], o: v.o, r: v.r });
  });
  return rows;
}
function r3ProvinceStatsText() {
  var rows = r3RowsAcc(), agg = {};
  rows.forEach(function (r) {
    var g = agg[r.prov] || (agg[r.prov] = { o: 0, r: 0, hosp: {}, ams: {} });
    g.o += r.o; g.r += r.r; g.ams[r.am] = true;
    if (r.o > 0) g.hosp[r.city + '|' + r.hosp] = true;
  });
  var ly = {};
  Object.keys(r3LastYear).forEach(function (k) {
    var prov = k.split('|')[1];
    ly[prov] = (ly[prov] || 0) + (r3LastYear[k].o || 0);
  });
  var list = Object.keys(agg).map(function (prov) {
    var g = agg[prov], lo = ly[prov] || 0;
    var ams = (REGIONS.AMS || []).filter(function (a) { return g.ams[a]; });
    Object.keys(g.ams).forEach(function (a) { if (ams.indexOf(a) < 0) ams.push(a); });
    return { pk: prov, label: ams.join('、') + ' · ' + prov, o: g.o, r: g.r, n: Object.keys(g.hosp).length, lo: lo, d: g.o - lo };
  });
  var L = [];
  L.push('统计口径：' + R3_Y + ' 年 1–' + R3_M + ' 月累计（YTD），仅国内医院；按省份统计，共 ' + list.length + ' 个省份');
  L.push('下单 Top6：' + list.slice().sort(function (a, b) { return b.o - a.o; }).slice(0, 6)
    .map(function (x) { return x.label + '（下单 ' + x.o + ' / 回输 ' + x.r + ' / 医院 ' + x.n + ' 家）'; }).join('；'));
  L.push('回输 Top5：' + list.slice().sort(function (a, b) { return b.r - a.r; }).slice(0, 5)
    .map(function (x) { return x.label + '（回输 ' + x.r + '）'; }).join('；'));
  var totO = list.reduce(function (s, x) { return s + x.o; }, 0);
  var totR = list.reduce(function (s, x) { return s + x.r; }, 0);
  var hospSet = {}; rows.forEach(function (r) { if (r.o > 0) hospSet[r.city + '|' + r.hosp] = true; });
  L.push('合计：下单 ' + totO + '，回输 ' + totR + '；YTD 有下单的医院（去重）' + Object.keys(hospSet).length + ' 家');
  var up = list.filter(function (x) { return x.d > 0; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 3);
  var dn = list.filter(function (x) { return x.d < 0; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 3);
  L.push('同比去年（下单）上升最多：' + (up.length ? up.map(function (x) { return x.label + ' +' + x.d; }).join('；') : '无'));
  L.push('同比下降最多：' + (dn.length ? dn.map(function (x) { return x.label + ' ' + x.d; }).join('；') : '无'));
  return L.join('\n');
}
function r3HospitalStatsText() {
  var rows = r3RowsAcc(), COEHOSP = REGIONS.COEHOSP || {};
  var L = [];
  L.push('统计口径：' + R3_Y + ' 年 1–' + R3_M + ' 月累计（YTD），仅国内医院；YTD 内有下单或回输的医院共 ' + rows.length + ' 家');
  var coe = {}; rows.forEach(function (r) { var c = COEHOSP[r.prov + '|' + r.city + '|' + r.hosp] || 'Others'; coe[c] = (coe[c] || 0) + 1; });
  L.push('COE 分层（按医院数）：' + ['SCOE', 'COE', 'RCOE', 'Others'].map(function (c) { return c + ' ' + (coe[c] || 0) + ' 家'; }).join('，'));
  L.push('下单 Top8 医院：' + rows.slice().sort(function (a, b) { return b.o - a.o; }).slice(0, 8)
    .map(function (x) { return x.hosp + '（' + x.prov + '，下单 ' + x.o + ' / 回输 ' + x.r + '）'; }).join('；'));
  var dpD = new Date(DP.replace(/-/g, '/'));
  var gaps = rows.map(function (r) {
    var ld = REGIONS.HSLAST[r.prov + '|' + r.city + '|' + r.hosp];
    if (!ld) return null;
    return { hosp: r.hosp, gap: Math.round((dpD - new Date(String(ld).replace(/-/g, '/'))) / 86400000) };
  }).filter(function (x) { return x && x.gap > 90; }).sort(function (a, b) { return b.gap - a.gap; });
  L.push('「最近一次下单」距今 >90 天的医院：' + gaps.length + ' 家' + (gaps.length ? '，最久 ' + gaps[0].hosp + '（' + gaps[0].gap + ' 天）' : ''));
  return L.join('\n');
}
// COE 分类页：喂给 LLM 的统计文本（YTD = 最新数据月所在年的 1..M 月）
function coeStatsText(cat) {
  var P = COE_PAGES.pages[cat], at = COE_PAGES.at;
  var y = at.slice(0, 4), M = parseInt(at.slice(5, 7), 10);
  function ytd(a) { var s = 0; for (var i = 0; i < M; i++) s += (a && a[i]) || 0; return s; }
  var rows = P.hospitals.map(function (h) {
    var cur = h.years[y] || {}, ly = h.years[String(parseInt(y, 10) - 1)] || {};
    return { hosp: h.hosp, prov: h.prov, am: h.am, o: ytd(cur.o), r: ytd(cur.r), lo: ytd(ly.o) };
  });
  var T = COE_PAGES.totals[y] || {}, allO = 0, allR = 0, catO = 0, catR = 0;
  ['SCOE', 'COE', 'RCOE', 'Others'].forEach(function (c) {
    var t = T[c] || {};
    allO += ytd(t.o); allR += ytd(t.r);
    if (c === cat) { catO = ytd(t.o); catR = ytd(t.r); }
  });
  var L = [];
  L.push('统计口径：' + y + ' 年 1–' + M + ' 月累计（YTD），仅国内医院');
  L.push('分类 ' + cat + '：主数据全量医院 ' + rows.length + ' 家');
  L.push('该分类 YTD：下单 ' + catO + '（占全盘 ' + (allO ? (catO / allO * 100).toFixed(1) : 0) + '%），回输 ' + catR + '（占全盘 ' + (allR ? (catR / allR * 100).toFixed(1) : 0) + '%）');
  L.push('名单内医院 YTD 合计：下单 ' + rows.reduce(function (s, x) { return s + x.o; }, 0) + '，回输 ' + rows.reduce(function (s, x) { return s + x.r; }, 0));
  L.push('下单 Top5 医院：' + rows.slice().sort(function (a, b) { return b.o - a.o; }).slice(0, 5)
    .map(function (x) { return x.hosp + '（' + x.prov + '，下单 ' + x.o + ' / 回输 ' + x.r + '）'; }).join('；'));
  L.push('YTD 无任何下单/回输的医院：' + rows.filter(function (x) { return !x.o && !x.r; }).length + ' 家');
  var up = rows.filter(function (x) { return x.o - x.lo > 0; }).sort(function (a, b) { return (b.o - b.lo) - (a.o - a.lo); }).slice(0, 3);
  var dn = rows.filter(function (x) { return x.o - x.lo < 0; }).sort(function (a, b) { return (a.o - a.lo) - (b.o - b.lo); }).slice(0, 3);
  L.push('同比去年（下单）上升最多：' + (up.length ? up.map(function (x) { return x.hosp + ' +' + (x.o - x.lo); }).join('；') : '无'));
  L.push('同比下降最多：' + (dn.length ? dn.map(function (x) { return x.hosp + ' ' + (x.o - x.lo); }).join('；') : '无'));
  return L.join('\n');
}

var REGION3_AI = { at: R3_YM, province: { summary: '' }, hospital: { summary: '' } };

// 取消订单-医院页：喂给 LLM 的统计文本（全量口径，分母 = 该医院自身总单量）
function pctOf(a, t) { return t > 0 ? (a / t * 100).toFixed(1) + '%' : '--'; }
function cancelHospStatsText() {
  var C = CANCEL_MGMT, tot = {};
  C.cancels.forEach(function (c) {
    if (!c.hosp) return;
    var k = c.prov + '|' + c.city + '|' + c.hosp;
    var o = tot[k] || (tot[k] = { hosp: c.hosp, prov: c.prov, n: 0 });
    o.n++;
  });
  var list = Object.keys(tot).map(function (k) { var o = tot[k]; o.all = C.totals.byHosp[k] || 0; return o; })
    .sort(function (a, b) { return b.n - a.n; });
  function cnt(stage) { return C.cancels.filter(function (c) { return c.stage === stage; }).length; }
  var noCost = cnt(CANCEL_STAGES[0]) + cnt(CANCEL_STAGES[1]);
  var L = [];
  L.push('统计口径：全部订单 ' + C.totals.all + ' 单中的取消单 ' + C.cancels.length + ' 单；比例分母为**该医院自身总单量**（非全量）');
  L.push('阶段分布：' + C.stages.map(function (s) { return s + ' ' + cnt(s) + ' 单'; }).join('，'));
  L.push('有取消的医院共 ' + list.length + ' 家；无成本取消（单采预约前+单采前）合计 ' + noCost + ' 单，生产完成取消回输 ' + cnt(CANCEL_STAGES[4]) + ' 单');
  L.push('取消单 Top8 医院：' + list.slice(0, 8).map(function (x) {
    return x.hosp + '（' + x.prov + '，取消 ' + x.n + ' / 总单 ' + x.all + ' = ' + pctOf(x.n, x.all) + '）';
  }).join('；'));
  var hi = list.filter(function (x) { return x.all >= 5; })
    .sort(function (a, b) { return (b.n / b.all) - (a.n / a.all); }).slice(0, 5);
  L.push('取消率偏高（总单≥5 家）Top5：' + (hi.length ? hi.map(function (x) { return x.hosp + ' ' + pctOf(x.n, x.all); }).join('；') : '无'));
  return L.join('\n');
}

// ── 9. AI 摘要（构建时调 DeepSeek；数据未变走缓存不重复调用） ──
// 覆盖：异常订单管理三页 + 省份&医院数据页两张表
var AI_CACHE_FILE = path.join(__dirname, '.ai_summary_cache.json');
var ABN_PAGE_NAME = { nosample: '长期未单采订单', noproduction: '长期未转生产', noreinfusion: '长期未回输订单' };
function sha1(s) { return require('crypto').createHash('sha1').update(s).digest('hex'); }
function abnFingerprint(rows) {
  return sha1(rows.map(function (r) { return [r.no, r.months, r.status, r.reason, r.action, r.planTime].join('~'); }).join('|'));
}
// 喂给 LLM 的统计文本（不传订单级明细，避免泄露敏感信息）
function abnStatsText(key, rows) {
  var buckets = ABN_BUCKETS[key], lines = [], total = rows.length;
  lines.push('总单数：' + total);
  buckets.forEach(function (b) {
    var lb = abnLabel(b[0], b[1]);
    var inB = rows.filter(function (r) { return r.bucket === lb; });
    var oldest = inB.length ? Math.max.apply(null, inB.map(function (r) { return r.months; })) : 0;
    lines.push(lb + '：' + inB.length + ' 单' + (inB.length ? '（最久 ' + oldest + ' 月）' : ''));
  });
  if (ABN_EXPIRE[key]) {
    var risk = {};
    rows.forEach(function (r) { risk[r.risk] = (risk[r.risk] || 0) + 1; });
    lines.push('风险：' + Object.keys(risk).map(function (k) { return k + ' ' + risk[k] + ' 单'; }).join('，'));
  }
  var st = {}; rows.forEach(function (r) { st[r.status] = (st[r.status] || 0) + 1; });
  lines.push('订单状态：' + Object.keys(st).map(function (k) { return k + ' ' + st[k] + ' 单'; }).join('，'));
  var ar = {}; rows.forEach(function (r) { if (r.area) ar[r.area] = (ar[r.area] || 0) + 1; });
  lines.push('Region：' + Object.keys(ar).sort().map(function (k) { return k + ' ' + ar[k] + ' 单'; }).join('，'));
  var am = {}; rows.forEach(function (r) { if (r.am) am[r.am] = (am[r.am] || 0) + 1; });
  lines.push('AM 单数 Top5：' + Object.keys(am).sort(function (a, b) { return am[b] - am[a]; }).slice(0, 5).map(function (k) { return k + ' ' + am[k]; }).join('，'));
  var rs = {}; rows.forEach(function (r) { if (r.reason) rs[r.reason] = (rs[r.reason] || 0) + 1; });
  var topR = Object.keys(rs).sort(function (a, b) { return rs[b] - rs[a]; }).slice(0, 5);
  lines.push('主要原因 Top5：' + (topR.length ? topR.map(function (k) { return k + '（' + rs[k] + '）'; }).join('；') : '（无人工填写）'));
  var noReason = rows.filter(function (r) { return !r.reason; }).length;
  lines.push('未填写原因单数：' + noReason);
  return lines.join('\n');
}
// 取 DeepSeek 密钥：优先环境变量，其次「共享密钥文件」——放在两个项目共同的上级目录
// 正式/测试共用一份：D:\VS Code\deepseek_api_key.txt（不属任何仓库，不会提交）
var DEEPSEEK_KEY_FILES = [
  path.join(__dirname, '..', 'deepseek_api_key.txt'),  // 共享（推荐）
  path.join(__dirname, 'deepseek_api_key.txt')         // 兼容：项目根同名文件
];
function readDeepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return String(process.env.DEEPSEEK_API_KEY).trim();
  for (var i = 0; i < DEEPSEEK_KEY_FILES.length; i++) {
    try {
      if (fs.existsSync(DEEPSEEK_KEY_FILES[i])) {
        var s = fs.readFileSync(DEEPSEEK_KEY_FILES[i], 'utf-8').split(/\r?\n/)[0].trim();
        if (s) return s;
      }
    } catch (e) {}
  }
  return '';
}
async function deepseekSummary(pageName, statsText, ask) {
  var apiKey = readDeepseekKey();
  if (!apiKey) {
    console.error('\n✗ 未找到 DeepSeek API 密钥，无法生成「' + pageName + '」的 AI 摘要。');
    console.error('  请把密钥写入共享文件（一行，只要密钥本身）：' + DEEPSEEK_KEY_FILES[0]);
    console.error('  或设置环境变量 DEEPSEEK_API_KEY。');
    process.exit(1);
  }
  var prompt = '以下是「' + pageName + '」的数据统计（数据截止 ' + DP + '）：\n\n' + statsText +
    '\n\n' + (ask || '请写一段面向业务负责人的总结：说明总体规模、最集中的分档与原因、是否有需要立即处理的高风险项，以及跟进建议。');
  var resp;
  try {
    resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是医药商业运营的数据分析助手。只输出一段简体中文总结，120 字以内，不要 Markdown、不要列表、不要标题。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 400
      })
    });
  } catch (e) {
    console.error('\n✗ 调用 DeepSeek 失败（网络异常）：「' + pageName + '」— ' + e.message);
    process.exit(1);
  }
  if (!resp.ok) {
    var body = '';
    try { body = await resp.text(); } catch (e) {}
    console.error('\n✗ 调用 DeepSeek 失败：「' + pageName + '」HTTP ' + resp.status + ' ' + body.slice(0, 200));
    process.exit(1);
  }
  var j = await resp.json();
  var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
  if (!txt) { console.error('\n✗ DeepSeek 返回空摘要：「' + pageName + '」'); process.exit(1); }
  return txt;
}
// ── 订单生产运营管理三页：喂给 LLM 的统计文本（不传订单级明细） ──
var PROD_OPS_PAGES = {
  prod_wait:  { name: '生产等待期管理',   metric: 'w',  tf: 'd1', desc: '生产等待期 = D1执行时间 − 起点（有恢复生产时间优先，否则仓库接收单采血时间）' },
  prod_cycle: { name: '产品生产周期管理', metric: 'c',  tf: 'qa', desc: '产品生产周期 = 生产质量放行时间 − D1执行时间' },
  reinf_wait: { name: '回输等待期管理',   metric: 'rw', tf: 're', desc: '回输等待期 = 实际回输结束时间 − 生产质量放行时间' }
};
function shiftYM(ym, d) {
  var y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10) + d;
  while (m <= 0) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return y + '-' + (m < 10 ? '0' : '') + m;
}
function prodOpsStatsText(k) {
  var cfg = PROD_OPS_PAGES[k], F = cfg.metric, TF = cfg.tf;
  var rows = PROD_OPS.rows.filter(function (r) { return r[F] !== null && r[F] !== undefined; });
  function avg(rs) { if (!rs.length) return 0; var s = 0; rs.forEach(function (r) { s += r[F]; }); return s / rs.length; }
  function group(rs, f) {
    var by = {}; rs.forEach(function (r) { var key = f(r); if (!key) return; (by[key] = by[key] || []).push(r); });
    return by;
  }
  var lines = [];
  lines.push('口径：' + cfg.desc + '；仅统计该段时长可算的订单，共 ' + rows.length + ' 单');
  if (!rows.length) return lines.join('\n');
  var vs = rows.map(function (r) { return r[F]; }).sort(function (a, b) { return a - b; });
  lines.push('全量平均 ' + avg(rows).toFixed(1) + ' 天，中位数 ' + vs[Math.floor(vs.length / 2)] + ' 天，最短 ' + vs[0] + ' 天，最长 ' + vs[vs.length - 1] + ' 天');
  var BK = [[0, 7], [7, 14], [14, 30], [30, 60], [60, Infinity]];
  lines.push('时长分档：' + BK.map(function (b) {
    var n = vs.filter(function (v) { return v >= b[0] && v < b[1]; }).length;
    return (b[1] === Infinity ? '≥' + b[0] + '天' : b[0] + '~' + b[1] + '天') + ' ' + n + ' 单(' + (n / vs.length * 100).toFixed(0) + '%)';
  }).join('，'));
  var yrs = group(rows, function (r) { return String(r[TF] || '').slice(0, 4); });
  lines.push('逐年平均：' + Object.keys(yrs).sort().map(function (y) { return y + ' ' + avg(yrs[y]).toFixed(1) + ' 天(' + yrs[y].length + ' 单)'; }).join('，'));
  var coes = group(rows, function (r) { return r.coe; });
  lines.push('按医院类型平均：' + ['SCOE', 'COE', 'RCOE', 'Others'].filter(function (c) { return coes[c]; })
    .map(function (c) { return c + ' ' + avg(coes[c]).toFixed(1) + ' 天(' + coes[c].length + ' 单)'; }).join('，'));
  var ams = group(rows, function (r) { return r.am; });
  lines.push('各 AM 平均时长(高→低)：' + Object.keys(ams).map(function (a) { return { a: a, n: ams[a].length, v: avg(ams[a]) }; })
    .sort(function (x, y) { return y.v - x.v; })
    .map(function (x) { return x.a + ' ' + x.v.toFixed(1) + ' 天/' + x.n + ' 单'; }).join('，'));
  var yms = rows.map(function (r) { return String(r[TF] || '').slice(0, 7); }).filter(Boolean).sort();
  if (yms.length) {
    var cut = shiftYM(yms[yms.length - 1], -5);
    var recent = rows.filter(function (r) { return String(r[TF] || '').slice(0, 7) >= cut; });
    var older = rows.filter(function (r) { return String(r[TF] || '').slice(0, 7) < cut; });
    lines.push('近 6 个月（' + cut + ' 起）平均 ' + avg(recent).toFixed(1) + ' 天(' + recent.length + ' 单)；更早平均 ' + avg(older).toFixed(1) + ' 天(' + older.length + ' 单)');
  }
  return lines.join('\n');
}

async function buildSummaries() {
  var cache = {};
  try { cache = JSON.parse(fs.readFileSync(AI_CACHE_FILE, 'utf-8')) || {}; } catch (e) { cache = {}; }
  var next = {};

  // 1) 异常订单管理三页
  for (var i = 0; i < ABN_SPECS.length; i++) {
    var key = ABN_SPECS[i].key, rows = ABN_MGMT.pages[key].rows;
    var fp = abnFingerprint(rows);
    if (cache[key] && cache[key].fp === fp && cache[key].summary) {
      ABN_MGMT.pages[key].summary = cache[key].summary;
      next[key] = cache[key];
      console.log('AI 摘要（缓存命中，未调用 LLM）:', ABN_PAGE_NAME[key]);
    } else {
      console.log('AI 摘要（调用 DeepSeek）:', ABN_PAGE_NAME[key], '…');
      var s = await deepseekSummary(ABN_PAGE_NAME[key], abnStatsText(key, rows),
        '请写一段面向业务负责人的总结：说明总体规模、最集中的时长分档与原因、是否有需要立即处理的高风险订单（过期/即将过期），以及跟进建议。');
      ABN_MGMT.pages[key].summary = s;
      next[key] = { fp: fp, summary: s, at: DP };
      console.log('  ✓ ' + s.slice(0, 40) + (s.length > 40 ? '…' : ''));
    }
  }

  // 2) 省份&医院数据页（两张表各一段；口径为「最新数据月」所在年的 1..M 月累计）
  var r3 = [
    { k: 'r3_province', name: '省份数据', slot: REGION3_AI.province, text: r3ProvinceStatsText(),
      ask: '请写一段面向业务负责人的总结：说明省份整体表现、头部省份集中度、同比增减明显的省份，以及关注建议。' },
    { k: 'r3_hospital', name: '医院数据', slot: REGION3_AI.hospital, text: r3HospitalStatsText(),
      ask: '请写一段面向业务负责人的总结：说明覆盖医院规模、COE 分层结构、头部医院表现，以及长期未下单（空窗期长）的医院情况与跟进建议。' }
  ];
  for (var j = 0; j < r3.length; j++) {
    var it = r3[j], fp2 = sha1(it.text);
    if (cache[it.k] && cache[it.k].fp === fp2 && cache[it.k].summary) {
      it.slot.summary = cache[it.k].summary;
      next[it.k] = cache[it.k];
      console.log('AI 摘要（缓存命中，未调用 LLM）:', it.name);
    } else {
      console.log('AI 摘要（调用 DeepSeek）:', it.name, '…');
      var s2 = await deepseekSummary(it.name, it.text, it.ask);
      it.slot.summary = s2;
      next[it.k] = { fp: fp2, summary: s2, at: R3_YM };
      console.log('  ✓ ' + s2.slice(0, 40) + (s2.length > 40 ? '…' : ''));
    }
  }

  // 3) COE 分类页（SCOE / COE / RCOE）
  var coeItems = COE_CATS.map(function (c) {
    return {
      k: 'coe_' + c.toLowerCase(), name: c + ' 医院数据', slot: COE_PAGES.pages[c], text: coeStatsText(c),
      ask: '请写一段面向业务负责人的总结：说明该 COE 分类的整体规模与占全盘比例、头部医院集中度、同比增减明显的医院，以及名单内长期无单医院的关注建议。'
    };
  });
  for (var n = 0; n < coeItems.length; n++) {
    var ci = coeItems[n], fp3 = sha1(ci.text);
    if (cache[ci.k] && cache[ci.k].fp === fp3 && cache[ci.k].summary) {
      ci.slot.summary = cache[ci.k].summary;
      next[ci.k] = cache[ci.k];
      console.log('AI 摘要（缓存命中，未调用 LLM）:', ci.name);
    } else {
      console.log('AI 摘要（调用 DeepSeek）:', ci.name, '…');
      var s3 = await deepseekSummary(ci.name, ci.text, ci.ask);
      ci.slot.summary = s3;
      next[ci.k] = { fp: fp3, summary: s3, at: COE_PAGES.at };
      console.log('  ✓ ' + s3.slice(0, 40) + (s3.length > 40 ? '…' : ''));
    }
  }

  // 4) 取消订单管理 - 医院页
  var chItems = [{
    k: 'cancel_hosp', name: '取消订单-医院页', slot: CANCEL_MGMT, text: cancelHospStatsText(),
    ask: '请写一段面向业务负责人的总结：说明取消单的整体规模与阶段结构、取消集中的医院、取消率明显偏高的医院，以及无成本取消（未产生生产成本）与生产完成后取消的占比，并给出跟进建议。'
  }];
  for (var q = 0; q < chItems.length; q++) {
    var ci2 = chItems[q], fp4 = sha1(ci2.text);
    if (cache[ci2.k] && cache[ci2.k].fp === fp4 && cache[ci2.k].summary) {
      ci2.slot.summary = cache[ci2.k].summary;
      next[ci2.k] = cache[ci2.k];
      console.log('AI 摘要（缓存命中，未调用 LLM）:', ci2.name);
    } else {
      console.log('AI 摘要（调用 DeepSeek）:', ci2.name, '…');
      var s4 = await deepseekSummary(ci2.name, ci2.text, ci2.ask);
      ci2.slot.summary = s4;
      next[ci2.k] = { fp: fp4, summary: s4, at: CANCEL_MGMT.at };
      console.log('  ✓ ' + s4.slice(0, 40) + (s4.length > 40 ? '…' : ''));
    }
  }

  // 5) 订单生产运营管理三页（生产等待期 / 产品生产周期 / 回输等待期）
  var poKeys = Object.keys(PROD_OPS_PAGES);
  for (var w = 0; w < poKeys.length; w++) {
    var pk = poKeys[w], pItem = PROD_OPS_PAGES[pk], pText = prodOpsStatsText(pk), fp5 = sha1(pText);
    if (cache[pk] && cache[pk].fp === fp5 && cache[pk].summary) {
      PROD_OPS.ai[pk] = cache[pk].summary;
      next[pk] = cache[pk];
      console.log('AI 摘要（缓存命中，未调用 LLM）:', pItem.name);
    } else {
      console.log('AI 摘要（调用 DeepSeek）:', pItem.name, '…');
      var s5 = await deepseekSummary(pItem.name, pText,
        '请写一段面向业务负责人的总结：说明该环节整体耗时水平、最集中的时长分档、耗时明显偏长的年份/医院类型/AM，以及流程改进与跟进建议。控制在 150 字以内，不要罗列所有数字。');
      PROD_OPS.ai[pk] = s5;
      next[pk] = { fp: fp5, summary: s5, at: DP };
      console.log('  ✓ ' + s5.slice(0, 40) + (s5.length > 40 ? '…' : ''));
    }
  }
  PROD_OPS.aiAt = DP;

  try { fs.writeFileSync(AI_CACHE_FILE, JSON.stringify(next, null, 2), 'utf-8'); } catch (e) { console.warn('⚠️ 写 AI 摘要缓存失败:', e.message); }
  ABN_MGMT.summaryAt = DP;
}

// ── 8v. China Solution 业务页：海外收入统计（收入/成本按汇率折人民币）+ Target 目标 ──
// 口径（2026-10-20 与用户确认）：
//   ① 只取 大类 === 'China Solution'，业务类型 ∈ 慢病毒载体/一体化设备/试剂检测盒；抗体不纳入
//   ② 收入/成本按「到款年份」的汇率折人民币再转万元；该年无汇率 → 回落最新年份
//   ③ 一体化设备「收入是利润」：收入 = (金额 − 成本) × 汇率；成本为空则利润 = 金额
//   ④ 国家为空的行照常保留（前端表格显示「未填国家」），只是不上地图
var CS_TYPES = ['慢病毒载体', '一体化设备', '试剂检测盒'];
var CS_GEO = {
  '中国': 'China', '中国香港': '香港', '中国澳门': '澳门', '中国台湾': '台湾',
  '新加坡': 'Singapore', '马来西亚': 'Malaysia', '泰国': 'Thailand', '越南': 'Vietnam',
  '印尼': 'Indonesia', '印度尼西亚': 'Indonesia', '菲律宾': 'Philippines',
  '沙特阿拉伯': 'Saudi Arabia', '沙特': 'Saudi Arabia', '阿联酋': 'United Arab Emirates',
  '科威特': 'Kuwait', '卡塔尔': 'Qatar', '阿曼': 'Oman', '巴林': 'Bahrain',
  '日本': 'Japan', '韩国': 'Korea', '印度': 'India', '巴基斯坦': 'Pakistan',
  '俄罗斯': 'Russia', '乌克兰': 'Ukraine', '哈萨克斯坦': 'Kazakhstan',
  '巴西': 'Brazil', '阿根廷': 'Argentina', '智利': 'Chile', '秘鲁': 'Peru',
  '墨西哥': 'Mexico', '哥伦比亚': 'Colombia', '美国': 'United States',
  '澳大利亚': 'Australia', '新西兰': 'New Zealand', '加拿大': 'Canada',
  '英国': 'United Kingdom', '法国': 'France', '德国': 'Germany', '意大利': 'Italy',
  '西班牙': 'Spain', '荷兰': 'Netherlands', '比利时': 'Belgium', '瑞士': 'Switzerland',
  '瑞典': 'Sweden', '波兰': 'Poland', '土耳其': 'Turkey', '以色列': 'Israel',
  '埃及': 'Egypt', '南非': 'South Africa', '尼日利亚': 'Nigeria', '肯尼亚': 'Kenya'
};
var CS_BIZ = { at: '', file: '', source: '', years: [], types: CS_TYPES, target: {}, rows: [] };
try {
  function csWan(v) { return v == null ? null : Math.round(v / 100) / 100; }   // 元 → 万元（2 位）
  function csNum(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/[,，\s ]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  // 到款日期是文本（2022.10.25 / 2026.4 / 2026-4-14）→ 'YYYY-MM'
  function csYM(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') {
      var d0 = (typeof excelToDate === 'function') ? excelToDate(v) : null;
      if (!d0) return '';
      return String(d0.getFullYear()) + '-' + String(d0.getMonth() + 1).padStart(2, '0');
    }
    var m = String(v).trim().match(/(\d{4})\D+(\d{1,2})/);
    if (!m) return '';
    var mo = parseInt(m[2], 10);
    if (!(mo >= 1 && mo <= 12)) return '';
    return m[1] + '-' + String(mo).padStart(2, '0');
  }

  // ① 收入表：rawdata 下最新的「海外收入统计-*.xlsx」（排除 Excel 临时文件）
  var csFile = fs.readdirSync(rawDir).filter(function (f) {
    return f.indexOf('海外收入统计') === 0 && /\.xlsx$/i.test(f) && f.indexOf('~$') < 0;
  }).sort().pop();
  if (!csFile) throw new Error('rawdata 下未找到 海外收入统计-*.xlsx');
  CS_BIZ.file = csFile;
  CS_BIZ.source = '海外收入统计 ' + csFile;
  CS_BIZ.at = fmtDT(fs.statSync(path.join(rawDir, csFile)).mtime);

  // ② 汇率表：Year | 货币 | 货币E | 折算
  var fxByYear = {}, fxYears = [];
  var fxPath = path.join(rawDir, '货币折算.xlsx');
  if (fs.existsSync(fxPath)) {
    var fxAoa = XLSX.utils.sheet_to_json(XLSX.readFile(fxPath).Sheets['Sheet1'], { header: 1, defval: '' });
    var fxH = (fxAoa[0] || []).map(function (h) { return String(h).replace(/[\r\n\s]/g, ''); });
    var fY = fxH.indexOf('Year'), fC = fxH.indexOf('货币E'), fR = fxH.indexOf('折算');
    for (var fi = 1; fi < fxAoa.length; fi++) {
      var fr = fxAoa[fi] || [];
      var fyear = String(fr[fY] || '').trim();
      var fcode = String(fr[fC] || '').trim().toUpperCase();
      var frate = parseFloat(String(fr[fR]).replace(/[,，\s]/g, ''));
      if (!fyear || !fcode || !isFinite(frate)) continue;
      (fxByYear[fyear] || (fxByYear[fyear] = {}))[fcode] = frate;
      if (fxYears.indexOf(fyear) < 0) fxYears.push(fyear);
    }
    fxYears.sort();
  } else {
    console.warn('⚠️ 未找到 货币折算.xlsx，汇率全部按 1 处理');
  }
  var fxLatest = fxYears.length ? fxByYear[fxYears[fxYears.length - 1]] : {};
  function fxRate(code, year) {
    var t = fxByYear[year] || fxLatest;               // 该年无汇率 → 回落最新年份
    if (t[code] != null) return t[code];
    if (fxLatest[code] != null) return fxLatest[code];
    console.warn('⚠️ 无 ' + code + ' 汇率，按 1 处理');
    return 1;
  }

  // ③ 收入明细：DATA 表第 1 行是「填写说明」，真表头在第 2 行
  var csAoa = XLSX.utils.sheet_to_json(XLSX.readFile(path.join(rawDir, csFile)).Sheets['DATA'], { header: 1, defval: '' });
  var csHi = -1;
  for (var hk = 0; hk < Math.min(6, csAoa.length); hk++) {
    if (!csAoa[hk]) continue;
    var hjoin = csAoa[hk].map(function (v) { return String(v).replace(/[\r\n\s]/g, ''); }).join('|');
    if (hjoin.indexOf('到款日期') >= 0 && hjoin.indexOf('业务类型') >= 0 && hjoin.indexOf('大类') >= 0) { csHi = hk; break; }
  }
  if (csHi < 0) throw new Error('DATA 表未找到表头行（需含 到款日期/业务类型/大类）');
  var csH = csAoa[csHi].map(function (h) { return String(h).replace(/[\r\n\s]/g, ''); });
  var cI = {
    date: csH.indexOf('到款日期'), cust: csH.indexOf('客户名称'), biz: csH.indexOf('业务类型'),
    cat: csH.indexOf('大类'), amt: csH.indexOf('金额'), cur: csH.indexOf('货币'),
    cost: csH.indexOf('成本金额'), ctry: csH.indexOf('国家')
  };
  var csSkip = { cat: 0, biz: 0, date: 0, amt: 0 };
  for (var ci = csHi + 1; ci < csAoa.length; ci++) {
    var cr = csAoa[ci];
    if (!cr || !cr.length) continue;
    if (String(cr[cI.cat] || '').trim() !== 'China Solution') { csSkip.cat++; continue; }
    var cBiz = String(cr[cI.biz] || '').trim();
    if (cBiz === '试剂盒检测') cBiz = '试剂检测盒';        // 与筛选器统一命名
    if (CS_TYPES.indexOf(cBiz) < 0) { csSkip.biz++; continue; }   // 抗体等不纳入
    var cYm = csYM(cr[cI.date]);
    if (!cYm) { csSkip.date++; console.warn('⚠️ 到款日期无法解析，已跳过：' + cr[cI.date] + ' / ' + cr[cI.cust]); continue; }
    var cAmt = csNum(cr[cI.amt]);
    if (cAmt == null) { csSkip.amt++; console.warn('⚠️ 金额无法解析，已跳过：' + cr[cI.cust]); continue; }
    var cCur = String(cr[cI.cur] || '').trim().toUpperCase() || 'CNY';
    var cRate = fxRate(cCur, cYm.slice(0, 4));
    var cRev = cAmt * cRate;
    var cCostRaw = csNum(cr[cI.cost]);
    var cCost = cCostRaw == null ? null : cCostRaw * cRate;
    var isDev = (cBiz === '一体化设备');
    // 一体化设备：收入是利润（金额 − 成本）
    var cEff = isDev ? cRev - (cCost == null ? 0 : cCost) : cRev;
    var cCtry = String(cr[cI.ctry] || '').trim();
    CS_BIZ.rows.push({
      ym: cYm, year: cYm.slice(0, 4), country: cCtry, geo: CS_GEO[cCtry] || '',
      cust: String(cr[cI.cust] || '').replace(/[\r\n\t]/g, '').trim(),
      type: cBiz, cur: cCur, rate: cRate,
      amtWan: csWan(cAmt),                      // 原币金额（万元）
      revWan: csWan(cRev),                      // 收入（人民币，万元）
      costWan: csWan(cCost),                    // 成本（人民币，万元），空则 null
      profit: isDev,
      effWan: csWan(cEff)                       // 卡片 / 地图口径（设备类=利润）
    });
  }

  // ④ 目标：Target.xlsx 的 'China solution' sheet（YM | 分类 | 目标（万元））
  if (tgtWb && tgtWb.Sheets['China solution']) {
    var tgAoa = XLSX.utils.sheet_to_json(tgtWb.Sheets['China solution'], { header: 1, defval: '' });
    for (var ti = 0; ti < tgAoa.length; ti++) {
      var tr = tgAoa[ti] || [];
      var tYm = String(tr[0] || '').trim();
      if (!/^\d{6}$/.test(tYm)) continue;
      var tCat = String(tr[1] || '').trim();
      if (tCat === '试剂盒检测') tCat = '试剂检测盒';
      if (CS_TYPES.indexOf(tCat) < 0) continue;
      var tVal = parseFloat(String(tr[2]).replace(/[,，\s]/g, ''));
      if (!isFinite(tVal)) continue;
      var tKey = tYm.slice(0, 4) + '-' + tYm.slice(4, 6);
      (CS_BIZ.target[tKey] || (CS_BIZ.target[tKey] = {}))[tCat] = tVal;
    }
  } else {
    console.warn('⚠️ Target.xlsx 缺少 China solution 工作表');
  }

  // ⑤ 排序 + 可选年份
  CS_BIZ.rows.sort(function (a, b) { return a.ym < b.ym ? 1 : (a.ym > b.ym ? -1 : 0); });
  var csYears = {};
  CS_BIZ.rows.forEach(function (r) { csYears[r.year] = true; });
  Object.keys(CS_BIZ.target).forEach(function (k) { csYears[k.slice(0, 4)] = true; });
  CS_BIZ.years = Object.keys(csYears).sort();
  console.log('China Solution 记录:', CS_BIZ.rows.length,
    '| 目标月份:', Object.keys(CS_BIZ.target).length,
    '| 汇率年份:', fxYears.join('/') || '(无)',
    '| 跳过: 非CS ' + csSkip.cat + ' / 非本页业务 ' + csSkip.biz);
  CS_BIZ.rows.forEach(function (r) {
    console.log('   ' + r.ym + '  ' + r.type + '  ' + (r.country || '（未填国家）') + '  ' +
      r.cust + '  ' + r.amtWan + '万' + r.cur + ' → 收入 ' + r.revWan + '万' +
      (r.costWan == null ? '' : ' / 成本 ' + r.costWan + '万') + (r.profit ? '（设备，卡片取利润 ' + r.effWan + '万）' : ''));
  });
} catch (e) {
  console.error('⚠️ 读取 China Solution 数据失败:', e.message);
}

// ── 8w. 惠民保 & 商保：order dict「惠民保」「商业保险」列 + 名称映射表 ──
// 口径（2026-10-30 用户确认）：
//   ① 列非空即计入（含「职工保」）；两列独立判定，同时命中则两边都算
//   ② 组合值按 + & 、 拆开，分别计入各自名称
//   ③ 名称先过映射表归一；映射表里没有的名称原样保留并打警告
var INSURANCE = { at: '', months: [], denom: {}, rows: [], amList: [], unmapped: { hb: [], bx: [] } };
(function () {
  // ① 名称映射表
  var mapPath = path.join(rawDir, '惠民保商保名称映射.xlsx');
  if (!fs.existsSync(mapPath)) mapPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', '惠民保商保名称映射.xlsx');
  var nameMap = { hb: {}, bx: {} }, known = { hb: {}, bx: {} };
  if (fs.existsSync(mapPath)) {
    var mWb = XLSX.readFile(mapPath);
    var mAoa = XLSX.utils.sheet_to_json(mWb.Sheets[mWb.SheetNames[0]], { header: 1, defval: '' });
    var mH = (mAoa[0] || []).map(function (h) { return String(h).trim(); });
    var iT = mH.indexOf('类型'), iO = mH.indexOf('原始名称'), iS = mH.indexOf('标准名称');
    for (var i = 1; i < mAoa.length; i++) {
      var mr = mAoa[i] || [];
      var mt = String(mr[iT] || '').trim(), mo = String(mr[iO] || '').trim(), ms = String(mr[iS] || '').trim();
      if (!mo) continue;
      var mk = (mt === '惠民保') ? 'hb' : 'bx';
      nameMap[mk][mo] = ms || mo;
      known[mk][mo] = true;
    }
    INSURANCE.at = fmtDT(fs.statSync(mapPath).mtime);
  } else {
    console.warn('⚠️ 未找到 惠民保商保名称映射.xlsx，名称将不做归一');
  }

  // ② 订单号 → 下单月/AM/省市
  var recByNo = {};
  records.forEach(function (r) {
    recByNo[r.no] = { ym: (r.od ? r.od.slice(0, 7) : ''), prov: r.prov || '', city: r.city || '' };
  });
  var dictAM = {};
  dictRows.slice(1).forEach(function (r) {
    var no = String(r[1] || '').trim();
    if (no) dictAM[no] = String(r[3] || '').trim();
  });

  function splitIns(v) {
    return String(v || '').split(/[+&＆、,，\/]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function canon(k, n) {
    if (nameMap[k][n]) return nameMap[k][n];
    if (!known[k][n] && INSURANCE.unmapped[k].indexOf(n) < 0) INSURANCE.unmapped[k].push(n);
    return n;
  }

  var amSet = {}, monSet = {};
  var denomTmp = {};
  dictRows.slice(1).forEach(function (r) {
    var no = String(r[1] || '').trim();
    if (!no) return;
    var rec = recByNo[no];
    if (!rec || !rec.ym) return;                       // 无下单时间的不计入
    var am = amClean[dictAM[no]] || dictAM[no] || '';
    if (am) amSet[am] = true;
    monSet[rec.ym] = true;
    var dk = rec.ym + '|' + am + '|' + (rec.prov || '未知') + '|' + (rec.city || '未知');
    denomTmp[dk] = (denomTmp[dk] || 0) + 1;

    var hbN = splitIns(r[4]).map(function (n) { return canon('hb', n); });
    var bxN = splitIns(r[5]).map(function (n) { return canon('bx', n); });
    if (!hbN.length && !bxN.length) return;
    INSURANCE.rows.push({
      ym: rec.ym, am: am, prov: rec.prov || '未知', city: rec.city || '未知',
      hb: hbN, bx: bxN
    });
  });
  INSURANCE.denom = denomTmp;
  INSURANCE.months = Object.keys(monSet).sort();
  INSURANCE.amList = Object.keys(amSet).sort();

  var hbCnt = 0, bxCnt = 0;
  INSURANCE.rows.forEach(function (r) { if (r.hb.length) hbCnt++; if (r.bx.length) bxCnt++; });
  console.log('惠民保/商保: 总订单 ' + Object.keys(recByNo).length + ' 单 | 惠民保 ' + hbCnt + ' | 商保 ' + bxCnt +
    ' | 月份 ' + INSURANCE.months.length + ' | AM ' + INSURANCE.amList.length);
  if (INSURANCE.unmapped.hb.length) console.warn('⚠️ 惠民保未登记名称(' + INSURANCE.unmapped.hb.length + '): ' + INSURANCE.unmapped.hb.join('、'));
  if (INSURANCE.unmapped.bx.length) console.warn('⚠️ 商保未登记名称(' + INSURANCE.unmapped.bx.length + '): ' + INSURANCE.unmapped.bx.join('、'));
})();

// ── 8x. 生产异常订单：生产异常订单.xlsx Sheet2（逐单明细） ──
// 分类：PBMC分选失败 / 第一次生产失败 / 二次生产失败（展示统一为「PBMC 分选失败」）
var PROD_ABN = { at: '', cats: ['PBMC 分选失败', '第一次生产失败', '二次生产失败'], months: [], monthly: {}, rows: [] };
try {
  var paPath = path.join(rawDir, '生产异常订单.xlsx');
  if (!fs.existsSync(paPath)) paPath = path.join(__dirname, '..', 'fucaso-dashboard', 'rawdata', '生产异常订单.xlsx');
  var paWb = XLSX.readFile(paPath);
  PROD_ABN.at = fmtDT(fs.statSync(paPath).mtime);
  var paAoa = XLSX.utils.sheet_to_json(paWb.Sheets['Sheet2'], { header: 1, defval: '' });
  var paH = (paAoa[0] || []).map(function (h) { return String(h).replace(/[\r\n\s]/g, ''); });
  var pI = {
    no: paH.indexOf('销售订单'), code: paH.indexOf('追溯码'), ym: paH.indexOf('年月'),
    cat: paH.indexOf('分类'), note: paH.indexOf('最新更新信息'),
    prov: paH.indexOf('区域'), hospShort: paH.indexOf('单采医院简称'), area: paH.indexOf('二次类型')
  };
  var CAT_MAP = { 'PBMC分选失败': 'PBMC 分选失败', '第一次生产失败': '第一次生产失败', '二次生产失败': '二次生产失败' };
  var recByNo2 = {}, dictAM2 = {};
  records.forEach(function (r) { recByNo2[r.no] = r; });
  dictRows.slice(1).forEach(function (r) { var no = String(r[1] || '').trim(); if (no) dictAM2[no] = String(r[3] || '').trim(); });

  var monSet2 = {};
  for (var pi = 1; pi < paAoa.length; pi++) {
    var pr = paAoa[pi];
    if (!pr) continue;
    var pno = String(pr[pI.no] || '').trim();
    if (!pno) continue;
    var pymRaw = String(pr[pI.ym] || '').trim();
    if (!/^\d{6}$/.test(pymRaw)) continue;
    var pym = pymRaw.slice(0, 4) + '-' + pymRaw.slice(4, 6);
    var pcatRaw = String(pr[pI.cat] || '').trim();
    var pcat = CAT_MAP[pcatRaw];
    if (!pcat) { console.warn('⚠️ 生产异常未知分类: ' + pcatRaw + '（订单 ' + pno + '）'); continue; }
    var rec2 = recByNo2[pno];
    var ram = amClean[dictAM2[pno]] || dictAM2[pno] || '';
    var pprov = rec2 ? (rec2.prov || '') : String(pr[pI.prov] || '').trim();
    var phosp = rec2 ? (rec2.hosp || '') : String(pr[pI.hospShort] || '').trim();
    monSet2[pym] = true;
    PROD_ABN.rows.push({
      ym: pym,
      am: ram || '未知',
      prov: pprov || String(pr[pI.prov] || '').trim() || '未知',
      hosp: phosp || '未知',
      no: pno,
      code: String(pr[pI.code] || '').trim(),
      cat: pcat,
      note: String(pr[pI.note] || '').replace(/[\r\n]+/g, ' ').trim(),
      patient: rec2 ? (rec2.patient || '') : ''            // records.patient 已脱敏
    });
  }
  // 连续月份
  var mAll = Object.keys(monSet2).sort();
  if (mAll.length) {
    var y0 = +mAll[0].slice(0, 4), m0 = +mAll[0].slice(5, 7);
    var y1 = +mAll[mAll.length - 1].slice(0, 4), m1 = +mAll[mAll.length - 1].slice(5, 7);
    for (var yy = y0, mm = m0; yy < y1 || (yy === y1 && mm <= m1);) {
      PROD_ABN.months.push(yy + '-' + String(mm).padStart(2, '0'));
      mm++; if (mm > 12) { mm = 1; yy++; }
    }
    PROD_ABN.months.forEach(function (k) { PROD_ABN.monthly[k] = [0, 0, 0]; });
    PROD_ABN.rows.forEach(function (r) {
      var ci2 = PROD_ABN.cats.indexOf(r.cat);
      if (ci2 >= 0 && PROD_ABN.monthly[r.ym]) PROD_ABN.monthly[r.ym][ci2]++;
    });
  }
  var pSum = [0, 0, 0];
  PROD_ABN.rows.forEach(function (r) { var k = PROD_ABN.cats.indexOf(r.cat); if (k >= 0) pSum[k]++; });
  console.log('生产异常: ' + PROD_ABN.rows.length + ' 条 | PBMC ' + pSum[0] + ' / 第一次 ' + pSum[1] + ' / 二次 ' + pSum[2] +
    ' | 月份 ' + PROD_ABN.months.length + ' | 唯一订单 ' + Object.keys(PROD_ABN.rows.reduce(function (o, r) { o[r.no] = 1; return o; }, {})).length);
} catch (e) {
  console.error('⚠️ 读取 生产异常订单.xlsx Sheet2 失败:', e.message);
}

// ── 10. 输出 js/data.js（页面直接 <script> 引用） ──
(async function () {
await buildSummaries();

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
    DAILY30: daily30,
    HOSP_PROV: HOSP_PROV,
    COE: { O: coeO, R: coeR },
    ABN: { Y: Y, total: abnTotal, pbmc: abnPbmc, first: abnFirst, second: abnSecond },
    CITY_PROV: CITY_PROV,
    OVERSEAS: OVERSEAS,
    REGION1_KPI: REGION1_KPI,
    REGIONS: REGIONS,
    GLOBAL_REG: GLOBAL_REG,
    FLOW: FLOW,
    CART_DAILY: CART_DAILY,
    ABN_MGMT: ABN_MGMT,
    PROD_OPS: PROD_OPS,
    REGION3_AI: REGION3_AI,
    COE_PAGES: COE_PAGES,
    CANCEL_MGMT: CANCEL_MGMT,
    CS_BIZ: CS_BIZ,
    INSURANCE: INSURANCE,
    PROD_ABN: PROD_ABN
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
})().catch(function (e) {
  console.error('\n✗ 构建失败：' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
