// time_range.js — 全站统一「时间区间」控件（项目标准见 项目文档 §10.5）
// 形态：开始年 / 开始月 ~ 结束年 / 结束月（4 个 .pt-sel 下拉，与全站其它筛选器同款）
// 口径：YTD 不再是独立口径，而是「开始 = 结束所在年的 1 月」的默认值。
// 用法：
//   var RG = TR.init({ y1:'#p4y1', m1:'#p4m1', y2:'#p4y2', m2:'#p4m2',
//                      months:[...], sameYear:true, storageKey:'pt_range', onChange:render });
//   var rg = RG.read();            // { a:'2026-01', b:'2026-11', y1,m1,y2,m2, months:[...] }
//   TR.inRange('2026-05', rg)      // 'YYYY-MM' 是否在区间内
// 单月页（CART 日历这种一个月一张的）：TR.init({ y:'#p10y', m:'#p10m', single:true, ... })
// 约定：
//   - 默认结束 = 系统当前月；默认开始 = 结束所在年 1 月；生成默认值时断言两者同年，跨年直接报错；
//   - sameYear:true（按年 12 月矩阵 / 按年预聚合）选跨年时把另一端的年份夹到同年并提示；
//   - 起止选反自动夹（不静默换口径），控件旁 .tr-note 提示 3.6 秒。
window.TR = (function () {
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function ym(y, m) { return y + '-' + pad2(m); }
    function parseYm(s) { return { y: +String(s).slice(0, 4), m: +String(s).slice(5, 7) }; }
    function nowYm() { var d = new Date(); return ym(d.getFullYear(), d.getMonth() + 1); }
    function isYm(k) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(k)); }
    function el(sel) { return typeof sel === 'string' ? document.querySelector(sel) : sel; }

    function monthsBetween(a, b) {
        if (!isYm(a) || !isYm(b)) return [];
        if (a > b) { var t = a; a = b; b = t; }
        var s = parseYm(a), e = parseYm(b), out = [], guard = 0;
        var y = s.y, m = s.m;
        while (!(y > e.y || (y === e.y && m > e.m)) && guard++ < 1200) {
            out.push(ym(y, m));
            if (++m > 12) { m = 1; y++; }
        }
        return out;
    }
    function inRange(k, rg) { return !!rg && String(k) >= rg.a && String(k) <= rg.b; }

    function init(o) {
        o = o || {};
        var single = !!o.single;
        var $y1, $m1, $y2, $m2;
        if (single) {
            $y1 = el(o.y); $m1 = el(o.m);
            if (!$y1 || !$m1) return null;
            $y2 = $y1; $m2 = $m1;
        } else {
            $y1 = el(o.y1); $m1 = el(o.m1); $y2 = el(o.y2); $m2 = el(o.m2);
            if (!$y1 || !$m1 || !$y2 || !$m2) return null;
        }

        // ── 年份集合：数据月份里的年份 ∪ 当前年 ──
        var years = {}, cur = nowYm(), curY = cur.slice(0, 4), curM = +cur.slice(5, 7);
        (o.months || []).forEach(function (k) { if (isYm(k)) years[k.slice(0, 4)] = 1; });
        years[curY] = 1;
        var ys = Object.keys(years).sort();

        // ── 默认区间：结束 = 系统当前月；开始 = 结束所在年 1 月 ──
        var defY2 = o.defaultY2 || curY, defM2 = o.defaultM2 || curM;
        var defY1 = o.defaultY1 || defY2, defM1 = o.defaultM1 || 1;
        // 只有 sameYear 页面（矩阵页）才要求默认区间同年；逐单页默认可以是「全量区间」跨年
        if (o.sameYear && defY1 !== defY2) {
            showNote('开始月与结束月必须在同一年');
            try { console.error('[TR] 默认区间跨年：' + defY1 + ' vs ' + defY2); } catch (e) {}
        }
        if (defY1 > defY2 || (defY1 === defY2 && defM1 > defM2)) { defY1 = defY2; defM1 = 1; }

        var yHtml = ys.map(function (y) { return '<option value="' + y + '">' + y + ' 年</option>'; }).join('');
        var mHtml = '';
        for (var i = 1; i <= 12; i++) mHtml += '<option value="' + i + '">' + i + ' 月</option>';

        [$y1, $y2].forEach(function ($s) { if ($s) $s.innerHTML = yHtml; });
        [$m1, $m2].forEach(function ($s) { if ($s) $s.innerHTML = mHtml; });
        $y1.value = defY1; $m1.value = defM1;
        if (!single) { $y2.value = defY2; $m2.value = defM2; }

        // ── 共享状态（同 storageKey 的页面区间一致）──
        if (o.storageKey) {
            try {
                var sv = JSON.parse(sessionStorage.getItem(o.storageKey) || 'null');
                if (sv && ys.indexOf(String(sv.y1)) >= 0 && ys.indexOf(String(sv.y2)) >= 0) {
                    $y1.value = String(sv.y1); $m1.value = String(sv.m1);
                    if (!single) { $y2.value = String(sv.y2); $m2.value = String(sv.m2); }
                }
            } catch (e) {}
        }

        var note = null;
        function showNote(msg) {
            var anchor = single ? $m1 : $m2;
            if (!note) {
                note = document.createElement('span');
                note.className = 'tr-note';
                (anchor.parentNode || document.body).insertBefore(note, anchor.nextSibling);
            }
            note.textContent = msg;
            note.classList.add('on');
            clearTimeout(note._t);
            note._t = setTimeout(function () { note.classList.remove('on'); }, 3600);
        }
        function save() {
            try {
                if (o.storageKey) sessionStorage.setItem(o.storageKey, JSON.stringify({ y1: $y1.value, m1: $m1.value, y2: $y2.value, m2: $m2.value }));
            } catch (e) {}
        }

        // 年份联动 + 顺序纠偏；src = 'start' | 'end'
        function clamp(src) {
            if (single) return;
            var y1 = $y1.value, y2 = $y2.value;
            if (o.sameYear && y1 !== y2) {
                if (src === 'end') { $y1.value = y2; showNote('开始年已随结束年夹到 ' + y2 + ' 年'); }
                else { $y2.value = y1; showNote('结束年已随开始年夹到 ' + y1 + ' 年'); }
                y1 = $y1.value; y2 = $y2.value;
            }
            if (y1 === y2) {
                var m1 = +$m1.value, m2v = +$m2.value;
                if (m1 > m2v) {
                    if (src === 'end') { $m1.value = String(m2v); showNote('开始月不能晚于结束月，已改为与结束月相同'); }
                    else { $m2.value = String(m1); showNote('结束月不能早于开始月，已改为与开始月相同'); }
                }
            }
        }

        var noop = function () {};
        [[$y1, 'start'], [$m1, 'start'], [$y2, 'end'], [$m2, 'end']].forEach(function (p) {
            if (!p[0]) return;
            p[0].addEventListener('change', function () { clamp(p[1]); save(); (o.onChange || noop)(); });
        });
        clamp('end');

        var api = {
            single: single,
            read: function () {
                var y1 = +$y1.value, m1 = +$m1.value;
                var y2 = single ? y1 : +$y2.value, m2 = single ? m1 : +$m2.value;
                var a = ym(y1, m1), b = ym(y2, m2);
                if (a > b) { var t = a; a = b; b = t; var ty = y1, tm = m1; y1 = y2; m1 = m2; y2 = ty; m2 = tm; }
                return { a: a, b: b, y1: y1, m1: m1, y2: y2, m2: m2, months: monthsBetween(a, b) };
            },
            inRange: function (k) { return inRange(k, api.read()); },
            years: function () { return ys.slice(); },
            // 程序化设定区间（追溯码定位到某个月时用）：不触发 onChange，调用方自己重绘
            setRange: function (a, b) {
                if (!isYm(a) || !isYm(b)) return;
                var A = parseYm(a), B = parseYm(b), py1 = $y1.value, pm1 = $m1.value, py2 = $y2.value, pm2 = $m2.value;
                $y1.value = String(A.y); $m1.value = String(A.m);
                if (!single) { $y2.value = String(B.y); $m2.value = String(B.m); }
                if (!$y1.value || !$m1.value || (single ? false : (!$y2.value || !$m2.value))) {
                    $y1.value = py1; $m1.value = pm1; $y2.value = py2; $m2.value = pm2;
                    return;
                }
                clamp('end'); save();
            }
        };
        return api;
    }

    return {
        init: init,
        pad2: pad2,
        ym: ym,
        parseYm: parseYm,
        nowYm: nowYm,
        isYm: isYm,
        monthsBetween: monthsBetween,
        inRange: inRange
    };
})();
