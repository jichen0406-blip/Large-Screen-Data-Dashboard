// cart_detail.js — CART运营-明细：细胞订单执行明细表
// 由原 cart_daily.js 的明细表部分拆出（日历页保留 page10 / cart_daily.js）
// 口径与日历页完全一致：状态按「今天」判定，年/月 + 四色状态灯 + 追溯码精确搜索
(function () {
    var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
    if (!B || !B.CART_DAILY) return;
    var DATA = B.CART_DAILY;
    var C = window.CART_COMMON;
    var pad2 = C.pad2, beijingToday = C.beijingToday;
    var TYPE_LABEL = C.TYPE_LABEL, TYPE_ICON = C.TYPE_ICON, LIGHTS = C.LIGHTS, LK = C.LK;
    var stateOf = C.stateOf, stateOrder = C.stateOrder;

    var monthSet = {};
    DATA.forEach(function (r) { monthSet[r.plan.slice(0, 7)] = true; });
    var YMS = Object.keys(monthSet).sort();
    var DEF_YM = YMS.length ? YMS[YMS.length - 1] : beijingToday().slice(0, 7);
    var yearSet = {};
    YMS.forEach(function (ym) { yearSet[ym.slice(0, 4)] = true; });
    var YEARS = Object.keys(yearSet).sort().reverse();

    var selY = parseInt(DEF_YM.slice(0, 4), 10);
    var selM = parseInt(DEF_YM.slice(5, 7), 10);
    var selLights = { red: true, gray: true, yellow: true, green: true };
    var hl = null, focus = null;

    function inFocus(r) { return focus && r.code === focus.code && r.type === focus.type; }

    function fillYearMonth() {
        var $y = $('#p10y'), $m = $('#p10m');
        $y.empty(); YEARS.forEach(function (y) { $y.append('<option value="' + y + '">' + y + ' 年</option>'); });
        var mh = '';
        for (var i = 1; i <= 12; i++) mh += '<option value="' + i + '">' + i + ' 月</option>';
        $m.html(mh);
        $y.val(String(selY)); $m.val(String(selM));
    }
    function renderLights() {
        var s = '';
        LIGHTS.forEach(function (l) {
            var on = selLights[l.k];
            s += '<button type="button" class="cart-light' + (on ? ' on' : '') + '" data-k="' + l.k + '">' +
                '<i class="cart-dot" style="background:' + l.color + ';box-shadow:0 0 6px ' + l.color + ';"></i>' + l.txt +
                '</button>';
        });
        $('#p10lights').html(s);
    }

    var TH = [
        { t: '追溯码', cls: 'c-code' },
        { t: '医院', cls: 'c-hosp' },
        { t: '患者脱敏', cls: 'c-pat' },
        { t: '类型', cls: 'c-type' },
        { t: 'COS', cls: 'c-cos' },
        { t: '状态', cls: 'c-st' },
        { t: '计划时间', cls: 'c-plan' },
        { t: '实际开始时间', cls: 'c-act' }
    ];
    function renderTable() {
        var today = beijingToday();
        var ym = selY + '-' + pad2(selM);
        var recs = DATA.filter(function (r) {
            if (focus) return inFocus(r);
            return r.plan.slice(0, 7) === ym && selLights[stateOf(r, today)];
        }).sort(function (a, b) {
            var d = stateOrder(a, today) - stateOrder(b, today);
            if (d) return d;
            if (a.plan !== b.plan) return a.plan < b.plan ? -1 : 1;
            return a.type < b.type ? -1 : 1;
        });
        var hd = '<div class="cart-tbl-hdr">' + TH.map(function (c) { return '<span class="' + c.cls + '">' + c.t + '</span>'; }).join('') + '</div>';
        if (!recs.length) {
            $('#p10tbl').html(hd + '<div class="cart-tbl-empty">本月无记录</div>');
            $('#p10tblstat').text('');
            return;
        }
        var rows = '';
        var cnt = {};
        recs.forEach(function (r, i) {
            var st = stateOf(r, today);
            cnt[st] = (cnt[st] || 0) + 1;
            var hit = hl && hl.code === r.code && hl.type === r.type ? ' cart-hit' : '';
            rows += '<div class="cart-tbl-row' + hit + '" data-i="' + i + '" data-t="' + r.type + '">' +
                '<span class="c-code" title="' + r.code + '">' + (r.code || '(无码)') + '</span>' +
                '<span class="c-hosp">' + (r.hosp || '未知医院') + '</span>' +
                '<span class="c-pat">' + (r.patient || '·') + '</span>' +
                '<span class="c-type"><i class="c-type-ico">' + TYPE_ICON[r.type] + '</i>' + TYPE_LABEL[r.type] + '</span>' +
                '<span class="c-cos' + (r.cos ? '' : ' no') + '">' + (r.cos || '-') + '</span>' +
                '<span class="c-st"><i class="cart-dot" style="background:' + LK[st].color + ';box-shadow:0 0 6px ' + LK[st].color + ';"></i>' + LK[st].txt + '</span>' +
                '<span class="c-plan">' + r.plan + '</span>' +
                '<span class="c-act' + (r.actual ? '' : ' no') + '">' + (r.actual || '-') + '</span>' +
                '</div>';
        });
        $('#p10tbl').html(hd + '<div class="cart-tbl-body">' + rows + '</div>');
        $('#p10tblstat').html('<b class="cart-total">共 ' + recs.length + ' 条</b>' + C.statHTML(cnt, true));
        if (hl) highlightHit();
    }

    function highlightHit() {
        if (!hl) return;
        var rows = document.querySelectorAll('#p10tbl .cart-tbl-row');
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (r.getAttribute('data-t') === hl.type && r.querySelector('.c-code').textContent === (hl.code || '(无码)')) {
                r.scrollIntoView({ block: 'center' });
                break;
            }
        }
    }

    function doSearch() {
        var code = String($('#p10code').val() || '').trim();
        var qtype = $('#p10qtype').val();
        if (!code) { $('#p10msg').text('请输入追溯码').addClass('err'); return; }
        var hitRec = null;
        DATA.forEach(function (r) { if (r.code === code && r.type === qtype && !hitRec) hitRec = r; });
        if (!hitRec) {
            hl = null; focus = null;
            $('#p10msg').text('未找到该追溯码对应的记录（可能不存在 / 已取消或终止被过滤 / 未排期不显示）').addClass('err');
            renderTable();
            return;
        }
        selY = parseInt(hitRec.plan.slice(0, 4), 10);
        selM = parseInt(hitRec.plan.slice(5, 7), 10);
        LIGHTS.forEach(function (l) { selLights[l.k] = true; });
        $('#p10y').val(String(selY)); $('#p10m').val(String(selM));
        hl = { code: code, type: qtype };
        focus = { code: code, type: qtype };
        $('#p10msg').text('已定位：' + code + '（' + TYPE_LABEL[qtype] + '，' + hitRec.plan + '）· 仅显示该订单，点「清空」返回整月').removeClass('err');
        renderTable();
    }
    function doClear() {
        $('#p10code').val('');
        $('#p10msg').text('').removeClass('err');
        hl = null; focus = null;
        renderTable();
    }
    function rerender() { hl = null; focus = null; $('#p10msg').text('').removeClass('err'); renderTable(); }

    function bindEvents() {
        $('#p10y').on('change', function () { selY = parseInt(this.value, 10); rerender(); });
        $('#p10m').on('change', function () { selM = parseInt(this.value, 10); rerender(); });
        $('#p10lights').on('click', '.cart-light', function () {
            var k = $(this).data('k');
            var next = !selLights[k];
            var onCnt = LIGHTS.filter(function (l) { return selLights[l.k]; }).length;
            if (!next && onCnt <= 1) return;
            selLights[k] = next;
            renderLights(); rerender();
        });
        $('#p10qbtn').on('click', doSearch);
        $('#p10code').on('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
        $('#p10cbtn').on('click', doClear);
    }

    $(function () {
        fillYearMonth();
        renderLights();
        bindEvents();
        renderTable();
    });
})();
