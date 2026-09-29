// page22.js — 医院销量散点图（key region4，P11，接在「省份&医院数据」之后）
// X = YTD 下单数量，Y = YTD 回输数量；两轴的原点移到平均值处（两轴交点 = 两个平均值）：
//   横轴画在 y = 平均回输量 = YTD 总回输 ÷ 有回输的医院数
//   竖轴画在 x = 平均下单量 = YTD 总下单 ÷ 下单医院数
// 两轴带箭头、不显示刻度与数字（顺序可能极端偏斜，数字意义不大）；「坐标」可切线性 / 对数，
// 对数会把低值区摊开。点形状区分 SCOE/COE/RCOE/Others（大小统一）；颜色 = 下单同比涨跌（绿/红/灰）。
// 搜索（医院名 / 分类）与下单 AM 筛选**只过滤散点**，坐标轴范围与两轴位置不变。
// 数据：window.BOARD_DATA.REGIONS.HOSP    = 'YYYY-MM' → 'AM|省份|城市|医院' → {o,r}
//       window.BOARD_DATA.REGIONS.COEHOSP = '省份|城市|医院名' → 'SCOE|COE|RCOE|Others'
// 时间控件与辖区 1/2/3 共享（sessionStorage pt_time），见 js/pt-common.js
$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.REGIONS || !B.REGIONS.HOSP) return;
    var HOSP = B.REGIONS.HOSP;
    var COEHOSP = B.REGIONS.COEHOSP || {};
    var SEM = window.BOARD_SEMANTIC || { order: '#2f89cf', reinfuse: '#62c98d' };

    // 同比三色：与表格 .pt-yu / .pt-yd 同色（css/style.css:412-413），灰取 BOARD_STATUS.gray
    var C_UP = '#14e144', C_DN = '#ff6316', C_NA = '#9aa0a6';
    var AXIS_LINE = 'rgba(112,187,252,.85)';
    var LOG_MIN = 0.5; // 对数轴下限：0 单的医院落在轴底（log 不能取 0）
    // 绘图区内边距：四角留给角标底板，故留得比较宽
    var GRID = { left: 104, right: 104, top: 54, bottom: 44 };
    // 分类 → 形状（点大小统一，只靠形状区分）
    var TIERS = [
        { name: 'SCOE', symbol: 'diamond' },
        { name: 'COE', symbol: 'circle' },
        { name: 'RCOE', symbol: 'triangle' },
        { name: 'Others', symbol: 'rect' }
    ];
    // 画布叠放顺序：Others 压在最下，SCOE 在最上（重点医院不被盖住）
    var DRAW_ORDER = ['Others', 'RCOE', 'COE', 'SCOE'];

    var el = document.getElementById('p22Chart');
    if (!el) return;
    var chart = echarts.init(el, null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
    window.addEventListener('resize', function () {
        chart.resize();
        setTimeout(paintAxisNames, 60);
    });

    // 当前年月下的全量 + 由全量算出的口径。搜索/AM 筛选只动「可见点」，这些一律不变。
    var ALL = { rows: [], S: null, maxO: 1, maxR: 1 };
    var query = '';
    var amSel = '__all';
    var tierSel = '__all';
    var logMode = false;
    // 四象限当前「可见」的医院行（角标家数与明细浮窗共用，随筛选变化）
    var QROWS = { lt: [], rt: [], lb: [], rb: [] };

    // ── 取数：按「医院实体」聚合 YTD（同一医院的多 AM 合并），与 page6.js:128「下单医院数去重」同口径 ──
    function accumulate(y, m) {
        var ly = y - 1, acc = {};
        function bump(bk, isCur) {
            Object.keys(bk).forEach(function (k) {
                var p = k.split('|'); // AM|省份|城市|医院
                var hk = p[1] + '|' + p[2] + '|' + p[3];
                var v = acc[hk] || (acc[hk] = { prov: p[1], city: p[2], hosp: p[3], ams: {}, amsO: {}, o: 0, r: 0, lo: 0, lr: 0 });
                if (isCur) {
                    v.o += bk[k].o || 0; v.r += bk[k].r || 0;
                    v.ams[p[0]] = true;
                    if ((bk[k].o || 0) > 0) v.amsO[p[0]] = true; // 下单 AM（筛选用）
                }
                else { v.lo += bk[k].o || 0; v.lr += bk[k].r || 0; }
            });
        }
        for (var i = 1; i <= m; i++) {
            var b1 = HOSP[y + '-' + pad(i)], b2 = HOSP[ly + '-' + pad(i)];
            if (b1) bump(b1, true);
            if (b2) bump(b2, false);
        }
        return acc;
    }

    // 当前时间窗内有下单或回输的医院实体
    function currentRows(y, m) {
        var acc = accumulate(y, m), rows = [];
        Object.keys(acc).forEach(function (hk) {
            var v = acc[hk];
            if (!(v.o > 0 || v.r > 0)) return;
            v.coe = COEHOSP[hk] || 'Others';
            v.ams = Object.keys(v.ams);
            v.amsO = Object.keys(v.amsO);
            rows.push(v);
        });
        return rows;
    }

    // 两条轴线所在位置（= 两个平均值）+ 明细
    function stats(rows) {
        var sumO = 0, sumR = 0, nO = 0, nR = 0;
        rows.forEach(function (r) {
            sumO += r.o; sumR += r.r;
            if (r.o > 0) nO++; // 下单医院数（YTD 有下单的医院实体数）
            if (r.r > 0) nR++; // 有回输的医院数
        });
        return { sumO: sumO, sumR: sumR, nO: nO, nR: nR,
                 avgO: nO ? sumO / nO : 0, avgR: nR ? sumR / nR : 0 };
    }

    // 颜色 = 下单同比涨跌；去年为 0 视为新增（绿）；今年没有下单则无从判断（灰）
    function yoyColor(r) {
        if (!(r.o > 0)) return C_NA;
        if (!(r.lo > 0)) return C_UP;
        return (r.o - r.lo) >= 0 ? C_UP : C_DN;
    }
    function toPoint(row) {
        // 对数轴不能取 0：0 单的医院落到轴底，位置与「1 单」区分开
        var x = row.o, y = row.r;
        if (logMode) { x = Math.max(x, LOG_MIN); y = Math.max(y, LOG_MIN); }
        return {
            name: row.hosp, value: [x, y],
            o: row.o, r: row.r, lo: row.lo, lr: row.lr,
            hosp: row.hosp, prov: row.prov, city: row.city, coe: row.coe, ams: row.ams,
            itemStyle: { color: yoyColor(row) }
        };
    }

    // ── 浮窗（house style 见 js/map.js:114-140） ──
    function tipRow(label, val, unit, yoy, color) {
        return '<div style="line-height:22px;color:rgba(255,255,255,.85);">' + label +
            '：<span style="color:' + color + ';font-weight:700;font-size:15px;">' + val + '</span> ' + unit +
            '<span style="margin-left:10px;font-size:12px;">' + yoy + '</span></div>';
    }
    function tipHTML(p) {
        var d = p.data;
        if (!d || !d.hosp) return '';
        return '<div style="font-size:14px;color:#fff;font-weight:700;padding:10px 14px 6px;border-bottom:1px solid rgba(47,137,207,.5);letter-spacing:1px;">' + d.hosp + '</div>' +
            '<div style="padding:8px 14px 12px;font-size:13px;">' +
            tipRow('YTD下单', d.o, '单', yoyStr(d.o, d.lo), SEM.order) +
            tipRow('YTD回输', d.r, '单', yoyStr(d.r, d.lr), SEM.reinfuse) +
            '<div style="margin-top:6px;line-height:20px;font-size:12px;color:rgba(255,255,255,.6);">' +
            '分类：' + d.coe + '　' + d.prov + '·' + (d.city || '--') +
            '</div>' +
            '<div style="line-height:20px;font-size:12px;color:rgba(255,255,255,.6);">AM：' + (d.ams || []).join('、') + '</div>' +
            '</div>';
    }
    function tipPos(point, params, dom, rect, size) {
        var vw = size.viewSize[0], vh = size.viewSize[1];
        var cw = size.contentSize[0], ch = size.contentSize[1];
        if (point && point[0] != null) {
            var x = point[0] + 14, y = point[1] + 14;
            if (x + cw > vw) x = point[0] - cw - 14;
            if (y + ch > vh) y = point[1] - ch - 14;
            return [Math.max(4, x), Math.max(4, y)];
        }
        return [vw / 2 - cw / 2, vh * 0.4];
    }

    // ── 四象限计数（HTML 角标：底板 + 象限图标 + 家数） ──
    // 图标：一个方框，把对应那格填实，直观表示象限方位（填色留在外框内，不压描边）
    var QICON = {
        lt: '<rect x="2.2" y="2.2" width="5.8" height="5.8" rx="1"/>',
        rt: '<rect x="8" y="2.2" width="5.8" height="5.8" rx="1"/>',
        lb: '<rect x="2.2" y="8" width="5.8" height="5.8" rx="1"/>',
        rb: '<rect x="8" y="8" width="5.8" height="5.8" rx="1"/>'
    };
    function qBadge(which, label, n) {
        return '<span class="p22-ico"><svg viewBox="0 0 16 16">' +
            '<rect x="1.6" y="1.6" width="12.8" height="12.8" rx="3" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".45"/>' +
            QICON[which] + '</svg></span>' +
            '<span>' + label + '</span><b>' + n + '</b><em>家</em>';
    }
    function paintBadges(vis, S) {
        var q = { lt: [], rt: [], lb: [], rb: [] };
        vis.forEach(function (r) {
            var hiO = r.o >= S.avgO, hiR = r.r >= S.avgR;
            if (hiO && hiR) q.rt.push(r);
            else if (!hiO && hiR) q.lt.push(r);
            else if (!hiO && !hiR) q.lb.push(r);
            else q.rb.push(r);
        });
        QROWS = q;
        $('#p22qLT').html(qBadge('lt', '左上', q.lt.length));
        $('#p22qRT').html(qBadge('rt', '右上', q.rt.length));
        $('#p22qLB').html(qBadge('lb', '左下', q.lb.length));
        $('#p22qRB').html(qBadge('rb', '右下', q.rb.length));
    }

    // ── 点角标 → 该象限医院明细浮窗（内容是「当前可见的点」，与角标家数一致） ──
    var QNAME = { lt: '左上象限', rt: '右上象限', lb: '左下象限', rb: '右下象限' };
    function openQuad(which) {
        var rows = (QROWS[which] || []).slice().sort(function (a, b) { return b.o - a.o || b.r - a.r; });
        var sumO = 0, sumR = 0;
        rows.forEach(function (r) { sumO += r.o; sumR += r.r; });
        $('#p22PopTit').html(QNAME[which] + '　<span class="p22-pop-sub">' + rows.length + ' 家　YTD下单 ' + sumO + ' · YTD回输 ' + sumR +
            '　（合计对均值：下单 ' + ALL.S.avgO.toFixed(1) + ' · 回输 ' + ALL.S.avgR.toFixed(1) + '）</span>');
        if (!rows.length) {
            $('#p22PopBody').html('<div class="p22-pop-empty">该象限当前没有医院</div>');
        } else {
            var h = '<table class="pt"><thead><tr>' +
                '<th>医院名称</th><th>分类</th><th>AM</th><th>省份</th><th>城市</th>' +
                '<th class="pt-ytd">YTD下单</th><th>下单同比</th><th class="pt-ytd">YTD回输</th><th>回输同比</th>' +
                '</tr></thead><tbody>';
            rows.forEach(function (r) {
                h += '<tr>' +
                    '<td class="pt-lbl">' + r.hosp + '</td>' +
                    '<td>' + r.coe + '</td>' +
                    '<td>' + (r.ams || []).join('、') + '</td>' +
                    '<td>' + r.prov + '</td>' +
                    '<td>' + (r.city || '--') + '</td>' +
                    '<td>' + (r.o > 0 ? r.o : '') + '</td>' +
                    '<td>' + yoyStr(r.o, r.lo) + '</td>' +
                    '<td>' + (r.r > 0 ? r.r : '') + '</td>' +
                    '<td>' + yoyStr(r.r, r.lr) + '</td>' +
                    '</tr>';
            });
            $('#p22PopBody').html(h + '</tbody></table>');
        }
        $('#p22Pop').show();
    }
    function closeQuad() { $('#p22Pop').hide(); }

    // 轴范围（线性 / 对数）—— 画轴、放轴名、算刻度都走这一处，保证一致
    function axisBounds(maxV) {
        if (logMode) return { min: LOG_MIN, max: Math.max(maxV, 1) * 1.2 };
        return { min: 0, max: Math.max(1, Math.ceil(maxV * 1.06)) };
    }
    // 某个值在轴上的位置比例（0 = 起点，1 = 终点）；对数轴按对数刻度算
    function axisFrac(v, min, max) {
        if (logMode) {
            var lv = Math.log(Math.max(v, LOG_MIN)), a = Math.log(min), b = Math.log(max);
            return b > a ? (lv - a) / (b - a) : 0;
        }
        return max > min ? (v - min) / (max - min) : 0;
    }

    // 轴名跟着轴线实际位置走。每个标签 = 该线所在位置的平均值：
    //   竖轴那条线在 x = 下单均值 → 标签挂竖轴顶端，写 YTD平均下单
    //   横轴那条线在 y = 回输均值 → 标签挂横轴右端，写 YTD平均回输
    function paintAxisNames() {
        if (!ALL.S) return;
        var W = el.clientWidth, H = el.clientHeight;
        if (!W || !H) return;
        var bx = axisBounds(ALL.maxO), by = axisBounds(ALL.maxR);
        var fx = axisFrac(ALL.S.avgO, bx.min, bx.max);
        var fy = axisFrac(ALL.S.avgR, by.min, by.max);
        var px = GRID.left + fx * (W - GRID.left - GRID.right);
        var py = GRID.top + (1 - fy) * (H - GRID.top - GRID.bottom);
        $('#p22axY').text('YTD平均下单 ' + ALL.S.avgO.toFixed(1)).css({
            left: Math.round(Math.min(px + 8, W - GRID.right - 130)),
            top: Math.round(GRID.top + 6)
        });
        $('#p22axX').text('YTD平均回输 ' + ALL.S.avgR.toFixed(1)).css({
            right: Math.round(GRID.right + 10),
            top: Math.round(py - 20)
        });
    }

    function buildOption(visible, S, maxO, maxR, animate) {
        // 两条轴线：用 markLine 画（线性 / 对数轴都支持），带箭头，位置 = 两个平均值
        var axO = logMode ? Math.max(S.avgO, LOG_MIN) : S.avgO;
        var axR = logMode ? Math.max(S.avgR, LOG_MIN) : S.avgR;
        var guide = {
            name: '__guide', type: 'scatter', data: [], silent: true, z: -1,
            markLine: {
                silent: true, symbol: ['none', 'arrow'], symbolSize: 9, animation: false,
                lineStyle: { color: AXIS_LINE, width: 1, type: 'solid' },
                label: { show: false },
                data: [{ xAxis: axO }, { yAxis: axR }]
            }
        };
        var byTier = {}; TIERS.forEach(function (t) { byTier[t.name] = []; });
        visible.forEach(function (r) { (byTier[r.coe] || byTier.Others).push(toPoint(r)); });

        var series = [guide];
        DRAW_ORDER.forEach(function (tn) {
            var t = TIERS.filter(function (x) { return x.name === tn; })[0];
            series.push({
                name: tn, type: 'scatter',
                symbol: t.symbol, symbolSize: 12,
                itemStyle: { color: C_NA },
                emphasis: { itemStyle: { borderColor: '#4fe3ff', borderWidth: 2 } },
                data: byTier[tn]
            });
        });

        // 坐标轴本身不画（轴线由 markLine 提供，轴名由 HTML 贴着轴线放），只承载线性/对数刻度
        function ax(maxV) {
            var b = axisBounds(maxV);
            var o = {
                type: logMode ? 'log' : 'value',
                show: false, min: b.min, max: b.max,
                axisLine: { show: false }, axisTick: { show: false },
                axisLabel: { show: false }, splitLine: { show: false }
            };
            if (logMode) o.logBase = 10;
            return o;
        }

        return {
            backgroundColor: 'transparent',
            animation: animate !== false,
            animationDuration: 400,
            grid: { left: GRID.left, right: GRID.right, top: GRID.top, bottom: GRID.bottom, containLabel: false },
            xAxis: ax(maxO),
            yAxis: ax(maxR),
            legend: {
                left: 'center', top: 12, itemWidth: 12, itemHeight: 12, itemGap: 18,
                selectedMode: false,
                textStyle: { color: 'rgba(255,255,255,.7)', fontSize: 12 },
                data: TIERS.map(function (t) { return { name: t.name, icon: t.symbol, itemStyle: { color: 'rgba(255,255,255,.7)' } }; })
            },
            tooltip: {
                trigger: 'item', triggerOn: 'mousemove|click',
                backgroundColor: 'rgba(2,24,61,.94)',
                borderColor: 'rgba(47,137,207,.8)',
                borderWidth: 1,
                padding: 0,
                extraCssText: 'box-shadow:0 0 20px rgba(47,137,207,.4);border-radius:8px;',
                formatter: tipHTML,
                position: tipPos
            },
            series: series
        };
    }

    function matches(row) {
        if (tierSel !== '__all' && row.coe !== tierSel) return false;      // 医院类型
        if (amSel !== '__all' && row.amsO.indexOf(amSel) < 0) return false; // 下单 AM
        if (!query) return true;
        return row.hosp.toLowerCase().indexOf(query.toLowerCase()) >= 0;   // 医院名称
    }

    // AM 下拉：只列当前时间窗内「有过下单」的 AM；换年月后尽量保留已选值
    function fillAM(rows) {
        var set = {};
        rows.forEach(function (r) { r.amsO.forEach(function (a) { set[a] = true; }); });
        var list = Object.keys(set).sort();
        var h = '<option value="__all">全部 AM</option>';
        list.forEach(function (a) { h += '<option value="' + a + '">' + a + '</option>'; });
        $('#p22AM').html(h);
        var keep = list.indexOf(amSel) >= 0 ? amSel : '__all';
        $('#p22AM').val(keep);
        amSel = keep;
    }

    // recompute=false：只按搜索/AM/坐标类型重绘（轴范围沿用全量，保持不动）
    function redraw(recompute, animate) {
        var y = parseInt($('#p22y').val(), 10), m = parseInt($('#p22m').val(), 10);
        if (!y || !m) return;
        closeQuad(); // 象限成员会变，浮窗先关掉避免显示旧数据
        if (recompute !== false) {
            ALL.rows = currentRows(y, m);
            ALL.S = stats(ALL.rows);
            ALL.maxO = 1; ALL.maxR = 1;
            ALL.rows.forEach(function (r) {
                if (r.o > ALL.maxO) ALL.maxO = r.o;
                if (r.r > ALL.maxR) ALL.maxR = r.r;
            });
            fillAM(ALL.rows);
        }
        var vis = ALL.rows.filter(matches);
        $('#p22Cnt').html('匹配 <b>' + vis.length + '</b> / 共 ' + ALL.rows.length + ' 家');
        $('#p22Avg').html('两轴交点 下单 <b>' + ALL.S.avgO.toFixed(1) + '</b> · 回输 <b>' + ALL.S.avgR.toFixed(1) + '</b>');
        paintBadges(vis, ALL.S);
        chart.setOption(buildOption(vis, ALL.S, ALL.maxO, ALL.maxR, animate), true);
        paintAxisNames();
    }

    var yearKeys = {};
    Object.keys(HOSP).forEach(function (k) { yearKeys[k.slice(0, 4)] = true; });
    initPtTime('#p22y', '#p22m', yearKeys, function () { redraw(true, true); });

    $('#p22Search').on('input', function () {
        query = String(this.value || '').trim();
        redraw(false, false);
    });
    $('#p22Clear').on('click', function () {
        $('#p22Search').val('');
        query = '';
        redraw(false, false);
    });
    $('#p22AM').on('change', function () {
        amSel = $(this).val() || '__all';
        redraw(false, false);
    });
    $('#p22tier').on('change', function () {
        tierSel = $(this).val() || '__all';
        redraw(false, false);
    });
    $('#p22scale').on('change', function () {
        logMode = $(this).val() === 'log';
        redraw(false, false);
    });

    // 角标点击 → 象限明细浮窗；× / 点遮罩 / Esc 关闭
    $('.p22-q').on('click', function () { openQuad($(this).data('q')); });
    $('#p22PopClose').on('click', closeQuad);
    $('#p22Pop').on('click', function (e) { if (e.target === this) closeQuad(); });
    $(document).on('keydown', function (e) {
        if (e.key === 'Escape' && $('#p22Pop').is(':visible')) closeQuad();
    });

    redraw(true, true);
});
