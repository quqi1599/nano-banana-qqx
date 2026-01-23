export type MemoryAlertLevel = 'none' | 'warn' | 'critical';

export interface MemoryAlertResult {
  level: MemoryAlertLevel;
  messageCount: number;
  imageMB: number;
  deviceMemory?: number;
  heapRatio?: number;
}

interface MemoryGuardInput {
  messageCount: number;
  imageBytes: number;
  pendingUploadBytes?: number;
}

const MB = 1024 * 1024;

const AGGRESSIVE_THRESHOLDS = {
  low: {
    warn: { messages: 18, imageMB: 110 },
    critical: { messages: 20, imageMB: 130 },
  },
  normal: {
    warn: { messages: 24, imageMB: 160 },
    critical: { messages: 28, imageMB: 200 },
  },
  heap: {
    warn: 0.85,
    critical: 0.92,
  },
} as const;

const ALERT_COOLDOWN_MS = {
  warn: 2 * 60 * 1000,
  critical: 5 * 60 * 1000,
};

let lastAlert: { level: MemoryAlertLevel; at: number } = { level: 'none', at: 0 };

const getDeviceMemory = (): number | undefined => {
  const value = (navigator as any)?.deviceMemory;
  return typeof value === 'number' ? value : undefined;
};


interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
  };
}

const getHeapRatio = (): number | undefined => {
  const perf = performance as unknown as PerformanceWithMemory;
  const memory = perf?.memory;
  if (!memory || !memory.usedJSHeapSize || !memory.jsHeapSizeLimit) {
    return undefined;
  }
  return memory.usedJSHeapSize / memory.jsHeapSizeLimit;
};

export const evaluateMemoryPressure = ({
  messageCount,
  imageBytes,
  pendingUploadBytes = 0,
}: MemoryGuardInput): MemoryAlertResult => {
  const deviceMemory = getDeviceMemory();
  const heapRatio = getHeapRatio();
  const isLowDevice = deviceMemory !== undefined && deviceMemory <= 4;
  const thresholds = isLowDevice ? AGGRESSIVE_THRESHOLDS.low : AGGRESSIVE_THRESHOLDS.normal;

  const totalBytes = imageBytes + pendingUploadBytes;
  const imageMB = Math.round(totalBytes / MB);

  const critical =
    messageCount >= thresholds.critical.messages ||
    imageMB >= thresholds.critical.imageMB ||
    (heapRatio !== undefined && heapRatio >= AGGRESSIVE_THRESHOLDS.heap.critical);

  const warn =
    messageCount >= thresholds.warn.messages ||
    imageMB >= thresholds.warn.imageMB ||
    (heapRatio !== undefined && heapRatio >= AGGRESSIVE_THRESHOLDS.heap.warn);

  const level: MemoryAlertLevel = critical ? 'critical' : warn ? 'warn' : 'none';

  return {
    level,
    messageCount,
    imageMB,
    deviceMemory,
    heapRatio,
  };
};

export const shouldShowMemoryAlert = (result: MemoryAlertResult): boolean => {
  if (result.level === 'none') return false;
  const now = Date.now();
  const cooldown = result.level === 'critical' ? ALERT_COOLDOWN_MS.critical : ALERT_COOLDOWN_MS.warn;

  if (lastAlert.level === 'critical' && result.level === 'warn') {
    return false;
  }

  if (lastAlert.level === result.level && now - lastAlert.at < cooldown) {
    return false;
  }

  lastAlert = { level: result.level, at: now };
  return true;
};

const getThresholds = (deviceMemory?: number) => {
  const isLowDevice = deviceMemory !== undefined && deviceMemory <= 4;
  return isLowDevice ? AGGRESSIVE_THRESHOLDS.low : AGGRESSIVE_THRESHOLDS.normal;
};

const formatDeviceNote = (deviceMemory?: number) => {
  if (!deviceMemory) return '';
  return `设备内存约 ${deviceMemory}GB`;
};

const formatHeapNote = (heapRatio?: number) => {
  if (heapRatio === undefined) return '';
  return `JS 堆 ${(heapRatio * 100).toFixed(0)}%`;
};

export const formatMemoryAlertTitle = (level: MemoryAlertLevel) =>
  level === 'critical' ? '内存告警' : '内存提醒';

export const formatMemoryAlertMessage = (
  result: MemoryAlertResult,
  pendingUploadBytes: number = 0
): string => {
  const pendingMB = pendingUploadBytes ? Math.round(pendingUploadBytes / MB) : 0;
  const pendingNote = pendingMB ? `，待上传约 ${pendingMB}MB` : '';
  const deviceNote = formatDeviceNote(result.deviceMemory);
  const heapNote = formatHeapNote(result.heapRatio);
  const extraNotes = [deviceNote, heapNote].filter(Boolean).join('，');
  const extraLine = extraNotes ? `设备状态：${extraNotes}` : '';
  const headline =
    result.level === 'critical'
      ? '内存已接近上限，继续可能白屏或崩溃。'
      : '图片/对话偏大，可能导致浏览器内存不足。';
  const suggestion =
    result.level === 'critical'
      ? '建议立即开启新对话或减少图片。'
      : '建议开启新对话或减少图片。';

  return [
    headline,
    suggestion,
    `当前对话：${result.messageCount} 条，图片约 ${result.imageMB}MB${pendingNote}`,
    extraLine,
  ]
    .filter(Boolean)
    .join('\n');
};

export const getMemoryPressureProgress = (result: MemoryAlertResult): number => {
  const thresholds = getThresholds(result.deviceMemory);
  const ratios: number[] = [
    result.messageCount / thresholds.critical.messages,
    result.imageMB / thresholds.critical.imageMB,
  ];
  if (result.heapRatio !== undefined) {
    ratios.push(result.heapRatio / AGGRESSIVE_THRESHOLDS.heap.critical);
  }
  const ratio = Math.max(...ratios);
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(1, ratio));
};

export const formatMemoryPressureLabel = (
  progress: number,
  result: MemoryAlertResult
): string => {
  const percent = Math.round(progress * 100);
  return result.level === 'critical'
    ? `内存压力 ${percent}%（高）`
    : `内存压力 ${percent}%`;
};
