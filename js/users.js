// users.js — 账号与页面权限配置（修改后需重新部署生效）
window.BOARD_USERS = {
  "users": {
    "administrator": {
      "pwdHash": "fcde78c0a777ada04fec4ed613421feb59ee71e70608fa7bf53c386970395c66",
      "role": "admin",
      "enabled": true
    },
    "userA": {
      "pwdHash": "91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203",
      "role": "user",
      "enabled": true
    },
    "test": {
      "pwdHash": "bcb15f821479b4d5772bd0ca866c00ad5f926e3580720659cc80d39c9d09802a",
      "role": "user",
      "enabled": true
    },
    "xiejiaxiao": {
      "pwdHash": "a8c40115a8e5893e5392b39e1af8d968585d556691b57fc5d5117b44d56280de",
      "role": "user",
      "enabled": true
    },
    "test3": {
      "pwdHash": "fd61a03af4f77d870fc21e05e7e80678095c92d808cfb3b5c279ee04c74aca13",
      "role": "user",
      "enabled": true
    }
  },
  "pageAccess": {
    "index": [
      "userA"
    ],
    "sales": [
      "test"
    ],
    "reg": [
      "xiejiaxiao"
    ],
    "region1": [
      "test"
    ],
    "region2": [
      "test"
    ],
    "reserved": [
      "test3"
    ],
    "admin": [],
    "changelog": [
      "userA",
      "test",
      "xiejiaxiao"
    ]
  }
};
