// 生产异常订单管理 三页共用（page30 总览 / page31 医院 / page32 明细）
// 数据：BOARD_DATA.PROD_ABN（build_data.js §8x）
$(function () {
    var B = window.BOARD_DATA;
    var P = B && B.PROD_ABN;
    if (!P || !P.rows) return;

    var CFG = window.PABN_CFG || { view: 'sum' };
    var VIEW = CFG.view;
    var CATS = P.cats;
    var COLOR = ['#1677c8', '#ffb800', '#62c98d'];      // PBMC / 一次 / 二次

    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function thousands(s) { return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function pct(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '—'; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* 筛选控件 */
    var months = P.months.slice();
    var years = [], byYear = {};
    months.forEach(function (ym) {
        var y = ym.slice(0, 4), m = +ym.slice(5, 7);
        if (years.indexOf(y) < 0) { years.push(y); byYear[y] = []; }
        byYear[y].push(m);
    });
    years.sort();
    var last = months[months.length - 1] || '2026-10';
    var amList = [];
    P.rows.forEach(function (r) { if (r.am && amList.indexOf(r.am) < 0) amList.push(r.am); });
    amList.sort();

    var st = { y1: last.slice(0, 4), m1: 1, y2: last.slice(0, 4), m2: +last.slice(5, 7), am: 'ALL', cats: CATS.slice(), kw: '' };

    function fillYears(sel, val) {
        sel.innerHTML = years.map(function (y) {
            return '<option value="' + y + '"' + (y === val ? ' selected' : '') + '>' + y + ' 年</option>';
        }).join('');
    }
    function fillMonths(sel, y, val) {
        var ms = (byYear[y] || []).slice().sort(function (a, b) { return a - b; });
        sel.innerHTML = ms.map(function (m) {
            return '<option value="' + m + '"' + (m === val ? ' selected' : '') + '>' + m + ' 月</option>';
        }).join('');
    }

    var $Y1 = document.getElementById('paY1'), $M1 = document.getElementById('paM1');
    var $Y2 = document.getElementById('paY2'), $M2 = document.getElementById('paM2');
    var $AM = document.getElementById('paAM');
    // 页面1/2 有年月+AM；页面3 额外有分类与搜索
    if ($Y1) {
        fillYears($Y1, st.y1); fillMonths($M1, st.y1, st.m1);
        fillYears($Y2, st.y2); fillMonths($M2, st.y2, st.m2);
        $AM.innerHTML = '<option value="ALL">全部 AM</option>' + amList.map(function (a) {
            return '<option value="' + esc(a) + '">' + esc(a) + '</option>';
        }).join('');
        $Y1.addEventListener('change', function () { st.y1 = $Y1.value; fillMonths($M1, st.y1, 1); render(); });
        $Y2.addEventListener('change', function () { st.y2 = $Y2.value; fillMonths($M2, st.y2, 12); render(); });
        [$M1, $M2, $AM].forEach(function (el) { el.addEventListener('change', render); });
    }

    function readRange() {
        if (!$Y1) return;
        st.y1 = $Y1.value; st.m1 = +$M1.value; st.y2 = $Y2.value; st.m2 = +$M2.value; st.am = $AM.value;
        if (st.y1 > st.y2) { st.y2 = st.y1; $Y2.value = st.y1; fillMonths($M2, st.y2, st.m2); }
        if (st.y1 === st.y2 && st.m1 > st.m2) { st.m2 = st.m1; $M2.value = st.m1; }
    }
    function ym1() { return st.y1 + '-' + pad2(st.m1); }
    function ym2() { return st.y2 + '-' + pad2(st.m2); }
    function rowsIn() {
        return P.rows.filter(function (r) {
            return r.ym >= ym1() && r.ym <= ym2() && (st.am === 'ALL' || r.am === st.am);
        });
    }

    /* ══ 视图 1：总览（3 卡片 + 3 柱状图） ══ */
    var charts = [];
    function renderSum() {
        var rows = rowsIn();
        var cnt = [0, 0, 0];
        rows.forEach(function (r) { var i = CATS.indexOf(r.cat); if (i >= 0) cnt[i]++; });
        var total = cnt[0] + cnt[1] + cnt[2];

        var cardBox = document.getElementById('paCards');
        if (cardBox) {
            cardBox.innerHTML = CATS.map(function (c, i) {
                return '<div class="kpi-card" style="--ac:' + COLOR[i] + '">' +
                    '<div class="kc-label">' + c + '</div>' +
                    '<div class="kc-val">' + thousands(cnt[i]) + '<small>单</small></div>' +
                    '<div class="kc-sub">占三类 ' + pct(cnt[i], total) + '</div></div>';
            }).join('');
        }

        // 月度数据（范围内连续月份，无数据补 0）
        var ms = [], y = +ym1().slice(0, 4), m = +ym1().slice(5, 7);
        var ey = +ym2().slice(0, 4), em = +ym2().slice(5, 7);
        while (y < ey || (y === ey && m <= em)) {
            ms.push(y + '-' + pad2(m));
            m++; if (m > 12) { m = 1; y++; }
        }
        var series = [[], [], []];
        ms.forEach(function (k) {
            var v = [0, 0, 0];
            rows.forEach(function (r) { if (r.ym === k) { var i = CATS.indexOf(r.cat); if (i >= 0) v[i]++; } });
            for (var i = 0; i < 3; i++) series[i].push(v[i]);
        });
        // 三图 Y 轴统一量程
        var maxV = 0;
        series.forEach(function (s) { s.forEach(function (x) { if (x > maxV) maxV = x; }); });
        var step = maxV <= 5 ? 1 : maxV <= 10 ? 2 : maxV <= 20 ? 5 : 10;
        var yMax = Math.max(step, Math.ceil(maxV / step) * step);

        CATS.forEach(function (c, i) {
            var el = document.getElementById('paChart' + i);
            if (!el) return;
            if (!charts[i]) {
                charts[i] = echarts.init(el, null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
                charts[i].__pabn = true;
            }
            charts[i].setOption({
                grid: { left: 8, right: 14, top: 14, bottom: 4, containLabel: true },
                tooltip: {
                    trigger: 'axis', axisPointer: { type: 'shadow' },
                    backgroundColor: 'rgba(2,24,61,.94)', borderColor: 'rgba(47,137,207,.8)', borderWidth: 1,
                    extraCssText: 'box-shadow:0 0 20px rgba(47,137,207,.4);border-radius:8px;',
                    formatter: function (ps) { return '<b>' + ps[0].axisValue + '</b><br/>' + c + '：' + ps[0].value + ' 单'; }
                },
                xAxis: {
                    type: 'category', data: ms.map(function (k) { return +k.slice(5, 7) + '月'; }),
                    axisLabel: { color: 'rgba(255,255,255,.5)', fontSize: 10, interval: ms.length > 18 ? 2 : 0 },
                    axisLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } }, axisTick: { show: false }
                },
                yAxis: {
                    type: 'value', min: 0, max: yMax, interval: step,
                    axisLabel: { color: 'rgba(255,255,255,.5)', fontSize: 10 },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } }
                },
                series: [{
                    type: 'bar', data: series[i], barMaxWidth: 16,
                    itemStyle: { color: COLOR[i], borderRadius: [2, 2, 0, 0] }
                }]
            }, true);
        });
        document.getElementById('paSub').textContent = ym1() + ' ~ ' + ym2() + ' · 共 ' + total + ' 单';
    }

    /* 医院名 → { 'YYYY-MM': 下单数 }，用于计算异常占比的分母 */
    var HOSP_ORDERS = {};
    (function () {
        var H = B.REGIONS && B.REGIONS.HOSP;
        if (!H) return;
        Object.keys(H).forEach(function (ym) {
            var day = H[ym];
            Object.keys(day).forEach(function (k) {
                var parts = k.split('|');
                var hn = parts[3];
                var v = day[k];
                if (!hn || !v || !v.o) return;
                var m = HOSP_ORDERS[hn] || (HOSP_ORDERS[hn] = {});
                m[ym] = (m[ym] || 0) + v.o;
            });
        });
    })();

    /* ══ 视图 2：医院汇总 ══ */
    function renderHosp() {
        var rows = rowsIn();
        var kw = st.kw;
        var map = {};
        rows.forEach(function (r) {
            var k = r.am + '|' + r.prov + '|' + r.hosp;
            var o = map[k] || (map[k] = { am: r.am, prov: r.prov, hosp: r.hosp, c: [0, 0, 0], total: 0 });
            var i = CATS.indexOf(r.cat);
            if (i >= 0) { o.c[i]++; o.total++; }
        });
        var list = Object.keys(map).map(function (k) { return map[k]; });
        if (kw) list = list.filter(function (x) { return x.hosp.indexOf(kw) >= 0; });
        list.sort(function (a, b) { return b.total - a.total; });

        // 所选期间月份 → 各院下单数（分母）
        var msAll = [], yy = +ym1().slice(0, 4), mm = +ym1().slice(5, 7);
        var ey = +ym2().slice(0, 4), em = +ym2().slice(5, 7);
        while (yy < ey || (yy === ey && mm <= em)) {
            msAll.push(yy + '-' + pad2(mm));
            mm++; if (mm > 12) { mm = 1; yy++; }
        }
        function ordersOf(hn) {
            var d = HOSP_ORDERS[hn];
            if (!d) return 0;
            var t = 0;
            for (var i = 0; i < msAll.length; i++) t += d[msAll[i]] || 0;
            return t;
        }
        list.forEach(function (x) { x.ord = ordersOf(x.hosp); x.rate = x.ord > 0 ? x.total / x.ord * 100 : null; });

        var sum = [0, 0, 0], tot = 0, totOrd = 0;
        list.forEach(function (x) {
            sum[0] += x.c[0]; sum[1] += x.c[1]; sum[2] += x.c[2];
            tot += x.total; totOrd += x.ord;
        });

        var h = '<table class="pt pt-ov"><thead><tr>' +
            '<th>AM</th><th>省份</th><th class="pt-lbl">医院</th>' +
            CATS.map(function (c) { return '<th>' + c + '</th>'; }).join('') +
            '<th>合计</th><th>期间下单</th><th>异常占比</th></tr></thead><tbody>';
        if (!list.length) h += '<tr><td colspan="9" style="text-align:center;color:rgba(255,255,255,.45);padding:16px 0;">无数据</td></tr>';
        list.forEach(function (x) {
            var rc = x.rate == null ? 'rgba(255,255,255,.35)'
                : (x.rate >= 20 ? '#ff4d4f' : x.rate >= 10 ? '#ffcf4d' : '#62c98d');
            h += '<tr><td>' + esc(x.am) + '</td><td>' + esc(x.prov) + '</td><td class="pt-lbl">' + esc(x.hosp) + '</td>' +
                '<td>' + (x.c[0] || '') + '</td><td>' + (x.c[1] || '') + '</td><td>' + (x.c[2] || '') + '</td>' +
                '<td style="color:#4fe3ff;font-weight:700;">' + x.total + '</td>' +
                '<td>' + (x.ord || '') + '</td>' +
                '<td style="color:' + rc + ';font-weight:700;">' + (x.rate == null ? '—' : x.rate.toFixed(1) + '%') + '</td></tr>';
        });
        if (list.length) {
            var trc = totOrd > 0 ? (tot / totOrd * 100) : null;
            h += '<tr class="pt-total-row"><td colspan="3">总计</td>' +
                '<td>' + sum[0] + '</td><td>' + sum[1] + '</td><td>' + sum[2] + '</td>' +
                '<td>' + tot + '</td><td>' + totOrd + '</td>' +
                '<td>' + (trc == null ? '—' : trc.toFixed(1) + '%') + '</td></tr>';
        }
        h += '</tbody></table>';
        document.getElementById('paTbl').innerHTML = h;
        document.getElementById('paTblSub').textContent = list.length + ' 家医院 · ' + tot + ' 单 · 期间下单 ' + totOrd +
            (totOrd > 0 ? ' · 占比 ' + (tot / totOrd * 100).toFixed(1) + '%' : '');
    }

    /* ══ 视图 3：明细 ══ */
    function renderList() {
        var rows = rowsIn().filter(function (r) {
            return st.cats.indexOf(r.cat) >= 0 &&
                (!st.kw || r.no.indexOf(st.kw) >= 0 || r.code.indexOf(st.kw) >= 0 || r.hosp.indexOf(st.kw) >= 0);
        });
        rows.sort(function (a, b) { return a.ym < b.ym ? 1 : a.ym > b.ym ? -1 : (a.am < b.am ? -1 : 1); });
        var h = '<table class="pt pt-ov"><thead><tr>' +
            '<th>年月</th><th>AM</th><th>省份</th><th>销售订单</th><th>追溯码</th><th class="pt-lbl">医院</th>' +
            '<th>患者名称</th><th>分类</th><th class="pt-lbl">最新更新信息</th></tr></thead><tbody>';
        if (!rows.length) h += '<tr><td colspan="9" style="text-align:center;color:rgba(255,255,255,.45);padding:16px 0;">无数据</td></tr>';
        rows.forEach(function (r) {
            var i = CATS.indexOf(r.cat);
            h += '<tr>' +
                '<td>' + r.ym + '</td>' +
                '<td>' + esc(r.am) + '</td>' +
                '<td>' + esc(r.prov) + '</td>' +
                '<td>' + esc(r.no) + '</td>' +
                '<td>' + esc(r.code) + '</td>' +
                '<td class="pt-lbl">' + esc(r.hosp) + '</td>' +
                '<td>' + esc(r.patient || '—') + '</td>' +
                '<td><span class="pa-tag" style="background:' + COLOR[i] + '22;color:' + COLOR[i] + '">' + esc(r.cat) + '</span></td>' +
                '<td class="pt-lbl pa-note" title="' + esc(r.note) + '">' + esc(r.note || '—') + '</td>' +
                '</tr>';
        });
        h += '</tbody></table>';
        document.getElementById('paTbl').innerHTML = h;
        document.getElementById('paTblSub').textContent = rows.length + ' 条';
    }

    /* 分类筛选 chips（仅明细页） */
    var $Cats = document.getElementById('paCats');
    if ($Cats) {
        function renderChips() {
            $Cats.innerHTML = CATS.map(function (c, i) {
                var on = st.cats.indexOf(c) >= 0;
                return '<span class="pa-chip' + (on ? ' on' : '') + '" data-c="' + esc(c) + '">' +
                    '<i style="background:' + COLOR[i] + '"></i>' + esc(c) + '</span>';
            }).join('');
        }
        $Cats.addEventListener('click', function (e) {
            var el = e.target.closest ? e.target.closest('.pa-chip') : null;
            if (!el) return;
            var c = el.getAttribute('data-c');
            var i = st.cats.indexOf(c);
            if (i >= 0) { if (st.cats.length > 1) st.cats.splice(i, 1); }
            else st.cats.push(c);
            renderChips(); render();
        });
        renderChips();
    }
    var $Kw = document.getElementById('paKw');
    if ($Kw) {
        var tm = null;
        $Kw.addEventListener('input', function () {
            clearTimeout(tm);
            tm = setTimeout(function () { st.kw = $Kw.value.trim(); render(); }, 220);
        });
        var $Kw2 = document.getElementById('paKwHosp');
        if ($Kw2) {
            $Kw2.addEventListener('input', function () {
                clearTimeout(tm);
                tm = setTimeout(function () { st.kw = $Kw2.value.trim(); render(); }, 220);
            });
        }
    }

    function render() {
        readRange();
        if (VIEW === 'sum') renderSum();
        else if (VIEW === 'hosp') renderHosp();
        else renderList();
    }

    window.addEventListener('resize', function () { charts.forEach(function (c) { if (c) c.resize(); }); });
    $(document).on('boardfs', function () { setTimeout(function () { charts.forEach(function (c) { if (c) c.resize(); }); }, 60); });

    render();
});
