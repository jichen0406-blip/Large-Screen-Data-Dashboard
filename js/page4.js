// Page4：辖区数据管理2 — 辖区达成 3/4（挑战目标）+ 患者渠道销量 5
// 共享函数见 js/p3t-common.js；时间控制 P3/P4 共享（sessionStorage p3t_time）
$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.P3T) return;
    var P3T = B.P3T;
    var CHAL = P3T.CHAL || {}, REG = P3T.REG || {}, OV = P3T.OV || {};
    var AMS = P3T.AMS || [];

    // 表5 渠道（下单/回输共用，仅 fld 不同）
    var CH_ITEMS = [
        { label: '国内医生导流', key: 'docRef' },
        { label: 'OB导流', key: 'obRef' },
        { label: '香港商业化', key: 'hk' },
        { label: '新加坡商业化', key: 'sg' },
        { label: '沙特NPP', key: 'ksa' },
        { label: 'Total', key: 'total', total: true }
    ];

    var yearKeys = {};
    Object.keys(P3T.ND || {}).forEach(function (k) { yearKeys[k.slice(0, 4)] = true; });
    function updateAll() { renderTables(); }
    initP3tTime('#p4y', '#p4m', yearKeys, updateAll);

    // 挑战目标取值：ent = 'DOM'/'DOM:AM名'/'HK'/'SG'/'KSA'/'ALL'
    function chalV(ent, y, mo, fld) {
        var k = y + '-' + pad(mo);
        var b = CHAL[k];
        if (!b) return 0;
        if (ent === 'ALL') return chalV('DOM', y, mo, fld) + chalV('HK', y, mo, fld) + chalV('SG', y, mo, fld) + chalV('KSA', y, mo, fld);
        if (ent === 'DOM') {
            var d = b.DOM || {}, s = 0;
            Object.keys(d).forEach(function (a) { s += d[a][fld] || 0; });
            return s;
        }
        if (ent.indexOf('DOM:') === 0) {
            var d2 = b.DOM || {}, am = ent.slice(4);
            return (d2[am] && d2[am][fld]) || 0;
        }
        var rb = b[ent];
        return (rb && rb._ && rb._[fld]) || 0;
    }

    // 通用「每实体五行」表
    function renderEntTable(elId, title, bucket, ents) {
        var y = parseInt($('#p4y').val(), 10), m = parseInt($('#p4m').val(), 10);
        var ly = y - 1;
        var h = '<table class="p3t"><thead><tr><th class="p3t-lbl">' + title + '</th>';
        for (var i = 1; i <= 12; i++) h += '<th>' + i + '月</th>';
        h += '<th class="p3t-ytd">YTD</th></tr></thead><tbody>';
        ents.forEach(function (e) {
            h += '<tr class="p3t-grp' + (e.cls ? ' p3t-grp-' + e.cls : '') + '"><td class="p3t-lbl" colspan="14">' + e.label + '</td></tr>';
            ['Tar', 'Act', 'Act%', 'LY', 'YOY'].forEach(function (mt) {
                var row = p3tMetricRowHTML(mt, m, function (i) {
                    var t = e.tar ? chalV(e.tar, y, i, e.fld) : 0;
                    var a = mVal(bucket, y, i, e.key, e.fld);
                    var l = mVal(bucket, ly, i, e.key, e.fld);
                    return { t: t, a: a, l: l };
                }, 0, 0, 0);
                h += row.h;
            });
        });
        h += '</tbody></table>';
        document.getElementById(elId).innerHTML = h;
    }

    // 3/4 辖区达成（8 位 AM + 香港/新加坡/沙特，无 国内/Total 汇总行）
    function regEnts(fld) {
        var list = AMS.map(function (a) { return { label: a, key: a, tar: 'DOM:' + a, fld: fld }; });
        list.push({ label: '香港商业化', key: '香港', tar: 'HK', fld: fld });
        list.push({ label: '新加坡商业化', key: '新加坡', tar: 'SG', fld: fld });
        list.push({ label: '沙特NPP', key: '沙特', tar: 'KSA', fld: fld });
        return list;
    }
    function renderREG(elId, title, fld) {
        renderEntTable(elId, title, REG, regEnts(fld));
    }

    // 5 患者渠道销量（仅达成，白字，Total 蓝色行；首列类型合并区分下单/回输）
    function renderOV(elId) {
        var y = parseInt($('#p4y').val(), 10), m = parseInt($('#p4m').val(), 10);
        var groups = [
            { type: '下单', fld: 'o', items: CH_ITEMS },
            { type: '回输', fld: 'r', items: CH_ITEMS }
        ];
        var h = '<table class="p3t p3t-ov"><thead><tr><th class="p3t-type">类型</th><th class="p3t-lbl">渠道</th>';
        for (var i = 1; i <= 12; i++) h += '<th>' + i + '月</th>';
        h += '<th class="p3t-ytd">YTD</th></tr></thead><tbody>';
        groups.forEach(function (g) {
            g.items.forEach(function (it, idx) {
                h += '<tr class="' + (it.total ? 'p3t-total-row' : '') + '">' +
                    (idx === 0 ? '<td class="p3t-type" rowspan="' + g.items.length + '">' + g.type + '</td>' : '') +
                    '<td class="p3t-lbl">' + it.label + '</td>';
                var ya = 0;
                for (var i = 1; i <= 12; i++) {
                    if (i > m) { h += '<td></td>'; continue; }
                    var a = mVal(OV, y, i, it.key, g.fld);
                    ya += a;
                    h += '<td' + (i === m ? ' class="p3t-cur"' : '') + '>' + (a > 0 ? a : '') + '</td>';
                }
                h += '<td class="p3t-ytd">' + (ya > 0 ? ya : '') + '</td></tr>';
            });
        });
        h += '</tbody></table>';
        document.getElementById(elId).innerHTML = h;
    }

    function renderTables() {
        renderREG('p3t61', '3. 辖区下单达成', 'o');
        renderREG('p3t62', '4. 辖区回输达成', 'r');
        renderOV('p3t43');
    }

    updateAll();
});
