import { AppSettings, Part, Content } from '../types';
import { getApiBaseUrl, resolveApiBaseUrl } from '../utils/endpointUtils';
import { compressHistoryImages } from '../utils/historyUtils';
import { constructUserContent, processSdkParts, appendSdkPart } from '../utils/partUtils';
import { DEFAULT_MODEL_NAME, sanitizeImageConfigForModel } from '../constants/modelProfiles';
import { BANANA_31_PERMISSION_HINT, isModelAccessDeniedMessage } from '../utils/modelPermission';
import { getRelayApiOption } from '../config/api';

const MAX_EMPTY_CONTENT_RETRIES = 1;
const BLOCKED_REASONS = new Set(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT']);

// 错误码常量
const ERROR_CODES = {
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  MODEL_ACCESS_DENIED: 'MODEL_ACCESS_DENIED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  THINKING_NOT_SUPPORTED: 'THINKING_NOT_SUPPORTED',
  BAD_REQUEST: 'BAD_REQUEST',
  FORBIDDEN: 'FORBIDDEN',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SAFETY_FILTERED: 'SAFETY_FILTERED',
  NO_CONTENT: 'NO_CONTENT',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

const ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.MODEL_NOT_FOUND]: "当前模型暂时不可用 (503)。可能是该模型在您的分组下无权访问，请在设置中切换模型（如 Banana 2（3.1））重试。",
  [ERROR_CODES.MODEL_ACCESS_DENIED]: BANANA_31_PERMISSION_HINT,
  [ERROR_CODES.INVALID_API_KEY]: "API Key 无效或过期，请检查您的设置。",
  [ERROR_CODES.QUOTA_EXCEEDED]: "API 额度不足，请充值后重试。",
  [ERROR_CODES.THINKING_NOT_SUPPORTED]: '当前模型不支持思考过程。请在设置中关闭"显示思考过程"，或切换到支持思考的模型。',
  [ERROR_CODES.BAD_REQUEST]: "请求参数无效 (400)。可能是图片格式不支持或提示词有问题，请尝试换一张图片。",
  [ERROR_CODES.FORBIDDEN]: "访问被拒绝 (403)。可能原因：API Key 权限不足、网络连接需要切换节点、或 API 服务地址配置错误。",
  [ERROR_CODES.TOO_MANY_REQUESTS]: "请求过于频繁 (429)，请稍后再试。",
  [ERROR_CODES.SERVICE_UNAVAILABLE]: "Gemini 服务暂时不可用 (503)，请稍后重试。",
  [ERROR_CODES.NETWORK_ERROR]: "⚠️ 网络连接失败！无法访问 API 服务器。请检查：1. 网络连接是否正常  2. API 中转地址是否可用  3. 是否需要切换网络节点",
  [ERROR_CODES.SAFETY_FILTERED]: "内容被安全策略拦截。请尝试修改您的提示词或更换图片。",
  [ERROR_CODES.NO_CONTENT]: "AI 没有生成任何内容。可能原因：提示词或图片触发了安全过滤、图片格式不支持、或 API 临时异常。请尝试换张图片或修改提示词。",
  [ERROR_CODES.METHOD_NOT_ALLOWED]: "请求方法不被允许 (405)。API 中转地址可能不正确，请检查设置中的 API 地址是否配置正确。",
  [ERROR_CODES.NOT_FOUND]: "请求的模型不存在或 API 路径错误 (404)。请检查 API 中转地址是否正确配置。",
  [ERROR_CODES.INTERNAL_ERROR]: "Gemini 服务器内部错误 (500)，请稍后重试。",
};

const identifyErrorCode = (errorMsg: string): string => {
  if (isModelAccessDeniedMessage(errorMsg)) {
    return ERROR_CODES.MODEL_ACCESS_DENIED;
  }
  if (errorMsg.includes("model_not_found") || (errorMsg.includes("503") && errorMsg.includes("无可用渠道"))) {
    return ERROR_CODES.MODEL_NOT_FOUND;
  }
  if (errorMsg.includes("401") || errorMsg.includes("API key not valid")) {
    return ERROR_CODES.INVALID_API_KEY;
  }
  if (errorMsg.includes("quota") || errorMsg.includes("pre_consume_token_quota_failed")) {
    return ERROR_CODES.QUOTA_EXCEEDED;
  }
  if (errorMsg.includes("Thinking_config.include_thoughts") || errorMsg.includes("thinking is enabled")) {
    return ERROR_CODES.THINKING_NOT_SUPPORTED;
  }
  if (errorMsg.includes("400")) {
    return ERROR_CODES.BAD_REQUEST;
  }
  if (errorMsg.includes("403")) {
    return ERROR_CODES.FORBIDDEN;
  }
  if (errorMsg.includes("429")) {
    return ERROR_CODES.TOO_MANY_REQUESTS;
  }
  if (errorMsg.includes("503")) {
    return ERROR_CODES.SERVICE_UNAVAILABLE;
  }
  if (
    errorMsg.includes("TypeError") ||
    errorMsg.includes("Failed to fetch") ||
    errorMsg.includes("NetworkError") ||
    errorMsg.includes("ECONNREFUSED") ||
    errorMsg.includes("timeout") ||
    errorMsg.includes("ERR_CONNECTION")
  ) {
    return ERROR_CODES.NETWORK_ERROR;
  }
  if (errorMsg.includes("SAFETY") || errorMsg.includes("BLOCKLIST") || errorMsg.includes("PROHIBITED_CONTENT")) {
    return ERROR_CODES.SAFETY_FILTERED;
  }
  if (errorMsg.includes("No content generated")) {
    return ERROR_CODES.NO_CONTENT;
  }
  if (errorMsg.includes("405")) {
    return ERROR_CODES.METHOD_NOT_ALLOWED;
  }
  if (errorMsg.includes("404")) {
    return ERROR_CODES.NOT_FOUND;
  }
  if (errorMsg.includes("500")) {
    return ERROR_CODES.INTERNAL_ERROR;
  }
  return 'UNKNOWN';
};

const extractCandidateFinishReason = (payload: any): string => {
  const finishReason = payload?.candidates?.[0]?.finishReason;
  return typeof finishReason === 'string' ? finishReason.toUpperCase() : '';
};

const extractPromptBlockReason = (payload: any): string => {
  const blockReason = payload?.promptFeedback?.blockReason;
  return typeof blockReason === 'string' ? blockReason.toUpperCase() : '';
};

const hasBlockedSafetyRating = (payload: any): boolean => {
  const hasBlocked = (ratings: any) =>
    Array.isArray(ratings) &&
    ratings.some((rating) => typeof rating === 'object' && rating?.blocked === true);

  if (hasBlocked(payload?.promptFeedback?.safetyRatings)) return true;
  if (Array.isArray(payload?.candidates)) {
    return payload.candidates.some((candidate: any) => hasBlocked(candidate?.safetyRatings));
  }
  return false;
};

const isSafetyBlockedPayload = (payload: any): boolean => {
  const finishReason = extractCandidateFinishReason(payload);
  if (finishReason && BLOCKED_REASONS.has(finishReason)) return true;

  const blockReason = extractPromptBlockReason(payload);
  if (blockReason && BLOCKED_REASONS.has(blockReason)) return true;

  return hasBlockedSafetyRating(payload);
};

const buildNoContentErrorMessage = (payload: any): string => {
  const blockReason = extractPromptBlockReason(payload);
  if (blockReason) {
    return `No content generated (prompt blocked: ${blockReason})`;
  }

  const finishReason = extractCandidateFinishReason(payload);
  if (finishReason) {
    return `No content generated (finish reason: ${finishReason})`;
  }

  return 'No content generated';
};

const formatGeminiError = (error: any): Error => {
  const errorMsg = error?.message || error?.toString() || "";
  const errorCode = identifyErrorCode(errorMsg);

  let message: string;

  if (errorCode === ERROR_CODES.QUOTA_EXCEEDED) {
    const remainMatch = errorMsg.match(/remain quota:\s*[＄$]?([\d.]+)/);
    const needMatch = errorMsg.match(/need quota:\s*[＄$]?([\d.]+)/);
    if (remainMatch && needMatch) {
      message = `额度不足：当前余额 $${remainMatch[1]}，本次需要 $${needMatch[1]}。请充值后重试。`;
    } else {
      message = ERROR_MESSAGES[ERROR_CODES.QUOTA_EXCEEDED];
    }
  } else if (errorCode === 'UNKNOWN') {
    message = `请求出错: ${errorMsg}。如果问题持续，请检查您的 API 设置。`;
  } else {
    message = ERROR_MESSAGES[errorCode];
  }

  const newError = new Error(message);
  (newError as any).originalError = error;
  (newError as any).errorCode = errorCode;
  return newError;
};

const filterThoughtPartsFromHistory = (history: Content[]): Content[] => {
  return history
    .map((item) => {
      if (item.role !== 'model') {
        return item;
      }
      return {
        ...item,
        parts: item.parts.filter((part) => !part.thought),
      };
    })
    .filter((item) => item.parts.length > 0);
};

const appendTextPart = (currentParts: Part[], text: string, thought = false): void => {
  if (!text) return;
  const lastPart = currentParts[currentParts.length - 1];
  if (lastPart?.text !== undefined && !!lastPart.thought === thought) {
    lastPart.text += text;
    return;
  }
  currentParts.push({ text, thought });
};

const appendInlineImagePart = (
  currentParts: Part[],
  mimeType: string,
  data: string,
): void => {
  if (!data) return;
  currentParts.push({
    inlineData: {
      mimeType: mimeType || 'image/png',
      data,
    },
    thought: false,
  });
};

const appendImageUrlPart = (currentParts: Part[], url: string): void => {
  const match = url.match(/^data:(.+?);base64,(.+)$/i);
  if (match) {
    appendInlineImagePart(currentParts, match[1], match[2]);
    return;
  }
  appendTextPart(currentParts, url, false);
};

const appendOpenAIContentBlock = (
  currentParts: Part[],
  block: any,
  thought = false,
): void => {
  if (!block) return;

  if (typeof block === 'string') {
    appendTextPart(currentParts, block, thought);
    return;
  }

  if (Array.isArray(block)) {
    block.forEach((item) => appendOpenAIContentBlock(currentParts, item, thought));
    return;
  }

  if (typeof block.reasoning_content === 'string') {
    appendTextPart(currentParts, block.reasoning_content, true);
  }

  const blockType = typeof block.type === 'string' ? block.type : '';
  if (blockType === 'reasoning' || blockType === 'thinking') {
    const reasoningText =
      typeof block.text === 'string'
        ? block.text
        : typeof block.value === 'string'
          ? block.value
          : '';
    appendTextPart(currentParts, reasoningText, true);
    return;
  }

  if (
    blockType === 'text' ||
    blockType === 'input_text' ||
    blockType === 'output_text'
  ) {
    const text =
      typeof block.text === 'string'
        ? block.text
        : typeof block.value === 'string'
          ? block.value
          : '';
    appendTextPart(currentParts, text, thought);
    return;
  }

  if (
    blockType === 'image_url' ||
    blockType === 'input_image' ||
    blockType === 'output_image'
  ) {
    if (typeof block.b64_json === 'string') {
      appendInlineImagePart(currentParts, block.mime_type || 'image/png', block.b64_json);
      return;
    }
    const imageUrl =
      typeof block.image_url === 'string'
        ? block.image_url
        : typeof block.image_url?.url === 'string'
          ? block.image_url.url
          : typeof block.url === 'string'
            ? block.url
            : '';
    if (imageUrl) {
      appendImageUrlPart(currentParts, imageUrl);
    }
    return;
  }

  if (typeof block.b64_json === 'string') {
    appendInlineImagePart(currentParts, block.mime_type || 'image/png', block.b64_json);
    return;
  }

  if (typeof block.text === 'string') {
    appendTextPart(currentParts, block.text, thought);
  }
};

const extractOpenAIImageDataParts = (items: any[] | undefined): Part[] => {
  const parts: Part[] = [];
  if (!Array.isArray(items)) return parts;
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    if (typeof item.b64_json === 'string') {
      appendInlineImagePart(parts, item.mime_type || 'image/png', item.b64_json);
      return;
    }
    if (typeof item.url === 'string') {
      appendImageUrlPart(parts, item.url);
    }
  });
  return parts;
};

const extractOpenAIMessageParts = (message: any): Part[] => {
  const parts: Part[] = [];
  if (!message || typeof message !== 'object') {
    return parts;
  }

  if (typeof message.reasoning_content === 'string') {
    appendTextPart(parts, message.reasoning_content, true);
  }

  if (Array.isArray(message.reasoning)) {
    message.reasoning.forEach((item: any) => appendOpenAIContentBlock(parts, item, true));
  }

  appendOpenAIContentBlock(parts, message.content, false);
  extractOpenAIImageDataParts(message.images).forEach((part) => parts.push(part));
  return parts;
};

const extractOpenAIResponseParts = (payload: any): Part[] => {
  const choice = payload?.choices?.[0];
  const messageParts = extractOpenAIMessageParts(choice?.message);
  if (messageParts.length > 0) {
    return messageParts;
  }
  return extractOpenAIImageDataParts(payload?.data);
};

type OpenAICompatibleTransport = 'chat_completions' | 'images_generations';

const appendOpenAIStreamPayload = (currentParts: Part[], payload: any): void => {
  const choice = payload?.choices?.[0];
  const delta = choice?.delta;

  if (delta && typeof delta === 'object') {
    if (typeof delta.reasoning_content === 'string') {
      appendTextPart(currentParts, delta.reasoning_content, true);
    }
    if (Array.isArray(delta.reasoning)) {
      delta.reasoning.forEach((item: any) => appendOpenAIContentBlock(currentParts, item, true));
    }
    appendOpenAIContentBlock(currentParts, delta.content, false);
    extractOpenAIImageDataParts(delta.images).forEach((part) => currentParts.push(part));
    return;
  }

  const fullMessageParts = extractOpenAIMessageParts(choice?.message);
  if (fullMessageParts.length > 0) {
    currentParts.splice(0, currentParts.length, ...fullMessageParts);
    return;
  }

  const imageParts = extractOpenAIImageDataParts(payload?.data);
  if (imageParts.length > 0) {
    currentParts.splice(0, currentParts.length, ...imageParts);
  }
};

const buildOpenAICompatibleUrl = (baseUrl: string): string => {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(normalized)) {
    return normalized;
  }
  if (/\/(v1beta\/openai|openai|v1)$/i.test(normalized)) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
};

const buildOpenAICompatibleImagesUrl = (baseUrl: string): string => {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (/\/images\/generations$/i.test(normalized)) {
    return normalized;
  }
  if (/\/(v1beta\/openai|openai|v1)$/i.test(normalized)) {
    return `${normalized}/images/generations`;
  }
  return `${normalized}/v1/images/generations`;
};

const buildOpenAICompatibleHeaders = (
  apiKey: string,
  customEndpoint?: string,
): HeadersInit => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (import.meta.env.DEV) {
    headers['x-target-endpoint'] = getApiBaseUrl(customEndpoint);
  }

  return headers;
};

const buildOpenAICompatibleMessages = (contents: Content[]) => {
  return contents
    .map((item) => {
      const contentBlocks = item.parts
        .filter((part) => !part.thought)
        .flatMap((part) => {
          if (part.inlineData?.data) {
            return [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                },
              },
            ];
          }
          if (part.text) {
            return [{ type: 'text', text: part.text }];
          }
          return [];
        });

      if (contentBlocks.length === 0) {
        return null;
      }

      const hasNonText = contentBlocks.some((block) => block.type !== 'text');
      const content = hasNonText
        ? contentBlocks
        : contentBlocks.map((block) => block.text).join('\n\n');

      return {
        role: item.role === 'model' ? 'assistant' : 'user',
        content,
      };
    })
    .filter(Boolean);
};

const IMAGE_SIZE_PIXELS: Record<AppSettings['resolution'], number> = {
  '512': 512,
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
};

const parseAspectRatio = (aspectRatio: string): [number, number] | null => {
  const match = aspectRatio.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return [width, height];
};

const toEvenPixel = (value: number): number => {
  const rounded = Math.max(128, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
};

const buildOpenAICompatibleImageSize = (settings: AppSettings): string | undefined => {
  const basePixels = IMAGE_SIZE_PIXELS[settings.resolution];
  if (!basePixels) return undefined;

  if (settings.aspectRatio === 'Auto') {
    return `${basePixels}x${basePixels}`;
  }

  const ratio = parseAspectRatio(settings.aspectRatio);
  if (!ratio) return `${basePixels}x${basePixels}`;

  const [ratioWidth, ratioHeight] = ratio;
  const scale = basePixels / Math.sqrt(ratioWidth * ratioHeight);
  const width = toEvenPixel(ratioWidth * scale);
  const height = toEvenPixel(ratioHeight * scale);
  return `${width}x${height}`;
};

const buildOpenAICompatibleChatRequestBody = (
  contents: Content[],
  settings: AppSettings,
  modelName: string,
  imageConfig: Record<string, unknown>,
  stream: boolean,
) => {
  const requestBody: Record<string, unknown> = {
    model: modelName,
    messages: buildOpenAICompatibleMessages(contents),
    stream,
    modalities: ['text', 'image'],
    image_config: imageConfig,
  };

  if (settings.useGrounding) {
    requestBody.tools = [{ type: 'google_search' }];
  }

  return requestBody;
};

const buildOpenAICompatibleImageRequestBody = (
  prompt: string,
  settings: AppSettings,
  modelName: string,
) => {
  const requestBody: Record<string, unknown> = {
    model: modelName,
    prompt: prompt.trim(),
    response_format: 'b64_json',
  };

  const size = buildOpenAICompatibleImageSize(settings);
  if (size) {
    requestBody.size = size;
  }

  return requestBody;
};

const resolveOpenAICompatibleTransport = (
  history: Content[],
  images: { base64Data: string; mimeType: string }[],
  settings: AppSettings,
): OpenAICompatibleTransport => {
  const relay = getRelayApiOption(settings.customEndpoint);
  if (relay?.openAIImageApiMode !== 'standard_images_api') {
    return 'chat_completions';
  }

  const hasConversationContext = history.length > 0;
  const hasInputImages = images.length > 0;
  if (hasConversationContext || hasInputImages || settings.useGrounding) {
    return 'chat_completions';
  }

  return 'images_generations';
};

const shouldRetryLegacyChatCompletions = (response: Response): boolean => {
  return [400, 404, 405, 422].includes(response.status);
};

const buildOpenAINoContentMessage = (payload: any): string => {
  const finishReason = payload?.choices?.[0]?.finish_reason;
  if (typeof finishReason === 'string' && finishReason) {
    return `No content generated (finish reason: ${finishReason.toUpperCase()})`;
  }
  return 'No content generated';
};

const parseErrorResponse = async (response: Response): Promise<string> => {
  const fallback = `HTTP ${response.status}`;
  const raw = await response.text().catch(() => '');
  if (!raw) return fallback;

  try {
    const payload = JSON.parse(raw);
    const message =
      payload?.error?.message ||
      payload?.detail ||
      payload?.message ||
      payload?.error ||
      '';
    if (typeof message === 'string' && message.trim()) {
      return `${response.status} ${message.trim()}`;
    }
  } catch {
    // Ignore JSON parse errors and fall back to raw text.
  }

  return `${response.status} ${raw.slice(0, 200).trim() || fallback}`;
};

const prepareRequestContext = async (
  history: Content[],
  prompt: string,
  images: { base64Data: string; mimeType: string }[],
  settings: AppSettings,
) => {
  const cleanHistory = filterThoughtPartsFromHistory(history);
  const compressedHistory = await compressHistoryImages(cleanHistory);
  const currentUserContent = constructUserContent(prompt, images);
  const contentsPayload = [...compressedHistory, currentUserContent];
  const { normalizedModelName, imageConfig } = sanitizeImageConfigForModel({
    modelName: settings.modelName || DEFAULT_MODEL_NAME,
    resolution: settings.resolution,
    aspectRatio: settings.aspectRatio,
  });

  return {
    currentUserContent,
    contentsPayload,
    normalizedModelName,
    imageConfig,
  };
};

const streamOpenAICompatibleResponse = async function* (
  apiKey: string,
  history: Content[],
  prompt: string,
  images: { base64Data: string; mimeType: string }[],
  settings: AppSettings,
  signal?: AbortSignal,
) {
  const transport = resolveOpenAICompatibleTransport(history, images, settings);
  if (transport === 'images_generations') {
    const result = await generateOpenAICompatibleContent(apiKey, history, prompt, images, settings, signal);
    yield result;
    return;
  }

  const {
    currentUserContent,
    contentsPayload,
    normalizedModelName,
    imageConfig,
  } = await prepareRequestContext(history, prompt, images, settings);

  const baseUrl = resolveApiBaseUrl(settings.customEndpoint);
  const targetUrl = buildOpenAICompatibleUrl(baseUrl);
  const requestBody = buildOpenAICompatibleChatRequestBody(
    contentsPayload,
    settings,
    normalizedModelName,
    imageConfig,
    true,
  );

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: buildOpenAICompatibleHeaders(apiKey, settings.customEndpoint),
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentParts: Part[] = [];
    let lastPayload: any = null;
    let lastParseWarnAt = 0;

    while (true) {
      if (signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith('data:')) {
          line = line.slice(5).trim();
        }

        if (!line || line === '[DONE]') {
          continue;
        }

        try {
          const payload = JSON.parse(line);
          lastPayload = payload;
          appendOpenAIStreamPayload(currentParts, payload);
          if (currentParts.length > 0) {
            yield {
              userContent: currentUserContent,
              modelParts: [...currentParts],
            };
          }
        } catch (parseError) {
          const now = Date.now();
          if (now - lastParseWarnAt > 2000) {
            console.warn('OpenAI 兼容流式 JSON 解析失败，跳过该行:', parseError, line.substring(0, 120));
            lastParseWarnAt = now;
          }
        }
      }
    }

    if (buffer.trim()) {
      let line = buffer.trim();
      if (line.startsWith('data:')) {
        line = line.slice(5).trim();
      }
      if (line && line !== '[DONE]') {
        try {
          const payload = JSON.parse(line);
          lastPayload = payload;
          appendOpenAIStreamPayload(currentParts, payload);
          if (currentParts.length > 0) {
            yield {
              userContent: currentUserContent,
              modelParts: [...currentParts],
            };
          }
        } catch (parseError) {
          console.warn('OpenAI 兼容流式 JSON 解析失败，忽略尾部数据:', parseError, line.substring(0, 120));
        }
      }
    }

    if (currentParts.length === 0) {
      throw new Error(buildOpenAINoContentMessage(lastPayload));
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error;
    }
    console.error("OpenAI-Compatible API Stream Error:", error);
    throw formatGeminiError(error);
  }
};

const generateOpenAICompatibleContent = async (
  apiKey: string,
  history: Content[],
  prompt: string,
  images: { base64Data: string; mimeType: string }[],
  settings: AppSettings,
  signal?: AbortSignal,
) => {
  const transport = resolveOpenAICompatibleTransport(history, images, settings);
  const {
    currentUserContent,
    contentsPayload,
    normalizedModelName,
    imageConfig,
  } = await prepareRequestContext(history, prompt, images, settings);

  const baseUrl = resolveApiBaseUrl(settings.customEndpoint);
  const chatTargetUrl = buildOpenAICompatibleUrl(baseUrl);
  const chatRequestBody = buildOpenAICompatibleChatRequestBody(
    contentsPayload,
    settings,
    normalizedModelName,
    imageConfig,
    false,
  );
  const imageTargetUrl = buildOpenAICompatibleImagesUrl(baseUrl);
  const imageRequestBody = buildOpenAICompatibleImageRequestBody(
    prompt,
    settings,
    normalizedModelName,
  );

  try {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let response: Response;
    if (transport === 'images_generations') {
      response = await fetch(imageTargetUrl, {
        method: 'POST',
        headers: buildOpenAICompatibleHeaders(apiKey, settings.customEndpoint),
        body: JSON.stringify(imageRequestBody),
        signal,
      });

      // 标准生图接口在部分兼容站上尚未完全支持，失败时回退到旧分支保底。
      if (!response.ok && shouldRetryLegacyChatCompletions(response)) {
        response = await fetch(chatTargetUrl, {
          method: 'POST',
          headers: buildOpenAICompatibleHeaders(apiKey, settings.customEndpoint),
          body: JSON.stringify(chatRequestBody),
          signal,
        });
      }
    } else {
      response = await fetch(chatTargetUrl, {
        method: 'POST',
        headers: buildOpenAICompatibleHeaders(apiKey, settings.customEndpoint),
        body: JSON.stringify(chatRequestBody),
        signal,
      });
    }

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    const payload = await response.json();
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const modelParts = extractOpenAIResponseParts(payload);
    if (modelParts.length === 0) {
      throw new Error(buildOpenAINoContentMessage(payload));
    }

    return {
      userContent: currentUserContent,
      modelParts,
    };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error;
    }
    console.error("OpenAI-Compatible API Error:", error);
    throw formatGeminiError(error);
  }
};

export const streamGeminiResponse = async function* (
  apiKey: string,
  history: Content[],
  prompt: string,
  images: { base64Data: string; mimeType: string }[],
  settings: AppSettings,
  signal?: AbortSignal
) {
  if (settings.requestMode === 'openai_compatible') {
    for await (const chunk of streamOpenAICompatibleResponse(apiKey, history, prompt, images, settings, signal)) {
      yield chunk;
    }
    return;
  }

  const { GoogleGenAI } = await import("@google/genai");
  const baseUrl = resolveApiBaseUrl(settings.customEndpoint);
  const ai = new GoogleGenAI(
    { apiKey, httpOptions: { baseUrl } }
  );

  const {
    currentUserContent,
    contentsPayload,
    normalizedModelName,
    imageConfig,
  } = await prepareRequestContext(history, prompt, images, settings);

  try {
    for (let attempt = 0; attempt <= MAX_EMPTY_CONTENT_RETRIES; attempt++) {
      const responseStream = await ai.models.generateContentStream({
        model: normalizedModelName,
        contents: contentsPayload,
        config: {
          imageConfig,
          tools: settings.useGrounding ? [{ googleSearch: {} }] : [],
          responseModalities: ["TEXT", "IMAGE"],
        },
      });

      let currentParts: Part[] = [];
      let lastChunk: any = null;

      for await (const chunk of responseStream) {
        if (signal?.aborted) {
          break;
        }
        lastChunk = chunk;
        const candidates = chunk.candidates;
        if (!candidates || candidates.length === 0) continue;

        const newParts = candidates[0].content?.parts || [];

        for (const part of newParts) {
          appendSdkPart(currentParts, part);
        }

        yield {
          userContent: currentUserContent,
          modelParts: currentParts,
        };
      }

      if (currentParts.length > 0) {
        return;
      }

      const noContentMessage = buildNoContentErrorMessage(lastChunk);
      const safetyBlocked = isSafetyBlockedPayload(lastChunk);
      if (safetyBlocked || attempt >= MAX_EMPTY_CONTENT_RETRIES) {
        throw new Error(noContentMessage);
      }
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
  if (settings.requestMode === 'openai_compatible') {
    return generateOpenAICompatibleContent(apiKey, history, prompt, images, settings, signal);
  }

  const { GoogleGenAI } = await import("@google/genai");
  const baseUrl = resolveApiBaseUrl(settings.customEndpoint);
  const ai = new GoogleGenAI(
    { apiKey, httpOptions: { baseUrl } }
  );

  const {
    currentUserContent,
    contentsPayload,
    normalizedModelName,
    imageConfig,
  } = await prepareRequestContext(history, prompt, images, settings);

  try {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    for (let attempt = 0; attempt <= MAX_EMPTY_CONTENT_RETRIES; attempt++) {
      const response = await ai.models.generateContent({
        model: normalizedModelName,
        contents: contentsPayload,
        config: {
          imageConfig,
          tools: settings.useGrounding ? [{ googleSearch: {} }] : [],
          responseModalities: ["TEXT", "IMAGE"],
        },
      });

      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      if (parts.length > 0) {
        return {
          userContent: currentUserContent,
          modelParts: processSdkParts(parts),
        };
      }

      const noContentMessage = buildNoContentErrorMessage(response);
      const safetyBlocked = isSafetyBlockedPayload(response);
      if (safetyBlocked || attempt >= MAX_EMPTY_CONTENT_RETRIES) {
        throw new Error(noContentMessage);
      }
    }

    throw new Error("No content generated.");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw formatGeminiError(error);
  }
};
