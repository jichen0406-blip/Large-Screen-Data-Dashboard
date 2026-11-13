// expiry_common.js — 质量过期订单两页共用：冻存过期订单（qual_cryo）/ 生产过期订单（qual_prod）
// 数据：BOARD_DATA.ABN_MGMT.pages.noproduction（已单采未转生产）/ noreinfusion（已放行未回输）
//   months = 今天 − 基准时间（冻存=仓库接收单采血时间、生产=质量放行时间），构建时算好；risk 由 ABN_EXPIRE / ABN_WARN 判定
// 本页只展示「临期 + 过期」：冻存月龄 ≥9（效期 12 月）、生产月龄 ≥3（效期 6 月）
(function () {
    $(function () {
        var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
        var P = B && B.ABN_MGMT && B.ABN_MGMT.pages;
        if (!P) return;
        var CFG = {
            qual_cryo: { src: 'noproduction', minM: 9, expire: 12, kind: '冻存', baseLabel: '单采血入库时间', title: '冻存过期订单' },
            qual_prod: { src: 'noreinfusion', minM: 3, expire: 6, kind: '生产', baseLabel: '质量放行时间', title: '生产过期订单' }
        }[window.PAGE_KEY];
        if (!CFG) return;

        var ALL = ((P[CFG.src] || {}).rows || []).filter(function (r) { return r.months >= CFG.minM; });
        var C_RED = '#ff4d4f', C_AMBER = '#ffb800', C_CYAN = '#4fe3ff';

        function pad2(n) { return (n < 10 ? '0' : '') + n; }
        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
        function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
        function pct(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '0%'; }

        // ── 年月选项（按订单月 ym 自适应）──
        var YMS = ALL.map(function (r) { return r.ym; }).filter(Boolean).sort();
        var YEARS = [], byYear = {};
        YMS.forEach(function (ym) {
            var y = ym.slice(0, 4), m = +ym.slice(5, 7);
            if (!byYear[y]) { byYear[y] = []; YEARS.push(y); }
            if (byYear[y].indexOf(m) < 0) byYear[y].push(m);
        });
        YEARS.sort();
        Object.keys(byYear).forEach(function (y) { byYear[y].sort(function (a, b) { return a - b; }); });

        // 默认区间 = 全部（超龄单可能下单很早，默认收窄会把它们藏起来）
        var st = {
            y1: YMS.length ? YMS[0].slice(0, 4) : '', m1: YMS.length ? +YMS[0].slice(5, 7) : 1,
            y2: YMS.length ? YMS[YMS.length - 1].slice(0, 4) : '', m2: YMS.length ? +YMS[YMS.length - 1].slice(5, 7) : 12,
            am: '__all'
        };

        function fillYears(sel, val) {
            sel.innerHTML = YEARS.map(function (y) { return '<option value="' + y + '">' + y + ' 年</option>'; }).join('');
            sel.value = val;
        }
        function fillMonths(sel, y, val) {
            var ms = byYear[y] || [1];
            sel.innerHTML = ms.map(function (m) { return '<option value="' + m + '">' + m + ' 月</option>'; }).join('');
            sel.value = String(val);
        }

        // ── 控制区 ──
        function renderControls() {
            var el = document.getElementById('expCtl');
            if (!el) return;
            var ams = {};
            ALL.forEach(function (r) { if (r.am) ams[r.am] = true; });
            var h = '<span class="exp-lab">下单年月</span>' +
                '<select id="expY1" class="pt-sel"></select><select id="expM1" class="pt-sel"></select>' +
                '<span class="exp-sep">~</span>' +
                '<select id="expY2" class="pt-sel"></select><select id="expM2" class="pt-sel"></select>' +
                '<span class="exp-sep">|</span><span class="exp-lab">AM</span>' +
                '<select id="expAM" class="pt-sel"><option value="__all">全部 AM</option>' +
                Object.keys(ams).sort().map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('') +
                '</select><span class="exp-cnt" id="expCnt"></span>';
            el.innerHTML = h;
            var $Y1 = document.getElementById('expY1'), $M1 = document.getElementById('expM1');
            var $Y2 = document.getElementById('expY2'), $M2 = document.getElementById('expM2');
            fillYears($Y1, st.y1); fillMonths($M1, st.y1, st.m1);
            fillYears($Y2, st.y2); fillMonths($M2, st.y2, st.m2);
            $Y1.addEventListener('change', function () { fillMonths($M1, $Y1.value, 1); render(); });
            $Y2.addEventListener('change', function () { fillMonths($M2, $Y2.value, 12); render(); });
            [$M1, $M2, document.getElementById('expAM')].forEach(function (x) { x.addEventListener('change', render); });
        }
        function ym1() { return st.y1 + '-' + pad2(st.m1); }
        function ym2() { return st.y2 + '-' + pad2(st.m2); }
        function rowsIn() {
            var a = ym1(), b = ym2();
            if (a > b) { var t = a; a = b; b = t; }   // 起止颠倒自动对调
            return ALL.filter(function (r) {
                if (!r.ym || r.ym < a || r.ym > b) return false;
                if (st.am !== '__all' && r.am !== st.am) return false;
                return true;
            });
        }

        // ── 卡片：总单数 / 已过期 / 临期 ──
        function renderCards(rows) {
            var el = document.getElementById('expCards');
            if (!el) return;
            var total = rows.length;
            var exp = rows.filter(function (r) { return r.risk === '已过期'; }).length;
            var near = rows.filter(function (r) { return r.risk === '即将过期'; }).length;
            var oldMax = rows.reduce(function (a, r) { return Math.max(a, r.months); }, 0);
            function card(label, val, sub, color) {
                return '<div class="kpi-card" style="--ac:' + color + '">' +
                    '<div class="kc-label">' + label + '</div>' +
                    '<div class="kc-val">' + val + '</div>' +
                    '<div class="kc-sub">' + sub + '</div></div>';
            }
            el.innerHTML =
                card('总单数', total + '<small>单</small>', '最久 ' + (total ? fmt1(oldMax) : 0) + ' 个月龄', C_CYAN) +
                card('已过期', exp + '<small>单</small>', '≥ ' + CFG.expire + ' 个月 · 占 ' + pct(exp, total), C_RED) +
                card('临期', near + '<small>单</small>', CFG.minM + '~' + CFG.expire + ' 个月 · 占 ' + pct(near, total), C_AMBER);
        }

        // ── 柱状图：横轴 = 月龄（整数），过期红 / 临期橙 ──
        var chart = null;
        function monthCats() {
            if (!ALL.length) return [];
            var maxM = Math.max.apply(null, ALL.map(function (r) { return Math.floor(r.months); }));
            var out = [];
            for (var m = CFG.minM; m <= maxM; m++) out.push(m);
            return out;
        }
        function renderChart(rows) {
            var el = document.getElementById('expChart');
            if (!el || typeof echarts === 'undefined') return;
            if (!chart) chart = echarts.init(el, null, { devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2) });
            var cats = monthCats();
            var cnt = {};
            rows.forEach(function (r) { var m = Math.floor(r.months); cnt[m] = (cnt[m] || 0) + 1; });
            var data = cats.map(function (m) { return cnt[m] || 0; });
            chart.setOption({
                backgroundColor: 'transparent',
                animationDuration: 300,
                grid: { left: 12, right: 16, top: 24, bottom: 4, containLabel: true },
                tooltip: {
                    trigger: 'axis', axisPointer: { type: 'shadow' },
                    backgroundColor: 'rgba(2,24,61,.95)', borderColor: 'rgba(47,137,207,.8)',
                    textStyle: { color: '#daf9ff', fontSize: 12 },
                    formatter: function (ps) {
                        var p = ps[0]; if (!p) return '';
                        var m = cats[p.dataIndex];
                        var tag = m >= CFG.expire ? '已过期' : '临期';
                        return '<b>' + m + ' 个月龄</b>（' + tag + '）<br/>' + CFG.kind + '订单：<b>' + p.value + '</b> 单';
                    }
                },
                xAxis: {
                    type: 'category', data: cats.map(function (m) { return m + ' 月'; }),
                    axisLine: { lineStyle: { color: 'rgba(112,187,252,.5)' } }, axisTick: { show: false },
                    axisLabel: { color: '#9fc6e8', fontSize: 11, interval: 0 }
                },
                yAxis: {
                    type: 'value', minInterval: 1, name: '单数', nameTextStyle: { color: '#9fc6e8', fontSize: 11 },
                    axisLine: { show: false }, axisTick: { show: false },
                    axisLabel: { color: '#9fc6e8', fontSize: 11 },
                    splitLine: { lineStyle: { color: 'rgba(112,187,252,.12)' } }
                },
                series: [{
                    type: 'bar', barMaxWidth: 28,
                    data: data.map(function (v, i) {
                        return { value: v, itemStyle: { color: cats[i] >= CFG.expire ? C_RED : C_AMBER, borderRadius: [3, 3, 0, 0] } };
                    }),
                    label: { show: true, position: 'top', color: '#daf9ff', fontSize: 10, formatter: function (p) { return p.value || ''; } }
                }]
            }, true);
        }

        // ── 明细表（页面与导出共用同一份列定义）──
        function tableCols() {
            return [
                { t: '细胞追溯码', v: function (r) { return r.code || '--'; } },
                { t: '合同号', v: function (r) { return r.no || '--'; } },
                { t: '订单月', v: function (r) { return r.ym || '--'; } },
                { t: '患者名称', v: function (r) { return r.patient || '--'; } },
                { t: 'Region', v: function (r) { return r.area || '--'; } },
                { t: 'AM', v: function (r) { return r.am || '--'; } },
                { t: '省份', v: function (r) { return r.prov || '--'; } },
                { t: '城市', v: function (r) { return r.city || '--'; } },
                { t: '医院名称', v: function (r) { return r.hosp || '未知医院'; }, lbl: true },
                { t: '订单状态', v: function (r) { return r.status || '--'; } },
                { t: CFG.baseLabel, v: function (r) { return r.baseTime || '--'; } },
                { t: '月龄（月）', v: function (r) { return r.months; }, cls: 'exp-age' },
                { t: '风险', v: function (r) { return r.risk || '--'; }, risk: true },
                { t: '原因', v: function (r) { return r.reason || '--'; }, txt: true },
                { t: '行动计划', v: function (r) { return r.action || '--'; }, txt: true },
                { t: '预估时间', v: function (r) { return r.planTime || '--'; }, txt: true }
            ];
        }
        function riskHtml(v) {
            if (!v) return '<span class="abn-blank">--</span>';
            var c = v === '已过期' ? C_RED : (v === '即将过期' ? C_AMBER : '#62c98d');
            var ico = v === '已过期' ? '⛔' : (v === '即将过期' ? '⚠️' : '✅');
            return '<span class="abn-risk" style="color:' + c + '">' + ico + ' ' + esc(v) + '</span>';
        }
        function renderTable(rows) {
            var cols = tableCols();
            var sorted = rows.slice().sort(function (a, b) { return b.months - a.months; });
            var cnt = document.getElementById('expCnt');
            if (cnt) cnt.innerHTML = '共 <b>' + sorted.length + '</b> 条';
            var h = '<table class="pt exp-tbl"><thead><tr>' +
                cols.map(function (c) { return '<th>' + esc(c.t) + '</th>'; }).join('') +
                '</tr></thead><tbody>';
            if (!sorted.length) {
                h += '<tr><td colspan="' + cols.length + '" class="abn-empty">当前筛选下没有订单</td></tr>';
            } else {
                sorted.forEach(function (r) {
                    h += '<tr>' + cols.map(function (c) {
                        var cls = c.lbl ? ' class="pt-lbl"' : (c.cls ? ' class="' + c.cls + '"' : (c.txt ? ' class="abn-txt" title="' + esc(c.v(r)) + '"' : ''));
                        var val = c.risk ? riskHtml(r.risk) : esc(c.v(r));
                        return '<td' + cls + '>' + val + '</td>';
                    }).join('') + '</tr>';
                });
            }
            document.getElementById('expTbl').innerHTML = h + '</tbody></table>';
            window.__expRows = sorted;
        }

        // ── 导出当前筛选结果（列与页面一致）──
        function exportExcel() {
            var rows = window.__expRows || [];
            if (!rows.length) { alert('当前无可导出的记录。'); return; }
            var cols = tableCols();
            var aoa = [cols.map(function (c) { return c.t; })];
            rows.forEach(function (r) { aoa.push(cols.map(function (c) { return c.v(r); })); });
            var pn = (typeof BoardXLS !== 'undefined' && BoardXLS.pageName) ? BoardXLS.pageName() : CFG.title;
            BoardXLS.exportAoa(aoa, pn, { sheet: CFG.title, cols: cols.map(function (c) { return { wch: c.txt ? 40 : 14 }; }) });
        }
        (window.BOARD_XLS_CUSTOM = window.BOARD_XLS_CUSTOM || {})['expTbl'] = exportExcel;

        // ── 统一重绘：每次先读筛选控件，再重算三块 ──
        function render() {
            readState();
            var rows = rowsIn();
            renderCards(rows);
            renderChart(rows);
            renderTable(rows);
        }
        function readState() {
            var $Y1 = document.getElementById('expY1'), $M1 = document.getElementById('expM1');
            var $Y2 = document.getElementById('expY2'), $M2 = document.getElementById('expM2'), $AM = document.getElementById('expAM');
            if (!$Y1) return;
            st.y1 = $Y1.value; st.m1 = +$M1.value; st.y2 = $Y2.value; st.m2 = +$M2.value; st.am = $AM.value;
        }

        // ── 初始化 ──
        renderControls();
        render();
        $(window).on('resize', function () { if (chart) chart.resize(); });
    });
})();
