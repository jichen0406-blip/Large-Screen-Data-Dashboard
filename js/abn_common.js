// abn_common.js — 异常订单管理（3 页共用）：长期未单采订单 / 长期未转生产 / 长期未回输订单
// 由 window.PAGE_KEY 决定渲染哪一页；数据来自 BOARD_DATA.ABN_MGMT（构建时从 bs_order 重算 + 异常订单管理.xlsx 人工字段）
(function () {
  $(function () {
    var B = (typeof BOARD_DATA !== 'undefined') ? BOARD_DATA : null;
    if (!B || !B.ABN_MGMT || !B.ABN_MGMT.pages) return;
    var KEYMAP = { abn_nosample: 'nosample', abn_noproduction: 'noproduction', abn_noreinfusion: 'noreinfusion' };
    var key = KEYMAP[window.PAGE_KEY];
    if (!key) return;
    var PAGE = B.ABN_MGMT.pages[key] || { rows: [] };
    var DATA = PAGE.rows || [];

    // 每页配置：基准时间列名、时长列名、三列人工字段列名、筛选器、分档、是否有风险提示
    var CFG = {
        nosample: {
            baseLabel: '合同创建时间', durLabel: '时长（月）',
            colTitle: '长期未单采原因', actTitle: '如何尽快预约单采（行动计划）', planTitle: '预估单采时间',
            buckets: ['0~1 月', '1~2 月', '2~3 月', '3~6 月', '6~12 月', '≥12 月'], risk: false, status: true
        },
        noproduction: {
            baseLabel: '单采血入库时间', durLabel: '累计冻存时长（月）',
            colTitle: '长期未转生产原因', actTitle: '如何尽快转生产（行动计划）', planTitle: '预估生产时间',
            buckets: ['0~6 月', '6~12 月', '12~24 月', '≥24 月'], risk: true, status: false
        },
        noreinfusion: {
            baseLabel: '质量放行时间', durLabel: '累计时长（月）',
            colTitle: '具体原因', actTitle: '如何争取加快回输（行动计划）', planTitle: '预估回输时间',
            extraLabel: '计划回输时间',
            buckets: ['0~3 月', '3~6 月', '≥6 月'], risk: true, status: false
        }
    }[key];

    var RISKS = [
        { k: '已过期', color: '#ff4d4f', ico: '⛔' },
        { k: '即将过期', color: '#ffb800', ico: '⚠️' },
        { k: '未过期', color: '#62c98d', ico: '✅' }
    ];
    var RISK_MAP = {}; RISKS.forEach(function (r) { RISK_MAP[r.k] = r; });
    // 分档严重度（1 最轻 → 6 最重），用于分类列配色
    var SEV = {
        '0~1 月': 1, '1~2 月': 2, '2~3 月': 3, '3~6 月': 4, '6~12 月': 5, '≥12 月': 6,
        '0~6 月': 2, '12~24 月': 5, '≥24 月': 6,
        '0~3 月': 2, '≥6 月': 6
    };

    // 筛选状态
    var f = { code: '', no: '', am: '', hosp: '', bucket: '', status: { '全流程': true, '冻存': true }, risk: {} };
    RISKS.forEach(function (r) { f.risk[r.k] = true; });

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function hit(v, q) { return !q || String(v || '').toLowerCase().indexOf(q) >= 0; }

    function rowsVisible() {
        return DATA.filter(function (r) {
            if (!hit(r.code, f.code)) return false;
            if (!hit(r.no, f.no)) return false;
            if (!hit(r.am, f.am)) return false;
            if (!hit(r.hosp, f.hosp)) return false;
            if (f.bucket && r.bucket !== f.bucket) return false;
            if (CFG.status && !f.status[r.status]) return false;
            if (CFG.risk && r.risk && !f.risk[r.risk]) return false;
            return true;
        });
    }

    // ── 顶部 AI 总结 ──
    function renderAI() {
        var el = document.getElementById('abnAI');
        if (!el) return;
        var s = PAGE.summary || '';
        el.innerHTML = s
            ? '<div class="ib-hd"><span class="ib-tag">AI 总结</span><span class="ib-time">数据截止 ' + esc(B.ABN_MGMT.summaryAt || B.DP || '') + '</span></div><div class="ib-txt">' + esc(s) + '</div>'
            : '<div class="ib-hd"><span class="ib-tag">AI 总结</span></div><div class="ib-txt ib-empty">暂无总结（构建时未生成）</div>';
    }

    // ── 卡片式汇总（按时长分档）──
    function renderCards() {
        var el = document.getElementById('abnCards');
        if (!el) return;
        var total = DATA.length;
        var maxM = {}; DATA.forEach(function (r) { if (!(r.bucket in maxM) || r.months > maxM[r.bucket]) maxM[r.bucket] = r.months; });
        var cnt = {}; DATA.forEach(function (r) { cnt[r.bucket] = (cnt[r.bucket] || 0) + 1; });
        var h = '<div class="kpi-card kpi-card-all"><div class="kc-label">全部</div><div class="kc-val">' + total + '</div><div class="kc-sub">100% · 最久 ' + (total ? Math.max.apply(null, DATA.map(function (r) { return r.months; })) : 0) + ' 月</div></div>';
        CFG.buckets.forEach(function (b) {
            var n = cnt[b] || 0;
            var pct = total ? Math.round(n / total * 100) : 0;
            h += '<div class="kpi-card sev-' + (SEV[b] || 1) + (n ? '' : ' dim') + '">' +
                '<div class="kc-label">' + esc(b) + '</div>' +
                '<div class="kc-val">' + n + '</div>' +
                '<div class="kc-sub">' + pct + '% · 最久 ' + (n ? maxM[b] : 0) + ' 月</div></div>';
        });
        el.innerHTML = h;
    }

    // ── 控制区 ──
    function renderControls() {
        var el = document.getElementById('abnCtl');
        if (!el) return;
        var h = '<div class="abn-ctl-row">' +
            '<span class="abn-lab">追溯码</span><input type="text" id="abnFCode" class="abn-inp" placeholder="模糊搜索" autocomplete="off">' +
            '<span class="abn-lab">合同号</span><input type="text" id="abnFNo" class="abn-inp" placeholder="模糊搜索" autocomplete="off">' +
            '<span class="abn-lab">AM</span><input type="text" id="abnFAm" class="abn-inp" placeholder="模糊搜索" autocomplete="off">' +
            '<span class="abn-lab">医院名称</span><input type="text" id="abnFHosp" class="abn-inp abn-inp-wide" placeholder="模糊搜索" autocomplete="off">' +
            '<button type="button" class="cart-btn" id="abnExport">导出 Excel</button>' +
            '<button type="button" class="cart-btn ghost" id="abnClear">清空</button>' +
            '</div><div class="abn-ctl-row">' +
            '<span class="abn-lab">分类</span><select id="abnFBucket" class="pt-sel abn-sel"><option value="">全部</option>' +
            CFG.buckets.map(function (b) { return '<option value="' + esc(b) + '">' + esc(b) + '</option>'; }).join('') + '</select>';
        if (CFG.status) {
            h += '<span class="abn-lab">订单状态</span><div class="cart-lights" id="abnFStatus">' +
                ['全流程', '冻存'].map(function (s) { return '<button type="button" class="cart-light' + (f.status[s] ? ' on' : '') + '" data-v="' + s + '">' + statusIcon(s) + s + '</button>'; }).join('') + '</div>';
        }
        if (CFG.risk) {
            h += '<span class="abn-lab">风险提示</span><div class="cart-lights" id="abnFRisk">' +
                RISKS.map(function (r) { return '<button type="button" class="cart-light' + (f.risk[r.k] ? ' on' : '') + '" data-v="' + r.k + '">' + r.ico + r.k + '</button>'; }).join('') + '</div>';
        }
        h += '<span class="abn-cnt" id="abnCnt"></span></div>';
        el.innerHTML = h;
    }
    function statusIcon(s) { return s === '冻存' ? '❄ ' : '▶ '; }

    // ── 明细表列定义（页面渲染与 Excel 导出的唯一来源，保证两者永不漂移） ──
    // 每列：t 表头 / v(r) 取值（导出用纯文本）/ html(r) 可选，单元格富文本 / txt 长文本列 / lbl 主字段列
    function tableCols() {
        var cols = [
            { t: '细胞追溯码', v: function (r) { return r.code || '--'; } },
            { t: '合同号', v: function (r) { return r.no || '--'; } },
            { t: '订单月', v: function (r) { return r.ym || '--'; } },
            { t: '患者名称', v: function (r) { return r.patient || '--'; } },
            { t: 'Region', v: function (r) { return r.area || '--'; } },
            { t: 'AM', v: function (r) { return r.am || '--'; } },
            { t: '省份', v: function (r) { return r.prov || '--'; } },
            { t: '城市', v: function (r) { return r.city || '--'; } },
            { t: '医院名称', v: function (r) { return r.hosp || '未知医院'; }, lbl: true },
            {
                t: '订单状态', v: function (r) { return r.status; },
                html: function (r) { return '<span class="abn-st abn-st-' + (r.status === '冻存' ? 'cryo' : 'full') + '">' + statusIcon(r.status) + esc(r.status) + '</span>'; }
            },
            { t: CFG.baseLabel, v: function (r) { return r.baseTime || '--'; } }
        ];
        if (CFG.extraLabel) cols.push({ t: CFG.extraLabel, v: function (r) { return r.planRe || '--'; } });
        cols.push({ t: CFG.durLabel, v: function (r) { return r.months; }, cls: 'abn-dur' });
        cols.push({
            t: '分类', v: function (r) { return r.bucket; },
            html: function (r) { return '<span class="abn-bkt sev-' + (SEV[r.bucket] || 1) + '">' + esc(r.bucket) + '</span>'; }
        });
        if (CFG.risk) cols.push({ t: '风险提示', v: function (r) { return r.risk || '--'; }, html: function (r) { return renderRisk(r.risk); } });
        cols.push({ t: CFG.colTitle, v: function (r) { return r.reason || '--'; }, txt: true });
        cols.push({ t: CFG.actTitle, v: function (r) { return r.action || '--'; }, txt: true });
        cols.push({ t: CFG.planTitle, v: function (r) { return r.planTime || '--'; }, txt: true });
        return cols;
    }

    // ── 明细表 ──
    function renderTable() {
        var rows = rowsVisible();
        var cnt = document.getElementById('abnCnt');
        if (cnt) cnt.innerHTML = '共 <b>' + rows.length + '</b> 条';
        var cols = tableCols();
        var h = '<table class="pt abn-tbl"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c.t) + '</th>'; }).join('') + '</tr></thead><tbody>';
        if (!rows.length) {
            h += '<tr><td colspan="' + cols.length + '" class="abn-empty">无符合条件的记录</td></tr>';
        } else {
            rows.forEach(function (r) {
                h += '<tr>' + cols.map(function (c) {
                    var cls = c.lbl ? ' class="pt-lbl"' : (c.cls ? ' class="' + c.cls + '"' : (c.txt ? ' class="abn-txt" title="' + esc(c.v(r)) + '"' : ''));
                    return '<td' + cls + '>' + (c.html ? c.html(r) : esc(c.v(r))) + '</td>';
                }).join('') + '</tr>';
            });
        }
        h += '</tbody></table>';
        document.getElementById('abnTbl').innerHTML = h;
    }
    function renderRisk(v) {
        if (!v) return '<span class="abn-blank">--</span>';
        var m = RISK_MAP[v] || { color: '#9aa0a6', ico: '' };
        return '<span class="abn-risk" style="color:' + m.color + '">' + m.ico + ' ' + esc(v) + '</span>';
    }

    // ── 导出当前筛选结果为 .xlsx（列与页面表格完全一致） ──
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function todayStr() {
        var d = new Date(Date.now() + 8 * 3600000); // 北京时间
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }
    function pageTitle() {
        return String(document.title || '').split('·').pop().trim() || '异常订单';
    }
    function colWidth(c) {
        if (c.txt) return 40;                       // 原因 / 行动计划 / 预估时间
        if (c.t === '医院名称') return 34;
        if (c.t === CFG.durLabel) return 16;
        if (c.t === '细胞追溯码') return 16;
        if (c.t === CFG.colTitle || c.t === CFG.actTitle || c.t === CFG.planTitle) return 40;
        if (c.t === '合同号' || c.t === '患者名称') return 12;
        return 10;
    }
    function exportExcel() {
        if (typeof XLSX === 'undefined') { alert('导出库未加载（js/xlsx.full.min.js），无法导出。'); return; }
        var rows = rowsVisible();
        if (!rows.length) { alert('当前无可导出的记录。'); return; }
        var cols = tableCols();
        var aoa = [cols.map(function (c) { return c.t; })];
        rows.forEach(function (r) { aoa.push(cols.map(function (c) { return c.v(r); })); });
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = cols.map(function (c) { return { wch: colWidth(c) }; });
        var wb = XLSX.utils.book_new();
        var name = pageTitle().slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, name);
        XLSX.writeFile(wb, name + '_' + todayStr() + '.xlsx');
    }

    function renderAll() { renderCards(); renderTable(); }

    // ── 事件 ──
    function bind() {
        var map = { abnFCode: 'code', abnFNo: 'no', abnFAm: 'am', abnFHosp: 'hosp' };
        Object.keys(map).forEach(function (id) {
            $('#' + id).on('input', function () { f[map[id]] = String(this.value || '').trim().toLowerCase(); renderTable(); });
        });
        $('#abnFBucket').on('change', function () { f.bucket = this.value; renderTable(); });
        $('#abnFStatus').on('click', '.cart-light', function () {
            var v = $(this).data('v');
            var next = !f.status[v];
            if (!next && !(f.status['全流程'] || f.status['冻存'])) return; // 至少留一个
            f.status[v] = next; $(this).toggleClass('on', next); renderTable();
        });
        $('#abnFRisk').on('click', '.cart-light', function () {
            var v = $(this).data('v');
            var next = !f.risk[v];
            var onCnt = RISKS.filter(function (r) { return f.risk[r.k]; }).length;
            if (!next && onCnt <= 1) return;
            f.risk[v] = next; $(this).toggleClass('on', next); renderTable();
        });
        $('#abnExport').on('click', exportExcel);
        $('#abnClear').on('click', function () {
            f.code = f.no = f.am = f.hosp = ''; f.bucket = '';
            ['abnFCode', 'abnFNo', 'abnFAm', 'abnFHosp'].forEach(function (id) { $('#' + id).val(''); });
            $('#abnFBucket').val('');
            if (CFG.status) { f.status = { '全流程': true, '冻存': true }; $('#abnFStatus .cart-light').addClass('on'); }
            RISKS.forEach(function (r) { f.risk[r.k] = true; }); $('#abnFRisk .cart-light').addClass('on');
            renderTable();
        });
    }

    renderAI();
    renderControls();
    bind();
    renderAll();
  });
})();
