
$(function () {
    map();
    function map() {
        // 基于准备好的dom，初始化echarts实例
        var myChart = echarts.init(document.getElementById('map'));

        // ═══ 数据源：js/data.js 中的 BOARD_DATA（由 build_data.js 每日生成） ═══
        var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;

        // 顶部指标条：YTD 下单 / 回输 / 单采 / 放行（数字滚动动画）
        if (B && typeof countUp === 'function') {
            countUp(document.getElementById('navO'), B.YTD.O);
            countUp(document.getElementById('navR'), B.YTD.R);
            countUp(document.getElementById('navA'), B.YTD.A);
            countUp(document.getElementById('navQ'), B.YTD.Q);
        }

        // ═══ 城市坐标（来自 masterdata 城市字段取值） ═══
        var geoCoordMap = {
            '上海市': [121.48, 31.22],
            '东莞市': [113.75, 23.04],
            '佛山市': [113.11, 23.05],
            '北京市': [116.46, 39.92],
            '南京市': [118.78, 32.04],
            '南充市': [106.110698, 30.837793],
            '南宁市': [108.33, 22.84],
            '南昌市': [115.89, 28.68],
            '南通市': [121.05, 32.08],
            '厦门市': [118.1, 24.46],
            '台州市': [121.420757, 28.656386],
            '合肥市': [117.27, 31.86],
            '哈尔滨市': [126.63, 45.75],
            '嘉兴市': [120.76, 30.77],
            '大连市': [121.62, 38.92],
            '天津市': [117.2, 39.13],
            '太原市': [112.53, 37.87],
            '宁波市': [121.56, 29.86],
            '常州市': [119.95, 31.79],
            '广州市': [113.23, 23.16],
            '惠州市': [114.4, 23.09],
            '成都市': [104.06, 30.67],
            '无锡市': [120.29, 31.59],
            '昆明市': [102.73, 25.04],
            '杭州市': [120.19, 30.26],
            '武汉市': [114.31, 30.52],
            '江门市': [113.06, 22.61],
            '沈阳市': [123.38, 41.8],
            '洛阳市': [112.44, 34.7],
            '济南市': [117.0, 36.65],
            '深圳市': [114.07, 22.62],
            '温州市': [120.65, 28.01],
            '湖州市': [120.1, 30.86],
            '湛江市': [110.359377, 21.270708],
            '福州市': [119.3, 26.08],
            '绍兴市': [120.58, 30.01],
            '苏州市': [120.62, 31.32],
            '荆州市': [112.239741, 30.335165],
            '西安市': [108.95, 34.27],
            '郑州市': [113.65, 34.76],
            '重庆市': [106.54, 29.59],
            '长春市': [125.35, 43.88],
            '长沙市': [113.0, 28.21],
            '青岛市': [120.33, 36.07],
            '香港': [114.17, 22.28]
        };

        // ═══ 组装城市散点数据（点大小 = 下单 + 回输） ═══
        var cityList = [];
        if (B && B.CITY) {
            Object.keys(B.CITY).forEach(function (c) {
                cityList.push({ name: c, o: B.CITY[c].o || 0, r: B.CITY[c].r || 0 });
            });
        } else {
            // 没有数据文件时的演示数据（运行 node build_data.js 后自动替换）
            cityList = [
                { name: '天津市', o: 45, r: 34 },
                { name: '北京市', o: 39, r: 29 },
                { name: '上海市', o: 37, r: 26 },
                { name: '广州市', o: 18, r: 12 },
                { name: '杭州市', o: 12, r: 9 }
            ];
        }

        var data = cityList.map(function (it) {
            var coord = geoCoordMap[it.name];
            if (!coord) {
                console.warn('⚠️ 城市无坐标，已跳过: ' + it.name);
                return null;
            }
            if ((it.o + it.r) <= 0) return null; // 无下单无回输的城市不显示圆点
            return {
                name: it.name,
                value: coord.concat(it.o + it.r),
                o: it.o,
                r: it.r
            };
        }).filter(function (it) { return it; });

        var option = {
            title: {
                text: '城市销量分布（YTD）',
                subtext: '数据源：bs_order  |  点击省份可查看城市数据明细',
                left: 'center',
                textStyle: {
                    color: '#fff'
                }
            },
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
                },
                position: function (point, params, dom, rect, size) {
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
            },

            geo: {
                map: 'china',
                label: {
                    emphasis: {
                        show: false
                    }
                },
                roam: false,
                zoom: 1.2,
                itemStyle: {
                    normal: {
                        areaColor: 'rgba(2,37,101,.5)',
                        borderColor: 'rgba(112,187,252,.5)'
                    },
                    emphasis: {
                        areaColor: 'rgba(2,37,101,.8)'
                    }
                }
            },
            series: [
                {
                    name: '城市',
                    type: 'scatter',
                    coordinateSystem: 'geo',
                    data: data,
                    symbolSize: function (val) {
                        return Math.max(8, Math.min(38, Math.round(val[2] * 0.45)));
                    },
                    label: {
                        normal: {
                            formatter: '{b}',
                            position: 'right',
                            show: false
                        },
                        emphasis: {
                            show: true
                        }
                    },
                    itemStyle: {
                        normal: {
                            color: '#ffeb7b'
                        }
                    }
                }

            ]
        };

        myChart.setOption(option);
        window.addEventListener("resize", function () {
            myChart.resize();
        });

        // ═══ 自动轮播：每 10s 随机展示一个城市的数据（模拟点击该城市） ═══
        var playTimer = null, tipTimer = null, paused = false, panelOpen = false;
        function hideCityTip() {
            myChart.dispatchAction({ type: 'hideTip' });
            myChart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
        }
        // 轮播顺序：按省份自上而下（纬度从大到小），同省内城市纬度从大到小
        var playOrder = [];
        (function() {
            var groups = {};
            data.forEach(function(d) {
                var p = (B && B.CITY_PROV) ? B.CITY_PROV[d.name] : '';
                p = p || d.name;
                if (!groups[p]) groups[p] = [];
                groups[p].push(d);
            });
            var provs = Object.keys(groups).map(function(p) {
                var lat = groups[p].reduce(function(s, d) { return s + d.value[1]; }, 0) / groups[p].length;
                return { lat: lat, cities: groups[p] };
            }).sort(function(a, b) { return b.lat - a.lat; });
            provs.forEach(function(p) {
                p.cities.sort(function(a, b) { return b.value[1] - a.value[1]; });
                p.cities.forEach(function(c) { playOrder.push(c); });
            });
        })();
        var playIdx = 0;
        function showNextCity() {
            if (paused) return;
            if (!playOrder.length) return;
            var d = playOrder[playIdx % playOrder.length];
            playIdx++;
            var idx = data.indexOf(d);
            myChart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
            myChart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
            clearTimeout(tipTimer);
            tipTimer = setTimeout(hideCityTip, 3000);
        }
        function startAuto() { if (panelOpen) return; paused = false; if (!playTimer) playTimer = setInterval(showNextCity, 5000); }
        function stopAuto() { paused = true; clearInterval(playTimer); playTimer = null; clearTimeout(tipTimer); hideCityTip(); }
        // 登录后才启动地图轮播：未登录时只挂全局启动函数，由登录脚本密码校验通过后调用
        window.startBoardAuto = function () { startAuto(); showNextCity(); };
        if (sessionStorage.getItem('board_authed') === '1') window.startBoardAuto();
        $('#map').on('mouseenter', stopAuto).on('mouseleave', startAuto);

        // ═══ 省份城市地图浮窗（点击省份 → 阿里 DataV GeoAtlas 拉取城市边界） ═══
        var PROV_ADCODE = {
            '北京': { adcode: 110000, full: '北京市', single: true },
            '天津': { adcode: 120000, full: '天津市', single: true },
            '河北': { adcode: 130000, full: '河北省' },
            '山西': { adcode: 140000, full: '山西省' },
            '内蒙古': { adcode: 150000, full: '内蒙古自治区' },
            '辽宁': { adcode: 210000, full: '辽宁省' },
            '吉林': { adcode: 220000, full: '吉林省' },
            '黑龙江': { adcode: 230000, full: '黑龙江省' },
            '上海': { adcode: 310000, full: '上海市', single: true },
            '江苏': { adcode: 320000, full: '江苏省' },
            '浙江': { adcode: 330000, full: '浙江省' },
            '安徽': { adcode: 340000, full: '安徽省' },
            '福建': { adcode: 350000, full: '福建省' },
            '江西': { adcode: 360000, full: '江西省' },
            '山东': { adcode: 370000, full: '山东省' },
            '河南': { adcode: 410000, full: '河南省' },
            '湖北': { adcode: 420000, full: '湖北省' },
            '湖南': { adcode: 430000, full: '湖南省' },
            '广东': { adcode: 440000, full: '广东省' },
            '广西': { adcode: 450000, full: '广西壮族自治区' },
            '海南': { adcode: 460000, full: '海南省' },
            '重庆': { adcode: 500000, full: '重庆市', single: true },
            '四川': { adcode: 510000, full: '四川省' },
            '贵州': { adcode: 520000, full: '贵州省' },
            '云南': { adcode: 530000, full: '云南省' },
            '西藏': { adcode: 540000, full: '西藏自治区' },
            '陕西': { adcode: 610000, full: '陕西省' },
            '甘肃': { adcode: 620000, full: '甘肃省' },
            '青海': { adcode: 630000, full: '青海省' },
            '宁夏': { adcode: 640000, full: '宁夏回族自治区' },
            '新疆': { adcode: 650000, full: '新疆维吾尔自治区' },
            '台湾': { adcode: 710000, full: '台湾省', single: true },
            '香港': { adcode: 810000, full: '香港特别行政区', single: true },
            '澳门': { adcode: 820000, full: '澳门特别行政区', single: true }
        };

        var provChart = null;
        function buildProvOption(pts) {
            return {
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
                    map: 'provCity',
                    roam: true,
                    silent: true,
                    label: {
                        normal: { show: true, color: '#fff', fontSize: 10 },
                        emphasis: { show: false }
                    },
                    itemStyle: {
                        normal: { areaColor: 'rgba(2,37,101,.75)', borderColor: 'rgba(112,187,252,.6)' },
                        emphasis: { areaColor: 'rgba(2,37,101,.9)' }
                    }
                },
                series: [{
                    name: '城市',
                    type: 'scatter',
                    coordinateSystem: 'geo',
                    data: pts,
                    symbolSize: function (val) { return Math.max(8, Math.min(30, Math.round(val[2] * 0.45))); },
                    label: {
                        normal: { show: false },
                        emphasis: { show: false }
                    },
                    itemStyle: { normal: { color: '#ffeb7b' } }
                }]
            };
        }
        // 右侧榜单：Top 5 下单 / 回输医院（不含同比）
        function renderList(id, list) {
            var el = document.getElementById(id);
            if (!el) return;
            if (!list || !list.length) { el.innerHTML = '<li class="prov-rank-empty">暂无数据</li>'; return; }
            var html = '';
            list.forEach(function(h, i) {
                html += '<li><span class="rk">' + (i + 1) + '</span><span class="hn" title="' + h.name + '">' + h.name + '</span><span class="hc">' + h.v + '</span></li>';
            });
            el.innerHTML = html;
        }
        function renderProvRank(listO, listR) {
            renderList('provRank', listO);
            renderList('provRankR', listR);
        }
        function openProvince(name) {
            var info = PROV_ADCODE[name];
            if (!info) return;
            panelOpen = true;
            stopAuto();
            renderProvRank(null, null);
            var fname = info.adcode + (info.single ? '.json' : '_full.json');
            var url = 'js/geo/' + fname; // 本地离线 GeoJSON（js/geo/ 下预下载）
            $('#provTitle').text(name);
            $('#provStats').text('');
            $('#provChart').empty();
            $('#provLoading').text('加载中…').show();
            $('#provPanel').show();
            fetch(url)
                .then(function (r) { return r.json(); })
                .then(function (geo) {
                    $('#provLoading').hide();
                    if (!geo || !geo.features) throw new Error('bad geojson');
                    var citySet = {};
                    geo.features.forEach(function (f) { citySet[f.properties.name] = true; });
                    var pts = [];
                    if (B && B.CITY) {
                        Object.keys(B.CITY).forEach(function (c) {
                            var coord = geoCoordMap[c];
                            if (!citySet[c] || !coord) return;
                            var o = B.CITY[c].o || 0, r = B.CITY[c].r || 0;
                            if ((o + r) <= 0) return;
                            pts.push({ name: c, value: coord.concat(o + r), o: o, r: r });
                        });
                    }
                    var provData = (B && B.PROV) ? (B.PROV[info.full] || null) : null;
                    $('#provStats').text(provData ? ('下单 ' + (provData.o || 0) + ' / 回输 ' + (provData.r || 0)) : '');
                    renderProvRank(
                        (B && B.HOSP_PROV && B.HOSP_PROV.O) ? (B.HOSP_PROV.O[info.full] || null) : null,
                        (B && B.HOSP_PROV && B.HOSP_PROV.R) ? (B.HOSP_PROV.R[info.full] || null) : null
                    );
                    echarts.registerMap('provCity', geo);
                    if (provChart) provChart.dispose();
                    provChart = echarts.init(document.getElementById('provChart'));
                    provChart.setOption(buildProvOption(pts));
                    setTimeout(function () { if (provChart) provChart.resize(); }, 60);
                })
                .catch(function () {
                    $('#provLoading').text('加载失败，请检查网络后重试').show();
                });
        }
        myChart.on('click', function (params) {
            if (params.componentType === 'geo' && params.name && PROV_ADCODE[params.name]) {
                openProvince(params.name);
            }
        });
        $('#provClose').on('click', function () { panelOpen = false; $('#provPanel').hide(); startAuto(); });
    }

})
