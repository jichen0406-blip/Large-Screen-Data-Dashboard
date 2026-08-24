// admin.js — 后台管理页（仅管理员可进）：用户管理 + 页面权限管理 + 生成配置
// 页面列表读 window.BOARD_PAGES（nav.js 定义，新建页面自动出现在权限管理）；数据源 BOARD_USERS
// 修改后「生成配置」复制替换 js/users.js 并重新部署生效；登录后自动初始化
$(function () {
    var curTab = 'users';
    var state = null;

    function initState() {
        var CFG = window.BOARD_USERS || {};
        state = JSON.parse(JSON.stringify({ users: CFG.users || {}, pageAccess: CFG.pageAccess || {} }));
    }
    function pages() { return (window.BOARD_PAGES || []).slice(); }
    function sha256(text) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (h) {
            return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        });
    }
    function userNames(role) { return Object.keys(state.users).filter(function (n) { return !role || state.users[n].role === role; }).sort(); }
    function msg(t) { var m = document.getElementById('adminMsg'); if (m) m.textContent = t; }

    function isLocal() {
        var h = location.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    }
    function render() {
        var localNote = isLocal() ? '' :
            '<div class="admin-warn">⚠️ 当前不在本地生产环境（' + location.host + '）。账号权限管理请在<b>本地生产环境</b>操作：配置将写入本地 js/users.js 并推送到 GitHub；此处保存仅能复制配置。</div>';
        var h = localNote + '<div class="admin-tabbar">' +
            '<span class="admin-tab' + (curTab === 'users' ? ' on' : '') + '" data-tab="users">用户管理</span>' +
            '<span class="admin-tab' + (curTab === 'pages' ? ' on' : '') + '" data-tab="pages">页面权限管理</span>' +
            '<button type="button" class="admin-gen" id="adminGenBtn">生成配置</button>' +
            '<span class="admin-msg" id="adminMsg"></span>' +
            '</div>';
        h += '<div class="admin-body" id="adminBody"></div>';
        document.getElementById('adminWrap').innerHTML = h;
        if (curTab === 'users') renderUsers(); else renderPages();
    }

    function renderUsers() {
        var rows = userNames().map(function (n) {
            var u = state.users[n];
            var isSuper = (n === 'administrator');
            var ck = isSuper ? '' : (u.enabled
                ? '<button type="button" class="admin-btn" data-act="disable" data-u="' + n + '">禁用</button>'
                : '<button type="button" class="admin-btn warn" data-act="enable" data-u="' + n + '">启用</button>');
            return '<tr>' +
                '<td>' + n + (isSuper ? ' <em class="admin-super">超级</em>' : '') + '</td>' +
                '<td><select class="admin-role" data-u="' + n + '"' + (isSuper ? ' disabled' : '') + '>' +
                '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>管理员</option>' +
                '<option value="user"' + (u.role === 'user' ? ' selected' : '') + '>用户</option>' +
                '</select></td>' +
                '<td>' + (u.enabled ? '<span class="admin-ok">启用</span>' : '<span class="admin-off">禁用</span>') + '</td>' +
                '<td><button type="button" class="admin-btn" data-act="pwd" data-u="' + n + '">重置密码</button>' + ck +
                (isSuper ? '' : '<button type="button" class="admin-btn danger" data-act="del" data-u="' + n + '">删除</button>') +
                '</td></tr>';
        }).join('');
        document.getElementById('adminBody').innerHTML =
            '<div class="admin-hint">新增 / 禁用 / 重置密码 / 删除账号；管理员角色自动拥有全部页面权限。改完点「生成配置」复制替换 js/users.js 并重新部署。</div>' +
            '<table class="admin-tbl"><thead><tr><th>账号</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<div class="admin-add">' +
            '<span class="admin-add-t">新增账号</span>' +
            '<input type="text" id="newUser" placeholder="用户名" class="admin-inp">' +
            '<input type="password" id="newPwd" placeholder="密码" class="admin-inp">' +
            '<select id="newRole" class="admin-inp"><option value="user">用户</option><option value="admin">管理员</option></select>' +
            '<button type="button" class="admin-btn" id="addUserBtn">添加</button>' +
            '</div>';
    }
    function renderPages() {
        var users = userNames('user');
        var rows = pages().map(function (p) {
            var sel = (state.pageAccess[p.id] || []).slice();
            var boxes = users.map(function (n) {
                return '<label class="admin-ck"><input type="checkbox" value="' + n + '" data-pg="' + p.id + '"' + (sel.indexOf(n) >= 0 ? ' checked' : '') + '>' + n + '</label>';
            }).join('');
            return '<tr><td>' + p.num + ' ' + p.name + '</td><td class="admin-ckwrap">' + (boxes || '<span class="admin-off">（无用户）</span>') + '</td></tr>';
        }).join('');
        document.getElementById('adminBody').innerHTML =
            '<div class="admin-hint">每页勾选可访问的用户（勾选即保存、实时生效；管理员自动全部，无需配置）。新建页面后此列表自动出现新页。</div>' +
            '<table class="admin-tbl"><thead><tr><th>页面</th><th>可访问用户</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function genConfig() {
        var usersObj = {}, k;
        for (k in state.users) usersObj[k] = state.users[k];
        return '// users.js — 账号与页面权限配置（修改后需重新部署生效）\n' +
            'window.BOARD_USERS = ' + JSON.stringify({ users: usersObj, pageAccess: state.pageAccess }, null, 2) + ';\n';
    }
    function showManual(code) {
        document.getElementById('adminBody').innerHTML =
            '<div class="admin-hint">⚠️ 本地同步服务未运行，请手动复制以下内容替换 <b>js/users.js</b>（或先启动 sync_server.js）。</div>' +
            '<textarea class="admin-code" id="adminCode" readonly rows="14">' + code.replace(/</g, '&lt;') + '</textarea>' +
            '<button type="button" class="admin-btn" id="copyBtn">复制配置</button>';
        document.getElementById('copyBtn').onclick = function () {
            var ta = document.getElementById('adminCode');
            ta.select();
            if (document.execCommand) document.execCommand('copy');
            msg('已复制');
        };
    }
    function syncUrl() {
        var p = location.port;
        var port = (p === '62030') ? 62000 : 62001; // 测试 62030→62000；生产 53202→62001
        return 'http://127.0.0.1:' + port + '/api/users';
    }
    function showGen() {
        var code = genConfig();
        var body = document.getElementById('adminBody');
        body.innerHTML = '<div class="admin-hint">正在同步到本地 js/users.js 并推送到 GitHub…</div>';
        fetch(syncUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: code })
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (res.ok) {
                body.innerHTML = '<div class="admin-hint">✅ ' + res.msg + '。刷新页面即可生效。</div>' +
                    '<textarea class="admin-code" id="adminCode" readonly rows="10">' + code.replace(/</g, '&lt;') + '</textarea>';
            } else { showManual(code); }
        }).catch(function () { showManual(code); });
    }

    function initAdmin() {
        var auth = window.BoardAuth;
        var wrap = document.getElementById('adminWrap');
        if (!auth || !auth.isAdmin()) {
            wrap.innerHTML = '<div class="admin-tip">无权限访问后台管理（仅管理员）</div>';
            return;
        }
        if (!state) initState();
        render();
    }

    // 事件委托（绑定一次）
    $('#adminWrap').on('click', '.admin-tab', function () { curTab = $(this).data('tab'); render(); });
    $('#adminWrap').on('click', '#adminGenBtn', showGen);
    $('#adminWrap').on('change', '.admin-role', function () {
        state.users[$(this).data('u')].role = this.value; msg('已保存角色');
    });
    $('#adminWrap').on('click', '.admin-btn[data-act]', function () {
        var act = $(this).data('act'), u = $(this).data('u');
        if (act === 'disable') { state.users[u].enabled = false; msg('已禁用 ' + u); renderUsers(); }
        else if (act === 'enable') { state.users[u].enabled = true; msg('已启用 ' + u); renderUsers(); }
        else if (act === 'del') {
            if (confirm('确定删除账号 ' + u + ' ？')) {
                delete state.users[u];
                Object.keys(state.pageAccess).forEach(function (pg) {
                    state.pageAccess[pg] = (state.pageAccess[pg] || []).filter(function (n) { return n !== u; });
                });
                msg('已删除 ' + u); renderUsers();
            }
        }
        else if (act === 'pwd') {
            var np = prompt('为 ' + u + ' 设置新密码：');
            if (np) sha256(np).then(function (h) { state.users[u].pwdHash = h; msg('已重置 ' + u + ' 的密码'); });
        }
    });
    $('#adminWrap').on('click', '#addUserBtn', function () {
        var n = $('#newUser').val().trim(), p = $('#newPwd').val();
        if (!n || !p) { msg('请填写用户名和密码'); return; }
        if (state.users[n]) { msg('账号 ' + n + ' 已存在'); return; }
        sha256(p).then(function (h) {
            state.users[n] = { pwdHash: h, role: $('#newRole').val(), enabled: true };
            msg('已新增账号 ' + n); renderUsers();
        });
    });
    $('#adminWrap').on('change', '.admin-ck input', function () {
        var pg = $(this).data('pg');
        var arr = state.pageAccess[pg] = state.pageAccess[pg] || [];
        if (this.checked) { if (arr.indexOf(this.value) < 0) arr.push(this.value); }
        else { var i = arr.indexOf(this.value); if (i >= 0) arr.splice(i, 1); }
        var p = pages().filter(function (x) { return x.id === pg; })[0];
        msg('已更新 ' + (p ? p.num : pg) + ' 权限');
    });

    $(document).on('boardlogin', initAdmin);
    initAdmin();
});
