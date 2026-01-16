import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, ImagePlus, X, Square, Gamepad2, Sparkles, Layers, Workflow, Camera } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useUiStore } from '../store/useUiStore';
import { Attachment } from '../types';
import { PromptQuickPicker } from './PromptQuickPicker';
import { ImageValidationError, MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, MAX_TOTAL_IMAGE_BYTES, validateAndCompressImage } from '../utils/imageValidation';
import { fileToBase64, base64ToBlob } from '../utils/imageUtils';

interface Props {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  onOpenArcade?: () => void;
  isArcadeOpen?: boolean;
  onOpenPipeline?: () => void;
  disabled: boolean;
}

const formatMegabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

const getImageValidationMessage = (error?: ImageValidationError) => {
  switch (error) {
    case 'not_image':
      return '仅支持图片文件';
    case 'file_too_large':
      return `单张图片大小不得超过 ${formatMegabytes(MAX_IMAGE_BYTES)}MB`;
    case 'total_too_large':
      return `图片总大小不得超过 ${formatMegabytes(MAX_TOTAL_IMAGE_BYTES)}MB`;
    case 'invalid_dimensions':
      return '无法读取图片尺寸';
    case 'dimension_too_large':
      return `图片尺寸过大，最长边不得超过 ${MAX_IMAGE_DIMENSION}px`;
    case 'pixels_too_large':
      return `图片像素过大，建议小于 ${Math.round(MAX_IMAGE_PIXELS / 1_000_000)}MP`;
    default:
      return '图片不符合上传要求';
  }
};

export const InputArea: React.FC<Props> = ({ onSend, onStop, onOpenArcade, isArcadeOpen, onOpenPipeline, disabled }) => {
  const { inputText, setInputText } = useAppStore();
  const { togglePromptLibrary, isPromptLibraryOpen, batchMode, batchCount, setBatchMode, setBatchCount, pendingReferenceImage, setPendingReferenceImage, addToast, showDialog } = useUiStore();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isQuickPickerOpen, setIsQuickPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);

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

  // 监听待添加的参考图片
  useEffect(() => {
    if (pendingReferenceImage && attachments.length < 14) {
      const { base64Data, mimeType, timestamp } = pendingReferenceImage;

      // 创建一个虚拟 File 对象
      const fileName = `image-${timestamp}.${mimeType.split('/')[1]}`;
      const blob = base64ToBlob(base64Data, mimeType);
      const file = new File([blob], fileName, { type: mimeType });

      const newAttachment: Attachment = {
        file,
        preview: `data:${mimeType};base64,${base64Data}`,
        base64Data,
        mimeType
      };

      setAttachments(prev => [...prev, newAttachment].slice(0, 14));
      setPendingReferenceImage(null); // 清除待添加图片
    }
  }, [pendingReferenceImage, attachments.length, setPendingReferenceImage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Use more reliable mobile detection:
    // 1. Check user agent for actual mobile devices
    // 2. Check for touch screen capability combined with screen width
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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
    let totalBytes = attachments.reduce((sum, att) => sum + att.file.size, 0);

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        try {
          const validation = await validateAndCompressImage(file, totalBytes);
          if (!validation.ok) {
            const errorMsg = getImageValidationMessage(validation.error);
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
          const base64 = await fileToBase64(processedFile);
          const base64Data = base64.split(',')[1];

          // 如果压缩了，显示提示
          if (validation.compressed) {
            const originalMB = (file.size / (1024 * 1024)).toFixed(1);
            const compressedMB = (processedFile.size / (1024 * 1024)).toFixed(1);
            addToast(`${file.name} 已压缩: ${originalMB}MB → ${compressedMB}MB`, 'success');
          }

          newAttachments.push({
            file: processedFile,
            preview: base64,
            base64Data,
            mimeType: processedFile.type
          });
          totalBytes += processedFile.size;
        } catch (err) {
          console.error("Error reading file", err);
          addToast(`${file.name}: 读取失败`, 'error');
        }
      }
    }

    setAttachments(prev => [...prev, ...newAttachments].slice(0, 14));
  }, [attachments, addToast, showDialog]);

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
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if ((!inputText.trim() && attachments.length === 0) || disabled) return;

    onSend(inputText, attachments);
    setInputText('');
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

        {/* Preview Area */}
        {attachments.length > 0 && (
          <div className="flex gap-2 xs:gap-3 overflow-x-auto pt-2 xs:pt-3 pb-2 xs:pb-3 px-2 xs:px-3 mb-1.5 xs:mb-2">
            {attachments.map((att, i) => (
              <div key={i} className="relative h-16 w-16 xs:h-20 xs:w-20 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 group">
                <img
                  src={att.preview}
                  alt="preview"
                  className="h-full w-full object-cover rounded-lg opacity-80 group-hover:opacity-100 transition"
                />
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -right-1.5 xs:-right-2 -top-1.5 xs:-top-2 flex h-4 w-4 xs:h-5 xs:w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600"
                >
                  <X className="h-2.5 w-2.5 xs:h-3 xs:w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className={`relative flex flex-wrap md:flex-nowrap items-end gap-0.5 xs:gap-1 rounded-xl xs:rounded-2xl bg-gray-50 dark:bg-gray-800 p-1.5 xs:p-2 shadow-inner ring-1 transition-all duration-200 ${isDragging
            ? 'ring-2 ring-cream-400 bg-cream-50 dark:bg-cream-900/20'
            : 'ring-gray-200 dark:ring-gray-700/50 focus-within:ring-2 focus-within:ring-cream-400/50'
            }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >

          {/* Drag Overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl xs:rounded-2xl bg-cream-500/10 backdrop-blur-sm border-2 border-dashed border-cream-400">
              <div className="flex flex-col items-center gap-2 text-cream-600 dark:text-cream-400">
                <ImagePlus className="h-6 w-6 xs:h-8 xs:w-8" />
                <span className="text-xs xs:text-sm font-medium">松开鼠标以上传图片</span>
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
            capture="environment"
            className="hidden"
            ref={cameraInputRef}
            onChange={handleFileSelect}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || attachments.length >= 14}
            className="mb-0.5 xs:mb-1 flex h-9 w-9 xs:h-10 xs:w-10 shrink-0 items-center justify-center rounded-lg xs:rounded-xl text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-cream-600 dark:hover:text-cream-400 transition disabled:opacity-50 touch-feedback"
            title="上传图片"
          >
            <ImagePlus className="h-4 w-4 xs:h-5 xs:w-5" />
          </button>

          {/* 拍照按钮（仅移动端显示） */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled || attachments.length >= 14}
            className="mb-0.5 xs:mb-1 flex h-9 w-9 xs:h-10 xs:w-10 shrink-0 items-center justify-center rounded-lg xs:rounded-xl text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-cream-600 dark:hover:text-cream-400 transition disabled:opacity-50 sm:hidden touch-feedback"
            title="拍照上传"
          >
            <Camera className="h-4 w-4 xs:h-5 xs:w-5" />
          </button>

          <button
            onClick={() => setIsQuickPickerOpen(true)}
            className={`mb-0.5 xs:mb-1 flex h-9 w-9 xs:h-10 xs:w-10 shrink-0 items-center justify-center rounded-lg xs:rounded-xl transition touch-feedback ${isQuickPickerOpen
              ? 'bg-cream-100 dark:bg-cream-900/30 text-cream-600 dark:text-cream-400'
              : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-cream-600 dark:hover:text-cream-400'
              }`}
            title="快速选择提示词 (也可输入 /t)"
          >
            <Sparkles className="h-4 w-4 xs:h-5 xs:w-5" />
          </button>

          {onOpenArcade && (
            <button
              onClick={onOpenArcade}
              className={`mb-0.5 xs:mb-1 flex h-9 w-9 xs:h-10 xs:w-10 shrink-0 items-center justify-center rounded-lg xs:rounded-xl transition touch-feedback ${isArcadeOpen
                ? 'bg-cream-100 dark:bg-cream-900/30 text-cream-600 dark:text-cream-400'
                : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-cream-600 dark:hover:text-cream-400'
                }`}
              title={isArcadeOpen ? "关闭 Arcade" : "打开 Arcade"}
            >
              <Gamepad2 className="h-4 w-4 xs:h-5 xs:w-5" />
            </button>
          )}

          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="描述一张图片来生成 或上传参考图来修改 或使用/t中模板"
            className="mb-0.5 xs:mb-1 max-h-[200px] min-h-9 xs:min-h-10 w-full md:w-full order-first md:order-0 resize-none bg-transparent py-2 xs:py-2.5 text-sm xs:text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none disabled:opacity-50 overflow-hidden"
            rows={1}
            style={{ height: '36px' }}
          />

          {disabled ? (
            <button
              onClick={onStop}
              className="mb-0.5 xs:mb-1 ml-auto md:ml-0 flex h-9 w-9 xs:h-10 xs:w-10 shrink-0 items-center justify-center rounded-lg xs:rounded-xl bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600 transition touch-feedback"
              title="停止生成"
            >
              <Square className="h-3.5 w-3.5 xs:h-4 xs:w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!inputText.trim() && attachments.length === 0}
              className="mb-0.5 xs:mb-1 ml-auto md:ml-0 flex h-9 w-9 xs:h-10 xs:w-10 shrink-0 items-center justify-center rounded-lg xs:rounded-xl bg-cream-500 text-white shadow-lg shadow-cream-500/20 hover:bg-cream-600 disabled:opacity-50 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:shadow-none transition touch-feedback active:scale-95"
            >
              <Send className="h-4 w-4 xs:h-5 xs:w-5" />
            </button>
          )}
        </div>
        <div className="mt-1.5 xs:mt-2 text-center text-[10px] xs:text-xs text-gray-400 dark:text-gray-500">
          <span className="hidden sm:inline">
            回车发送,Shift + 回车换行。支持粘贴、拖拽或点击上传最多 14 张参考图片。输入 <span className="font-mono text-cream-600 dark:text-cream-400">/t</span> 快速选择提示词。
          </span>
          <span className="sm:hidden">
            点击发送按钮生成图片。支持上传、拍照最多 14 张参考图片。
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
