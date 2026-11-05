// zq_duration.js — 择期订单恢复时长：① 月均柱 + 月中位线 + 区间平均虚线 ② 按月散点（圆大小=该时长出现次数）
// 数据：BOARD_DATA.ZQ.rows（durDays = 恢复生产时间 − 仓库接收单采血时间），按下单月统计
$(function () {
    var B = window.BOARD_DATA;
    var Z = (B && B.ZQ) || { rows: [] };
    var R = window.RZ;
    if (!R || !window.echarts || !Z.rows.length) return;

    var durs = Z.rows.filter(function (r) { return r.durDays != null; });
    if (!durs.length) return;

    var monSet = {};
    durs.forEach(function (r) { if (r.od) monSet[r.od.slice(0, 7)] = 1; });
    var months = Object.keys(monSet).sort();
    R.initRange('zd', months, B.DP);

    var ams = {};
    durs.forEach(function (r) { if (r.am) ams[r.am] = 1; });
    var $am = document.getElementById('zdAm');
    $am.innerHTML = '<option value="ALL">全部 AM</option>' + Object.keys(ams).sort().map(function (a) {
        return '<option value="' + R.esc(a) + '">' + R.esc(a) + '</option>';
    }).join('');
    var state = { am: 'ALL' };

    function mk(id) {
        var c = echarts.init(document.getElementById(id), null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
        return c;
    }
    var c1 = mk('zdChart'), c2 = mk('zdScatter');
    function resizeAll() { try { c1.resize(); } catch (e) { } try { c2.resize(); } catch (e) { } }
    window.addEventListener('resize', resizeAll);
    $(document).on('boardfs', function () { setTimeout(resizeAll, 80); });
    $(document).on('boardlogin', function () { setTimeout(resizeAll, 80); });

    function render() {
        var rg = R.readRange('zd');
        var by = {};
        durs.forEach(function (r) {
            if (!r.od) return;
            var k = r.od.slice(0, 7);
            if (k < rg.a || k > rg.b) return;
            if (state.am !== 'ALL' && r.am !== state.am) return;
            (by[k] = by[k] || []).push(r.durDays);
        });
        var ms = R.monthsBetween(rg);
        var avg = ms.map(function (m) { return (by[m] && by[m].length) ? +R.mean(by[m]).toFixed(1) : null; });
        var med = ms.map(function (m) { return (by[m] && by[m].length) ? +R.median(by[m]).toFixed(1) : null; });
        var cnt = ms.map(function (m) { return (by[m] ? by[m].length : 0); });

        var all = [];
        ms.forEach(function (m) { if (by[m]) all = all.concat(by[m]); });
        var rangeAvg = all.length ? R.mean(all) : null;

        /* ① 柱 + 线 + 区间平均虚线 */
        c1.resize();
        c1.setOption({
            animation: false,
            grid: { left: 58, right: 110, top: 54, bottom: 44 },
            tooltip: $.extend(R.barTooltip(), {
                trigger: 'axis', axisPointer: { type: 'shadow' },
                textStyle: { color: '#dff4ff', fontSize: 13 },
                formatter: function (ps) {
                    var i = ps[0].dataIndex;
                    if (!cnt[i]) return '<b style="font-size:14px">' + ms[i] + '</b><br/>当月无恢复生产订单';
                    return '<b style="font-size:14px">' + ms[i] + '</b>　样本 ' + cnt[i] + ' 单<br/>' +
                        '平均 <b>' + avg[i] + '</b> 天 · 中位 <b>' + med[i] + '</b> 天';
                }
            }),
            legend: {
                top: 6, left: 'center', itemWidth: 16, itemHeight: 9,
                textStyle: { color: 'rgba(223,244,255,.85)', fontSize: 13 },
                data: ['月均（天）', '月中位（天）']
            },
            xAxis: {
                type: 'category', data: ms,
                axisLine: { lineStyle: { color: 'rgba(112,187,252,.45)' } },
                axisLabel: { color: 'rgba(223,244,255,.8)', fontSize: 11, rotate: 0, interval: 'auto', formatter: function (v) { return v.slice(2); } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value', name: '天',
                nameTextStyle: { color: 'rgba(223,244,255,.7)', fontSize: 13 },
                axisLine: { show: false },
                axisLabel: { color: 'rgba(223,244,255,.8)', fontSize: 12 },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } }
            },
            series: [
                {
                    name: '月均（天）', type: 'bar', barWidth: '52%',
                    data: avg,
                    itemStyle: { color: 'rgba(47,137,207,.75)', borderRadius: [3, 3, 0, 0] },
                    label: {
                        show: true, position: 'top', color: 'rgba(159,232,255,.9)', fontSize: 11,
                        formatter: function (p) { return cnt[p.dataIndex] ? cnt[p.dataIndex] : ''; }
                    },
                    markLine: rangeAvg == null ? undefined : {
                        silent: true, symbol: 'none',
                        lineStyle: { color: '#ff4d4f', type: 'dashed', width: 1.4 },
                        label: {
                            formatter: '区间平均 ' + rangeAvg.toFixed(1) + ' 天', color: '#ff8a80', fontSize: 12,
                            position: 'end'
                        },
                        data: [{ yAxis: +rangeAvg.toFixed(1) }]
                    }
                },
                {
                    name: '月中位（天）', type: 'line',
                    data: med, symbol: 'circle', symbolSize: 7, connectNulls: true,
                    lineStyle: { color: '#ffcf4d', width: 2.4 }, itemStyle: { color: '#ffcf4d' }
                }
            ]
        }, true);

        /* ② 离散程度：横轴=恢复天数，纵轴无数值（散点纵向居中），圆大小=该天数的单数 */
        var dayCnt = {};
        ms.forEach(function (m) { (by[m] || []).forEach(function (d) { dayCnt[d] = (dayCnt[d] || 0) + 1; }); });
        var maxN = 1;
        Object.keys(dayCnt).forEach(function (d) { if (dayCnt[d] > maxN) maxN = dayCnt[d]; });
        var pts = Object.keys(dayCnt).map(function (d) {
            var n = dayCnt[d];
            return {
                value: [+d, 0.5], n: n,
                symbolSize: 8 + Math.sqrt(n / maxN) * 26
            };
        });
        c2.resize();
        c2.setOption({
            animation: false,
            grid: { left: 30, right: 30, top: 34, bottom: 46 },
            tooltip: $.extend(R.barTooltip(), {
                trigger: 'item',
                textStyle: { color: '#dff4ff', fontSize: 13 },
                formatter: function (p) {
                    return '恢复 <b>' + p.value[0] + '</b> 天　共 <b>' + p.data.n + '</b> 单';
                }
            }),
            xAxis: {
                type: 'value', scale: true,
                name: '恢复天数（天）',
                nameLocation: 'middle', nameGap: 28,
                nameTextStyle: { color: 'rgba(223,244,255,.7)', fontSize: 12 },
                min: 0,
                axisLine: { lineStyle: { color: 'rgba(112,187,252,.45)' } },
                axisLabel: { color: 'rgba(223,244,255,.8)', fontSize: 11 },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,.06)' } }
            },
            yAxis: {
                type: 'value', min: 0, max: 1, show: false,
                splitLine: { show: false }
            },
            series: [{
                name: '恢复时长', type: 'scatter', data: pts,
                itemStyle: { color: 'rgba(79,227,255,.55)', borderColor: '#4fe3ff', borderWidth: 1 },
                markLine: rangeAvg == null ? undefined : {
                    silent: true, symbol: 'none',
                    lineStyle: { color: '#ff4d4f', type: 'dashed', width: 1.2 },
                    label: { formatter: '区间平均 ' + rangeAvg.toFixed(1) + ' 天', color: '#ff8a80', fontSize: 11, position: 'end' },
                    data: [{ xAxis: +rangeAvg.toFixed(1) }]
                }
            }]
        }, true);

        /* ③ 每 30 天分档统计表 */
        (function () {
            var box = document.getElementById('zdBucket');
            if (!box) return;
            var EDGES = [0, 30, 60, 90, 120, 150, 180, Infinity];
            var rowsB = [];
            for (var i = 0; i < EDGES.length - 1; i++) {
                var lo = EDGES[i], hi = EDGES[i + 1];
                var n = all.filter(function (d) { return d >= lo && d < hi; }).length;
                var label = (hi === Infinity) ? ('≥' + lo + ' 天') : (lo + '–' + hi + ' 天');
                rowsB.push({ label: label, n: n });
            }
            var tot = all.length;
            var h = '<table class="pt pt-ov"><thead><tr><th class="pt-lbl">时长分档</th><th>单数</th><th>占比</th></tr></thead><tbody>';
            if (!tot) h += '<tr><td colspan="3" style="text-align:center;color:rgba(255,255,255,.45);padding:14px 0;">所选条件无数据</td></tr>';
            rowsB.forEach(function (b) {
                var p = tot ? (b.n / tot * 100) : 0;
                h += '<tr><td class="pt-lbl">' + b.label + '</td>' +
                     '<td style="color:#4fe3ff;font-weight:600">' + b.n + '</td>' +
                     '<td>' + (tot ? p.toFixed(1) + '%' : '—') + '</td></tr>';
            });
            h += '</tbody><tfoot><tr><td class="pt-lbl">合计</td><td>' + tot + '</td><td>' + (tot ? '100.0%' : '—') + '</td></tr></tfoot></table>';
            box.innerHTML = h;
        })();

        var note = document.getElementById('zdNote');
        if (note) {
            note.textContent = '区间 ' + rg.a + ' ~ ' + rg.b + '　|　样本 ' + all.length + ' 单' +
                (all.length ? '　|　区间均值 ' + R.mean(all).toFixed(1) + ' 天 · 中位 ' + R.median(all) + ' 天' : '');
        }
    }

    ['zdY1', 'zdM1', 'zdY2', 'zdM2'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', render);
    });
    $am.addEventListener('change', function () { state.am = this.value; render(); });

    render();
    setTimeout(function () { render(); resizeAll(); }, 120);
    setTimeout(resizeAll, 400);

    var ai = document.getElementById('zdAI');
    if (ai) {
        var s = Z.durAI || '';
        ai.innerHTML = s
            ? '<div class="ib-hd"><span class="ib-tag">AI 总结</span><span class="ib-time">数据截止 ' + (Z.durAt || '') + '</span><button class="ib-toggle" type="button">展开</button></div><div class="ib-txt">' + R.esc(s) + '</div>'
            : '<div class="ib-hd"><span class="ib-tag">AI 总结</span></div><div class="ib-txt ib-empty">暂无总结（构建时未生成）</div>';
    }
});
