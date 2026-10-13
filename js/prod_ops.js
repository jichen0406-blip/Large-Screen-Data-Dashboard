// prod_ops.js — 订单生产运营管理（3 页共用）：生产等待期 / 产品生产周期 / 回输等待期
// 每页用 window.PROD_OPS_CFG 传参（metric / timeField / 文案），结构同一套：
//   块1 筛选（起止年月 + 医院类型 + 下单AM + 坐标）｜ 块2 表格（不受筛选）｜ 块3 散点 ｜ 块4 柱状
// 数据：window.BOARD_DATA.PROD_OPS（build_data.js 8t 节：逐单原始日期 + 三段天数 w/c/rw）
(function () {
    var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
    if (!B || !B.PROD_OPS) return;
    var CFG = window.PROD_OPS_CFG || {};
    var F = CFG.metric, TF = CFG.timeField;
    if (!F || !TF) return;

    var LOG_MIN = 0.5;
    var C_FILL = 'rgba(155,143,214,.18)';  // 散点圆圈内部：浅紫透明（同色系）
    var C_LINE = '#9b8fd6';                // 散点圆圈边线：深紫
    var C_BAR = '#f0a35e';                 // 柱状：琥珀橙
    var C_AVG = 'rgba(255,255,255,.7)';    // 平均参考线：中性白（避免蓝色系）
    var AXIS = 'rgba(112,187,252,.5)';

    // 该页只统计「该段时长可算」的单（其余不参与，分母随之变小）
    var ROWS = (B.PROD_OPS.rows || []).filter(function (r) { return r[F] !== null && r[F] !== undefined; });

    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

    // ── 时间范围：数据源 = CFG.timeField 所在月；年份从数据推出（到 2027 自动多一列/一项） ──
    var TMS = ROWS.map(function (r) { return String(r[TF] || '').slice(0, 7); }).filter(Boolean).sort();
    var YEARS = [];
    if (TMS.length) {
        for (var yy = parseInt(TMS[0].slice(0, 4), 10); yy <= parseInt(TMS[TMS.length - 1].slice(0, 4), 10); yy++) YEARS.push(String(yy));
    }
    var sY = TMS.length ? TMS[0].slice(0, 4) : '', sM = TMS.length ? parseInt(TMS[0].slice(5, 7), 10) : 1;
    var eY = TMS.length ? TMS[TMS.length - 1].slice(0, 4) : '', eM = TMS.length ? parseInt(TMS[TMS.length - 1].slice(5, 7), 10) : 12;

    var tier = '__all', amSel = '__all', logMode = false;

    // ── 聚合 ──
    function scatterData(rows) {                       // 按天数聚合 → 该天数的单数
        var m = {};
        rows.forEach(function (r) { m[r[F]] = (m[r[F]] || 0) + 1; });
        return Object.keys(m).map(function (k) { return { v: +k, n: m[k] }; })
            .sort(function (a, b) { return a.v - b.v; });
    }
    function barData(rows) {                           // 按时间源所在月聚合 → 该月平均时长
        var m = {};
        rows.forEach(function (r) {
            var ym = String(r[TF] || '').slice(0, 7); if (!ym) return;
            var o = m[ym] || (m[ym] = { s: 0, n: 0 });
            o.s += r[F]; o.n++;
        });
        return Object.keys(m).sort().map(function (ym) { return { ym: ym, avg: m[ym].s / m[ym].n, n: m[ym].n }; });
    }
    function avgOf(rows) {
        if (!rows.length) return 0;
        var s = 0; rows.forEach(function (r) { s += r[F]; });
        return s / rows.length;
    }
    function rangeYM() {
        var s = sY + '-' + pad2(sM), e = eY + '-' + pad2(eM);
        if (s > e) { var t = s; s = e; e = t; }        // 起 > 止 自动对调
        return { s: s, e: e };
    }
    function visibleRows() {
        var r = rangeYM();
        return ROWS.filter(function (x) {
            var ym = String(x[TF] || '').slice(0, 7);
            if (!ym || ym < r.s || ym > r.e) return false;
            if (tier !== '__all' && x.coe !== tier) return false;
            if (amSel !== '__all' && x.am !== amSel) return false;
            return true;
        });
    }

    // ── 块1 筛选区 ──
    function fillSelects() {
        var yh = YEARS.map(function (v) { return '<option value="' + v + '">' + v + ' 年</option>'; }).join('');
        var mh = '';
        for (var i = 1; i <= 12; i++) mh += '<option value="' + i + '">' + i + ' 月</option>';
        $('#poStartY').html(yh).val(sY);
        $('#poEndY').html(yh).val(eY);
        $('#poStartM').html(mh).val(String(sM));
        $('#poEndM').html(mh).val(String(eM));
        var ams = {};
        ROWS.forEach(function (r) { if (r.am) ams[r.am] = true; });
        var ah = '<option value="__all">全部 AM</option>';
        Object.keys(ams).sort().forEach(function (a) { ah += '<option value="' + a + '">' + a + '</option>'; });
        $('#poAM').html(ah).val(amSel);
    }

    // ── 块2 表格：不受任何筛选影响；列 = 全量 + 各年（倒序，随数据自适应） ──
    function renderTable() {
        var years = YEARS.slice().sort().reverse();
        function cell(rs) { return rs.length ? fmt1(avgOf(rs)) : '--'; }
        var h = '<table class="pt"><thead><tr><th class="pt-lbl">指标</th><th class="pt-ytd">全量</th>' +
            years.map(function (y) { return '<th>' + y + '</th>'; }).join('') +
            '</tr></thead><tbody><tr><td class="pt-lbl">平均时长（天）</td>' +
            '<td class="pt-ytd">' + cell(ROWS) + '</td>' +
            years.map(function (y) {
                return '<td>' + cell(ROWS.filter(function (r) { return String(r[TF] || '').slice(0, 4) === y; })) + '</td>';
            }).join('') +
            '</tr></tbody></table>';
        $('#poTbl').html(h);
    }

    // ── AI 总结（构建时由 DeepSeek 生成，口径 = 该页全量） ──
    function renderAI() {
        var el = document.getElementById('poAI');
        if (!el) return;
        var s = (B.PROD_OPS.ai || {})[CFG.key] || '';
        el.innerHTML = '<div class="ib-hd"><span class="ib-tag">AI 总结</span>' +
            '<span class="ib-time">数据截止 ' + esc(B.PROD_OPS.aiAt || B.DP || '') + ' · 全量口径</span></div>' +
            '<div class="ib-txt' + (s ? '' : ' ib-empty') + '">' + (s ? esc(s) : '暂无总结（构建时未生成）') + '</div>';
    }

    // ── 块3 散点图（气泡）：横轴=时长天数，纵轴恒为 1，圆点大小=该天数的单数 ──
    var scatterChart = echarts.init(document.getElementById('poScatter'), null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
    function renderScatter(vis) {
        var d = scatterData(vis);
        var avgVis = avgOf(vis);
        var maxD = d.length ? d[d.length - 1].v : 1;
        var xo = logMode
            ? { type: 'log', logBase: 10, min: LOG_MIN, max: Math.max(maxD, 1) * 1.4 }
            : { type: 'value', min: 0, max: Math.max(1, Math.ceil(maxD * 1.08)) };
        xo.name = CFG.xName; xo.nameLocation = 'middle'; xo.nameGap = 26;
        xo.axisLine = { lineStyle: { color: AXIS } };
        xo.axisLabel = { color: '#9fc6e8', fontSize: 11 };
        xo.splitLine = { lineStyle: { color: 'rgba(112,187,252,.12)' } };

        scatterChart.setOption({
            backgroundColor: 'transparent',
            animationDuration: 350,
            grid: { left: 20, right: 26, top: 26, bottom: 28, containLabel: true },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(2,24,61,.95)', borderColor: 'rgba(47,137,207,.8)',
                textStyle: { color: '#daf9ff', fontSize: 12 },
                formatter: function (p) {
                    return CFG.metricLabel + '：<b>' + p.value[0] + '</b> 天<br/>单数：<b>' + p.value[2] + '</b>';
                }
            },
            xAxis: xo,
            yAxis: { type: 'value', min: 0, max: 2, show: false },
            series: [{
                type: 'scatter',
                data: d.map(function (x) { return [x.v, 1, x.n]; }),
                symbolSize: function (val) { return Math.max(9, Math.min(48, Math.round(Math.sqrt(val[2]) * 7))); },
                itemStyle: { color: C_FILL, borderColor: C_LINE, borderWidth: 1.5 },
                emphasis: { itemStyle: { color: 'rgba(79,227,255,.35)', borderColor: '#4fe3ff', borderWidth: 2 } },
                markLine: {
                    silent: true, symbol: 'none', animation: false,
                    lineStyle: { color: C_AVG, width: 1, type: 'dashed' },
                    // 竖线上的标签用 'end'（画在轴线顶端外侧）；'insideEndTop' 在竖线上会被顶出画布
                    label: { show: true, position: 'end', color: '#daf9ff', fontSize: 11, formatter: '平均 ' + fmt1(avgVis) },
                    data: [{ xAxis: logMode ? Math.max(avgVis, LOG_MIN) : avgVis }]
                }
            }]
        }, true);
    }

    // ── 散点点圆圈 → 该天数的订单明细浮窗（§9.4 浮层标准：× / 点遮罩 / Esc 三种关闭；内容随当前筛选） ──
    function popCell(r, v) {
        if (v === 'start') {          // 生产等待期的起点：恢复生产时间优先，否则仓库接收单采血时间
            if (r.resume) return r.resume + '（恢复生产）';
            if (r.receive) return r.receive + '（入库）';
            return '--';
        }
        var x = r[v];
        return (x === null || x === undefined || x === '') ? '--' : x;
    }
    function openPop(days) {
        var cols = CFG.popCols || [];
        var rows = visibleRows().filter(function (r) { return r[F] === days; });
        rows.sort(function (a, b) { return a.no < b.no ? -1 : (a.no > b.no ? 1 : 0); });
        $('#poPopTit').html(esc(CFG.metricLabel) + ' ' + days + ' 天' +
            '<span class="po-pop-sub">　' + rows.length + ' 单 · 当前筛选口径</span>');
        if (!rows.length) {
            $('#poPopBody').html('<div class="po-pop-empty">该天数当前没有订单</div>');
        } else {
            var h = '<table class="pt"><thead><tr>' +
                cols.map(function (c) { return '<th>' + esc(c.t) + '</th>'; }).join('') +
                '</tr></thead><tbody>';
            rows.forEach(function (r) {
                h += '<tr>' + cols.map(function (c) {
                    var lbl = (c.v === 'no' || c.v === 'code' || c.v === 'hosp') ? ' class="pt-lbl"' : '';
                    return '<td' + lbl + '>' + esc(popCell(r, c.v)) + '</td>';
                }).join('') + '</tr>';
            });
            $('#poPopBody').html(h + '</tbody></table>');
        }
        $('#poPop').show();
    }
    function closePop() { $('#poPop').hide(); }
    scatterChart.on('click', function (p) {
        if (!p || !p.value) return;
        openPop(p.value[0]);
    });
    $('#poPopClose').on('click', closePop);
    $('#poPop').on('click', function (e) { if (e.target === this) closePop(); });
    $(document).on('keydown', function (e) { if (e.key === 'Escape') closePop(); });

    // ── 块4 柱状图：横轴=时间源所在月，纵轴=该月平均时长 ──
    var barChart = echarts.init(document.getElementById('poBar'), null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
    function renderBar(vis) {
        var d = barData(vis);
        var avgVis = avgOf(vis);
        var ymax = d.reduce(function (a, x) { return Math.max(a, x.avg); }, 1);
        var yo = logMode
            ? { type: 'log', logBase: 10, min: LOG_MIN, max: Math.max(ymax, 1) * 1.4 }
            : { type: 'value', min: 0, max: Math.max(1, Math.ceil(ymax * 1.25)) };
        yo.axisLine = { show: false };
        yo.axisLabel = { color: '#9fc6e8', fontSize: 11 };
        yo.splitLine = { lineStyle: { color: 'rgba(112,187,252,.12)' } };

        barChart.setOption({
            backgroundColor: 'transparent',
            animationDuration: 350,
            grid: { left: 20, right: 62, top: 26, bottom: 12, containLabel: true },
            tooltip: {
                trigger: 'axis', axisPointer: { type: 'shadow' },
                backgroundColor: 'rgba(2,24,61,.95)', borderColor: 'rgba(47,137,207,.8)',
                textStyle: { color: '#daf9ff', fontSize: 12 },
                formatter: function (ps) {
                    var p = ps[0]; if (!p) return '';
                    return '<b>' + p.axisValue + '</b><br/>平均' + CFG.metricLabel + '：<b>' + fmt1(p.data.avg) + '</b> 天<br/>单数：' + p.data.n;
                }
            },
            xAxis: {
                type: 'category', data: d.map(function (x) { return x.ym; }),
                axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false },
                axisLabel: { color: '#9fc6e8', fontSize: 11, rotate: 30 }
            },
            yAxis: yo,
            series: [{
                type: 'bar', barMaxWidth: 26,
                data: d.map(function (x) { return { value: logMode ? Math.max(x.avg, LOG_MIN) : x.avg, avg: x.avg, n: x.n }; }),
                itemStyle: { color: C_BAR, borderRadius: [3, 3, 0, 0] },
                emphasis: { itemStyle: { color: '#4fe3ff' } },
                label: { show: true, position: 'top', color: '#daf9ff', fontSize: 10, formatter: function (p) { return fmt1(p.data.avg); } },
                markLine: {
                    silent: true, symbol: 'none', animation: false,
                    lineStyle: { color: C_AVG, width: 1, type: 'dashed' },
                    // 横线上的标签放最右端（'end' = 线的末端外侧）
                    label: { show: true, position: 'end', color: '#daf9ff', fontSize: 11, formatter: '平均 ' + fmt1(avgVis) },
                    data: [{ yAxis: logMode ? Math.max(avgVis, LOG_MIN) : avgVis }]
                }
            }]
        }, true);
    }

    // ── 重绘 ──
    function redraw() {
        closePop();                 // 筛选/口径变化后旧明细不再有效（§9.4：浮窗内容随筛选）
        var vis = visibleRows();
        $('#poCnt').html('参与统计 <b>' + vis.length + '</b> 单');
        renderScatter(vis);
        renderBar(vis);
    }

    // ── 事件 ──
    $('#poStartY,#poStartM,#poEndY,#poEndM').on('change', function () {
        sY = $('#poStartY').val(); sM = parseInt($('#poStartM').val(), 10);
        eY = $('#poEndY').val(); eM = parseInt($('#poEndM').val(), 10);
        redraw();
    });
    $('#poTier').on('change', function () { tier = $(this).val(); redraw(); });
    $('#poAM').on('change', function () { amSel = $(this).val(); redraw(); });
    $('#poScale').on('change', function () { logMode = $(this).val() === 'log'; redraw(); });
    window.addEventListener('resize', function () { scatterChart.resize(); barChart.resize(); });

    // ── 图表数据导出（下载的是图表聚合数据，不是底层订单明细） ──
    // 本脚本在 excel_export.js 之前加载，故走 BOARD_XLS_CUSTOM（模块加载时自动合并）
    window.BOARD_XLS_CUSTOM = window.BOARD_XLS_CUSTOM || {};
    window.BOARD_XLS_CUSTOM['poScatter'] = function () {
        var aoa = [['时长(天)', '单数']];
        scatterData(visibleRows()).forEach(function (x) { aoa.push([x.v, x.n]); });
        BoardXLS.exportAoa(aoa, CFG.exportBase + '_' + CFG.xName);
    };
    window.BOARD_XLS_CUSTOM['poBar'] = function () {
        var aoa = [['年月', '平均时长(天)', '单数']];
        barData(visibleRows()).forEach(function (x) { aoa.push([x.ym, Math.round(x.avg * 10) / 10, x.n]); });
        BoardXLS.exportAoa(aoa, CFG.exportBase + '_' + CFG.yName);
    };

    // ── 初始化 ──
    $(function () {
        fillSelects();
        renderTable();
        renderAI();
        redraw();
    });
})();
