#!/usr/bin/env node
/**
 * 构建时执行：将 Git 提交历史导出为 JSON 文件
 * 同时输出到 server/git-log.json 和 dist/git-log.json
 * dist/ 目录会被 deploy.yml 复制到服务器，确保生产环境可读
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseCommitMessage(message) {
  const regex = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(([^)]*)\))?:\s*(.*)/;
  const match = message.match(regex);
  if (match) {
    return { type: match[1], scope: match[3] || '', cleanMessage: match[4].trim() };
  }
  return { type: 'chore', scope: '', cleanMessage: message.trim() };
}

const rootDir = path.resolve(__dirname, '..');
const serverOutPath = path.resolve(rootDir, 'server/git-log.json');
// dist/ 目录在 vite build 之后才存在，这里先写到 server/，vite build 后再复制
// 同时也写一份到根目录，方便 esbuild 打包后的 dist/index.js 找到

try {
  // 导出全量提交记录（不限制条数），maxBuffer 扩大到 100MB 防止溢出
  const result = spawnSync('git', [
    'log', '--all',
    '--pretty=format:%H|%an|%ad|%s',
    '--date=iso-strict'
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024 // 100MB
  });

  if (result.error) throw result.error;

  const lines = result.stdout.trim().split('\n').filter(Boolean);
  const commits = [];

  for (const line of lines) {
    const idx1 = line.indexOf('|');
    const idx2 = line.indexOf('|', idx1 + 1);
    const idx3 = line.indexOf('|', idx2 + 1);
    if (idx1 < 0 || idx2 < 0 || idx3 < 0) continue;

    const hash = line.substring(0, idx1);
    const author = line.substring(idx1 + 1, idx2);
    const date = line.substring(idx2 + 1, idx3);
    const subject = line.substring(idx3 + 1).trim();

    const { type, scope, cleanMessage } = parseCommitMessage(subject);
    commits.push({ hash, author, date, message: subject, type, scope, cleanMessage });
  }

  const jsonContent = JSON.stringify(commits, null, 2);

  // 写入 server/ 目录
  fs.writeFileSync(serverOutPath, jsonContent, 'utf8');
  console.log(`✓ git-log.json 已生成，共 ${commits.length} 条提交记录`);
  console.log(`  → ${serverOutPath}`);

} catch (err) {
  console.error('export-git-log 失败:', err.message);
  fs.writeFileSync(serverOutPath, '[]', 'utf8');
}
