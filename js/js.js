// 数字滚动动画（全局函数，map.js / js.js 共用；easeOutCubic 减速效果）
function countUp(el, target, dur) {
    if (!el) return;
    target = parseInt(target, 10);
    if (isNaN(target)) { el.innerHTML = '--'; return; }
    dur = dur || 1200;
    var start = null;
    function step(ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.innerHTML = Math.round(target * eased);
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// 表格无缝滚动（复制 tbody 行实现循环，setInterval 平滑滚动，悬停暂停）
function setupTblScroll(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    var tbody = el.querySelector('tbody');
    if (!tbody) return;
    if (el.scrollHeight <= el.clientHeight) return;
    var oneCopyH = tbody.offsetHeight;
    tbody.innerHTML += tbody.innerHTML;
    var timer = null;
    function tick() { el.scrollTop += 1; if (el.scrollTop >= oneCopyH) el.scrollTop -= oneCopyH; }
    function start() { if (!timer) timer = setInterval(tick, 80); }
    function stop() { clearInterval(timer); timer = null; }
    start();
    $(el).on('mouseenter', stop).on('mouseleave', start);
}
// 过去7天列表无缝滚动（复制 .tl-body，表头 sticky 固定）
function setupSevScroll() {
    var el = document.getElementById('last7List');
    if (!el) return;
    var body = $(el).find('.tl-body');
    if (!body.length) return;
    if (el.scrollHeight <= el.clientHeight) return;
    var oneCopyH = body.outerHeight();
    body.append(body.clone(true));
    var timer = null;
    function tick() { el.scrollTop += 1; if (el.scrollTop >= oneCopyH) el.scrollTop -= oneCopyH; }
    function start() { if (!timer) timer = setInterval(tick, 80); }
    function stop() { clearInterval(timer); timer = null; }
    start();
    $(el).on('mouseenter', stop).on('mouseleave', start);
}

$(function () {
    monthlyTrend();
    echarts_31();
    board_ext();

// ── 下单 / 回输 月度趋势：双折线（当年 vs 去年）+ 逐月同比（格式同 Top10 同比） ──
function monthlyTrend() {
    var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
    if (!B || !B.MONTH) return;
    var months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    var curLabel = B.Y + '年';
    var lyLabel = (parseInt(B.Y, 10) - 1) + '年';
    function yoyLabel(cur, ly) {
        if (ly <= 0) return { color: 'rgba(255,255,255,.4)', text: '--' };
        var y = (cur - ly) / ly * 100;
        if (y >= 0) return { color: '#14e144', text: '↑' + y.toFixed(0) + '%' };
        return { color: '#ff6316', text: '↓' + Math.abs(y).toFixed(0) + '%' };
    }
    function build(domId, cur, ly) {
        var el = document.getElementById(domId);
        if (!el) return;
        var curData = cur.map(function(v, i) {
            var yl = yoyLabel(v, ly[i]);
            return {
                value: v,
                label: { show: v > 0, position: 'top', fontSize: 9, color: yl.color, formatter: yl.text }
            };
        });
        var myChart = echarts.init(el);
        var option = {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' }
            },
            legend: {
                data: [curLabel, lyLabel],
                top: '2%',
                textStyle: { color: 'rgba(255,255,255,.5)', fontSize: '11' },
                itemWidth: 12,
                itemHeight: 12,
                itemGap: 30
            },
            grid: { left: '0%', top: '18%', right: '0%', bottom: '0%', containLabel: true },
            xAxis: [{
                type: 'category',
                data: months,
                axisLine: { lineStyle: { color: 'rgba(255,255,255,.1)', width: 1, type: 'solid' } },
                axisTick: { show: false },
                axisLabel: { interval: 0, show: true, textStyle: { color: 'rgba(255,255,255,.6)', fontSize: '9' } }
            }],
            yAxis: [{
                type: 'value',
                axisLabel: { show: true, textStyle: { color: 'rgba(255,255,255,.6)', fontSize: '10' } },
                axisTick: { show: false },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,.1)', width: 1, type: 'solid' } },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,.1)' } }
            }],
            series: [{
                name: curLabel,
                type: 'line',
                smooth: true,
                data: curData,
                symbolSize: 5,
                itemStyle: { normal: { color: '#2f89cf' } },
                lineStyle: { color: '#2f89cf', width: 2 }
            }, {
                name: lyLabel,
                type: 'line',
                smooth: true,
                data: ly,
                symbolSize: 4,
                itemStyle: { normal: { color: '#c0c0c0' } },
                lineStyle: { color: '#c0c0c0', width: 2 }
            }]
        };
        myChart.setOption(option);
        window.addEventListener("resize", function () { myChart.resize(); });
    }
    build('echart6', B.MONTH.O, B.MONTH.OLY);
    build('echart4', B.MONTH.R, B.MONTH.RLY);
}

// ── 标题8/9：YTD异常订单柱状图 + COE医院销量占比饼图 ──
function echarts_31() {
    var myChart3 = echarts.init(document.getElementById('fb03'));
    var myChart4 = echarts.init(document.getElementById('fb04'));
    var myChart5 = echarts.init(document.getElementById('myd1'));

    var B31 = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
    var coeOd = (B31 && B31.COE && B31.COE.O) ? B31.COE.O : {};
    var coeRd = (B31 && B31.COE && B31.COE.R) ? B31.COE.R : {};
    var ABN = (B31 && B31.ABN) ? B31.ABN : { pbmc: 0, first: 0, second: 0 };
    var COE_COLORS = { SCOE: '#62c98d', COE: '#2f89cf', RCOE: '#4cb9cf', Others: '#e0c828' };
    function coePie(cats, title) {
        var order = ['SCOE', 'COE', 'RCOE', 'Others'];
        var data = order.map(function(k) { return { value: cats[k] || 0, name: k }; });
        var colors = order.map(function(k) { return COE_COLORS[k]; });
        return {
            title: {
                text: title,
                left: 'center',
                top: 'center',
                textStyle: { color: '#fff', fontSize: 14, fontWeight: 'bold' }
            },
            tooltip: { trigger: 'item', formatter: '{b}: {c} 单 ({d}%)' },
            legend: {
                bottom: 0,
                itemWidth: 10, itemHeight: 10,
                textStyle: { color: 'rgba(255,255,255,.5)', fontSize: '10' },
                data: order
            },
            series: [{
                name: title,
                type: 'pie',
                center: ['50%', '50%'],
                radius: ['42%', '58%'],
                color: colors,
                label: { show: true, position: 'inside', color: '#fff', fontSize: 10, formatter: function(p) { return Math.round(p.percent) + '%'; } },
                labelLine: { show: false },
                data: data
            }]
        };
    }
    var option3 = coePie(coeOd, '下单');
    var option4 = coePie(coeRd, '回输');
    var option5 = {
        grid: { left: '0', right: '0', top: '8%', bottom: '24%' },
        legend: {
            data: ['PBMC失败', '第一次失败', '二次失败'],
            bottom: 5, itemWidth: 10, itemHeight: 10,
            textStyle: { color: '#fff', fontSize: '10' }, itemGap: 5
        },
        tooltip: { show: true, trigger: 'item' },
        yAxis: { type: 'value', show: false },
        xAxis: [{
            type: 'category', axisTick: { show: false }, axisLine: { show: false }, axisLabel: { show: false },
            data: ['异常订单']
        }],
        series: [
            { name: 'PBMC失败', type: 'bar', barWidth: '12%', itemStyle: { normal: { color: '#ffc53d', barBorderRadius: 50 } }, zlevel: 2, barGap: '200%', data: [ABN.pbmc], label: { formatter: '{c}单', show: true, position: 'top', textStyle: { fontSize: 11, color: '#fff' } } },
            { name: '第一次失败', type: 'bar', itemStyle: { normal: { color: '#fa8c16', barBorderRadius: 50 } }, zlevel: 2, barWidth: '12%', data: [ABN.first], label: { formatter: '{c}单', show: true, position: 'top', textStyle: { fontSize: 11, color: '#fff' } } },
            { name: '二次失败', type: 'bar', itemStyle: { normal: { color: '#f5222d', barBorderRadius: 50 } }, zlevel: 2, barWidth: '12%', data: [ABN.second], label: { formatter: '{c}单', show: true, position: 'top', textStyle: { fontSize: 11, color: '#fff' } } }
        ]
    };
    myChart3.setOption(option3);
    myChart4.setOption(option4);
    myChart5.setOption(option5);

    window.addEventListener("resize", function () {
        myChart3.resize();
        myChart4.resize();
        myChart5.resize();
    });
}

// ── 页面扩展：MTD/异常订单数字、数据更新时间、天气、Top10表格、过去7天 ──
function board_ext() {
    var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;

    // MTD 指标（地图右侧卡片，数字滚动动画）
    if (B && typeof countUp === 'function') {
        countUp(document.getElementById('mtdo'), B.MTD.O);
        countUp(document.getElementById('mtdr'), B.MTD.R);
        countUp(document.getElementById('mtda'), B.MTD.A);
        countUp(document.getElementById('mtdq'), B.MTD.Q);
    }

    // 标题8：YTD 异常订单总数
    if (B && B.ABN) {
        var abnEl = document.getElementById('abnNum');
        if (abnEl) abnEl.innerHTML = B.ABN.total;
    }

    // 数据更新时间（表头左侧，来自 bs_order 文件时间）
    var upEl = document.getElementById('dataUpd');
    if (upEl) upEl.innerHTML = '数据更新时间 ' + (B && B.UPDATED ? B.UPDATED : '--');

    // 当天上海天气与温度（Open-Meteo 免费接口，无需 key，支持跨域）
    var wEl = document.getElementById('weather');
    if (wEl) {
        // 雨强度区分：☔ 毛毛雨/小雨，☔☔ 中雨/阵雨，☔☔☔ 大雨/强阵雨
        var WSYM = {0:'☀',1:'☀',2:'⛅',3:'☁',45:'☁',48:'☁',51:'☔',53:'☔',55:'☔',56:'☔',57:'☔',61:'☔',63:'☔☔',65:'☔☔☔',66:'☔☔',67:'☔☔',71:'❄',73:'❄',75:'❄',77:'❄',80:'☔',81:'☔☔',82:'☔☔☔',85:'❄',86:'❄',95:'⛈',96:'⛈',99:'⛈'};
        fetch('https://api.open-meteo.com/v1/forecast?latitude=31.23&longitude=121.47&current=temperature_2m,weather_code&timezone=Asia%2FShanghai')
            .then(function(r) { return r.json(); })
            .then(function(d) {
                var t = Math.round(d.current.temperature_2m);
                var w = WSYM[d.current.weather_code] || '--';
                wEl.innerHTML = '上海 ' + w + ' ' + t + '℃';
            })
            .catch(function() { wEl.innerHTML = '上海 --'; });
    }

    // Top10 表格渲染（排序 / 医院名称 / 数据 / 同比）
    function renderTop(tbodyId, list) {
        if (!B || !list || !list.length) return;
        var html = '';
        list.forEach(function(h, i) {
            var yo;
            if (h.yoy == null) yo = '<td class="yo-na">--</td>';
            else if (h.yoy >= 0) yo = '<td class="yo-up">↑' + h.yoy.toFixed(1) + '%</td>';
            else yo = '<td class="yo-dn">↓' + Math.abs(h.yoy).toFixed(1) + '%</td>';
            html += '<tr><td class="rk">' + (i + 1) + '</td><td class="hn" title="' + h.name + '">' + h.name + '</td><td>' + h.v + '</td>' + yo + '</tr>';
        });
        document.getElementById(tbodyId).innerHTML = html;
    }
    renderTop('tbl1', B ? B.TOP_O : null);
    renderTop('tbl3', B ? B.TOP_R : null);

    // 当月每天 下单 & 回输（时间轴，参考 fucaso-dashboard 展现方式）
    var l7Dom = document.getElementById('last7List');
    if (l7Dom && B && B.LAST7) {
        var WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        function tlItems(list, cls) {
            if (!list.length) return '<ul class="tl-items"><li class="tl-empty">暂无数据</li></ul>';
            var s = '<ul class="tl-items">';
            list.forEach(function(h) {
                s += '<li><span class="tl-hn">● ' + h.name + '</span><span class="tl-hc ' + cls + '">' + h.v + '单</span></li>';
            });
            return s + '</ul>';
        }
        var html = '<div class="tl-header-row">' +
            '<div class="tl-hdr-spacer"></div>' +
            '<div class="tl-hdr-col o-hdr">下单</div>' +
            '<div class="tl-hdr-col r-hdr">回输</div>' +
            '</div><div class="tl-body">';
        for (var i = B.LAST7.length - 1; i >= 0; i--) {
            var day = B.LAST7[i];
            var dObj = new Date(day.date.replace(/-/g, '/'));
            var wd = WD[dObj.getDay()];
            var oTot = day.orders.reduce(function(s, h) { return s + h.v; }, 0);
            var rTot = day.reinfusion.reduce(function(s, h) { return s + h.v; }, 0);
            html += '<div class="tl-row">' +
                '<div class="tl-date-col">' +
                '<div class="tl-date-num">' + day.date.slice(5) + '</div>' +
                '<div class="tl-date-day">' + wd + '</div>' +
                '<div class="tl-date-stats"><span class="ts-o">下单 ' + oTot + '</span><span class="ts-r">回输 ' + rTot + '</span></div>' +
                '</div>' +
                '<div class="tl-list-col">' +
                '<div class="tl-section">' + tlItems(day.orders, 'o') + '</div>' +
                '<div class="tl-section">' + tlItems(day.reinfusion, 'r') + '</div>' +
                '</div>' +
                '</div>';
        }
        html += '</div>';
        l7Dom.innerHTML = html;
    }

    // 表格/列表缓慢无缝滚动（鼠标悬停暂停）
    setupTblScroll('tbl1body');
    setupTblScroll('tbl3body');
    setupSevScroll();
}
})
