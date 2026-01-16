/**
 * Z-Index 层级配置
 *
 * 层级体系：
 * - 10-19: 普通内容
 * - 20-29: 悬浮元素（badge, dropdown）
 * - 30-39: 固定侧边栏
 * - 40-49: 背景遮罩
 * - 50-59: 普通模态框
 * - 60-69: 高级模态框（全屏 lightbox）
 * - 70-79: Toast 通知
 * - 80-89: 顶层元素（guide tour）
 * - 90-99: 最高层级（全局弹窗）
 */

/** 背景遮罩 */
export const Z_MODAL_BACKDROP = 40;

/** 普通模态框 */
export const Z_MODAL = 50;

/** 全屏 Lightbox / 高级模态框 */
export const Z_LIGHTBOX = 60;

/** Toast 通知 */
export const Z_TOAST = 100;

/** 全局弹窗（最高优先级） */
export const Z_GLOBAL_DIALOG = 100;

/** 侧边栏 */
export const Z_SIDEBAR = 50;
