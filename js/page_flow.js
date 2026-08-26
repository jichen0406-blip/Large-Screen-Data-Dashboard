// 福可苏全流程跟进（P3）：13 列漏斗堆积柱状图 + 下单日期时间范围控制器（仅本页，不与其他页共享）
$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.FLOW || !B.FLOW.orders) return;
    var ORDERS = B.FLOW.orders;
    var DP = B.DP || '';

    // ── 月份列表（按下单日期） ──
    var monthSet = {};
    ORDERS.forEach(function (o) { if (o.od) monthSet[o.od.slice(0, 7)] = true; });
    var MONTHS = Object.keys(monthSet).sort();
    if (!MONTHS.length) return;
    var MIN_M = MONTHS[0], MAX_M = MONTHS[MONTHS.length - 1];

    // 无颜色段（完全透明，仅占堆叠高度）
    var NO_COLOR = 'rgba(0,0,0,0)';
    var COLORS = {
        order: '#4fc3f7',
        zqNo: '#ffb74d', zqExp: '#ff8a65', zqOk: '#aed581',
        b3: '#ef5350', b4: '#4dd0e1', b5: '#f06292', b6: '#b39ddb', b7: '#ffd54f', b8: '#e57373',
        b9: '#4db6ac', b10Fail: '#ff7043', b10Dead: '#90a4ae', b11: '#81c784', b12: '#7986cb', b13: '#64b5f6'
    };

    // ── 时间范围控制器（起始/结束 年月下拉） ──
    function fillSel($sel, cur) {
        MONTHS.forEach(function (m) {
            $sel.append('<option value="' + m + '"' + (m === cur ? ' selected' : '') + '>' + m + '</option>');
        });
    }
    var $start = $('#flowStart'), $end = $('#flowEnd');
    fillSel($start, MIN_M); fillSel($end, MAX_M);
    $start.on('change', function () { if ($start.val() > $end.val()) $end.val($start.val()); render(); });
    $end.on('change', function () { if ($end.val() < $start.val()) $start.val($end.val()); render(); });

    // ── 工具 ──
    function expired12(v) {
        if (!v || !DP) return false;
        var cutoff = (parseInt(DP.slice(0, 4), 10) - 1) + DP.slice(4); // 12 个月前
        return v < cutoff;
    }
    function isZqCand(x) { return (x.pay || '').indexOf('择期') >= 0 || !!(x.modZq); }

    // ── 漏斗计算（顺序刨除） ──
    function compute() {
        var s = $start.val(), e = $end.val();
        var pool = ORDERS.filter(function (o) { return o.od && o.od.slice(0, 7) >= s && o.od.slice(0, 7) <= e; });

        // 择期生产：支付方式含"择期" 或 申请修改为择期（modZq 非空）；恢复生产时间空且未取消回输才算
        var zq = pool.filter(function (x) { return isZqCand(x) && !x.resume && x.cancel !== '1'; });
        var zqNo = zq.filter(function (x) { return !x.receive; });
        var zqExp = zq.filter(function (x) { return x.receive && expired12(x.receive); });
        var zqOk = zq.filter(function (x) { return x.receive && !expired12(x.receive); });
        var zqErr = zq.filter(function (x) { return x.qa; }); // 异常：择期却有质量放行时间

        var used = {};
        zq.forEach(function (x) { used[x.no] = true; });
        function take(pred) {
            var out = [];
            pool.forEach(function (x) { if (!used[x.no] && pred(x)) { used[x.no] = true; out.push(x); } });
            return out;
        }
        var isPc = function (x) { return x.cancel === '1' && (x.note || '').indexOf('生产中取消') >= 0; };
        var isFin = function (x) { return x.cancel === '1' && (x.note || '').indexOf('生产完成取消回输') >= 0; };

        var b3 = take(function (x) { return x.cancel === '1' && (x.note || '').indexOf('单采预约前取消') >= 0; });
        var b4 = take(function (x) { return !x.apmt; });
        var b5 = take(function (x) { return x.cancel === '1' && (x.note || '').indexOf('单采前取消') >= 0 && (x.note || '').indexOf('单采预约前取消') < 0; });
        var b6 = take(function (x) { return x.apmt && x.apmt > DP; });
        var b7 = take(function (x) { return x.apmt && x.apmt === DP && !x.receive; });
        var b8 = take(function (x) { return x.cancel === '1' && (x.note || '').indexOf('单采后取消') >= 0; });
        // 真漏斗：排期/生产中 = 已接收单采血 && 未放行 && 未回输 && 非生产中取消/生产完成取消回输
        var b9 = take(function (x) { return x.receive && !x.qa && !x.re && !isPc(x) && !isFin(x); });
        var b10 = take(function (x) { return isPc(x); });
        var b11 = take(function (x) { return x.qa && !x.re && !isFin(x); });
        var b12 = take(function (x) { return isFin(x); });
        var b13 = take(function (x) { return x.re; });
        var leftover = pool.filter(function (x) { return !used[x.no]; }); // 漏网 → 算入等待单采

        var b10Fail = b10.filter(function (x) { return (x.note || '').indexOf('（生产失败）') >= 0; }).length;
        var b10Dead = b10.filter(function (x) { return (x.note || '').indexOf('（患者死亡）') >= 0; }).length;

        return {
            total: pool.length,
            zq: { n: zq.length, no: zqNo.length, exp: zqExp.length, ok: zqOk.length, err: zqErr },
            b3: b3.length, b4: b4.length, b5: b5.length, b6: b6.length + leftover.length,
            b7: b7.length, b8: b8.length, b9: b9.length,
            b10: b10.length, b10Fail: b10Fail, b10Dead: b10Dead,
            b11: b11.length, b12: b12.length, b13: b13.length
        };
    }

    // ── 构建 13 列（每列 4 层：L1 顶 → L4 底） ──
    function noColor(v) { return { v: v, c: null }; }
    function colored(v, c) { return { v: v, c: c }; }
    function buildCols(d) {
        var T = d.total, zq = d.zq.n;
        var cols = [];
        cols.push({ name: '下单', before: 0, rest: 0,
            layers: [noColor(0), noColor(0), noColor(0), colored(T, COLORS.order)],
            tip: [['下单', T, COLORS.order]] });
        cols.push({ name: '择期生产', before: 0, rest: T - zq,
            layers: [colored(d.zq.no, COLORS.zqNo), colored(d.zq.exp, COLORS.zqExp), colored(d.zq.ok, COLORS.zqOk), noColor(T - zq)],
            tip: [['没单采', d.zq.no, COLORS.zqNo], ['过期', d.zq.exp, COLORS.zqExp], ['已单采', d.zq.ok, COLORS.zqOk]] });
        var seq = [
            { k: 'b3', name: '单采预约前取消', color: COLORS.b3, tip: '单采预约前取消' },
            { k: 'b4', name: '预约单采中', color: COLORS.b4, tip: '预约单采中' },
            { k: 'b5', name: '单采前取消', color: COLORS.b5, tip: '单采前取消' },
            { k: 'b6', name: '等待单采', color: COLORS.b6, tip: '等待单采' },
            { k: 'b7', name: '单采中', color: COLORS.b7, tip: '单采中' },
            { k: 'b8', name: '单采后取消', color: COLORS.b8, tip: '单采后取消' },
            { k: 'b9', name: '排期/生产中', color: COLORS.b9, tip: '排期/生产中' },
            { k: 'b10', name: '生产中取消', subs: [['生产失败', d.b10Fail, COLORS.b10Fail], ['患者死亡', d.b10Dead, COLORS.b10Dead]] },
            { k: 'b11', name: '质量放行', color: COLORS.b11, tip: '质量放行' },
            { k: 'b12', name: '生产完成取消回输', color: COLORS.b12, tip: '生产完成取消回输' },
            { k: 'b13', name: '回输', color: COLORS.b13, tip: '回输' }
        ];
        var cum = zq;
        seq.forEach(function (s) {
            var v = d[s.k];
            var rest = T - cum - v;
            if (s.subs) {
                cols.push({ name: s.name, before: cum, rest: rest,
                    layers: [noColor(cum), colored(s.subs[0][1], s.subs[0][2]), colored(s.subs[1][1], s.subs[1][2]), noColor(rest)],
                    tip: s.subs });
            } else {
                cols.push({ name: s.name, before: cum, rest: rest,
                    layers: [noColor(cum), colored(v, s.color), noColor(0), noColor(rest)],
                    tip: [[s.tip, v, s.color]] });
            }
            cum += v;
        });
        return cols;
    }

    // ── 渲染 ──
    var chart = echarts.init(document.getElementById('flowChart'));
    function render() {
        var d = compute();
        var cols = buildCols(d);
        var T = d.total;
        var xData = cols.map(function (c) { return c.name; });
        var series = [];
        for (var L = 0; L < 4; L++) {
            series.push({
                name: 'L' + L, type: 'bar', stack: 'flow', barWidth: 42, barCategoryGap: '28%',
                data: cols.map(function (c) {
                    var ly = c.layers[3 - L]; // ECharts series[0] 在底部，反序使 layers[0] 置顶
                    var isC = !!ly.c;
                    return {
                        value: ly.v,
                        itemStyle: { color: isC ? ly.c : NO_COLOR, borderColor: isC ? 'rgba(2,24,61,0.5)' : 'transparent', borderWidth: isC ? 1 : 0 },
                        emphasis: isC ? { itemStyle: { borderColor: '#4fe3ff', borderWidth: 1.5 } } : { itemStyle: {} },
                        label: {
                            show: isC && ly.v > 0, position: 'inside',
                            color: '#0b1f3a', fontSize: 12, fontWeight: 700,
                            formatter: function () { return ly.v; }
                        }
                    };
                })
            });
        }
        chart.setOption({
            backgroundColor: 'transparent',
            grid: { left: 20, right: 20, top: 34, bottom: 64, containLabel: true },
            tooltip: {
                trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(47,137,207,0.12)' } },
                backgroundColor: 'rgba(2,24,61,0.95)', borderColor: 'rgba(47,137,207,0.8)',
                textStyle: { color: '#daf9ff', fontSize: 13 },
                formatter: function (params) {
                    var c = cols[params[0].dataIndex];
                    var html = '<b>' + c.name + '</b>';
                    c.tip.forEach(function (t) {
                        if (t[1] > 0) {
                            html += '<br/><span style="display:inline-block;width:10px;height:10px;background:' + t[2] + ';border-radius:2px;margin-right:5px;"></span>' + t[0] + ': ' + t[1];
                        }
                    });
                    return html;
                }
            },
            xAxis: {
                type: 'category', data: xData, boundaryGap: true,
                axisLine: { lineStyle: { color: 'rgba(112,187,252,0.5)' } },
                axisTick: { show: false },
                axisLabel: { color: '#cfe8ff', fontSize: 11, interval: 0, rotate: 30 }
            },
            yAxis: {
                type: 'value', minInterval: 1,
                axisLine: { show: false }, axisTick: { show: false },
                splitLine: { lineStyle: { color: 'rgba(112,187,252,0.15)' } },
                axisLabel: { color: '#9fc6e8', fontSize: 12 }
            },
            series: series
        });

        // 异常提示：择期生产却存在质量放行时间
        var $e = $('#flowErr');
        if (d.zq.err && d.zq.err.length) {
            $e.html('<b>⚠ 异常提示：</b>以下择期生产订单存在「质量放行时间」，请核对数据：<br/>' +
                d.zq.err.map(function (x) { return x.no; }).join('、')).show();
        } else { $e.hide(); }
    }

    render();
    window.addEventListener('resize', function () { chart.resize(); });
});
