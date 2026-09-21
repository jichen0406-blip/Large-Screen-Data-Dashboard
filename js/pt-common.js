// pt-common.js — 辖区1/2/3 页面共享：时间控制（sessionStorage pt_time）+ 表格辅助 + 五行单元格渲染
// 数据：window.BOARD_DATA.REGIONS

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function mVal(bucket, y, mo, ent, fld) {
    var k = y + '-' + pad(mo);
    var b = bucket[k];
    return (b && b[ent] && b[ent][fld]) || 0;
}
function pct2(a, t) { return (t && t > 0) ? Math.round(a / t * 100) + '%' : '--'; }
// 达成率（Act%）按档着色：<80% 红 / ≥100% 绿 / 中间 黄
function pctHTML(a, t) {
    if (!(t > 0)) return '--';
    var v = Math.round(a / t * 100);
    var cls = v < 80 ? 'pt-pct-red' : (v >= 100 ? 'pt-pct-green' : 'pt-pct-yellow');
    return '<span class="' + cls + '">' + v + '%</span>';
}
function yoyStr(c, l) {
    if (!(l > 0)) return '<span class="pt-ny">--</span>';
    var v = (c - l) / l * 100;
    return v >= 0 ? '<span class="pt-yu">+' + v.toFixed(0) + '%</span>' : '<span class="pt-yd">' + v.toFixed(0) + '%</span>';
}

// ── 迷你趋势图：1 月～所选月折线 + 最小二乘拟合线（内联 SVG，不依赖 echarts） ──
// 只纳入「已到月份」：未来月份无数据，若按 0 参与拟合会让所有斜率人为下降
// arr = 该行 1..12 月数值；m = 所选月；w/h = 画布尺寸（默认 90×24）
function spark(arr, m, w, h) {
    w = w || 90; h = h || 24;
    var vals = (arr || []).slice(0, Math.max(1, Math.min(12, m)));
    var n = vals.length;
    var mx = Math.max.apply(null, vals.concat([1]));
    function X(i) { return n > 1 ? (i / (n - 1)) * (w - 2) + 1 : w / 2; }
    function Y(v) { return h - 2 - ((v || 0) / mx) * (h - 4); }
    function clip(v) { return Math.min(mx, Math.max(0, v)); }
    var pts = vals.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
    var out = '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' +
        '<polyline points="' + pts + '" fill="none" stroke="#4fe3ff" stroke-width="1.4" stroke-linejoin="round"/>';
    if (n > 1) {
        var sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (var i = 0; i < n; i++) { sx += i; sy += vals[i]; sxx += i * i; sxy += i * vals[i]; }
        var den = n * sxx - sx * sx;
        var b = den ? (n * sxy - sx * sy) / den : 0;
        var a = (sy - b * sx) / n;
        var fit = X(0).toFixed(1) + ',' + Y(clip(a)).toFixed(1) + ' ' + X(n - 1).toFixed(1) + ',' + Y(clip(a + b * (n - 1))).toFixed(1);
        out += '<polyline points="' + fit + '" fill="none" stroke="' + (b >= 0 ? '#62c98d' : '#ff8c42') + '" stroke-width="1.4" stroke-dasharray="3 2"/>';
    }
    return out + '</svg>';
}

// 五行单元格（Tar/Act/Act%/LY/YOY）：未来月（>所选月）仅 Act/Act%/YOY 留空，Tar/LY 显示全月
function ptCell(mt, i, m, t, a, l) {
    var c = '--';
    if (mt === 'Tar') c = t > 0 ? t : '--';
    else if (mt === 'Act') c = (i <= m && a > 0) ? a : '';
    else if (mt === 'Act%') c = (i <= m) ? pctHTML(a, t) : '';
    else if (mt === 'LY') c = l > 0 ? l : '--';
    else c = (i <= m) ? yoyStr(a, l) : '';
    return '<td' + (i === m ? ' class="pt-cur"' : '') + '>' + c + '</td>';
}
function ptYtdCell(mt, yt, ya, yl) {
    var yc = '--';
    if (mt === 'Tar') yc = yt > 0 ? yt : '--';
    else if (mt === 'Act') yc = ya > 0 ? ya : '';
    else if (mt === 'Act%') yc = pctHTML(ya, yt);
    else if (mt === 'LY') yc = yl > 0 ? yl : '--';
    else yc = yoyStr(ya, yl);
    return '<td class="pt-ytd">' + yc + '</td>';
}
// 五行整行：calcMonth(i) 返回 {t,a,l}；yt/ya/yl 为该行累计（传入初始 0）
// 末列「趋势图」：目标/实际/去年三行画迷你折线（同 SCOE 页），其余指标行留空占位
function ptMetricRowHTML(mt, m, calcMonth, yt, ya, yl) {
    var h = '<tr class="pt-mtr"><td class="pt-lbl">' + mt + '</td>';
    var hasSpark = (mt === 'Tar' || mt === 'Act' || mt === 'LY');
    var series = [];
    for (var i = 1; i <= 12; i++) {
        var v = calcMonth(i);
        if (i <= m) { yt += v.t; ya += v.a; yl += v.l; }
        h += ptCell(mt, i, m, v.t, v.a, v.l);
        if (hasSpark) series.push(mt === 'Tar' ? v.t : (mt === 'Act' ? v.a : v.l));
    }
    var sp = hasSpark ? '<td class="pt-spark">' + spark(series, m) + '</td>' : '<td class="pt-spark"></td>';
    return { h: h + ptYtdCell(mt, yt, ya, yl) + sp + '</tr>', yt: yt, ya: ya, yl: yl };
}

// 时间控制：构建年月选项、读共享 sessionStorage（无保存值时默认「最新有数据的月份」，辖区1/2/3 一致）、onchange 保存并回调
function initPtTime(selY, selM, yearKeys, onchange) {
    var yArr = Object.keys(yearKeys).sort();
    var now = new Date();
    var defY = String(now.getFullYear()), defM = now.getMonth() + 1;
    // 默认最新有数据月份：扫描 REGIONS.ND/HOSP 的 'YYYY-MM' 键，取下拉可选年份内的最大月份
    try {
        var B = window.BOARD_DATA;
        var bks = (B && B.REGIONS) ? [B.REGIONS.ND, B.REGIONS.HOSP] : [];
        var lm = null;
        bks.forEach(function (bk) {
            if (!bk) return;
            Object.keys(bk).forEach(function (k) {
                if (/^\d{4}-\d{2}$/.test(k) && yArr.indexOf(k.slice(0, 4)) >= 0) {
                    if (!lm || k > lm) lm = k;
                }
            });
        });
        if (lm) { defY = lm.slice(0, 4); defM = parseInt(lm.slice(5, 7), 10); }
    } catch (e) {}
    try {
        var _sh = JSON.parse(sessionStorage.getItem('pt_time') || 'null');
        if (_sh && yArr.indexOf(String(_sh.y)) >= 0) defY = String(_sh.y);
        if (_sh && _sh.m >= 1 && _sh.m <= 12) defM = _sh.m;
    } catch (e) {}
    var yHtml = '';
    yArr.forEach(function (y) { yHtml += '<option value="' + y + '">' + y + '年</option>'; });
    $(selY).html(yHtml);
    var mHtml = '';
    for (var i = 1; i <= 12; i++) mHtml += '<option value="' + i + '">' + i + '月</option>';
    $(selM).html(mHtml);
    $(selY).val(defY); $(selM).val(defM);
    function save() { try { sessionStorage.setItem('pt_time', JSON.stringify({ y: $(selY).val(), m: parseInt($(selM).val(), 10) })); } catch (e) {} }
    $(selY).on('change', function () { save(); onchange(); });
    $(selM).on('change', function () { save(); onchange(); });
}
