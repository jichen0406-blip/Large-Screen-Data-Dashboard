#!/bin/bash
# ============================================================
# 大屏看板部署脚本：更新数据 → 提交 → 推送到 GitHub
# 目标仓库: git@github.com:jichen0406-blip/Large-Screen-Data-Dashboard.git
# 用法: bash deploy.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo "==> 1. 重新生成数据 js/data.js"
node build_data.js

echo "==> 1.1 打包省份地图 js/geo-data.js（内联，离线/file:// 打开无需 fetch）"
node build_geo.js

echo "==> 2. 确保 .gitignore（排除敏感数据/无关文件）"
if [ ! -f .gitignore ]; then
  cat > .gitignore <<'EOF'
# 敏感数据 - 绝不提交
rawdata/
# 依赖/临时文件
node_modules/
.DS_Store
*.log
EOF
  echo "    已创建 .gitignore"
fi

echo "==> 3. 确保 git 仓库 + 远程 + 提交身份"
if [ ! -d .git ]; then
  git init
  echo "    已初始化 git 仓库"
fi
if ! git config user.name > /dev/null 2>&1; then
  git config user.name "jichen0406-blip"
  git config user.email "jichen0406-blip@users.noreply.github.com"
  echo "    已设置提交身份（可在 .git/config 中修改）"
fi
if ! git remote | grep -q origin; then
  git remote add origin git@github.com:jichen0406-blip/Large-Screen-Data-Dashboard.git
  echo "    已添加远程仓库"
fi
# 统一分支为 main（GitHub 默认分支）
if [ "$(git branch --show-current)" != "main" ]; then
  git branch -M main
fi

echo "==> 4. 提交（无变更则跳过）"
git add -A
MSG="更新数据 $(node -e "console.log(new Date().toISOString().slice(0,10))")"
if git diff --cached --quiet; then
  echo "    无变更，跳过提交"
else
  git commit -m "$MSG"
  echo "    已提交: $MSG"
fi

echo "==> 5. 推送到 GitHub"
git push -u origin main
echo "==> 完成，部署已同步到 GitHub"
