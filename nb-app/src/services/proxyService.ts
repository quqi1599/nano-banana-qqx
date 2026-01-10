/**
 * 后端代理服务 - 通过后端调用 AI API（次数计费模式）
 */

import type { Content, Part as SDKPart } from "@google/genai";
import { AppSettings, Part } from '../types';
import { getToken } from './authService';

// 后端 API 地址
const getBackendUrl = (): string => {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDev && window.location.port === '3000') {
        return 'http://localhost:8000';
    }
    return window.location.origin;
};

const API_BASE = `${getBackendUrl()}/api`;

// Helper to construct user content
const constructUserContent = (
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

// Helper to format proxy API errors
const formatProxyError = (error: any): Error => {
    let message = "发生了未知错误，请稍后重试。";
    const errorMsg = error?.message || error?.detail || error?.toString() || "";

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

        if (part.text !== undefined) {
            const lastPart = appParts[appParts.length - 1];
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
                appParts.push(newPart);
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
            appParts.push(newPart);
        }
    }
    return appParts;
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
    const token = getToken();
    if (!token) {
        throw new Error('请先登录');
    }

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

    const currentUserContent = constructUserContent(prompt, images);

    // 构建请求体
    const requestBody = {
        model: settings.modelName || "gemini-3-pro-image-preview",
        contents: [...cleanHistory, currentUserContent],
        config: {
            imageConfig: {
                ...(settings.modelName?.includes('gemini-3') ? { imageSize: settings.resolution } : {}),
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
    };

    try {
        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const response = await fetch(`${API_BASE}/proxy/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(requestBody),
            signal,
        });

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
    const token = getToken();
    if (!token) {
        throw new Error('请先登录');
    }

    const cleanHistory = history.map(item => {
        if (item.role === 'model') {
            return {
                ...item,
                parts: item.parts.filter(p => !p.thought)
            };
        }
        return item;
    }).filter(item => item.parts.length > 0);

    const currentUserContent = constructUserContent(prompt, images);

    const requestBody = {
        model: settings.modelName || "gemini-3-pro-image-preview",
        contents: [...cleanHistory, currentUserContent],
        config: {
            imageConfig: {
                ...(settings.modelName?.includes('gemini-3') ? { imageSize: settings.resolution } : {}),
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
    };

    try {
        const response = await fetch(`${API_BASE}/proxy/generate/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(requestBody),
            signal,
        });

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

        while (true) {
            if (signal?.aborted) {
                break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // 尝试解析 JSON 数据块
            try {
                const data = JSON.parse(buffer);
                buffer = '';

                const candidates = data.candidates;
                if (!candidates || candidates.length === 0) continue;

                const newParts = candidates[0].content?.parts || [];

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

                yield {
                    userContent: currentUserContent,
                    modelParts: currentParts
                };
            } catch {
                // JSON 不完整，继续读取
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
