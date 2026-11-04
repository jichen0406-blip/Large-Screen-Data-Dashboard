// Page33 渲染逻辑：技术转移业务（key tt_biz）
//   时间区间筛选 → 每个客户一张卡片（区间收入 USD 主数字 + 全历史累计小字）、世界地图（按 USD 着色）、收入明细表
// 数据：BOARD_DATA.TECH_BIZ（build_data.js §8y 生成）
// 口径：★ 全部按 USD 原币计价，不做汇率折算；技术转移无成本金额，成本列显示「—」
$(function () {
    var B = window.BOARD_DATA;
    var TT = B && B.TECH_BIZ;
    if (!TT || !TT.rows) return;

    var COMPANY_COLOR = ['#4fe3ff', '#ffcf4d', '#62c98d', '#ff8a65', '#b388ff', '#7ee3ff', '#ff6f91', '#8fd6ff'];

    /* ── 工具 ── */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function ymKey(y, m) { return y + '-' + pad2(m); }
    function thousands(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    // ★ 统一用 USD Million（百万美元）展示
    // 卡片 / 图例：2 位小数；明细表 / 浮窗：3 位小数（单笔常在 0.03~0.09 M，2 位分辨不出）
    function fmtM(v, d) {
        if (v == null || !isFinite(v)) return '—';
        var n = v / 1e6;
        return (n < 0 ? '-' : '') + thousands(Math.abs(n).toFixed(d == null ? 2 : d));
    }
    function fmtInt(v) { return fmtM(v, 2); }
    function fmt2(v) { return fmtM(v, 3); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* ── 时间区间 ── */
    var st = { y1: 0, m1: 1, y2: 0, m2: 12 };
    var years = (TT.years && TT.years.length) ? TT.years.slice() : [];
    if (!years.length) years = [String((B.DP || '').slice(0, 4) || new Date().getFullYear())];
    years.sort();

    // 默认区间：最新有收入数据的年份 1 月 → 最新数据月（不用数据截止月，避免尾部空月）
    var latestYm = TT.rows.length ? TT.rows[0].ym : (String(B.DP || '').slice(0, 7) || ymKey(new Date().getFullYear(), 1));
    var dY = parseInt(latestYm.slice(0, 4), 10) || parseInt(years[years.length - 1], 10);
    if (years.indexOf(String(dY)) < 0) dY = parseInt(years[years.length - 1], 10);
    st.y1 = dY; st.m1 = 1; st.y2 = dY; st.m2 = parseInt(latestYm.slice(5, 7), 10) || 12;

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
    var $Y1 = document.getElementById('ttY1'), $M1 = document.getElementById('ttM1');
    var $Y2 = document.getElementById('ttY2'), $M2 = document.getElementById('ttM2');
    fillYears($Y1, st.y1); fillMonths($M1, st.m1);
    fillYears($Y2, st.y2); fillMonths($M2, st.m2);

    function readTime() {
        st.y1 = parseInt($Y1.value, 10); st.m1 = parseInt($M1.value, 10);
        st.y2 = parseInt($Y2.value, 10); st.m2 = parseInt($M2.value, 10);
        if (st.y1 > st.y2) { st.y2 = st.y1; $Y2.value = st.y1; }
        if (st.y1 === st.y2 && st.m1 > st.m2) { st.m2 = st.m1; $M2.value = st.m1; }
    }
    function inRange(ym) { return ym >= ymKey(st.y1, st.m1) && ym <= ymKey(st.y2, st.m2); }
    function rowsIn() { return TT.rows.filter(function (r) { return inRange(r.ym); }); }

    /* ── 卡片：一家公司一张，N 家 = 一行 N 张 ── */
    var $Kpi = document.getElementById('ttKpi');
    var companies = (TT.companies || []).slice();

    function renderKpi() {
        var rows = rowsIn();
        var span = ymKey(st.y1, st.m1) + ' ~ ' + ymKey(st.y2, st.m2);
        // 区间内收入（按客户聚合）
        var byCust = {};
        rows.forEach(function (r) {
            var o = byCust[r.cust] || (byCust[r.cust] = { amt: 0, n: 0 });
            o.amt += Number(r.amtUsd) || 0;
            o.n++;
        });
        // 区间内没有收入的公司也要出卡（显示 0），保持「几家公司就几张卡」
        var list = companies.length ? companies : Object.keys(byCust).map(function (c) { return { name: c, total: 0, n: 0 }; });

        $Kpi.innerHTML = list.map(function (c, i) {
            var cur = byCust[c.name] || { amt: 0, n: 0 };
            var ac = COMPANY_COLOR[i % COMPANY_COLOR.length];
            return '<div class="kpi-card" style="--ac:' + ac + '">' +
                '<div class="kc-label" title="' + esc(c.name) + '">' + esc(c.name) + '</div>' +
                '<div class="kc-val">' + fmtInt(cur.amt) + '<small>M USD</small></div>' +
                '<div class="kc-sub">区间 ' + cur.n + ' 笔 · 全历史累计 ' + fmtInt(c.total) + ' M</div>' +
                '</div>';
        }).join('');
        var note = document.getElementById('ttNote');
        if (note) note.textContent = '数据源：' + (TT.file || '海外收入统计') + '　·　区间 ' + span;
    }

    /* ── 世界地图 ── */
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
    var mapChart = null, centroids = {};

    // 世界地图内容宽高比（与 China Solution 页一致）
    var MAP_ASPECT = 2.07;
    function mapZoom() {
        var el = document.getElementById('ttMap');
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
        mapChart = echarts.init(document.getElementById('ttMap'), null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
        return true;
    }

    // 技术转移图标（单业务类型，一国一枚）
    var TT_ICON = 'image://data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">' +
        '<circle cx="22" cy="22" r="18.5" fill="rgba(4,26,56,0.92)" stroke="#4fe3ff" stroke-width="2.4"/>' +
        '<path d="M13 17.5h13.5l-3.2-3.2 2.1-2.1 6.8 6.8-6.8 6.8-2.1-2.1 3.2-3.2H13z" fill="#4fe3ff"/>' +
        '<path d="M31 26.5H17.5l3.2 3.2-2.1 2.1-6.8-6.8 6.8-6.8 2.1 2.1-3.2 3.2H31z" fill="#ffcf4d" opacity=".9"/>' +
        '</svg>');

    function renderMap() {
        if (!mapChart) return;
        var rows = rowsIn().filter(function (r) { return r.geo && centroids[r.geo]; });

        var agg = {}, byCountry = {};
        rows.forEach(function (r) {
            var v = Number(r.amtUsd) || 0;
            agg[r.geo] = (agg[r.geo] || 0) + v;
            var c = byCountry[r.geo] || (byCountry[r.geo] = { country: r.country, total: 0, n: 0, custs: {} });
            c.total += v;
            c.n++;
            c.custs[r.cust] = (c.custs[r.cust] || 0) + v;
        });
        var maxV = 0;
        Object.keys(agg).forEach(function (g) { if (agg[g] > maxV) maxV = agg[g]; });

        var regions = Object.keys(agg).map(function (geo) {
            var t = maxV > 0 ? Math.sqrt(agg[geo] / maxV) : 0;
            return {
                name: geo,
                itemStyle: { normal: { areaColor: rampColor(t) }, emphasis: { areaColor: '#5fb6f0' } },
                label: { normal: { show: false } }
            };
        });

        var data = Object.keys(byCountry).map(function (geo) {
            var c = byCountry[geo], cp = centroids[geo];
            return {
                name: c.country,
                value: [cp[0], cp[1], c.total],
                geoName: geo,
                country: c.country,
                total: c.total,
                n: c.n,
                custs: c.custs,
                label: { normal: { show: true, position: 'top', distance: 5, formatter: c.country, color: '#fff', fontSize: 9 }, emphasis: { show: false } }
            };
        });

        var option = {
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(2,24,61,.94)',
                borderColor: 'rgba(47,137,207,.8)',
                borderWidth: 1,
                padding: 0,
                extraCssText: 'box-shadow:0 0 20px rgba(47,137,207,.4);border-radius:8px;',
                formatter: function (p) {
                    if (!p.data) return '';
                    var c = p.data;
                    var lines = Object.keys(c.custs).sort(function (a, b) { return c.custs[b] - c.custs[a]; }).map(function (k) {
                        return '<div style="line-height:22px;color:rgba(255,255,255,.85);">' + esc(k) +
                            '：<b style="color:#4fe3ff;">' + fmt2(c.custs[k]) + '</b> M</div>';
                    }).join('');
                    return '<div style="font-size:14px;color:#fff;font-weight:700;padding:10px 14px 6px;border-bottom:1px solid rgba(47,137,207,.5);letter-spacing:1px;">' + esc(c.country) + '</div>' +
                        '<div style="padding:8px 14px 12px;font-size:13px;">' + lines +
                        '<div style="line-height:22px;color:rgba(255,255,255,.6);margin-top:4px;">合计 <b style="color:#ffcf4d;">' + fmt2(c.total) + '</b> M · ' + c.n + ' 笔</div></div>';
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
            series: [{
                name: '技术转移',
                type: 'scatter',
                coordinateSystem: 'geo',
                zlevel: 3,
                data: data,
                symbol: TT_ICON,
                symbolSize: 22
            }]
        };
        mapChart.resize();
        mapChart.setOption(option, true);
        var mx = document.getElementById('ttLegendMax');
        if (mx) mx.textContent = maxV > 0 ? '峰值 ' + fmtInt(maxV) + ' M USD' : '';
    }

    /* ── 明细表 ── */
    function renderTable() {
        var rows = rowsIn();
        var h = '<table class="pt pt-ov"><thead><tr>' +
            '<th>到款月</th><th>国家</th><th class="pt-lbl">客户名称</th><th>业务类型</th>' +
            '<th>收入</th><th>成本</th></tr></thead><tbody>';
        if (!rows.length) {
            h += '<tr><td colspan="6" style="text-align:center;color:rgba(255,255,255,.45);padding:18px 0;">所选区间无记录</td></tr>';
        }
        rows.forEach(function (r) {
            var ctry = r.country ? esc(r.country) : '<span class="tt-ctry-none">未填国家</span>';
            h += '<tr>' +
                '<td class="tt-num">' + r.ym + '</td>' +
                '<td>' + ctry + '</td>' +
                '<td class="pt-lbl" title="' + esc(r.cust) + '"><span class="tt-cust">' + esc(r.cust) + '</span></td>' +
                '<td><span class="tt-tag" style="background:rgba(47,137,207,.22);color:#7fc4ff">' + esc(r.biz || '技术授权转移') + '</span></td>' +
                '<td class="tt-num" style="color:#4fe3ff;font-weight:700;">' + fmt2(r.amtUsd) + '</td>' +
                '<td class="tt-num">—</td>' +
                '</tr>';
        });
        h += '</tbody></table>';
        document.getElementById('ttTbl').innerHTML = h;
        var sub = document.getElementById('ttTblSub');
        if (sub) sub.textContent = '单位 M USD（百万美元）· 不折人民币 · 共 ' + rows.length + ' 笔';
    }

    /* ── 统一渲染 ── */
    function renderAll() {
        readTime();
        renderKpi();
        renderMap();
        renderTable();
    }

    ['ttY1', 'ttM1', 'ttY2', 'ttM2'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', renderAll);
    });

    var ok = initMap();
    renderAll();
    if (ok) {
        setTimeout(function () { if (mapChart) { mapChart.resize(); renderMap(); } }, 80);
        window.addEventListener('resize', function () { if (mapChart) { mapChart.resize(); renderMap(); } });
        $(document).on('boardfs', function () {
            setTimeout(function () { if (mapChart) { mapChart.resize(); renderMap(); } }, 80);
        });
        $(document).on('boardlogin', function () {
            setTimeout(function () { if (mapChart) { mapChart.resize(); renderMap(); } }, 80);
        });
    }
});
