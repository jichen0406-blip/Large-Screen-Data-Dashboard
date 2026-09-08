#!/usr/bin/env node
// page_sync.js — 页面清单同步工具（页面身份 = key，序号 num 自动重排）
//   node page_sync.js index              → 刷新 项目文档.md §4.0 页面索引（已接入 deploy.sh）
//   node page_sync.js add --key K --name '页面名' [--id pageN.html] [--after key|--before key] [--dry-run]
//     add：生成新页 HTML + 插入 nav.js BOARD_PAGES（自动重排序号）+ users.js pageAccess 加空 key + 刷新文档索引
//   `--dry-run` 只打印将执行的改动，不写文件（含 add 脚手架预览）。
// 注意：本脚本只“插入一行/新建文件”，不修改任何既有账号/权限内容。
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var NAV = path.join(ROOT, 'js', 'nav.js');
var USERS = path.join(ROOT, 'js', 'users.js');
var DOC = path.join(ROOT, '项目文档.md');
var HTML_DIR = ROOT;

var MA = '<!-- PAGES:AUTO -->', MB = '<!-- /PAGES:AUTO -->';
var ERR = function (msg) { console.error('✗ ' + msg); process.exit(1); };
function backup(f) {
  if (!fs.existsSync(f)) return;
  var b = f + '.bak';
  try { fs.copyFileSync(f, b); } catch (e) {}
  return b;
}
function readText(f) { return fs.readFileSync(f, 'utf-8'); }
function writeText(f, s) { fs.writeFileSync(f, s, 'utf-8'); }

function parseArgs(argv) {
  var a = { _: [] };
  for (var i = 0; i < argv.length; i++) {
    var t = argv[i];
    if (t.slice(0, 2) === '--') {
      var k = t.slice(2), v = argv[i + 1];
      if (k === 'dry-run') { a.dryRun = true; continue; }
      if (v === undefined || v.slice(0, 2) === '--') ERR('缺参数值: ' + t);
      a[k] = v; i++;
    } else a._.push(t);
  }
  return a;
}

// ---------- 读取 / 重写 nav.js ----------
function navPages() {
  var src = readText(NAV);
  var m = src.match(/window\.BOARD_PAGES\s*=\s*(\[[\s\S]*?\n\s*\]);/);
  if (!m) ERR('无法定位 js/nav.js 的 window.BOARD_PAGES');
  var pages;
  try { pages = eval('(' + m[1] + ')'); } catch (e) { ERR('解析 BOARD_PAGES 失败: ' + e.message); }
  return { src: src, block: m[0], pages: pages };
}
function q(v) { return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function navBlockText(pages) {
  var lines = ['window.BOARD_PAGES = ['];
  pages.forEach(function (p) {
    lines.push("        { id: '" + q(p.id) + "', key: '" + q(p.key) + "', num: '" + q(p.num) + "', name: '" + q(p.name) + "' },");
  });
  lines.push('    ];');
  return lines.join('\n');
}

// ---------- 文档：§4.0 页面索引 ----------
function indexTable(pages) {
  var rows = ['', '| 序号 | key | 文件名 | 页面名 |', '|---|---|---|---|'];
  pages.forEach(function (p) {
    rows.push('| ' + p.num + ' | `' + p.key + '` | ' + p.id + ' | ' + p.name + ' |');
  });
  return rows.join('\n');
}
function indexSection(pages) {
  return '### 4.0 页面索引（自动生成）\n\n' +
    '> 本表由 `node page_sync.js index` 自动维护（已接入 `deploy.sh`），请勿手改。页面身份 = `key`（稳定识别码，授权按它匹配）；`序号` 仅为导航显示用，新增/插入页面后由脚本自动重排。后台管理（page7.html，key `admin`，仅管理员）由 `nav.js` 运行期注入，不入此表。\n\n' +
    MA + '\n' + indexTable(pages) + '\n' + MB;
}
function updateDocIndex(pages, dry) {
  if (!fs.existsSync(DOC)) { console.warn('⚠️ 跳过文档索引：找不到 ' + DOC); return { skipped: true, doc: null }; }
  var doc = readText(DOC);
  // 仅识别「独占一行」的标记（正文代码片段里出现的同名文字不视为标记）
  var re = /^<!-- PAGES:AUTO -->[\s\S]*?^<!-- \/PAGES:AUTO -->/m;
  if (re.test(doc)) {
    doc = doc.replace(re, MA + '\n' + indexTable(pages) + '\n' + MB);
  } else {
    var h = doc.indexOf('## 4. 页面结构与功能');
    if (h < 0) { console.warn('⚠️ 跳过文档索引：项目文档.md 缺少「## 4. 页面结构与功能」锚点（本地测试环境文档为占位，正式环境部署时才刷新）'); return { skipped: true, doc: null }; }
    // 在标题行之后插入（标题后原本有 1 空行，故前缀空一行分隔）
    doc = doc.slice(0, h) + '## 4. 页面结构与功能\n\n' + indexSection(pages) + '\n' + doc.slice(h).replace(/^## 4\. 页面结构与功能/, '');
  }
  if (dry) return { dry: true, doc: doc };
  backup(DOC);
  writeText(DOC, doc);
  return { doc: doc };
}
function scanResidualP(doc) {
  // 统计「自动索引区」之外的 P# 序号（代码示例行 num:'P..' 跳过），供人工确认
  var out = [], inMark = false;
  doc.split('\n').forEach(function (line) {
    var t = line.replace(/\r$/, '').trim();
    if (t === MA) { inMark = true; return; }
    if (t === MB) { inMark = false; return; }
    if (inMark) return;
    if (/num:\s*'P\d+/.test(line)) return;
    var m = line.match(/\bP\d{1,2}\b/g);
    if (m) out.push(line.trim().slice(0, 60));
  });
  return out;
}

// ---------- add：新页 HTML 骨架 ----------
function pageHTML(o) {
  return '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    '<title>福可苏业绩总览 · ' + o.name + '</title>\n' +
    '<script type="text/javascript" src="js/jquery.js"></script>\n' +
    '<script type="text/javascript" src="js/data.js"></script>\n' +
    '<script type="text/javascript" src="js/nav.js"></script>\n' +
    '<link rel="stylesheet" href="css/style.css">\n' +
    '\t<script>window.PAGE_KEY=\'' + o.key + '\';</script>\n' +
    '\t<script type="text/javascript" src="js/users.js"></script>\n' +
    '\t<script type="text/javascript" src="js/auth.js"></script>\n' +
    '</head>\n<body>\n' +
    '\t<div class="login-mask" id="loginMask">\n' +
    '\t\t<div class="login-body">\n' +
    '\t\t\t<div class="login-left"><img src="images/login29/qiu.png" alt=""></div>\n' +
    '\t\t\t<div class="login-center">\n' +
    '\t\t\t\t<div class="login-shuzibg"></div>\n' +
    '\t\t\t\t<div class="login-title">\n' +
    '\t\t\t\t\t<img class="login-logo" src="images/logo-white.png" alt="驯鹿生物">\n' +
    '\t\t\t\t\t<p class="login-title-main">驯鹿生物大数据监控平台</p>\n' +
    '\t\t\t\t\t<p class="login-title-sub">登录页</p>\n' +
    '\t\t\t\t</div>\n' +
    '\t\t\t\t<div class="login-card">\n' +
    '\t\t\t\t\t<div class="login-welcome">欢迎登录系统!</div>\n' +
    '\t\t\t\t\t<div class="login-input">\n' +
    '\t\t\t\t\t\t<div class="login-ico"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt=""></div>\n' +
    '\t\t\t\t\t\t<input type="text" id="loginUser" placeholder="请输入账号" autocomplete="off">\n' +
    '\t\t\t\t\t</div>\n' +
    '\t\t\t\t\t<div class="login-input">\n' +
    '\t\t\t\t\t\t<div class="login-ico"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt=""></div>\n' +
    '\t\t\t\t\t\t<input type="password" id="loginPwd" placeholder="密码" autocomplete="off">\n' +
    '\t\t\t\t\t</div>\n' +
    '\t\t\t\t\t<label class="login-remember"><input type="checkbox" id="loginRemember"><span>记住密码</span></label>\n' +
    '\t\t\t\t\t<div class="login-err" id="loginErr"></div>\n' +
    '\t\t\t\t\t<div class="login-btn" id="loginBtn"><span>登 录</span></div>\n' +
    '\t\t\t\t</div>\n' +
    '\t\t\t</div>\n' +
    '\t\t</div>\n' +
    '\t\t<div class="login-bolang"></div>\n' +
    '\t</div>\n' +
    '\t<div class="head clearfix">\n' +
    '\t\t<h1><img class="head-logo" src="images/logo-white.png" alt="驯鹿生物">驯鹿生物大数据监控平台</h1>\n' +
    '\t\t<div class="head-left">\n' +
    '\t\t\t<div class="update" id="dataUpd">数据更新时间 --</div>\n' +
    '\t\t\t<button class="menu-btn" id="menuBtn" type="button"><i>☰</i><span>网页导航</span></button>\n' +
    '\t\t</div>\n' +
    '\t\t<div class="tm-wrap">\n' +
    '\t\t\t<div class="time" id="showTime">--</div>\n' +
    '\t\t\t<div class="weather" id="weather">上海 --</div>\n' +
    '\t\t</div>\n' +
    '\t\t<script>\n' +
    '\t\tvar t = null;\n' +
    '\t\tt = setTimeout(time, 1000);\n' +
    '\t\tfunction time() {\n' +
    '\t\t\tclearTimeout(t);\n' +
    '\t\t\tvar dt = new Date();\n' +
    '\t\t\tvar y = dt.getFullYear(), mt = dt.getMonth() + 1, day = dt.getDate();\n' +
    '\t\t\tvar h = dt.getHours(), m = dt.getMinutes(), s = dt.getSeconds();\n' +
    '\t\t\tdocument.getElementById("showTime").innerHTML = y + "/" + mt + "/" + day + " " + h + ":" + m + ":" + s + "";\n' +
    '\t\t\tt = setTimeout(time, 1000);\n' +
    '\t\t}\n' +
    '\t\t</script>\n' +
    '\t</div>\n' +
    '\t<div class="mainbox">\n' +
    '\t\t<div class="box">\n' +
    '\t\t\t<div class="tit">' + o.name + '</div>\n' +
    '\t\t\t<div class="boxnav">（新页面占位，请在此填充图表/表格，样式前缀建议 ' + o.id.replace('.html', '') + '-* 或 pt-*）</div>\n' +
    '\t\t</div>\n' +
    '\t</div>\n' +
    '\t<!-- 网页导航菜单 -->\n' +
    '\t<div class="menu-mask" id="menuMask" style="display:none;">\n' +
    '\t\t<div class="menu-panel">\n' +
    '\t\t\t<div class="menu-panel-head">\n' +
    '\t\t\t\t<span class="menu-panel-tit">网页导航</span>\n' +
    '\t\t\t\t<button class="menu-close" id="menuClose" type="button">×</button>\n' +
    '\t\t\t</div>\n' +
    '\t\t\t<ul class="menu-list" id="menuList"></ul>\n' +
    '\t\t\t<div class="menu-pager" id="menuPager"></div>\n' +
    '\t\t</div>\n' +
    '\t</div>\n' +
    '\t<script>\n' +
    '\t// 数据更新时间\n' +
    '\t$(function () {\n' +
    '\t\tvar B = (typeof BOARD_DATA !== \'undefined\') ? BOARD_DATA : null;\n' +
    '\t\t$(\'#dataUpd\').text((B && B.UPDATED) ? (\'数据更新时间 \' + B.UPDATED) : \'数据更新时间 --\');\n' +
    '\t});\n' +
    '\t</script>\n' +
    '\t<script type="text/javascript" src="js/fs.js"></script>\n' +
    '\t<!-- 左侧悬浮导航栏 -->\n' +
    '\t<div class="side-nav" id="sideNav"></div>\n' +
    '</body>\n</html>\n';
}

function nextFreeId(pages) {
  var used = {}; pages.forEach(function (p) { used[p.id] = true; });
  var n = 2;
  while (used['page' + n + '.html'] || fs.existsSync(path.join(HTML_DIR, 'page' + n + '.html'))) n++;
  return 'page' + n + '.html';
}

function cmdIndex(opts) {
  var np = navPages();
  var r = updateDocIndex(np.pages, opts.dryRun);
  if (r.skipped) { console.log('页面索引刷新跳过（见上方警告）'); return 0; }
  var res = scanResidualP(r.doc);
  console.log((opts.dryRun ? '[dry-run] ' : '') + '刷新页面索引 → 共 ' + np.pages.length + ' 页');
  if (!opts.dryRun) console.log('已写回 ' + DOC);
  if (res.length) {
    console.log('提示：自动索引区外仍出现 P# 序号 ' + res.length + ' 处（' + res.slice(0, 12).join(', ') + '…）——若为正文页面引用请改为名称/key，代码示例除外。');
  } else {
    console.log('自动索引区外无 P# 页面引用残留 ✓');
  }
  return 0;
}

function cmdAdd(opts) {
  if (!opts.key || !opts.name) ERR('用法：node page_sync.js add --key K --name "页面名" [--after key|--before key] [--id pageN.html] [--dry-run]');
  if (!/^[a-z][a-z0-9_]*$/.test(opts.key)) ERR('key 需小写字母开头，仅 a-z/0-9/_：' + opts.key);
  var np = navPages();
  if (np.pages.some(function (p) { return p.key === opts.key; })) ERR('nav.js 已有 key=' + opts.key);
  var anchor = opts.after || opts.before;
  if (anchor && !np.pages.some(function (p) { return p.key === anchor; })) ERR('锚点页面 key 不存在：' + anchor);
  var id = opts.id || nextFreeId(np.pages);
  if (np.pages.some(function (p) { return p.id === id; })) ERR('文件名已被占用：' + id);
  var entry = { id: id, key: opts.key, num: '', name: opts.name };

  // 1) nav 插入 + 重排 num
  var idx;
  if (opts.after) idx = np.pages.map(function (p) { return p.key; }).indexOf(opts.after) + 1;
  else if (opts.before) idx = np.pages.map(function (p) { return p.key; }).indexOf(opts.before);
  else { // 默认插到 reserved 之前
    var ri = np.pages.map(function (p) { return p.key; }).indexOf('reserved');
    idx = ri >= 0 ? ri : np.pages.length;
  }
  var pages2 = np.pages.slice();
  pages2.splice(idx, 0, entry);
  pages2.forEach(function (p, i) { p.num = 'P' + (i + 1); });

  // 2) users.js pageAccess 加空 key（JSON 风格缩进 4）
  var usersText = readText(USERS);
  var inject = '\n    "' + opts.key + '": [],';
  var u2;
  var mm = usersText.match(/("pageAccess"\s*:\s*\{[\s\S]*?)(\n\s*"reserved":)/);
  if (mm) u2 = usersText.slice(0, mm.index) + mm[1] + inject + usersText.slice(mm.index + mm[1].length);
  else {
    var m2 = usersText.match(/("pageAccess"\s*:\s*\{)(\n)/);
    if (!m2) ERR('js/users.js 找不到 pageAccess 对象');
    u2 = usersText.slice(0, m2.index) + m2[1] + inject + usersText.slice(m2.index + m2[1].length);
  }

  // 3) 新页 HTML
  var html = pageHTML({ name: opts.name, key: opts.key, id: id });

  // 4) 文档索引
  var docOld = fs.existsSync(DOC) ? readText(DOC) : null;
  var idxInfo = docOld ? updateDocIndex(pages2, true) : null;

  if (opts.dryRun) {
    console.log('[dry-run] 将新增页面：');
    console.log('  文件    ' + path.join(HTML_DIR, id));
    console.log('  nav.js  插入 { id:' + id + ", key:'" + opts.key + "', num:'" + pages2[idx].num + "', name:'" + opts.name + "' }，其余页面序号自动重排");
    console.log('  users.js pageAccess 增加 "' + opts.key + '": []（不触碰任何既有账号/权限）');
    if (idxInfo && idxInfo.skipped) console.log('  文档    索引刷新将跳过（占位/无锚点文档）');
    else console.log('  文档    刷新 §4.0 索引（' + pages2.length + ' 页）');
    console.log('  -- 后续待你手动：填充页面主体、样式前缀 ' + id.replace('.html', '') + '-*，若需给用户看 → 到后台「页面权限管理」勾选；并在项目文档 §4 增写新页说明小节。');
    return 0;
  }
  if (fs.existsSync(id)) ERR('目标文件已存在，已中止（避免覆盖）：' + id);
  backup(NAV); backup(USERS);
  writeText(id, html);
  var nsrc = np.src.replace(np.block, navBlockText(pages2));
  writeText(NAV, nsrc);
  writeText(USERS, u2);
  var ures = updateDocIndex(pages2, false);
  console.log('✓ 已新建页面并接入：');
  console.log('  文件    ' + path.join(HTML_DIR, id));
  console.log('  nav.js  num 重排 → 新页 ' + pages2[idx].num);
  console.log('  users.js pageAccess 已加 "' + opts.key + '": []');
  console.log('  文档    ' + (ures.skipped ? '索引刷新跳过（占位/无锚点文档，正式部署时自动刷新）' : '§4.0 索引已刷新'));
  console.log('  -- 后续待你手动：填充 ' + id + ' 主体、样式前缀 ' + id.replace('.html', '') + '-*；在后台「页面权限管理」给该页勾选用户；在项目文档 §4 增写新页说明小节。');
  return 0;
}

// ---------- main ----------
var args = parseArgs(process.argv.slice(2));
var cmd = args._[0];
if (cmd === 'index') process.exit(cmdIndex(args));
if (cmd === 'add') process.exit(cmdAdd(args));
console.log('用法:\n  node page_sync.js index\n  node page_sync.js add --key K --name "页面名" [--id pageN.html] [--after key|--before key] [--dry-run]');
process.exit(cmd ? 2 : 0);
