import { compressImage, type CompressResult } from './imageUtils';

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_DIMENSION = 8192;

export type ImageValidationError =
  | 'not_image'
  | 'file_too_large'
  | 'total_too_large'
  | 'invalid_dimensions'
  | 'dimension_too_large'
  | 'pixels_too_large';

export type ValidationResult =
  | { ok: true; file?: File; compressed?: boolean }
  | { ok: false; error: ImageValidationError };

const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片尺寸'));
    };
    img.src = url;
  });
};

export const validateImageFile = async (
  file: File,
  currentTotalBytes: number
): Promise<{ ok: boolean; error?: ImageValidationError }> => {
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'not_image' };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'file_too_large' };
  }

  if (currentTotalBytes + file.size > MAX_TOTAL_IMAGE_BYTES) {
    return { ok: false, error: 'total_too_large' };
  }

  const { width, height } = await getImageDimensions(file);
  if (width <= 0 || height <= 0) {
    return { ok: false, error: 'invalid_dimensions' };
  }

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return { ok: false, error: 'dimension_too_large' };
  }

  if (width * height > MAX_IMAGE_PIXELS) {
    return { ok: false, error: 'pixels_too_large' };
  }

  return { ok: true };
};

/**
 * 验证并自动压缩图片
 * 如果图片过大（超过大小或尺寸限制），会自动压缩到符合要求
 * @param file 原始文件
 * @param currentTotalBytes 当前已上传的图片总大小
 * @returns Promise<ValidationResult>
 */
export const validateAndCompressImage = async (
  file: File,
  currentTotalBytes: number
): Promise<ValidationResult> => {
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'not_image' };
  }

  // 检查总大小限制（压缩前快速检查，避免处理明显超限的文件）
  const remainingSpace = MAX_TOTAL_IMAGE_BYTES - currentTotalBytes;
  if (remainingSpace <= 0) {
    return { ok: false, error: 'total_too_large' };
  }

  // 计算允许的最大单张大小（取两者中较小的一个）
  const maxAllowedSize = Math.min(MAX_IMAGE_BYTES, remainingSpace);

  // 如果文件已经符合要求，直接通过
  if (file.size <= maxAllowedSize) {
    const { width, height } = await getImageDimensions(file);

    // 检查尺寸限制
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      // 尺寸过大，需要压缩
      try {
        const result = await compressImage(file, maxAllowedSize, MAX_IMAGE_DIMENSION);
        // 再次检查压缩后的大小
        if (result.blob.size > maxAllowedSize) {
          return { ok: false, error: 'file_too_large' };
        }
        const compressedFile = new File([result.blob], file.name, { type: result.blob.type, lastModified: Date.now() });
        return { ok: true, file: compressedFile, compressed: result.compressed };
      } catch {
        return { ok: false, error: 'dimension_too_large' };
      }
    }

    if (width * height > MAX_IMAGE_PIXELS) {
      // 像素过多，需要压缩
      try {
        const result = await compressImage(file, maxAllowedSize);
        const compressedFile = new File([result.blob], file.name, { type: result.blob.type, lastModified: Date.now() });
        return { ok: true, file: compressedFile, compressed: result.compressed };
      } catch {
        return { ok: false, error: 'pixels_too_large' };
      }
    }

    // 完全符合要求
    return { ok: true, file, compressed: false };
  }

  // 文件过大，尝试压缩
  try {
    const result = await compressImage(file, maxAllowedSize, MAX_IMAGE_DIMENSION);

    // 检查压缩后是否仍然超限
    if (result.blob.size > maxAllowedSize) {
      return { ok: false, error: 'file_too_large' };
    }

    const compressedFile = new File([result.blob], file.name, { type: result.blob.type, lastModified: Date.now() });
    return { ok: true, file: compressedFile, compressed: true };
  } catch (error) {
    console.error('图片压缩失败:', error);
    return { ok: false, error: 'file_too_large' };
  }
};
