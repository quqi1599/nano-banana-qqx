/**
 * Gemini API 相关的共享工具函数
 */

import type { Part as SDKPart } from "@google/genai";
import { Part } from '../types';

/**
 * 构建用户内容对象（包含文本和图片）
 */
export const constructUserContent = (
  prompt: string,
  images: { base64Data: string; mimeType: string }[]
) => {
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
 * 将 SDK Parts 转换为应用 Parts
 * 合并相邻的同类型 Part，处理思考签名
 */
export const processSdkParts = (sdkParts: SDKPart[]): Part[] => {
  const appParts: Part[] = [];

  for (const part of sdkParts) {
    const signature = (part as any).thoughtSignature;
    const isThought = !!(part as any).thought;

    // Handle Text (Thought or Regular)
    if (part.text !== undefined) {
      const lastPart = appParts[appParts.length - 1];

      // Check if we should append to the last part or start a new one.
      // Append if: Last part exists AND is text AND matches thought type.
      if (
        lastPart &&
        lastPart.text !== undefined &&
        !!lastPart.thought === isThought
      ) {
        lastPart.text += part.text;
        if (signature) {
          lastPart.thoughtSignature = signature;
        }
      } else {
        // New text block
        const newPart: Part = {
          text: part.text,
          thought: isThought
        };
        if (signature) {
          newPart.thoughtSignature = signature;
        }
        appParts.push(newPart);
      }
    }
    // Handle Images
    else if (part.inlineData) {
      const newPart: Part = {
        inlineData: {
          mimeType: part.inlineData.mimeType || 'image/png',
          data: part.inlineData.data || ''
        },
        thought: isThought
      };
      if (signature) {
        newPart.thoughtSignature = signature;
      }
      appParts.push(newPart);
    }
  }
  return appParts;
};

/**
 * 增量处理新的 SDK Parts，合并到现有 Parts 列表中
 * 用于流式响应的增量处理
 */
export const accumulateSdkParts = (
  currentParts: Part[],
  newParts: SDKPart[]
): Part[] => {
  for (const part of newParts) {
    const signature = (part as any).thoughtSignature;
    const isThought = !!(part as any).thought;

    if (part.text !== undefined) {
      const lastPart = currentParts[currentParts.length - 1];
      if (
        lastPart &&
        lastPart.text !== undefined &&
        !!lastPart.thought === isThought
      ) {
        lastPart.text += part.text;
        if (signature) {
          lastPart.thoughtSignature = signature;
        }
      } else {
        const newPart: Part = {
          text: part.text,
          thought: isThought
        };
        if (signature) {
          newPart.thoughtSignature = signature;
        }
        currentParts.push(newPart);
      }
    } else if (part.inlineData) {
      const newPart: Part = {
        inlineData: {
          mimeType: part.inlineData.mimeType || 'image/png',
          data: part.inlineData.data || ''
        },
        thought: isThought
      };
      if (signature) {
        newPart.thoughtSignature = signature;
      }
      currentParts.push(newPart);
    }
  }
  return currentParts;
};
