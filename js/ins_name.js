// 惠民保 & 商保 名称统计（page29）
// 口径：组合值（如「惠军保+苏惠保」）已拆开分别计数，故名称合计略大于该类订单数
$(function () {
    var B = window.BOARD_DATA;
    var I = B && B.INSURANCE;
    if (!I || !I.rows) return;

    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function thousands(s) { return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function pctv(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '—'; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* 时间 + AM + 类型 筛选 */
    var months = I.months.slice();
    var years = [], byYear = {};
    months.forEach(function (ym) {
        var y = ym.slice(0, 4), m = +ym.slice(5, 7);
        if (years.indexOf(y) < 0) { years.push(y); byYear[y] = []; }
        byYear[y].push(m);
    });
    years.sort();
    var last = months[months.length - 1] || '2026-10';
    var st = { y1: last.slice(0, 4), m1: 1, y2: last.slice(0, 4), m2: +last.slice(5, 7), am: 'ALL', type: 'ALL' };

    var $Y1 = document.getElementById('nmY1'), $M1 = document.getElementById('nmM1');
    var $Y2 = document.getElementById('nmY2'), $M2 = document.getElementById('nmM2');
    var $AM = document.getElementById('nmAM');
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
    fillYears($Y1, st.y1); fillMonths($M1, st.y1, st.m1);
    fillYears($Y2, st.y2); fillMonths($M2, st.y2, st.m2);
    $AM.innerHTML = '<option value="ALL">全部 AM</option>' + I.amList.map(function (a) {
        return '<option value="' + esc(a) + '">' + esc(a) + '</option>';
    }).join('');

    $Y1.addEventListener('change', function () { st.y1 = $Y1.value; fillMonths($M1, st.y1, 1); render(); });
    $Y2.addEventListener('change', function () { st.y2 = $Y2.value; fillMonths($M2, st.y2, 12); render(); });
    [$M1, $M2, $AM].forEach(function (el) { el.addEventListener('change', render); });
    document.getElementById('nmTypes').addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('.cs-chip') : null;
        if (!el) return;
        var t = el.getAttribute('data-t');
        if (!t || t === st.type) return;
        st.type = t;
        renderChips(); render();
    });

    function renderChips() {
        var opts = [{ k: 'ALL', n: '全部', c: '#7ee3ff' }, { k: 'hb', n: '惠民保', c: '#4fe3ff' }, { k: 'bx', n: '商保', c: '#ffcf4d' }];
        document.getElementById('nmTypes').innerHTML = opts.map(function (o) {
            return '<span class="cs-chip' + (st.type === o.k ? ' on' : '') + '" data-t="' + o.k + '">' +
                '<i style="background:' + o.c + '"></i>' + o.n + '</span>';
        }).join('');
    }

    function ymRange() {
        st.y1 = $Y1.value; st.m1 = +$M1.value; st.y2 = $Y2.value; st.m2 = +$M2.value;
        if (st.y1 > st.y2) { st.y2 = st.y1; $Y2.value = st.y1; fillMonths($M2, st.y2, st.m2); }
        if (st.y1 === st.y2 && st.m1 > st.m2) { st.m2 = st.m1; $M2.value = st.m1; }
        return [st.y1 + '-' + pad2(st.m1), st.y2 + '-' + pad2(st.m2)];
    }

    /* 渲染 */
    var chart = null;
    function render() {
        var rg = ymRange();
        var rows = I.rows.filter(function (r) {
            return r.ym >= rg[0] && r.ym <= rg[1] && (st.am === 'ALL' || r.am === st.am);
        });
        var hbOrders = 0, bxOrders = 0;
        var nameHb = {}, nameBx = {};
        rows.forEach(function (r) {
            if (r.hb && r.hb.length) {
                hbOrders++;
                r.hb.forEach(function (n) { nameHb[n] = (nameHb[n] || 0) + 1; });
            }
            if (r.bx && r.bx.length) {
                bxOrders++;
                r.bx.forEach(function (n) { nameBx[n] = (nameBx[n] || 0) + 1; });
            }
        });
        var list = [];
        if (st.type === 'ALL' || st.type === 'hb') {
            Object.keys(nameHb).forEach(function (n) {
                list.push({ name: n, type: '惠民保', n: nameHb[n], base: hbOrders });
            });
        }
        if (st.type === 'ALL' || st.type === 'bx') {
            Object.keys(nameBx).forEach(function (n) {
                list.push({ name: n, type: '商保', n: nameBx[n], base: bxOrders });
            });
        }
        list.sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name); });

        // 卡片
        document.getElementById('nmKpi').innerHTML =
            '<div class="kpi-card" style="--ac:#4fe3ff"><div class="kc-label">惠民保名称数</div>' +
            '<div class="kc-val">' + Object.keys(nameHb).length + '<small>个</small></div>' +
            '<div class="kc-sub">' + thousands(hbOrders) + ' 单</div></div>' +
            '<div class="kpi-card" style="--ac:#ffcf4d"><div class="kc-label">商保名称数</div>' +
            '<div class="kc-val">' + Object.keys(nameBx).length + '<small>个</small></div>' +
            '<div class="kc-sub">' + thousands(bxOrders) + ' 单</div></div>' +
            '<div class="kpi-card" style="--ac:#62c98d"><div class="kc-label">名称合计</div>' +
            '<div class="kc-val">' + list.length + '<small>项</small></div>' +
            '<div class="kc-sub">组合值已拆开计数</div></div>';

        // 图表 Top15
        var top = list.slice(0, 15).reverse();
        if (!chart && window.echarts) {
            chart = echarts.init(document.getElementById('nmChart'), null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
            window.addEventListener('resize', function () { if (chart) chart.resize(); });
            $(document).on('boardfs', function () { setTimeout(function () { if (chart) chart.resize(); }, 60); });
        }
        if (chart) {
            chart.setOption({
                grid: { left: 8, right: 46, top: 8, bottom: 4, containLabel: true },
                tooltip: {
                    trigger: 'axis', axisPointer: { type: 'shadow' },
                    backgroundColor: 'rgba(2,24,61,.94)', borderColor: 'rgba(47,137,207,.8)', borderWidth: 1,
                    extraCssText: 'box-shadow:0 0 20px rgba(47,137,207,.4);border-radius:8px;',
                    formatter: function (ps) {
                        var d = ps[0];
                        var it = top[d.dataIndex];
                        return '<b>' + esc(it.name) + '</b><br/>' + it.type + '：' + thousands(it.n) + ' 单';
                    }
                },
                xAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } }, axisLabel: { color: 'rgba(255,255,255,.45)', fontSize: 11 } },
                yAxis: {
                    type: 'category',
                    data: top.map(function (x) { return x.name.length > 12 ? x.name.slice(0, 12) + '…' : x.name; }),
                    axisLabel: { color: '#dff4ff', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }
                },
                series: [{
                    type: 'bar', barWidth: '62%',
                    data: top.map(function (x) {
                        return { value: x.n, itemStyle: { color: x.type === '惠民保' ? '#1677c8' : '#ffb800', borderRadius: [0, 3, 3, 0] } };
                    }),
                    label: { show: true, position: 'right', color: '#9fe8ff', fontSize: 11 }
                }]
            }, true);
        }

        // 全量表
        var h = '<table class="pt pt-ov"><thead><tr><th>#</th><th class="pt-lbl">名称</th><th>类型</th><th>订单数</th><th>占该类比例</th></tr></thead><tbody>';
        if (!list.length) h += '<tr><td colspan="5" style="text-align:center;color:rgba(255,255,255,.45);padding:16px 0;">所选条件无数据</td></tr>';
        list.forEach(function (x, i) {
            h += '<tr><td>' + (i + 1) + '</td>' +
                '<td class="pt-lbl">' + esc(x.name) + '</td>' +
                '<td><span class="nm-tag" style="background:' + (x.type === '惠民保' ? 'rgba(47,137,207,.25)' : 'rgba(255,184,0,.2)') + ';color:' + (x.type === '惠民保' ? '#7fc4ff' : '#ffcf4d') + '">' + x.type + '</span></td>' +
                '<td style="color:#4fe3ff;font-weight:700;">' + thousands(x.n) + '</td>' +
                '<td>' + pctv(x.n, x.base) + '</td></tr>';
        });
        h += '</tbody></table>';
        document.getElementById('nmTbl').innerHTML = h;
        document.getElementById('nmTblSub').textContent = list.length + ' 个名称';
    }

    renderChips();
    render();
});
