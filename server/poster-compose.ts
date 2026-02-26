/**
 * 海报合成模块
 * 在服务器端使用sharp将二维码叠加到海报模板上，
 * 并将"邀请人：[username]"动态替换为实际用户名。
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
 * 采样图片某一行的背景颜色（取指定区域两侧的像素平均值）
 */
function sampleRowBackground(
  rawData: Buffer,
  width: number,
  channels: number,
  y: number,
  leftX: number,
  rightX: number,
  sampleWidth: number = 5
): { leftBg: { r: number; g: number; b: number }; rightBg: { r: number; g: number; b: number } } {
  let lr = 0, lg = 0, lb = 0, rr = 0, rg = 0, rb = 0;
  
  for (let i = 0; i < sampleWidth; i++) {
    const lIdx = (y * width + Math.max(0, leftX - sampleWidth + i)) * channels;
    lr += rawData[lIdx]; lg += rawData[lIdx + 1]; lb += rawData[lIdx + 2];
    
    const rIdx = (y * width + Math.min(width - 1, rightX + 1 + i)) * channels;
    rr += rawData[rIdx]; rg += rawData[rIdx + 1]; rb += rawData[rIdx + 2];
  }
  
  return {
    leftBg: { r: Math.round(lr / sampleWidth), g: Math.round(lg / sampleWidth), b: Math.round(lb / sampleWidth) },
    rightBg: { r: Math.round(rr / sampleWidth), g: Math.round(rg / sampleWidth), b: Math.round(rb / sampleWidth) },
  };
}

/**
 * 生成背景覆盖层：用渐变背景色覆盖原有文字区域
 * 通过采样原图两侧背景色并线性插值，实现自然的覆盖效果
 */
async function generateBackgroundCover(
  templateBuffer: Buffer,
  coverArea: { x: number; y: number; width: number; height: number }
): Promise<Buffer> {
  const { data: rawData, info } = await sharp(templateBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, channels } = info;
  const coverWidth = coverArea.width;
  const coverHeight = coverArea.height;
  
  // 创建覆盖层的像素数据（RGB，无alpha）
  const coverData = Buffer.alloc(coverWidth * coverHeight * 3);
  
  for (let dy = 0; dy < coverHeight; dy++) {
    const imgY = coverArea.y + dy;
    const { leftBg, rightBg } = sampleRowBackground(rawData, width, channels, imgY, coverArea.x, coverArea.x + coverWidth);
    
    for (let dx = 0; dx < coverWidth; dx++) {
      const t = dx / coverWidth;
      const idx = (dy * coverWidth + dx) * 3;
      coverData[idx] = Math.round(leftBg.r * (1 - t) + rightBg.r * t);
      coverData[idx + 1] = Math.round(leftBg.g * (1 - t) + rightBg.g * t);
      coverData[idx + 2] = Math.round(leftBg.b * (1 - t) + rightBg.b * t);
    }
  }
  
  return sharp(coverData, {
    raw: { width: coverWidth, height: coverHeight, channels: 3 }
  }).png().toBuffer();
}

/**
 * 生成邀请人文字的SVG图片
 * 使用SVG渲染中文文字，确保跨平台兼容
 */
async function generateInviterTextImage(
  username: string,
  width: number,
  height: number,
  fontSize: number = 16
): Promise<Buffer> {
  const text = `邀请人：${username}`;
  
  // 使用SVG渲染文字
  const svgText = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .inviter-text {
          fill: #e6afa0;
          font-size: ${fontSize}px;
          font-family: "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif;
          dominant-baseline: central;
          text-anchor: middle;
        }
      </style>
      <text x="${width / 2}" y="${height / 2}" class="inviter-text">${text}</text>
    </svg>
  `;
  
  return sharp(Buffer.from(svgText)).png().toBuffer();
}

/**
 * 为用户合成带二维码和邀请人名称的海报
 * 自动检测海报中的占位符区域并精确替换为二维码，
 * 同时将模板中的"邀请人：[username]"替换为实际用户名。
 * 
 * 检测优先级：
 * 1. 品红色(#FF00FF)占位符 - 推荐方式
 * 2. 白色(#FFFFFF)占位符（仅在底部区域搜索）- 降级方案
 * 3. 使用手动配置的坐标 - 最终降级
 * 
 * @param templateUrl 海报模板URL（COS上的）
 * @param inviteCode 用户邀请码
 * @param fallbackConfig 降级用的手动坐标配置
 * @param username 用户名（用于显示邀请人）
 * @returns 合成后的海报COS URL
 */
export async function composePosterWithQR(
  templateUrl: string,
  inviteCode: string,
  fallbackConfig: { x: number; y: number; size: number },
  username?: string
): Promise<string> {
  try {
    console.log('[海报合成] 开始合成海报...');
    console.log('[海报合成] 模板URL:', templateUrl);
    console.log('[海报合成] 邀请码:', inviteCode);
    console.log('[海报合成] 用户名:', username || '(未提供)');
    
    // 1. 下载海报模板
    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error(`下载模板失败: ${response.status}`);
    }
    const templateBuffer = Buffer.from(await response.arrayBuffer());
    console.log('[海报合成] 模板下载完成, 大小:', templateBuffer.length);
    
    // 获取模板尺寸
    const metadata = await sharp(templateBuffer).metadata();
    const imgWidth = metadata.width || 750;
    const imgHeight = metadata.height || 1343;
    console.log(`[海报合成] 模板尺寸: ${imgWidth}x${imgHeight}`);
    
    // 2. 自动检测占位符区域
    let placeholder: { x: number; y: number; width: number; height: number } | null = null;
    
    // 方案1: 检测品红色占位符 (#FF00FF)
    console.log('[海报合成] 尝试检测品红色占位符...');
    placeholder = await detectPlaceholder(templateBuffer, { r: 255, g: 0, b: 255 }, 30);
    
    if (!placeholder) {
      // 方案2: 检测白色占位符（仅在图片底部30%区域）
      console.log('[海报合成] 未找到品红色占位符，尝试检测底部白色区域...');
      
      // 裁剪底部30%区域进行检测
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
    
    // 4. 准备合成层列表
    const compositeInputs: sharp.OverlayOptions[] = [];
    
    // 4a. 如果提供了用户名，覆盖原有的"邀请人：[username]"文字
    if (username) {
      // 邀请人文字区域坐标（基于模板分析）
      // 原文字位置: X 540-693, Y 1093-1125
      // 覆盖区域留些余量
      const textCoverArea = {
        x: 530,
        y: 1090,
        width: 190,
        height: 38,
      };
      
      try {
        // 生成背景覆盖层（采样原图背景色渐变填充）
        console.log('[海报合成] 生成邀请人文字背景覆盖...');
        const bgCover = await generateBackgroundCover(templateBuffer, textCoverArea);
        compositeInputs.push({
          input: bgCover,
          left: textCoverArea.x,
          top: textCoverArea.y,
        });
        
        // 生成新的邀请人文字
        console.log('[海报合成] 生成邀请人文字:', username);
        const textImage = await generateInviterTextImage(
          username,
          textCoverArea.width,
          textCoverArea.height,
          16
        );
        compositeInputs.push({
          input: textImage,
          left: textCoverArea.x,
          top: textCoverArea.y,
        });
        
        console.log('[海报合成] 邀请人文字覆盖准备完成');
      } catch (textError) {
        console.error('[海报合成] 邀请人文字覆盖失败，跳过:', textError);
        // 文字覆盖失败不影响二维码合成
      }
    }
    
    // 4b. 叠加二维码
    compositeInputs.push({
      input: qrResized,
      left: placeholder.x,
      top: placeholder.y,
    });
    
    // 5. 执行合成
    const composedBuffer = await sharp(templateBuffer)
      .composite(compositeInputs)
      .jpeg({ quality: 92 })
      .toBuffer();
    
    console.log('[海报合成] 合成完成, 大小:', composedBuffer.length);
    
    // 6. 上传到COS
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
