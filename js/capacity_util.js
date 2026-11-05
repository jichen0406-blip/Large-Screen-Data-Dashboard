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
    function resize() { try { chart.resize(); } catch (e) { } }
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
                    data: rate, symbol: 'circle', symbolSize: 7, smooth: false,
                    lineStyle: { color: '#4fe3ff', width: 2.4 }, itemStyle: { color: '#4fe3ff' },
                    label: { show: false }
                },
                {
                    name: '下半月需求占比', type: 'line',
                    data: low, symbol: 'circle', symbolSize: 7, connectNulls: true,
                    lineStyle: { color: '#37d67a', width: 2.4 }, itemStyle: { color: '#37d67a' },
                    markLine: {
                        silent: true, symbol: 'none',
                        lineStyle: { color: '#ff4d4f', type: 'dashed', width: 1.4 },
                        label: { formatter: '50%', color: '#ff8a80', fontSize: 12, position: 'end' },
                        data: [{ yAxis: 50 }]
                    }
                }
            ]
        }, true);

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
