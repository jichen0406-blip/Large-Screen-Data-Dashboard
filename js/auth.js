// auth.js — 认证：读取 BOARD_USERS（users + pageAccess）校验账号，计算权限，记录 sessionStorage
// 登录成功触发 $(document).trigger('boardlogin') 供导航栏重渲染；无权限页面自动重定向
(function () {
    var CFG = window.BOARD_USERS || {};
    var USERS = CFG.users || {};
    var PAGE_ACCESS = CFG.pageAccess || {};
    var CURRENT = null;

    function sha256(text) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (h) {
            return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        });
    }
    function err(msg) { var el = document.getElementById('loginErr'); if (el) el.textContent = msg; }
    function loadSession() { try { CURRENT = JSON.parse(sessionStorage.getItem('board_user') || 'null'); } catch (e) { CURRENT = null; } }
    function hideMask() { var m = document.getElementById('loginMask'); if (m) m.style.display = 'none'; }
    function curPage() {
        var p = location.pathname.split('/').pop() || 'index.html';
        if (p !== 'index.html' && p.indexOf('.html') < 0) p = p + '.html'; // npx serve 无扩展名重定向兼容
        return p;
    }
    // 页面唯一识别码：优先取页内 window.PAGE_KEY（随内容走，改文件名不影响），否则按 BOARD_PAGES 由文件名反解
    function keyOfFile(file) {
        var pages = window.BOARD_PAGES || [];
        for (var i = 0; i < pages.length; i++) if (pages[i].id === file) return pages[i].key;
        return null;
    }
    function fileOfKey(k) {
        var pages = window.BOARD_PAGES || [];
        for (var i = 0; i < pages.length; i++) if (pages[i].key === k) return pages[i].id;
        return 'index.html';
    }
    function curKey() {
        if (window.PAGE_KEY) return window.PAGE_KEY;
        return keyOfFile(curPage()) || curPage();
    }
    // 计算用户可访问页面：admin → null（全部）；user → pageAccess 中含该用户的页面
    function accessPages(user) {
        var u = USERS[user];
        if (u && u.role === 'admin') return null;
        var pages = [];
        Object.keys(PAGE_ACCESS).forEach(function (pg) {
            if ((PAGE_ACCESS[pg] || []).indexOf(user) >= 0) pages.push(pg);
        });
        return pages;
    }
    function saveSession(user, u) {
        CURRENT = { authed: '1', user: user, role: u.role, pages: accessPages(user) };
        try { sessionStorage.setItem('board_user', JSON.stringify(CURRENT)); } catch (e) {}
    }
    function canAccess(page) {
        if (!CURRENT || CURRENT.authed !== '1') return false;
        if (CURRENT.role === 'admin') return true;
        return (CURRENT.pages || []).indexOf(page) >= 0;
    }
    function home() {
        var pages = (CURRENT && CURRENT.pages) || [];
        return fileOfKey(pages[0] || 'index');
    }
    function check() {
        var uname = (document.getElementById('loginUser') || {}).value;
        var pwd = (document.getElementById('loginPwd') || {}).value;
        var u = USERS[String(uname || '').trim()];
        if (!u) { err('账号不存在'); return; }
        if (!u.enabled) { err('该账号已禁用，请联系管理员'); return; }
        sha256(pwd).then(function (h) {
            if (h !== u.pwdHash) { err('密码错误，请重试'); return; }
            saveSession(String(uname || '').trim(), u);
            // 记住密码：勾选存 localStorage（账号+密码），否则清除
            var remEl = document.getElementById('loginRemember');
            try {
                if (remEl && remEl.checked) localStorage.setItem('board_remember', JSON.stringify({ user: String(uname || '').trim(), pwd: pwd }));
                else localStorage.removeItem('board_remember');
            } catch (e) {}
            /* 登录瞬间先铺一层黑幕：动画运行时还要加载/初始化，避免闪出 dashboard */
            var cover = document.createElement('div');
            cover.id = 'boardSplashCover';
            cover.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147482999;';
            document.body.appendChild(cover);
            function dropCover() { var c = document.getElementById('boardSplashCover'); if (c && c.parentNode) c.parentNode.removeChild(c); }
            hideMask();
            if (window.jQuery) $(document).trigger('boardlogin');
            if (!canAccess(curKey())) { location.replace(home()); return; }
            if (window.boardSplash) {
                window.boardSplash(String(uname || '').trim());
                var waited = 0;
                var iv = setInterval(function () {
                    waited += 100;
                    if (document.getElementById('dsh-startup-root')) {
                        clearInterval(iv);
                        setTimeout(dropCover, 400);   // 动画已铺满，再撤黑幕
                    } else if (waited >= 3000) {
                        clearInterval(iv);
                        dropCover();                  // 兜底：3 秒内没起来就不挡了
                    }
                }, 100);
            } else {
                dropCover();
            }
        });
    }
    function init() {
        /* ── 开机动画（测试环境试装）：登录成功后播放，随机换成驯鹿品牌配置 ── */
        window.__DSH_STARTUP_SKIP__ = true;                       // 先不自动播，等登录成功
        window.__DSH_STARTUP_SCRIPT_URL__ = 'js/splash/splash.js';
        window.__DSH_STARTUP__ = {
            enabled: true, mode: 'always', theme: 'dark', speed: 1,
            requireInteraction: false, allowSkip: true,
            sound: true, voice: true, voiceLang: 'en',
            identity: 'Anonymous User', identityId: '9527', accessLevel: 'Top Secret',
            brand1: 'IASO', brand2: 'BIOTHERAPEUTICS', brand3a: 'DATA', brand3b: 'PLATFORM',
            orgZh: '驯鹿生物', orgEn: 'IASO', orgSub: 'IASO BIOTHERAPEUTICS',
            welcomeBox: 'IASO BIOTHERAPEUTICS', footer: 'POWERED BY IASO BIOTHERAPEUTICS',
            accent: '#4fe3ff', glitchA: '#ff3b30', glitchB: '#2971b8'
        };
        (function () {
            if (window.__boardSplashLoaded) return;
            window.__boardSplashLoaded = true;
            var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/splash/splash.css';
            document.head.appendChild(l);
            var sc = document.createElement('script'); sc.src = 'js/splash/splash.js';
            document.head.appendChild(sc);
        })();
        window.boardSplash = function (name) {
            try {
                window.__DSH_STARTUP__.identity = name || 'Anonymous User';
                if (window.__DSH_STARTUP_API__ && window.__DSH_STARTUP_API__.replay) window.__DSH_STARTUP_API__.replay();
            } catch (e) {}
        };
        loadSession();
        if (CURRENT && CURRENT.authed === '1') {
            hideMask();
            if (window.jQuery) $(document).trigger('boardlogin'); // 通知导航按权限重渲染
            if (!canAccess(curKey())) { location.replace(home()); return; }
        }
        // 记住密码预填
        try {
            var rem = JSON.parse(localStorage.getItem('board_remember') || 'null');
            if (rem && rem.user) {
                var uel = document.getElementById('loginUser'); if (uel) uel.value = rem.user;
                var pel = document.getElementById('loginPwd'); if (pel && rem.pwd) pel.value = rem.pwd;
                var rel = document.getElementById('loginRemember'); if (rel) rel.checked = true;
            }
        } catch (e) {}
        var btn = document.getElementById('loginBtn');
        if (btn) btn.addEventListener('click', check);
        var pwd = document.getElementById('loginPwd');
        if (pwd) pwd.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
        var user = document.getElementById('loginUser');
        if (user) user.focus();
    }
    window.BoardAuth = {
        current: function () { return CURRENT; },
        isAdmin: function () { return !!(CURRENT && CURRENT.role === 'admin'); },
        canAccess: canAccess,
        debug: function () { return { users: USERS, pageAccess: PAGE_ACCESS }; }
    };
    // DOM 就绪后再绑定（auth.js 在 head 加载，元素尚未存在）
    if (window.jQuery) { $(function () { init(); }); }
    else { document.addEventListener('DOMContentLoaded', init); }
})();
