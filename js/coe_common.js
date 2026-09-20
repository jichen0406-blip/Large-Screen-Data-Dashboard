// coe_common.js — COE 分类医院数据（SCOE / COE / RCOE 三页共用）
// 由 window.PAGE_KEY 决定渲染哪一页；数据来自 BOARD_DATA.COE_PAGES
// 表格：每院两行（下单/回输），左侧 AM/省份/城市/医院名 纵向合并；YTD 与同比均按 YTD 口径
(function () {
  $(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.COE_PAGES || !B.COE_PAGES.pages) return;
    var KEYMAP = { coe_scoe: 'SCOE', coe_coe: 'COE', coe_rcoe: 'RCOE' };
    var CAT = KEYMAP[window.PAGE_KEY];
    if (!CAT) return;

    var C = B.COE_PAGES;
    var PAGE = C.pages[CAT] || { hospitals: [] };
    var TOT = C.totals || {};
    var ALLCATS = ['SCOE', 'COE', 'RCOE', 'Others'];

    var yearKeys = {};
    Object.keys(TOT).forEach(function (y) { yearKeys[y] = true; });

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function ytd(a, m) { var s = 0; for (var i = 0; i < m; i++) s += (a && a[i]) || 0; return s; }
    function curY() { return String($('#coeY').val() || ''); }
    function curM() { return parseInt($('#coeM').val(), 10) || 12; }

    // 该分类 / 全盘 的 YTD 合计（取自 totals，含 Others，DOM 口径）
    function catTotals(y, m) {
      var t = TOT[y] || {}, o = 0, r = 0, allO = 0, allR = 0;
      ALLCATS.forEach(function (c) {
        var b = t[c] || {}, co = ytd(b.o, m), cr = ytd(b.r, m);
        allO += co; allR += cr;
        if (c === CAT) { o = co; r = cr; }
      });
      return { o: o, r: r, allO: allO, allR: allR };
    }

    // ── 迷你趋势图：1 月～所选月折线 + 最小二乘拟合线（内联 SVG，不依赖 echarts） ──
    // 只纳入「已到月份」：未来月份无数据，若按 0 参与拟合会让所有斜率人为下降
    function spark(arr, m, w, h) {
      var vals = (arr || []).slice(0, Math.max(1, Math.min(12, m)));
      var n = vals.length;
      var mx = Math.max.apply(null, vals.concat([1]));
      function X(i) { return n > 1 ? (i / (n - 1)) * (w - 2) + 1 : w / 2; }
      function Y(v) { return h - 2 - ((v || 0) / mx) * (h - 4); }
      function clip(v) { return Math.min(mx, Math.max(0, v)); }
      var pts = vals.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
      var out = '<svg class="coe-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' +
        '<polyline points="' + pts + '" fill="none" stroke="#4fe3ff" stroke-width="1.4" stroke-linejoin="round"/>';
      if (n > 1) {
        var sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (var i = 0; i < n; i++) { sx += i; sy += vals[i]; sxx += i * i; sxy += i * vals[i]; }
        var den = n * sxx - sx * sx;
        var b = den ? (n * sxy - sx * sy) / den : 0;
        var a = (sy - b * sx) / n;
        var fit = X(0).toFixed(1) + ',' + Y(clip(a)).toFixed(1) + ' ' + X(n - 1).toFixed(1) + ',' + Y(clip(a + b * (n - 1))).toFixed(1);
        out += '<polyline points="' + fit + '" fill="none" stroke="' + (b >= 0 ? '#62c98d' : '#ff8c42') + '" stroke-width="1.4" stroke-dasharray="3 2"/>';
      }
      return out + '</svg>';
    }

    // ── 顶部卡片：下单/回输 总计 + 各自占全盘贡献占比（4 张，YTD） ──
    function renderCards(y, m) {
      var el = document.getElementById('coeCards');
      if (!el) return;
      var t = catTotals(y, m);
      function kpi(label, val, cls) {
        return '<div class="p4-kpi"><span>' + label + '</span><p class="' + cls + '">' + val + '</p></div>';
      }
      el.innerHTML =
        kpi('下单总计', t.o, 'coe-o') +
        kpi('回输总计', t.r, 'coe-r') +
        kpi('下单贡献占比', pct2(t.o, t.allO), 'coe-o') +
        kpi('回输贡献占比', pct2(t.r, t.allR), 'coe-r');
    }

    // ── AI 总结（构建时快照，不随年月变化） ──
    function renderAI() {
      var el = document.getElementById('coeAI');
      if (!el) return;
      var s = PAGE.summary || '';
      var at = C.at ? ('截至 ' + C.at + '（当年 1–' + parseInt(C.at.slice(5, 7), 10) + ' 月累计）') : '';
      el.innerHTML = '<div class="coe-ai-hd"><span class="coe-ai-tag">AI 总结</span>' +
        (at ? '<span class="coe-ai-time">' + at + '</span>' : '') + '</div>' +
        '<div class="coe-ai-txt' + (s ? '' : ' coe-ai-empty') + '">' + (s ? esc(s) : '暂无总结（构建时未生成）') + '</div>';
    }

    // ── 搜索栏：AM / 城市 / 医院名称 模糊搜索 ──
    var flt = { am: '', city: '', hosp: '' };
    function hit(v, q) { return !q || String(v || '').toLowerCase().indexOf(q) >= 0; }
    function renderSearch() {
      var el = document.getElementById('coeSearch');
      if (!el) return;
      el.innerHTML = '<span class="coe-lab">AM</span><input type="text" id="coeFAm" class="coe-inp" placeholder="模糊搜索" autocomplete="off">' +
        '<span class="coe-lab">城市</span><input type="text" id="coeFCity" class="coe-inp" placeholder="模糊搜索" autocomplete="off">' +
        '<span class="coe-lab">医院名称</span><input type="text" id="coeFHosp" class="coe-inp coe-inp-wide" placeholder="模糊搜索" autocomplete="off">' +
        '<button type="button" class="cart-btn ghost" id="coeClear">清空</button>';
      var map = { coeFAm: 'am', coeFCity: 'city', coeFHosp: 'hosp' };
      Object.keys(map).forEach(function (id) {
        $('#' + id).on('input', function () {
          flt[map[id]] = String(this.value || '').trim().toLowerCase();
          renderTable(curY(), curM());
        });
      });
      $('#coeClear').on('click', function () {
        flt.am = flt.city = flt.hosp = '';
        ['coeFAm', 'coeFCity', 'coeFHosp'].forEach(function (id) { $('#' + id).val(''); });
        renderTable(curY(), curM());
      });
    }

    // ── 明细表 ──
    function renderTable(y, m) {
      var ly = String(parseInt(y, 10) - 1);
      var total = PAGE.hospitals.length;
      var rows = PAGE.hospitals.filter(function (h) {
        return hit(h.am, flt.am) && hit(h.city, flt.city) && hit(h.hosp, flt.hosp);
      }).map(function (h) {
        var cur = h.years[y] || {}, last = h.years[ly] || {};
        var o = cur.o || [], r = cur.r || [];
        return {
          am: h.am, prov: h.prov, city: h.city, hosp: h.hosp,
          o: o, r: r,
          ytdO: ytd(o, m), ytdR: ytd(r, m),
          lyO: ytd(last.o, m), lyR: ytd(last.r, m)
        };
      }).sort(function (a, b) { return b.ytdO - a.ytdO || b.ytdR - a.ytdR; });

      var h = '<table class="pt coe-tbl"><colgroup>' +
        '<col style="width:72px"><col style="width:84px"><col style="width:84px"><col style="width:210px">' +
        '<col style="width:58px"><col style="width:54px">' +
        '<col span="12" style="width:44px">' +
        '<col style="width:96px"><col style="width:66px">' +
        '</colgroup><thead><tr>' +
        '<th>AM</th><th>省份</th><th>城市</th><th>医院名称</th><th>分类</th><th class="pt-ytd">YTD</th>';
      for (var i = 1; i <= 12; i++) h += '<th>' + i + '月</th>';
      h += '<th>趋势图</th><th>同比%</th></tr></thead><tbody>';

      if (!rows.length) {
        h += '<tr><td colspan="20" class="coe-empty">' + (total ? '无符合筛选条件的医院' : '该分类下暂无医院') + '</td></tr>';
      }
      rows.forEach(function (x) {
        ['o', 'r'].forEach(function (fld, k) {
          var isO = fld === 'o';
          var arr = isO ? x.o : x.r;
          var ytdV = isO ? x.ytdO : x.ytdR;
          var lyV = isO ? x.lyO : x.lyR;
          h += '<tr' + (k === 0 ? ' class="coe-first"' : '') + '>';
          if (k === 0) {
            h += '<td rowspan="2">' + esc(x.am || '--') + '</td>' +
              '<td rowspan="2">' + esc(x.prov || '--') + '</td>' +
              '<td rowspan="2">' + esc(x.city || '--') + '</td>' +
              '<td rowspan="2" class="pt-lbl">' + esc(x.hosp) + '</td>';
          }
          h += '<td class="coe-fld">' + (isO ? '下单' : '回输') + '</td>' +
            '<td class="pt-ytd">' + (ytdV > 0 ? ytdV : '') + '</td>';
          for (var i = 1; i <= 12; i++) {
            h += '<td>' + (i <= m && arr[i - 1] ? arr[i - 1] : '') + '</td>';
          }
          h += '<td>' + spark(arr, m, 90, 24) + '</td>' +
            '<td>' + yoyStr(ytdV, lyV) + '</td></tr>';
        });
      });
      h += '</tbody></table>';
      document.getElementById('coeTbl').innerHTML = h;
      var cnt = document.getElementById('coeCnt');
      if (cnt) cnt.innerHTML = '共 <b>' + rows.length + '</b> 家医院' +
        (rows.length < total ? '（已筛选，全部 ' + total + ' 家）' : '') +
        ' · ' + y + ' 年 1–' + m + ' 月累计';
    }

    function render() {
      var y = curY(), m = curM();
      if (!y) return;
      renderCards(y, m);
      renderTable(y, m);
    }

    initPtTime('#coeY', '#coeM', yearKeys, render);
    renderAI();
    renderSearch();
    render();
  });
})();
