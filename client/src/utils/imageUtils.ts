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
 * 图片压缩配置
 */
export const IMAGE_COMPRESS_CONFIG = {
  // 头像：64x64，质量 60%，预计 2-5KB
  avatar: { maxSize: 64, quality: 0.6 },
  // 缩略图：200x200，质量 70%，预计 10-30KB
  thumbnail: { maxSize: 200, quality: 0.7 },
  // 普通图片：800x800，质量 80%，预计 50-150KB
  normal: { maxSize: 800, quality: 0.8 },
  // 高清图片：1200x1200，质量 85%，预计 100-300KB
  hd: { maxSize: 1200, quality: 0.85 },
  // 最大文件大小限制（字节）
  maxFileSizeBytes: 500 * 1024, // 500KB
};

/**
 * 通用图片压缩函数 - 自动压缩任何图片
 * @param input File 或 Blob 对象
 * @param type 压缩类型：'avatar' | 'thumbnail' | 'normal' | 'hd'
 * @returns Promise<{ base64: string, blob: Blob, size: number }>
 */
export const autoCompressImage = async (
  input: File | Blob,
  type: 'avatar' | 'thumbnail' | 'normal' | 'hd' = 'normal'
): Promise<{ base64: string; blob: Blob; size: number }> => {
  const config = IMAGE_COMPRESS_CONFIG[type];
  const { maxSize, quality } = config;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(input);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // 计算目标尺寸（保持比例）
      let width = img.width;
      let height = img.height;

      if (type === 'avatar') {
        // 头像：裁剪为正方形
        width = maxSize;
        height = maxSize;
      } else {
        // 其他类型：保持比例缩放
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法获取 canvas context'));
        return;
      }

      if (type === 'avatar') {
        // 头像：居中裁剪为正方形
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, width, height);
      } else {
        // 其他类型：直接缩放
        ctx.drawImage(img, 0, 0, width, height);
      }

      // 转换为 base64
      const base64 = canvas.toDataURL('image/jpeg', quality);

      // 转换为 Blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('转换 Blob 失败'));
            return;
          }

          const originalSize = input instanceof File ? input.size : input.size;
          console.log(
            `[图片压缩] 类型: ${type}, 原始: ${(originalSize / 1024).toFixed(1)}KB, ` +
            `压缩后: ${(blob.size / 1024).toFixed(1)}KB, ` +
            `尺寸: ${img.width}x${img.height} → ${width}x${height}`
          );

          resolve({ base64, blob, size: blob.size });
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };

    img.src = url;
  });
};

/**
 * 压缩 File 对象并返回新的 File
 * @param file 原始文件
 * @param type 压缩类型
 * @returns Promise<File> 压缩后的文件
 */
export const compressFileImage = async (
  file: File,
  type: 'avatar' | 'thumbnail' | 'normal' | 'hd' = 'normal'
): Promise<File> => {
  // 如果不是图片，直接返回
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // 如果文件已经很小，不需要压缩
  const config = IMAGE_COMPRESS_CONFIG[type];
  if (file.size <= IMAGE_COMPRESS_CONFIG.maxFileSizeBytes) {
    console.log(`[图片压缩] 文件已经很小 (${(file.size / 1024).toFixed(1)}KB)，跳过压缩`);
    // 但如果是头像类型，仍然需要压缩到指定尺寸
    if (type !== 'avatar') {
      return file;
    }
  }

  const { blob } = await autoCompressImage(file, type);
  
  // 创建新的 File 对象
  const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });

  return compressedFile;
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
