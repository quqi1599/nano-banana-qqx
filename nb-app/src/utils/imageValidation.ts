export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_DIMENSION = 8192;

export type ImageValidationError =
  | 'not_image'
  | 'file_too_large'
  | 'total_too_large'
  | 'invalid_dimensions'
  | 'dimension_too_large'
  | 'pixels_too_large';

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
