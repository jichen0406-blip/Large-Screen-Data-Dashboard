// page4.js — 福可苏目标管理（key region1，原「目标数据管理」）：KPI 目标达成（公司目标）+ 国内&海外月度表 1/2（公司DOM&OB目标）
// 时间筛选：开始月 ~ 结束月（默认当年 1 月 ~ 系统当前月 = 原 YTD）；按年 12 月矩阵，区间限同一年。
// 口径见 项目文档 §10.5；表格累计列 = 区间累计，区间外月份置灰。
$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.REGION1_KPI) return;
    var REGION1_KPI = B.REGION1_KPI;
    var TARGET = REGION1_KPI.TARGET || {}, MO = REGION1_KPI.MONTH_O || {}, MR = REGION1_KPI.MONTH_R || {};
    var REGIONS = B.REGIONS;

    // 可选月份：目标/实际/辖区数据里出现过的月份
    var pool = {};
    [TARGET, MO, MR].forEach(function (o) {
        Object.keys(o).forEach(function (k) { if (TR.isYm(k)) pool[k] = 1; });
    });
    if (REGIONS) Object.keys(REGIONS.ND || {}).forEach(function (k) { if (TR.isYm(k)) pool[k] = 1; });

    var RG = TR.init({
        y1: '#p4y1', m1: '#p4m1', y2: '#p4y2', m2: '#p4m2',
        months: Object.keys(pool),
        dp: B.DP,
        sameYear: true,                 // 12 月矩阵页：区间限同一年
        storageKey: 'pt_range',         // 辖区 1/2/3 共用同一个区间
        onChange: function () { calc(); renderTables(); }
    });

    // KPI 卡片（公司目标）：区间累计 + 结束月单月（原 YTD / MTD）
    function calc() {
        var rg = RG.read(), y = rg.y2, ly = y - 1;
        var tgtO = 0, tgtR = 0, actO = 0, actR = 0, lyO = 0, lyR = 0;
        rg.months.forEach(function (k) {
            var t = TARGET[k] || { o: 0, r: 0 };
            tgtO += t.o; tgtR += t.r;
            actO += MO[k] || 0; actR += MR[k] || 0;
            var lk = (parseInt(k.slice(0, 4), 10) - 1) + k.slice(4);
            lyO += MO[lk] || 0; lyR += MR[lk] || 0;
        });
        set('ytdOtgt', tgtO); set('ytdOact', actO); set('ytdOrate', rate(actO, tgtO)); set('ytdOyoy', yoy(actO, lyO));
        set('ytdRtgt', tgtR); set('ytdRact', actR); set('ytdRrate', rate(actR, tgtR)); set('ytdRyoy', yoy(actR, lyR));
        $('#p4ytdNum').text('下单' + actO + ' · 回输' + actR);

        // 结束月单月（原 MTD）
        var mk = rg.b, mlk = ly + mk.slice(4);
        var mtgt = TARGET[mk] || { o: 0, r: 0 };
        set('mtdOtgt', mtgt.o); set('mtdOact', MO[mk] || 0); set('mtdOrate', rate(MO[mk] || 0, mtgt.o)); set('mtdOyoy', yoy(MO[mk] || 0, MO[mlk] || 0));
        set('mtdRtgt', mtgt.r); set('mtdRact', MR[mk] || 0); set('mtdRrate', rate(MR[mk] || 0, mtgt.r)); set('mtdRyoy', yoy(MR[mk] || 0, MR[mlk] || 0));
        $('#p4mtdNum').text('下单' + (MO[mk] || 0) + ' · 回输' + (MR[mk] || 0));
    }
    function set(id, v) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = (v === null || v === undefined) ? '--' : (v === 0 ? '' : v);
    }
    function rate(act, tgt) { return tgt > 0 ? (act / tgt * 100).toFixed(1) + '%' : '--'; }
    function yoy(cur, ly) {
        if (ly <= 0) return '<span class="y-na">--</span>';
        var v = (cur - ly) / ly * 100;
        return v >= 0 ? '<span class="y-up">↑' + v.toFixed(1) + '%</span>' : '<span class="y-dn">↓' + Math.abs(v).toFixed(1) + '%</span>';
    }

    // 表格 1/2：国内&海外 月度（公司DOM&OB目标：DOM=国内 / OB=海外）
    if (!REGIONS) { calc(); return; }
    var COMP = REGIONS.COMP || {}, ND = REGIONS.ND || {};
    function compV(ym, cat, fld) {
        var b = COMP[ym];
        return (b && b[cat] && b[cat][fld]) || 0;
    }
    function renderND(elId, fld, name) {
        var rg = RG.read(), y = rg.y2, ly = y - 1, m1 = rg.m1, m2 = rg.m2;
        var gs = [
            { label: '国内', dom: true },
            { label: '海外', dom: false },
            { label: 'Total', dom: null }
        ];
        var h = '<table class="pt"><thead><tr><th class="pt-lbl">' + name + '</th>';
        for (var i = 1; i <= 12; i++) h += '<th' + ((m1 && (i < m1 || i > m2)) ? ' class="pt-off"' : '') + '>' + i + '月</th>';
        h += '<th class="pt-ytd">区间</th><th data-xls-skip>趋势图</th></tr></thead><tbody>';
        gs.forEach(function (g) {
            h += '<tr class="pt-grp"><td class="pt-lbl" colspan="15">' + g.label + '</td></tr>';
            ['Tar', 'Act', 'Act%', 'LY', 'YOY'].forEach(function (mt) {
                var row = ptMetricRowHTML(mt, m2, function (i) {
                    var t, a, l;
                    if (g.dom === true) { t = compV(y + '-' + pad(i), 'DOM', fld); a = mVal(ND, y, i, 'dom', fld); l = mVal(ND, ly, i, 'dom', fld); }
                    else if (g.dom === false) { t = compV(y + '-' + pad(i), 'OB', fld); a = mVal(ND, y, i, 'ov', fld); l = mVal(ND, ly, i, 'ov', fld); }
                    else { t = compV(y + '-' + pad(i), 'DOM', fld) + compV(y + '-' + pad(i), 'OB', fld); a = mVal(ND, y, i, 'dom', fld) + mVal(ND, y, i, 'ov', fld); l = mVal(ND, ly, i, 'dom', fld) + mVal(ND, ly, i, 'ov', fld); }
                    return { t: t, a: a, l: l };
                }, 0, 0, 0, m1);
                h += row.h;
            });
        });
        h += '</tbody></table>';
        document.getElementById(elId).innerHTML = h;
    }

    function renderTables() {
        renderND('p4t41', 'o', '1. 国内&海外 下单月度');
        renderND('p4t42', 'r', '2. 国内&海外 回输月度');
    }

    calc();
    renderTables();
});
