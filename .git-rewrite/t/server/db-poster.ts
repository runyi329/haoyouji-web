import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * 生成用户专属邀请海报
 * @param userId 用户ID
 * @param username 用户名
 * @returns 海报文件路径（相对于public目录）
 */
export async function generateInvitePoster(userId: number, username: string): Promise<string> {
  try {
    // 生成邀请链接
    const inviteUrl = `https://jiangyuchen.cn/invite?uid=${userId}`;
    
    // 海报模板路径
    const templatePath = path.join(process.cwd(), 'client/public/assets/poster_template.png');
    
    // 输出路径（保存到public/posters目录）
    const postersDir = path.join(process.cwd(), 'client/public/posters');
    await fs.mkdir(postersDir, { recursive: true });
    
    const outputFilename = `poster_${userId}_${Date.now()}.png`;
    const outputPath = path.join(postersDir, outputFilename);
    
    // Python脚本路径
    const scriptPath = path.join(process.cwd(), 'server/generate_poster.py');
    
    // 调用Python脚本生成海报
    const command = `python3.11 "${scriptPath}" "${username}" "${inviteUrl}" "${templatePath}" "${outputPath}"`;
    
    console.log('Generating poster with command:', command);
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      console.error('Poster generation stderr:', stderr);
    }
    if (stdout) {
      console.log('Poster generation stdout:', stdout);
    }
    
    // 返回相对路径（用于前端访问）
    return `/posters/${outputFilename}`;
  } catch (error) {
    console.error('Error generating poster:', error);
    throw new Error('Failed to generate invite poster');
  }
}
