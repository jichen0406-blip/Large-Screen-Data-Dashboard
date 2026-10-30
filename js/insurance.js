// 惠民保 / 商保 页面共用逻辑（page27 惠民保、page28 商保）
// 数据：BOARD_DATA.INSURANCE（build_data.js §8w）
// 口径：order dict「惠民保」「商业保险」列非空即计入，两列独立；名称已归一、组合值已拆开
$(function () {
    var B = window.BOARD_DATA;
    var I = B && B.INSURANCE;
    if (!I || !I.rows) return;

    var CFG = window.INS_CFG || { key: 'hb', title: '惠民保' };
    var KEY = CFG.key;                       // 'hb' | 'bx'
    var TITLE = CFG.title;
    var OTHER = KEY === 'hb' ? '商保' : '惠民保';

    // 省份全称 ↔ 地图短名
    var PROV_ADCODE = {
        '北京': { adcode: 110000, full: '北京市', single: true }, '天津': { adcode: 120000, full: '天津市', single: true },
        '河北': { adcode: 130000, full: '河北省' }, '山西': { adcode: 140000, full: '山西省' },
        '内蒙古': { adcode: 150000, full: '内蒙古自治区' }, '辽宁': { adcode: 210000, full: '辽宁省' },
        '吉林': { adcode: 220000, full: '吉林省' }, '黑龙江': { adcode: 230000, full: '黑龙江省' },
        '上海': { adcode: 310000, full: '上海市', single: true }, '江苏': { adcode: 320000, full: '江苏省' },
        '浙江': { adcode: 330000, full: '浙江省' }, '安徽': { adcode: 340000, full: '安徽省' },
        '福建': { adcode: 350000, full: '福建省' }, '江西': { adcode: 360000, full: '江西省' },
        '山东': { adcode: 370000, full: '山东省' }, '河南': { adcode: 410000, full: '河南省' },
        '湖北': { adcode: 420000, full: '湖北省' }, '湖南': { adcode: 430000, full: '湖南省' },
        '广东': { adcode: 440000, full: '广东省' }, '广西': { adcode: 450000, full: '广西壮族自治区' },
        '海南': { adcode: 460000, full: '海南省' }, '重庆': { adcode: 500000, full: '重庆市', single: true },
        '四川': { adcode: 510000, full: '四川省' }, '贵州': { adcode: 520000, full: '贵州省' },
        '云南': { adcode: 530000, full: '云南省' }, '西藏': { adcode: 540000, full: '西藏自治区' },
        '陕西': { adcode: 610000, full: '陕西省' }, '甘肃': { adcode: 620000, full: '甘肃省' },
        '青海': { adcode: 630000, full: '青海省' }, '宁夏': { adcode: 640000, full: '宁夏回族自治区' },
        '新疆': { adcode: 650000, full: '新疆维吾尔自治区' }, '台湾': { adcode: 710000, full: '台湾省', single: true },
        '香港': { adcode: 810000, full: '香港特别行政区', single: true }, '澳门': { adcode: 820000, full: '澳门特别行政区', single: true }
    };
    var FULL2SHORT = {};
    Object.keys(PROV_ADCODE).forEach(function (k) { FULL2SHORT[PROV_ADCODE[k].full] = k; });
    var ALIAS = { '内蒙古自治区': '内蒙古', '广西壮族自治区': '广西', '宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆', '西藏自治区': '西藏', '香港特别行政区': '香港', '澳门特别行政区': '澳门' };

    function shortProv(full) {
        if (!full) return '';
        if (FULL2SHORT[full]) return FULL2SHORT[full];
        if (ALIAS[full]) return ALIAS[full];
        return String(full).replace(/(省|市|自治区|特别行政区)$/, '');
    }
    function fullProv(short) { return (PROV_ADCODE[short] || {}).full || short; }

    /* ── 工具 ── */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function thousands(s) { return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function pct(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '—'; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* ── 筛选控件 ── */
    var months = I.months.slice();
    var years = [], byYear = {};
    months.forEach(function (ym) {
        var y = ym.slice(0, 4), m = +ym.slice(5, 7);
        if (years.indexOf(y) < 0) { years.push(y); byYear[y] = []; }
        byYear[y].push(m);
    });
    years.sort();

    var last = months[months.length - 1] || '2026-10';
    var st = { y1: last.slice(0, 4), m1: 1, y2: last.slice(0, 4), m2: +last.slice(5, 7), am: 'ALL', prov: '', city: '' };

    var $Y1 = document.getElementById('insY1'), $M1 = document.getElementById('insM1');
    var $Y2 = document.getElementById('insY2'), $M2 = document.getElementById('insM2');
    var $AM = document.getElementById('insAM');

    function fillYears(sel, val) {
        sel.innerHTML = years.map(function (y) {
            return '<option value="' + y + '"' + (y === val ? ' selected' : '') + '>' + y + ' 年</option>';
        }).join('');
    }
    function fillMonths(sel, y, val) {
        var ms = (byYear[y] || []).slice().sort(function (a, b) { return a - b; });
        sel.innerHTML = ms.map(function (m) {
            return '<option value="' + m + '"' + (m === val ? ' selected' : '') + '>' + m + ' 月</option>';
        }).join('');
    }
    fillYears($Y1, st.y1); fillMonths($M1, st.y1, st.m1);
    fillYears($Y2, st.y2); fillMonths($M2, st.y2, st.m2);
    $AM.innerHTML = '<option value="ALL">全部 AM</option>' + I.amList.map(function (a) {
        return '<option value="' + esc(a) + '">' + esc(a) + '</option>';
    }).join('');

    $Y1.addEventListener('change', function () {
        st.y1 = $Y1.value; fillMonths($M1, st.y1, +$M1.value || 1); renderAll();
    });
    $Y2.addEventListener('change', function () {
        st.y2 = $Y2.value; fillMonths($M2, st.y2, +$M2.value || 12); renderAll();
    });
    [$M1, $M2, $AM].forEach(function (el) { el.addEventListener('change', renderAll); });

    function readFilter() {
        st.y1 = $Y1.value; st.m1 = +$M1.value;
        st.y2 = $Y2.value; st.m2 = +$M2.value;
        st.am = $AM.value;
        if (st.y1 > st.y2) { st.y2 = st.y1; $Y2.value = st.y1; fillMonths($M2, st.y2, st.m2); }
        if (st.y1 === st.y2 && st.m1 > st.m2) { st.m2 = st.m1; $M2.value = st.m1; }
    }
    function ym1() { return st.y1 + '-' + pad2(st.m1); }
    function ym2() { return st.y2 + '-' + pad2(st.m2); }
    function inRange(ym) { return ym >= ym1() && ym <= ym2(); }

    /* ── 聚合 ── */
    var agg = null;
    function compute() {
        var de = {};                                   // 'prov|city' → 总订单
        var keys = Object.keys(I.denom);
        for (var i = 0; i < keys.length; i++) {
            var p = keys[i].split('|');                // ym|am|prov|city
            if (p[0] < ym1() || p[0] > ym2()) continue;
            if (st.am !== 'ALL' && p[1] !== st.am) continue;
            var kk = p[2] + '|' + p[3];
            de[kk] = (de[kk] || 0) + I.denom[keys[i]];
        }
        var rows = I.rows.filter(function (r) {
            return inRange(r.ym) && (st.am === 'ALL' || r.am === st.am) && r[KEY] && r[KEY].length;
        });
        var prov = {}, city = {}, total = 0, biz = 0;
        Object.keys(de).forEach(function (kk) {
            var a = kk.split('|');
            total += de[kk];
            prov[a[0]] = (prov[a[0]] || 0) + de[kk];
            city[kk] = de[kk];
        });
        rows.forEach(function (r) { biz++; });
        // 省份业务数
        var provBiz = {}, cityBiz = {};
        rows.forEach(function (r) {
            provBiz[r.prov] = (provBiz[r.prov] || 0) + 1;
            var kk = r.prov + '|' + r.city;
            cityBiz[kk] = (cityBiz[kk] || 0) + 1;
        });
        agg = { total: total, biz: biz, prov: prov, provBiz: provBiz, city: city, cityBiz: cityBiz, rows: rows };
    }

    /* ── 卡片 ── */
    function renderCards() {
        var box = document.getElementById('insKpi');
        var rate = agg.total > 0 ? (agg.biz / agg.total * 100) : null;
        var span = ym1() + ' ~ ' + ym2() + (st.am === 'ALL' ? ' · 全部 AM' : ' · ' + st.am);
        box.innerHTML =
            '<div class="kpi-card" style="--ac:' + (KEY === 'hb' ? '#4fe3ff' : '#ffcf4d') + '">' +
                '<div class="kc-label">' + TITLE + '订单</div>' +
                '<div class="kc-val">' + thousands(agg.biz) + '<small>单</small></div>' +
                '<div class="kc-sub">' + esc(span) + '</div>' +
            '</div>' +
            '<div class="kpi-card" style="--ac:#62c98d">' +
                '<div class="kc-label">' + TITLE + '占比</div>' +
                '<div class="kc-val">' + (rate == null ? '—' : rate.toFixed(1) + '%') + '</div>' +
                '<div class="kc-sub">' + thousands(agg.biz) + ' ÷ ' + thousands(agg.total) + ' 总订单</div>' +
            '</div>';
    }

    /* ── 地图 ── */
    var chart = null, curMap = 'china', mapInited = false;
    var RAMP = [[0, [18, 58, 99]], [0.5, [47, 137, 207]], [1, [126, 227, 255]]];
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

    function provData() {
        var out = [], max = 0;
        Object.keys(agg.prov).forEach(function (full) {
            var tot = agg.prov[full] || 0, bz = agg.provBiz[full] || 0;
            if (tot <= 0 || bz <= 0) return;   // 业务订单为 0 的不画气泡
            var r = bz / tot * 100;
            if (r > max) max = r;
            out.push({ name: shortProv(full), full: full, total: tot, biz: bz, rate: r });
        });
        return { list: out, max: max };
    }
    function cityData(provFull) {
        var out = [], max = 0;
        Object.keys(agg.city).forEach(function (kk) {
            var p = kk.split('|');
            if (p[0] !== provFull) return;
            var tot = agg.city[kk] || 0, bz = agg.cityBiz[kk] || 0;
            if (tot <= 0 || bz <= 0) return;   // 业务订单为 0 的不画气泡
            var r = bz / tot * 100;
            if (r > max) max = r;
            out.push({ name: p[1], total: tot, biz: bz, rate: r });
        });
        return { list: out, max: max };
    }

    function tooltipFmt(p) {
        var d = p.data;
        if (!d) return '<b>' + p.name + '</b><br/>无数据';
        return '<div style="font-size:13px;color:#fff;font-weight:700;margin-bottom:4px;">' + esc(p.name) + '</div>' +
            '<div style="font-size:12px;line-height:20px;color:rgba(255,255,255,.85);">总订单：<b>' + thousands(d.total) + '</b></div>' +
            '<div style="font-size:12px;line-height:20px;color:rgba(255,255,255,.85);">' + TITLE + '订单：<b style="color:#4fe3ff;">' + thousands(d.biz) + '</b></div>' +
            '<div style="font-size:12px;line-height:20px;color:rgba(255,255,255,.85);">占比：<b style="color:#ffcf4d;">' + (d.total ? (d.rate).toFixed(1) + '%' : '—') + '</b></div>';
    }

    var cpCache = {};
    function centroidsOf(mapName) {
        if (cpCache[mapName]) return cpCache[mapName];
        var out = {};
        try {
            var g = echarts.getMap(mapName);
            var gj = g && (g.geoJson || g.geoJSON);
            if (gj && gj.features) {
                gj.features.forEach(function (f) {
                    var p = f.properties || {};
                    if (!p.name) return;
                    var cp = p.cp || p.centroid || p.center;
                    if (cp) out[p.name] = cp;
                });
            }
        } catch (e) { }
        cpCache[mapName] = out;
        return out;
    }

    function renderMap() {
        if (!chart) return;
        if (!mapInited) { chart.on('click', onMapClick); mapInited = true; }
        var isCity = false;
        var mapName = 'china';
        var src = provData();
        var provShort = '';
        var cps = centroidsOf(mapName);
        var maxBiz = 1, maxRate = src.max || 1;
        src.list.forEach(function (x) { if (x.biz > maxBiz) maxBiz = x.biz; });

        // 气泡：大小 = 订单数，颜色 = 占比%
        var data = src.list.map(function (x) {
            var cp = cps[x.name];
            if (!cp) return null;
            return { name: x.name, value: [cp[0], cp[1], x.rate], biz: x.biz, total: x.total, rate: x.rate };
        }).filter(Boolean);

        chart.setOption({
            tooltip: {
                trigger: 'item', confine: true, backgroundColor: 'rgba(2,24,61,.94)', borderColor: 'rgba(47,137,207,.8)',
                borderWidth: 1, padding: 8, extraCssText: 'box-shadow:0 0 20px rgba(47,137,207,.4);border-radius:8px;',
                formatter: tooltipFmt
            },
            visualMap: {
                show: true, dimension: 2, min: 0, max: Math.max(1, Math.ceil(maxRate)),
                right: 20, top: 8, orient: 'horizontal',
                text: ['高', '低'], calculable: false, itemWidth: 12, itemHeight: 70,
                textStyle: { color: 'rgba(223,244,255,.75)', fontSize: 11 },
                inRange: { color: ['#1b4a7a', '#2f89cf', '#7ee3ff', '#ffe082'] }
            },
            geo: {
                map: mapName, roam: false,
                layoutCenter: ['50%', '46%'], layoutSize: '100%',
                label: { normal: { show: isCity, color: 'rgba(255,255,255,.7)', fontSize: 9 } },
                itemStyle: {
                    normal: { areaColor: 'rgba(2,37,101,.5)', borderColor: 'rgba(112,187,252,.5)' },
                    emphasis: { areaColor: 'rgba(2,37,101,.8)' }
                }
            },
            series: [{
                name: '气泡',
                type: 'scatter',
                coordinateSystem: 'geo',
                zlevel: 3,
                data: data,
                symbolSize: function (val, p) {
                    var b = (p && p.data && p.data.biz) || 0;
                    return 8 + Math.round(Math.min(1, b / maxBiz) * 30);
                },
                label: { normal: { show: false }, emphasis: { show: false } },
                itemStyle: { normal: { borderColor: 'rgba(255,255,255,.45)', borderWidth: 1, opacity: .92 } }
            }]
        }, true);
        var bc = document.getElementById('insCrumb');
        bc.innerHTML = '<b>全国</b><span class="hint">（点击省份弹出城市详情）</span>' +
            '<span class="hint" style="margin-left:12px;">● 圆越大 = 订单越多 ｜ 颜色越暖 = 渗透率越高</span>';
    }

    function onMapClick(p) {
        if (!p || !p.name) return;
        var full = fullProv(p.name);
        var tot = agg.prov[full] || 0;
        if (!tot) return;
        openCity(full);
    }

    /* ── 城市下钻弹窗 ── */
    var cityChart = null;
    function openCity(provFull) {
        var modal = document.getElementById('insModal');
        var box = document.getElementById('insModalMap');
        if (!modal || !box) return;
        var info = PROV_ADCODE[shortProv(provFull)];
        var mapName = 'insCity';
        if (info && window.GEO_DATA) {
            var geo = window.GEO_DATA[info.adcode + (info.single ? '' : '_full')];
            if (geo) {
                try { echarts.registerMap(mapName, geo); } catch (e) { }
                cpCache[mapName] = null;   // 换省必须清质心缓存，否则沿用上一个省的城市坐标
            }
        }
        document.getElementById('insModalTitle').textContent = shortProv(provFull) + ' · 城市分布';
        modal.style.display = 'flex';

        setTimeout(function () {
            if (!cityChart) {
                cityChart = echarts.init(box, null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
            }
            cityChart.resize();
            var src = cityData(provFull);
            var cps = centroidsOf(mapName);
            var maxBiz = 1, maxRate = src.max || 1;
            src.list.forEach(function (x) { if (x.biz > maxBiz) maxBiz = x.biz; });
            var data = src.list.map(function (x) {
                var cp = cps[x.name];
                if (!cp) return null;
                return { name: x.name, value: [cp[0], cp[1], x.rate], biz: x.biz, total: x.total, rate: x.rate };
            }).filter(Boolean);
            // 右侧：城市 + 业务订单数
            var lm = document.getElementById('insModalList');
            if (lm) {
                var arr = src.list.slice().sort(function (a, b) { return b.biz - a.biz || b.total - a.total; });
                lm.innerHTML = '<div class="iml-hd">' + esc(shortProv(provFull)) + ' · 城市 · ' + TITLE + '订单</div>' +
                    arr.map(function (x) {
                        return '<div class="iml-row"><span class="iml-n">' + esc(x.name) + '</span>' +
                            '<span class="iml-v' + (x.biz ? '' : ' zero') + '">' + x.biz + '</span></div>';
                    }).join('') +
                    '<div class="iml-row" style="border-top:1px solid rgba(47,137,207,.35);border-bottom:none;margin-top:4px;">' +
                    '<span class="iml-n" style="color:#9fe8ff;">合计</span>' +
                    '<span class="iml-v">' + arr.reduce(function (s, x) { return s + x.biz; }, 0) + '</span></div>';
            }

            cityChart.setOption({
                tooltip: {
                    trigger: 'item', confine: true, backgroundColor: 'rgba(2,24,61,.94)',
                    borderColor: 'rgba(47,137,207,.8)', borderWidth: 1, padding: 8,
                    extraCssText: 'box-shadow:0 0 20px rgba(47,137,207,.4);border-radius:8px;',
                    formatter: tooltipFmt
                },
                visualMap: {
                    show: true, dimension: 2, min: 0, max: Math.max(1, Math.ceil(maxRate)),
                    right: 20, top: 8, orient: 'horizontal', text: ['高', '低'], calculable: false,
                    itemWidth: 12, itemHeight: 70,
                    textStyle: { color: 'rgba(223,244,255,.75)', fontSize: 11 },
                    inRange: { color: ['#1b4a7a', '#2f89cf', '#7ee3ff', '#ffe082'] }
                },
                geo: {
                    map: mapName, roam: false,
                    layoutCenter: ['50%', '50%'], layoutSize: '100%',
                    label: { normal: { show: true, color: 'rgba(255,255,255,.72)', fontSize: 10 } },
                    itemStyle: {
                        normal: { areaColor: 'rgba(2,37,101,.5)', borderColor: 'rgba(112,187,252,.5)' },
                        emphasis: { areaColor: 'rgba(2,37,101,.8)' }
                    }
                },
                series: [{
                    type: 'scatter', coordinateSystem: 'geo', zlevel: 3, data: data,
                    symbolSize: function (val, p) {
                        var b = (p && p.data && p.data.biz) || 0;
                        return 10 + Math.round(Math.min(1, b / maxBiz) * 36);
                    },
                    itemStyle: { normal: { borderColor: 'rgba(255,255,255,.45)', borderWidth: 1, opacity: .92 } },
                    emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 2, opacity: 1 } },
                    label: {
                        normal: {
                            show: true, position: 'bottom', distance: 2,
                            formatter: function (p) { return p.data && p.data.biz ? p.data.biz : ''; },
                            color: '#eaf6ff', fontSize: 11, fontWeight: 'bold'
                        },
                        emphasis: { show: true }
                    }
                }]
            }, true);
        }, 30);
    }
    function closeCity() {
        var modal = document.getElementById('insModal');
        if (modal) modal.style.display = 'none';
    }
    $(document).on('click', '#insModalClose, #insModalMask', closeCity);
    $(document).on('keydown', function (e) { if (e.keyCode === 27) closeCity(); });

    /* ── 表格 ── */
    function renderTable() {
        // 当前层级：全国 → AM×省份；省份 → AM×城市
        var isCity = false;
        var map = {};
        if (!isCity) {
            Object.keys(agg.prov).forEach(function (full) {
                if (agg.prov[full] <= 0) return;
                map['ALL|' + full] = { am: '全部', area: full, total: agg.prov[full], biz: 0 };
            });
            // 按 AM 拆分（用 rows 的 prov+am）
            var byAmProv = {};
            agg.rows.forEach(function (r) {
                var k = r.am + '|' + r.prov;
                byAmProv[k] = (byAmProv[k] || 0) + 1;
            });
            // 总订单按 AM×省份 也需要 → 从 denom 重算
            var deAP = {};
            Object.keys(I.denom).forEach(function (k) {
                var p = k.split('|');
                if (p[0] < ym1() || p[0] > ym2()) return;
                if (st.am !== 'ALL' && p[1] !== st.am) return;
                var kk = p[1] + '|' + p[2];
                deAP[kk] = (deAP[kk] || 0) + I.denom[k];
            });
            map = {};
            Object.keys(deAP).forEach(function (kk) {
                var p = kk.split('|');
                map[kk] = { am: p[0] || '未知', area: p[1], total: deAP[kk], biz: byAmProv[kk] || 0 };
            });
            // 补上只有业务订单但无分母的（异常兜底）
            Object.keys(byAmProv).forEach(function (kk) {
                if (!map[kk]) {
                    var p = kk.split('|');
                    map[kk] = { am: p[0] || '未知', area: p[1], total: 0, biz: byAmProv[kk] };
                }
            });
        } else {
            var byAmCity = {};
            agg.rows.forEach(function (r) {
                if (r.prov !== st.prov) return;
                var k = r.am + '|' + r.city;
                byAmCity[k] = (byAmCity[k] || 0) + 1;
            });
            var deAC = {};
            Object.keys(I.denom).forEach(function (k) {
                var p = k.split('|');
                if (p[0] < ym1() || p[0] > ym2()) return;
                if (st.am !== 'ALL' && p[1] !== st.am) return;
                if (p[2] !== st.prov) return;
                var kk = p[1] + '|' + p[3];
                deAC[kk] = (deAC[kk] || 0) + I.denom[k];
            });
            Object.keys(deAC).forEach(function (kk) {
                var p = kk.split('|');
                map[kk] = { am: p[0] || '未知', area: p[1], total: deAC[kk], biz: byAmCity[kk] || 0 };
            });
            Object.keys(byAmCity).forEach(function (kk) {
                if (!map[kk]) { var p = kk.split('|'); map[kk] = { am: p[0] || '未知', area: p[1], total: 0, biz: byAmCity[kk] }; }
            });
        }
        var list = Object.keys(map).map(function (k) { return map[k]; })
            .filter(function (x) { return x.biz > 0 || x.total > 0; })
            .sort(function (a, b) { return b.biz - a.biz || b.total - a.total; });

        var h = '<table class="pt pt-ov"><thead><tr>' +
            '<th>AM</th><th class="pt-lbl">' + (isCity ? '城市' : '省份') + '</th><th>总订单</th><th>' + TITLE + '订单</th><th>占比%</th>' +
            '</tr></thead><tbody>';
        if (!list.length) {
            h += '<tr><td colspan="5" style="text-align:center;color:rgba(255,255,255,.45);padding:16px 0;">所选条件无数据</td></tr>';
        }
        list.forEach(function (x) {
            h += '<tr>' +
                '<td>' + esc(x.am) + '</td>' +
                '<td class="pt-lbl">' + esc(x.area) + '</td>' +
                '<td>' + thousands(x.total) + '</td>' +
                '<td style="color:#4fe3ff;font-weight:700;">' + thousands(x.biz) + '</td>' +
                '<td>' + pct(x.biz, x.total) + '</td>' +
                '</tr>';
        });
        h += '</tbody></table>';
        document.getElementById('insTbl').innerHTML = h;
        document.getElementById('insTblSub').textContent =
            (isCity ? esc(st.prov) + ' · ' : '') + list.length + ' 行';
    }

    function renderAll() {
        readFilter();
        compute();
        renderCards();
        renderMap();
        renderTable();
    }

    // 初始化
    if (!window.echarts) { document.getElementById('insMap').innerHTML = '<div class="ins-empty">图表库未加载</div>'; return; }
    if (!window.GEO_DATA) { console.warn('GEO_DATA 未加载，城市下钻将不可用'); }
    chart = echarts.init(document.getElementById('insMap'), null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
    window.addEventListener('resize', function () { if (chart) chart.resize(); });
    $(document).on('boardfs', function () { setTimeout(function () { if (chart) chart.resize(); }, 60); });

    renderAll();
});

// ── AI 总结（构建时生成，见 build_data.js buildSummaries） ──
$(function () {
    var el = document.getElementById('insAI');
    if (!el) return;
    var s = (window.BOARD_DATA && window.BOARD_DATA.INSURANCE && window.BOARD_DATA.INSURANCE.ai || {})[(window.INS_CFG || {}).key] || '';
    if (!s) {
        el.innerHTML = '<div class="ib-hd"><span class="ib-tag">AI 总结</span></div><div class="ib-txt ib-empty">暂无总结（构建时未生成）</div>';
        return;
    }
    el.innerHTML = '<div class="ib-hd"><span class="ib-tag">AI 总结</span><span class="ib-time">数据截止 ' + (window.BOARD_DATA.INSURANCE.aiAt || '') + '</span><button class="ib-toggle" type="button">展开</button></div>' +
        '<div class="ib-txt">' + String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '</div>';
});

// 展开/收起 AI 总结
$(document).on('click', '.ib-toggle', function () {
    var bar = $(this).closest('.insight-bar');
    bar.toggleClass('expanded');
    $(this).text(bar.hasClass('expanded') ? '收起' : '展开');
});
