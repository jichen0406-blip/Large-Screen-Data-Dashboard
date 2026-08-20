// fs.js — 全屏弹窗公共脚本（§9 标准）：容器移入全屏层 + resize，图表等比缩放 + 字号放大
// 所有页面统一引用。isChart 表（index 图表 id）与 fsExtra(data-fs2) 仅部分页面使用，无则走普通 resize；
// page2 表格展开行钩子（window.p2SetTblRows）仅在 page2 存在时生效。
$(function () {
    var fsEl = null, fsExtra = null;
    function resizeChart(el) {
        var ch = echarts.getInstanceByDom(el);
        if (ch) { ch.resize(); return; }
        $(el).find('div').each(function () { var c = echarts.getInstanceByDom(this); if (c) c.resize(); });
    }
    function collectCharts(el) {
        var ch = echarts.getInstanceByDom(el);
        if (ch) return [ch];
        var arr = [];
        $(el).find('div').each(function () { var c = echarts.getInstanceByDom(this); if (c) arr.push(c); });
        return arr;
    }
    function scaleChartFonts(chart, sc) {
        var opt = chart.getOption();
        (function walk(o) {
            if (!o || typeof o !== 'object') return;
            if (typeof o.fontSize === 'number' || typeof o.fontSize === 'string') { var fn = parseFloat(o.fontSize); if (!isNaN(fn)) o.fontSize = Math.max(6, Math.round(fn * sc)); }
            if (typeof o.itemWidth === 'number') o.itemWidth = Math.max(6, Math.round(o.itemWidth * sc));
            if (typeof o.itemHeight === 'number') o.itemHeight = Math.max(6, Math.round(o.itemHeight * sc));
            if (typeof o.symbolSize === 'number') o.symbolSize = Math.round(o.symbolSize * sc);
            if (typeof o.distance === 'number') o.distance = Math.round(o.distance * sc);
            Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') walk(o[k]); });
        })(opt);
        chart.setOption(opt);
    }
    function closeFs() {
        if (fsEl) {
            var _el = fsEl;
            var _snap = fsEl._snap;
            $(fsEl).appendTo(fsEl._fsHome);
            $(fsEl).css({ width: '', height: '', transform: '', transformOrigin: '', position: '', left: '', top: '', marginLeft: '', marginTop: '' });
            if (_snap) { var _charts = collectCharts(fsEl); _charts.forEach(function (ch, i) { if (_snap[i]) ch.setOption(_snap[i]); }); }
            delete fsEl._fsHome;
            delete fsEl._snap;
            if (window.p2SetTblRows) window.p2SetTblRows(10);
            setTimeout(function () { resizeChart(_el); }, 50);
            fsEl = null;
        }
        if (fsExtra) { $(fsExtra).appendTo(fsExtra._fsHome); delete fsExtra._fsHome; fsExtra = null; }
        $('#fsMask').hide();
        $(document).trigger('boardfs', { active: false });
    }
    $('.map-fs').on('click', function () {
        var el = document.getElementById($(this).data('fs'));
        if (!el || fsEl) return;
        var fid = $(this).data('fs');
        if (window.p2SetTblRows && el.querySelector('tbody')) window.p2SetTblRows(30);
        var isChart = (fid === 'echart6' || fid === 'echart4' || fid === 'abnBox' || fid === 'coeBox');
        fsEl = el;
        el._fsHome = el.parentNode;
        var exId = $(this).data('fs2');
        if (exId) {
            var ex = document.getElementById(exId);
            if (ex) { fsExtra = ex; ex._fsHome = ex.parentNode; $(ex).appendTo('#fsBody'); }
        }
        $('#fsTitle').text($(this).data('title'));
        if (isChart) { el._ow = el.offsetWidth; el._oh = el.offsetHeight; }
        $(el).appendTo('#fsBody');
        $('#fsMask').show();
        $(document).trigger('boardfs', { active: true });
        if (isChart) {
            var ow = el._ow, oh = el._oh;
            setTimeout(function () {
                var fsW = $('#fsBody').width(), fsH = $('#fsBody').height();
                var sc = Math.min(fsW / ow, fsH / oh) * 0.92;
                $(el).css({ width: (ow * sc) + 'px', height: (oh * sc) + 'px', position: 'absolute', left: '50%', top: '50%', marginLeft: (-ow * sc / 2) + 'px', marginTop: (-oh * sc / 2) + 'px' });
                var _charts = collectCharts(el);
                el._snap = _charts.map(function (ch) { return JSON.parse(JSON.stringify(ch.getOption())); });
                _charts.forEach(function (ch) { ch.resize(); scaleChartFonts(ch, sc); });
            }, 50);
        } else {
            setTimeout(function () { resizeChart(el); }, 50);
        }
    });
    $('#fsClose').on('click', closeFs);
    $('#fsMask').on('click', function (e) { if (e.target === this) closeFs(); });
    $(document).on('keydown', function (e) { if (e.key === 'Escape') closeFs(); });
});
