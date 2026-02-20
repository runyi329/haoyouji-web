import { createPosterFavoritesTable } from './server/db-poster-favorites';

async function initTable() {
  try {
    console.log('开始创建 poster_favorites 表...');
    await createPosterFavoritesTable();
    console.log('✓ poster_favorites 表创建成功！');
    process.exit(0);
  } catch (error) {
    console.error('✗ 创建表失败:', error);
    process.exit(1);
  }
}

initTable();
