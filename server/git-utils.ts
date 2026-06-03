import * as fs from "fs";
import * as path from "path";

interface GitCommit {
  hash: string;
  author: string;
  date: string; // ISO 8601 format
  message: string;
  type: string; // e.g., 'feat', 'fix', 'docs'
  scope: string; // e.g., 'InterestManagePage', 'LedgerDetail'
  cleanMessage: string; // message without type and scope prefix
}

export async function getGitCommits(): Promise<GitCommit[]> {
  try {
    // 服务器运行时 __dirname 为 /home/ubuntu/haoyouji-web/dist
    // git-log.json 被复制到 dist/git-log.json，即与 index.js 同目录
    const candidates = [
      path.resolve(__dirname, "./git-log.json"),           // dist/git-log.json (生产环境)
      path.resolve(__dirname, "../dist/git-log.json"),     // 备用
      path.resolve(__dirname, "../server/git-log.json"),   // 开发环境
      "/home/ubuntu/haoyouji-web/dist/git-log.json",      // 绝对路径备用
    ];

    let filePath: string | null = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    if (!filePath) {
      console.error("git-log.json not found. Searched:", candidates);
      return [];
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const commits: GitCommit[] = JSON.parse(raw);
    return commits;
  } catch (error) {
    console.error("Error reading git-log.json:", error);
    return [];
  }
}
