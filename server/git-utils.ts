import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface GitCommit {
  hash: string;
  author: string;
  date: string; // ISO 8601 format
  message: string;
  type: string; // e.g., 'feat', 'fix', 'docs'
  scope: string; // e.g., 'InterestManagePage', 'LedgerDetail'
  cleanMessage: string; // message without type and scope prefix
}

// 辅助函数：根据提交信息判断类型和范围
function parseCommitMessage(message: string): { type: string; scope: string; cleanMessage: string } {
  // 匹配 Conventional Commits 规范: type(scope): subject
  const regex = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(([^)]*)\))?:\s*(.*)/;
  const match = message.match(regex);

  if (match) {
    return {
      type: match[1],
      scope: match[3] || "", // scope might be undefined
      cleanMessage: match[4].trim(),
    };
  } else {
    // 如果不符合 Conventional Commits 规范，则使用默认值
    return {
      type: "chore", // 默认归类为杂项
      scope: "",
      cleanMessage: message.trim(),
    };
  }
}

export async function getGitCommits(): Promise<GitCommit[]> {
  try {
    // --pretty=format: 用于自定义输出格式
    // %H: commit hash
    // %an: author name
    // %ad: author date (format: ISO 8601 strict)
    // %s: subject (commit message title)
    // %b: body (commit message body)
    // %n: newline
    const { stdout } = await execAsync(
      `git log --all --pretty=format:"%H%n%an%n%ad%n%s%n%b%n---COMMIT-END---"`,
      { cwd: "/home/ubuntu/haoyouji-web-full" } // 确保在正确的仓库目录下执行
    );

    const commitStrings = stdout.split("---COMMIT-END---\n").filter(Boolean);
    const commits: GitCommit[] = [];

    for (const commitStr of commitStrings) {
      const parts = commitStr.trim().split("\n");
      if (parts.length >= 4) {
        const [hash, author, date, subject, ...bodyLines] = parts;
        const fullMessage = [subject, ...bodyLines].join("\n");
        const { type, scope, cleanMessage } = parseCommitMessage(fullMessage);

        commits.push({
          hash,
          author,
          date,
          message: fullMessage,
          type,
          scope,
          cleanMessage,
        });
      }
    }
    return commits;
  } catch (error) {
    console.error("Error getting git commits:", error);
    return [];
  }
}
