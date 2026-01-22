import { ChatMessage, Content, Part } from '../types';
import { resolveMessageImageData } from './messageImageUtils';

/**
 * 将聊天消息转换为 SDK 历史格式
 * 注意: 会过滤掉错误消息和思考过程(thought)parts
 */
export const convertMessagesToHistory = (messages: ChatMessage[]): Content[] => {
  return messages
    .filter(msg => !msg.isError) // 过滤掉错误消息
    .map(msg => ({
      role: msg.role,
      // 完全移除 thought parts，因为它们不应该发送给 API
      parts: msg.parts.filter(p => !p.thought && !p.thoughtSignature).map(p => {
        const part: Part = {};
        if (p.text) part.text = p.text;
        if (p.inlineData) {
          part.inlineData = {
            mimeType: p.inlineData.mimeType,
            data: p.inlineData.data,
          };
          if (p.imageBytes) {
            part.imageBytes = p.imageBytes;
          }
        }
        return part;
      })
    }));
};

export const convertMessagesToHistoryAsync = async (messages: ChatMessage[]): Promise<Content[]> => {
  const history: Content[] = [];

  for (const msg of messages) {
    if (msg.isError) continue;

    const parts: Part[] = [];
    for (const p of msg.parts) {
      if (p.thought || p.thoughtSignature) continue;

      if (p.text) {
        parts.push({ text: p.text });
      }

      if (p.inlineData) {
        const resolved = await resolveMessageImageData(p);
        if (resolved?.data) {
          parts.push({
            inlineData: {
              mimeType: resolved.mimeType,
              data: resolved.data,
            },
          });
        }
      }
    }

    if (parts.length > 0) {
      history.push({ role: msg.role, parts });
    }
  }

  return history;
};
