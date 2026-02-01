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
