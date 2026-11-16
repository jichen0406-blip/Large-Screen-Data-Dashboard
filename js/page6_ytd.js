// page6_ytd.js — 省份&医院全量数据 · 彩蛋版（key region3_ytd，挂在「彩蛋」分组）
// 与 page6.js 的差别：
//   1) 时间控件是「开始年/月 ~ 结束年/月」区间，默认 = 数据最早月 ~ 最新月（全量）；累计只算区间内月份；
//   2) 表格不含同比列，也不计算去年数据（同比整列去掉）。
// 数据：window.BOARD_DATA.REGIONS.HOSP / HSLAST / COEHOSP
$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.REGIONS || !B.REGIONS.HOSP) return;
    var HOSP = B.REGIONS.HOSP;
    var HSLAST = B.REGIONS.HSLAST || {};
    var COEHOSP = B.REGIONS.COEHOSP || {};
    var DP = B.DP || '';
    var AMS = B.REGIONS.AMS || [];

    var COE_CATS = ['SCOE', 'COE', 'RCOE', 'Others'];
    var selCoe = {}; COE_CATS.forEach(function (c) { selCoe[c] = true; });
    var hsQuery = '';

    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function coeOf(r) { return COEHOSP[r.prov + '|' + r.city + '|' + r.hosp] || 'Others'; }
    function coeRank(c) { var i = COE_CATS.indexOf(c); return i < 0 ? COE_CATS.length : i; }

    // 可选月份：数据里出现过的 'YYYY-MM'；默认区间 = 最早月 ~ 最新月（全量）
    var YMS = Object.keys(HOSP).filter(function (k) { return /^\d{4}-\d{2}$/.test(k); }).sort();
    var FIRST = YMS.length ? YMS[0] : (DP ? DP.slice(0, 7) : '');
    var LAST = YMS.length ? YMS[YMS.length - 1] : FIRST;

    // ── 时间区间：默认 = 数据最早月 ~ 最新数据月（全量），可跨年 ──
    var MONTHS = YMS;
    function initCtl() {
        window.__P6FULL_RG = window.TR.init({
            y1: '#p6ytY1', m1: '#p6ytM1', y2: '#p6ytY2', m2: '#p6ytM2',
            months: MONTHS,
            sameYear: false,
            storageKey: 'p6full_range',
            defaultY1: FIRST ? +FIRST.slice(0, 4) : undefined, defaultM1: FIRST ? +FIRST.slice(5, 7) : undefined,
            defaultY2: LAST ? +LAST.slice(0, 4) : undefined, defaultM2: LAST ? +LAST.slice(5, 7) : undefined,
            onChange: renderTables
        });
    }
    function rg() { return window.__P6FULL_RG.read(); }

    // 区间累计：key('AM|省份|城市|医院') → {o,r}
    function accumulate(r0) {
        var acc = {};
        r0.months.forEach(function (mk) {
            var b = HOSP[mk];
            if (!b) return;
            Object.keys(b).forEach(function (key) {
                var v = acc[key] || (acc[key] = { o: 0, r: 0 });
                v.o += b[key].o || 0; v.r += b[key].r || 0;
            });
        });
        return acc;
    }

    function currentRows() {
        var acc = accumulate(rg()), rows = [];
        Object.keys(acc).forEach(function (key) {
            var v = acc[key];
            if (!(v.o > 0 || v.r > 0)) return;
            var p = key.split('|');
            rows.push({ am: p[0], prov: p[1], city: p[2], hosp: p[3], o: v.o, r: v.r, cur: true });
        });
        return rows;
    }

    function renderTables() {
        var rows = currentRows();
        renderHS(rows);
        renderPV(rows);
    }

    // ── 医院数据（无同比列）──
    function renderHS(rows) {
        rows.forEach(function (r) { r.coe = coeOf(r); });
        var list = rows.filter(function (r) { return selCoe[r.coe]; });
        if (hsQuery) list = list.filter(function (r) { return String(r.hosp || '').toLowerCase().indexOf(hsQuery) >= 0; });
        list.sort(function (a, b) {
            var d = coeRank(a.coe) - coeRank(b.coe);
            if (d) return d;
            if (b.o !== a.o) return b.o - a.o;
            return a.hosp < b.hosp ? -1 : 1;
        });
        var sumO = 0, sumR = 0;
        list.forEach(function (r) { sumO += r.o; sumR += r.r; });
        $('#p6hsSum').html('<span class="p6-sum-lbl">当前可见 ' + list.length + ' 家</span>' +
            '<span class="p6-sum-item">累计下单 <b>' + sumO + '</b></span>' +
            '<span class="p6-sum-item">累计回输 <b>' + sumR + '</b></span>');

        var h = '<table class="pt"><thead><tr>' +
            '<th>AM</th><th>省份</th><th>城市</th><th>医院名称</th><th>COE</th>' +
            '<th>累计下单</th><th>累计回输</th>' +
            '<th>最近一次下单日期</th><th>下单空窗期</th>' +
            '</tr></thead><tbody>';
        list.forEach(function (r) {
            var ld = HSLAST[r.prov + '|' + r.city + '|' + r.hosp];
            var gap = gapDays(DP, ld);
            h += '<tr><td>' + r.am + '</td><td>' + r.prov + '</td><td>' + (r.city || '--') + '</td>' +
                '<td class="pt-lbl">' + r.hosp + '</td><td class="p6-coe p6-coe-' + r.coe.toLowerCase() + '">' + r.coe + '</td>' +
                '<td>' + (r.o > 0 ? r.o : '') + '</td><td>' + (r.r > 0 ? r.r : '') + '</td>' +
                '<td>' + (ld || '--') + '</td><td>' + (gap === null ? '--' : (gap > 90 ? '<span class="pt-gap-red">' + gap + '天</span>' : gap + '天')) + '</td></tr>';
        });
        h += '</tbody></table>';
        document.getElementById('p6tHS').innerHTML = h;
    }

    // ── 省份数据（无同比列）──
    function renderPV(rows) {
        var provAgg = {};
        rows.forEach(function (r) {
            var g = provAgg[r.prov] || (provAgg[r.prov] = { o: 0, r: 0, hosp: {}, ams: {} });
            g.o += r.o; g.r += r.r;
            g.ams[r.am] = true;
            if (r.o > 0) g.hosp[r.city + '|' + r.hosp] = true;
        });
        var list = Object.keys(provAgg).map(function (prov) {
            var g = provAgg[prov];
            var ams = AMS.filter(function (a) { return g.ams[a]; });
            Object.keys(g.ams).forEach(function (a) { if (ams.indexOf(a) < 0) ams.push(a); });
            return { prov: prov, ams: ams.join('、'), o: g.o, r: g.r, n: Object.keys(g.hosp).length };
        }).filter(function (g) { return g.o > 0 || g.r > 0; })
          .sort(function (a, b) { return b.o - a.o || a.prov.localeCompare(b.prov, 'zh'); });

        var h = '<table class="pt"><thead><tr>' +
            '<th>AM</th><th>省份名称</th><th>下单医院数</th>' +
            '<th>累计下单</th><th>累计回输</th>' +
            '</tr></thead><tbody>';
        list.forEach(function (g) {
            h += '<tr><td>' + g.ams + '</td><td class="pt-lbl">' + g.prov + '</td><td>' + (g.n > 0 ? g.n : '') + '</td>' +
                '<td>' + (g.o > 0 ? g.o : '') + '</td><td>' + (g.r > 0 ? g.r : '') + '</td></tr>';
        });
        h += '</tbody></table>';
        document.getElementById('p6tPV').innerHTML = h;
    }

    // 空窗期 = 数据截止日 − 最近一次下单（天）
    function gapDays(dp, d) {
        if (!dp || !d) return null;
        return Math.round((new Date(dp) - new Date(d)) / 86400000);
    }

    function renderCoeLights() {
        var s = '';
        COE_CATS.forEach(function (c) {
            var on = selCoe[c];
            s += '<button type="button" class="cart-light' + (on ? ' on' : '') + '" data-coe="' + c + '">' + c + '</button>';
        });
        $('#p6coeLights').html(s);
    }

    function refreshHS() { renderHS(currentRows()); }
    $('#p6coeLights').on('click', '.cart-light', function () {
        var c = $(this).data('coe');
        var next = !selCoe[c];
        var onCnt = COE_CATS.filter(function (x) { return selCoe[x]; }).length;
        if (!next && onCnt <= 1) return;
        selCoe[c] = next;
        renderCoeLights();
        refreshHS();
    });
    $('#p6hsSearch').on('input', function () {
        hsQuery = String(this.value || '').trim().toLowerCase();
        refreshHS();
    });
    $('#p6hsClear').on('click', function () {
        $('#p6hsSearch').val('');
        hsQuery = '';
        refreshHS();
    });

    var up = document.getElementById('p6Upd');
    if (up) up.textContent = B.UPDATED || '--';
    initCtl();
    renderCoeLights();
    renderTables();
});
