import { Part } from '../types';
import { getBase64ByteSize } from './base64';
import { createThumbnail } from './imageUtils';
import { getMessageImage, storeMessageImage } from './messageImageStore';

const MESSAGE_IMAGE_MIN_BYTES = 512 * 1024;

export const offloadMessageParts = async (
  messageId: string,
  parts: Part[]
): Promise<{ parts: Part[]; changed: boolean }> => {
  let changed = false;

  const nextParts = await Promise.all(
    parts.map(async (part, index) => {
      if (!part.inlineData?.data) return part;
      if (part.inlineData.isThumbnail && part.imageId) return part;

      const byteSize = getBase64ByteSize(part.inlineData.data);
      if (byteSize < MESSAGE_IMAGE_MIN_BYTES) {
        return part;
      }

      const imageId = part.imageId || `msg-${messageId}-${index}`;
      try {
        await storeMessageImage(imageId, part.inlineData.data);
      } catch (error) {
        console.warn('Failed to store message image', error);
        return part;
      }

      let thumbnailData = part.inlineData.data;
      let thumbnailMimeType: string | undefined;
      try {
        const thumbnail = await createThumbnail(part.inlineData.data, part.inlineData.mimeType);
        thumbnailData = thumbnail.data;
        thumbnailMimeType = thumbnail.mimeType;
      } catch (error) {
        console.warn('Failed to create message thumbnail', error);
        thumbnailMimeType = part.inlineData.mimeType;
      }

      changed = true;
      return {
        ...part,
        imageId,
        imageBytes: byteSize,
        inlineData: {
          ...part.inlineData,
          data: thumbnailData,
          isThumbnail: true,
          ...(thumbnailMimeType ? { thumbnailMimeType } : {}),
        },
      };
    })
  );

  return { parts: nextParts, changed };
};

export const resolveMessageImageData = async (
  part: Part
): Promise<{ mimeType: string; data: string } | null> => {
  if (!part.inlineData?.mimeType) return null;

  if (part.imageId) {
    try {
      const stored = await getMessageImage(part.imageId);
      if (stored) {
        return { mimeType: part.inlineData.mimeType, data: stored };
      }
    } catch (error) {
      console.warn('Failed to read message image', error);
    }
  }

  if (part.inlineData.data) {
    return { mimeType: part.inlineData.mimeType, data: part.inlineData.data };
  }

  return null;
};
