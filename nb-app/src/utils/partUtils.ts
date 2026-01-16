import type { Part as SDKPart, Content } from "@google/genai";
import { Part } from '../types';

/**
 * 构建用户内容对象（包含文本和图片）
 */
export const constructUserContent = (
    prompt: string,
    images: { base64Data: string; mimeType: string }[]
): Content => {
    const userParts: SDKPart[] = [];

    images.forEach((img) => {
        userParts.push({
            inlineData: {
                mimeType: img.mimeType,
                data: img.base64Data,
            },
        });
    });

    if (prompt.trim()) {
        userParts.push({ text: prompt });
    }

    return {
        role: "user",
        parts: userParts,
    };
};

/**
 * 将单个 SDK Part 添加到累积的 Parts 数组中
 * 用于流式处理，会自动合并连续的相同类型文本
 *
 * @param currentParts - 当前累积的 parts 数组
 * @param sdkPart - 要添加的新 part
 */
export const appendSdkPart = (currentParts: Part[], sdkPart: SDKPart): void => {
    const signature = (sdkPart as any).thoughtSignature;
    const isThought = !!(sdkPart as any).thought;

    if (sdkPart.text !== undefined) {
        const lastPart = currentParts[currentParts.length - 1];
        // 如果上一个 part 也是文本且 thought 状态相同，则合并
        if (
            lastPart &&
            lastPart.text !== undefined &&
            !!lastPart.thought === isThought
        ) {
            lastPart.text += sdkPart.text;
            if (signature) {
                lastPart.thoughtSignature = signature;
            }
        } else {
            const newPart: Part = {
                text: sdkPart.text,
                thought: isThought
            };
            if (signature) {
                newPart.thoughtSignature = signature;
            }
            currentParts.push(newPart);
        }
    } else if (sdkPart.inlineData) {
        const newPart: Part = {
            inlineData: {
                mimeType: sdkPart.inlineData.mimeType || 'image/png',
                data: sdkPart.inlineData.data || ''
            },
            thought: isThought
        };
        if (signature) {
            newPart.thoughtSignature = signature;
        }
        currentParts.push(newPart);
    }
};

/**
 * 将 Gemini SDK 返回的 Parts 转换为应用 Parts 格式
 * 处理文本和图片数据，以及思考过程标记
 * 用于一次性处理完整的 parts 数组
 */
export const processSdkParts = (sdkParts: SDKPart[]): Part[] => {
    const appParts: Part[] = [];
    for (const part of sdkParts) {
        appendSdkPart(appParts, part);
    }
    return appParts;
};
