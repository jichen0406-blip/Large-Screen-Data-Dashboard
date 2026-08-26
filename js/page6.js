// Page7：辖区数据管理3 — 省份数据 / 医院数据（YTD + 同比）
// 共享函数见 js/pt-common.js；时间控制 辖区1/2/3 共享（sessionStorage pt_time）
// 数据：window.BOARD_DATA.P3T.HOSP = 'YYYY-MM' → 'AM|省份|城市|医院' → {o,r}
//       P3T.HSLAST = '省份|城市|医院名' → 'YYYY-MM-DD'（最近一次下单，不随时间控制器变动）
$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.P3T || !B.P3T.HOSP) return;
    var HOSP = B.P3T.HOSP;
    var HSLAST = B.P3T.HSLAST || {};
    var DP = B.DP || '';
    var AMS = B.P3T.AMS || [];

    var yearKeys = {};
    Object.keys(HOSP).forEach(function (k) { yearKeys[k.slice(0, 4)] = true; });
    function updateAll() { renderTables(); }
    initPtTime('#p6y', '#p6m', yearKeys, updateAll);

    // 按年累计：key('AM|省份|城市|医院') → {o,r,lo,lr}（当前/去年 YTD 窗口）
    function accumulate(y, m) {
        var ly = y - 1, acc = {};
        for (var i = 1; i <= m; i++) {
            var ym = y + '-' + pad(i), lym = ly + '-' + pad(i);
            var b1 = HOSP[ym], b2 = HOSP[lym];
            if (b1) Object.keys(b1).forEach(function (key) {
                var v = acc[key] || (acc[key] = { o: 0, r: 0, lo: 0, lr: 0 });
                v.o += b1[key].o || 0; v.r += b1[key].r || 0;
            });
            if (b2) Object.keys(b2).forEach(function (key) {
                var v = acc[key] || (acc[key] = { o: 0, r: 0, lo: 0, lr: 0 });
                v.lo += b2[key].o || 0; v.lr += b2[key].r || 0;
            });
        }
        return acc;
    }

    function renderTables() {
        var y = parseInt($('#p6y').val(), 10), m = parseInt($('#p6m').val(), 10);
        var acc = accumulate(y, m);
        // 仅保留当前窗口有下单或回输的医院（拆开 hospital key）
        var rows = [];
        Object.keys(acc).forEach(function (key) {
            var v = acc[key];
            if (!(v.o > 0 || v.r > 0)) return;
            var p = key.split('|');
            rows.push({ am: p[0], prov: p[1], city: p[2], hosp: p[3], o: v.o, r: v.r, lo: v.lo, lr: v.lr });
        });
        renderHS(rows);
        renderPV(rows);
    }

    // 空窗期 = 数据截止日 − 最近一次下单，单位天
    function gapDays(dp, d) {
        if (!dp || !d) return null;
        return Math.round((new Date(dp) - new Date(d)) / 86400000);
    }

    // 医院数据：按下单量降序；末尾「最近一次下单日期 / 下单空窗期」按医院实体合并，不随时间控制器变动
    function renderHS(rows) {
        rows.sort(function (a, b) { return b.o - a.o; });
        var h = '<table class="pt"><thead><tr>' +
            '<th>AM</th><th>省份</th><th>城市</th><th>医院名称</th>' +
            '<th>YTD下单</th><th>下单同比</th><th>YTD回输</th><th>回输同比</th>' +
            '<th>最近一次下单日期</th><th>下单空窗期</th>' +
            '</tr></thead><tbody>';
        rows.forEach(function (r) {
            var ld = HSLAST[r.prov + '|' + r.city + '|' + r.hosp];
            var gap = gapDays(DP, ld);
            h += '<tr><td>' + r.am + '</td><td>' + r.prov + '</td><td>' + (r.city || '--') + '</td>' +
                '<td class="pt-lbl">' + r.hosp + '</td>' +
                '<td>' + (r.o > 0 ? r.o : '') + '</td><td>' + yoyStr(r.o, r.lo) + '</td>' +
                '<td>' + (r.r > 0 ? r.r : '') + '</td><td>' + yoyStr(r.r, r.lr) + '</td>' +
                '<td>' + (ld || '--') + '</td><td>' + (gap === null ? '--' : (gap > 90 ? '<span class="pt-gap-red">' + gap + '天</span>' : gap + '天')) + '</td></tr>';
        });
        h += '</tbody></table>';
        document.getElementById('p6tHS').innerHTML = h;
    }

    // 省份数据：按 AM 分组（P3T.AMS 顺序），组内下单量降序；下单医院数=YTD内有下单的医院去重
    function renderPV(rows) {
        var provAgg = {}; // 'am|prov' → {o,r,lo,lr,hosp}
        rows.forEach(function (r) {
            var pk = r.am + '|' + r.prov;
            var g = provAgg[pk] || (provAgg[pk] = { o: 0, r: 0, lo: 0, lr: 0, hosp: {} });
            g.o += r.o; g.r += r.r; g.lo += r.lo; g.lr += r.lr;
            if (r.o > 0) g.hosp[r.hosp] = true; // 下单医院数去重
        });
        var groups = {};
        Object.keys(provAgg).forEach(function (pk) {
            var p = pk.split('|');
            var am = p[0], prov = p[1], g = provAgg[pk];
            if (!groups[am]) groups[am] = [];
            groups[am].push({ prov: prov, o: g.o, r: g.r, lo: g.lo, lr: g.lr, n: Object.keys(g.hosp).length });
        });
        var amOrder = [];
        AMS.forEach(function (a) { if (groups[a]) amOrder.push(a); });
        Object.keys(groups).forEach(function (a) { if (amOrder.indexOf(a) < 0) amOrder.push(a); });

        var h = '<table class="pt"><thead><tr>' +
            '<th>AM</th><th>省份名称</th><th>下单医院数</th>' +
            '<th>YTD下单</th><th>下单同比</th><th>YTD回输</th><th>回输同比</th>' +
            '</tr></thead><tbody>';
        amOrder.forEach(function (am) {
            var list = groups[am].sort(function (a, b) { return b.o - a.o; });
            h += '<tr class="pt-grp"><td class="pt-lbl" colspan="7">AM · ' + am + '</td></tr>';
            list.forEach(function (g) {
                h += '<tr><td></td><td class="pt-lbl">' + g.prov + '</td><td>' + (g.n > 0 ? g.n : '') + '</td>' +
                    '<td>' + (g.o > 0 ? g.o : '') + '</td><td>' + yoyStr(g.o, g.lo) + '</td>' +
                    '<td>' + (g.r > 0 ? g.r : '') + '</td><td>' + yoyStr(g.r, g.lr) + '</td></tr>';
            });
        });
        h += '</tbody></table>';
        document.getElementById('p6tPV').innerHTML = h;
    }

    updateAll();
});
