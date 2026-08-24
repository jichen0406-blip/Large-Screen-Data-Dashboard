// pt-common.js — Page3/Page4 共享：时间控制（P3/P4 共享 sessionStorage）+ 表格辅助 + 五行单元格渲染
// 数据：window.BOARD_DATA.P3T

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function mVal(bucket, y, mo, ent, fld) {
    var k = y + '-' + pad(mo);
    var b = bucket[k];
    return (b && b[ent] && b[ent][fld]) || 0;
}
function pct2(a, t) { return (t && t > 0) ? Math.round(a / t * 100) + '%' : '--'; }
function yoyStr(c, l) {
    if (!(l > 0)) return '<span class="pt-ny">--</span>';
    var v = (c - l) / l * 100;
    return v >= 0 ? '<span class="pt-yu">+' + v.toFixed(0) + '%</span>' : '<span class="pt-yd">' + v.toFixed(0) + '%</span>';
}

// 五行单元格（Tar/Act/Act%/LY/YOY）：未来月（>所选月）仅 Act/Act%/YOY 留空，Tar/LY 显示全月
function ptCell(mt, i, m, t, a, l) {
    var c = '--';
    if (mt === 'Tar') c = t > 0 ? t : '--';
    else if (mt === 'Act') c = (i <= m && a > 0) ? a : '';
    else if (mt === 'Act%') c = (i <= m) ? pct2(a, t) : '';
    else if (mt === 'LY') c = l > 0 ? l : '--';
    else c = (i <= m) ? yoyStr(a, l) : '';
    return '<td' + (i === m ? ' class="pt-cur"' : '') + '>' + c + '</td>';
}
function ptYtdCell(mt, yt, ya, yl) {
    var yc = '--';
    if (mt === 'Tar') yc = yt > 0 ? yt : '--';
    else if (mt === 'Act') yc = ya > 0 ? ya : '';
    else if (mt === 'Act%') yc = pct2(ya, yt);
    else if (mt === 'LY') yc = yl > 0 ? yl : '--';
    else yc = yoyStr(ya, yl);
    return '<td class="pt-ytd">' + yc + '</td>';
}
// 五行整行：calcMonth(i) 返回 {t,a,l}；yt/ya/yl 为该行累计（传入初始 0）
function ptMetricRowHTML(mt, m, calcMonth, yt, ya, yl) {
    var h = '<tr class="pt-mtr"><td class="pt-lbl">' + mt + '</td>';
    for (var i = 1; i <= 12; i++) {
        var v = calcMonth(i);
        if (i <= m) { yt += v.t; ya += v.a; yl += v.l; }
        h += ptCell(mt, i, m, v.t, v.a, v.l);
    }
    return { h: h + ptYtdCell(mt, yt, ya, yl) + '</tr>', yt: yt, ya: ya, yl: yl };
}

// 时间控制：构建年月选项、读共享 sessionStorage（新开网页默认当前年月）、onchange 保存并回调
function initPtTime(selY, selM, yearKeys, onchange) {
    var yArr = Object.keys(yearKeys).sort();
    var now = new Date();
    var defY = String(now.getFullYear()), defM = now.getMonth() + 1;
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
