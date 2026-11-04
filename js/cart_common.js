// cart_common.js — CART 三页共用（日历 / 明细 / COS工作量）
// 状态口径只此一处，避免三页各写一套造成漂移
window.CART_COMMON = (function () {
    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

    // 客户端北京时间“今天”（UTC+8 墙钟日期），YYYY-MM-DD
    function beijingToday() {
        var d = new Date(Date.now() + 8 * 3600000);
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }

    var TYPE_LABEL = { apheresis: '单采', reinfusion: '回输' };
    var TYPE_ICON = { apheresis: '🧬', reinfusion: '💉' };

    // 排序/颜色约定：红→灰→黄→绿（order 越小越靠前）
    var LIGHTS = [
        { k: 'red', order: 0, color: '#ff4d4f', txt: '逾期未执行' },
        { k: 'gray', order: 1, color: '#9aa0a6', txt: '待执行' },
        { k: 'yellow', order: 2, color: '#ffb800', txt: '延期/提前执行' },
        { k: 'green', order: 3, color: '#62c98d', txt: '按计划执行' }
    ];
    var LK = {}; LIGHTS.forEach(function (l) { LK[l.k] = l; });

    // 有实际开始 → 与计划同日=绿，否则=黄；无实际 → 计划≤今天=红，否则=灰
    function stateOf(r, today) {
        if (r.actual) return r.actual === r.plan ? 'green' : 'yellow';
        return r.plan <= today ? 'red' : 'gray';
    }
    function stateOrder(r, today) { return LK[stateOf(r, today)].order; }

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

    // COS 花名册（COS名单.xlsx → BOARD_DATA.COS_MAP）
    function roster() {
        var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
        return (B && B.COS_MAP) || {};
    }
    // 兼职 COS：backupOf 非空 → 只能顶替该 COS，不能独立承接其他辖区
    function isPartTime(name) { var m = roster()[name]; return !!(m && m.backupOf); }
    function backupOf(name) { var m = roster()[name]; return (m && m.backupOf) || ''; }
    function cosCity(name) { var m = roster()[name]; return (m && m.city) || ''; }

    return {
        pad2: pad2,
        beijingToday: beijingToday,
        TYPE_LABEL: TYPE_LABEL,
        TYPE_ICON: TYPE_ICON,
        LIGHTS: LIGHTS,
        LK: LK,
        stateOf: stateOf,
        stateOrder: stateOrder,
        statHTML: statHTML,
        roster: roster,
        isPartTime: isPartTime,
        backupOf: backupOf,
        cosCity: cosCity
    };
})();
