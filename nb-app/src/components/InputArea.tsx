import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, ImagePlus, X, Square, Gamepad2, Sparkles, Layers, Workflow, Camera } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useUiStore } from '../store/useUiStore';
import { Attachment } from '../types';
import { PromptQuickPicker } from './PromptQuickPicker';
import { validateAndCompressImage } from '../utils/imageValidation';
import { getImageValidationMessage } from '../utils/validationMessages';
import { base64ToBlob } from '../utils/imageUtils';
import { convertMessagesToHistory } from '../utils/messageUtils';
import { calculateHistoryImageSize } from '../utils/historyUtils';
import { evaluateMemoryPressure, shouldShowMemoryAlert, formatMemoryAlertMessage, formatMemoryAlertTitle, getMemoryPressureProgress, formatMemoryPressureLabel } from '../utils/memoryGuard';

const MAX_ATTACHMENTS = 14;
interface Props {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  onOpenArcade?: () => void;
  isArcadeOpen?: boolean;
  onOpenPipeline?: () => void;
  disabled: boolean;
}


export const InputArea: React.FC<Props> = ({ onSend, onStop, onOpenArcade, isArcadeOpen, onOpenPipeline, disabled }) => {
  const { inputText, setInputText, clearHistory } = useAppStore();
  const { togglePromptLibrary, isPromptLibraryOpen, batchMode, batchCount, setBatchMode, setBatchCount, pendingReferenceImage, setPendingReferenceImage, addToast, showDialog } = useUiStore();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isQuickPickerOpen, setIsQuickPickerOpen] = useState(false);
  const [isCameraSupported, setIsCameraSupported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);
  const attachmentsRef = useRef<Attachment[]>([]);

  const revokeAttachmentPreview = useCallback((attachment: Attachment) => {
    if (attachment.previewIsObjectUrl) {
      URL.revokeObjectURL(attachment.preview);
    }
  }, []);

  const showMemoryAlert = useCallback((pendingUploadBytes: number = 0) => {
    const currentMessages = useAppStore.getState().messages;
    const historySnapshot = convertMessagesToHistory(currentMessages);
    const imageBytes = calculateHistoryImageSize(historySnapshot);

    const result = evaluateMemoryPressure({
      messageCount: currentMessages.length,
      imageBytes,
      pendingUploadBytes,
    });

    if (result.level === 'none') return;
    if (!shouldShowMemoryAlert(result)) return;
    if (useUiStore.getState().dialog) return;

    if (result.level === 'critical') {
      const progress = getMemoryPressureProgress(result);
      showDialog({
        type: 'confirm',
        title: formatMemoryAlertTitle(result.level),
        message: formatMemoryAlertMessage(result, pendingUploadBytes),
        confirmLabel: '新对话',
        cancelLabel: '继续',
        progress,
        progressLabel: formatMemoryPressureLabel(progress, result),
        onConfirm: () => clearHistory(),
      });
    } else {
      const progress = getMemoryPressureProgress(result);
      showDialog({
        type: 'alert',
        title: formatMemoryAlertTitle(result.level),
        message: formatMemoryAlertMessage(result, pendingUploadBytes),
        confirmLabel: '知道了',
        progress,
        progressLabel: formatMemoryPressureLabel(progress, result),
      });
    }
  }, [clearHistory, showDialog]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach(revokeAttachmentPreview);
    };
  }, [revokeAttachmentPreview]);

  // Auto-resize textarea
  const autoResizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  // Auto-resize when input text changes
  useEffect(() => {
    autoResizeTextarea();
  }, [inputText, autoResizeTextarea]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const input = document.createElement('input');
    const supportsCapture = 'capture' in input;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isLikelyMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || isTouchDevice;
    const hasCameraApi = !!navigator.mediaDevices?.getUserMedia;
    setIsCameraSupported(supportsCapture && isLikelyMobile && hasCameraApi);
  }, []);

  // 监听待添加的参考图片
  useEffect(() => {
    if (pendingReferenceImage && attachments.length < MAX_ATTACHMENTS) {
      const { base64Data, mimeType, timestamp } = pendingReferenceImage;

      // 创建一个虚拟 File 对象
      const fileName = `image-${timestamp}.${mimeType.split('/')[1]}`;
      const blob = base64ToBlob(base64Data, mimeType);
      const file = new File([blob], fileName, { type: mimeType });

      const previewUrl = URL.createObjectURL(file);
      const newAttachment: Attachment = {
        file,
        preview: previewUrl,
        previewIsObjectUrl: true,
        mimeType
      };

      setAttachments(prev => {
        const next = [...prev, newAttachment];
        const limited = next.slice(0, MAX_ATTACHMENTS);
        if (next.length > MAX_ATTACHMENTS) {
          next.slice(MAX_ATTACHMENTS).forEach(revokeAttachmentPreview);
        }
        return limited;
      });
      setPendingReferenceImage(null); // 清除待添加图片
    }
  }, [pendingReferenceImage, attachments.length, setPendingReferenceImage, revokeAttachmentPreview]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Use more reliable mobile detection:
    // 1. Check user agent for actual mobile devices
    // 2. Check for touch screen capability combined with screen width
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+
    const isTouchScreen = 'ontouchstart' in window;
    const isMobile = isMobileDevice || (isTouchScreen && window.innerWidth < 768);

    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files) {
      await processFiles(Array.from(e.currentTarget.files));
      // Reset inputs
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const processFiles = useCallback(async (files: File[]) => {
    const newAttachments: Attachment[] = [];
    if (attachments.length >= 14) {
      addToast('最多只能上传 14 张图片', 'info');
      return;
    }
    const pendingUploadBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (pendingUploadBytes > 0) {
      showMemoryAlert(pendingUploadBytes);
    }
    let totalBytes = attachments.reduce((sum, att) => sum + att.file.size, 0);

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        try {
          const validation = await validateAndCompressImage(file, totalBytes);
          if (!validation.ok) {
            // TypeScript sometimes needs explicit checking or casting if narrowing fails unexpectedly
            const error = 'error' in validation ? validation.error : undefined;
            const errorMsg = getImageValidationMessage(error);
            // 只有无法压缩的错误才弹窗
            showDialog({
              type: 'alert',
              title: '图片上传失败',
              message: `${file.name}\n\n${errorMsg}`,
            });
            continue;
          }

          // 使用验证返回的文件（可能是压缩后的）
          const processedFile = validation.file || file;
          const previewUrl = URL.createObjectURL(processedFile);

          // 如果压缩了，显示提示
          if (validation.compressed) {
            const originalMB = (file.size / (1024 * 1024)).toFixed(1);
            const compressedMB = (processedFile.size / (1024 * 1024)).toFixed(1);
            addToast(`${file.name} 已压缩: ${originalMB}MB → ${compressedMB}MB`, 'success');
          }

          newAttachments.push({
            file: processedFile,
            preview: previewUrl,
            previewIsObjectUrl: true,
            mimeType: processedFile.type
          });
          totalBytes += processedFile.size;
        } catch (err) {
          console.error("Error reading file", err);
          addToast(`${file.name}: 读取失败`, 'error');
        }
      }
    }

    setAttachments(prev => {
      const next = [...prev, ...newAttachments];
      const limited = next.slice(0, 14);
      if (next.length > 14) {
        next.slice(14).forEach(revokeAttachmentPreview);
      }
      return limited;
    });
  }, [attachments, addToast, showDialog, revokeAttachmentPreview]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (disabled || attachments.length >= 14) return;

      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const imageFiles = Array.from(clipboardData.items)
        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter((file): file is File => !!file);

      if (imageFiles.length === 0) return;

      event.preventDefault();
      processFiles(imageFiles);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [disabled, processFiles, attachments.length]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current++;

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current--;

    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
    dragCounter.current = 0;

    if (disabled || attachments.length >= 14) return;

    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const target = prev[index];
      if (target) {
        revokeAttachmentPreview(target);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = () => {
    if ((!inputText.trim() && attachments.length === 0) || disabled) return;

    onSend(inputText, attachments);
    setInputText('');
    attachments.forEach(revokeAttachmentPreview);
    setAttachments([]);
  };

  // 监听输入变化，检测 /t 触发
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.currentTarget.value;
    setInputText(value);

    // 检测 /t 触发（结尾是 /t 或 /t 后面跟着空格）
    if (value.endsWith('/t') || value.match(/\/t\s*$/)) {
      setIsQuickPickerOpen(true);
    }
  };

  // 处理快速选择器选择
  const handleQuickPickerSelect = (prompt: string) => {
    // 替换 /t 为实际提示词
    const newText = inputText.replace(/\/t\s*/g, prompt);
    setInputText(newText);
    setIsQuickPickerOpen(false);

    // 聚焦回输入框
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  return (
    <div className="border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-2 xs:p-2.5 sm:p-3 lg:p-4 pb-safe-offset-4 transition-colors duration-200">
      <div className="mx-auto max-w-4xl">

        {/* Batch Mode Selector */}
        {!disabled && (
          <div className="flex items-center gap-1.5 xs:gap-2 mb-2 xs:mb-3">
            <Layers className="h-3.5 w-3.5 xs:h-4 xs:w-4 text-gray-400" />
            <div className="flex items-center gap-1 xs:gap-2 flex-1 flex-wrap">
              <button
                onClick={() => setBatchMode(batchMode === 'off' ? 'normal' : 'off')}
                className={`px-2 xs:px-3 py-1 xs:py-1.5 rounded-md xs:rounded-lg text-[10px] xs:text-xs font-medium transition ${batchMode === 'normal'
                  ? 'bg-cream-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
              >
                <span className="hidden xs:inline">批量生成</span>
                <span className="xs:hidden">批量</span>
              </button>

              {/* Pipeline Button */}
              {onOpenPipeline && (
                <button
                  onClick={onOpenPipeline}
                  className="px-2 xs:px-3 py-1 xs:py-1.5 rounded-md xs:rounded-lg text-[10px] xs:text-xs font-medium transition bg-cream-100 dark:bg-cream-900/30 text-cream-600 dark:text-cream-400 hover:bg-cream-200 dark:hover:bg-cream-800/40"
                >
                  <Workflow className="h-2.5 w-2.5 xs:h-3 xs:w-3 inline mr-0.5 xs:mr-1" />
                  <span className="hidden sm:inline">批量编排(实验功能)</span>
                  <span className="sm:hidden">编排</span>
                </button>
              )}

              {batchMode === 'normal' && (
                <div className="flex items-center gap-0.5 xs:gap-1 ml-1 xs:ml-2">
                  <span className="text-[10px] xs:text-xs text-gray-500 dark:text-gray-400">数量:</span>
                  {[1, 2, 3, 4].map((num) => (
                    <button
                      key={num}
                      onClick={() => setBatchCount(num)}
                      className={`w-6 h-6 xs:w-7 xs:h-7 rounded text-[10px] xs:text-xs font-medium transition ${batchCount === num
                        ? 'bg-cream-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              )}

              {batchMode === 'normal' && (
                <span className="text-[10px] xs:text-xs text-cream-600 dark:text-cream-400 ml-auto">
                  将生成 {batchCount} 次
                </span>
              )}
            </div>
          </div>
        )}

        {/* Preview Area - 附件预览 */}
        {attachments.length > 0 && (
          <div className="flex gap-2.5 overflow-x-auto py-3 px-1 mb-2 scrollbar-hide">
            {attachments.map((att, i) => (
              <div 
                key={i} 
                className="relative h-18 w-18 xs:h-20 xs:w-20 shrink-0 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 group overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
              >
                <img
                  src={att.preview}
                  alt="preview"
                  className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                />
                {/* 悬停遮罩 */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                {/* 删除按钮 */}
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 hover:scale-110 transition-all duration-200 active:scale-90"
                >
                  <X className="h-3 w-3" />
                </button>
                {/* 序号标签 */}
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/40 backdrop-blur-sm text-white text-[9px] font-medium">
                  {i + 1}
                </div>
              </div>
            ))}
            {/* 添加更多占位 */}
            {attachments.length < MAX_ATTACHMENTS && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-18 w-18 xs:h-20 xs:w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:border-cream-400 hover:text-cream-500 transition-colors"
              >
                <ImagePlus className="h-6 w-6" />
              </button>
            )}
          </div>
        )}

        {/* Mobile Upload Actions */}
        <div className="sm:hidden flex items-center gap-2 px-2 xs:px-3 mb-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || attachments.length >= 14}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
            上传图片
          </button>
          {isCameraSupported && (
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled || attachments.length >= 14}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              拍照
            </button>
          )}
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {attachments.length}/{MAX_ATTACHMENTS}
          </span>
        </div>

        <div
          className={`relative flex flex-wrap md:flex-nowrap items-end gap-1 rounded-2xl bg-white dark:bg-gray-800/80 p-2 shadow-lg ring-1 transition-all duration-300 ${isDragging
            ? 'ring-2 ring-cream-400 shadow-cream-500/20 bg-cream-50/50 dark:bg-cream-900/10'
            : 'ring-gray-200 dark:ring-gray-700/50 focus-within:ring-2 focus-within:ring-cream-400 focus-within:shadow-cream-500/10'
            }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >

          {/* Drag Overlay - 拖拽上传遮罩 */}
          {isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-gradient-to-br from-cream-500/20 to-amber-500/10 backdrop-blur-sm border-2 border-dashed border-cream-400 animate-in fade-in duration-200">
              <div className="flex flex-col items-center gap-3 text-cream-600 dark:text-cream-400">
                <div className="p-4 rounded-2xl bg-cream-100 dark:bg-cream-900/30">
                  <ImagePlus className="h-8 w-8" />
                </div>
                <span className="text-sm font-semibold">松开鼠标以上传图片</span>
              </div>
            </div>
          )}
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileSelect}
          />

          {/* 拍照输入（移动端） */}
          <input
            type="file"
            accept="image/*"
            capture={isCameraSupported ? 'environment' : undefined}
            className="hidden"
            ref={cameraInputRef}
            onChange={handleFileSelect}
          />

          {/* 上传图片按钮 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || attachments.length >= 14}
            className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-cream-50 dark:hover:bg-cream-900/20 hover:text-cream-500 transition-all duration-200 disabled:opacity-40 hover:scale-105 active:scale-95"
            title="上传图片 (最多14张)"
          >
            <ImagePlus className="h-5 w-5" />
          </button>

          {/* 快速提示词按钮 */}
          <button
            onClick={() => setIsQuickPickerOpen(true)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${isQuickPickerOpen
              ? 'bg-gradient-to-br from-cream-400 to-amber-500 text-white shadow-md shadow-cream-500/30'
              : 'text-gray-400 hover:bg-cream-50 dark:hover:bg-cream-900/20 hover:text-cream-500 hover:scale-105 active:scale-95'
              }`}
            title="快速选择提示词 (输入 /t)"
          >
            <Sparkles className="h-5 w-5" />
          </button>

          {/* Arcade 游戏按钮 */}
          {onOpenArcade && (
            <button
              onClick={onOpenArcade}
              className={`hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${isArcadeOpen
                ? 'bg-gradient-to-br from-purple-400 to-pink-500 text-white shadow-md shadow-purple-500/30'
                : 'text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-500 hover:scale-105 active:scale-95'
                }`}
              title={isArcadeOpen ? "关闭 Arcade" : "打开 Arcade"}
            >
              <Gamepad2 className="h-5 w-5" />
            </button>
          )}

          {/* 文本输入框 */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            enterKeyHint="send"
            placeholder={attachments.length > 0 ? "描述你对图片的要求..." : "描述一张图片，例如：一只可爱的猫咪在花园里玩耍..."}
            className="max-h-[160px] min-h-[44px] w-full resize-none bg-transparent py-2.5 px-2 text-[15px] leading-relaxed text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none disabled:opacity-50 overflow-hidden"
            rows={1}
            style={{ height: '44px' }}
          />

          {/* 发送/停止按钮 */}
          {disabled ? (
            <button
              onClick={onStop}
              className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/40 hover:scale-105 active:scale-95 transition-all duration-200 animate-pulse"
              title="停止生成"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!inputText.trim() && attachments.length === 0}
              className={`ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
                inputText.trim() || attachments.length > 0
                  ? 'bg-gradient-to-br from-cream-400 to-amber-500 text-white shadow-lg shadow-cream-500/30 hover:shadow-cream-500/40 hover:scale-105 active:scale-95'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
              title="发送"
            >
              <Send className="h-5 w-5" />
            </button>
          )}
        </div>
        {/* 底部提示 */}
        <div className="mt-2 text-center">
          <span className="hidden sm:inline text-[11px] text-gray-400 dark:text-gray-500">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px] font-sans">Enter</kbd>
              发送
            </span>
            <span className="mx-1.5 text-gray-300">·</span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px] font-sans">Shift</kbd>
              +
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px] font-sans">Enter</kbd>
              换行
            </span>
            <span className="mx-1.5 text-gray-300">·</span>
            支持粘贴/拖拽上传
            <span className="mx-1.5 text-gray-300">·</span>
            输入
            <kbd className="mx-1 px-1.5 py-0.5 rounded bg-cream-100 dark:bg-cream-900/30 text-cream-600 dark:text-cream-400 text-[10px] font-mono">/t</kbd>
            快速提示词
          </span>
          <span className="sm:hidden text-[10px] text-gray-400 dark:text-gray-500">
            点击发送按钮生成图片 · 最多 14 张参考图
          </span>
        </div>
      </div>

      {/* 快速提示词选择器 */}
      <PromptQuickPicker
        isOpen={isQuickPickerOpen}
        onClose={() => setIsQuickPickerOpen(false)}
        onSelect={handleQuickPickerSelect}
      />
    </div>
  );
};
