/**
 * 后端代理服务 - 通过后端调用 AI API（次数计费模式）
 */

import { AppSettings, Part, Content } from '../types';
import { getBackendUrl } from '../utils/backendUrl';
import { compressHistoryImages } from '../utils/historyUtils';
import { buildRequestOptions } from '../utils/request';
import { constructUserContent, processSdkParts, appendSdkPart } from '../utils/partUtils';

const API_BASE = `${getBackendUrl()}/api`;

// Helper to format proxy API errors
const formatProxyError = (error: any): Error => {
    let message = "发生了未知错误，请稍后重试。";
    const errorMsg = error?.message || error?.detail || error?.toString() || "";
    const noChargeHint = "温馨提示：本次请求失败，不会扣除积分。";

    if (errorMsg.includes("402") || errorMsg.includes("次数不足") || errorMsg.includes("积分不足")) {
        message = errorMsg.includes("次数不足") ? errorMsg : "次数不足，请充值后重试。";
    } else if (errorMsg.includes("401") || errorMsg.includes("认证")) {
        message = "登录已过期，请重新登录。";
    } else if (errorMsg.includes("503") || errorMsg.includes("Token")) {
        message = "服务暂时不可用，请稍后重试。";
    } else if (errorMsg.includes("504") || errorMsg.includes("超时")) {
        message = "请求超时，请稍后重试。";
    } else if (errorMsg.includes("No content generated")) {
        message = "AI 没有生成任何内容。可能原因：提示词或图片触发了安全过滤、图片格式不支持、或 API 临时异常。请尝试换张图片或修改提示词。";
    } else if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError") || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("timeout") || errorMsg.includes("ERR_CONNECTION") || errorMsg.includes("TypeError")) {
        message = "⚠️ 网络连接失败！无法访问 API 服务器。请检查：1. 网络连接是否正常  2. 后端服务是否运行  3. API 中转地址是否可访问";
    } else {
        message = `请求出错: ${errorMsg}。如果问题持续，请联系管理员。`;
    }

    const shouldAppendNoCharge =
        !/次数不足|积分不足|余额不足|Payment Required/i.test(errorMsg || "") &&
        !message.includes("不会扣除积分");
    if (shouldAppendNoCharge) {
        message = `${message}\n${noChargeHint}`;
    }

    const newError = new Error(message);
    (newError as any).originalError = error;
    return newError;
};

/**
 * 通过后端代理生成内容（非流式）
 */
export const generateContentViaProxy = async (
    history: Content[],
    prompt: string,
    images: { base64Data: string; mimeType: string }[],
    settings: AppSettings,
    signal?: AbortSignal
) => {
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

    // 压缩历史图片到 2MB 以内
    const compressedHistory = await compressHistoryImages(cleanHistory);

    const currentUserContent = constructUserContent(prompt, images);

    // 构建请求体
    const requestBody = {
        model: settings.modelName || "gemini-3-pro-image-preview",
        contents: [...compressedHistory, currentUserContent],
        config: {
            imageConfig: {
                ...(settings.modelName?.includes('gemini-3') ? { imageSize: settings.resolution } : {}),
                ...(settings.aspectRatio !== 'Auto' ? { aspectRatio: settings.aspectRatio } : {}),
            },
            tools: settings.useGrounding ? [{ googleSearch: {} }] : [],
            responseModalities: ["TEXT", "IMAGE"],
        },
    };

    try {
        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const response = await fetch(
            `${API_BASE}/proxy/generate`,
            buildRequestOptions({
                method: 'POST',
                body: JSON.stringify(requestBody),
                signal,
            })
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: '请求失败' }));
            throw new Error(error.detail || `HTTP error ${response.status}`);
        }

        const data = await response.json();

        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const candidate = data.candidates?.[0];

        if (!candidate || !candidate.content || !candidate.content.parts) {
            throw new Error("No content generated.");
        }

        const modelParts = processSdkParts(candidate.content.parts);

        return {
            userContent: currentUserContent,
            modelParts: modelParts
        };

    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            throw error;
        }
        console.error("Proxy API Error:", error);
        throw formatProxyError(error);
    }
};

/**
 * 通过后端代理生成内容（流式）
 */
export const streamContentViaProxy = async function* (
    history: Content[],
    prompt: string,
    images: { base64Data: string; mimeType: string }[],
    settings: AppSettings,
    signal?: AbortSignal
) {
    const cleanHistory = history.map(item => {
        if (item.role === 'model') {
            return {
                ...item,
                parts: item.parts.filter(p => !p.thought)
            };
        }
        return item;
    }).filter(item => item.parts.length > 0);

    // 压缩历史图片到 2MB 以内
    const compressedHistory = await compressHistoryImages(cleanHistory);

    const currentUserContent = constructUserContent(prompt, images);

    const requestBody = {
        model: settings.modelName || "gemini-3-pro-image-preview",
        contents: [...compressedHistory, currentUserContent],
        config: {
            imageConfig: {
                ...(settings.modelName?.includes('gemini-3') ? { imageSize: settings.resolution } : {}),
                ...(settings.aspectRatio !== 'Auto' ? { aspectRatio: settings.aspectRatio } : {}),
            },
            tools: settings.useGrounding ? [{ googleSearch: {} }] : [],
            responseModalities: ["TEXT", "IMAGE"],
        },
    };

    try {
        const response = await fetch(
            `${API_BASE}/proxy/generate/stream`,
            buildRequestOptions({
                method: 'POST',
                body: JSON.stringify(requestBody),
                signal,
            })
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: '请求失败' }));
            throw new Error(error.detail || `HTTP error ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentParts: Part[] = [];
        let hasProcessed = false; // 标记是否已经处理过数据

        while (true) {
            if (signal?.aborted) {
                break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // 尝试解析整个 buffer（如果是单个 JSON 对象）
            if (!hasProcessed) {
                try {
                    const data = JSON.parse(buffer);
                    // 成功解析，说明是单个 JSON 对象（格式化的）
                    hasProcessed = true;
                    buffer = '';

                    // 验证数据结构
                    const candidates = data.candidates;
                    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
                        console.warn('Proxy API 返回数据格式异常: 缺少 candidates 数组');
                        continue;
                    }

                    const newParts = candidates[0].content?.parts || [];

                    for (const part of newParts) {
                        appendSdkPart(currentParts, part);
                    }

                    yield {
                        userContent: currentUserContent,
                        modelParts: currentParts
                    };
                } catch (parseError) {
                    // 解析失败，可能是 NDJSON 格式，继续累积
                    // 只有当 buffer 过大时才清空
                    if (buffer.length > 50000) {
                        console.warn('Proxy API buffer 过大，清空重试:', parseError);
                        buffer = '';
                    }
                }
            }
        }

        // 如果还没有处理过，尝试作为 NDJSON 处理
        if (!hasProcessed && buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const data = JSON.parse(line);

                    const candidates = data.candidates;
                    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
                        continue;
                    }

                    const newParts = candidates[0].content?.parts || [];

                    for (const part of newParts) {
                        appendSdkPart(currentParts, part);
                    }

                    yield {
                        userContent: currentUserContent,
                        modelParts: currentParts
                    };
                } catch (parseError) {
                    console.warn('Proxy API JSON 解析失败，跳过该行:', parseError, line.substring(0, 100));
                }
            }
        }
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            throw error;
        }
        console.error("Proxy API Stream Error:", error);
        throw formatProxyError(error);
    }
};
