import COS from 'cos-nodejs-sdk-v5';
import crypto from 'crypto';
import sharp from 'sharp';

const COS_SECRET_ID = process.env.COS_SECRET_ID!;
const COS_SECRET_KEY = process.env.COS_SECRET_KEY!;
const BUCKET = process.env.COS_BUCKET || 'haoyouji-images-1396946788';
const REGION = process.env.COS_REGION || 'ap-shanghai';

const cos = new COS({
  SecretId: COS_SECRET_ID,
  SecretKey: COS_SECRET_KEY,
});

// 图片自动压缩配置
const IMAGE_COMPRESS_CONFIG = {
  maxWidth: 1200,    // 最大宽度（px）
  maxHeight: 1200,   // 最大高度（px）
  quality: 85,       // WebP 质量（1-100）
  minSizeKB: 200,    // 超过此大小才压缩（KB），小图直接上传
};

/**
 * 将图片自动压缩为 WebP 格式，限制最大尺寸
 * 仅对超过 minSizeKB 的图片进行压缩，GIF 跳过
 */
async function compressImageToWebP(
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string }> {
  // GIF 不压缩（避免丢失动画）
  if (contentType === 'image/gif') {
    return { buffer, contentType };
  }
  // 小于阈值的图片不压缩
  if (buffer.length < IMAGE_COMPRESS_CONFIG.minSizeKB * 1024) {
    return { buffer, contentType };
  }
  try {
    const compressed = await sharp(buffer)
      .resize(IMAGE_COMPRESS_CONFIG.maxWidth, IMAGE_COMPRESS_CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true, // 不放大小图
      })
      .webp({ quality: IMAGE_COMPRESS_CONFIG.quality })
      .toBuffer();

    const origKB = Math.round(buffer.length / 1024);
    const newKB = Math.round(compressed.length / 1024);
    const ratio = Math.round(compressed.length / buffer.length * 100);
    console.log(`[COS] 图片自动压缩: ${origKB}KB → ${newKB}KB (${ratio}%)`);
    return { buffer: compressed, contentType: 'image/webp' };
  } catch (err) {
    console.warn('[COS] 压缩失败，使用原图上传:', err);
    return { buffer, contentType };
  }
}

/**
 * 上传图片到腾讯云COS（自动压缩为WebP）
 * @param imageData base64编码的图片数据或Buffer
 * @param folder 存储文件夹 (avatars, ledger-photos等)
 * @param filename 可选的文件名,不提供则自动生成
 * @returns 上传后的公网URL
 */
export async function uploadImageToCOS(
  imageData: string | Buffer,
  folder: 'avatars' | 'ledger-photos' | 'payment-qrcodes' | 'reimbursement-vouchers' | 'posters' | 'lottery-images' = 'avatars',
  filename?: string
): Promise<string> {
  try {
    // 处理base64数据
    let buffer: Buffer;
    let contentType = 'image/jpeg';
    
    if (typeof imageData === 'string') {
      // 解析base64
      const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        contentType = `image/${matches[1]}`;
        buffer = Buffer.from(matches[2], 'base64');
      } else if (imageData.startsWith('data:')) {
        throw new Error('不支持的图片格式');
      } else {
        // 纯base64字符串
        buffer = Buffer.from(imageData, 'base64');
      }
    } else {
      buffer = imageData;
    }

    // 自动压缩图片为 WebP
    const compressed = await compressImageToWebP(buffer, contentType);
    buffer = compressed.buffer;
    contentType = compressed.contentType;
    
    // 生成唯一文件名
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    const timestamp = Date.now();
    const ext = contentType === 'image/webp' ? 'webp' : (contentType.split('/')[1] || 'jpg');
    const key = filename || `${folder}/${timestamp}-${hash}.${ext}`;
    
    // 上传到COS
    await cos.putObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    
    // 返回公网URL
    const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`;
    console.log('[COS] 上传成功:', url);
    return url;
    
  } catch (error) {
    console.error('[COS] 上传失败:', error);
    throw new Error(`图片上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 从COS删除文件
 * @param url 完整的COS URL
 */
export async function deleteImageFromCOS(url: string): Promise<void> {
  try {
    // 从URL提取Key
    const urlObj = new URL(url);
    const key = urlObj.pathname.substring(1); // 去掉开头的/
    
    await cos.deleteObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
    });
    
    console.log('[COS] 删除成功:', key);
  } catch (error) {
    console.error('[COS] 删除失败:', error);
    throw new Error(`图片删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 批量上传图片（自动压缩为WebP）
 * @param images 图片数据数组
 * @param folder 存储文件夹
 * @returns 上传后的URL数组
 */
export async function batchUploadImagesToCOS(
  images: Array<{ data: string | Buffer; filename?: string }>,
  folder: 'avatars' | 'ledger-photos' | 'payment-qrcodes' | 'reimbursement-vouchers' | 'posters' = 'avatars'
): Promise<string[]> {
  const results = await Promise.all(
    images.map(img => uploadImageToCOS(img.data, folder, img.filename))
  );
  return results;
}
