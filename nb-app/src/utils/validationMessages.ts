import { ImageValidationError, MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, MAX_TOTAL_IMAGE_BYTES } from './imageValidation';

const formatMegabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

export const getImageValidationMessage = (error?: ImageValidationError): string => {
    switch (error) {
        case 'not_image':
            return '仅支持图片文件';
        case 'file_too_large':
            return `单张图片大小不得超过 ${formatMegabytes(MAX_IMAGE_BYTES)}MB`;
        case 'total_too_large':
            return `图片总大小不得超过 ${formatMegabytes(MAX_TOTAL_IMAGE_BYTES)}MB`;
        case 'invalid_dimensions':
            return '无法读取图片尺寸';
        case 'dimension_too_large':
            return `图片尺寸过大，最长边不得超过 ${MAX_IMAGE_DIMENSION}px`;
        case 'pixels_too_large':
            return `图片像素过大，建议小于 ${Math.round(MAX_IMAGE_PIXELS / 1_000_000)}MP`;
        default:
            return '图片不符合上传要求';
    }
};
