/**
 * 图片处理工具函数
 * 提供图片压缩、格式转换等功能
 */

/**
 * 压缩图片
 * @param file 原始图片文件
 * @param maxWidth 最大宽度，默认800px
 * @param quality 压缩质量，0-1之间，默认0.7
 * @returns Promise<string> 返回base64格式的压缩后图片
 */
export const compressImage = (
  file: File,
  maxWidth: number = 800,
  quality: number = 0.7
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 计算压缩后的尺寸
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法获取canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // 转换为base64，使用指定的质量
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
  });
};

/**
 * 将Blob转换为base64字符串
 * @param blob Blob对象
 * @returns Promise<string> 返回base64格式的字符串
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (!base64String || typeof base64String !== 'string') {
        reject(new Error('转换失败：无效的base64数据'));
        return;
      }
      resolve(base64String);
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(blob);
  });
};

/**
 * 验证文件是否为图片
 * @param file 文件对象
 * @returns boolean 是否为图片
 */
export const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};

/**
 * 验证文件大小
 * @param file 文件对象
 * @param maxSizeMB 最大文件大小（MB），默认5MB
 * @returns boolean 是否符合大小限制
 */
export const validateFileSize = (file: File, maxSizeMB: number = 5): boolean => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
};

/**
 * 压缩头像图片为 64x64 像素
 * @param blob 原始图片 Blob
 * @param size 目标尺寸，默认 64
 * @param quality 压缩质量，默认 0.6
 * @returns Promise<string> 返回 base64 格式的压缩后图片
 */
export const compressAvatar = (
  blob: Blob,
  size: number = 64,
  quality: number = 0.6
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法获取 canvas context'));
        return;
      }
      
      // 计算裁剪区域（居中裁剪为正方形）
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;
      
      // 绘制压缩后的图片
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
      
      // 转换为 base64，使用 JPEG 格式和指定质量
      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      
      console.log(`[头像压缩] 原始大小: ${blob.size} 字节, 压缩后: ${compressedBase64.length} 字符`);
      
      resolve(compressedBase64);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    
    img.src = url;
  });
};
