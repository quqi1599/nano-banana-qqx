/**
 * 共享格式化工具函数
 */

/**
 * 格式化日期时间为本地化字符串
 * @param dateStr - 日期字符串
 * @param options - Intl.DateTimeFormatOptions 选项
 * @returns 格式化后的日期字符串
 */
export const formatDate = (
    dateStr: string | null | undefined,
    options?: Intl.DateTimeFormatOptions
): string => {
    if (!dateStr) return '—';

    // 处理缺失时区的日期字符串
    const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(dateStr);
    const normalized = hasTimezone ? dateStr : `${dateStr}Z`;
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) return dateStr;

    return date.toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...options
    });
};

/**
 * 格式化短日期（仅月日）
 * @param dateStr - 日期字符串
 * @returns 格式化后的短日期字符串
 */
export const formatShortDate = (
    dateStr: string | null | undefined
): string => {
    if (!dateStr) return '—';

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric'
    });
};

/**
 * 格式化时间（仅时分）
 * @param dateStr - 日期字符串
 * @returns 格式化后的时间字符串
 */
export const formatTime = (
    dateStr: string | null | undefined
): string => {
    if (!dateStr) return '—';

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;

    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * 格式化完整日期（年月日 + 星期）
 * @param dateStr - 日期字符串
 * @returns 格式化后的完整日期字符串
 */
export const formatFullDate = (
    dateStr: string | null | undefined
): string => {
    if (!dateStr) return '—';

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
    });
};

/**
 * 格式化 TTL（秒）为可读字符串
 * @param seconds - 秒数
 * @returns 格式化后的字符串（如 "5 分钟"）
 */
export const formatTtl = (seconds?: number | null): string => {
    if (!seconds || seconds <= 0) return '—';
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} 分钟`;
};

/**
 * 格式化数字为本地化字符串
 * @param value - 数字值
 * @returns 格式化后的数字字符串
 */
export const formatNumber = (value: number): string => {
    return value.toLocaleString('zh-CN');
};
