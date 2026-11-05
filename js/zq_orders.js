// zq_orders.js — 择期订单管理：6 张卡片 + By AM / By 医院 两张表
// 数据：BOARD_DATA.ZQ（构建期算好：init 初始择期 / mid 中途择期 / resume 恢复生产 / cancel 择期取消 / cur 当前择期）
// 口径：按下单时间统计；历史累计不受时间筛选影响
$(function () {
    var B = window.BOARD_DATA;
    var Z = (B && B.ZQ) || { rows: [] };
    var R = window.RZ;
    if (!R || !Z.rows.length) return;

    var monSet = {};
    Z.rows.forEach(function (r) { if (r.od) monSet[r.od.slice(0, 7)] = 1; });
    var months = Object.keys(monSet).sort();
    R.initRange('zq', months, B.DP);

    // AM 下拉
    var ams = {};
    Z.rows.forEach(function (r) { if (r.am) ams[r.am] = 1; });
    var amList = Object.keys(ams).sort();
    var $am = document.getElementById('zqAm');
    $am.innerHTML = '<option value="ALL">全部 AM</option>' + amList.map(function (a) {
        return '<option value="' + R.esc(a) + '">' + R.esc(a) + '</option>';
    }).join('');

    var state = { am: 'ALL', hosp: '' };

    function inRange(r, rg) {
        if (!r.od) return false;
        var k = r.od.slice(0, 7);
        return k >= rg.a && k <= rg.b && (state.am === 'ALL' || r.am === state.am);
    }

    function count(list) {
        var t = { orders: list.length, init: 0, mid: 0, ri: 0, rm: 0, can: 0, cur: 0 };
        list.forEach(function (r) {
            if (r.init) { t.init++; if (r.resume) t.ri++; }
            if (r.mid) { t.mid++; if (r.resume) t.rm++; }
            t.can += r.cancel; t.cur += r.cur;
        });
        return t;
    }

    var CARDS = [
        { k: 'cur', label: '当前择期', ac: '#ffcf4d', tip: '仍在择期、未恢复生产、未取消' },
        { k: 'init', label: '初始择期', ac: '#4fe3ff', tip: '下单时支付方式即为择期' },
        { k: 'mid', label: '中途择期', ac: '#7ee3ff', tip: '后续申请修改为择期生产' },
        { k: 'ri', label: '初始择期恢复生产', ac: '#62c98d', tip: '初始择期中已恢复生产的' },
        { k: 'rm', label: '中途择期恢复生产', ac: '#37d67a', tip: '中途择期中已恢复生产的' },
        { k: 'can', label: '择期取消', ac: '#ff8a80', tip: '取消且未恢复生产' }
    ];

    function renderCards(cur, all) {
        document.getElementById('zqCards').innerHTML = CARDS.map(function (c) {
            return '<div class="kpi-card" style="--ac:' + c.ac + '" title="' + c.tip + '">' +
                '<div class="kc-label">' + c.label + '</div>' +
                '<div class="kc-val" style="color:' + c.ac + '">' + cur[c.k] + '<small>单</small></div>' +
                '<div class="kc-sub">历史累计 ' + all[c.k] + ' 单</div>' +
                '</div>';
        }).join('');

        var ok = (cur.init + cur.mid - cur.ri - cur.rm - cur.can) === cur.cur;
        document.getElementById('zqCheck').innerHTML =
            '校验：初始择期 ' + cur.init + ' + 中途择期 ' + cur.mid + ' − 初始恢复 ' + cur.ri +
            ' − 中途恢复 ' + cur.rm + ' − 择期取消 ' + cur.can + ' = <b>' + (cur.init + cur.mid - cur.ri - cur.rm - cur.can) +
            '</b>，当前择期 <b>' + cur.cur + '</b>　' + (ok ? '<b>✓ 一致</b>' : '<b style="color:#ff8a80">✗ 不一致</b>');
    }

    function groupBy(list, key) {
        var g = {};
        list.forEach(function (r) {
            var k = r[key] || '未知';
            var o = g[k] || (g[k] = { key: k, list: [] });
            o.list.push(r);
        });
        return g;
    }

    function pctOf(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '—'; }

    function renderTable(id, list, firstCol, q) {
        var g = groupBy(list, firstCol === 'am' ? 'am' : 'hosp');
        var rows = Object.keys(g).map(function (k) { return g[k]; });
        if (q) rows = rows.filter(function (o) { return o.key.toLowerCase().indexOf(q) >= 0; });
        rows.forEach(function (o) { o.t = count(o.list); });
        rows.sort(function (a, b) { return b.t.orders - a.t.orders; });

        var HEAD = ['下单数', '当前择期', '择期比例', '初始择期', '中途择期',
                    '初始择期恢复生产', '中途择期恢复生产', '择期取消', '择期取消比例'];
        var h = '<table class="pt pt-ov"><colgroup><col class="c-name">' +
            '<col class="c-num"><col class="c-num"><col class="c-num"><col class="c-num"><col class="c-num">' +
            '<col class="c-num"><col class="c-num"><col class="c-num"><col class="c-num"></colgroup><thead><tr>' +
            '<th class="pt-lbl">' + (firstCol === 'am' ? 'AM' : '医院') + '</th>' +
            HEAD.map(function (x) { return '<th>' + x + '</th>'; }).join('') +
            '</tr></thead><tbody>';

        if (!rows.length) h += '<tr><td colspan="10" style="text-align:center;color:rgba(255,255,255,.45);padding:16px 0;">所选条件无数据</td></tr>';

        var tot = { orders: 0, init: 0, mid: 0, ri: 0, rm: 0, can: 0, cur: 0 };
        rows.forEach(function (o) {
            var t = o.t;
            tot.orders += t.orders; tot.init += t.init; tot.mid += t.mid;
            tot.ri += t.ri; tot.rm += t.rm; tot.can += t.can; tot.cur += t.cur;
            h += '<tr>' +
                '<td class="pt-lbl" title="' + R.esc(o.key) + '">' + R.esc(o.key) + '</td>' +
                '<td>' + t.orders + '</td>' +
                '<td style="color:#ffcf4d">' + t.cur + '</td>' +
                '<td style="color:#ffcf4d">' + pctOf(t.cur, t.orders) + '</td>' +
                '<td>' + t.init + '</td>' +
                '<td>' + t.mid + '</td>' +
                '<td>' + t.ri + '</td>' +
                '<td>' + t.rm + '</td>' +
                '<td style="color:#ff8a80">' + t.can + '</td>' +
                '<td style="color:#ff8a80">' + pctOf(t.can, t.orders) + '</td>' +
                '</tr>';
        });
        h += '</tbody><tfoot><tr>' +
            '<td class="pt-lbl">合计</td>' +
            '<td>' + tot.orders + '</td>' +
            '<td>' + tot.cur + '</td>' +
            '<td>' + pctOf(tot.cur, tot.orders) + '</td>' +
            '<td>' + tot.init + '</td>' +
            '<td>' + tot.mid + '</td>' +
            '<td>' + tot.ri + '</td>' +
            '<td>' + tot.rm + '</td>' +
            '<td>' + tot.can + '</td>' +
            '<td>' + pctOf(tot.can, tot.orders) + '</td>' +
            '</tr></tfoot></table>';
        document.getElementById(id).innerHTML = h;
    }

    function render() {
        var rg = R.readRange('zq');
        var cur = Z.rows.filter(function (r) { return inRange(r, rg); });
        var all = Z.rows.filter(function (r) { return (state.am === 'ALL' || r.am === state.am) && r.od; });
        renderCards(count(cur), count(all));
        renderTable('zqAmTbl', cur, 'am', '');
        renderTable('zqHospTbl', cur, 'hosp', state.hosp);

        var note = document.getElementById('zqNote');
        if (note) note.textContent = '区间 ' + rg.a + ' ~ ' + rg.b + '　|　按下单时间统计' + (state.am === 'ALL' ? '' : '　|　AM：' + state.am);
    }

    ['zqY1', 'zqM1', 'zqY2', 'zqM2'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', render);
    });
    $am.addEventListener('change', function () { state.am = this.value; render(); });

    var $q = document.getElementById('zqHospQ');
    if ($q) $q.addEventListener('input', function () {
        state.hosp = String(this.value || '').trim().toLowerCase();
        var rg = R.readRange('zq');
        renderTable('zqHospTbl', Z.rows.filter(function (r) { return inRange(r, rg); }), 'hosp', state.hosp);
    });

    render();

    // AI 总结
    var ai = document.getElementById('zqAI');
    if (ai) {
        var s = Z.ai || '';
        ai.innerHTML = s
            ? '<div class="ib-hd"><span class="ib-tag">AI 总结</span><span class="ib-time">数据截止 ' + (Z.aiAt || '') + '</span><button class="ib-toggle" type="button">展开</button></div><div class="ib-txt">' + R.esc(s) + '</div>'
            : '<div class="ib-hd"><span class="ib-tag">AI 总结</span></div><div class="ib-txt ib-empty">暂无总结（构建时未生成）</div>';
    }
});
