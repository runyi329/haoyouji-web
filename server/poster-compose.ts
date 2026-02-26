/**
 * 海报合成模块
 * 在服务器端使用sharp将二维码叠加到海报模板上
 * 避免前端跨域问题
 */
import sharp from 'sharp';
import QRCode from 'qrcode';
import { uploadImageToCOS } from './cos-upload';

// 使用node-fetch的全局fetch（Node 18+内置）

/**
 * 为用户合成带二维码的海报
 * @param templateUrl 海报模板URL（COS上的）
 * @param inviteCode 用户邀请码
 * @param qrConfig 二维码位置配置
 * @returns 合成后的海报COS URL
 */
export async function composePosterWithQR(
  templateUrl: string,
  inviteCode: string,
  qrConfig: { x: number; y: number; size: number }
): Promise<string> {
  try {
    console.log('[海报合成] 开始合成海报...');
    console.log('[海报合成] 模板URL:', templateUrl);
    console.log('[海报合成] 邀请码:', inviteCode);
    
    // 1. 下载海报模板
    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error(`下载模板失败: ${response.status}`);
    }
    const templateBuffer = Buffer.from(await response.arrayBuffer());
    console.log('[海报合成] 模板下载完成, 大小:', templateBuffer.length);
    
    // 2. 生成二维码PNG Buffer
    const inviteLink = `https://jiangyuchen.cn/login?invite=${inviteCode}`;
    const qrPngBuffer = await QRCode.toBuffer(inviteLink, {
      type: 'png',
      width: qrConfig.size,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
    console.log('[海报合成] 二维码生成完成, 大小:', qrPngBuffer.length);
    
    // 3. 调整二维码尺寸
    const qrResized = await sharp(qrPngBuffer)
      .resize(qrConfig.size, qrConfig.size)
      .png()
      .toBuffer();
    
    // 4. 使用sharp合成：将二维码叠加到模板上
    const composedBuffer = await sharp(templateBuffer)
      .composite([
        {
          input: qrResized,
          left: qrConfig.x,
          top: qrConfig.y,
        }
      ])
      .jpeg({ quality: 90 })
      .toBuffer();
    
    console.log('[海报合成] 合成完成, 大小:', composedBuffer.length);
    
    // 5. 上传到COS
    const cosUrl = await uploadImageToCOS(
      composedBuffer, 
      'posters', 
      `posters/invite-${inviteCode}-${Date.now()}.jpg`
    );
    console.log('[海报合成] 上传COS成功:', cosUrl);
    
    return cosUrl;
  } catch (error) {
    console.error('[海报合成] 失败:', error);
    throw error;
  }
}
