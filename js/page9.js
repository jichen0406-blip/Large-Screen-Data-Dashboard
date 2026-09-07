// page9.js — P3 过去30天福可苏订单每日进展跟进：顶部 4 线趋势图 + 每日明细表（医院 + 脱敏患者，表头锁定）
(function () {
    var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
    if (!B || !B.DAILY30) return;

    var COLORS = { o: '#2f89cf', r: '#62c98d', a: '#ffb800', q: '#b18aff' };
    var META = [
        { key: 'orders',     label: '下单',     cls: 'o', icon: '📋' },
        { key: 'reinfusion', label: '回输',     cls: 'r', icon: '💉' },
        { key: 'apheresis',  label: '单采',     cls: 'a', icon: '🧬' },
        { key: 'release',    label: '放行',     cls: 'q', icon: '✅' }
    ];
    function total(list) { return list ? list.length : 0; }

    // 按医院分组（保持首现顺序，院内脱敏患者用、连接）
    function groupByHosp(list) {
        var map = {}, order = [];
        (list || []).forEach(function (it) {
            var h = it.hosp || '未知医院';
            if (!map[h]) { map[h] = []; order.push(h); }
            map[h].push(it.name || '·');
        });
        return order.map(function (h) { return { hosp: h, names: map[h] }; });
    }
    function cellHTML(list) {
        var g = groupByHosp(list);
        if (!g.length) return '<ul class="p9-items"><li class="p9-empty">暂无</li></ul>';
        var s = '<ul class="p9-items">';
        g.forEach(function (h) {
            s += '<li><span class="p9-hn">' + h.hosp + '</span><span class="p9-pn">' + h.names.join('、') + '</span></li>';
        });
        return s + '</ul>';
    }

    // 1. 顶部 4 线趋势图（下单/回输/单采/质量放行 × 过去30天）
    function renderChart() {
        var el = document.getElementById('p9chart');
        if (!el || typeof echarts === 'undefined') return;
        var days = B.DAILY30.map(function (d) { return d.date.slice(5); });
        var chart = echarts.init(el);
        chart.setOption({
            backgroundColor: 'transparent',
            grid: { left: 40, right: 16, top: 34, bottom: 26 },
            tooltip: { trigger: 'axis' },
            legend: { top: 2, itemWidth: 14, itemHeight: 8, textStyle: { color: '#9fe8ff', fontSize: 12 }, data: META.map(function (m) { return m.label; }) },
            xAxis: { type: 'category', data: days, boundaryGap: false, axisLabel: { color: 'rgba(255,255,255,.55)', interval: 2 }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.2)' } }, axisTick: { show: false } },
            yAxis: { type: 'value', minInterval: 1, axisLabel: { color: 'rgba(255,255,255,.55)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
            series: META.map(function (m) {
                return {
                    name: m.label, type: 'line', smooth: true, symbol: 'circle', symbolSize: 4,
                    lineStyle: { width: 2, color: COLORS[m.cls] }, itemStyle: { color: COLORS[m.cls] },
                    data: B.DAILY30.map(function (d) { return total(d[m.key]); })
                };
            })
        });
        window.addEventListener('resize', function () { chart.resize(); });
    }

    // 2. 每日明细表（表头 sticky 锁定，倒序：最新在上）
    function renderTable() {
        var el = document.getElementById('p9list');
        if (!el) return;
        var WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        var html = '<div class="p9-hdr"><div class="p9-hdr-date">日期</div>' +
            META.map(function (m) { return '<div class="p9-hdr-col ' + m.cls + '"><i class="p9-ico">' + m.icon + '</i>' + m.label + '</div>'; }).join('') +
            '</div>';
        for (var i = B.DAILY30.length - 1; i >= 0; i--) {
            var d = B.DAILY30[i];
            var wd = WD[new Date(d.date.replace(/-/g, '/')).getDay()];
            var stats = META.map(function (m) {
                return '<b class="' + m.cls + '">' + m.label + total(d[m.key]) + '</b>';
            }).join('');
            html += '<div class="p9-row">' +
                '<div class="p9-date"><div class="p9-date-num">' + d.date.slice(5) + '</div>' +
                '<div class="p9-date-day">' + wd + '</div>' +
                '<div class="p9-date-stats">' + stats + '</div></div>' +
                META.map(function (m) { return '<div class="p9-col">' + cellHTML(d[m.key]) + '</div>'; }).join('') +
                '</div>';
        }
        el.innerHTML = html;
    }

    $(function () {
        renderChart();
        renderTable();
    });
})();
