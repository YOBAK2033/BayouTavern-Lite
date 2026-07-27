#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

REMOTE_URL="https://github.com/YOBAK2033/BayouTavern-Lite.git"
COMMIT_MESSAGE="${1:-Update BayouTavern Lite 2.0}"

command -v git >/dev/null 2>&1 || { echo "未找到 Git，请先安装 Git。"; exit 1; }

if [ ! -d ".git" ]; then
  git init
fi

git branch -M main

if [ -z "$(git config user.name || true)" ]; then
  git config user.name "YOBAK2033"
fi
if [ -z "$(git config user.email || true)" ]; then
  git config user.email "YOBAK2033@users.noreply.github.com"
fi

CURRENT_REMOTE="$(git remote get-url origin 2>/dev/null || true)"
if [ -z "$CURRENT_REMOTE" ]; then
  git remote add origin "$REMOTE_URL"
elif [ "$CURRENT_REMOTE" != "$REMOTE_URL" ]; then
  echo "origin 已指向其他仓库：$CURRENT_REMOTE"
  echo "如需更换，请先手动检查后执行：git remote set-url origin $REMOTE_URL"
  exit 1
fi

git add .

if git diff --cached --quiet; then
  echo "没有新的文件变更，直接检查远程同步状态。"
else
  git commit -m "$COMMIT_MESSAGE"
fi

git push -u origin main
echo "已推送到 $REMOTE_URL"
