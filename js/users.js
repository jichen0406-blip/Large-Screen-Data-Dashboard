// users.js — 账号与页面权限配置（修改后需重新部署生效）
window.BOARD_USERS = {
  "users": {
    "administrator": {
      "pwdHash": "fcde78c0a777ada04fec4ed613421feb59ee71e70608fa7bf53c386970395c66",
      "role": "admin",
      "enabled": true
    },
    "test1": {
      "pwdHash": "bcb15f821479b4d5772bd0ca866c00ad5f926e3580720659cc80d39c9d09802a",
      "role": "user",
      "enabled": true
    },
    "test2": {
      "pwdHash": "4cc8f4d609b717356701c57a03e737e5ac8fe885da8c7163d3de47e01849c635",
      "role": "user",
      "enabled": true
    }
  },
  "pageAccess": {
    "index.html": [
      "test1"
    ],
    "page2.html": [
      "test1"
    ],
    "page3.html": [
      "test2"
    ],
    "page4.html": [
      "test2"
    ],
    "page5.html": [
      "test2"
    ]
  }
};
