// capacity_util.js — 细胞生产区利用率 & 下半月需求占比（两条线共用 0–100% 单一 Y 轴，红线 50%）
// 数据：BOARD_DATA.CAPACITY（生产异常订单.xlsx Sheet1）+ BOARD_DATA.FULL_OPS（下半月占比）
$(function () {
    var B = window.BOARD_DATA;
    var CAP = (B && B.CAPACITY) || { rows: [] };
    var OPS = (B && B.FULL_OPS) || [];
    var R = window.RZ;
    if (!R || !window.echarts || !CAP.rows.length) return;

    var lowBy = {}, lowMap = {};
    OPS.forEach(function (r) {
        if (!r.req) return;
        var k = r.req.slice(0, 7);
        var o = lowBy[k] || (lowBy[k] = { a: 0, l: 0 });
        o.a++; if (+r.req.slice(8, 10) >= 16) o.l++;
    });
    Object.keys(lowBy).forEach(function (k) { lowMap[k] = lowBy[k].l / lowBy[k].a * 100; });

    R.initRange('cp', CAP.months.slice(), B.DP);

    var chart = echarts.init(document.getElementById('cpChart'), null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
    var chart2 = echarts.init(document.getElementById('cpChart2'), null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
    var last = null;
    function resize() {
        try { chart.resize(); } catch (e) { }
        try { chart2.resize(); } catch (e) { }
        if (last) { try { renderBars(last.rows, last.ms); } catch (e) { } }   // 标注框按像素定位，宽度变了要重算
    }
    window.addEventListener('resize', resize);
    $(document).on('boardfs', function () { setTimeout(resize, 80); });
    $(document).on('boardlogin', function () { setTimeout(resize, 80); });

    function render() {
        var rg = R.readRange('cp');
        var rows = CAP.rows.filter(function (r) { return r.ym >= rg.a && r.ym <= rg.b; });
        var ms = rows.map(function (r) { return r.ym; });
        var rate = rows.map(function (r) { return r.rate; });
        var low = ms.map(function (m) { return lowMap[m] == null ? null : +lowMap[m].toFixed(1); });

        chart.resize();
        chart.setOption({
            animation: false,
            grid: { left: 58, right: 62, top: 52, bottom: 44 },
            tooltip: $.extend(R.barTooltip(), {
                trigger: 'axis',
                textStyle: { color: '#dff4ff', fontSize: 13 },
                formatter: function (ps) {
                    var i = ps[0].dataIndex, r = rows[i];
                    return '<b style="font-size:14px">' + ms[i] + '</b><br/>' +
                        '细胞生产区利用率：<b>' + r.rate + '%</b>（' + r.used + ' / ' + r.total + ' 天）<br/>' +
                        '下半月需求占比：<b>' + (low[i] == null ? '—' : low[i] + '%') + '</b>';
                }
            }),
            legend: {
                top: 6, left: 'center', itemWidth: 16, itemHeight: 9,           // 图例居中
                textStyle: { color: 'rgba(223,244,255,.85)', fontSize: 13 },
                data: ['细胞生产区利用率', '下半月需求占比']
            },
            xAxis: {
                type: 'category', data: ms,
                axisLine: { lineStyle: { color: 'rgba(112,187,252,.45)' } },
                axisLabel: { color: 'rgba(223,244,255,.8)', fontSize: 11, rotate: 0, interval: 'auto', formatter: function (v) { return v.slice(2); } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value', min: 0, max: 100, interval: 20,
                name: '%',
                nameTextStyle: { color: 'rgba(223,244,255,.7)', fontSize: 13 },
                axisLine: { show: false },
                axisLabel: { color: 'rgba(223,244,255,.8)', fontSize: 12, formatter: '{value}%' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } }
            },
            series: [
                {
                    name: '细胞生产区利用率', type: 'line',
                    data: rate, symbol: 'circle', symbolSize: 9, smooth: false,
                    lineStyle: { color: '#4fe3ff', width: 2.4 }, itemStyle: { color: '#ffffff', borderColor: '#4fe3ff', borderWidth: 2 },
                    label: { show: false }
                },
                {
                    name: '下半月需求占比', type: 'line',
                    data: low, symbol: 'circle', symbolSize: 9, connectNulls: true,
                    lineStyle: { color: '#37d67a', width: 2.4 }, itemStyle: { color: '#ffffff', borderColor: '#37d67a', borderWidth: 2 },
                    markLine: {
                        silent: true, symbol: 'none',
                        lineStyle: { color: '#ff4d4f', type: 'dashed', width: 1.4 },
                        label: { formatter: '50%', color: '#ff8a80', fontSize: 12, position: 'end' },
                        data: [{ yAxis: 50 }]
                    }
                }
            ]
        }, true);

        renderBars(rows, ms);
        renderKpi(rows, low);
        var note = document.getElementById('cpNote');
        if (note && rows.length) {
            var avg = R.mean(rate);
            var avgLow = R.mean(low.filter(function (x) { return x != null; }));
            note.textContent = '区间 ' + rg.a + ' ~ ' + rg.b + '　|　平均利用率 ' + avg.toFixed(1) + '%　|　平均下半月占比 ' + avgLow.toFixed(1) + '%';
        }
    }

    ['cpY1', 'cpM1', 'cpY2', 'cpM2'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', render);
    });
    // ── 下图：产能实际使用情况（柱=月合计天数/月实际使用天数，左轴天；绿线=利用率，右轴 %）──
    // 图上要圈出的特殊月份在此维护：a=起始月, b=结束月, t=标注文案
    var NOTES = [
        { a: '2025-07', b: '2025-09', t: '人员培训，产能爬坡中' },
        { a: '2026-02', b: '2026-02', t: '工厂维保' }
    ];
    function renderBars(rows, ms) {
        var totals = rows.map(function (r) { return r.total; });
        var used = rows.map(function (r) { return r.used; });
        var rates = rows.map(function (r) { return r.rate; });
        var maxT = Math.max.apply(null, totals.concat([0]));
        var yMax = Math.max(100, Math.ceil(maxT * 1.45 / 100) * 100);   // 留足上方空间，避免柱顶数字与利用率折线标签打架
        var dense = ms.length > 24;              // 月份太多时不再逐个标数字，避免糊成一片

        var areas = [];
        NOTES.forEach(function (n) {
            var i = ms.indexOf(n.a), j = ms.indexOf(n.b);
            if (i < 0 && j < 0) return;          // 整段不在所选区间
            if (i < 0) i = 0;                    // 起点早于区间 → 裁到左边界
            if (j < 0) j = ms.length - 1;
            if (i > j) return;
            areas.push({ i: i, j: j, t: n.t });
        });

        // 标注框（含单月）用 graphic 画：markArea 在「起止同月」时宽度为 0，画不出来
        var GR = { l: 58, r: 62, t: 44, b: 44 };
        var W = chart2.getWidth(), H = chart2.getHeight();
        var band = ms.length ? (W - GR.l - GR.r) / ms.length : 0;
        var els = [];
        areas.forEach(function (a, k) {
            var x1 = GR.l + a.i * band, x2 = GR.l + (a.j + 1) * band;
            els.push({
                type: 'rect', id: 'cpNote' + k, silent: true,
                left: x1, top: GR.t, width: Math.max(x2 - x1, 2), height: H - GR.t - GR.b,
                style: { fill: 'rgba(255,77,79,.05)', stroke: '#ff4d4f', lineWidth: 1.2, lineDash: [4, 3] }
            });
            els.push({
                type: 'text', id: 'cpNoteT' + k, silent: true,
                left: x1 + 4, top: GR.t + 4,
                style: { text: a.t, fill: '#ff8a80', font: '12px sans-serif' }
            });
        });

        last = { rows: rows, ms: ms };
        chart2.resize();
        chart2.setOption({
            animation: false,
            grid: { left: GR.l, right: GR.r, top: GR.t, bottom: GR.b },
            tooltip: $.extend(R.barTooltip(), {
                trigger: 'axis',
                textStyle: { color: '#dff4ff', fontSize: 13 },
                formatter: function (ps) {
                    var i = ps[0].dataIndex, r = rows[i];
                    return '<b style="font-size:14px">' + ms[i] + '</b><br/>' +
                        '月合计天数：<b>' + r.total + '</b> 天<br/>' +
                        '月实际使用：<b>' + r.used + '</b> 天<br/>' +
                        '利用率：<b>' + r.rate + '%</b>';
                }
            }),
            legend: {
                top: 6, left: 'center', itemWidth: 16, itemHeight: 9,
                textStyle: { color: 'rgba(223,244,255,.85)', fontSize: 13 },
                data: ['月合计天数', '月实际使用天数', '利用率']
            },
            graphic: { elements: els },
            xAxis: {
                type: 'category', data: ms,
                axisLine: { lineStyle: { color: 'rgba(112,187,252,.45)' } },
                axisLabel: { color: 'rgba(223,244,255,.8)', fontSize: 11, rotate: 0, interval: 'auto', formatter: function (v) { return v.slice(2); } },
                axisTick: { show: false }
            },
            yAxis: [
                {
                    type: 'value', min: 0, max: yMax, interval: yMax > 500 ? 100 : 50,
                    name: '天', nameTextStyle: { color: 'rgba(223,244,255,.7)', fontSize: 12 },
                    axisLine: { show: false },
                    axisLabel: { color: 'rgba(223,244,255,.8)', fontSize: 12 },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } }
                },
                {
                    type: 'value', min: 0, max: 100, interval: 20,
                    name: '%', nameTextStyle: { color: 'rgba(223,244,255,.7)', fontSize: 12 },
                    axisLine: { show: false },
                    axisLabel: { color: '#7ff0a8', fontSize: 12, formatter: '{value}%' },
                    splitLine: { show: false }
                }
            ],
            series: [
                {
                    name: '月合计天数', type: 'bar', barWidth: '38%', barGap: '-100%', data: totals, z: 10,
                    itemStyle: { color: 'transparent', borderColor: '#7cc0ff', borderWidth: 1.4, borderType: 'dashed' },
                    label: { show: !dense, position: 'top', color: 'rgba(159,232,255,.85)', fontSize: 10 }
                },
                {
                    name: '月实际使用天数', type: 'bar', barWidth: '38%', data: used,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(79,227,255,.85)' },
                            { offset: 1, color: 'rgba(47,137,207,.30)' }
                        ])
                    },
                    label: { show: !dense, position: 'inside', color: '#ffffff', fontSize: 11, fontWeight: 700 }
                },
                {
                    name: '利用率', type: 'line', yAxisIndex: 1, data: rates,
                    symbol: 'circle', symbolSize: 9,
                    lineStyle: { color: '#37d67a', width: 2.2 }, itemStyle: { color: '#ffffff', borderColor: '#37d67a', borderWidth: 2 },
                    label: { show: false }        // 逐点标注会和柱顶数字打架，百分比看右轴刻度 + 悬浮提示
                }
            ]
        }, true);
    }

    // 顶部洞察指标卡：跟随当前时间区间实时计算
    function renderKpi(rows, low) {
        var box = document.getElementById('cpKpi');
        if (!box) return;
        if (!rows.length) { box.innerHTML = ''; return; }
        var rate = rows.map(function (r) { return r.rate; });
        var avgRate = R.mean(rate);
        var shares = low.filter(function (x) { return x != null; });
        var over50 = shares.filter(function (x) { return x > 50; }).length;
        var peak = null;
        rows.forEach(function (r, i) {
            if (!peak || r.rate > peak.rate) peak = { ym: r.ym, rate: r.rate, share: low[i] };
        });
        var cards = [
            { l: '平均产能利用率', v: avgRate.toFixed(1), u: '%', s: '所选区间 ' + rows.length + ' 个月', ac: '#4fe3ff' },
            { l: '下半月占比 > 50% 的月份', v: over50, u: ' / ' + shares.length, s: '需求持续偏下半月', ac: '#37d67a' },
            { l: '产能最紧的月份', v: (peak ? peak.ym.slice(2) : '—'), u: '', s: (peak ? '利用率 ' + peak.rate + '% · 该月下半月 ' + (peak.share == null ? '—' : peak.share.toFixed(0) + '%') : ''), ac: '#ffcf4d' }
        ];
        box.innerHTML = cards.map(function (c) {
            return '<div class="kpi-card" style="--ac:' + c.ac + '">' +
                '<div class="kc-label">' + c.l + '</div>' +
                '<div class="kc-val" style="color:' + c.ac + '">' + c.v + '<small>' + c.u + '</small></div>' +
                '<div class="kc-sub">' + c.s + '</div></div>';
        }).join('');
    }

    render();
    setTimeout(resize, 400);

    var ai = document.getElementById('cpAI');
    if (ai) {
        var s = CAP.ai || '';
        ai.innerHTML = s
            ? '<div class="ib-hd"><span class="ib-tag">AI 总结</span><span class="ib-time">全量口径 · 数据截止 ' + (CAP.aiAt || '') + '</span><button class="ib-toggle" type="button">展开</button></div><div class="ib-txt">' + R.esc(s) + '</div>'
            : '<div class="ib-hd"><span class="ib-tag">AI 总结</span></div><div class="ib-txt ib-empty">暂无总结（构建时未生成）</div>';
    }
});
