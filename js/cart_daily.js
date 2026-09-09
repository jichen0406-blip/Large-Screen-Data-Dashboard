// cart_daily.js — CART运营每日跟进：细胞订单(BS Order)执行监控
// 把每单拆成「单采/回输」两条记录，四色状态灯(红/灰/黄/绿) 日历Dashboard + 明细表
// 状态按「今天」判定：无后端，取客户端北京时间(UTC+8)实时值；数据层只给原始计划/实际日期
(function () {
    var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
    if (!B || !B.CART_DAILY) return;
    var DATA = B.CART_DAILY;

    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    // 客户端北京时间“今天”（UTC+8 墙钟日期），YYYY-MM-DD
    function beijingToday() {
        var d = new Date(Date.now() + 8 * 3600000);
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }

    var TYPE_LABEL = { apheresis: '单采', reinfusion: '回输' };
    // 排序/颜色约定：红→灰→黄→绿（order 越小越靠前）
    var LIGHTS = [
        { k: 'red',    order: 0, color: '#ff4d4f', txt: '逾期未执行' },
        { k: 'gray',   order: 1, color: '#9aa0a6', txt: '待执行' },
        { k: 'yellow', order: 2, color: '#ffb800', txt: '延期/提前执行' },
        { k: 'green',  order: 3, color: '#62c98d', txt: '按计划执行' }
    ];
    var LK = {}; LIGHTS.forEach(function (l) { LK[l.k] = l; });
    // 记录状态：有实际开始 → 与计划同日=绿，否则=黄；无实际 → 计划≤今天=红，否则=灰
    function stateOf(r, today) {
        if (r.actual) return r.actual === r.plan ? 'green' : 'yellow';
        return r.plan <= today ? 'red' : 'gray';
    }
    function stateOrder(r, today) { return LK[stateOf(r, today)].order; }

    // 可用月份（按计划日期）用于默认定位最新月
    var monthSet = {};
    DATA.forEach(function (r) { monthSet[r.plan.slice(0, 7)] = true; });
    var YMS = Object.keys(monthSet).sort();
    var DEF_YM = YMS.length ? YMS[YMS.length - 1] : beijingToday().slice(0, 7);
    var yearSet = {};
    YMS.forEach(function (ym) { yearSet[ym.slice(0, 4)] = true; });
    var YEARS = Object.keys(yearSet).sort().reverse(); // 新→旧

    // 当前状态
    var selY = parseInt(DEF_YM.slice(0, 4), 10);
    var selM = parseInt(DEF_YM.slice(5, 7), 10);
    var selLights = { red: true, gray: true, yellow: false, green: false }; // 默认只看 逾期未执行(红)+待执行(灰)
    var hl = null; // 搜索命中高亮 {code, type, plan}
    var focus = null; // 搜索聚焦：非空时日历/表格仅显示该订单记录 {code, type}
    var msg = '';

    function inFocus(r) { return focus && r.code === focus.code && r.type === focus.type; }

    // ---------- 控制区 ----------
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

    // ---------- 日历 Dashboard ----------
    var WD_HDR = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    function cardHTML(r, today) {
        var st = stateOf(r, today);
        var hit = hl && hl.code === r.code && hl.type === r.type ? ' cart-hit' : '';
        return '<div class="cart-card st-' + st + hit + '" data-k="' + r.code + '" data-t="' + r.type + '" title="追溯码 ' + r.code + '｜' + r.hosp + '｜' + (r.patient || '·') + '｜运营 ' + (r.cos || '-') + '">' +
            '<div class="cc-top"><span class="cc-type t-' + r.type + '">' + TYPE_LABEL[r.type] + '</span>' + (r.cos ? '<span class="cc-cos">' + r.cos + '</span>' : '') + '<span class="cc-code">' + (r.code || '(无码)') + '</span></div>' +
            '<div class="cc-bot"><span class="cc-hosp">' + (r.hosp || '未知医院') + '</span><span class="cc-pat">' + (r.patient || '·') + '</span></div>' +
            '</div>';
    }
    // 分状态计数 HTML：色点 + 数量（仅列出现过的状态）
    function statHTML(stCnt, big) {
        var s = '';
        LIGHTS.forEach(function (l) {
            var n = stCnt[l.k] || 0;
            if (!n) return;
            s += '<i class="cart-mini' + (big ? ' big' : '') + '" style="background:' + l.color + ';box-shadow:0 0 5px ' + l.color + '"></i>' +
                '<b class="cart-num' + (big ? ' big' : '') + '" style="color:' + l.color + '">' + n + '</b>';
        });
        return s;
    }
    function renderCalendar() {
        var today = beijingToday();
        var ym = selY + '-' + pad2(selM);
        var first = new Date(Date.UTC(selY, selM - 1, 1));
        var firstDow = (first.getUTCDay() + 6) % 7; // 周一=0
        var dim = new Date(Date.UTC(selY, selM, 0)).getUTCDate();
        var dayRecs = {};
        var monthCnt = {}; LIGHTS.forEach(function (l) { monthCnt[l.k] = 0; });
        DATA.forEach(function (r) {
            if (inFocus(r)) { // 搜索聚焦：该订单无视筛选，始终保留
                var df = parseInt(r.plan.slice(8, 10), 10);
                (dayRecs[df] = dayRecs[df] || []).push(r);
                monthCnt[stateOf(r, today)]++;
                return;
            }
            if (focus) return; // 聚焦态下不混入其它记录
            if (r.plan.slice(0, 7) !== ym || !selLights[stateOf(r, today)]) return;
            var d = parseInt(r.plan.slice(8, 10), 10);
            (dayRecs[d] = dayRecs[d] || []).push(r);
            monthCnt[stateOf(r, today)]++;
        });
        var html = '<div class="cart-wd">' + WD_HDR.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>';
        var grid = '';
        var total = 0;
        for (var cell = 0; cell < firstDow + dim; cell++) {
            var d = cell - firstDow + 1;
            var todayCls = (ym === today.slice(0, 7) && d === parseInt(today.slice(8, 10), 10)) ? ' today' : '';
            if (d < 1) { grid += '<div class="cart-day off"></div>'; continue; }
            var recs = dayRecs[d] || [];
            total += recs.length;
            var cards = recs.map(function (r) { return cardHTML(r, today); }).join('');
            var stCnt = {};
            recs.forEach(function (r) { var k = stateOf(r, today); stCnt[k] = (stCnt[k] || 0) + 1; });
            grid += '<div class="cart-day' + todayCls + '">' +
                '<div class="cd-hd"><span class="cd-date">' + d + '</span><span class="cd-st">' + statHTML(stCnt) + '</span></div>' +
                '<div class="cd-body">' + (cards || '<div class="cd-empty">—</div>') + '</div>' +
                '</div>';
        }
        // 补齐末尾空位，凑满 7 的整数倍
        var filled = firstDow + dim;
        while (filled % 7) { grid += '<div class="cart-day off"></div>'; filled++; }
        $('#p10cal').html(html + '<div class="cart-grid">' + grid + '</div>');
        $('#p10calstat').html('<b class="cart-total">共 ' + total + ' 条</b>' + statHTML(monthCnt, true));
        if (hl) highlightHit();
    }

    // ---------- 明细表格 ----------
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
            if (focus) return inFocus(r); // 搜索聚焦：明细只显示该订单这条记录
            return r.plan.slice(0, 7) === ym && selLights[stateOf(r, today)];
        }).sort(function (a, b) {
            var d = stateOrder(a, today) - stateOrder(b, today);
            if (d) return d;
            if (a.plan !== b.plan) return a.plan < b.plan ? -1 : 1;
            return a.type < b.type ? -1 : 1;
        });
        var hd = '<div class="cart-tbl-hdr">' + TH.map(function (c) { return '<span class="' + c.cls + '">' + c.t + '</span>'; }).join('') + '</div>';
        if (!recs.length) { $('#p10tbl').html(hd + '<div class="cart-tbl-empty">本月无记录</div>'); return; }
        var rows = '';
        recs.forEach(function (r, i) {
            var st = stateOf(r, today);
            var hit = hl && hl.code === r.code && hl.type === r.type ? ' cart-hit' : '';
            rows += '<div class="cart-tbl-row' + hit + '" data-i="' + i + '">' +
                '<span class="c-code" title="' + r.code + '">' + (r.code || '(无码)') + '</span>' +
                '<span class="c-hosp">' + (r.hosp || '未知医院') + '</span>' +
                '<span class="c-pat">' + (r.patient || '·') + '</span>' +
                '<span class="c-type">' + TYPE_LABEL[r.type] + '</span>' +
                '<span class="c-cos' + (r.cos ? '' : ' no') + '">' + (r.cos || '-') + '</span>' +
                '<span class="c-st"><i class="cart-dot" style="background:' + LK[st].color + ';box-shadow:0 0 6px ' + LK[st].color + ';"></i>' + LK[st].txt + '</span>' +
                '<span class="c-plan">' + r.plan + '</span>' +
                '<span class="c-act' + (r.actual ? '' : ' no') + '">' + (r.actual || '-') + '</span>' +
                '</div>';
        });
        $('#p10tbl').html(hd + '<div class="cart-tbl-body">' + rows + '</div>');
        if (hl) highlightHit();
    }

    // 搜索命中后：日历卡片 + 表格行 高亮闪烁并滚动到可视区
    function highlightHit() {
        if (!hl) return;
        var cards = document.querySelectorAll('#p10cal .cart-card');
        for (var j = 0; j < cards.length; j++) {
            if (cards[j].getAttribute('data-k') === hl.code && cards[j].getAttribute('data-t') === hl.type) {
                cards[j].scrollIntoView({ block: 'nearest' });
                break;
            }
        }
        var rows = document.querySelectorAll('#p10tbl .cart-tbl-row');
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (r.querySelector('.c-code').textContent === (hl.code || '(无码)') && r.querySelector('.c-type').textContent === TYPE_LABEL[hl.type]) {
                r.scrollIntoView({ block: 'center' });
                break;
            }
        }
    }

    // ---------- 搜索 ----------
    function doSearch() {
        var code = String($('#p10code').val() || '').trim();
        var qtype = $('#p10qtype').val(); // apheresis / reinfusion
        if (!code) { $('#p10msg').text('请输入追溯码').addClass('err'); return; }
        var hitRec = null;
        DATA.forEach(function (r) { if (r.code === code && r.type === qtype && !hitRec) hitRec = r; });
        if (!hitRec) {
            hl = null;
            focus = null;
            $('#p10msg').text('未找到该追溯码对应的记录（可能不存在 / 已取消或终止被过滤 / 未排期不显示）').addClass('err');
            renderCalendar(); renderTable();
            return;
        }
        selY = parseInt(hitRec.plan.slice(0, 4), 10);
        selM = parseInt(hitRec.plan.slice(5, 7), 10);
        LIGHTS.forEach(function (l) { selLights[l.k] = true; }); // 自动重置全选
        $('#p10y').val(String(selY)); $('#p10m').val(String(selM));
        hl = { code: code, type: qtype };
        focus = { code: code, type: qtype }; // 聚焦：日历/表格只显示该订单
        msg = '';
        $('#p10msg').text('已定位：' + code + '（' + TYPE_LABEL[qtype] + '，' + hitRec.plan + '）· 仅显示该订单，点「清空」返回整月').removeClass('err');
        renderCalendar(); renderTable();
    }
    function doClear() {
        $('#p10code').val('');
        $('#p10msg').text('').removeClass('err');
        hl = null;
        focus = null;
        renderCalendar(); renderTable(); // 回到当前年月的整月视图
    }

    // ---------- 事件绑定 ----------
    function rerender() { hl = null; focus = null; msg = ''; $('#p10msg').text('').removeClass('err'); renderCalendar(); renderTable(); }
    function bindEvents() {
        $('#p10y').on('change', function () { selY = parseInt(this.value, 10); rerender(); });
        $('#p10m').on('change', function () { selM = parseInt(this.value, 10); rerender(); });
        $('#p10lights').on('click', '.cart-light', function () {
            var k = $(this).data('k');
            var next = !selLights[k];
            // 至少保留一个状态灯
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
        renderCalendar();
        renderTable();
    });
})();
