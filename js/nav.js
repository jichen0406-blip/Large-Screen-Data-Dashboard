// 网页导航公共脚本：命名 P序号（页面名），每屏最多 4 项 + 页码条，📌 默认首页，当前页徽章
// 所有页面引入 <script src="js/nav.js"></script>，菜单结构由 nav.js 自动渲染
(function () {
    // 页面清单（id=文件名，key=页面唯一识别码[稳定，不随插删页变化]，num=P序号，name=页面名）
    // 新增/插入页面只改这里与权限文件：key 永不变，num/name/id 随插删调整；授权按 key 匹配
    window.BOARD_PAGES = [
        { id: 'changelog.html', key: 'changelog', num: 'P1', name: '更新日志' },
        { id: 'index.html', key: 'index', num: 'P2', name: '福可苏业绩总览' },
        { id: 'page9.html', key: 'daily30', num: 'P3', name: '订单进展每日跟进' },
        { id: 'flow.html', key: 'flow', num: 'P4', name: '福可苏全流程跟进' },
        { id: 'page2.html', key: 'sales', num: 'P5', name: '海外/商业化' },
        { id: 'page3.html', key: 'reg', num: 'P6', name: '全球注册进度' },
        { id: 'page18.html', key: 'channels', num: 'P7', name: '患者渠道销量' },
        { id: 'page4.html', key: 'region1', num: 'P8', name: '目标数据管理' },
        { id: 'page5.html', key: 'region2', num: 'P9', name: 'AM下单&回输数据' },
        { id: 'page6.html', key: 'region3', num: 'P10', name: '省份&医院数据' },
        { id: 'page15.html', key: 'coe_scoe', num: 'P11', name: 'SCOE 医院数据' },
        { id: 'page16.html', key: 'coe_coe', num: 'P12', name: 'COE 医院数据' },
        { id: 'page17.html', key: 'coe_rcoe', num: 'P13', name: 'RCOE 医院数据' },
        { id: 'page12.html', key: 'abn_nosample', num: 'P14', name: '长期未单采订单' },
        { id: 'page13.html', key: 'abn_noproduction', num: 'P15', name: '长期未转生产' },
        { id: 'page14.html', key: 'abn_noreinfusion', num: 'P16', name: '长期未回输订单' },
        { id: 'page19.html', key: 'cancel_ytd', num: 'P17', name: 'YTD取消订单管理' },
        { id: 'page20.html', key: 'cancel_all', num: 'P18', name: '全量取消订单管理' },
        { id: 'page21.html', key: 'cancel_hosp', num: 'P19', name: '医院取消订单管理' },
        { id: 'page10.html', key: 'cart_daily', num: 'P20', name: 'CART运营每日跟进' },
        { id: 'page11.html', key: 'overdue', num: 'P21', name: '逾期未执行汇总' },
        { id: 'page8.html', key: 'reserved', num: 'P22', name: '预留' },
    ];
    var PAGES = window.BOARD_PAGES;
    var PER = 4; // 每屏最多 4 项

    var cur = location.pathname.split('/').pop() || 'index.html';
    if (cur !== 'index.html' && cur.indexOf('.html') < 0) cur = cur + '.html'; // npx serve 无扩展名重定向兼容
    var curPage = 0;

    function defPage() { return localStorage.getItem('board_default') || 'index.html'; }
    function isKnown(id) { for (var i = 0; i < PAGES.length; i++) if (PAGES[i].id === id) return true; return false; }
    // 按当前登录用户权限过滤可见页面（按 key 匹配）；administrator 额外显示「管理」入口
    function allowedPages() {
        var auth = window.BoardAuth;
        if (!auth || !auth.current()) return PAGES.slice();
        var list = PAGES.filter(function (p) { return auth.canAccess(p.key); });
        if (auth.isAdmin()) list.push({ id: 'page7.html', key: 'admin', num: 'P0', name: '后台管理' });
        return list;
    }

    // 左侧导航栏 icon（白色 Material 线条图标，page id → SVG）
    var NAV_ICONS = {
        'changelog.html': '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
        'index.html': '<svg viewBox="0 0 24 24"><path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"/></svg>',
        'page9.html': '<svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z"/></svg>',
        'page10.html': '<svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM16.53 11.06L15.47 10l-4.88 4.88-2.12-2.12-1.06 1.06L10.59 17l5.94-5.94z"/></svg>',
        'page11.html': '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
        'page12.html': '<svg viewBox="0 0 24 24"><path d="M17.66 8L12 2.35 6.34 8C4.78 9.56 4 11.64 4 13.64s.78 4.11 2.34 5.67 3.64 2.35 5.66 2.35 4.1-.79 5.66-2.35 2.34-3.67 2.34-5.67S19.22 9.56 17.66 8z"/></svg>',
        'page13.html': '<svg viewBox="0 0 24 24"><path d="M18 22l-.01-6L14 12l3.99-4.01L18 2H6l.01 5.99L10 12l-3.99 4L6 22h12z"/></svg>',
        'page14.html': '<svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>',
        'page15.html': '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
        'page16.html': '<svg viewBox="0 0 24 24"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4V6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>',
        'page17.html': '<svg viewBox="0 0 24 24"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>',
        'page18.html': '<svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>',
        'page19.html': '<svg viewBox="0 0 24 24"><path d="M9.31 17l2.44-2.44L14.19 17l1.06-1.06-2.44-2.44 2.44-2.44-1.06-1.06-2.44 2.44-2.44-2.44-1.06 1.06 2.44 2.44-2.44 2.44L9.31 17zM19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>',
        'page20.html': '<svg viewBox="0 0 24 24"><path d="M11 5.08V2c-5 .5-9 4.81-9 10s4 9.5 9 10v-3.08c-3-.48-6-3.4-6-6.92s3-6.44 6-6.92zM18.97 11H22c-.47-5-4-8.53-9-9v3.08C16 5.57 18.47 8.03 18.97 11zM13 18.92V22c5-.47 8.53-4 9-9h-3.03c-.5 2.97-2.97 5.44-5.97 5.92z"/></svg>',
        'page21.html': '<svg viewBox="0 0 24 24"><path d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5zM19 19.09H5V4.91h14v14.18zM6 15h12v2H6zm0-4h12v2H6zm0-4h12v2H6z"/></svg>',
        'cancel.html': '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/></svg>',
        'flow.html': '<svg viewBox="0 0 24 24"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>',
        'page2.html': '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
        'page3.html': '<svg viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>',
        'page4.html': '<svg viewBox="0 0 24 24"><path d="M19.07 4.93l-1.41 1.41C19.1 7.79 20 9.79 20 12c0 4.42-3.58 8-8 8s-8-3.58-8-8c0-4.08 3.05-7.44 7-7.93v2.02C8.16 6.57 6 9.03 6 12c0 3.31 2.69 6 6 6s6-2.69 6-6c0-1.66-.67-3.16-1.76-4.24l-1.41 1.41C15.55 9.9 16 10.9 16 12c0 2.21-1.79 4-4 4s-4-1.79-4-4c0-1.86 1.28-3.41 3-3.86v2.14c-.6.35-1 .98-1 1.72 0 1.1.9 2 2 2s2-.9 2-2c0-.74-.4-1.38-1-1.72V2h-1C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-2.76-1.12-5.26-2.93-7.07z"/></svg>',
        'page5.html': '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/></svg>',
        'page6.html': '<svg viewBox="0 0 24 24"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>',
        'page7.html': '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>',
        'page8.html': '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>'
    };
    // 页面分组：左侧导航一级入口（悬停/点击展开该组页面），key 不在任何组则自动归入「其他」
    // 新增页面若想进组，把它的 key 加进对应 keys 即可；不维护这里就显示在「其他」组里
    var NAV_GROUPS = [
        { label: '更新日志', iconId: 'changelog.html', keys: ['changelog'] },
        { label: '总览', iconId: 'index.html', keys: ['index', 'flow', 'region1'] },
        { label: '海外业务', iconId: 'page3.html', keys: ['sales', 'reg', 'channels'] },
        { label: '每日跟进', iconId: 'page9.html', keys: ['daily30', 'cart_daily', 'overdue'] },
        { label: '辖区管理', iconId: 'page5.html', keys: ['region2', 'region3', 'coe_scoe', 'coe_coe', 'coe_rcoe'] },
        { label: '异常订单管理', iconId: 'page11.html', keys: ['abn_nosample', 'abn_noproduction', 'abn_noreinfusion'] },
        { label: '取消订单管理', iconId: 'cancel.html', keys: ['cancel_ytd', 'cancel_all', 'cancel_hosp'] },
        { label: '彩蛋', iconId: 'page8.html', keys: ['reserved'] },
        { label: '系统', iconId: 'page7.html', keys: ['admin'] }
    ];
    function groupDefs() {
        return NAV_GROUPS.slice();
    }
    var sideNavClickBound = false;
    // 左侧悬浮导航：分组图标常驻，hover 滑出该组页面（分组随权限过滤；当前页所在组高亮）
    function renderSideNav() {
        var $nav = $('#sideNav');
        if (!$nav.length) return;
        var pages = allowedPages();
        var groups = groupDefs();
        var html = '';
        var seen = {};
        groups.forEach(function (g) {
            var inGroup = pages.filter(function (p) { return g.keys.indexOf(p.key) >= 0; });
            inGroup.forEach(function (p) { seen[p.key] = true; });
            if (!inGroup.length) return;
            var hasCur = inGroup.some(function (p) { return p.id === cur; });
            var rows = inGroup.map(function (p) {
                var isCur = p.id === cur;
                return '<a class="side-subitem' + (isCur ? ' cur' : '') + '" href="' + p.id + '">' +
                    '<span class="ss-ico">' + (NAV_ICONS[p.id] || '') + '</span>' +
                    '<span class="ss-name">' + p.name + '</span>' +
                    (isCur ? '<em>当前</em>' : '') +
                    '</a>';
            }).join('');
            html += '<div class="side-grp' + (hasCur ? ' cur' : '') + '">' +
                '<a class="side-item' + (hasCur ? ' cur' : '') + '" href="javascript:;" title="' + g.label + '">' +
                '<span class="side-ico">' + (NAV_ICONS[g.iconId] || '') + '</span>' +
                '<span class="side-name">' + g.label + '</span></a>' +
                '<div class="side-sub"><div class="side-sub-hd">' + (NAV_ICONS[g.iconId] || '') + g.label + '</div>' + rows + '</div>' +
                '</div>';
        });
        // 未归入任何组的页面 → 兜底「其他」组
        var rest = pages.filter(function (p) { return !seen[p.key]; });
        if (rest.length) {
            var g2 = { label: '其他', iconId: 'page8.html', keys: [] };
            var hasCur2 = rest.some(function (p) { return p.id === cur; });
            html += '<div class="side-grp' + (hasCur2 ? ' cur' : '') + '">' +
                '<a class="side-item' + (hasCur2 ? ' cur' : '') + '" href="javascript:;" title="其他">' +
                '<span class="side-ico">' + (NAV_ICONS[g2.iconId] || '') + '</span>' +
                '<span class="side-name">其他</span></a>' +
                '<div class="side-sub"><div class="side-sub-hd">' + (NAV_ICONS[g2.iconId] || '') + '其他</div>' +
                rest.map(function (p) {
                    var isCur = p.id === cur;
                    return '<a class="side-subitem' + (isCur ? ' cur' : '') + '" href="' + p.id + '">' +
                        '<span class="ss-ico">' + (NAV_ICONS[p.id] || '') + '</span>' +
                        '<span class="ss-name">' + p.name + '</span>' +
                        (isCur ? '<em>当前</em>' : '') + '</a>';
                }).join('') + '</div></div>';
        }
        $nav.html(html);
        // 分组图标点击：钉住/收起该组子菜单（无 hover 设备可用）；仅绑定一次
        if (!sideNavClickBound) {
            sideNavClickBound = true;
            $nav.on('click', '.side-item', function () {
                var $g = $(this).closest('.side-grp');
                $nav.find('.side-grp.open').not($g).removeClass('open');
                $g.toggleClass('open');
            });
        }
    }
    // 导航栏固定（CSS top:72px 不动），高度匹配右侧内容，至少填满可视区
    function sizeSideNav() {
        var $nav = $('#sideNav');
        var $mb = $('.mainbox');
        if (!$nav.length || !$mb.length) return;
        var r = $mb[0].getBoundingClientRect();
        var h = Math.max(r.height, window.innerHeight - r.top - 20);
        $nav.css({ height: Math.round(h) + 'px' });
    }

    $(function () {
        renderSideNav();
        sizeSideNav();
        // 登录成功后按权限重渲染导航（隐藏无权限页、管理员显示管理入口）
        $(document).on('boardlogin', function () { renderSideNav(); sizeSideNav(); render(); });
        $(window).on('resize', sizeSideNav);
        // mainbox 尺寸变化（如表格异步填充、折叠展开）时同步导航栏高度
        var $mb = $('.mainbox');
        if (typeof ResizeObserver !== 'undefined' && $mb.length) {
            var ro = new ResizeObserver(function () { sizeSideNav(); });
            ro.observe($mb[0]);
        }
        var $mask = $('#menuMask');
        var $list = $('#menuList');
        var $pager = $('#menuPager');
        if (!$mask.length || !$list.length) return;

        function render() {
            var pages = allowedPages();
            var start = curPage * PER;
            var items = pages.slice(start, start + PER);
            var def = defPage();
            var html = '';
            items.forEach(function (p) {
                var isCur = p.id === cur;
                var isDef = p.id === def;
                var isAdmin = p.id === 'page7.html';
                html += '<li class="menu-item' + (isCur ? ' cur' : '') + '" data-href="' + p.id + '">' +
                    '<i class="mi-ico">▤</i>' +
                    '<span class="mi-num">' + p.num + '</span>' +
                    '<span class="mi-name">（' + p.name + '）</span>' +
                    (isCur ? '<em>当前</em>' : '') +
                    (isAdmin ? '' : '<i class="mi-pin' + (isDef ? ' active' : '') + '" data-pin="' + p.id + '" title="设为默认首页">📌</i>') +
                    '</li>';
            });
            $list.html(html);
            // 页码条（>PER 页才显示）
            var total = Math.ceil(pages.length / PER);
            var ph = '';
            for (var i = 0; i < total; i++) {
                ph += '<span class="menu-pg' + (i === curPage ? ' active' : '') + '" data-pg="' + i + '">' + (i + 1) + '</span>';
            }
            $pager.html(total > 1 ? ph : '');
        }

        $('#menuBtn').on('click', function () { curPage = 0; render(); $mask.show(); });
        $mask.on('click', function (e) { if (e.target === this) $mask.hide(); });
        $('#menuClose').on('click', function () { $mask.hide(); });

        // 跳转页面
        $list.on('click', '.menu-item', function () {
            var href = $(this).data('href');
            if (href && href !== cur) { location.href = href; } else { $mask.hide(); }
        });
        // 📌 设为默认首页
        $list.on('click', '.mi-pin', function (e) {
            e.stopPropagation();
            var id = $(this).data('pin');
            if (isKnown(id)) { localStorage.setItem('board_default', id); render(); }
        });
        // 页码条翻页
        $pager.on('click', '.menu-pg', function () { curPage = parseInt($(this).data('pg'), 10); render(); });

        // 默认首页：仅从站点外部首次进入总览根地址时跳转（站内互跳不受影响）
        var def = defPage();
        var p = location.pathname.split('/').pop() || 'index.html';
        if (p === 'index.html' && def !== 'index.html' && isKnown(def)) {
            var fromOutside = !document.referrer || document.referrer.indexOf(location.origin) < 0;
            if (fromOutside) location.replace(def);
        }
    });
})();
