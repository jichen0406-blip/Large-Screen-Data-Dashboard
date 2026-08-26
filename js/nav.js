// 网页导航公共脚本：命名 P序号（页面名），每屏最多 4 项 + 页码条，📌 默认首页，当前页徽章
// 所有页面引入 <script src="js/nav.js"></script>，菜单结构由 nav.js 自动渲染
(function () {
    // 页面清单（id=文件名，key=页面唯一识别码[稳定，不随插删页变化]，num=P序号，name=页面名）
    // 新增/插入页面只改这里与权限文件：key 永不变，num/name/id 随插删调整；授权按 key 匹配
    window.BOARD_PAGES = [
        { id: 'changelog.html', key: 'changelog', num: 'P1', name: '更新日志' },
        { id: 'index.html', key: 'index', num: 'P2', name: '福可苏业绩总览' },
        { id: 'flow.html', key: 'flow', num: 'P3', name: '福可苏全流程跟进' },
        { id: 'page2.html', key: 'sales', num: 'P4', name: '海外/商业化' },
        { id: 'page3.html', key: 'reg', num: 'P5', name: '全球注册进度' },
        { id: 'page4.html', key: 'region1', num: 'P6', name: '辖区数据管理1' },
        { id: 'page5.html', key: 'region2', num: 'P7', name: '辖区数据管理2' },
        { id: 'page6.html', key: 'region3', num: 'P8', name: '辖区数据管理3' },
        { id: 'page8.html', key: 'reserved', num: 'P9', name: '预留' }
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
        'flow.html': '<svg viewBox="0 0 24 24"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>',
        'page2.html': '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
        'page3.html': '<svg viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>',
        'page4.html': '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z"/></svg>',
        'page5.html': '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/></svg>',
        'page6.html': '<svg viewBox="0 0 24 24"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>',
        'page7.html': '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>',
        'page8.html': '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>'
    };
    // 左侧悬浮导航栏：白色 icon 常驻，hover 展开显示 编号+名称，当前页高亮
    function renderSideNav() {
        var $nav = $('#sideNav');
        if (!$nav.length) return;
        var html = '';
        allowedPages().forEach(function (p) {
            var isCur = p.id === cur;
            html += '<a class="side-item' + (isCur ? ' cur' : '') + '" href="' + p.id + '" title="' + p.num + ' ' + p.name + '">' +
                '<span class="side-ico">' + (NAV_ICONS[p.id] || '') + '</span>' +
                '<span class="side-name">' + p.num + ' ' + p.name + '</span>' +
                '</a>';
        });
        $nav.html(html);
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
