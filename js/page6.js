// page6.js — 省份&医院数据（key region3）：省份数据 / 医院数据（YTD + 同比；医院表含 COE 列/分类排序/筛选/搜索/汇总）
// 共享函数见 js/pt-common.js；时间控制 辖区1/2/3 共享（sessionStorage pt_time）
// 数据：window.BOARD_DATA.REGIONS.HOSP = 'YYYY-MM' → 'AM|省份|城市|医院' → {o,r}
//       REGIONS.HSLAST  = '省份|城市|医院名' → 'YYYY-MM-DD'（最近一次下单，不随时间控制器变动）
//       REGIONS.COEHOSP = '省份|城市|医院名' → 'SCOE|COE|RCOE|Others'（医院 COE 分类）
$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.REGIONS || !B.REGIONS.HOSP) return;
    var HOSP = B.REGIONS.HOSP;
    var HSLAST = B.REGIONS.HSLAST || {};
    var COEHOSP = B.REGIONS.COEHOSP || {};
    var DP = B.DP || '';
    var AMS = B.REGIONS.AMS || [];

    // ── 医院表筛选状态：COE 多选（默认全选）+ 医院名模糊搜索（实时） ──
    var COE_CATS = ['SCOE', 'COE', 'RCOE', 'Others'];
    var selCoe = {}; COE_CATS.forEach(function (c) { selCoe[c] = true; });
    var hsQuery = '';

    function coeOf(r) { return COEHOSP[r.prov + '|' + r.city + '|' + r.hosp] || 'Others'; }
    function coeRank(c) { var i = COE_CATS.indexOf(c); return i < 0 ? COE_CATS.length : i; }

    var yearKeys = {};
    Object.keys(HOSP).forEach(function (k) { yearKeys[k.slice(0, 4)] = true; });
    function updateAll() { renderTables(); }
    initPtTime('#p6y', '#p6m', yearKeys, updateAll);

    // 按年累计：key('AM|省份|城市|医院') → {o,r,lo,lr}（当前/去年 YTD 窗口）
    function accumulate(y, m) {
        var ly = y - 1, acc = {};
        for (var i = 1; i <= m; i++) {
            var ym = y + '-' + pad(i), lym = ly + '-' + pad(i);
            var b1 = HOSP[ym], b2 = HOSP[lym];
            if (b1) Object.keys(b1).forEach(function (key) {
                var v = acc[key] || (acc[key] = { o: 0, r: 0, lo: 0, lr: 0 });
                v.o += b1[key].o || 0; v.r += b1[key].r || 0;
            });
            if (b2) Object.keys(b2).forEach(function (key) {
                var v = acc[key] || (acc[key] = { o: 0, r: 0, lo: 0, lr: 0 });
                v.lo += b2[key].o || 0; v.lr += b2[key].r || 0;
            });
        }
        return acc;
    }

    // 当前时间窗内、有下单或回输的医院行（拆开 hospital key）
    function currentRows() {
        var y = parseInt($('#p6y').val(), 10), m = parseInt($('#p6m').val(), 10);
        var acc = accumulate(y, m), rows = [];
        Object.keys(acc).forEach(function (key) {
            var v = acc[key];
            if (!(v.o > 0 || v.r > 0)) return;
            var p = key.split('|');
            rows.push({ am: p[0], prov: p[1], city: p[2], hosp: p[3], o: v.o, r: v.r, lo: v.lo, lr: v.lr });
        });
        return rows;
    }

    function renderTables() {
        var rows = currentRows();
        renderHS(rows.slice()); // 传副本：renderHS 内部排序/加字段不影响省份表
        renderPV(rows);
    }

    // 空窗期 = 数据截止日 − 最近一次下单，单位天
    function gapDays(dp, d) {
        if (!dp || !d) return null;
        return Math.round((new Date(dp) - new Date(d)) / 86400000);
    }

    // COE 筛选药丸（多选；至少保留一个）
    function renderCoeLights() {
        var h = '';
        COE_CATS.forEach(function (c) {
            h += '<button type="button" class="cart-light' + (selCoe[c] ? ' on' : '') + '" data-coe="' + c + '">' + c + '</button>';
        });
        $('#p6coeLights').html(h);
    }

    // 医院数据：先按 COE 分类（SCOE→COE→RCOE→Others），分类内按下单量降序
    // 受 COE 筛选 + 医院名模糊搜索影响；表上方汇总当前可见行的 YTD下单/YTD回输
    function renderHS(rows) {
        rows.forEach(function (r) { r.coe = coeOf(r); });
        var visible = rows.filter(function (r) {
            if (!selCoe[r.coe]) return false;
            if (hsQuery && r.hosp.toLowerCase().indexOf(hsQuery) < 0) return false;
            return true;
        });
        visible.sort(function (a, b) {
            var d = coeRank(a.coe) - coeRank(b.coe);
            if (d) return d;
            if (b.o !== a.o) return b.o - a.o;
            return a.hosp < b.hosp ? -1 : 1;
        });

        // 汇总（仅 YTD下单 / YTD回输）
        var sumO = 0, sumR = 0;
        visible.forEach(function (r) { sumO += r.o; sumR += r.r; });
        $('#p6hsSum').html('<span class="p6-sum-lbl">当前可见 ' + visible.length + ' 家</span>' +
            '<span class="p6-sum-item">YTD下单 <b>' + sumO + '</b></span>' +
            '<span class="p6-sum-item">YTD回输 <b>' + sumR + '</b></span>');

        var h = '<table class="pt"><thead><tr>' +
            '<th>AM</th><th>省份</th><th>城市</th><th>医院名称</th><th>COE</th>' +
            '<th>YTD下单</th><th>下单同比</th><th>YTD回输</th><th>回输同比</th>' +
            '<th>最近一次下单日期</th><th>下单空窗期</th>' +
            '</tr></thead><tbody>';
        visible.forEach(function (r) {
            var ld = HSLAST[r.prov + '|' + r.city + '|' + r.hosp];
            var gap = gapDays(DP, ld);
            h += '<tr><td>' + r.am + '</td><td>' + r.prov + '</td><td>' + (r.city || '--') + '</td>' +
                '<td class="pt-lbl">' + r.hosp + '</td><td class="p6-coe p6-coe-' + r.coe.toLowerCase() + '">' + r.coe + '</td>' +
                '<td>' + (r.o > 0 ? r.o : '') + '</td><td>' + yoyStr(r.o, r.lo) + '</td>' +
                '<td>' + (r.r > 0 ? r.r : '') + '</td><td>' + yoyStr(r.r, r.lr) + '</td>' +
                '<td>' + (ld || '--') + '</td><td>' + (gap === null ? '--' : (gap > 90 ? '<span class="pt-gap-red">' + gap + '天</span>' : gap + '天')) + '</td></tr>';
        });
        h += '</tbody></table>';
        document.getElementById('p6tHS').innerHTML = h;
    }

    // 省份数据：按 AM 分组（REGIONS.AMS 顺序），组内下单量降序；下单医院数=YTD内有下单的医院去重
    function renderPV(rows) {
        var provAgg = {}; // 'am|prov' → {o,r,lo,lr,hosp}
        rows.forEach(function (r) {
            var pk = r.am + '|' + r.prov;
            var g = provAgg[pk] || (provAgg[pk] = { o: 0, r: 0, lo: 0, lr: 0, hosp: {} });
            g.o += r.o; g.r += r.r; g.lo += r.lo; g.lr += r.lr;
            if (r.o > 0) g.hosp[r.hosp] = true; // 下单医院数去重
        });
        var groups = {};
        Object.keys(provAgg).forEach(function (pk) {
            var p = pk.split('|');
            var am = p[0], prov = p[1], g = provAgg[pk];
            if (!groups[am]) groups[am] = [];
            groups[am].push({ prov: prov, o: g.o, r: g.r, lo: g.lo, lr: g.lr, n: Object.keys(g.hosp).length });
        });
        var amOrder = [];
        AMS.forEach(function (a) { if (groups[a]) amOrder.push(a); });
        Object.keys(groups).forEach(function (a) { if (amOrder.indexOf(a) < 0) amOrder.push(a); });

        var h = '<table class="pt"><thead><tr>' +
            '<th>AM</th><th>省份名称</th><th>下单医院数</th>' +
            '<th>YTD下单</th><th>下单同比</th><th>YTD回输</th><th>回输同比</th>' +
            '</tr></thead><tbody>';
        amOrder.forEach(function (am) {
            var list = groups[am].sort(function (a, b) { return b.o - a.o; });
            h += '<tr class="pt-grp"><td class="pt-lbl" colspan="7">AM · ' + am + '</td></tr>';
            list.forEach(function (g) {
                h += '<tr><td></td><td class="pt-lbl">' + g.prov + '</td><td>' + (g.n > 0 ? g.n : '') + '</td>' +
                    '<td>' + (g.o > 0 ? g.o : '') + '</td><td>' + yoyStr(g.o, g.lo) + '</td>' +
                    '<td>' + (g.r > 0 ? g.r : '') + '</td><td>' + yoyStr(g.r, g.lr) + '</td></tr>';
            });
        });
        h += '</tbody></table>';
        document.getElementById('p6tPV').innerHTML = h;
    }

    // ── 表格下方 AI 总结（构建时快照，不随年月/筛选变化） ──
    function renderAI() {
        var R = B.REGION3_AI;
        if (!R) return;
        var ym = String(R.at || '');
        var scope = ym ? ('截至 ' + ym + '（当年 1–' + parseInt(ym.slice(5, 7), 10) + ' 月累计）') : '';
        function box(elId, slot) {
            var el = document.getElementById(elId);
            if (!el) return;
            var s = (slot && slot.summary) || '';
            el.innerHTML = '<div class="p6-ai-hd"><span class="p6-ai-tag">AI 总结</span>' +
                (scope ? '<span class="p6-ai-time">' + scope + '</span>' : '') + '</div>' +
                '<div class="p6-ai-txt' + (s ? '' : ' p6-ai-empty') + '">' + (s || '暂无总结（构建时未生成）') + '</div>';
        }
        box('p6aiPV', R.province);
        box('p6aiHS', R.hospital);
    }

    // ── 事件：COE 药丸多选、医院名实时模糊搜索、清空 ──
    function refreshHS() { renderHS(currentRows()); }
    $('#p6coeLights').on('click', '.cart-light', function () {
        var c = $(this).data('coe');
        var next = !selCoe[c];
        var onCnt = COE_CATS.filter(function (x) { return selCoe[x]; }).length;
        if (!next && onCnt <= 1) return; // 至少保留一个
        selCoe[c] = next;
        renderCoeLights();
        refreshHS();
    });
    $('#p6hsSearch').on('input', function () {
        hsQuery = String(this.value || '').trim().toLowerCase();
        refreshHS();
    });
    $('#p6hsClear').on('click', function () {
        $('#p6hsSearch').val('');
        hsQuery = '';
        refreshHS();
    });

    renderCoeLights();
    renderAI();
    updateAll();
});
