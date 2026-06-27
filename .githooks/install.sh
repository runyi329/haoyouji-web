#!/bin/sh
# 安装 Git Hooks：将 .githooks 目录设为 Git 的 hooks 目录
git config core.hooksPath .githooks
echo "✅ Git Hooks 已安装，push 保护已启用。"
