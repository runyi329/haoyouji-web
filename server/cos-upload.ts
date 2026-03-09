import COS from 'cos-nodejs-sdk-v5';
import crypto from 'crypto';

const COS_SECRET_ID = process.env.COS_SECRET_ID!;
const COS_SECRET_KEY = process.env.COS_SECRET_KEY!;
const BUCKET = process.env.COS_BUCKET || 'haoyouji-images-1396946788';
const REGION = process.env.COS_REGION || 'ap-shanghai';

const cos = new COS({
  SecretId: COS_SECRET_ID,
  SecretKey: COS_SECRET_KEY,
});

/**
 * 上传图片到腾讯云COS
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
    
    // 生成唯一文件名
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    const timestamp = Date.now();
    const ext = contentType.split('/')[1] || 'jpg';
    const key = filename || `${folder}/${timestamp}-${hash}.${ext}`;
    
    // 上传到COS
    const result = await cos.putObject({
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
 * 批量上传图片
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
