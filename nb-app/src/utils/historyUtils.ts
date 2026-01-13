/**
 * 历史消息工具函数
 * - 压缩历史图片到指定大小
 * - 计算历史图片总大小
 * - 检查对话是否超过限制
 */

import type { Content } from "@google/genai";

// 常量定义
const MAX_HISTORY_IMAGE_BYTES = 2 * 1024 * 1024; // 单张历史图片最大 2MB
const MAX_TOTAL_HISTORY_IMAGE_BYTES = 100 * 1024 * 1024; // 历史图片总大小上限 100MB
const MAX_HISTORY_MESSAGES = 10; // 历史消息条数上限

/**
 * 计算 Base64 字符串的实际字节大小
 */
const getBase64ByteSize = (base64: string): number => {
    // Base64 编码会增加约 33% 的大小
    // 实际字节 ≈ Base64长度 * 3/4
    const padding = (base64.match(/=/g) || []).length;
    return Math.floor((base64.length * 3) / 4) - padding;
};

/**
 * 压缩单张图片到指定大小
 * @param base64Data 原始 Base64 数据
 * @param mimeType MIME 类型
 * @param maxBytes 目标最大字节数
 * @returns Promise<{data: string, mimeType: string}> 压缩后的图片
 */
const compressBase64Image = async (
    base64Data: string,
    mimeType: string,
    maxBytes: number = MAX_HISTORY_IMAGE_BYTES
): Promise<{ data: string; mimeType: string }> => {
    const currentSize = getBase64ByteSize(base64Data);

    // 如果已经符合要求，直接返回
    if (currentSize <= maxBytes) {
        return { data: base64Data, mimeType };
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // 保持原始比例，根据大小比例计算缩放因子
            const scaleFactor = Math.sqrt(maxBytes / currentSize);
            width = Math.floor(width * scaleFactor);
            height = Math.floor(height * scaleFactor);

            // 确保最小尺寸
            width = Math.max(100, width);
            height = Math.max(100, height);

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve({ data: base64Data, mimeType }); // 失败时返回原图
                return;
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            // 输出为 JPEG 以获得更好的压缩率
            const exportType = 'image/jpeg';
            let quality = 0.8;
            let resultData = '';

            // 逐步降低质量直到符合大小要求
            const tryCompress = () => {
                try {
                    const dataUrl = canvas.toDataURL(exportType, quality);
                    const newBase64 = dataUrl.split(',')[1];

                    // 验证数据有效性，如果无效则返回原图
                    if (!newBase64 || newBase64.length === 0) {
                        console.warn('压缩后数据为空，返回原图');
                        resolve({ data: base64Data, mimeType });
                        return;
                    }

                    const newSize = getBase64ByteSize(newBase64);

                    if (newSize <= maxBytes || quality <= 0.3) {
                        resultData = newBase64;
                        resolve({ data: resultData, mimeType: exportType });
                    } else {
                        quality -= 0.1;
                        tryCompress();
                    }
                } catch (e) {
                    console.warn('图片压缩失败，返回原图:', e);
                    resolve({ data: base64Data, mimeType });
                }
            };

            tryCompress();
        };

        img.onerror = () => {
            // 加载失败时返回原图
            resolve({ data: base64Data, mimeType });
        };

        img.src = `data:${mimeType};base64,${base64Data}`;
    });
};

/**
 * 计算历史消息中所有图片的总大小
 * @param history 对话历史
 * @returns 总字节数
 */
export const calculateHistoryImageSize = (history: Content[]): number => {
    let totalSize = 0;

    for (const content of history) {
        for (const part of content.parts) {
            if (part.inlineData?.data) {
                totalSize += getBase64ByteSize(part.inlineData.data);
            }
        }
    }

    return totalSize;
};

/**
 * 获取历史消息条数
 * @param history 对话历史
 * @returns 消息条数
 */
export const getHistoryMessageCount = (history: Content[]): number => {
    return history.length;
};

/**
 * 检查对话是否需要强制开启新对话
 * 条件：消息数 >= 10 且 图片总大小 >= 100MB
 * @param history 对话历史
 * @returns { needNewConversation: boolean, messageCount: number, imageSizeMB: number }
 */
export const checkConversationLimit = (history: Content[]): {
    needNewConversation: boolean;
    messageCount: number;
    imageSizeMB: number;
} => {
    const messageCount = getHistoryMessageCount(history);
    const imageSize = calculateHistoryImageSize(history);
    const imageSizeMB = Math.round(imageSize / (1024 * 1024) * 10) / 10;

    const needNewConversation =
        messageCount >= MAX_HISTORY_MESSAGES &&
        imageSize >= MAX_TOTAL_HISTORY_IMAGE_BYTES;

    return {
        needNewConversation,
        messageCount,
        imageSizeMB,
    };
};

/**
 * 压缩历史消息中的所有图片
 * @param history 原始对话历史
 * @returns Promise<Content[]> 压缩后的对话历史
 */
export const compressHistoryImages = async (
    history: Content[]
): Promise<Content[]> => {
    const compressedHistory: Content[] = [];

    for (const content of history) {
        const compressedParts = [];

        for (const part of content.parts) {
            // 如果有有效的图片数据，进行压缩
            if (part.inlineData?.data && part.inlineData.data.length > 0) {
                // 压缩图片
                const compressed = await compressBase64Image(
                    part.inlineData.data,
                    part.inlineData.mimeType || 'image/png',
                    MAX_HISTORY_IMAGE_BYTES
                );
                // 只添加压缩后数据有效的图片
                if (compressed.data && compressed.data.length > 0) {
                    compressedParts.push({
                        ...part,
                        inlineData: {
                            mimeType: compressed.mimeType,
                            data: compressed.data,
                        },
                    });
                } else {
                    console.warn('压缩后图片数据无效，跳过该图片');
                }
            } else if (part.inlineData) {
                // 有 inlineData 但 data 为空，跳过这个无效的图片
                console.warn('发现无效图片数据，跳过');
            } else {
                // 非图片 part（如 text），保留
                compressedParts.push(part);
            }
        }

        // 只添加有有效 parts 的消息
        if (compressedParts.length > 0) {
            compressedHistory.push({
                ...content,
                parts: compressedParts,
            });
        } else {
            console.warn('消息压缩后无有效内容，跳过');
        }
    }

    return compressedHistory;
};

export { MAX_HISTORY_IMAGE_BYTES, MAX_TOTAL_HISTORY_IMAGE_BYTES, MAX_HISTORY_MESSAGES };
