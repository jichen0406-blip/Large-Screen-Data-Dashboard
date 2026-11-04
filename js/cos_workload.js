// cos_workload.js — COS工作量：当月每天每个 COS 的单采/回输（只计已执行）
// 口径：只统计有实际执行时间的记录（按计划执行 + 延期/提前执行），按「实际执行日」落格；
//       未执行（逾期未执行 / 待执行）与未来预约都不计入。
//       仅按订单申请的 COS 评估：中途换人情况不纳入；二次单采不纳入。
(function () {
    var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
    if (!B || !B.CART_DAILY) return;
    var DATA = B.CART_DAILY;
    var C = window.CART_COMMON;
    var pad2 = C.pad2, beijingToday = C.beijingToday;

    // 只保留已执行
    var EXEC = DATA.filter(function (r) { return r.actual; });

    var monthSet = {};
    EXEC.forEach(function (r) { monthSet[r.actual.slice(0, 7)] = true; });
    var YMS = Object.keys(monthSet).sort();
    var DEF_YM = YMS.length ? YMS[YMS.length - 1] : beijingToday().slice(0, 7);
    var yearSet = {};
    YMS.forEach(function (ym) { yearSet[ym.slice(0, 4)] = true; });
    var YEARS = Object.keys(yearSet).sort().reverse();

    var selY = parseInt(DEF_YM.slice(0, 4), 10);
    var selM = parseInt(DEF_YM.slice(5, 7), 10);
    var WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    function fillYearMonth() {
        var $y = $('#p35y'), $m = $('#p35m');
        $y.empty(); YEARS.forEach(function (y) { $y.append('<option value="' + y + '">' + y + ' 年</option>'); });
        var mh = '';
        for (var i = 1; i <= 12; i++) mh += '<option value="' + i + '">' + i + ' 月</option>';
        $m.html(mh);
        $y.val(String(selY)); $m.val(String(selM));
    }

    function monthRows() {
        var ym = selY + '-' + pad2(selM);
        return EXEC.filter(function (r) { return r.actual.slice(0, 7) === ym; });
    }

    // ---------- 日历 ----------
    function renderCalendar() {
        var ym = selY + '-' + pad2(selM);
        var first = new Date(Date.UTC(selY, selM - 1, 1));
        var firstDow = (first.getUTCDay() + 6) % 7;
        var dim = new Date(Date.UTC(selY, selM, 0)).getUTCDate();
        var today = beijingToday();

        // 按「日 → COS → {ap, re}」聚合
        var byDay = {};
        monthRows().forEach(function (r) {
            var d = parseInt(r.actual.slice(8, 10), 10);
            var cos = r.cos || '未指定';
            var g = byDay[d] || (byDay[d] = {});
            var c = g[cos] || (g[cos] = { ap: 0, re: 0 });
            if (r.type === 'apheresis') c.ap++; else c.re++;
        });

        var html = '<div class="cart-wd">' + WD.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>';
        var grid = '';
        var total = 0;
        for (var cell = 0; cell < firstDow + dim; cell++) {
            var d = cell - firstDow + 1;
            var todayCls = (ym === today.slice(0, 7) && d === parseInt(today.slice(8, 10), 10)) ? ' today' : '';
            if (d < 1) { grid += '<div class="cart-day off"></div>'; continue; }
            var g = byDay[d] || {};
            var names = Object.keys(g).sort(function (a, b) {
                var ta = g[a].ap + g[a].re, tb = g[b].ap + g[b].re;
                return tb - ta || (a < b ? -1 : 1);
            });
            var body = names.map(function (n) {
                var o = g[n];
                if (n === '未指定') return '<div class="cs-wl-i"><b>未指定</b><em>' + o.ap + '</em>/<i>' + o.re + '</i></div>';
                var done = o.ap + o.re;
                total += done;
                return '<div class="cs-wl-i' + (C.isPartTime(n) ? ' part' : '') + '" title="' + n + '：单采 ' + o.ap + ' / 回输 ' + o.re + '">' +
                    '<b>' + n + '</b>' +
                    (o.ap ? '<em>采' + o.ap + '</em>' : '') +
                    (o.re ? '<i>回' + o.re + '</i>' : '') +
                    '</div>';
            }).join('');
            grid += '<div class="cart-day' + todayCls + '">' +
                '<div class="cd-hd"><span class="cd-date">' + d + '</span><span class="cd-st">' +
                (names.length ? '<b class="cart-num" style="color:#9fe8ff">' + names.reduce(function (s, n) { return s + g[n].ap + g[n].re; }, 0) + '</b>' : '') +
                '</span></div>' +
                '<div class="cd-body cs-wl-day">' + (body || '<div class="cd-empty">—</div>') + '</div>' +
                '</div>';
        }
        var filled = firstDow + dim;
        while (filled % 7) { grid += '<div class="cart-day off"></div>'; filled++; }
        $('#p35cal').html(html + '<div class="cart-grid">' + grid + '</div>');
        $('#p35calstat').html('<b class="cart-total">共 ' + total + ' 单已完成</b>');
    }

    // ---------- 当月汇总表 ----------
    function renderTable() {
        var rows = monthRows();
        var agg = {};
        rows.forEach(function (r) {
            var cos = r.cos || '未指定';
            var o = agg[cos] || (agg[cos] = { ap: 0, re: 0 });
            if (r.type === 'apheresis') o.ap++; else o.re++;
        });

        var ro = C.roster();
        // 花名册在前（按名单顺序），未在册 + 未指定在后
        var names = Object.keys(ro).filter(function (n) { return true; });
        Object.keys(agg).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
        if (!ro['未指定'] && agg['未指定']) { /* 已在上一行追加 */ }

        var sumAp = 0, sumRe = 0;
        var body = '';
        names.forEach(function (n) {
            var o = agg[n] || { ap: 0, re: 0 };
            if (!o.ap && !o.re) return;                 // 当月没工作的不占行
            sumAp += o.ap; sumRe += o.re;
            var flagged = (n === '未指定') ? '<span class="tt-tag" style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.55)">未指定</span>'
                : (ro[n] ? '' : '<span class="tt-tag" style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.55)">未在册</span>');
            var part = C.isPartTime(n) ? '<span class="tt-tag" style="background:rgba(255,207,77,.18);color:#ffcf4d">兼职·仅顶替' + C.backupOf(n) + '</span>' : '';
            body += '<tr>' +
                '<td class="pt-lbl">' + n + '</td>' +
                '<td>' + (C.cosCity(n) || '—') + '</td>' +
                '<td class="tt-num" style="color:#62c98d;font-weight:600;">' + (o.ap || '') + '</td>' +
                '<td class="tt-num" style="color:#ffcf4d;font-weight:600;">' + (o.re || '') + '</td>' +
                '<td class="tt-num" style="font-weight:700;">' + (o.ap + o.re) + '</td>' +
                '<td>' + flagged + part + '</td>' +
                '</tr>';
        });
        if (!body) body = '<tr><td colspan="6" style="text-align:center;color:rgba(255,255,255,.45);padding:18px 0;">本月没有已执行记录</td></tr>';
        var h = '<table class="pt pt-ov"><thead><tr>' +
            '<th class="pt-lbl">COS</th><th>所在城市</th><th>单采</th><th>回输</th><th>合计</th><th>备注</th>' +
            '</tr></thead><tbody>' + body + '</tbody>' +
            '<tfoot><tr><td class="pt-lbl">合计</td><td>—</td>' +
            '<td class="tt-num">' + sumAp + '</td><td class="tt-num">' + sumRe + '</td>' +
            '<td class="tt-num">' + (sumAp + sumRe) + '</td><td>' + names.filter(function (n) { return agg[n]; }).length + ' 人</td></tr></tfoot>' +
            '</table>';
        $('#p35tbl').html(h);
        $('#p35tblstat').html('<b class="cart-total">' + (sumAp + sumRe) + ' 单</b>');
    }

    function renderAll() { renderCalendar(); renderTable(); }

    $(function () {
        fillYearMonth();
        $('#p35y').on('change', function () { selY = parseInt(this.value, 10); renderAll(); });
        $('#p35m').on('change', function () { selM = parseInt(this.value, 10); renderAll(); });
        renderAll();
    });
})();
