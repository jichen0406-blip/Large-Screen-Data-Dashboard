// excel_export.js — 全站表格导出 Excel 公共模块（项目标准见 项目文档 §14）
// 依赖 jQuery；SheetJS 在首次点击导出时懒加载 js/xlsx.full.min.js（不逐页静态引入）
// 口径：一律从 DOM 抓取当前渲染结果，因此「导出 = 当前筛选后」，不改各页取数逻辑
(function () {
    'use strict';

    var XLSX_SRC = 'js/xlsx.full.min.js';
    var loading = false, queue = [];
    var custom = {};   // 容器 id → 自定义导出函数（见 register）

    // ── SheetJS 懒加载：并发安全、失败可重试 ──
    function loadXLSX(ok, fail) {
        if (window.XLSX) { ok(); return; }
        queue.push({ ok: ok, fail: fail });
        if (loading) return;
        loading = true;
        var s = document.createElement('script');
        s.src = XLSX_SRC;
        s.onload = function () {
            loading = false;
            var q = queue; queue = [];
            q.forEach(function (f) { window.XLSX ? f.ok() : f.fail(); });
        };
        s.onerror = function () {          // 复位标志，允许下次点击重试
            loading = false;
            var q = queue; queue = [];
            q.forEach(function (f) { f.fail(); });
        };
        document.head.appendChild(s);
    }

    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    // 北京时间当天（UTC+8），与 abn_common.js 的取法一致
    function todayStr() {
        var d = new Date(Date.now() + 8 * 3600000);
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }
    function clean(s) {
        return String(s == null ? '' : s).replace(/[\\\/:*?"<>|·]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function pageName() {
        var t = String(document.title || '').split('·');
        return clean(t[t.length - 1]).slice(0, 40) || '看板';
    }

    // ── 单元格 → 纯文本 ──
    // SVG 趋势图 / 图片 / canvas 无文本可导，先剔除；select 取选中项文本、input 取 value（后台管理页）
    function cellText(td) {
        var t = td.querySelector('[data-xls-text]');       // 指定导出文本（如后台页的勾选用户清单）
        if (t) return (t.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        var box = td.cloneNode(true);
        var junk = box.querySelectorAll('svg, canvas, img, [data-xls-ignore]');
        for (var i = junk.length - 1; i >= 0; i--) junk[i].parentNode.removeChild(junk[i]);
        var sels = box.querySelectorAll('select');
        for (var j = sels.length - 1; j >= 0; j--) {
            var o = sels[j].options[sels[j].selectedIndex];
            sels[j].parentNode.replaceChild(document.createTextNode(o ? o.textContent : ''), sels[j]);
        }
        var inps = box.querySelectorAll('input');
        for (var k = inps.length - 1; k >= 0; k--) {
            inps[k].parentNode.replaceChild(document.createTextNode(inps[k].value || ''), inps[k]);
        }
        return (box.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function rowSig(tr) { return (tr.textContent || '').replace(/\s+/g, ''); }

    // ── 列宽：全角按 2 字符宽估算，夹在 8~46 ──
    function autoCols(aoa) {
        var w = [];
        aoa.forEach(function (row) {
            row.forEach(function (v, i) {
                var len = String(v == null ? '' : v).replace(/[^\x00-\xff]/g, '00').length;
                w[i] = Math.min(46, Math.max(w[i] || 8, len + 2));
            });
        });
        return w.map(function (x) { return { wch: x }; });
    }

    // ── DOM 表 → AoA ──
    // rowspan/colspan 用 occ 逐格登记占用，跳过的行也登记，保证列不错位；
    // 锚点格写值、展开格留空并记 !merges → Excel 呈现与屏幕一致；fillDown:true 改为向下复制值
    function tableToAoa(table, opts) {
        opts = opts || {};
        var skipRowSel = opts.skipRow || '.p2-tbl-blank, [data-xls-skip]';
        var skipColCls = opts.skipColClass || 'pt-spark';
        var trs = Array.prototype.slice.call(table.querySelectorAll('tr'));

        // 无缝滚动会把 tbody 行复制一份（index、page2）：两页都在 tbody 上打了 `_dup` 标记，
        // 有标记就取前半——进全屏时页面会自己去重、退出再复制，所以必须按当前状态判断。
        // 无标记时退回文本签名兜底，但要求行数 ≥6，避免只有两三行的表被误判成重复
        (function () {
            var tb = table.querySelector('tbody');
            if (!tb) return;
            var rows = Array.prototype.slice.call(tb.children), half = -1;
            if (tb._dup && rows.length >= 2) {
                half = Math.floor(rows.length / 2);
            } else if (rows.length >= 6 && rows.length % 2 === 0) {
                var h = rows.length / 2, same = true;
                for (var i = 0; i < h; i++) if (rowSig(rows[i]) !== rowSig(rows[i + h])) { same = false; break; }
                if (same) half = h;
            }
            if (half < 0) return;
            var keepTr = rows.slice(0, half);
            trs = trs.filter(function (t) { return rows.indexOf(t) < 0 || keepTr.indexOf(t) >= 0; });
        })();

        var occ = {}, out = [], merges = [], maxCol = 0;
        for (var ri = 0; ri < trs.length; ri++) {
            var tr = trs[ri];
            var skip = tr.matches(skipRowSel);
            var row = [], c = 0, cells = tr.children;
            for (var ci = 0; ci < cells.length; ci++) {
                var td = cells[ci];
                var cs = Math.max(1, parseInt(td.getAttribute('colspan') || '1', 10) || 1);
                var rs = Math.max(1, parseInt(td.getAttribute('rowspan') || '1', 10) || 1);
                while (occ[ri + '|' + c]) c++;                       // 让开上方 rowspan 占用的列
                for (var dr = 0; dr < rs; dr++) for (var dc = 0; dc < cs; dc++)
                    if (dr || dc) occ[(ri + dr) + '|' + (c + dc)] = true;
                if (skip) { c += cs; continue; }
                var isJunk = td.classList.contains(skipColCls) || td.hasAttribute('data-xls-skip');
                row[c] = isJunk ? '' : cellText(td);
                for (var e = 1; e < cs; e++) row[c + e] = '';
                if (rs > 1 || cs > 1)
                    merges.push({ s: { r: out.length, c: c }, e: { r: out.length + rs - 1, c: c + cs - 1 } });
                c += cs;
            }
            if (skip) continue;
            for (var z = 0; z < row.length; z++) if (row[z] === undefined) row[z] = '';
            maxCol = Math.max(maxCol, row.length);
            out.push(row);
        }
        if (!out.length) return { aoa: [], merges: [], cols: [] };
        for (var r0 = 0; r0 < out.length; r0++)
            for (var z0 = 0; z0 < maxCol; z0++) if (out[r0][z0] === undefined) out[r0][z0] = '';

        if (opts.fillDown) {
            merges.forEach(function (m) {
                if (m.e.c !== m.s.c) return;
                for (var r1 = m.s.r + 1; r1 <= m.e.r && r1 < out.length; r1++)
                    out[r1][m.s.c] = out[m.s.r][m.s.c];
            });
            merges = [];
        }

        // 剔除全空列（colspan 展开出的多余空列，以及被 data-xls-skip 标空的整列——
        // 如趋势图列：表头也标了 data-xls-skip 才会被整列剔除，避免误删"表头有字、当期无数据"的月份列）
        if (opts.dropEmptyCols !== false) {
            var map = [], keep = [];
            for (var c2 = 0; c2 < maxCol; c2++) {
                var has = false;
                for (var r2 = 0; r2 < out.length; r2++) if (String(out[r2][c2] || '') !== '') { has = true; break; }
                map[c2] = has ? keep.length : -1;
                if (has) keep.push(c2);
            }
            if (keep.length && keep.length < maxCol) {
                out = out.map(function (r) { return keep.map(function (kk) { return r[kk]; }); });
                merges = merges
                    .map(function (m) { return { s: { r: m.s.r, c: map[m.s.c] }, e: { r: m.e.r, c: map[m.e.c] } }; })
                    .filter(function (m) { return m.s.c >= 0 && m.e.c >= 0; });
            }
        }
        return { aoa: out, merges: merges, cols: autoCols(out) };
    }

    // ── 写文件（所有导出都走这里，统一列宽与命名） ──
    function exportAoa(aoa, baseName, opts) {
        opts = opts || {};
        if (!aoa || !aoa.length) { alert('当前无可导出的记录。'); return; }
        var nm = clean(baseName).slice(0, 60) || '导出';
        loadXLSX(function () {
            var ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = opts.cols || autoCols(aoa);
            if (opts.merges && opts.merges.length) ws['!merges'] = opts.merges;
            var wb = XLSX.utils.book_new();
            var sheet = (clean(opts.sheet || baseName).slice(0, 31) || 'Sheet1');
            XLSX.utils.book_append_sheet(wb, ws, sheet);
            XLSX.writeFile(wb, nm + '_' + todayStr() + '.xlsx');
        }, function () {
            alert('导出库加载失败：' + XLSX_SRC + '，请确认文件存在。');
        });
    }

    // ── 表名：按钮 data-xls-title > 按钮最近的 .sec-head > 容器前一个 .sec-head ──
    function headText(el) {
        if (!el) return '';
        var clone = el.cloneNode(true);
        var junk = clone.querySelectorAll('button, .map-fs, span.sub, span.line, [data-xls-btn]');
        for (var i = junk.length - 1; i >= 0; i--) junk[i].parentNode.removeChild(junk[i]);
        return clean(clone.textContent);
    }
    function titleFor(btn, host) {
        var t = btn ? (btn.getAttribute('data-xls-title') || '') : '';
        if (t) return clean(t);
        if (btn && btn.closest) t = headText(btn.closest('.sec-head'));
        if (t) return t;
        var p = host && host.previousElementSibling;
        if (p && p.classList && p.classList.contains('sec-head')) return headText(p);
        return '';
    }

    function exportTable(hostOrId, opts) {
        opts = opts || {};
        var host = (typeof hostOrId === 'string') ? document.getElementById(hostOrId) : hostOrId;
        if (!host) { alert('导出目标不存在。'); return; }
        var table = host.tagName === 'TABLE' ? host : host.querySelector('table');
        if (!table) { alert('该区块暂无表格可导出。'); return; }
        var r = tableToAoa(table, opts);
        if (!r.aoa.length) { alert('当前无可导出的记录。'); return; }
        var tn = clean(opts.title || '');
        var base = tn ? (pageName() + '_' + tn) : pageName();
        if (pageName() === tn) base = tn;                       // 页面名与表名相同时不重复
        exportAoa(r.aoa, base, { cols: r.cols, merges: opts.fillDown ? [] : r.merges, sheet: tn || pageName() });
    }

    // ── 自定义导出（不按 DOM 抓取的表格，如异常订单三页有列定义单一来源） ──
    // 注册方式二选一：① 本模块已加载时 BoardXLS.register(id, fn)；
    //   ② 页面脚本在本模块之前加载时，写 window.BOARD_XLS_CUSTOM[id] = fn，模块加载时合并
    function register(id, fn) { custom[id] = fn; }
    (function () {
        var ext = window.BOARD_XLS_CUSTOM || {};
        Object.keys(ext).forEach(function (k) { custom[k] = ext[k]; });
    })();

    // ── 按钮注入（幂等，可重复调用） ──
    // 下载图标（与导航栏图标同风格的内联 SVG），不写文字，保持低调
    var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
    function makeBtn(id, title) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'xls-btn';
        b.setAttribute('data-xls-btn', id);
        b.setAttribute('aria-label', '导出 Excel');
        if (title) b.setAttribute('data-xls-title', title);
        b.title = '导出 Excel';
        b.innerHTML = ICON;
        return b;
    }
    // 插在 ⛶ 左侧：靠 CSS（.xls-btn 带 margin-left:auto）把它和 ⛶ 一起推到右端并紧邻
    function insertBtn(h, btn) {
        h.insertBefore(btn, h.querySelector('.map-fs') || null);
    }
    // 从 .pt-tbl-wrap 往上找所属 .sec-head：允许中间夹筛选控件/汇总条，但若先遇到另一个
    // 表格容器块则判为歧义、放弃（宁可不挂，也不挂错标题）
    function findHead(w) {
        var p = w.previousElementSibling;
        while (p) {
            if (p.classList) {
                if (p.classList.contains('pt-tbl-wrap') || p.classList.contains('p2-tbl-wrap')) return null;
                if (p.classList.contains('sec-head')) return p;
            }
            p = p.previousElementSibling;
        }
        return null;
    }
    function mount() {
        // ① 自动配对：.pt-tbl-wrap[id] 向上找到所属 .sec-head
        Array.prototype.slice.call(document.querySelectorAll('.pt-tbl-wrap[id]')).forEach(function (w) {
            if (w.hasAttribute('data-xls-skip')) return;      // 容器内无 <table> 的区块显式豁免
            var h = findHead(w);
            if (!h) return;
            if (h.querySelector('[data-xls-btn]')) return;
            insertBtn(h, makeBtn(w.id, h.getAttribute('data-xls-title') || ''));
        });
        // ② 显式声明：[data-xls="容器id"]
        Array.prototype.slice.call(document.querySelectorAll('[data-xls]')).forEach(function (h) {
            var id = h.getAttribute('data-xls');
            if (!id || !document.getElementById(id)) return;
            if (h.querySelector('[data-xls-btn="' + id + '"]')) return;
            insertBtn(h, makeBtn(id, h.getAttribute('data-xls-title') || ''));
        });
    }

    // 委托：重渲染冲掉按钮再重建也自动生效，无需重绑
    $(document).on('click', '[data-xls-btn]', function () {
        var btn = this;
        var id = btn.getAttribute('data-xls-btn');
        if (custom[id]) { custom[id].call(btn, btn); return; }
        exportTable(id, { title: btn.getAttribute('data-xls-title') || '' });
    });
    $(function () { mount(); });

    window.BoardXLS = {
        exportTable: exportTable, exportAoa: exportAoa, tableToAoa: tableToAoa,
        register: register, mount: mount, loadXLSX: loadXLSX,
        todayStr: todayStr, pageName: pageName, clean: clean
    };
})();
