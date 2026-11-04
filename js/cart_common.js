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
    // 没有 COS 的记录分两种（2026-11-05 用户口径）：
    //   ① 香港医院（玛丽医院 / 威尔斯亲王）实际占用付苗产能 → 计到付苗名下
    //   ② 其余海外订单 → 直接显示「国家」（有 province 用 province，否则按医院名兜底）
    var NO_COS = '海外';            // 兜底文案（仅当国家也识别不出时）
    var HK_COS = '付苗';
    var OVERSEAS_HOSP = { 'PARKWAY': '新加坡', 'QUEEN MARY': '香港', 'PRINCE OF WALES': '香港' };
    function ovCountry(r) {
        var p = String((r && r.prov) || '').trim();
        if (p && p !== '未知') return p;
        var h = String((r && r.hosp) || '').toUpperCase();
        for (var k in OVERSEAS_HOSP) { if (h.indexOf(k) >= 0) return OVERSEAS_HOSP[k]; }
        return NO_COS;
    }
    function cosName(r) {
        if (!r) return NO_COS;
        if (r.cos) return r.cos;
        if (r.prov === '香港') return HK_COS;
        return ovCountry(r);
    }
    // 海外国家标签集合（这些不是「人」，不参与产能风险判定）
    var _ovNames = null;
    function ovNames() {
        if (_ovNames) return _ovNames;
        _ovNames = {};
        var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
        ((B && B.CART_DAILY) || []).forEach(function (r) {
            if (!r.cos && r.prov !== '香港') _ovNames[ovCountry(r)] = true;
        });
        return _ovNames;
    }
    function isOverseas(name) { return !!ovNames()[name]; }

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
        cosCity: cosCity,
        NO_COS: NO_COS,
        HK_COS: HK_COS,
        cosName: cosName,
        ovCountry: ovCountry,
        isOverseas: isOverseas
    };
})();
