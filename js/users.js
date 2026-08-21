// users.js — 账号与页面权限配置（生产环境：只由本地 sync_server.js 管理，部署/同步不覆盖）
// 初始配置：administrator 管理员；生产账号请在本机管理页配置后点「生成配置」推送
window.BOARD_USERS = {
  "users": {
    "administrator": {
      "pwdHash": "fcde78c0a777ada04fec4ed613421feb59ee71e70608fa7bf53c386970395c66",
      "role": "admin",
      "enabled": true
    }
  },
  "pageAccess": {
    "index.html": [],
    "page2.html": [],
    "page3.html": [],
    "page4.html": [],
    "page5.html": []
  }
};
