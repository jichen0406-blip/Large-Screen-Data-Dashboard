// Page2 渲染逻辑：年份切换 + 4卡片 + 海外患者地图（热力+飞线+中国标记）+ 海外商业化地图（辐射圆点+Top10浮窗）
// 数据：BOARD_DATA.P2（build_data.js 生成）
function countUp2(el, target, dur) {
    if (!el) return;
    target = parseInt(target, 10) || 0;
    dur = dur || 800;
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

$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.P2) return;
    var P2 = B.P2;
    var curYear = 'all';

    // 英文区域名 → 中文（注册地图时直接改名，避开 ECharts4 map 系列不支持 nameMap 匹配的问题）
    var NAME_MAP = {
        'China': '中国', 'New Zealand': '新西兰', 'Singapore': '新加坡', 'Thailand': '泰国',
        'Canada': '加拿大', 'Philippines': '菲律宾', 'Russia': '俄罗斯', 'United Kingdom': '英国',
        'Indonesia': '印尼', 'South Africa': '南非', 'Switzerland': '瑞士', 'United States': '美国',
        'Kyrgyzstan': '吉尔吉斯斯坦', 'Germany': '德国', 'France': '法国', 'Lao PDR': '老挝',
        'India': '印度', 'Lithuania': '立陶宛'
    };
    if (!window.WORLD_GEO) return;

    // 把英文区域名改名为中文后注册（台湾/香港/澳门已是中文），并补 cp 标签锚点
    // 锚点用"最大外环坐标平均中心"：多岛国家（如新西兰）/跨反经线国家不会把中心算到海里去
    var worldGeo = JSON.parse(JSON.stringify(window.WORLD_GEO));
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
    worldGeo.features.forEach(function (f) {
        if (NAME_MAP[f.properties.name]) f.properties.name = NAME_MAP[f.properties.name];
        f.properties.cp = regionAnchor(f.geometry.coordinates);
    });
    echarts.registerMap('world', worldGeo);

    // 各国质心（飞线端点/轮播定位，与标签锚点一致）
    var centroids = {};
    worldGeo.features.forEach(function (f) {
        if (f.properties.cp) centroids[f.properties.name] = f.properties.cp;
    });

    // 年份按钮（全部 + 数据实际年份，2027 等自动出现）
    var yearsHtml = '<span class="p2y-label">数据年份</span><div class="p2y-btns"><button type="button" class="p2y-btn active" data-y="all">全部</button>';
    P2.YEARS.forEach(function (y) {
        yearsHtml += '<button type="button" class="p2y-btn" data-y="' + y + '">' + y + '</button>';
    });
    yearsHtml += '</div>';
    $('#p2years').html(yearsHtml);

    function agg(obj) { return curYear === 'all' ? obj.all : (obj.y[curYear] || {}); }
    function cardData() {
        return curYear === 'all' ? P2.CARD.all : (P2.CARD.y[curYear] || { npO: 0, npR: 0, dO: 0, dR: 0 });
    }
    function renderCards() {
        var c = cardData();
        countUp2(document.getElementById('p2npO'), c.npO);
        countUp2(document.getElementById('p2npR'), c.npR);
        countUp2(document.getElementById('p2dO'), c.dO);
        countUp2(document.getElementById('p2dR'), c.dR);
    }

    // 热力色阶
    function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function rampColor(v, max) {
        var ramp = ['#0a2a4a', '#1b6bb0', '#22c1e3', '#7bed9f', '#ffeb7b'];
        var t = max > 0 ? v / max : 0;
        var pos = Math.min(ramp.length - 1, t * (ramp.length - 1));
        var i = Math.floor(pos), f = pos - i;
        var a = hexToRgb(ramp[i]), b = hexToRgb(ramp[Math.min(i + 1, ramp.length - 1)]);
        return 'rgba(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ',0.78)';
    }

    function buildMapData(countries) {
        var data = [], names = [];
        Object.keys(countries).forEach(function (zh) {
            var o = (countries[zh] && countries[zh].o) || 0;
            var r = (countries[zh] && countries[zh].r) || 0;
            if (o + r <= 0) return;
            if (!centroids[zh]) return;
            data.push({ name: zh, value: o + r, o: o, r: r });
            names.push(zh);
        });
        return { data: data, names: names };
    }

    // 地图：左(海外患者)=热力+飞线+中国标记；右(海外商业化)=圆点向外辐射
    function mapOption(md, withLines, radiate) {
        var data = md.data;
        var max = 0;
        data.forEach(function (d) { if (d.value > max) max = d.value; });
        var regions = radiate ? [] : data.map(function (d) {
            return {
                name: d.name,
                label: { show: true, fontSize: 9, color: 'rgba(255,255,255,.85)' },
                itemStyle: { areaColor: rampColor(d.value, max) }
            };
        });
        var scatterData = data.map(function (d) {
            var c = centroids[d.name];
            return { name: d.name, value: c.concat(d.value), o: d.o, r: d.r };
        });
        var series = [];
        if (radiate) {
            // 海外商业化：圆点向外辐射
            series.push({
                name: '国家销量',
                type: 'effectScatter',
                coordinateSystem: 'geo',
                data: scatterData,
                symbolSize: function (val) { return Math.max(10, Math.min(26, 8 + Math.round(val[2] * 0.5))); },
                rippleEffect: { show: true, brushType: 'stroke', scale: 3, period: 3 },
                zlevel: 3,
                label: { normal: { show: true, formatter: '{b}', fontSize: 9, color: 'rgba(255,255,255,.85)', position: 'right' }, emphasis: { show: true, fontSize: 11 } },
                itemStyle: { normal: { color: '#00d4ff' } }
            });
        } else {
            // 不可见散点：仅作 visualMap 图例锚点（热力色在 regions 里已手算），不显示
            series.push({
                name: '国家销量',
                type: 'effectScatter',
                coordinateSystem: 'geo',
                data: scatterData,
                symbolSize: 1,
                rippleEffect: { show: false },
                zlevel: 3,
                itemStyle: { normal: { color: 'rgba(0,212,255,0)' } },
                label: { normal: { show: false }, emphasis: { show: false } }
            });
            var linesData = [];
            var chinaC = centroids['中国'];
            if (withLines && chinaC) {
                data.forEach(function (d) {
                    if (d.name === '中国') return;
                    var c = centroids[d.name];
                    if (c) linesData.push([{ coord: c }, { coord: chinaC }]);
                });
            }
            if (withLines && linesData.length) {
                series.push({
                    name: '飞线', type: 'lines', coordinateSystem: 'geo', zlevel: 2,
                    effect: { show: true, period: 4, trailLength: 0, symbol: 'circle', symbolSize: 4, color: '#fff' },
                    lineStyle: { normal: { color: '#22c1e3', width: 1, opacity: 0.5, curveness: 0.25 } },
                    data: linesData
                });
            }
            // 中国中心标记：圆圈向外辐射光圈
            if (withLines && chinaC) {
                series.push({
                    name: '中国工厂',
                    type: 'effectScatter',
                    coordinateSystem: 'geo',
                    zlevel: 4,
                    data: [{ name: '中国驯鹿', value: chinaC.concat([0]) }],
                    symbol: 'circle',
                    symbolSize: 14,
                    rippleEffect: { show: true, brushType: 'stroke', scale: 4, period: 3 },
                    label: {
                        normal: { show: true, formatter: '中国驯鹿', position: 'right', distance: 6, fontSize: 9, color: 'rgba(255,255,255,.85)' },
                        emphasis: { show: true, fontSize: 11 }
                    },
                    itemStyle: { normal: { color: '#00d4ff' } }
                });
            }
        }
        var option = {
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(2,24,61,.94)',
                borderColor: 'rgba(47,137,207,.8)',
                borderWidth: 1,
                padding: 0,
                extraCssText: 'box-shadow:0 0 20px rgba(47,137,207,.4);border-radius:8px;',
                formatter: function (p) {
                    if (!p.data || !p.data.name) return '';
                    return '<div style="font-size:14px;color:#fff;font-weight:700;padding:10px 14px 6px;border-bottom:1px solid rgba(47,137,207,.5);letter-spacing:1px;">' + p.data.name + '</div>' +
                        '<div style="padding:8px 14px 12px;font-size:13px;">' +
                        '<div style="line-height:22px;color:rgba(255,255,255,.85);">下单：<span style="color:#2f89cf;font-weight:700;font-size:15px;">' + (p.data.o || 0) + '</span> 单</div>' +
                        '<div style="line-height:22px;color:rgba(255,255,255,.85);">回输：<span style="color:#62c98d;font-weight:700;font-size:15px;">' + (p.data.r || 0) + '</span> 单</div>' +
                        '</div>';
                }
            },
            geo: {
                map: 'world',
                roam: false,
                zoom: 1.1,
                silent: false,
                regions: regions,
                label: { normal: { show: false }, emphasis: { show: false } },
                itemStyle: {
                    normal: { areaColor: 'rgba(2,37,101,.55)', borderColor: 'rgba(112,187,252,.45)' },
                    emphasis: { areaColor: 'rgba(47,137,207,.7)' }
                }
            },
            series: series
        };
        if (!radiate) {
            option.visualMap = {
                type: 'continuous', min: 0, max: max || 1, seriesIndex: 0,
                left: 12, bottom: 12, itemWidth: 12, itemHeight: 90,
                text: ['高', '低'], textStyle: { color: 'rgba(255,255,255,.7)', fontSize: 10 },
                inRange: { color: ['#0a2a4a', '#1b6bb0', '#22c1e3', '#7bed9f', '#ffeb7b'] }
            };
        }
        return option;
    }

    var leftChart = echarts.init(document.getElementById('p2mapL'));
    var rightChart = echarts.init(document.getElementById('p2mapR'));

    // 轮播（按纬度北→南），tooltip 卡片展示该区域下单/回输
    function startAuto(chart, md) {
        chart._p2paused = false;
        clearInterval(chart._p2timer);
        var names = md.names;
        if (!names.length) return;
        chart._p2names = names;
        var order = names.slice().sort(function (a, b) {
            return (centroids[b] ? centroids[b][1] : 0) - (centroids[a] ? centroids[a][1] : 0);
        });
        var idx = 0, tipTimer = null;
        function hideTip() {
            chart.dispatchAction({ type: 'hideTip' });
            chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
        }
        function next() {
            if (chart._p2paused) return;
            var zh = order[idx % order.length];
            idx++;
            var di = chart._p2names.indexOf(zh);
            if (di >= 0) {
                chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: di });
                chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: di });
            }
            clearTimeout(tipTimer);
            tipTimer = setTimeout(hideTip, 3000);
        }
        chart._p2timer = setInterval(next, 5000);
        setTimeout(next, 2000);
        $(chart.getDom()).off('mouseenter.p2 mouseleave.p2')
            .on('mouseenter.p2', function () { chart._p2paused = true; })
            .on('mouseleave.p2', function () { chart._p2paused = false; });
    }

    function renderMaps() {
        var lmd = buildMapData(agg(P2.LEFT));
        var rmd = buildMapData(agg(P2.RIGHT));
        leftChart.setOption(mapOption(lmd, true, false), true);
        rightChart.setOption(mapOption(rmd, false, true), true);
        startAuto(rightChart, rmd);
        renderTables();
    }

    // 国家 → 洲（表格分类展示）
    var CONTINENT = {
        '中国': '亚洲', '香港': '亚洲', '台湾': '亚洲', '澳门': '亚洲', '新加坡': '亚洲', '泰国': '亚洲',
        '菲律宾': '亚洲', '老挝': '亚洲', '印度': '亚洲', '印尼': '亚洲', '吉尔吉斯斯坦': '亚洲',
        '英国': '欧洲', '德国': '欧洲', '法国': '欧洲', '瑞士': '欧洲', '立陶宛': '欧洲', '俄罗斯': '欧洲',
        '美国': '美洲', '加拿大': '美洲',
        '新西兰': '大洋洲', '南非': '非洲'
    };

    // 地图明细表格：大洲合并同类，先按大洲合计下单降序，洲内按国家/区域下单降序；固定 15 行，不足补空白
    function fillTbl(id, countries) {
        var items = Object.keys(countries).map(function (zh) {
            var v = countries[zh] || {};
            return { name: zh, con: CONTINENT[zh] || '其他', o: v.o || 0, r: v.r || 0 };
        }).filter(function (x) { return x.o + x.r > 0; });
        var html = '', trCount = 0;
        if (!items.length) {
            html = '<tr><td colspan="4" class="p2-tbl-empty">暂无数据</td></tr>';
            trCount = 1;
        } else {
            var groups = {};
            items.forEach(function (x) { (groups[x.con] = groups[x.con] || []).push(x); });
            var conOrder = Object.keys(groups).sort(function (a, b) {
                var sa = groups[a].reduce(function (s, x) { return s + x.o; }, 0);
                var sb = groups[b].reduce(function (s, x) { return s + x.o; }, 0);
                return sb - sa;
            });
            conOrder.forEach(function (con) {
                var list = groups[con].slice().sort(function (a, b) { return b.o - a.o; });
                html += '<tr><td rowspan="' + list.length + '" class="p2-tbl-con">' + con + '</td><td>' + list[0].name + '</td><td>' + list[0].o + '</td><td>' + list[0].r + '</td></tr>';
                trCount++;
                for (var i = 1; i < list.length; i++) {
                    html += '<tr><td>' + list[i].name + '</td><td>' + list[i].o + '</td><td>' + list[i].r + '</td></tr>';
                    trCount++;
                }
            });
        }
        for (var b = trCount; b < 10; b++) html += '<tr class="p2-tbl-blank"><td colspan="4">&nbsp;</td></tr>';
        $('#' + id).html(html);
    }
    function renderTables() { fillTbl('p2tblL', agg(P2.LEFT)); fillTblRight('p2tblR', agg(P2.RIGHTD)); setupTblAutoScroll(); }

    // 左侧表格自动滚动（参照 page1：复制 tbody 一份无缝回绕，80ms/1px，悬停暂停）
    var tblTimer = null;
    function setupTblAutoScroll() {
        if (tblTimer) { clearInterval(tblTimer); tblTimer = null; }
        var el = $('#p2tblL').closest('.p2-tbl-wrap')[0];
        var tbody = document.getElementById('p2tblL');
        if (!el || !tbody) return;
        if (el.scrollHeight <= el.clientHeight) return;
        var oneCopyH = tbody.offsetHeight;
        tbody.innerHTML += tbody.innerHTML;
        function tick() { el.scrollTop += 1; if (el.scrollTop >= oneCopyH) el.scrollTop -= oneCopyH; }
        function start() { if (!tblTimer) tblTimer = setInterval(tick, 80); }
        function stop() { clearInterval(tblTimer); tblTimer = null; }
        start();
        $(el).off('mouseenter.p2tbl mouseleave.p2tbl').on('mouseenter.p2tbl', stop).on('mouseleave.p2tbl', start);
    }

    // 右侧表格：国家 × 导流分类（医生导流/OB导流/NPP/商业化），大洲/国家合并，固定 15 行
    function fillTblRight(id, countryCat) {
        var items = [];
        Object.keys(countryCat).forEach(function (c) {
            Object.keys(countryCat[c] || {}).forEach(function (cat) {
                var v = countryCat[c][cat] || {};
                var o = v.o || 0, r = v.r || 0;
                if (o + r > 0) items.push({ name: c, con: CONTINENT[c] || '其他', cat: cat, o: o, r: r });
            });
        });
        var html = '', trCount = 0;
        if (!items.length) {
            html = '<tr><td colspan="5" class="p2-tbl-empty">暂无数据</td></tr>';
            trCount = 1;
        } else {
            var groups = {};
            items.forEach(function (x) { (groups[x.con] = groups[x.con] || []).push(x); });
            var conOrder = Object.keys(groups).sort(function (a, b) {
                var sa = groups[a].reduce(function (s, x) { return s + x.o; }, 0);
                var sb = groups[b].reduce(function (s, x) { return s + x.o; }, 0);
                return sb - sa;
            });
            conOrder.forEach(function (con) {
                var allList = groups[con].slice().sort(function (a, b) { return b.o - a.o; });
                var byCountry = {};
                allList.forEach(function (x) { (byCountry[x.name] = byCountry[x.name] || []).push(x); });
                var names = Object.keys(byCountry).sort(function (a, b) {
                    var sa = byCountry[a].reduce(function (s, x) { return s + x.o; }, 0);
                    var sb = byCountry[b].reduce(function (s, x) { return s + x.o; }, 0);
                    return sb - sa;
                });
                var first = true;
                names.forEach(function (cname) {
                    var clist = byCountry[cname].slice().sort(function (a, b) { return b.o - a.o; });
                    var conTd = first ? '<td rowspan="' + allList.length + '" class="p2-tbl-con">' + con + '</td>' : '';
                    html += '<tr>' + conTd + '<td rowspan="' + clist.length + '">' + cname + '</td><td>' + clist[0].cat + '</td><td>' + clist[0].o + '</td><td>' + clist[0].r + '</td></tr>';
                    trCount++;
                    first = false;
                    for (var i = 1; i < clist.length; i++) {
                        html += '<tr><td>' + clist[i].cat + '</td><td>' + clist[i].o + '</td><td>' + clist[i].r + '</td></tr>';
                        trCount++;
                    }
                });
            });
        }
        for (var b = trCount; b < 10; b++) html += '<tr class="p2-tbl-blank"><td colspan="5">&nbsp;</td></tr>';
        $('#' + id).html(html);
    }

    // 年份切换
    $('#p2years').on('click', 'button', function () {
        curYear = $(this).data('y');
        $('#p2years .p2y-btn').removeClass('active');
        $(this).addClass('active');
        $('#p2PanelMask').hide();
        renderCards();
        renderMaps();
    });

    // Top10 浮窗（右侧海外商业化地图点击区域或散点）
    function chartPause(chart) { chart._p2paused = true; clearInterval(chart._p2timer); }
    function openTop10(zh) {
        var top = curYear === 'all' ? P2.TOP10.all : (P2.TOP10.y[curYear] || {});
        var d = top[zh];
        $('#p2Title').text(zh + ' · 海外商业化');
        function fill(id, list) {
            if (!list || !list.length) { $('#' + id).html('<li class="prov-rank-empty">暂无数据</li>'); return; }
            var html = '';
            list.forEach(function (h, i) {
                html += '<li><span class="rk">' + (i + 1) + '</span><span class="hn" title="' + h.name + '">' + h.name + '</span><span class="hc">' + h.v + '</span></li>';
            });
            $('#' + id).html(html);
        }
        fill('p2RankO', d ? d.o : null);
        fill('p2RankR', d ? d.r : null);
        $('#p2PanelMask').show();
        chartPause(rightChart);
    }
    // 海外患者地图：不轮播，鼠标移入区域展示该国家下单/回输，移开隐藏
    var tipEl = null;
    function hideClickTip() { if (tipEl) tipEl.hide(); }
    function showClickTip(zh, o, r, x, y) {
        if (!tipEl) tipEl = $('<div class="p2-click-tip" id="p2ClickTip"></div>').appendTo($('#p2mapL').parent());
        tipEl.html('<div class="p2ct-name">' + zh + '</div><div>下单：<span style="color:#2f89cf;font-weight:700">' + o + '</span> 单</div><div>回输：<span style="color:#62c98d;font-weight:700">' + r + '</span> 单</div>');
        tipEl.css({ left: (x + 14) + 'px', top: (y + 14) + 'px' }).show();
    }
    leftChart.on('mouseover', function (params) {
        var zh = (params.seriesType === 'effectScatter' && params.data) ? params.data.name : (params.componentType === 'geo' ? params.name : null);
        if (!zh) return;
        var data = (curYear === 'all' ? P2.LEFT.all : (P2.LEFT.y[curYear] || {}))[zh];
        if (!data) return;
        var evt = params.event, x = 200, y = 120;
        if (evt && evt.offsetX != null) { x = evt.offsetX; y = evt.offsetY; }
        showClickTip(zh, data.o || 0, data.r || 0, x, y);
    });
    leftChart.on('mouseout', function (params) {
        if (params && params.componentType === 'geo') hideClickTip();
    });
    rightChart.on('click', function (params) {
        var zh = (params.seriesType === 'effectScatter' && params.data) ? params.data.name : (params.componentType === 'geo' ? params.name : null);
        if (!zh) return;
        var has = (curYear === 'all' ? P2.RIGHT.all : (P2.RIGHT.y[curYear] || {}))[zh];
        if (has) openTop10(zh);
    });
    $('#p2Close').on('click', function () {
        $('#p2PanelMask').hide();
        startAuto(rightChart, buildMapData(agg(P2.RIGHT)));
    });
    $('#p2PanelMask').on('click', function (e) { if (e.target === this) $('#p2Close').trigger('click'); });

    $('#p2Upd').text(B.UPDATED || '--');
    renderCards();
    renderMaps();
    window.addEventListener('resize', function () { leftChart.resize(); rightChart.resize(); });
    // 地图放大全屏时暂停右侧图轮播，关闭恢复（左侧海外导流图本身不轮播）
    $(document).on('boardfs', function (e, d) {
        if (d && d.active) { chartPause(rightChart); }
        else { startAuto(rightChart, buildMapData(agg(P2.RIGHT))); }
    });
});
