// cart_daily.js — CART运营-日历：细胞订单(BS Order)执行监控
// 把每单拆成「单采/回输」两条记录，四色状态灯(红/灰/黄/绿) 日历 Dashboard + 工作量提醒
// 状态按「今天」判定：无后端，取客户端北京时间(UTC+8)实时值；数据层只给原始计划/实际日期
// 明细表已拆到独立的「CART运营-明细」页（page34.html / js/cart_detail.js）
(function () {
    var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
    if (!B || !B.CART_DAILY) return;
    var DATA = B.CART_DAILY;
    var C = window.CART_COMMON;
    var pad2 = C.pad2, beijingToday = C.beijingToday;
    var TYPE_LABEL = C.TYPE_LABEL, LIGHTS = C.LIGHTS, LK = C.LK;
    var stateOf = C.stateOf, stateOrder = C.stateOrder, statHTML = C.statHTML;

    // 可用月份（按计划日期）用于默认定位最新月
    var monthSet = {};
    DATA.forEach(function (r) { monthSet[r.plan.slice(0, 7)] = true; });
    var YMS = Object.keys(monthSet).sort();
    var DEF_YM = YMS.length ? YMS[YMS.length - 1] : beijingToday().slice(0, 7);
    var yearSet = {};
    YMS.forEach(function (ym) { yearSet[ym.slice(0, 4)] = true; });
    var YEARS = Object.keys(yearSet).sort().reverse(); // 新→旧

    var selY = parseInt(DEF_YM.slice(0, 4), 10);
    var selM = parseInt(DEF_YM.slice(5, 7), 10);
    var selLights = { red: true, gray: true, yellow: true, green: true };
    var selCos = 'ALL';          // 提醒块 COS 筛选（不影响日历）
    var hl = null, focus = null, msg = '';

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
    function fillCos() {
        var ro = C.roster();
        var names = Object.keys(ro);
        // 花名册优先；历史数据里出现但不在册的 COS 也一并列出，避免筛选漏人
        var extra = {};
        DATA.forEach(function (r) { if (r.cos && !ro[r.cos]) extra[r.cos] = true; });
        var all = names.concat(Object.keys(extra).sort());
        var h = '<option value="ALL">全部 COS</option>';
        all.forEach(function (n) {
            var city = C.cosCity(n);
            h += '<option value="' + n + '">' + n + (city ? '（' + city + '）' : '') + (C.isPartTime(n) ? ' ·兼职' : '') + '</option>';
        });
        $('#p10cos').html(h).val(selCos);
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

    // ---------- 当月记录（日历与提醒共用同一口径） ----------
    function monthRecs(today) {
        var ym = selY + '-' + pad2(selM);
        return DATA.filter(function (r) {
            if (focus) return inFocus(r);
            if (r.plan.slice(0, 7) !== ym || !selLights[stateOf(r, today)]) return false;
            // COS 筛选对日历与预警同时生效
            if (selCos !== 'ALL' && (r.cos || '') !== selCos) return false;
            return true;
        });
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

    // 某天的风险：按 COS 聚合，涉及 ≥2 家医院即「无法覆盖」
    function dayRisk(recs) {
        var byCos = {};
        recs.forEach(function (r) {
            var c = byCos[r.cos || ''] || (byCos[r.cos || ''] = { cos: r.cos || '', hosps: {}, n: 0, ap: 0, re: 0 });
            if (r.hosp) c.hosps[r.hosp] = true;
            c.n++;
            if (r.type === 'apheresis') c.ap++; else c.re++;
        });
        var out = [];
        Object.keys(byCos).forEach(function (k) {
            var c = byCos[k];
            if (!c.cos) return;                                   // 未指定 COS 的不判风险
            if (Object.keys(c.hosps).length < 2) return;          // 单家医院 = 可完成
            out.push({ cos: c.cos, hosps: Object.keys(c.hosps).length, n: c.n, ap: c.ap, re: c.re });
        });
        out.sort(function (a, b) { return b.hosps - a.hosps || b.n - a.n; });
        return out;
    }

    // 当天完全没有任务的 COS（推荐人选）；兼职 COS 仅在顶替对象出风险时出现
    function freeCos(recs, riskList) {
        var busy = {};
        recs.forEach(function (r) { if (r.cos) busy[r.cos] = true; });
        var riskCos = {};
        riskList.forEach(function (x) { riskCos[x.cos] = true; });
        var ro = C.roster();
        var out = [];
        Object.keys(ro).forEach(function (n) {
            if (busy[n]) return;
            var bo = ro[n].backupOf;
            if (bo && !riskCos[bo]) return;   // 兼职：只有其「可顶替的人」出风险才推荐
            out.push({ name: n, city: ro[n].city || '', backupOf: bo || '' });
        });
        // 同城优先（按风险方所在城市），其余按原顺序
        var wantCity = {};
        riskList.forEach(function (x) { var cy = C.cosCity(x.cos); if (cy) wantCity[cy] = true; });
        out.sort(function (a, b) {
            var sa = wantCity[a.city] ? 0 : 1, sb = wantCity[b.city] ? 0 : 1;
            return sa - sb;
        });
        return out;
    }

    function renderCalendar(today, recs) {
        var ym = selY + '-' + pad2(selM);
        var first = new Date(Date.UTC(selY, selM - 1, 1));
        var firstDow = (first.getUTCDay() + 6) % 7; // 周一=0
        var dim = new Date(Date.UTC(selY, selM, 0)).getUTCDate();
        var dayRecs = {};
        var monthCnt = {}; LIGHTS.forEach(function (l) { monthCnt[l.k] = 0; });
        recs.forEach(function (r) {
            var d = parseInt(r.plan.slice(8, 10), 10);
            (dayRecs[d] = dayRecs[d] || []).push(r);
            monthCnt[stateOf(r, today)]++;
        });
        var height = {};  // 每天风险人数（角标）
        var html = '<div class="cart-wd">' + WD_HDR.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>';
        var grid = '';
        var total = 0;
        for (var cell = 0; cell < firstDow + dim; cell++) {
            var d = cell - firstDow + 1;
            var todayCls = (ym === today.slice(0, 7) && d === parseInt(today.slice(8, 10), 10)) ? ' today' : '';
            if (d < 1) { grid += '<div class="cart-day off"></div>'; continue; }
            var dayList = dayRecs[d] || [];
            total += dayList.length;
            var rk = dayRisk(dayList);
            var riskBadge = rk.length ? '<span class="cart-day-risk" data-day="' + d + '" title="点击查看当天预警详情">⚠' + rk.length + '</span>' : '';
            var cards = dayList.map(function (r) { return cardHTML(r, today); }).join('');
            var stCnt = {};
            dayList.forEach(function (r) { var k = stateOf(r, today); stCnt[k] = (stCnt[k] || 0) + 1; });
            grid += '<div class="cart-day' + todayCls + '">' +
                '<div class="cd-hd"><span class="cd-date">' + d + '</span>' + riskBadge + '<span class="cd-st">' + statHTML(stCnt) + '</span></div>' +
                '<div class="cd-body">' + (cards || '<div class="cd-empty">—</div>') + '</div>' +
                '</div>';
        }
        var filled = firstDow + dim;
        while (filled % 7) { grid += '<div class="cart-day off"></div>'; filled++; }
        $('#p10cal').html(html + '<div class="cart-grid">' + grid + '</div>');
        $('#p10calstat').html('<b class="cart-total">共 ' + total + ' 条</b>' + statHTML(monthCnt, true));
        if (hl) highlightHit();
        return recs;
    }

    // ---------- 工作量提醒 ----------
    function renderWarn(today, recs) {
        var dim = new Date(Date.UTC(selY, selM, 0)).getUTCDate();
        var byDay = {};
        recs.forEach(function (r) {
            var d = parseInt(r.plan.slice(8, 10), 10);
            (byDay[d] = byDay[d] || []).push(r);
        });
        var days = [];
        var totalRisk = 0;
        for (var d = dim; d >= 1; d--) {                       // 日期降序：当月最后一天在最上
            var list = byDay[d] || [];
            var rk = dayRisk(list);
            if (selCos !== 'ALL') rk = rk.filter(function (x) { return x.cos === selCos; });
            if (!rk.length) continue;
            totalRisk += rk.length;
            days.push({ d: d, list: list, risk: rk });
        }
        var ym = selY + '-' + pad2(selM);
        var hd = '<div class="cart-warn-hdr"><span class="w-date">日期</span><span class="w-risk">无法覆盖的 COS</span><span class="w-free">当天可支援（空闲）</span></div>';
        if (!days.length) {
            $('#p10warn').html(hd + '<div class="cart-warn-empty">本月没有「同一 COS 同一天跨多家医院」的情况 ✓</div>');
            $('#p10warnstat').text('');
            return;
        }
        var rows = '';
        days.forEach(function (x) {
            var dd = ym + '-' + pad2(x.d);
            var riskHtml = x.risk.map(function (k) {
                var ro = C.roster()[k.cos];
                var city = (ro && ro.city) ? ('·' + ro.city) : '';
                var bo = (ro && ro.backupOf) ? ('<i class="w-part">兼职</i>') : '';
                return '<span class="w-cos">' + k.cos + city + bo + '</span>' +
                    '<span class="w-meta">' + k.hosps + ' 家医院 · ' + k.n + ' 单（单采 ' + k.ap + ' / 回输 ' + k.re + '）</span>';
            }).join('');
            var free = freeCos(x.list, x.risk);
            var freeHtml = free.length
                ? free.slice(0, 8).map(function (f) {
                    return '<span class="w-free-i' + (f.backupOf ? ' pt' : '') + '">' + f.name +
                        (f.city ? '<em>' + f.city + '</em>' : '') +
                        (f.backupOf ? '<i>替' + f.backupOf + '</i>' : '') + '</span>';
                }).join('')
                : '<span class="w-none">当天全员有任务</span>';
            rows += '<div class="cart-warn-row">' +
                '<span class="w-date">' + dd + '<em>周' + '日一二三四五六'.charAt(new Date(Date.UTC(selY, selM - 1, x.d)).getUTCDay()) + '</em></span>' +
                '<span class="w-risk">' + riskHtml + '</span>' +
                '<span class="w-free">' + freeHtml + '</span>' +
                '</div>';
        });
        $('#p10warn').html(hd + '<div class="cart-warn-body">' + rows + '</div>');
        $('#p10warnstat').html('<b class="cart-total">' + days.length + ' 天 · ' + totalRisk + ' 人次无法覆盖</b>');
    }

    // 搜索命中后：日历卡片高亮闪烁并滚动到可视区
    function highlightHit() {
        if (!hl) return;
        var cards = document.querySelectorAll('#p10cal .cart-card');
        for (var j = 0; j < cards.length; j++) {
            if (cards[j].getAttribute('data-k') === hl.code && cards[j].getAttribute('data-t') === hl.type) {
                cards[j].scrollIntoView({ block: 'nearest' });
                break;
            }
        }
    }

    // ---------- 浮窗：当天预警详情 / 判定逻辑 ----------
    var $Modal = null;
    function modalOpen(title, html) {
        if (!$Modal) $Modal = $('#bdModal');
        $('#bdModalTitle').text(title);
        $('#bdModalBody').html(html);
        $Modal.addClass('on');
    }
    function modalClose() { if ($Modal) $Modal.removeClass('on'); else $('#bdModal').removeClass('on'); }

    function openDayModal(day) {
        var today = beijingToday();
        var ym = selY + '-' + pad2(selM);
        var ds = ym + '-' + pad2(day);
        var list = monthRecs(today).filter(function (r) { return parseInt(r.plan.slice(8, 10), 10) === day; });
        var rk = dayRisk(list);
        if (selCos !== 'ALL') rk = rk.filter(function (x) { return x.cos === selCos; });
        var h = '';
        if (!rk.length) {
            h = '<div class="bd-modal-sec"><p>当天没有「同一 COS 跨多家医院」的情况。</p></div>';
        } else {
            h += '<div class="bd-modal-sec"><h4>无法覆盖的 COS（' + rk.length + ' 人）</h4>';
            rk.forEach(function (k) {
                var mine = list.filter(function (r) { return (r.cos || '') === k.cos; });
                var city = C.cosCity(k.cos);
                h += '<div class="bd-cos-blk">' +
                    '<div class="bd-cos-hd">' + k.cos + (city ? '·' + city : '') +
                    '　<span style="font-weight:400;color:rgba(255,255,255,.6)">' + k.hosps + ' 家医院 · ' + k.n + ' 单（单采 ' + k.ap + ' / 回输 ' + k.re + '）</span></div>' +
                    mine.map(function (r) {
                        return '<div class="bd-task">' +
                            '<span class="t-type ' + (r.type === 'apheresis' ? 'ap' : 're') + '">' + (r.type === 'apheresis' ? '单采' : '回输') + '</span>' +
                            '<span class="t-hosp" title="' + r.hosp + '">' + (r.hosp || '未知医院') + '</span>' +
                            '<span class="t-code">' + (r.code || '(无码)') + '</span>' +
                            '</div>';
                    }).join('') +
                    '</div>';
            });
            h += '</div>';
            var free = freeCos(list, rk);
            h += '<div class="bd-modal-sec"><h4>当天可支援（空闲）</h4>';
            h += free.length
                ? '<div class="bd-free">' + free.map(function (f) {
                    return '<span class="w-free-i' + (f.backupOf ? ' pt' : '') + '">' + f.name +
                        (f.city ? '<em>' + f.city + '</em>' : '') + (f.backupOf ? '<i>替' + f.backupOf + '</i>' : '') + '</span>';
                }).join('') + '</div>'
                : '<p class="w-none">当天全员有任务</p>';
            h += '</div>';
        }
        modalOpen(ds + ' 预警详情', h);
    }

    var RULE_HTML =
        '<div class="bd-modal-sec"><h4>判定口径</h4>' +
        '<p>① 取<b>当前所选年月</b>、且通过<b>状态灯筛选</b>与 <b>COS 筛选</b>后的记录，按计划日期逐日落格。</p>' +
        '<p>② 同一天内按 COS 归集：某 COS 当天的任务涉及 <b>≥2 家不同医院</b> → 判为「<b>无法覆盖</b>」，日历当天出现 <b>⚠N</b>（N = 无法覆盖的人数）。</p>' +
        '<p>③ 以下情形视作<b>可以完成</b>，不预警：<br>· 同一家医院的多个单采 / 回输<br>· 同一城市内当天仅有回输任务且 ≤3 个</p>' +
        '</div>' +
        '<div class="bd-modal-sec"><h4>可支援推荐</h4>' +
        '<p>① 只列当天<b>完全没有任务</b>的 COS，按所在城市就近排序（不做距离计算）。</p>' +
        '<p>② <b>兼职 COS</b>（花名册标记「只替换X」，如 <b>林雅珺只顶替付苗</b>）默认不参与推荐；仅当其可顶替的人当天出风险时才列出，并标注「替X」。</p>' +
        '</div>' +
        '<div class="bd-modal-sec"><h4>数据范围</h4>' +
        '<p>仅统计已排期订单（取消 / 终止 / 未排期已在数据层过滤）；COS 取自订单申请时的运营专员，<b>中途换人与二次单采不纳入</b>。</p>' +
        '</div>';

    function renderAll() {
        var today = beijingToday();
        var recs = monthRecs(today);
        renderCalendar(today, recs);
        renderWarn(today, recs);
    }

    // ---------- 搜索 ----------
    function doSearch() {
        var code = String($('#p10code').val() || '').trim();
        var qtype = $('#p10qtype').val();
        if (!code) { $('#p10msg').text('请输入追溯码').addClass('err'); return; }
        var hitRec = null;
        DATA.forEach(function (r) { if (r.code === code && r.type === qtype && !hitRec) hitRec = r; });
        if (!hitRec) {
            hl = null; focus = null;
            $('#p10msg').text('未找到该追溯码对应的记录（可能不存在 / 已取消或终止被过滤 / 未排期不显示）').addClass('err');
            renderAll();
            return;
        }
        selY = parseInt(hitRec.plan.slice(0, 4), 10);
        selM = parseInt(hitRec.plan.slice(5, 7), 10);
        LIGHTS.forEach(function (l) { selLights[l.k] = true; });
        $('#p10y').val(String(selY)); $('#p10m').val(String(selM));
        hl = { code: code, type: qtype };
        focus = { code: code, type: qtype };
        msg = '';
        $('#p10msg').text('已定位：' + code + '（' + TYPE_LABEL[qtype] + '，' + hitRec.plan + '）· 仅显示该订单，点「清空」返回整月').removeClass('err');
        renderAll();
    }
    function doClear() {
        $('#p10code').val('');
        $('#p10msg').text('').removeClass('err');
        hl = null; focus = null;
        renderAll();
    }

    // ---------- 事件绑定 ----------
    function rerender() { hl = null; focus = null; msg = ''; $('#p10msg').text('').removeClass('err'); renderAll(); }
    function bindEvents() {
        $('#p10y').on('change', function () { selY = parseInt(this.value, 10); rerender(); });
        $('#p10m').on('change', function () { selM = parseInt(this.value, 10); rerender(); });
        $('#p10cos').on('change', function () {
            selCos = this.value;
            renderAll();                            // 日历 + 预警 同步按 COS 过滤
        });
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
        fillCos();
        renderLights();
        bindEvents();
        renderAll();

        // 日历角标 → 当天预警详情浮窗
        $('#p10cal').on('click', '.cart-day-risk', function () {
            openDayModal(parseInt($(this).attr('data-day'), 10));
        });
        // 标题 ⓘ → 判定逻辑浮窗
        $('#p10warnInfo').on('click', function () { modalOpen('工作预警 · 判定逻辑', RULE_HTML); });
        $('#bdModalClose, #bdModalMask').on('click', modalClose);
        $(document).on('keydown', function (e) { if (e.key === 'Escape') modalClose(); });
    });
})();
