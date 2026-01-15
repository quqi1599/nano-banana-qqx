import type { Content, Part as SDKPart } from "@google/genai";
import { AppSettings, Part } from '../types';
import { resolveApiBaseUrl } from '../utils/endpointUtils';
import { compressHistoryImages } from '../utils/historyUtils';

// Helper to construct user content
const constructUserContent = (prompt: string, images: { base64Data: string; mimeType: string }[]): Content => {
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

// Helper to format Gemini API errors
const formatGeminiError = (error: any): Error => {
  let message = "发生了未知错误，请稍后重试。";
  const errorMsg = error?.message || error?.toString() || "";

  if (errorMsg.includes("401") || errorMsg.includes("API key not valid")) {
    message = "API Key 无效或过期，请检查您的设置。";
  } else if (errorMsg.includes("quota") || errorMsg.includes("pre_consume_token_quota_failed")) {
    const remainMatch = errorMsg.match(/remain quota:\s*[＄$]?([\d.]+)/);
    const needMatch = errorMsg.match(/need quota:\s*[＄$]?([\d.]+)/);
    if (remainMatch && needMatch) {
      message = `额度不足：当前余额 $${remainMatch[1]}，本次需要 $${needMatch[1]}。请充值后重试。`;
    } else {
      message = "API 额度不足，请充值后重试。";
    }
  } else if (errorMsg.includes("Thinking_config.include_thoughts") || errorMsg.includes("thinking is enabled")) {
    message = '当前模型不支持思考过程。请在设置中关闭"显示思考过程"，或切换到支持思考的模型。';
  } else if (errorMsg.includes("400")) {
    message = "请求参数无效 (400)。可能是图片格式不支持或提示词有问题，请尝试换一张图片。";
  } else if (errorMsg.includes("403")) {
    message = "访问被拒绝 (403)。可能原因：API Key 权限不足、网络连接需要切换节点、或 API 服务地址配置错误。";
  } else if (errorMsg.includes("429")) {
    message = "请求过于频繁 (429)，请稍后再试。";
  } else if (errorMsg.includes("model_not_found") || (errorMsg.includes("503") && errorMsg.includes("无可用渠道"))) {
    message = "当前模型暂时不可用 (503)。可能是该模型在您的分组下无权访问，请在设置中切换模型 (如尝试 Gemini 2.5) 重试。";
  } else if (errorMsg.includes("503")) {
    message = "Gemini 服务暂时不可用 (503)，请稍后重试。";
  } else if (errorMsg.includes("TypeError") || errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError") || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("timeout") || errorMsg.includes("ERR_CONNECTION")) {
    message = "⚠️ 网络连接失败！无法访问 API 服务器。请检查：1. 网络连接是否正常  2. API 中转地址是否可用  3. 是否需要切换网络节点";
  } else if (errorMsg.includes("SAFETY")) {
    message = "内容被安全策略拦截。请尝试修改您的提示词或更换图片。";
  } else if (errorMsg.includes("No content generated")) {
    message = "AI 没有生成任何内容。可能原因：提示词或图片触发了安全过滤、图片格式不支持、或 API 临时异常。请尝试换张图片或修改提示词。";
  } else if (errorMsg.includes("405")) {
    message = "请求方法不被允许 (405)。API 中转地址可能不正确，请检查设置中的 API 地址是否配置正确。";
  } else if (errorMsg.includes("404")) {
    message = "请求的模型不存在或 API 路径错误 (404)。请检查 API 中转地址是否正确配置。";
  } else if (errorMsg.includes("500")) {
    message = "Gemini 服务器内部错误 (500)，请稍后重试。";
  } else {
    message = `请求出错: ${errorMsg}。如果问题持续，请检查您的 API 设置。`;
  }

  const newError = new Error(message);
  (newError as any).originalError = error;
  return newError;
};

// Helper to process SDK parts into app Parts
const processSdkParts = (sdkParts: SDKPart[]): Part[] => {
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

export const streamGeminiResponse = async function* (
  apiKey: string,
  history: Content[],
  prompt: string,
  images: { base64Data: string; mimeType: string }[],
  settings: AppSettings,
  signal?: AbortSignal
) {
  const { GoogleGenAI } = await import("@google/genai");
  // 如果用户设置了自定义 API 域名，使用完整 URL；否则使用本地代理路径
  const baseUrl = resolveApiBaseUrl(settings.customEndpoint);
  const ai = new GoogleGenAI(
    { apiKey, httpOptions: { baseUrl } }
  );

  // Filter out thought parts from history to avoid sending thought chains back to the model
  const cleanHistory = history.map(item => {
    if (item.role === 'model') {
      return {
        ...item,
        parts: item.parts.filter(p => !p.thought)
      };
    }
    return item;
  }).filter(item => item.parts.length > 0);

  // 压缩历史图片以避免请求体过大
  const compressedHistory = await compressHistoryImages(cleanHistory);

  const currentUserContent = constructUserContent(prompt, images);
  const contentsPayload = [...compressedHistory, currentUserContent];

  try {
    const responseStream = await ai.models.generateContentStream({
      model: settings.modelName || "gemini-3-pro-image-preview",
      contents: contentsPayload,
      config: {
        imageConfig: {
          // imageSize 只有 Gemini 3 Pro 才支持
          ...((settings.modelName || '').includes('gemini-3') ? { imageSize: settings.resolution } : {}),
          ...(settings.aspectRatio !== 'Auto' ? { aspectRatio: settings.aspectRatio } : {}),
        },
        tools: settings.useGrounding ? [{ googleSearch: {} }] : [],
        responseModalities: ["TEXT", "IMAGE"],
        ...(settings.enableThinking ? {
          thinkingConfig: {
            includeThoughts: true,
          }
        } : {}),
      },
    });

    let currentParts: Part[] = [];

    for await (const chunk of responseStream) {
      if (signal?.aborted) {
        break;
      }
      const candidates = chunk.candidates;
      if (!candidates || candidates.length === 0) continue;

      const newParts = candidates[0].content?.parts || [];

      // Use the helper logic but incrementally
      // We can't reuse processSdkParts directly because we need to accumulate state (currentParts)
      // So we keep the loop logic here
      for (const part of newParts) {
        const signature = (part as any).thoughtSignature;
        const isThought = !!(part as any).thought;

        // Handle Text (Thought or Regular)
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
        }
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
          currentParts.push(newPart);
        }
      }

      yield {
        userContent: currentUserContent,
        modelParts: currentParts // Yield the accumulated parts
      };
    }
  } catch (error) {
    console.error("Gemini API Stream Error:", error);
    throw formatGeminiError(error);
  }
};

export const generateContent = async (
  apiKey: string,
  history: Content[],
  prompt: string,
  images: { base64Data: string; mimeType: string }[],
  settings: AppSettings,
  signal?: AbortSignal
) => {
  const { GoogleGenAI } = await import("@google/genai");
  // 如果用户设置了自定义 API 域名，使用完整 URL；否则使用本地代理路径
  const baseUrl = resolveApiBaseUrl(settings.customEndpoint);
  const ai = new GoogleGenAI(
    { apiKey, httpOptions: { baseUrl } }
  );

  // Filter out thought parts from history
  const cleanHistory = history.map(item => {
    if (item.role === 'model') {
      return {
        ...item,
        parts: item.parts.filter(p => !p.thought)
      };
    }
    return item;
  }).filter(item => item.parts.length > 0);

  // 压缩历史图片以避免请求体过大
  const compressedHistory = await compressHistoryImages(cleanHistory);

  const currentUserContent = constructUserContent(prompt, images);
  const contentsPayload = [...compressedHistory, currentUserContent];

  try {
    // If signal is aborted before we start, throw immediately
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const response = await ai.models.generateContent({
      model: settings.modelName || "gemini-3-pro-image-preview",
      contents: contentsPayload,
      config: {
        imageConfig: {
          // imageSize 只有 Gemini 3 Pro 才支持
          ...((settings.modelName || '').includes('gemini-3') ? { imageSize: settings.resolution } : {}),
          ...(settings.aspectRatio !== 'Auto' ? { aspectRatio: settings.aspectRatio } : {}),
        },
        tools: settings.useGrounding ? [{ googleSearch: {} }] : [],
        responseModalities: ["TEXT", "IMAGE"],
        ...(settings.enableThinking ? {
          thinkingConfig: {
            includeThoughts: true,
          }
        } : {}),
      },
    });

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      throw new Error("No content generated.");
    }

    const modelParts = processSdkParts(candidate.content.parts);

    return {
      userContent: currentUserContent,
      modelParts: modelParts
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw formatGeminiError(error);
  }
};
