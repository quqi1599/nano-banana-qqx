import { ChatMessage, Content, Part } from '../types';

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
        if (p.inlineData) part.inlineData = p.inlineData;
        return part;
      })
    }));
};
