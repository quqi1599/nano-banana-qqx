export const getBase64ByteSize = (base64: string): number => {
  const padding = (base64.match(/=/g) || []).length;
  return Math.floor((base64.length * 3) / 4) - padding;
};
