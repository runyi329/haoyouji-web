import { uploadImageToCOS } from './server/cos-upload';
import fs from 'fs';
import path from 'path';

async function uploadPoster() {
  try {
    // 读取缩略图
    const thumbnailPath = '/home/ubuntu/poster_v2_01_ktv_thumbnail.jpg';
    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    
    // 读取压缩后的原图
    const fullPath = '/home/ubuntu/poster_v2_01_ktv_compressed.jpg';
    const fullBuffer = fs.readFileSync(fullPath);
    
    console.log('开始上传缩略图...');
    const thumbnailUrl = await uploadImageToCOS(
      thumbnailBuffer,
      'posters',
      `posters/ktv-series-01-thumbnail-${Date.now()}.jpg`
    );
    console.log('缩略图URL:', thumbnailUrl);
    
    console.log('开始上传原图...');
    const fullUrl = await uploadImageToCOS(
      fullBuffer,
      'posters',
      `posters/ktv-series-01-full-${Date.now()}.jpg`
    );
    console.log('原图URL:', fullUrl);
    
    // 保存URL到文件
    const urls = {
      thumbnail: thumbnailUrl,
      full: fullUrl,
      title: 'KTV版宣传海报',
      series: '脉动网宣传系列',
      category: 'marketing',
    };
    
    fs.writeFileSync(
      '/home/ubuntu/poster_urls.json',
      JSON.stringify(urls, null, 2)
    );
    
    console.log('\n上传完成！URL已保存到 /home/ubuntu/poster_urls.json');
  } catch (error) {
    console.error('上传失败:', error);
    process.exit(1);
  }
}

uploadPoster();
