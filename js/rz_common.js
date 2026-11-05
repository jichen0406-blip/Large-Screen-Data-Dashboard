// rz_common.js — 生产侧四页共用（时间区间下拉、月份工具、分位数、格式化）
// 使用前：页面里按 id 约定放 #<p>Y1 #<p>M1 #<p>Y2 #<p>M2 四个 select
window.RZ = (function () {
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function ym(y, m) { return y + '-' + pad2(m); }

    // 由月份集合生成「年 / 月」下拉，默认区间 = 数据截止年的 1 月 → 截止月
    function initRange(prefix, months, dp) {
        var years = {}, by = {};
        months.forEach(function (k) {
            var y = k.slice(0, 4), m = +k.slice(5, 7);
            years[y] = 1;
            (by[y] = by[y] || {})[m] = 1;
        });
        var ys = Object.keys(years).sort();
        var dY = dp ? dp.slice(0, 4) : (ys[ys.length - 1] || '');
        var dM = dp ? +dp.slice(5, 7) : 12;
        if (ys.indexOf(dY) < 0) dY = ys[ys.length - 1];

        var $Y1 = document.getElementById(prefix + 'Y1'), $M1 = document.getElementById(prefix + 'M1');
        var $Y2 = document.getElementById(prefix + 'Y2'), $M2 = document.getElementById(prefix + 'M2');
        if (!$Y1) return null;

        function yrs(sel, val) {
            sel.innerHTML = ys.map(function (y) { return '<option value="' + y + '">' + y + ' 年</option>'; }).join('');
            sel.value = val;
        }
        function mons(sel, y, val) {
            var ms = Object.keys(by[y] || {}).map(Number).sort(function (a, b) { return a - b; });
            if (!ms.length) { for (var i = 1; i <= 12; i++) ms.push(i); }
            sel.innerHTML = ms.map(function (m) { return '<option value="' + m + '">' + m + ' 月</option>'; }).join('');
            // 目标月份不在该年可选范围内时，回落到最后一个可用月份（避免出现 0 月）
            var v = String(val);
            if (ms.map(String).indexOf(v) < 0) v = String(ms[ms.length - 1]);
            sel.value = v;
        }
        yrs($Y1, dY); mons($M1, dY, 1);
        yrs($Y2, dY); mons($M2, dY, dM);

        $Y1.addEventListener('change', function () { mons($M1, $Y1.value, 1); });
        $Y2.addEventListener('change', function () { mons($M2, $Y2.value, +$M2.value || 12); });
        return { $Y1: $Y1, $M1: $M1, $Y2: $Y2, $M2: $M2 };
    }

    function readRange(prefix) {
        var y1 = +document.getElementById(prefix + 'Y1').value;
        var m1 = +document.getElementById(prefix + 'M1').value;
        var y2 = +document.getElementById(prefix + 'Y2').value;
        var m2 = +document.getElementById(prefix + 'M2').value;
        if (!m1 || m1 < 1 || m1 > 12) m1 = 1;
        if (!m2 || m2 < 1 || m2 > 12) m2 = 12;
        if (y1 > y2 || (y1 === y2 && m1 > m2)) { var t = [y1, m1]; y1 = y2; m1 = m2; y2 = t[0]; m2 = t[1]; }
        return { a: ym(y1, m1), b: ym(y2, m2), y1: y1, m1: m1, y2: y2, m2: m2 };
    }

    // 区间内的连续月份
    function monthsBetween(rg) {
        var out = [], y = rg.y1, m = rg.m1, guard = 0;
        while ((y < rg.y2 || (y === rg.y2 && m <= rg.m2)) && guard++ < 600) {
            out.push(ym(y, m));
            m++; if (m > 12) { m = 1; y++; }
        }
        return out;
    }

    // 分位数：与 Excel QUARTILE.INC 一致（线性插值）
    function pct(sorted, p) {
        var n = sorted.length;
        if (!n) return null;
        if (n === 1) return sorted[0];
        var k = (n - 1) * p, lo = Math.floor(k), hi = Math.min(lo + 1, n - 1);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
    }

    // 箱线统计：须 = 1.5×IQR 内的极值，超出者为离群点
    function boxStats(vals) {
        if (!vals.length) return null;
        var v = vals.slice().sort(function (a, b) { return a - b; });
        var q1 = pct(v, .25), q2 = pct(v, .5), q3 = pct(v, .75), iqr = q3 - q1;
        var loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr;
        var inside = v.filter(function (x) { return x >= loF && x <= hiF; });
        var out = v.filter(function (x) { return x < loF || x > hiF; });
        return {
            min: inside.length ? inside[0] : v[0],
            whi: inside.length ? inside[inside.length - 1] : v[v.length - 1],
            q1: q1, q2: q2, q3: q3, out: out, n: v.length,
            data: [inside.length ? inside[0] : v[0], q1, q2, q3, inside.length ? inside[inside.length - 1] : v[v.length - 1]]
        };
    }

    function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
    function median(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function pctStr(v, d) { return (v == null || !isFinite(v)) ? '—' : v.toFixed(d == null ? 1 : d) + '%'; }

    // 统一图表外观
    function axisStyle(extra) {
        var o = {
            axisLine: { lineStyle: { color: 'rgba(112,187,252,.45)' } },
            axisLabel: { color: 'rgba(223,244,255,.7)', fontSize: 10 },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } }
        };
        for (var k in (extra || {})) o[k] = extra[k];
        return o;
    }

    function barTooltip() {
        return {
            backgroundColor: 'rgba(2,24,61,.94)', borderColor: 'rgba(47,137,207,.8)', borderWidth: 1,
            textStyle: { color: '#dff4ff', fontSize: 12 },
            extraCssText: 'box-shadow:0 0 20px rgba(47,137,207,.4);border-radius:8px;'
        };
    }

    return {
        pad2: pad2, ym: ym,
        initRange: initRange, readRange: readRange, monthsBetween: monthsBetween,
        boxStats: boxStats, mean: mean, median: median,
        esc: esc, pctStr: pctStr, axisStyle: axisStyle, barTooltip: barTooltip
    };
})();
