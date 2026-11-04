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
    var selCos = 'ALL';                 // COS 筛选：同时过滤日历与汇总
    var WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    function fillYearMonth() {
        var $y = $('#p35y'), $m = $('#p35m');
        $y.empty(); YEARS.forEach(function (y) { $y.append('<option value="' + y + '">' + y + ' 年</option>'); });
        var mh = '';
        for (var i = 1; i <= 12; i++) mh += '<option value="' + i + '">' + i + ' 月</option>';
        $m.html(mh);
        $y.val(String(selY)); $m.val(String(selM));
    }

    function fillCos() {
        var ro = C.roster();
        var extra = {};
        EXEC.forEach(function (r) { if (r.cos && !ro[r.cos]) extra[r.cos] = true; });
        var all = Object.keys(ro).concat(Object.keys(extra).sort());
        var h = '<option value="ALL">全部 COS</option>';
        all.forEach(function (n) {
            var city = C.cosCity(n);
            h += '<option value="' + n + '">' + n + (city ? '（' + city + '）' : '') + (C.isPartTime(n) ? ' ·兼职' : '') + '</option>';
        });
        $('#p35cos').html(h).val(selCos);
    }

    function monthRows() {
        var ym = selY + '-' + pad2(selM);
        return EXEC.filter(function (r) {
            if (r.actual.slice(0, 7) !== ym) return false;
            if (selCos !== 'ALL' && (r.cos || '未指定') !== selCos) return false;
            return true;
        });
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
        var sumAp = 0, sumRe = 0;
        monthRows().forEach(function (r) { if (r.type === 'apheresis') sumAp++; else sumRe++; });
        $('#p35calstat').html('<b class="cart-total">单采 ' + sumAp + ' 单 · 回输 ' + sumRe + ' 单 · 合计 ' + (sumAp + sumRe) + ' 单已完成</b>');
    }

    // ---------- 当月汇总（卡片网格 + 隐藏表供导出） ----------
    function renderCards() {
        var rows = monthRows();
        var agg = {};
        rows.forEach(function (r) {
            var cos = r.cos || '未指定';
            var o = agg[cos] || (agg[cos] = { ap: 0, re: 0 });
            if (r.type === 'apheresis') o.ap++; else o.re++;
        });

        var ro = C.roster();
        var names = Object.keys(ro).slice();
        var extra = Object.keys(agg).filter(function (n) { return names.indexOf(n) < 0 && n !== '未指定'; }).sort();
        names = names.concat(extra);
        if (agg['未指定']) names.push('未指定');

        var sumAp = 0, sumRe = 0, cards = '', trows = '';
        names.forEach(function (n) {
            var o = agg[n] || { ap: 0, re: 0 };
            if (!o.ap && !o.re) return;                       // 当月没工作的不占卡
            sumAp += o.ap; sumRe += o.re;
            var city = C.cosCity(n);
            var cls = n === '未指定' ? ' other' : (C.isPartTime(n) ? ' part' : '');
            var tags = '';
            if (n === '未指定') tags += '<span class="tt-tag" style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.55)">未指定</span>';
            else if (!ro[n]) tags += '<span class="tt-tag" style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.55)">未在册</span>';
            if (C.isPartTime(n)) tags += '<span class="tt-tag" style="background:rgba(255,207,77,.18);color:#ffcf4d">兼职·仅顶替' + C.backupOf(n) + '</span>';
            cards += '<div class="cs-wl-card' + cls + '">' +
                '<div class="c-hd"><span class="c-name" title="' + n + '">' + n + '</span>' +
                (city ? '<span class="c-city">' + city + '</span>' : '') + '</div>' +
                '<div class="c-num"><span class="ap">单采 <b>' + o.ap + '</b></span>' +
                '<span class="re">回输 <b>' + o.re + '</b></span>' +
                '<span class="tt">合计 <b>' + (o.ap + o.re) + '</b></span></div>' +
                (tags ? '<div class="c-tag">' + tags + '</div>' : '') +
                '</div>';
            trows += '<tr><td>' + n + '</td><td>' + (city || '') + '</td><td>' + o.ap + '</td><td>' + o.re + '</td><td>' + (o.ap + o.re) + '</td></tr>';
        });

        if (!cards) cards = '<div class="cs-wl-empty">本月没有已执行记录</div>';
        // 卡片 + 隐藏表（excel_export 从表里取值，卡片只是展示）
        $('#p35tbl').html('<div class="cs-wl-cards">' + cards + '</div>' +
            '<table class="pt" style="display:none"><thead><tr><th>COS</th><th>所在城市</th><th>单采</th><th>回输</th><th>合计</th></tr></thead><tbody>' +
            trows + '</tbody></table>');
        $('#p35tblstat').html('<b class="cart-total">单采 ' + sumAp + ' · 回输 ' + sumRe + ' · 共 ' + (sumAp + sumRe) + ' 单</b>');
    }

    function renderAll() { renderCalendar(); renderCards(); }

    $(function () {
        fillYearMonth();
        fillCos();
        $('#p35y').on('change', function () { selY = parseInt(this.value, 10); renderAll(); });
        $('#p35m').on('change', function () { selM = parseInt(this.value, 10); renderAll(); });
        $('#p35cos').on('change', function () { selCos = this.value; renderAll(); });
        renderAll();
    });
})();
