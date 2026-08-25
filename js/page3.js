// Page3 渲染逻辑：全球注册进度 —— 世界地图（状态着色 + 合作伙伴 icon）+ 甘特图（时间轴进度条）
// 数据：BOARD_DATA.REG（build_data.js 生成）
$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.REG || !B.REG.items || !B.REG.items.length) return;
    var REG = B.REG;
    var items = REG.items;

    // 4 种申报状态色（深色大屏底）
    var STATUS_COLOR = {
        'planned': '#5b7fae',   // 计划中 = 灰蓝
        'submitted': '#ffb800', // 已提交 = 金黄
        'review': '#ff7a45',    // 评审中 = 橙
        'approved': '#37d67a'   // 已获批 = 绿
    };

    // 显示名：澳门/香港 去掉"中国"前缀，其余用原始中文名（地图 label / 浮窗 / 右侧名单一致）
    var DISP = { '中国澳门': '澳门', '中国香港': '香港' };
    function dispName(it) { return DISP[it.name] || it.name; }
    var labelToItem = {};
    items.forEach(function (it) { labelToItem[dispName(it)] = it; });

    if (!window.WORLD_GEO) return;

    // 质心（复用 page2 的"最大外环坐标平均中心"算法，避免多岛/跨反经线国家中心漂到海上）
    function regionAnchor(coords) {
        var polys;
        if (coords[0] && coords[0][0] && typeof coords[0][0][0] === 'number') polys = [coords];
        else polys = coords;
        var best = null, bestN = 0;
        polys.forEach(function (p) {
            if (p && p.length && p[0].length > bestN) {
                bestN = p[0].length;
                var lon = 0, lat = 0;
                p[0].forEach(function (pt) { lon += pt[0]; lat += pt[1]; });
                best = [lon / p[0].length, lat / p[0].length];
            }
        });
        return best;
    }
    // 复制 GeoJSON 并把 16 国 feature 名改为中文（page2 同款做法），地图 label 直接显示中文
    var labelOfGeo = {};
    items.forEach(function (it) { labelOfGeo[it.geo] = dispName(it); });
    var worldGeo = JSON.parse(JSON.stringify(window.WORLD_GEO));
    var centroids = {};
    worldGeo.features.forEach(function (f) {
        if (f.properties && f.properties.name) {
            var zh = labelOfGeo[f.properties.name];
            if (zh) f.properties.name = zh;
            f.properties.cp = regionAnchor(f.geometry.coordinates);
            centroids[f.properties.name] = f.properties.cp;
        }
    });
    echarts.registerMap('world', worldGeo);

    // ============ Dashboard1：世界地图 ============
    // 合作伙伴 icon：images/合作伙伴.png（200×200 方形）。名称在上、icon 在下（label position:top）
    var PARTNER_ICON = 'image://images/合作伙伴.png';

    // 合作伙伴 / 自营分组（拆成两个 series 用静态 symbol，避开 ECharts 4.0.5 函数 symbol 的兼容缺口）
    var partnerItems = items.filter(function (it) { return it.mode === '授权合作伙伴'; });
    var selfItems = items.filter(function (it) { return it.mode !== '授权合作伙伴'; });

    function seriesIndexOf(it) { return (it.mode === '授权合作伙伴') ? 0 : 1; }

    function buildMap() {
        var regions = items.map(function (it) {
            var isPartner = (it.mode === '授权合作伙伴');
            return {
                name: dispName(it),
                itemStyle: { areaColor: STATUS_COLOR[it.status] },
                // 合作伙伴：关闭区域 label（名称改由散点 label 显示在 icon 左侧，icon 落在名称右侧）
                label: { normal: { show: !isPartner, color: '#fff', fontSize: 9 } }
            };
        });
        // 散点：合作伙伴显示 group 图标；自营完全透明（仅作 tooltip 锚点，不显示任何圆/边框）
        function scatterD(list) {
            return list.map(function (it) {
                var c = centroids[dispName(it)] || [0, 0];
                return { name: dispName(it), value: c.concat([1]), item: it };
            });
        }
        var partnerData = scatterD(partnerItems);
        var selfData = scatterD(selfItems);
        var option = {
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(2,24,61,.94)',
                borderColor: 'rgba(47,137,207,.8)',
                borderWidth: 1,
                padding: 0,
                extraCssText: 'box-shadow:0 0 20px rgba(47,137,207,.4);border-radius:8px;',
                formatter: function (p) {
                    var it = (p.data && p.data.item) ? p.data.item : labelToItem[p.name];
                    if (!it) return '';
                    var ap = it.approvalTxt || 'TBD';
                    return '<div style="font-size:14px;color:#fff;font-weight:700;padding:10px 14px 6px;border-bottom:1px solid rgba(47,137,207,.5);letter-spacing:1px;">' + dispName(it) + '</div>' +
                        '<div style="padding:8px 14px 12px;font-size:13px;">' +
                        '<div style="line-height:22px;color:rgba(255,255,255,.85);">申报状态：<span style="color:' + STATUS_COLOR[it.status] + ';font-weight:700;">' + it.statusLabel + '</span></div>' +
                        '<div style="line-height:22px;color:rgba(255,255,255,.85);">申报路径/资格认定：<span style="color:#9fd3ff;">' + (it.path || '—') + '</span></div>' +
                        '<div style="line-height:22px;color:rgba(255,255,255,.85);">获批时间：<span style="color:#62c98d;font-weight:700;">' + ap + '</span></div>' +
                        '</div>';
                }
            },
            geo: {
                map: 'world',
                roam: false,
                zoom: 1.15,
                regions: regions,
                itemStyle: {
                    normal: { areaColor: 'rgba(2,37,101,.55)', borderColor: 'rgba(112,187,252,.45)' },
                    emphasis: { areaColor: 'rgba(47,137,207,.7)' }
                }
            },
            series: [{
                name: '授权合作伙伴',
                type: 'scatter',
                coordinateSystem: 'geo',
                zlevel: 3,
                data: partnerData,
                symbol: PARTNER_ICON,
                symbolSize: 18,
                label: {
                    normal: {
                        show: true,
                        position: 'top',
                        distance: 5,
                        formatter: function (p) { var it = p.data && p.data.item; return it ? dispName(it) : p.name; },
                        color: '#fff',
                        fontSize: 9
                    },
                    emphasis: { show: false }
                }
            }, {
                name: '自营',
                type: 'scatter',
                coordinateSystem: 'geo',
                zlevel: 3,
                data: selfData,
                symbol: 'circle',
                symbolSize: 14,
                itemStyle: { normal: { color: 'rgba(0,0,0,0)', borderColor: 'rgba(0,0,0,0)', borderWidth: 0 } },
                label: { normal: { show: false }, emphasis: { show: false } }
            }]
        };
        return option;
    }

    var mapChart = echarts.init(document.getElementById('p3rmap'), null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
    mapChart.setOption(buildMap());

    // hover 国家区域 → 触发对应散点的 tooltip（自营散点完全透明，靠 geo 区域 hover 唤起）
    mapChart.on('mouseover', function (params) {
        if (params.componentType !== 'geo') return;
        var it = labelToItem[params.name];
        if (!it) return;
        var si = seriesIndexOf(it);
        var di = (si === 0 ? partnerItems : selfItems).indexOf(it);
        if (di >= 0) mapChart.dispatchAction({ type: 'showTip', seriesIndex: si, dataIndex: di });
    });
    mapChart.on('mouseout', function (params) {
        if (params.componentType === 'geo') mapChart.dispatchAction({ type: 'hideTip' });
    });

    // 轮播：按纬度北→南依次展示各申报国浮窗（悬停暂停，移出恢复；全屏暂停）
    function chartPause(ch) { ch._p3paused = true; clearInterval(ch._p3timer); }
    function startAuto(ch) {
        ch._p3paused = false;
        clearInterval(ch._p3timer);
        var order = items.slice().sort(function (a, b) {
            var ca = centroids[dispName(a)] || [0, 0];
            var cb = centroids[dispName(b)] || [0, 0];
            return cb[1] - ca[1];
        });
        var idx = 0, tipTimer = null;
        function hideTip() { ch.dispatchAction({ type: 'hideTip' }); }
        function next() {
            if (ch._p3paused) return;
            var it = order[idx % order.length];
            idx++;
            var si = seriesIndexOf(it);
            var di = (si === 0 ? partnerItems : selfItems).indexOf(it);
            if (di >= 0) ch.dispatchAction({ type: 'showTip', seriesIndex: si, dataIndex: di });
            clearTimeout(tipTimer);
            tipTimer = setTimeout(hideTip, 3000);
        }
        ch._p3timer = setInterval(next, 5000);
        setTimeout(next, 1200);
        $(ch.getDom()).off('mouseenter.p3 mouseleave.p3')
            .on('mouseenter.p3', function () { ch._p3paused = true; })
            .on('mouseleave.p3', function () { ch._p3paused = false; });
    }
    startAuto(mapChart);
    $(document).on('boardfs', function (e, d) {
        if (d && d.active) chartPause(mapChart);
        else startAuto(mapChart);
    });

    // 图例（状态色 + 合作伙伴）
    function renderLegend() {
        var order = [['approved', '已获批'], ['review', '评审中'], ['submitted', '已提交'], ['planned', '计划中']];
        var html = '';
        order.forEach(function (o) {
            html += '<span class="p3r-lg"><i style="background:' + STATUS_COLOR[o[0]] + '"></i>' + o[1] + '</span>';
        });
        html += '<span class="p3r-lg"><i class="p3r-lg-ico"><img class="p3r-lg-partner" src="images/合作伙伴.png" alt=""></i>授权合作伙伴</span>';
        $('#p3rLegend').html(html);
    }
    renderLegend();

    // 右侧：已获批国家名单 + 获批时间（按获批时间从新到旧）
    function renderRight() {
        var appr = items.filter(function (it) { return it.status === 'approved'; })
            .sort(function (a, b) {
                var at = a.approvalTs || '0000';
                var bt = b.approvalTs || '0000';
                return at < bt ? 1 : at > bt ? -1 : 0;
            });
        var html = '<div class="p3r-appr-tit">已获批国家/地区<span class="p3r-appr-n">' + appr.length + '</span></div>' +
            '<ul class="p3r-appr-list">';
        appr.forEach(function (it) {
            html += '<li><span class="p3r-appr-name">' + dispName(it) + '</span>' +
                '<span class="p3r-appr-time">' + (it.approvalTxt || 'TBD') + '</span></li>';
        });
        html += '</ul>';
        $('#p3rRight').html(html);
    }
    renderRight();

    // ============ Dashboard2：甘特图 ============
    // 时间条均分 4 段=4 阶段（计划中/已提交/评审中/已获批）：从 2025 到获批时间（无获批拉 2028 底）；
    // 三色标记：已完成段绿、当前进行中段橙、未开始段灰（已获批全部绿）。
    // 表头季度刻度 2025Q1~2028Q4；左列固定（含申报状态、申报路径），获批时间最右侧固定列。
    function renderGantt() {
        var AXIS_START = new Date('2025-01-01').getTime();
        var AXIS_END = new Date('2028-12-31').getTime();
        var SPAN = AXIS_END - AXIS_START;
        function pct(ts) {
            var t = (ts < AXIS_START) ? AXIS_START : ((ts > AXIS_END) ? AXIS_END : ts);
            return ((t - AXIS_START) / SPAN * 100).toFixed(2);
        }
        var CUR_SEG = { planned: 0, submitted: 1, review: 2, approved: 3 };
        var PHASES = ['计划中', '已提交', '评审中', '已获批'];

        // 表头时间轴：两行刻度（年份 2025~2028 + 季度 Q1~Q4）
        var axisHtml = '<div class="p3r-gt-axis">';
        [2025, 2026, 2027, 2028].forEach(function (y) {
            axisHtml += '<span class="p3r-gt-yr" style="left:' + pct(new Date(y + '-01-01').getTime()) + '%">' + y + '</span>';
        });
        var y, q;
        for (y = 2025; y <= 2028; y++) {
            for (q = 1; q <= 4; q++) {
                var qs = new Date(y, (q - 1) * 3, 1).getTime();
                var qe = new Date(y, q * 3, 1).getTime();
                var w = parseFloat(pct(qe)) - parseFloat(pct(qs));
                axisHtml += '<span class="p3r-gt-q" style="left:' + pct(qs) + '%;width:' + w.toFixed(2) + '%">Q' + q + '</span>';
            }
        }
        axisHtml += '</div>';

        // 按区域分组（保持 REG.regions 顺序；中国为本上市展示项，甘特图不体现）
        var ganttItems = items.filter(function (it) { return it.name !== '中国'; });
        var groups = {};
        REG.regions.forEach(function (r) { groups[r] = []; });
        ganttItems.forEach(function (it) {
            if (!groups[it.region]) groups[it.region] = [];
            groups[it.region].push(it);
        });

        var head = '<thead><tr>' +
            '<th class="p3r-gt-reg">区域</th>' +
            '<th class="p3r-gt-name">国家/地区</th>' +
            '<th class="p3r-gt-mode">运营方式</th>' +
            '<th class="p3r-gt-status">申报状态</th>' +
            '<th class="p3r-gt-path">申报路径/资格认定</th>' +
            '<th class="p3r-gt-cell">' + axisHtml + '</th>' +
            '<th class="p3r-gt-time">获批时间</th>' +
            '</tr></thead>';
        var bodyRows = '';
        REG.regions.forEach(function (r) {
            var list = groups[r] || [];
            if (!list.length) return;
            list.forEach(function (it, idx) {
                var isTbd = !it.approvalTs;
                var endTs = isTbd ? AXIS_END : new Date(it.approvalTs).getTime();
                // 时间条均分 4 段：已完成绿、当前进行中橙、未开始灰；已获批全部绿
                var segs = '';
                for (var s = 0; s < 4; s++) {
                    var sStart = AXIS_START + (endTs - AXIS_START) * s / 4;
                    var sEnd = AXIS_START + (endTs - AXIS_START) * (s + 1) / 4;
                    var cls;
                    if (it.status === 'approved') cls = 'done';
                    else cls = (s < CUR_SEG[it.status]) ? 'done' : (s === CUR_SEG[it.status] ? 'current' : 'pending');
                    segs += '<div class="p3r-gt-seg ' + cls + '" ' +
                        'style="left:' + pct(sStart) + '%;width:' + (parseFloat(pct(sEnd)) - parseFloat(pct(sStart))).toFixed(2) + '%">' +
                        '<span class="p3r-gt-seg-txt">' + PHASES[s] + '</span></div>';
                }
                var modeHtml = (it.mode === '授权合作伙伴')
                    ? '<img class="p3r-gt-mode-ico" src="images/合作伙伴.png" alt="">' + it.mode
                    : it.mode;
                var regionTd = idx === 0 ? '<td class="p3r-gt-reg" rowspan="' + list.length + '">' + r + '</td>' : '';
                var timeHtml = isTbd
                    ? '<em class="p3r-gt-tbd">TBD</em>'
                    : '<em class="p3r-gt-end" style="color:' + STATUS_COLOR[it.status] + '">' + (it.approvalTxt || 'TBD') + '</em>';
                bodyRows += '<tr>' + regionTd +
                    '<td class="p3r-gt-name">' + it.name + '</td>' +
                    '<td class="p3r-gt-mode">' + modeHtml + '</td>' +
                    '<td class="p3r-gt-status" style="color:' + STATUS_COLOR[it.status] + '">' + it.statusLabel + '</td>' +
                    '<td class="p3r-gt-path">' + (it.path || '—') + '</td>' +
                    '<td class="p3r-gt-cell"><div class="p3r-gt-track">' + segs + '</div></td>' +
                    '<td class="p3r-gt-time">' + timeHtml + '</td></tr>';
            });
        });

        $('#p3rgantt').html('<table class="p3r-gt">' + head + '<tbody>' + bodyRows + '</tbody></table>');
    }
    renderGantt();

    $('#p3Upd').text(B.UPDATED || '--');
    window.addEventListener('resize', function () { mapChart.resize(); });
});
