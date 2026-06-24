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
  folder: 'avatars' | 'ledger-photos' | 'payment-qrcodes' | 'reimbursement-vouchers' | 'posters' | 'lottery-images' | 'ag-prompts' | 'beauty-showcase' | 'signatures' | 'yaban-shop' | 'wecom-materials' = 'avatars',
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

    // wecom-materials 文件夹的图片不转WebP（企微不支持WebP格式）
    // 其他文件夹自动压缩为 WebP
    if (folder !== 'wecom-materials') {
      const compressed = await compressImageToWebP(buffer, contentType);
      buffer = compressed.buffer;
      contentType = compressed.contentType;
    } else {
      // wecom-materials: 将图片统一转换为JPG（企微支持JPG/PNG/GIF/BMP）
      try {
        const jpgBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
        buffer = jpgBuffer;
        contentType = 'image/jpeg';
        console.log(`[COS] wecom-materials图片转JPG: ${Math.round(jpgBuffer.length/1024)}KB`);
      } catch (err) {
        console.warn('[COS] wecom-materials图片转JPG失败，使用原图:', err);
      }
    }
    
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
 * 上传任意文件到COS（不压缩，原样上传）
 * 用于 PDF、PPT、Excel 等非图片文件
 */
export async function uploadFileToCOS(
  fileData: string | Buffer,
  folder: string,
  filename: string,
  contentType: string
): Promise<string> {
  try {
    let buffer: Buffer;
    if (typeof fileData === 'string') {
      // base64
      const matches = fileData.match(/^data:[^;]+;base64,(.+)$/);
      buffer = Buffer.from(matches ? matches[1] : fileData, 'base64');
    } else {
      buffer = fileData;
    }
    const timestamp = Date.now();
    const key = `${folder}/${timestamp}-${filename}`;
    await cos.putObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`;
    console.log('[COS] 文件上传成功:', url);
    return url;
  } catch (error) {
    console.error('[COS] 文件上传失败:', error);
    throw new Error(`文件上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
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
  folder: 'avatars' | 'ledger-photos' | 'payment-qrcodes' | 'reimbursement-vouchers' | 'posters' | 'beauty-showcase' | 'wecom-materials' = 'avatars'
): Promise<string[]> {
  const results = await Promise.all(
    images.map(img => uploadImageToCOS(img.data, folder, img.filename))
  );
  return results;
}


// ============================================================
// 牙伴医学影像分层存储（缩略图 + 高清/无损 双轨）
// ============================================================

/**
 * 影像高清份的处理档位
 * - lossless: 完全无损，原字节原格式直传（X光/根尖片/全景片/CBCT截图/内窥镜等诊断级）
 * - lightCompress: 轻压缩，最长边2400px、WebP质量92（口内照/面像照/对比照等照片类）
 * - documentCompress: 文档档，最长边2000px、质量90（知情同意书等）
 * - rawFile: 原文件直传，不做任何图像处理（CBCT原始数据/口扫stl/DICOM等专业格式）
 */
export type YabanMediaTier = 'lossless' | 'lightCompress' | 'documentCompress' | 'rawFile';

const THUMB_MAX = 400;       // 缩略图最长边
const THUMB_QUALITY = 70;    // 缩略图WebP质量

function parseToBuffer(data: string | Buffer): { buffer: Buffer; mime: string } {
  if (typeof data !== 'string') {
    return { buffer: data, mime: 'application/octet-stream' };
  }
  const matches = data.match(/^data:([^;]+);base64,(.+)$/);
  if (matches) {
    return { buffer: Buffer.from(matches[2], 'base64'), mime: matches[1] };
  }
  // 纯base64
  return { buffer: Buffer.from(data, 'base64'), mime: 'application/octet-stream' };
}

function extFromMime(mime: string): string {
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('dicom')) return 'dcm';
  const tail = mime.split('/')[1];
  return tail ? tail.replace(/[^a-z0-9]/gi, '') || 'bin' : 'bin';
}

async function putBuffer(key: string, buffer: Buffer, contentType: string): Promise<string> {
  await cos.putObject({ Bucket: BUCKET, Region: REGION, Key: key, Body: buffer, ContentType: contentType });
  return `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`;
}

/**
 * 生成缩略图（WebP 400px）。对非位图（如stl/dicom）返回 null，由前端用占位图。
 */
async function makeThumb(buffer: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buffer)
      .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
  } catch {
    return null; // 非图像格式，无法生成缩略图
  }
}

export interface UploadMediaResult {
  fullUrl: string;
  thumbUrl: string | null;
  mime: string;
  fileSize: number;   // 高清份字节数
  isLossless: boolean;
}

/**
 * 上传一份牙伴影像到COS，按档位处理高清份，并生成缩略图。
 * @param data base64(dataURL或纯base64) 或 Buffer
 * @param tier 高清份处理档位
 * @param fileName 原始文件名（用于扩展名/直传文件命名）
 * @param folder COS子目录，默认 yaban-media
 */
export async function uploadYabanMedia(
  data: string | Buffer,
  tier: YabanMediaTier,
  fileName?: string,
  folder = 'yaban-media',
): Promise<UploadMediaResult> {
  const { buffer: rawBuffer, mime: rawMime } = parseToBuffer(data);
  const ts = Date.now();
  const hash = crypto.createHash('md5').update(rawBuffer).digest('hex').slice(0, 12);
  // 随机后缀：即使同毫秒、同内容（hash相同）也保证 key 唯一，避免并发上传相互覆盖
  const rand = crypto.randomBytes(4).toString('hex');

  let fullBuffer = rawBuffer;
  let fullMime = rawMime;
  let isLossless = false;

  if (tier === 'lossless' || tier === 'rawFile') {
    // 诊断级 / 专业格式：原字节原格式直传，绝不压缩
    fullBuffer = rawBuffer;
    fullMime = rawMime && rawMime !== 'application/octet-stream' ? rawMime : 'application/octet-stream';
    isLossless = true;
  } else if (tier === 'lightCompress') {
    // 照片类：最长边2400、WebP质量92（接近视觉无损）
    try {
      fullBuffer = await sharp(rawBuffer)
        .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 92 })
        .toBuffer();
      fullMime = 'image/webp';
    } catch {
      fullBuffer = rawBuffer; fullMime = rawMime; isLossless = true; // 压缩失败兜底原图
    }
  } else {
    // documentCompress：最长边2000、质量90
    try {
      fullBuffer = await sharp(rawBuffer)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer();
      fullMime = 'image/webp';
    } catch {
      fullBuffer = rawBuffer; fullMime = rawMime; isLossless = true;
    }
  }

  // 高清份的key：rawFile保留原扩展名，其余按mime
  const safeName = (fileName || 'file').replace(/[^\w.\-]/g, '_');
  const fullExt = tier === 'rawFile' ? (safeName.split('.').pop() || extFromMime(fullMime)) : extFromMime(fullMime);
  const fullKey = `${folder}/${ts}-${hash}-${rand}-full.${fullExt}`;
  const fullUrl = await putBuffer(fullKey, fullBuffer, fullMime);

  // 缩略图（专业格式可能为null）
  const thumbBuffer = await makeThumb(rawBuffer);
  let thumbUrl: string | null = null;
  if (thumbBuffer) {
    const thumbKey = `${folder}/${ts}-${hash}-${rand}-thumb.webp`;
    thumbUrl = await putBuffer(thumbKey, thumbBuffer, 'image/webp');
  }

  return { fullUrl, thumbUrl, mime: fullMime, fileSize: fullBuffer.length, isLossless };
}

/**
 * 删除一条影像在COS上的高清份与缩略图
 */
export async function deleteYabanMedia(urls: Array<string | null | undefined>): Promise<void> {
  for (const url of urls) {
    if (!url) continue;
    try {
      const key = new URL(url).pathname.substring(1);
      await cos.deleteObject({ Bucket: BUCKET, Region: REGION, Key: key });
    } catch (e) {
      console.warn('[COS] 删除影像文件失败（忽略）:', url, e);
    }
  }
}
