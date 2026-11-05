// demand_cap.js — 生产需求箱线图 / 实际生产箱线图（按月，纵轴=该事件落在当月第几天）
// 数据：BOARD_DATA.FULL_OPS；红线 y=15（月中分界）
$(function () {
    var B = window.BOARD_DATA;
    var OPS = (B && B.FULL_OPS) || [];
    var R = window.RZ;
    if (!OPS.length || !R || !window.echarts) return;

    var monSet = {};
    OPS.forEach(function (r) {
        if (r.req) monSet[r.req.slice(0, 7)] = 1;
        if (r.d1) monSet[r.d1.slice(0, 7)] = 1;
    });
    var months = Object.keys(monSet).sort();
    R.initRange('dc', months, B.DP);

    var charts = {};
    function getChart(id) {
        if (!charts[id]) {
            var dom = document.getElementById(id);
            charts[id] = echarts.init(dom, null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
        }
        return charts[id];
    }
    function resizeAll() {
        Object.keys(charts).forEach(function (k) { try { charts[k].resize(); } catch (e) { } });
    }
    window.addEventListener('resize', resizeAll);
    $(document).on('boardfs', function () { setTimeout(resizeAll, 80); });
    $(document).on('boardlogin', function () { setTimeout(resizeAll, 80); });

    var COLORS = {
        req: { fill: 'rgba(47,137,207,.34)', line: '#4fe3ff' },
        d1: { fill: 'rgba(55,214,122,.26)', line: '#37d67a' }
    };

    function draw(id, ms, byMonth, label, col) {
        var boxData = [], outData = [], stat = [];
        ms.forEach(function (m, i) {
            var s = R.boxStats(byMonth[m] || []);
            if (!s) { boxData.push('-'); stat.push(null); return; }
            boxData.push(s.data);
            stat.push(s);
            s.out.forEach(function (v) { outData.push([i, v]); });
        });

        var ch = getChart(id);
        ch.resize();                     // 先按容器实际尺寸重算，避免画布溢出边框
        ch.setOption({
            animation: false,
            grid: { left: 58, right: 62, top: 34, bottom: 44 },
            tooltip: $.extend(R.barTooltip(), {
                trigger: 'item',
                textStyle: { color: '#dff4ff', fontSize: 13 },
                formatter: function (p) {
                    if (p.seriesType === 'scatter') return label + '：' + p.value[1] + ' 号（离群值）';
                    var s = stat[p.dataIndex];
                    if (!s) return ms[p.dataIndex] + '：无数据';
                    return '<b style="font-size:14px">' + ms[p.dataIndex] + '</b>　共 ' + s.n + ' 单<br/>' +
                        '最小 ' + s.min.toFixed(0) + ' · Q1 ' + s.q1.toFixed(1) + ' · 中位 ' + s.q2.toFixed(1) +
                        ' · Q3 ' + s.q3.toFixed(1) + ' · 最大 ' + s.whi.toFixed(0) + '　（日）';
                }
            }),
            xAxis: {
                type: 'category', data: ms,
                axisLine: { lineStyle: { color: 'rgba(112,187,252,.45)' } },
                axisLabel: { color: 'rgba(223,244,255,.8)', fontSize: 11, rotate: 0, interval: 'auto', formatter: function (v) { return v.slice(2); } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value', min: 1, max: 31, interval: 5,
                name: '天数',
                nameTextStyle: { color: 'rgba(223,244,255,.7)', fontSize: 13, padding: [0, 0, 6, 0] },
                axisLine: { show: false },
                axisLabel: { color: 'rgba(223,244,255,.8)', fontSize: 12 },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } }
            },
            series: [
                {
                    name: label,
                    type: 'boxplot',
                    data: boxData,
                    itemStyle: { color: col.fill, borderColor: col.line, borderWidth: 1.2 },
                    markLine: {
                        silent: true, symbol: 'none',
                        lineStyle: { color: '#ff4d4f', type: 'dashed', width: 1.4 },
                        label: { formatter: '15 天', color: '#ff8a80', fontSize: 12, position: 'end' },
                        data: [{ yAxis: 15 }]
                    }
                },
                { name: '离群值', type: 'scatter', data: outData, symbolSize: 6, itemStyle: { color: '#ffb800' } }
            ]
        }, true);
    }

    function render() {
        var rg = R.readRange('dc');
        var ms = R.monthsBetween(rg);
        var reqV = {}, d1V = {}, lowReq = 0, totReq = 0;
        var reqDays = [], d1Days = [], both = 0, mismatch = 0;
        OPS.forEach(function (r) {
            if (r.req) {
                var k = r.req.slice(0, 7);
                if (k >= rg.a && k <= rg.b) {
                    (reqV[k] = reqV[k] || []).push(+r.req.slice(8, 10));
                    var dd = +r.req.slice(8, 10);
                    totReq++; reqDays.push(dd); if (dd >= 16) lowReq++;
                    if (r.d1) { both++; if (r.d1.slice(0, 7) !== r.req.slice(0, 7)) mismatch++; }
                }
            }
            if (r.d1) {
                var k2 = r.d1.slice(0, 7);
                if (k2 >= rg.a && k2 <= rg.b) { d1V[k2] = d1V[k2] || []; d1V[k2].push(+r.d1.slice(8, 10)); d1Days.push(+r.d1.slice(8, 10)); }
            }
        });
        function pctl(a, p) { if (!a.length) return 0; var v = a.slice().sort(function (x, y) { return x - y; });
            var k = (v.length - 1) * p, lo = Math.floor(k), hi = Math.min(lo + 1, v.length - 1);
            return v[lo] + (v[hi] - v[lo]) * (k - lo); }
        var reqMed = pctl(reqDays, .5), d1Med = pctl(d1Days, .5);
        renderKpi({
            reqMed: reqMed, reqQ3: pctl(reqDays, .75), lowShare: totReq ? lowReq / totReq * 100 : 0,
            d1Med: d1Med, leadDays: reqMed - d1Med,
            mismatchShare: both ? mismatch / both * 100 : 0, nReq: totReq
        });
        draw('dcChart1', ms, reqV, '生产需求', COLORS.req);
        draw('dcChart2', ms, d1V, '实际生产', COLORS.d1);
        var note = document.getElementById('dcNote');
        if (note) note.textContent = '区间 ' + rg.a + ' ~ ' + rg.b + '　|　要求生产时间 ' + totReq + ' 单，其中下半月 ' +
            (totReq ? (lowReq / totReq * 100).toFixed(1) : 0) + '%';
    }

    ['dcY1', 'dcM1', 'dcY2', 'dcM2'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', render);
    });

    // 顶部洞察指标卡：跟随当前时间区间实时计算
    function renderKpi(m) {
        var box = document.getElementById('dcKpi');
        if (!box || !m) return;
        var cards = [
            { l: '需求中位数', v: m.reqMed.toFixed(1), u: ' 号', s: 'Q3 第 ' + m.reqQ3.toFixed(1) + ' 号', ac: '#4fe3ff' },
            { l: '下半月需求占比', v: m.lowShare.toFixed(1), u: '%', s: '16–31 号下单占比', ac: '#ffcf4d' },
            { l: '实际生产中位数', v: m.d1Med.toFixed(1), u: ' 号', s: '比要求仅提前 ' + m.leadDays.toFixed(1) + ' 天', ac: '#37d67a' },
            { l: '跨月积压占比', v: m.mismatchShare.toFixed(1), u: '%', s: '实际生产月 ≠ 要求生产月', ac: '#ff8a80' },
            { l: '样本', v: m.nReq, u: ' 单', s: '所选区间全流程订单', ac: '#9fe8ff' }
        ];
        box.innerHTML = cards.map(function (c) {
            return '<div class="kpi-card" style="--ac:' + c.ac + '">' +
                '<div class="kc-label">' + c.l + '</div>' +
                '<div class="kc-val" style="color:' + c.ac + '">' + c.v + '<small>' + c.u + '</small></div>' +
                '<div class="kc-sub">' + c.s + '</div></div>';
        }).join('');
    }

    render();
    setTimeout(resizeAll, 400);

    var ai = document.getElementById('dcAI');
    if (ai) {
        var s = (B.DEMAND_CAP && B.DEMAND_CAP.ai) || '';
        ai.innerHTML = s
            ? '<div class="ib-hd"><span class="ib-tag">AI 总结</span><span class="ib-time">全量口径 · 数据截止 ' + ((B.DEMAND_CAP && B.DEMAND_CAP.at) || '') + '</span><button class="ib-toggle" type="button">展开</button></div><div class="ib-txt">' + R.esc(s) + '</div>'
            : '<div class="ib-hd"><span class="ib-tag">AI 总结</span></div><div class="ib-txt ib-empty">暂无总结（构建时未生成）</div>';
    }
});

$(document).on('click', '.ib-toggle', function () {
    var bar = $(this).closest('.insight-bar');
    bar.toggleClass('expanded');
    $(this).text(bar.hasClass('expanded') ? '收起' : '展开');
});
