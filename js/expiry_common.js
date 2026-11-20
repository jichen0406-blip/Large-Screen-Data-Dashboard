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

        // ── 月份集合（按订单月 ym 自适应）──
        var YMS = ALL.map(function (r) { return r.ym; }).filter(Boolean).sort();
        var st = { am: '__all' };
        var RG = null;   // 时间区间控件（全站统一，见 项目文档 §10.5）

        // ── 控制区 ──
        function renderControls() {
            var el = document.getElementById('expCtl');
            if (!el) return;
            var ams = {};
            ALL.forEach(function (r) { if (r.am) ams[r.am] = true; });
            var h = '<span class="exp-lab">下单年月区间</span>' +
                '<select id="expY1" class="pt-sel" title="开始年"></select><select id="expM1" class="pt-sel" title="开始月"></select>' +
                '<span class="exp-sep">~</span>' +
                '<select id="expY2" class="pt-sel" title="结束年"></select><select id="expM2" class="pt-sel" title="结束月"></select>' +
                '<span class="exp-sep">|</span><span class="exp-lab">AM</span>' +
                '<select id="expAM" class="pt-sel"><option value="__all">全部 AM</option>' +
                Object.keys(ams).sort().map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('') +
                '</select><span class="exp-cnt" id="expCnt"></span>';
            el.innerHTML = h;
            // 默认区间 = 有数据的月份范围（这批订单可能下单很早，收窄成 YTD 会把超龄单藏起来）
            var M0 = YMS.length ? YMS[0] : TR.nowYm(), M1 = YMS.length ? YMS[YMS.length - 1] : TR.nowYm();
            RG = TR.init({
                y1: '#expY1', m1: '#expM1', y2: '#expY2', m2: '#expM2',
                months: YMS, dp: B.DP,
                defaultY1: +M0.slice(0, 4), defaultM1: +M0.slice(5, 7),
                defaultY2: +M1.slice(0, 4), defaultM2: +M1.slice(5, 7),
                sameYear: false,               // 逐单明细页：允许跨月跨年
                storageKey: 'qual_range',
                onChange: render
            });
            document.getElementById('expAM').addEventListener('change', render);
        }
        function rowsIn() {
            var rg = RG.read();
            return ALL.filter(function (r) {
                if (!r.ym || !TR.inRange(r.ym, rg)) return false;
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
            BoardXLS.exportAoa(aoa, CFG.title || pn, { sheet: CFG.title, cols: cols.map(function (c) { return { wch: c.txt ? 40 : 14 }; }) });
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
            var $AM = document.getElementById('expAM');
            if (!$AM) return;
            st.am = $AM.value;
        }

        // ── 初始化 ──
        renderControls();
        render();
        $(window).on('resize', function () { if (chart) chart.resize(); });
    });
})();
