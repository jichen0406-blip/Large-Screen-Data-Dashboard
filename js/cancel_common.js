// cancel_common.js — 取消订单管理（3 页共用，按 window.PAGE_KEY 分支）
//   cancel_ytd  YTD取消订单管理（年月筛选）：卡片 + 每月按阶段堆积柱 + by AM 堆积柱（右侧标注）
//   cancel_all  全量取消订单管理（无时间控制）：卡片 + 按年柱 + 阶段饼 + AM 饼
//   cancel_hosp 医院取消订单管理：AI 总结 + 模糊搜索 + 明细表
// 数据：BOARD_DATA.CANCEL_MGMT（取消单的取消月/阶段/AM/医院 + 分母 totals）
(function () {
  $(function () {
    var B = window.BOARD_DATA;
    if (!B || !B.CANCEL_MGMT) return;
    var C = B.CANCEL_MGMT;
    var ST = C.stages;                       // 5 个阶段（顺序与全流程页一致）
    // 阶段配色：统一色板前 5 位（js/palette.js），前两阶段为无成本
    var SCOLOR = {};
    for (var si = 0; si < ST.length; si++) SCOLOR[ST[si]] = boardColor(si);
    var NOCOST = [ST[0], ST[1]];
    var NOCOST_TIP = '无成本取消 = 单采预约前 + 单采前（这 2 个阶段尚未单采，不产生 COGS）';
    // 统一色系：沿用「福可苏业绩总览」COE 销量占比的色板（饼图/柱状图共用）
    var PALETTE = window.BOARD_PALETTE || ['#62c98d', '#4cb9cf', '#2f89cf', '#6f7fd6', '#e0c828'];
    var TIP_TEXT = '注：<b>无成本取消</b> = 单采预约前取消 + 单采前取消（这 2 个阶段尚未单采，<b>不产生 COGS</b>）；<b>生产完成取消</b> = 生产完成取消回输（已产生全量生产成本的取消）。';

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function pct(a, t) { return t > 0 ? (a / t * 100).toFixed(1) + '%' : '--'; }
    function cntStage(cs, s) { return cs.filter(function (c) { return c.stage === s; }).length; }
    var C_YEARS = (function () { var ys = {}; C.cancels.forEach(function (c) { if (c.cm) ys[c.cm.slice(0, 4)] = true; }); return Object.keys(ys).sort(); })();

    function kpi(label, val, sub) {
      return '<div class="p4-kpi"><span>' + label + '</span><p>' + val + '</p>' +
        (sub ? '<i class="cancel-sub">' + sub + '</i>' : '') + '</div>';
    }
    // 纵轴上限：柱顶带标签，最大值要留白（否则顶格裁切标签）
    function niceMax(m) {
      if (!(m > 0)) return 1;
      var step = Math.pow(10, Math.floor(Math.log(m) / Math.LN10));
      var cands = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
      for (var i = 0; i < cands.length; i++) { var v = cands[i] * step; if (v >= m * 1.15) return v; }
      return 10 * step;
    }

    // ══════════ 页面1：YTD取消订单管理 ══════════
    function pageYtd() {
      var selY = C_YEARS[C_YEARS.length - 1] || '', selM = 12;
      (function initSel() {
        $('#cyY').html(C_YEARS.map(function (y) { return '<option value="' + y + '">' + y + '年</option>'; }).join(''));
        var mh = ''; for (var i = 1; i <= 12; i++) mh += '<option value="' + i + '">' + i + '月</option>';
        $('#cyM').html(mh);
        var at = (C.at || '').slice(0, 4);
        if (at && C_YEARS.indexOf(at) >= 0) selY = at;
        selM = parseInt((C.at || '').slice(5, 7), 10) || 12;
        $('#cyY').val(selY); $('#cyM').val(selM);
      })();
      var ch1 = null, ch2 = null;

      function ytdCancels() {
        var y = String($('#cyY').val()), m = parseInt($('#cyM').val(), 10);
        return C.cancels.filter(function (c) {
          return c.cm.slice(0, 4) === y && parseInt(c.cm.slice(5, 7), 10) <= m;
        });
      }
      function render() {
        var y = String($('#cyY').val()), m = parseInt($('#cyM').val(), 10);
        var cs = ytdCancels();
        var denom = (C.totals.byYear || {})[y] || 0;
        var noCost = cs.filter(function (c) { return NOCOST.indexOf(c.stage) >= 0; }).length;
        var fin = cntStage(cs, ST[4]);
        document.getElementById('cyCards').innerHTML =
          kpi('YTD取消订单', cs.length, '当年下单总数 ' + denom + ' 单') +
          kpi('占当年下单比例', pct(cs.length, denom), '分母：该年下单订单数') +
          kpi('无成本取消比例', pct(noCost, denom), noCost + ' 单') +
          kpi('生产完成取消比例', pct(fin, denom), fin + ' 单');
        document.getElementById('cyTip').innerHTML = TIP_TEXT;

        // 图1：每月（取消月）按阶段堆积，柱顶显示当月总数
        var months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        var byM = [];
        for (var i = 1; i <= 12; i++) {
          var d = cs.filter(function (c) { return parseInt(c.cm.slice(5, 7), 10) === i; });
          byM.push(d);
        }
        var e1 = document.getElementById('cyChart1');
        if (ch1) ch1.dispose();
        ch1 = echarts.init(e1);
        var series1 = ST.map(function (s) {
          return {
            name: s, type: 'bar', stack: 'c', barWidth: '52%',
            itemStyle: { color: SCOLOR[s] },
            data: byM.map(function (d) { return cntStage(d, s); })
          };
        });
        // 柱顶显示当月总数（挂在堆叠最上层那段）
        series1[series1.length - 1].label = {
          show: true, position: 'top', color: '#daf9ff', fontSize: 11,
          formatter: function (p) { return byM[p.dataIndex].length || ''; }
        };
        ch1.setOption({
          backgroundColor: 'transparent',
          grid: { left: 40, right: 16, top: 28, bottom: 24 },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          legend: { top: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: '#9fe8ff', fontSize: 11 }, data: ST },
          xAxis: { type: 'category', data: months, axisLabel: { color: 'rgba(255,255,255,.55)', fontSize: 11 }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.2)' } } },
          yAxis: { type: 'value', minInterval: 1, max: niceMax(Math.max.apply(null, byM.map(function (d) { return d.length; }))), axisLabel: { color: 'rgba(255,255,255,.55)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
          series: series1
        });

        // 图2：by AM 纵向堆积 + 右侧标注
        var amAgg = {};
        cs.forEach(function (c) {
          var a = c.am || '未知';
          var o = amAgg[a] || (amAgg[a] = { n: 0, same: 0, no: 0, fin: 0, st: {} });
          o.n++; if (c.sameYear) o.same++;
          if (NOCOST.indexOf(c.stage) >= 0) o.no++;
          if (c.stage === ST[4]) o.fin++;
          o.st[c.stage] = (o.st[c.stage] || 0) + 1;
        });
        var ams = Object.keys(amAgg).sort(function (a, b) { return amAgg[b].n - amAgg[a].n; });
        var e2 = document.getElementById('cyChart2');
        if (ch2) ch2.dispose();
        ch2 = echarts.init(e2);
        ch2.setOption({
          backgroundColor: 'transparent',
          grid: { left: 40, right: 16, top: 24, bottom: 46 },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          xAxis: { type: 'category', data: ams, axisLabel: { color: 'rgba(255,255,255,.6)', fontSize: 11, interval: 0, rotate: 32 }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.2)' } } },
          yAxis: { type: 'value', minInterval: 1, max: niceMax(Math.max.apply(null, ams.map(function (a) { return amAgg[a].n; }))), axisLabel: { color: 'rgba(255,255,255,.55)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
          series: ST.map(function (s, k) {
            return {
              name: s, type: 'bar', stack: 'a', barWidth: '56%', itemStyle: { color: SCOLOR[s] },
              data: ams.map(function (a) { return amAgg[a].st[s] || 0; }),
              label: k === 0 ? { show: true, position: 'top', color: '#daf9ff', fontSize: 11, formatter: function (p) { return amAgg[ams[p.dataIndex]].n; } } : { show: false }
            };
          })
        });
        // 右侧标注：每个 AM 的取消比例（占该 AM 该年订单）+ 其中多少单为当年下单
        var amDenom = ((C.totals.byYearAm || {})[y]) || {};
        document.getElementById('cyAmNote').innerHTML =
          '<div class="cancel-note-hd">取消比例（占该 AM ' + y + ' 年订单）</div>' +
          ams.map(function (a) {
            var dn = amDenom[a] || 0, o = amAgg[a];
            return '<div class="cancel-note-row"><span class="cn-am">' + esc(a) + '</span>' +
              '<b>' + pct(o.n, dn) + '</b>' +
              '<i>无成本 ' + pct(o.no, dn) + ' · 生产完成 ' + pct(o.fin, dn) + ' · 其中当年下单 ' + o.same + ' 单</i></div>';
          }).join('');
      }

      $('#cyY,#cyM').on('change', render);
      render();
      window.addEventListener('resize', function () { ch1 && ch1.resize(); ch2 && ch2.resize(); });
    }

    // ══════════ 页面2：全量取消订单管理 ══════════
    function pageAll() {
      var cs = C.cancels, all = C.totals.all || 0;
      var noCost = cs.filter(function (c) { return NOCOST.indexOf(c.stage) >= 0; }).length;
      var fin = cntStage(cs, ST[4]);
      document.getElementById('caCards').innerHTML =
        kpi('取消订单总数', cs.length, '全部订单 ' + all + ' 单') +
        kpi('取消占比', pct(cs.length, all), '分母：全部订单') +
        kpi('无成本取消比例', pct(noCost, all), noCost + ' 单') +
        kpi('生产完成取消比例', pct(fin, all), fin + ' 单');
      document.getElementById('caTip').innerHTML = TIP_TEXT;

      var e1 = document.getElementById('caChart1'), e2 = document.getElementById('caChart2'), e3 = document.getElementById('caChart3');
      var c1 = echarts.init(e1), c2 = echarts.init(e2), c3 = echarts.init(e3);
      var yrs = C.years || [];
      var yrN = yrs.map(function (y) { return cs.filter(function (c) { return c.cm.slice(0, 4) === y; }).length; });
      c1.setOption({
        backgroundColor: 'transparent',
        grid: { left: 40, right: 16, top: 24, bottom: 24 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: yrs, axisLabel: { color: 'rgba(255,255,255,.6)' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.2)' } } },
        yAxis: { type: 'value', minInterval: 1, max: niceMax(Math.max.apply(null, yrN)), axisLabel: { color: 'rgba(255,255,255,.55)' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
        series: [{
          type: 'bar', barWidth: '46%', itemStyle: { color: PALETTE[1] },
          data: yrN,
          label: { show: true, position: 'top', color: '#daf9ff', fontSize: 11 }
        }]
      });
      function pie(el, list) {
        el.setOption({
          backgroundColor: 'transparent',
          tooltip: { trigger: 'item', formatter: '{b}: {c} 单 ({d}%)' },
          legend: { type: 'scroll', orient: 'horizontal', bottom: 0, left: 'center', itemWidth: 10, itemHeight: 8, textStyle: { color: '#9fe8ff', fontSize: 11 } },
          series: [{
            type: 'pie', radius: ['36%', '58%'], center: ['50%', '43%'],
            label: { show: true, color: '#daf9ff', fontSize: 11, formatter: '{d}%' },
            labelLine: { length: 6, length2: 6 },
            data: list
          }]
        });
      }
      pie(c2, ST.map(function (s) { return { name: s, value: cntStage(cs, s), itemStyle: { color: SCOLOR[s] } }; }));
      var amAgg = {};
      cs.forEach(function (c) { var a = c.am || '未知'; amAgg[a] = (amAgg[a] || 0) + 1; });
      pie(c3, Object.keys(amAgg).sort(function (a, b) { return amAgg[b] - amAgg[a]; })
        .map(function (a, i) { return { name: a, value: amAgg[a], itemStyle: { color: PALETTE[i % PALETTE.length] } }; }));
      window.addEventListener('resize', function () { c1.resize(); c2.resize(); c3.resize(); });
    }

    // ══════════ 页面3：医院取消订单管理 ══════════
    function pageHosp() {
      var flt = { am: '', prov: '', hosp: '' };
      function hit(v, q) { return !q || String(v || '').toLowerCase().indexOf(q) >= 0; }

      (function renderAI() {
        var el = document.getElementById('chAI');
        var s = C.summary || '';
        var at = C.at ? ('截至 ' + C.at + '（按取消月）') : '';
        el.innerHTML = '<div class="cancel-ai-hd"><span class="cancel-ai-tag">AI 总结</span>' +
          (at ? '<span class="cancel-ai-time">' + at + '</span>' : '') + '</div>' +
          '<div class="cancel-ai-txt' + (s ? '' : ' empty') + '">' + (s ? esc(s) : '暂无总结（构建时未生成）') + '</div>';
      })();

      (function renderSearch() {
        document.getElementById('chSearch').innerHTML =
          '<span class="cancel-lab">AM</span><input type="text" id="chFAm" class="cancel-inp" placeholder="模糊搜索" autocomplete="off">' +
          '<span class="cancel-lab">省份</span><input type="text" id="chFProv" class="cancel-inp" placeholder="模糊搜索" autocomplete="off">' +
          '<span class="cancel-lab">医院名称</span><input type="text" id="chFHosp" class="cancel-inp wide" placeholder="模糊搜索" autocomplete="off">' +
          '<button type="button" class="cart-btn ghost" id="chClear">清空</button>';
        var map = { chFAm: 'am', chFProv: 'prov', chFHosp: 'hosp' };
        Object.keys(map).forEach(function (id) {
          $('#' + id).on('input', function () { flt[map[id]] = String(this.value || '').trim().toLowerCase(); renderTable(); });
        });
        $('#chClear').on('click', function () {
          flt.am = flt.prov = flt.hosp = '';
          ['chFAm', 'chFProv', 'chFHosp'].forEach(function (id) { $('#' + id).val(''); });
          renderTable();
        });
      })();

      // 全国平均取消比例（全部取消单 ÷ 全部订单），用于表格标红阈值
      var natlRatio = C.totals.all > 0 ? C.cancels.length / C.totals.all : 0;

      function renderTable() {
        var agg = {};
        C.cancels.forEach(function (c) {
          if (!c.hosp) return;
          var k = c.prov + '|' + c.city + '|' + c.hosp;
          var o = agg[k] || (agg[k] = { am: c.am, prov: c.prov, city: c.city, hosp: c.hosp, n: 0, no: 0, fin: 0, yr: {} });
          o.n++;
          if (NOCOST.indexOf(c.stage) >= 0) o.no++;
          if (c.stage === ST[4]) o.fin++;
          if (c.cm) o.yr[c.cm.slice(0, 4)] = (o.yr[c.cm.slice(0, 4)] || 0) + 1;
        });
        var rows = Object.keys(agg).map(function (k) { var o = agg[k]; o.all = (C.totals.byHosp || {})[k] || 0; return o; })
          .filter(function (o) { return hit(o.am, flt.am) && hit(o.prov, flt.prov) && hit(o.hosp, flt.hosp); })
          .sort(function (a, b) { return b.n - a.n || b.all - a.all; });
        var yrs = C_YEARS.slice().reverse();
        var h = '<table class="pt cancel-tbl"><thead><tr><th>AM</th><th>省份</th><th>城市</th><th>医院</th><th class="pt-ytd">总计取消</th>' +
          yrs.map(function (y) { return '<th>' + y + '</th>'; }).join('') +
          '<th title="高于全国平均取消比例（' + pct(C.cancels.length, C.totals.all) + '）标红">取消比例</th><th title="' + NOCOST_TIP + '">无成本取消比例</th><th>生产完成取消比例</th></tr></thead><tbody>';
        if (!rows.length) h += '<tr><td colspan="' + (8 + yrs.length) + '" class="cancel-empty">无符合条件的医院</td></tr>';
        rows.forEach(function (o) {
          h += '<tr><td>' + esc(o.am || '--') + '</td><td>' + esc(o.prov || '--') + '</td><td>' + esc(o.city || '--') + '</td>' +
            '<td class="pt-lbl">' + esc(o.hosp) + '</td>' +
            '<td class="pt-ytd">' + o.n + '</td>' +
            yrs.map(function (y) { return '<td>' + (o.yr[y] || '') + '</td>'; }).join('') +
            '<td class="cancel-ratio' + (o.all > 0 && o.n > o.all * natlRatio ? ' over' : '') + '">' + pct(o.n, o.all) + '</td>' +
            '<td>' + pct(o.no, o.all) + '</td>' +
            '<td>' + pct(o.fin, o.all) + '</td></tr>';
        });
        h += '</tbody></table>';
        document.getElementById('chTbl').innerHTML = h;
        var t = C.cancels.filter(function (c) { return c.hosp; });
        var tot = Object.keys(agg).length;
        document.getElementById('chCnt').innerHTML = '共 <b>' + rows.length + '</b> 家医院' +
          (rows.length < tot ? '（已筛选，全部 ' + tot + ' 家）' : '') + ' · 取消单 ' + C.cancels.length + ' 单（分母：各医院自身总单量）';
      }
      renderTable();
    }

    var KEY = window.PAGE_KEY;
    if (KEY === 'cancel_ytd') pageYtd();
    else if (KEY === 'cancel_all') pageAll();
    else if (KEY === 'cancel_hosp') pageHosp();
  });
})();
