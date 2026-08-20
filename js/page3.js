// Page3：辖区数据管理1 — KPI 目标达成（公司目标）+ 国内&海外月度表 1/2（公司DOM&OB目标）
// 共享函数见 js/p3t-common.js；时间控制 P3/P4 共享（sessionStorage p3t_time）
$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.P3) return;
    var P3 = B.P3;
    var TARGET = P3.TARGET || {}, MO = P3.MONTH_O || {}, MR = P3.MONTH_R || {};
    var P3T = B.P3T;

    var yearKeys = {};
    Object.keys(TARGET).forEach(function (k) { yearKeys[k.slice(0, 4)] = true; });
    Object.keys(MO).forEach(function (k) { yearKeys[k.slice(0, 4)] = true; });
    function updateAll() { calc(); renderTables(); }
    initP3tTime('#p3y', '#p3m', yearKeys, updateAll);

    // KPI 卡片（公司目标）
    function calc() {
        var y = $('#p3y').val(), m = parseInt($('#p3m').val(), 10);
        var ly = String(parseInt(y, 10) - 1);
        var ytgtO = 0, ytgtR = 0, yactO = 0, yactR = 0, lyactO = 0, lyactR = 0;
        for (var i = 1; i <= m; i++) {
            var k = y + '-' + pad(i), lk = ly + '-' + pad(i);
            var t = TARGET[k] || { o: 0, r: 0 };
            ytgtO += t.o; ytgtR += t.r;
            yactO += MO[k] || 0; yactR += MR[k] || 0;
            lyactO += MO[lk] || 0; lyactR += MR[lk] || 0;
        }
        set('ytdOtgt', ytgtO); set('ytdOact', yactO); set('ytdOrate', rate(yactO, ytgtO)); set('ytdOyoy', yoy(yactO, lyactO));
        set('ytdRtgt', ytgtR); set('ytdRact', yactR); set('ytdRrate', rate(yactR, ytgtR)); set('ytdRyoy', yoy(yactR, lyactR));
        var mk = y + '-' + pad(m), mlk = ly + '-' + pad(m);
        var mtgt = TARGET[mk] || { o: 0, r: 0 };
        set('mtdOtgt', mtgt.o); set('mtdOact', MO[mk] || 0); set('mtdOrate', rate(MO[mk] || 0, mtgt.o)); set('mtdOyoy', yoy(MO[mk] || 0, MO[mlk] || 0));
        set('mtdRtgt', mtgt.r); set('mtdRact', MR[mk] || 0); set('mtdRrate', rate(MR[mk] || 0, mtgt.r)); set('mtdRyoy', yoy(MR[mk] || 0, MR[mlk] || 0));
        $('#p3ytdNum').text('下单' + yactO + ' · 回输' + yactR);
        $('#p3mtdNum').text('下单' + (MO[mk] || 0) + ' · 回输' + (MR[mk] || 0));
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
    if (!P3T) { calc(); return; }
    var COMP = P3T.COMP || {}, ND = P3T.ND || {};
    function compV(ym, cat, fld) {
        var b = COMP[ym];
        return (b && b[cat] && b[cat][fld]) || 0;
    }
    function renderND(elId, fld, name) {
        var y = parseInt($('#p3y').val(), 10), m = parseInt($('#p3m').val(), 10);
        var ly = y - 1;
        var gs = [
            { label: '国内', dom: true },
            { label: '海外', dom: false },
            { label: 'Total', dom: null }
        ];
        var h = '<table class="p3t"><thead><tr><th class="p3t-lbl">' + name + '</th>';
        for (var i = 1; i <= 12; i++) h += '<th>' + i + '月</th>';
        h += '<th class="p3t-ytd">YTD</th></tr></thead><tbody>';
        gs.forEach(function (g) {
            h += '<tr class="p3t-grp"><td class="p3t-lbl" colspan="14">' + g.label + '</td></tr>';
            ['Tar', 'Act', 'Act%', 'LY', 'YOY'].forEach(function (mt) {
                var row = p3tMetricRowHTML(mt, m, function (i) {
                    var t, a, l;
                    if (g.dom === true) { t = compV(y + '-' + pad(i), 'DOM', fld); a = mVal(ND, y, i, 'dom', fld); l = mVal(ND, ly, i, 'dom', fld); }
                    else if (g.dom === false) { t = compV(y + '-' + pad(i), 'OB', fld); a = mVal(ND, y, i, 'ov', fld); l = mVal(ND, ly, i, 'ov', fld); }
                    else { t = compV(y + '-' + pad(i), 'DOM', fld) + compV(y + '-' + pad(i), 'OB', fld); a = mVal(ND, y, i, 'dom', fld) + mVal(ND, y, i, 'ov', fld); l = mVal(ND, ly, i, 'dom', fld) + mVal(ND, ly, i, 'ov', fld); }
                    return { t: t, a: a, l: l };
                }, 0, 0, 0);
                h += row.h;
            });
        });
        h += '</tbody></table>';
        document.getElementById(elId).innerHTML = h;
    }

    function renderTables() {
        renderND('p3t41', 'o', '1. 国内&海外 下单月度');
        renderND('p3t42', 'r', '2. 国内&海外 回输月度');
    }

    updateAll();
});
