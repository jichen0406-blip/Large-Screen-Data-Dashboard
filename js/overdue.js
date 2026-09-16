// overdue.js — 逾期未执行汇总（key overdue）：列出历史上所有「逾期未执行」订单
// 口径与 CART 页红灯一致：计划时间 ≤ 今天(客户端北京) 且 无实际开始时间；表格列照搬 CART 明细表
// 数据：window.BOARD_DATA.CART_DAILY（无需额外数据层字段）
(function () {
    var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
    if (!B || !B.CART_DAILY) return;

    var TYPE_LABEL = { apheresis: '单采', reinfusion: '回输' };
    var TYPE_ICON = { apheresis: '🧬', reinfusion: '💉' };
    var RED = '#ff4d4f';

    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    function beijingToday() {
        var d = new Date(Date.now() + 8 * 3600000);
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }

    var TODAY = beijingToday();
    // 逾期未执行集合（全历史）
    var ALL = (B.CART_DAILY || []).filter(function (r) { return !r.actual && r.plan && r.plan <= TODAY; });

    // 计划时间范围（用于起止年月下拉的默认值与选项）
    var months = ALL.map(function (r) { return r.plan.slice(0, 7); }).sort();
    var MINYM = months.length ? months[0] : TODAY.slice(0, 7);
    var MAXYM = months.length ? months[months.length - 1] : TODAY.slice(0, 7);
    var YEARS = [];
    for (var y = parseInt(MINYM.slice(0, 4), 10); y <= parseInt(MAXYM.slice(0, 4), 10); y++) YEARS.push(String(y));

    var startY = MINYM.slice(0, 4), startM = parseInt(MINYM.slice(5, 7), 10);
    var endY = MAXYM.slice(0, 4), endM = parseInt(MAXYM.slice(5, 7), 10);
    var selType = { apheresis: true, reinfusion: true };
    var q = '';

    // ---------- 控制区 ----------
    function fillSelects() {
        var yh = YEARS.map(function (v) { return '<option value="' + v + '">' + v + ' 年</option>'; }).join('');
        var mh = '';
        for (var i = 1; i <= 12; i++) mh += '<option value="' + i + '">' + i + ' 月</option>';
        $('#ovStartY').html(yh).val(startY);
        $('#ovEndY').html(yh).val(endY);
        $('#ovStartM').html(mh).val(String(startM));
        $('#ovEndM').html(mh).val(String(endM));
    }
    function renderTypes() {
        var h = '';
        ['apheresis', 'reinfusion'].forEach(function (t) {
            h += '<button type="button" class="cart-light' + (selType[t] ? ' on' : '') + '" data-t="' + t + '">' + TYPE_LABEL[t] + '</button>';
        });
        $('#ovTypes').html(h);
    }

    // ---------- 明细表（列与 CART 页一致；状态列固定为红色「逾期未执行」） ----------
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

    function visibleRows() {
        var s = startY + '-' + pad2(startM), e = endY + '-' + pad2(endM);
        if (s > e) { var t = s; s = e; e = t; } // 起 > 止 时自动对齐
        return ALL.filter(function (r) {
            var ym = r.plan.slice(0, 7);
            if (ym < s || ym > e) return false;
            if (!selType[r.type]) return false;
            if (q && (r.hosp || '').toLowerCase().indexOf(q) < 0) return false;
            return true;
        }).sort(function (a, b) {
            if (a.plan !== b.plan) return a.plan < b.plan ? 1 : -1; // 计划时间：新 → 旧
            if (a.type !== b.type) return a.type < b.type ? -1 : 1;
            return a.code < b.code ? -1 : (a.code > b.code ? 1 : 0); // 稳定排序
        });
    }

    function render() {
        var recs = visibleRows();
        $('#ovCount').html('共 <b>' + recs.length + '</b> 条');
        var hd = '<div class="cart-tbl-hdr">' + TH.map(function (c) { return '<span class="' + c.cls + '">' + c.t + '</span>'; }).join('') + '</div>';
        if (!recs.length) { $('#ovtbl').html(hd + '<div class="cart-tbl-empty">无符合条件的逾期记录</div>'); return; }
        var rows = '';
        recs.forEach(function (r) {
            rows += '<div class="cart-tbl-row">' +
                '<span class="c-code" title="' + r.code + '">' + (r.code || '(无码)') + '</span>' +
                '<span class="c-hosp">' + (r.hosp || '未知医院') + '</span>' +
                '<span class="c-pat">' + (r.patient || '·') + '</span>' +
                '<span class="c-type"><i class="c-type-ico">' + TYPE_ICON[r.type] + '</i>' + TYPE_LABEL[r.type] + '</span>' +
                '<span class="c-cos' + (r.cos ? '' : ' no') + '">' + (r.cos || '-') + '</span>' +
                '<span class="c-st"><i class="cart-dot" style="background:' + RED + ';box-shadow:0 0 6px ' + RED + ';"></i>逾期未执行</span>' +
                '<span class="c-plan">' + r.plan + '</span>' +
                '<span class="c-act no">-</span>' +
                '</div>';
        });
        $('#ovtbl').html(hd + '<div class="cart-tbl-body">' + rows + '</div>');
    }

    // ---------- 事件 ----------
    function bindEvents() {
        $('#ovStartY,#ovStartM,#ovEndY,#ovEndM').on('change', function () {
            startY = $('#ovStartY').val(); startM = parseInt($('#ovStartM').val(), 10);
            endY = $('#ovEndY').val(); endM = parseInt($('#ovEndM').val(), 10);
            render();
        });
        $('#ovTypes').on('click', '.cart-light', function () {
            var t = $(this).data('t');
            var next = !selType[t];
            if (!next && !(selType.apheresis || selType.reinfusion)) return; // 至少保留一个
            selType[t] = next;
            renderTypes(); render();
        });
        $('#ovSearch').on('input', function () {
            q = String(this.value || '').trim().toLowerCase();
            render();
        });
        $('#ovClear').on('click', function () {
            $('#ovSearch').val(''); q = '';
            render();
        });
    }

    $(function () {
        fillSelects();
        renderTypes();
        bindEvents();
        render();
    });
})();
