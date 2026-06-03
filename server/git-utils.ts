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
    // 读取构建时预生成的 git-log.json 文件
    // 服务器运行目录为 /home/ubuntu/haoyouji-web，__dirname 为 dist/
    const candidates = [
      path.resolve(__dirname, "../server/git-log.json"),
      path.resolve(__dirname, "./git-log.json"),
      path.resolve(__dirname, "../git-log.json"),
      "/home/ubuntu/haoyouji-web/server/git-log.json",
      "/home/ubuntu/haoyouji-web/git-log.json",
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
