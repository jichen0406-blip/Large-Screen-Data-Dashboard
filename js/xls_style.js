// xls_style.js — 导出 Excel 的样式映射（项目标准见 项目文档 §14.11）
// 三套商务配色：navy 商务海军蓝 / graphite 石墨灰 / teal 深青商务（2026-11-20 替换旧的「白底 / 深色」两套）
// 用法：XLS_STYLE.style('navy', ['ytd']) → ExcelJS 的 cell.style 对象（内部按 token 缓存）
window.XLS_STYLE = (function () {
    var FONT = '微软雅黑', SIZE = 10;

    var THEMES = {
        // A. 商务海军蓝：深藏青表头 + 灰蓝斑马纹 + Excel 标准语义色
        navy: {
            body:    { fill: 'FFFFFFFF', font: 'FF1F2937' },
            zebra:   { fill: 'FFF6F8FB' },
            header:  { fill: 'FF1F3864', font: 'FFFFFFFF', bold: true, center: true },
            ytd:     { fill: 'FFE8F1F8', font: 'FF1F4E79', bold: true },
            cur:     { fill: 'FFEAF3FA' },
            off:     { font: 'FF9AA5B1' },
            grp:     { fill: 'FFEDF2F7', font: 'FF1F3864', bold: true },
            grpagg:  { fill: 'FFD9E6F2', font: 'FF1F3864', bold: true },
            total:   { fill: 'FFE8F1F8', font: 'FF1F4E79', bold: true },
            yu:      { font: 'FF217346', bold: true },
            yd:      { font: 'FFC55A11', bold: true },
            ny:      { font: 'FF9AA5B1' },
            pred:    { font: 'FFC00000', bold: true },
            pyellow: { font: 'FFC55A11', bold: true },
            pgreen:  { font: 'FF217346', bold: true },
            sev:     ['FF217346', 'FF0F7B8A', 'FFB26A00', 'FFC55A11', 'FFB23A00', 'FFC00000'],
            stfull:  { fill: 'FFE6F4F1', font: 'FF0F5C4E', bold: true },
            stcryo:  { fill: 'FFEFE8F7', font: 'FF5B3E96', bold: true },
            dur:     { font: 'FFB26A00', bold: true },
            blank:   { font: 'FFB0B7C3' },
            risk:    ['FFC00000', 'FFC55A11', 'FF217346'],
            border:  'FFDCE3EA'
        },
        // B. 石墨灰：最克制的咨询风，黑白打印最干净
        graphite: {
            body:    { fill: 'FFFFFFFF', font: 'FF1F2937' },
            zebra:   { fill: 'FFF5F5F5' },
            header:  { fill: 'FF37474F', font: 'FFFFFFFF', bold: true, center: true },
            ytd:     { fill: 'FFECEFF1', font: 'FF263238', bold: true },
            cur:     { fill: 'FFEEF2F4' },
            off:     { font: 'FF9AA5B1' },
            grp:     { fill: 'FFECEFF1', font: 'FF263238', bold: true },
            grpagg:  { fill: 'FFDDE3E6', font: 'FF22303A', bold: true },
            total:   { fill: 'FFECEFF1', font: 'FF263238', bold: true },
            yu:      { font: 'FF1B5E20', bold: true },
            yd:      { font: 'FFE65100', bold: true },
            ny:      { font: 'FF9AA5B1' },
            pred:    { font: 'FFB71C1C', bold: true },
            pyellow: { font: 'FFE65100', bold: true },
            pgreen:  { font: 'FF1B5E20', bold: true },
            sev:     ['FF1B5E20', 'FF00695C', 'FFB26A00', 'FFE65100', 'FFBF360C', 'FFB71C1C'],
            stfull:  { fill: 'FFE7F1F1', font: 'FF0F4C4C', bold: true },
            stcryo:  { fill: 'FFEFE7F3', font: 'FF5E3A80', bold: true },
            dur:     { font: 'FFB26A00', bold: true },
            blank:   { font: 'FFB0B7C3' },
            risk:    ['FFB71C1C', 'FFE65100', 'FF1B5E20'],
            border:  'FFE0E0E0'
        },
        // C. 深青商务：与看板主色同色系，但更稳
        teal: {
            body:    { fill: 'FFFFFFFF', font: 'FF1F2937' },
            zebra:   { fill: 'FFF3F8FA' },
            header:  { fill: 'FF0B4F6C', font: 'FFFFFFFF', bold: true, center: true },
            ytd:     { fill: 'FFE0F0F5', font: 'FF0B4F6C', bold: true },
            cur:     { fill: 'FFE6F4F8' },
            off:     { font: 'FF9AA5B1' },
            grp:     { fill: 'FFE3EFF4', font: 'FF0B4F6C', bold: true },
            grpagg:  { fill: 'FFCFE6EF', font: 'FF083D54', bold: true },
            total:   { fill: 'FFE0F0F5', font: 'FF0B4F6C', bold: true },
            yu:      { font: 'FF2E7D32', bold: true },
            yd:      { font: 'FFB26A00', bold: true },
            ny:      { font: 'FF9AA5B1' },
            pred:    { font: 'FFC62828', bold: true },
            pyellow: { font: 'FFB26A00', bold: true },
            pgreen:  { font: 'FF2E7D32', bold: true },
            sev:     ['FF2E7D32', 'FF00695C', 'FFB26A00', 'FFC2571A', 'FFB23A00', 'FFC62828'],
            stfull:  { fill: 'FFE3F2F5', font: 'FF0B4F6C', bold: true },
            stcryo:  { fill: 'FFEDE7F6', font: 'FF5E35B1', bold: true },
            dur:     { font: 'FFB26A00', bold: true },
            blank:   { font: 'FFB0B7C3' },
            risk:    ['FFC62828', 'FFB26A00', 'FF2E7D32'],
            border:  'FFD6E3E9'
        }
    };

    var ALIAS = { light: 'navy', dark: 'graphite' };   // 兼容旧选择（localStorage 里可能残留 light/dark）
    var cache = {};

    function norm(name) {
        name = String(name || '').toLowerCase();
        if (THEMES[name]) return name;
        if (ALIAS[name]) return ALIAS[name];
        return 'navy';
    }
    function solid(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }

    function build(themeName, tokens) {
        var T = THEMES[norm(themeName)];
        var fill = T.body.fill, color = T.body.font, bold = false, center = false, wrap = false;

        (tokens || []).forEach(function (t) {
            if (t === 'zebra')       { fill = T.zebra.fill; }
            else if (t === 'th')     { fill = T.header.fill; color = T.header.font; bold = true; center = true; }
            else if (t === 'ytd')     { fill = T.ytd.fill; color = T.ytd.font; bold = true; }
            else if (t === 'cur')     { fill = T.cur.fill; }
            else if (t === 'off')     { color = T.off.font; }
            else if (t === 'grp')     { fill = T.grp.fill; color = T.grp.font; bold = true; }
            else if (t === 'grpagg')  { fill = T.grpagg.fill; color = T.grpagg.font; bold = true; }
            else if (t === 'total')   { fill = T.total.fill; color = T.total.font; bold = true; }
            else if (t === 'yu')      { color = T.yu.font; bold = true; }
            else if (t === 'yd')      { color = T.yd.font; bold = true; }
            else if (t === 'ny')      { color = T.ny.font; }
            else if (t === 'pred')    { color = T.pred.font; bold = true; }
            else if (t === 'pyellow') { color = T.pyellow.font; bold = true; }
            else if (t === 'pgreen')  { color = T.pgreen.font; bold = true; }
            else if (t === 'stfull')  { fill = T.stfull.fill; color = T.stfull.font; bold = true; }
            else if (t === 'stcryo')  { fill = T.stcryo.fill; color = T.stcryo.font; bold = true; }
            else if (t === 'dur')     { color = T.dur.font; bold = true; }
            else if (t === 'blank')   { color = T.blank.font; }
            else if (t === 'txt')     { wrap = true; center = false; }
            else if (/^sev[1-6]$/.test(t)) {
                color = T.sev[+t.slice(3) - 1]; bold = true;
            } else if (/^risk[0-2]$/.test(t)) {
                color = T.risk[+t.slice(4)]; bold = true;
            }
        });

        return {
            font: { name: FONT, size: SIZE, color: { argb: color }, bold: bold },
            fill: solid(fill),
            alignment: { vertical: 'middle', horizontal: center ? 'center' : 'left', wrapText: wrap },
            border: {
                top:    { style: 'thin', color: { argb: T.border } },
                left:   { style: 'thin', color: { argb: T.border } },
                bottom: { style: 'thin', color: { argb: T.border } },
                right:  { style: 'thin', color: { argb: T.border } }
            }
        };
    }

    function style(themeName, tokens) {
        var t = norm(themeName);
        var key = t + '|' + (tokens && tokens.length ? tokens.slice().sort().join(',') : '-');
        if (!cache[key]) cache[key] = build(t, tokens);
        return cache[key];
    }

    return {
        style: style,
        themes: THEMES,
        names: ['navy', 'graphite', 'teal'],
        norm: norm,
        palette: function (n) { return THEMES[norm(n)]; }
    };
})();
