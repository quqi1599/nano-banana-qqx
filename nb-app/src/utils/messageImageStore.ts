import { get as getVal, set as setVal, del as delVal } from 'idb-keyval';

const MESSAGE_IMAGE_PREFIX = 'message_image_';

const buildKey = (id: string) => `${MESSAGE_IMAGE_PREFIX}${id}`;

export const storeMessageImage = async (id: string, base64Data: string): Promise<void> => {
  await setVal(buildKey(id), base64Data);
};

export const getMessageImage = async (id: string): Promise<string | undefined> => {
  return (await getVal(buildKey(id))) as string | undefined;
};

export const deleteMessageImage = async (id: string): Promise<void> => {
  await delVal(buildKey(id));
};
