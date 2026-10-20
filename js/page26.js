// Page26 渲染逻辑：China Solution 业务
//   时间区间 + 业务类型筛选 → 3 张卡片（目标 / 收入 / 达成）、世界地图（收入着色 + 业务 icon）、收入明细表
// 数据：BOARD_DATA.CS_BIZ（build_data.js §8v 生成）
// 口径：一体化设备「收入是利润」= 金额 − 成本，卡片与地图都用利润；表格仍分列收入 / 成本
$(function () {
    var B = window.BOARD_DATA;
    var CS = B && B.CS_BIZ;
    if (!CS || !CS.rows) return;

    var TYPES = (CS.types || []).slice();
    var TYPE_COLOR = { '慢病毒载体': '#2f89cf', '一体化设备': '#ffb800', '试剂检测盒': '#37d67a' };

    /* ── 图标：内联 SVG（显式 width/height，canvas drawImage 才能栅格化） ── */
    function svgBadge(ring, glyph) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
            '<circle cx="24" cy="24" r="20.5" fill="rgba(4,26,56,0.92)" stroke="' + ring + '" stroke-width="2.5"/>' +
            glyph + '</svg>';
    }
    var TYPE_SVG = {
        '慢病毒载体': svgBadge('#2f89cf', '<path d="M24 12.5l9.5 5.5v11L24 34.5 14.5 29V18z" fill="#2f89cf"/><circle cx="24" cy="23.5" r="4" fill="#fff"/>'),
        '一体化设备': svgBadge('#ffb800', '<rect x="14.5" y="18" width="19" height="14" rx="3" fill="#ffb800"/><path d="M19 18v-3.2h10V18" stroke="#ffd766" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="19.5" cy="25" r="2.2" fill="#04203c"/><circle cx="28.5" cy="25" r="2.2" fill="#04203c"/>'),
        '试剂检测盒': svgBadge('#37d67a', '<path d="M20 13h8v12.5a4 4 0 0 1-8 0z" fill="none" stroke="#37d67a" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 22h8v3.5a4 4 0 0 1-8 0z" fill="#37d67a"/><path d="M18.5 13h11" stroke="#7df3ae" stroke-width="2.6" stroke-linecap="round"/>')
    };
    var TYPE_ICON = {};
    Object.keys(TYPE_SVG).forEach(function (t) {
        TYPE_ICON[t] = 'image://data:image/svg+xml;charset=utf-8,' + encodeURIComponent(TYPE_SVG[t]);
    });

    /* ── 工具 ── */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function ymKey(y, m) { return y + '-' + pad2(m); }
    function thousands(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    // 卡片：万元取整，不显示小数
    function fmtInt(v) {
        if (v == null || !isFinite(v)) return '—';
        return thousands(String(Math.round(v)));
    }
    // 表格 / 浮窗：保留 1 位小数
    function fmtW(v) {
        if (v == null || !isFinite(v)) return '—';
        var s = Math.abs(Math.round(v * 10) / 10).toFixed(1);
        var p = s.split('.');
        return (v < 0 ? '-' : '') + thousands(p[0]) + '.' + p[1];
    }
    function fmtShort(v) {
        if (v == null || !isFinite(v)) return '—';
        return (Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + 'k' : (Math.round(v * 10) / 10));
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* ── 状态与筛选控件 ── */
    var st = { y1: 0, m1: 1, y2: 0, m2: 12, type: 'ALL' };

    var years = (CS.years && CS.years.length) ? CS.years.slice() : [];
    if (!years.length) years = [String((B.DP || '').slice(0, 4) || new Date().getFullYear())];
    // 时间筛选也需要能选到「没有收入记录但有目标」的年份
    Object.keys(CS.target || {}).forEach(function (k) {
        var y = k.slice(0, 4);
        if (years.indexOf(y) < 0) years.push(y);
    });
    years.sort();

    var dY = parseInt(String(B.DP || '').slice(0, 4), 10) || parseInt(years[years.length - 1], 10);
    var dM = parseInt(String(B.DP || '').slice(5, 7), 10) || 12;
    if (years.indexOf(String(dY)) < 0) dY = parseInt(years[years.length - 1], 10);
    st.y1 = dY; st.m1 = 1; st.y2 = dY; st.m2 = dM;

    function fillMonths(sel, val) {
        var h = '';
        for (var m = 1; m <= 12; m++) h += '<option value="' + m + '"' + (m === val ? ' selected' : '') + '>' + m + ' 月</option>';
        sel.innerHTML = h;
    }
    function fillYears(sel, val) {
        sel.innerHTML = years.map(function (y) {
            return '<option value="' + y + '"' + (parseInt(y, 10) === val ? ' selected' : '') + '>' + y + ' 年</option>';
        }).join('');
    }
    var $Y1 = document.getElementById('csY1'), $M1 = document.getElementById('csM1');
    var $Y2 = document.getElementById('csY2'), $M2 = document.getElementById('csM2');
    fillYears($Y1, st.y1); fillMonths($M1, st.m1);
    fillYears($Y2, st.y2); fillMonths($M2, st.m2);

    function readTime() {
        st.y1 = parseInt($Y1.value, 10); st.m1 = parseInt($M1.value, 10);
        st.y2 = parseInt($Y2.value, 10); st.m2 = parseInt($M2.value, 10);
        // 起止颠倒时自动纠正，避免出现空区间
        if (st.y1 > st.y2) { st.y2 = st.y1; $Y2.value = st.y1; }
        if (st.y1 === st.y2 && st.m1 > st.m2) { st.m2 = st.m1; $M2.value = st.m1; }
    }

    // 业务类型 chips
    var $Types = document.getElementById('csTypes');
    function renderChips() {
        var list = [{ k: 'ALL', n: '全部' }].concat(TYPES.map(function (t) { return { k: t, n: t }; }));
        $Types.innerHTML = list.map(function (o) {
            var on = (st.type === o.k);
            var dot = o.k === 'ALL' ? '#7ee3ff' : (TYPE_COLOR[o.k] || '#7ee3ff');
            return '<span class="cs-chip' + (on ? ' on' : '') + '" data-t="' + esc(o.k) + '">' +
                '<i style="background:' + dot + '"></i>' + esc(o.n) + '</span>';
        }).join('');
    }
    $Types.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('.cs-chip') : null;
        if (!el) return;
        var t = el.getAttribute('data-t');
        if (!t || t === st.type) return;
        st.type = t;
        renderChips(); renderAll();
    });

    function selTypes() { return st.type === 'ALL' ? TYPES.slice() : [st.type]; }
    function inRange(ym) { return ym >= ymKey(st.y1, st.m1) && ym <= ymKey(st.y2, st.m2); }
    function rowsIn() {
        var ts = selTypes();
        return CS.rows.filter(function (r) { return inRange(r.ym) && ts.indexOf(r.type) >= 0; });
    }
    function monthsIn() {
        var out = [], y = st.y1, m = st.m1, guard = 0;
        while ((y < st.y2 || (y === st.y2 && m <= st.m2)) && guard++ < 600) {
            out.push(ymKey(y, m));
            m++; if (m > 12) { m = 1; y++; }
        }
        return out;
    }
    function targetSum() {
        var ms = monthsIn(), ts = selTypes(), sum = 0;
        ms.forEach(function (k) {
            var o = CS.target && CS.target[k];
            if (!o) return;
            ts.forEach(function (t) { sum += Number(o[t]) || 0; });
        });
        return sum;
    }

    /* ── 卡片（统一组件 .kpi-grid / .kpi-card / .kc-label / .kc-val / .kc-sub） ── */
    var $Kpi = document.getElementById('csKpi');
    function renderKpi() {
        var rows = rowsIn();
        var tgt = targetSum();
        var rev = rows.reduce(function (s, r) { return s + (Number(r.effWan) || 0); }, 0);
        var hasDev = selTypes().indexOf('一体化设备') >= 0;
        var rate = tgt > 0 ? (rev / tgt * 100) : null;
        var rateTx = (rate == null) ? '—' : (Math.round(rate * 10) / 10).toFixed(1) + '%';
        var span = ymKey(st.y1, st.m1) + ' ~ ' + ymKey(st.y2, st.m2);
        var months = monthsIn(), tgtMonths = 0;
        Object.keys(CS.target || {}).forEach(function (k) { if (months.indexOf(k) >= 0) tgtMonths++; });
        // 达成用状态色：≥100% 绿 / ≥60% 金 / <60% 红；无目标灰
        var rtAc = (rate == null) ? '--ac:#8fa6bd' : (rate >= 60 && rate < 100 ? '--ac:#ffcf4d' : '');

        $Kpi.innerHTML =
            '<div class="kpi-card" style="--ac:#4fe3ff">' +
                '<div class="kc-label">目标</div>' +
                '<div class="kc-val">' + fmtInt(tgt) + '<small>万元</small></div>' +
                '<div class="kc-sub">区间内 ' + tgtMonths + ' 个月有目标，缺月计 0</div>' +
            '</div>' +
            '<div class="kpi-card" style="--ac:#ffcf4d">' +
                '<div class="kc-label">收入</div>' +
                '<div class="kc-val">' + fmtInt(rev) + '<small>万元</small></div>' +
                '<div class="kc-sub">' + span + ' · ' + rows.length + ' 笔' + (hasDev ? ' · 设备类取利润' : '') + '</div>' +
            '</div>' +
            '<div class="kpi-card' + (rate == null ? '' : (rate >= 100 ? ' ok' : (rate >= 60 ? '' : ' risk'))) + '" ' +
                (rtAc ? 'style="' + rtAc + '"' : '') + '>' +
                '<div class="kc-label">达成</div>' +
                '<div class="kc-val">' + rateTx + '</div>' +
                '<div class="kc-sub">' + (tgt > 0 ? '收入 ÷ 目标' : '区间内无目标，达成不计算') + '</div>' +
            '</div>';
    }
    document.getElementById('csNote').textContent = '数据源：' + (CS.file || '海外收入统计');

    /* ── 世界地图（参考 page3：WORLD_GEO + geo + scatter） ── */
    var RAMP = [[0, [18, 58, 99]], [0.45, [47, 137, 207]], [1, [126, 227, 255]]];
    function rampColor(t) {
        t = Math.max(0, Math.min(1, t));
        for (var i = 0; i < RAMP.length - 1; i++) {
            var a = RAMP[i], b = RAMP[i + 1];
            if (t <= b[0]) {
                var k = (t - a[0]) / (b[0] - a[0] || 1);
                return 'rgb(' + [0, 1, 2].map(function (j) {
                    return Math.round(a[1][j] + (b[1][j] - a[1][j]) * k);
                }).join(',') + ')';
            }
        }
        return 'rgb(126,227,255)';
    }
    var BASE_AREA = 'rgba(2,37,101,.55)';

    var mapChart = null, centroids = {}, seriesIdxMap = {};

    // 世界地图内容宽高比（实测）。容器比它「高」时按比例放大，把上下留白吃掉；
    // 上限 1.28，避免 1920 下把阿拉斯加/太平洋边缘裁掉太多
    var MAP_ASPECT = 2.07;
    function mapZoom() {
        var el = document.getElementById('csMap');
        if (!el) return 1;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return 1;
        return Math.max(1, Math.min(1.28, r.height * MAP_ASPECT / r.width));
    }

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

    function initMap() {
        if (!window.WORLD_GEO) return false;
        var worldGeo = JSON.parse(JSON.stringify(window.WORLD_GEO));
        worldGeo.features.forEach(function (f) {
            if (f.properties && f.properties.name) {
                f.properties.cp = regionAnchor(f.geometry.coordinates);
                centroids[f.properties.name] = f.properties.cp;
            }
        });
        echarts.registerMap('world', worldGeo);
        var el = document.getElementById('csMap');
        mapChart = echarts.init(el, null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
        return true;
    }

    function renderMap() {
        if (!mapChart) return;
        var rows = rowsIn().filter(function (r) { return r.geo && centroids[r.geo]; });
        var ts = selTypes();

        // 按国家聚合（口径 = effWan，设备类为利润）
        var agg = {}, byCountry = {};
        rows.forEach(function (r) {
            agg[r.geo] = (agg[r.geo] || 0) + (Number(r.effWan) || 0);
            var c = byCountry[r.geo] || (byCountry[r.geo] = { country: r.country, types: {}, total: 0 });
            c.types[r.type] = (c.types[r.type] || 0) + (Number(r.effWan) || 0);
            c.total += (Number(r.effWan) || 0);
        });
        var maxV = 0;
        Object.keys(agg).forEach(function (g) { if (agg[g] > maxV) maxV = agg[g]; });

        var regions = Object.keys(agg).map(function (geo) {
            var v = agg[geo];
            // 开方缩放：收入差距常是几十倍，线性会导致低值国家几乎看不出颜色
            var t = maxV > 0 ? Math.sqrt(v / maxV) : 0;
            return {
                name: geo,
                itemStyle: { normal: { areaColor: rampColor(t) }, emphasis: { areaColor: '#5fb6f0' } },
                label: { normal: { show: false } }
            };
        });

        // 每个国家有几种业务 → 横向错开；同时记录「业务|国家 → 系列内 dataIndex」，供 geo 区域 hover 唤起 tooltip
        var seriesData = {};
        seriesIdxMap = {};
        Object.keys(byCountry).forEach(function (geo) {
            var c = byCountry[geo];
            var present = ts.filter(function (t) { return c.types[t] != null; });
            var n = present.length;
            present.forEach(function (t, k) {
                var off = n > 1 ? (k - (n - 1) / 2) * 3.6 : 0;
                var cp = centroids[geo];
                seriesData[t] = seriesData[t] || [];
                seriesIdxMap[t + '|' + geo] = seriesData[t].length;
                seriesData[t].push({
                    name: c.country,
                    value: [cp[0] + off, cp[1], c.types[t]],
                    geoName: geo,
                    country: c.country,
                    type: t,
                    total: c.total,
                    cnt: c.types[t],
                    // 有数据的国家在地图上标中文名：同一国家多个图标时只在第一个图标上标一次
                    // 样式与「全球注册进度」地图一致（白色 9px、图标上方，不加粗/不加描边）
                    label: {
                        normal: {
                            show: (k === 0),
                            position: 'top',
                            distance: 5,
                            formatter: c.country,
                            color: '#fff',
                            fontSize: 9
                        },
                        emphasis: { show: false }
                    }
                });
            });
        });

        var series = ts.map(function (t) {
            return {
                name: t,
                type: 'scatter',
                coordinateSystem: 'geo',
                zlevel: 3,
                data: seriesData[t] || [],
                symbol: TYPE_ICON[t] || 'circle',
                symbolSize: 22,
                itemStyle: { normal: { color: TYPE_COLOR[t] } }
            };
        });

        var option = {            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(2,24,61,.94)',
                borderColor: 'rgba(47,137,207,.8)',
                borderWidth: 1,
                padding: 0,
                extraCssText: 'box-shadow:0 0 20px rgba(47,137,207,.4);border-radius:8px;',
                formatter: function (p) {
                    if (!p.data) return '';
                    var c = byCountry[p.data.geoName];
                    if (!c) return '';
                    var lines = ts.map(function (t) {
                        if (c.types[t] == null) return '';
                        return '<div style="line-height:22px;color:rgba(255,255,255,.85);">' +
                            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (TYPE_COLOR[t] || '#7ee3ff') + ';margin-right:6px;"></span>' +
                            esc(t) + '：<b style="color:#4fe3ff;">' + fmtW(c.types[t]) + '</b> 万元</div>';
                    }).join('');
                    return '<div style="font-size:14px;color:#fff;font-weight:700;padding:10px 14px 6px;border-bottom:1px solid rgba(47,137,207,.5);letter-spacing:1px;">' + esc(c.country) + '</div>' +
                        '<div style="padding:8px 14px 12px;font-size:13px;">' + lines +
                        '<div style="line-height:22px;color:rgba(255,255,255,.6);margin-top:4px;">合计 <b style="color:#ffcf4d;">' + fmtW(c.total) + '</b> 万元</div></div>';
                }
            },
            geo: {
                map: 'world',
                roam: false,
                zoom: mapZoom(),
                regions: regions,
                label: { normal: { show: false } },
                itemStyle: {
                    normal: { areaColor: BASE_AREA, borderColor: 'rgba(112,187,252,.35)', borderWidth: 0.5 },
                    emphasis: { areaColor: 'rgba(47,137,207,.75)' }
                }
            },
            series: series
        };
        mapChart.resize();               // 先让画布与容器同尺寸，再算缩放，避免首次渲染容器未布局
        mapChart.setOption(option, true);
        document.getElementById('csLegendMax').textContent = maxV > 0 ? '峰值 ' + fmtInt(maxV) + ' 万' : '';
    }

    // 地图底部图标图例：说明每个业务类型对应的 icon（只列当前筛选下可见的类型）
    var $IcoLegend = document.getElementById('csIcoLegend');
    function renderIcoLegend() {
        if (!$IcoLegend) return;
        var ts = selTypes();
        $IcoLegend.innerHTML = ts.map(function (t) {
            var svg = (TYPE_SVG[t] || '').replace('width="48" height="48"', 'width="15" height="15"');
            return '<span class="cs-ico-item">' + svg + '<em>' + esc(t) + '</em></span>';
        }).join('');
    }

    /* ── 明细表 ── */
    var TYPE_TAG_BG = {
        '慢病毒载体': 'rgba(47,137,207,.28)',
        '一体化设备': 'rgba(255,184,0,.22)',
        '试剂检测盒': 'rgba(55,214,122,.22)'
    };
    function renderTable() {
        var rows = rowsIn();
        var h = '<table class="pt pt-ov"><thead><tr>' +
            '<th>到款月</th><th>国家</th><th class="pt-lbl">客户名称</th><th>业务类型</th>' +
            '<th>收入</th><th>成本</th></tr></thead><tbody>';
        if (!rows.length) {
            h += '<tr><td colspan="6" style="text-align:center;color:rgba(255,255,255,.45);padding:18px 0;">所选区间无记录</td></tr>';
        }
        rows.forEach(function (r) {
            var ctry = r.country
                ? esc(r.country)
                : '<span class="cs-ctry-none">未填国家</span>';
            h += '<tr>' +
                '<td class="cs-num">' + r.ym + '</td>' +
                '<td>' + ctry + '</td>' +
                '<td class="pt-lbl" title="' + esc(r.cust) + '"><span class="cs-cust">' + esc(r.cust) + '</span></td>' +
                '<td><span class="cs-tag" style="background:' + (TYPE_TAG_BG[r.type] || 'rgba(47,137,207,.2)') + ';color:' + (TYPE_COLOR[r.type] || '#9fe8ff') + '">' + esc(r.type) + '</span></td>' +
                '<td class="cs-num" style="color:#4fe3ff;font-weight:700;">' + fmtW(r.revWan) + '</td>' +
                '<td class="cs-num">' + (r.costWan == null ? '—' : fmtW(r.costWan)) + '</td>' +
                '</tr>';
        });
        h += '</tbody></table>';
        document.getElementById('csTbl').innerHTML = h;
    }

    /* ── 统一渲染 ── */
    function renderAll() {
        readTime();
        renderKpi();
        renderMap();
        renderIcoLegend();
        renderTable();
    }

    ['csY1', 'csM1', 'csY2', 'csM2'].forEach(function (id) {
        document.getElementById(id).addEventListener('change', renderAll);
    });

    renderChips();
    var mapOk = initMap();
    if (!mapOk) {
        document.getElementById('csMap').innerHTML = '<div class="cs-empty">世界地图数据未加载</div>';
    }
    renderAll();

    if (mapChart) {
        // 容器尺寸变化时重算缩放（初始渲染时容器可能还没高度，靠它兜底）
        function syncMapZoom() {
            if (!mapChart) return;
            mapChart.resize();
            mapChart.setOption({ geo: { zoom: mapZoom() } });
        }
        if (window.ResizeObserver) {
            new ResizeObserver(function () { syncMapZoom(); }).observe(document.getElementById('csMap'));
        }
        window.addEventListener('resize', syncMapZoom);
        $(document).on('boardfs', function () { setTimeout(syncMapZoom, 60); });
        $(document).on('boardlogin', function () { setTimeout(syncMapZoom, 60); });
        setTimeout(syncMapZoom, 200);
        mapChart.on('mouseover', function (params) {
            if (params.componentType !== 'geo' || !params.name) return;
            var ts0 = selTypes();
            for (var i = 0; i < ts0.length; i++) {
                var key = ts0[i] + '|' + params.name;
                if (seriesIdxMap[key] != null) {
                    mapChart.dispatchAction({ type: 'showTip', seriesIndex: i, dataIndex: seriesIdxMap[key] });
                    return;
                }
            }
        });
        mapChart.on('mouseout', function (params) {
            if (params.componentType === 'geo') mapChart.dispatchAction({ type: 'hideTip' });
        });
    }
});
