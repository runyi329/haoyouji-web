#!/usr/bin/env node
/**
 * 构建时执行：将 Git 提交历史导出为 JSON 文件
 * 输出到 server/git-log.json，供运行时直接读取
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

const outPath = path.resolve(__dirname, '../server/git-log.json');

try {
  // 用 spawnSync 避免 ENOBUFS，限制最近 3000 条
  const result = spawnSync('git', [
    'log', '--all',
    '--pretty=format:%H|%an|%ad|%s',
    '--date=iso-strict',
    '-n', '3000'
  ], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024 // 20MB
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

  fs.writeFileSync(outPath, JSON.stringify(commits, null, 2), 'utf8');
  console.log(`✓ git-log.json 已生成，共 ${commits.length} 条提交记录`);
} catch (err) {
  console.error('export-git-log 失败:', err.message);
  fs.writeFileSync(outPath, '[]', 'utf8');
}
