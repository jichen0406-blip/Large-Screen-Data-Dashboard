// 网页导航公共脚本：命名 P序号（页面名），每屏最多 4 项 + 页码条，📌 默认首页，当前页徽章
// 所有页面引入 <script src="js/nav.js"></script>，菜单结构由 nav.js 自动渲染
(function () {
    // 页面清单（id=文件名，num=P序号，name=页面名）——新增页面在这里追加
    var PAGES = [
        { id: 'index.html', num: 'P1', name: '福可苏业绩总览' },
        { id: 'page2.html', num: 'P2', name: '海外/商业化' },
        { id: 'page3.html', num: 'P3', name: '辖区数据管理1' },
        { id: 'page4.html', num: 'P4', name: '辖区数据管理2' },
        { id: 'page5.html', num: 'P5', name: '预留' }
    ];
    var PER = 4; // 每屏最多 4 项

    var cur = location.pathname.split('/').pop() || 'index.html';
    if (cur !== 'index.html' && cur.indexOf('.html') < 0) cur = cur + '.html'; // npx serve 无扩展名重定向兼容
    var curPage = 0;

    function defPage() { return localStorage.getItem('board_default') || 'index.html'; }
    function isKnown(id) { for (var i = 0; i < PAGES.length; i++) if (PAGES[i].id === id) return true; return false; }

    $(function () {
        var $mask = $('#menuMask');
        var $list = $('#menuList');
        var $pager = $('#menuPager');
        if (!$mask.length || !$list.length) return;

        function render() {
            var start = curPage * PER;
            var items = PAGES.slice(start, start + PER);
            var def = defPage();
            var html = '';
            items.forEach(function (p) {
                var isCur = p.id === cur;
                var isDef = p.id === def;
                html += '<li class="menu-item' + (isCur ? ' cur' : '') + '" data-href="' + p.id + '">' +
                    '<i class="mi-ico">▤</i>' +
                    '<span class="mi-num">' + p.num + '</span>' +
                    '<span class="mi-name">（' + p.name + '）</span>' +
                    (isCur ? '<em>当前</em>' : '') +
                    '<i class="mi-pin' + (isDef ? ' active' : '') + '" data-pin="' + p.id + '" title="设为默认首页">📌</i>' +
                    '</li>';
            });
            $list.html(html);
            // 页码条（>PER 页才显示）
            var total = Math.ceil(PAGES.length / PER);
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
