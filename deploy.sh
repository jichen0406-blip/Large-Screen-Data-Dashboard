#!/bin/bash
# ============================================================
# 大屏看板部署脚本：更新数据 → 提交 → 推送到 GitHub
# 目标仓库: git@github.com:jichen0406-blip/Large-Screen-Data-Dashboard.git
# 用法: bash deploy.sh ["改动说明"]
#   纯数据更新 : bash deploy.sh                 → 提交信息「更新数据 <日期>」
#   含代码改动 : bash deploy.sh "省份表取消 AM 拆行" → 「省份表取消 AM 拆行 + 更新数据 <日期>」
#                （暂存区里除 js/data.js / js/geo-data.js 外还有别的文件、又没给说明时，
#                  脚本会停止提交并列出这些文件，避免提交信息写成没信息量的「更新数据」）
# ============================================================
set -e
cd "$(dirname "$0")"

echo "==> 1. 重新生成数据 js/data.js"
node build_data.js

echo "==> 1.1 打包省份地图 js/geo-data.js（内联，离线/file:// 打开无需 fetch）"
node build_geo.js

echo "==> 1.2 刷新项目文档页面索引 js/nav.js → 项目文档.md §4.0"
node page_sync.js index || echo "    （索引刷新失败但继续部署）"

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

echo "==> 4. 提交（无变更则跳过；js/users.js 为本地账号权限配置，由 sync_server.js 单独管理，部署不提交）"
git add -A
git reset -q js/users.js

DATE="$(node -e "console.log(new Date().toISOString().slice(0,10))")"
# 暂存区里除数据文件外还有别的（代码/页面/文档）→ 这次不是纯数据更新，提交信息需人工说明
CODE_FILES="$(git -c core.quotePath=false diff --cached --name-only | grep -vE '^(js/data\.js|js/geo-data\.js)$' || true)"
if [ -n "$1" ]; then
  MSG="$1 + 更新数据 $DATE"
elif [ -z "$CODE_FILES" ]; then
  MSG="更新数据 $DATE"
else
  echo "    ⚠ 除数据外还暂存了以下文件，无法自动生成合适的提交信息："
  printf '%s\n' "$CODE_FILES" | sed 's/^/        /'
  echo "    ✗ 已停止提交。请带说明重跑，例如："
  echo "        bash deploy.sh \"省份表取消 AM 拆行\""
  echo "      （工作区与暂存区都已就绪，重跑不会丢改动）"
  exit 1
fi

if git diff --cached --quiet; then
  echo "    无变更，跳过提交"
else
  git commit -m "$MSG"
  echo "    已提交: $MSG"
fi

echo "==> 5. 推送到 GitHub"
git push -u origin main
echo "==> 完成，部署已同步到 GitHub"
