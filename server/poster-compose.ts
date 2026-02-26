/**
 * 海报合成模块
 * 在服务器端使用sharp将二维码叠加到海报模板上
 * 
 * 方案：自动检测海报中的品红色(#FF00FF)占位符区域，
 * 精确替换为用户专属二维码。
 * 
 * 以后所有海报只需要在设计时放一个品红色方块作为二维码占位符，
 * 系统就能自动找到位置并精确替换，不需要手动配置坐标。
 * 
 * 如果没有品红色占位符，则使用白色方块检测作为降级方案。
 */
import sharp from 'sharp';
import QRCode from 'qrcode';
import { uploadImageToCOS } from './cos-upload';

/**
 * 在图片中检测特定颜色的矩形占位符区域
 * @param imageBuffer 图片Buffer
 * @param targetColor 目标颜色 {r, g, b}
 * @param tolerance 颜色容差（0-255）
 * @returns 占位符区域 {x, y, width, height} 或 null
 */
async function detectPlaceholder(
  imageBuffer: Buffer,
  targetColor: { r: number; g: number; b: number },
  tolerance: number = 30
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const { width, height, channels } = info;
    console.log(`[占位符检测] 图片尺寸: ${width}x${height}, 通道数: ${channels}`);
    
    // 扫描所有像素，找到匹配目标颜色的像素
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let matchCount = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // 检查是否匹配目标颜色
        if (
          Math.abs(r - targetColor.r) <= tolerance &&
          Math.abs(g - targetColor.g) <= tolerance &&
          Math.abs(b - targetColor.b) <= tolerance
        ) {
          matchCount++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    if (matchCount < 100) {
      console.log(`[占位符检测] 匹配像素数太少: ${matchCount}，未找到占位符`);
      return null;
    }
    
    const regionWidth = maxX - minX + 1;
    const regionHeight = maxY - minY + 1;
    
    console.log(`[占位符检测] 找到占位符区域: x=${minX}, y=${minY}, ${regionWidth}x${regionHeight}, 匹配像素: ${matchCount}`);
    
    return {
      x: minX,
      y: minY,
      width: regionWidth,
      height: regionHeight,
    };
  } catch (error) {
    console.error('[占位符检测] 失败:', error);
    return null;
  }
}

/**
 * 为用户合成带二维码的海报
 * 自动检测海报中的占位符区域并精确替换为二维码
 * 
 * 检测优先级：
 * 1. 品红色(#FF00FF)占位符 - 推荐方式
 * 2. 白色(#FFFFFF)占位符（仅在底部区域搜索）- 降级方案
 * 3. 使用手动配置的坐标 - 最终降级
 * 
 * @param templateUrl 海报模板URL（COS上的）
 * @param inviteCode 用户邀请码
 * @param fallbackConfig 降级用的手动坐标配置
 * @returns 合成后的海报COS URL
 */
export async function composePosterWithQR(
  templateUrl: string,
  inviteCode: string,
  fallbackConfig: { x: number; y: number; size: number }
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
    
    // 获取模板尺寸
    const metadata = await sharp(templateBuffer).metadata();
    console.log(`[海报合成] 模板尺寸: ${metadata.width}x${metadata.height}`);
    
    // 2. 自动检测占位符区域
    let placeholder: { x: number; y: number; width: number; height: number } | null = null;
    
    // 方案1: 检测品红色占位符 (#FF00FF)
    console.log('[海报合成] 尝试检测品红色占位符...');
    placeholder = await detectPlaceholder(templateBuffer, { r: 255, g: 0, b: 255 }, 30);
    
    if (!placeholder) {
      // 方案2: 检测白色占位符（仅在图片底部30%区域）
      console.log('[海报合成] 未找到品红色占位符，尝试检测底部白色区域...');
      
      // 裁剪底部30%区域进行检测
      const imgHeight = metadata.height || 1343;
      const imgWidth = metadata.width || 750;
      const cropTop = Math.floor(imgHeight * 0.7);
      const cropRight = Math.floor(imgWidth * 0.5); // 只搜索右半部分
      
      const bottomRightBuffer = await sharp(templateBuffer)
        .extract({
          left: cropRight,
          top: cropTop,
          width: imgWidth - cropRight,
          height: imgHeight - cropTop,
        })
        .toBuffer();
      
      const whiteRegion = await detectPlaceholder(bottomRightBuffer, { r: 255, g: 255, b: 255 }, 15);
      
      if (whiteRegion && whiteRegion.width > 50 && whiteRegion.height > 50) {
        // 转换回原始坐标
        placeholder = {
          x: whiteRegion.x + cropRight,
          y: whiteRegion.y + cropTop,
          width: whiteRegion.width,
          height: whiteRegion.height,
        };
        console.log(`[海报合成] 找到白色占位符: x=${placeholder.x}, y=${placeholder.y}, ${placeholder.width}x${placeholder.height}`);
      }
    }
    
    // 方案3: 使用降级配置
    if (!placeholder) {
      console.log('[海报合成] 未检测到占位符，使用降级坐标配置');
      placeholder = {
        x: fallbackConfig.x,
        y: fallbackConfig.y,
        width: fallbackConfig.size,
        height: fallbackConfig.size,
      };
    }
    
    // 3. 生成二维码，大小匹配占位符
    const qrSize = Math.min(placeholder.width, placeholder.height);
    const inviteLink = `https://jiangyuchen.cn/login?invite=${inviteCode}`;
    const qrPngBuffer = await QRCode.toBuffer(inviteLink, {
      type: 'png',
      width: qrSize,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
    console.log(`[海报合成] 二维码生成完成, 大小: ${qrSize}x${qrSize}`);
    
    // 调整二维码尺寸精确匹配占位符
    const qrResized = await sharp(qrPngBuffer)
      .resize(placeholder.width, placeholder.height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    
    // 4. 合成：将二维码精确放在占位符位置
    const composedBuffer = await sharp(templateBuffer)
      .composite([
        {
          input: qrResized,
          left: placeholder.x,
          top: placeholder.y,
        }
      ])
      .jpeg({ quality: 92 })
      .toBuffer();
    
    console.log('[海报合成] 合成完成, 大小:', composedBuffer.length);
    
    // 5. 上传到COS
    const cosUrl = await uploadImageToCOS(
      composedBuffer, 
      'posters', 
      `posters/composed/invite-${inviteCode}-${Date.now()}.jpg`
    );
    console.log('[海报合成] 上传COS成功:', cosUrl);
    
    return cosUrl;
  } catch (error) {
    console.error('[海报合成] 失败:', error);
    throw error;
  }
}
