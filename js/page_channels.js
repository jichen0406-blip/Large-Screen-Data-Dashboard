// page_channels.js — 患者渠道销量（key channels，海外业务）：渠道 × 12月 + YTD，下单/回输各一组
// 数据：BOARD_DATA.REGIONS.OV（键 'YYYY-MM' → 渠道键 → {o,r}）；共享函数见 js/pt-common.js
$(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.REGIONS) return;
    var OV = B.REGIONS.OV || {};

    var CH_ITEMS = [
        { label: '国内医生导流', key: 'docRef' },
        { label: 'OB导流', key: 'obRef' },
        { label: '香港商业化', key: 'hk' },
        { label: '新加坡商业化', key: 'sg' },
        { label: '沙特NPP', key: 'ksa' },
        { label: 'Total', key: 'total', total: true }
    ];

    var yearKeys = {};
    Object.keys(OV).forEach(function (k) { yearKeys[k.slice(0, 4)] = true; });
    initPtTime('#chY', '#chM', yearKeys, render);

    // 仅达成（白字），Total 蓝色行；首列「类型」合并区分下单/回输
    function render() {
        var y = parseInt($('#chY').val(), 10), m = parseInt($('#chM').val(), 10);
        if (!y) return;
        var groups = [
            { type: '下单', fld: 'o', items: CH_ITEMS },
            { type: '回输', fld: 'r', items: CH_ITEMS }
        ];
        var h = '<table class="pt pt-ov"><thead><tr><th class="pt-type">类型</th><th class="pt-lbl">渠道</th>';
        for (var i = 1; i <= 12; i++) h += '<th>' + i + '月</th>';
        h += '<th class="pt-ytd">YTD</th><th>趋势图</th></tr></thead><tbody>';
        groups.forEach(function (g) {
            g.items.forEach(function (it, idx) {
                h += '<tr class="' + (it.total ? 'pt-total-row' : '') + '">' +
                    (idx === 0 ? '<td class="pt-type" rowspan="' + g.items.length + '">' + g.type + '</td>' : '') +
                    '<td class="pt-lbl">' + it.label + '</td>';
                var ya = 0, series = [];
                for (var i = 1; i <= 12; i++) {
                    var a = mVal(OV, y, i, it.key, g.fld);
                    series.push(a);
                    if (i > m) { h += '<td></td>'; continue; }
                    ya += a;
                    h += '<td' + (i === m ? ' class="pt-cur"' : '') + '>' + (a > 0 ? a : '') + '</td>';
                }
                h += '<td class="pt-ytd">' + (ya > 0 ? ya : '') + '</td>' +
                    '<td class="pt-spark">' + spark(series, m) + '</td></tr>';
            });
        });
        h += '</tbody></table>';
        document.getElementById('chtbl').innerHTML = h;
    }

    render();
});
