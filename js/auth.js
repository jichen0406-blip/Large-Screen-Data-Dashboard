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
    function home() { return (CURRENT && CURRENT.pages && CURRENT.pages[0]) ? CURRENT.pages[0] : 'index.html'; }
    function check() {
        var uname = (document.getElementById('loginUser') || {}).value;
        var pwd = (document.getElementById('loginPwd') || {}).value;
        var u = USERS[String(uname || '').trim()];
        if (!u) { err('账号不存在'); return; }
        if (!u.enabled) { err('该账号已禁用，请联系管理员'); return; }
        sha256(pwd).then(function (h) {
            if (h !== u.pwdHash) { err('密码错误，请重试'); return; }
            saveSession(String(uname || '').trim(), u);
            hideMask();
            if (window.jQuery) $(document).trigger('boardlogin');
            if (!canAccess(curPage())) location.replace(home());
        });
    }
    function init() {
        loadSession();
        if (CURRENT && CURRENT.authed === '1') {
            hideMask();
            if (window.jQuery) $(document).trigger('boardlogin'); // 通知导航按权限重渲染
            if (!canAccess(curPage())) { location.replace(home()); return; }
        }
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
