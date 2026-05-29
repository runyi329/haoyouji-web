/**
 * 世界杯赔率抓取服务
 * 数据来源：wc-2026.com（聚合 Pinnacle + William Hill）
 * 抓取频率：4小时一次
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getDb } from './db';
import { wcOddsSnapshots, wcOddsRecords } from '../drizzle/schema';

// 48支球队的国家代码映射
const TEAM_CODE_MAP: Record<string, string> = {
  '西班牙': 'ES', '法国': 'FR', '英格兰': 'GB-ENG', '巴西': 'BR',
  '阿根廷': 'AR', '葡萄牙': 'PT', '德国': 'DE', '荷兰': 'NL',
  '挪威': 'NO', '比利时': 'BE', '哥伦比亚': 'CO', '摩洛哥': 'MA',
  '日本': 'JP', '美国': 'US', '瑞士': 'CH', '乌拉圭': 'UY',
  '墨西哥': 'MX', '厄瓜多尔': 'EC', '克罗地亚': 'HR', '土耳其': 'TR',
  '塞内加尔': 'SN', '瑞典': 'SE', '奥地利': 'AT', '苏格兰': 'GB-SCT',
  '加拿大': 'CA', '科特迪瓦': 'CI', '巴拉圭': 'PY', '捷克': 'CZ',
  '埃及': 'EG', '波黑': 'BA', '韩国': 'KR', '阿尔及利亚': 'DZ',
  '加纳': 'GH', '澳大利亚': 'AU', '突尼斯': 'TN', '伊朗': 'IR',
  '刚果民主共和国': 'CD', '南非': 'ZA', '沙特阿拉伯': 'SA',
  '巴拿马': 'PA', '卡塔尔': 'QA', '佛得角': 'CV', '新西兰': 'NZ',
  '伊拉克': 'IQ', '乌兹别克斯坦': 'UZ', '库拉索': 'CW',
  '约旦': 'JO', '海地': 'HT',
};

export interface OddsTeam {
  rank: number;
  teamName: string;
  teamCode: string;
  pinnacleOdds: number | null;
  williamHillOdds: number | null;
}

/**
 * 从 wc-2026.com 抓取全部48队赔率
 */
export async function scrapeWcOdds(): Promise<OddsTeam[]> {
  const response = await axios.get('https://wc-2026.com/winner-odds/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    timeout: 20000,
  });

  const $ = cheerio.load(response.data);
  const teams: OddsTeam[] = [];

  // 找到赔率表格（第一个table，包含49行：1行表头 + 48行数据）
  const table = $('table').first();
  table.find('tr').each((i, row) => {
    if (i === 0) return; // 跳过表头
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    const rankAndName = $(cells[0]).text().trim();
    // 格式如 "1\n西班牙" 或 "1西班牙"
    const rankMatch = rankAndName.match(/^(\d+)/);
    const rank = rankMatch ? parseInt(rankMatch[1]) : i;
    // 提取球队名（去除数字和空白）
    const teamName = rankAndName.replace(/^\d+\s*/, '').trim();

    const pinnacleText = $(cells[1]).text().replace(/[↑↓\s]/g, '').trim();
    const whText = $(cells[2]).text().replace(/[↑↓\s]/g, '').trim();

    const pinnacleOdds = pinnacleText ? parseFloat(pinnacleText) : null;
    const williamHillOdds = whText ? parseFloat(whText) : null;

    if (teamName && (pinnacleOdds || williamHillOdds)) {
      teams.push({
        rank,
        teamName,
        teamCode: TEAM_CODE_MAP[teamName] || '',
        pinnacleOdds: isNaN(pinnacleOdds!) ? null : pinnacleOdds,
        williamHillOdds: isNaN(williamHillOdds!) ? null : williamHillOdds,
      });
    }
  });

  return teams;
}

/**
 * 抓取并保存到数据库
 */
export async function fetchAndSaveOdds(): Promise<{ snapshotId: number; teamCount: number }> {
  const teams = await scrapeWcOdds();
  if (teams.length === 0) throw new Error('未抓取到任何球队数据');

  // 创建快照记录
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const [snapshot] = await db.insert(wcOddsSnapshots).values({
    source: 'wc-2026.com',
    teamCount: teams.length,
  });
  const snapshotId = (snapshot as any).insertId as number;

  // 批量插入球队赔率
  await db.insert(wcOddsRecords).values(
    teams.map(t => ({
      snapshotId,
      rank: t.rank,
      teamName: t.teamName,
      teamCode: t.teamCode,
      pinnacleOdds: t.pinnacleOdds?.toString(),
      williamHillOdds: t.williamHillOdds?.toString(),
    }))
  );

  console.log(`[WC Odds] 快照 #${snapshotId} 已保存，共 ${teams.length} 支球队`);
  return { snapshotId, teamCount: teams.length };
}
