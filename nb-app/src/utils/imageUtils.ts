/**
 * 图片压缩结果
 */
export interface CompressResult {
  blob: Blob;
  base64: string;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  quality?: number;
}

/**
 * 自动压缩图片到指定大小以内
 * @param file 原始文件
 * @param maxSizeBytes 最大文件大小（字节）
 * @param maxDimension 最大尺寸（宽或高）
 * @returns Promise<CompressResult> 压缩结果
 */
export const compressImage = async (
  file: File,
  maxSizeBytes: number,
  maxDimension: number = 4096
): Promise<CompressResult> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // 第一步：如果尺寸过大，先缩放
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height * maxDimension) / width;
          width = maxDimension;
        } else {
          width = (width * maxDimension) / height;
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法获取 canvas 上下文'));
        return;
      }

      // 使用更好的图片缩放质量
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // 判断输出格式（PNG 透明图保持 PNG，其他用 JPEG）
      const isPngWithAlpha = file.type === 'image/png' && hasTransparency(img, ctx, width, height);
      const exportType = isPngWithAlpha ? 'image/png' : 'image/jpeg';

      // 如果已经是 PNG 且没有透明度，尝试用 JPEG 压缩
      const originalSize = file.size;

      // 如果原始文件已经符合要求，直接返回
      if (originalSize <= maxSizeBytes && width === img.width && height === img.height) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          resolve({
            blob: file,
            base64,
            compressed: false,
            originalSize,
            compressedSize: originalSize,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      // 需要压缩，从高质量开始逐步降低
      let quality = exportType === 'image/png' ? 1 : 0.95;
      const minQuality = 0.5; // 最低质量阈值
      const maxAttempts = 20; // 最大尝试次数，防止无限循环

      // 使用迭代而非递归，防止栈溢出
      const compressIterative = () => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const dataUrl = canvas.toDataURL(exportType, quality);
          const base64Data = dataUrl.split(',')[1];
          const blob = base64ToBlob(base64Data, exportType);

          // 如果大小符合要求或已达到最低质量
          if (blob.size <= maxSizeBytes || quality <= minQuality) {
            // 创建压缩后的 File 对象
            const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
              type: exportType,
            });

            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                blob: compressedFile,
                base64: reader.result as string,
                compressed: true,
                originalSize,
                compressedSize: blob.size,
                quality: exportType === 'image/png' ? undefined : quality,
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(compressedFile);
            return; // 退出函数
          }

          // 继续降低质量
          quality = Math.max(minQuality, quality - 0.05);
        }

        // 如果所有尝试都失败，使用最低质量返回
        const dataUrl = canvas.toDataURL(exportType, minQuality);
        const base64Data = dataUrl.split(',')[1];
        const blob = base64ToBlob(base64Data, exportType);
        const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
          type: exportType,
        });

        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            blob: compressedFile,
            base64: reader.result as string,
            compressed: true,
            originalSize,
            compressedSize: blob.size,
            quality: minQuality,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(compressedFile);
      };

      compressIterative();
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = URL.createObjectURL(file);
  });
};

/**
 * 检测 PNG 图片是否有透明通道
 */
function hasTransparency(
  img: HTMLImageElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 将 File 对象转换为 Base64 字符串
 * @param file File 对象
 * @returns Promise<string> Base64 字符串
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

/**
 * 将 Base64 字符串转换为 Blob 对象
 * @param base64Data Base64 编码的数据
 * @param mimeType MIME 类型
 * @returns Blob 对象
 */
export const base64ToBlob = (base64Data: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * 创建图片缩略图
 * @param base64Data 原图 Base64
 * @param mimeType MIME 类型
 * @param maxWidth 最大宽度，默认 200px
 * @returns Promise<string> 缩略图 Base64
 */
export const createThumbnail = (base64Data: string, mimeType: string, maxWidth: number = 200): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // 使用较低质量导出 JPEG 缩略图，或者保持原格式
      // 这里统一用 JPEG 以减小体积，除非是 PNG 透明图
      const exportType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(exportType, 0.7).split(',')[1]); // 返回不带前缀的 base64
    };
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
};

/**
 * 下载图片
 * @param mimeType 图片的 MIME 类型
 * @param base64Data 图片的 Base64 数据
 * @param filename 可选的文件名，如果不提供则自动生成
 */
export const downloadImage = (mimeType: string, base64Data: string, filename?: string) => {
  const blob = base64ToBlob(base64Data, mimeType);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;

  if (filename) {
    link.download = filename;
  } else {
    const extension = mimeType.split('/')[1] || 'png';
    link.download = `gemini-image-${Date.now()}.${extension}`;
  }

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * 在新标签页中打开图片
 * @param mimeType 图片的 MIME 类型
 * @param base64Data 图片的 Base64 数据
 */
export const openImageInNewTab = (mimeType: string, base64Data: string) => {
  const blob = base64ToBlob(base64Data, mimeType);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');

  // 延长 revoke 时间以确保图片在新标签页加载完成
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

/**
 * 批量下载图片数据集为 ZIP 文件（用于 AI-toolkit 训练）
 * @param parts 包含图片的 Part 数组
 * @param datasetName 数据集名称，默认为 'ai-toolkit-dataset'
 */
export const downloadDatasetZip = async (
  parts: Array<{ mimeType: string; data: string; prompt?: string }>,
  datasetName: string = 'ai-toolkit-dataset'
) => {
  try {
    // 动态导入 JSZip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // 过滤出有效的图片
    const imageParts = parts.filter(p => p.mimeType && p.data);

    if (imageParts.length === 0) {
      throw new Error('没有可下载的图片');
    }

    // 为每张图片创建文件
    imageParts.forEach((part, index) => {
      const extension = part.mimeType.split('/')[1] || 'png';
      const paddedIndex = String(index + 1).padStart(3, '0'); // 001, 002, ...
      const filename = `image_${paddedIndex}`;

      // 添加图片文件
      const blob = base64ToBlob(part.data, part.mimeType);
      zip.file(`${filename}.${extension}`, blob);

      // 添加对应的文本标注文件
      const caption = part.prompt || `Generated image ${index + 1}`;
      zip.file(`${filename}.txt`, caption);
    });

    // 生成 ZIP 文件
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // 下载 ZIP
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${datasetName}-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return true;
  } catch (error) {
    console.error('下载数据集失败:', error);
    throw error;
  }
};
