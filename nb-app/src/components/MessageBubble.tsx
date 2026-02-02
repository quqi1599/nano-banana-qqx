import React, { useState, useEffect, useRef, Suspense } from 'react';
import { ChatMessage, Part } from '../types';
import { User, Sparkles, ChevronDown, ChevronRight, BrainCircuit, Trash2, RotateCcw, Download, Edit, PackageOpen, MessageCircle } from 'lucide-react';
import { useUiStore } from '../store/useUiStore';
import { downloadImage, openImageInNewTab, downloadDatasetZip } from '../utils/imageUtils';
import { resolveMessageImageData } from '../utils/messageImageUtils';
import { WeChatQRModal } from './WeChatQRModal';
import { ImageGallery } from './ImageGallery';
const MarkdownRenderer = React.lazy(() => import('./MarkdownRenderer'));

// Lazy-loaded markdown component with Suspense fallback
const LazyMarkdown: React.FC<{ children: string }> = ({ children }) => {
  return (
    <Suspense fallback={<p className="whitespace-pre-wrap break-words">{children}</p>}>
      <MarkdownRenderer text={children} />
    </Suspense>
  );
};

const getThumbnailMimeType = (part: Part) => {
  if (!part.inlineData) return 'image/jpeg';
  if (!part.inlineData.isThumbnail) return part.inlineData.mimeType;
  if (part.inlineData.thumbnailMimeType) return part.inlineData.thumbnailMimeType;
  return part.inlineData.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
};

const getPreviewMimeType = (part: Part, fullData: string | null) => {
  if (fullData) {
    return part.inlineData?.mimeType || 'image/jpeg';
  }
  return getThumbnailMimeType(part);
};

const useLazyFullImage = (part: Part) => {
  const [fullData, setFullData] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!part.imageId || !part.inlineData?.isThumbnail) return;
    const node = containerRef.current;
    if (!node) return;
    let canceled = false;

    if (typeof IntersectionObserver === 'undefined') {
      resolveMessageImageData(part).then((resolved) => {
        if (!canceled && resolved?.data) {
          setFullData(resolved.data);
        }
      });
      return () => {
        canceled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          resolveMessageImageData(part).then((resolved) => {
            if (!canceled && resolved?.data) {
              setFullData(resolved.data);
            }
          });
        } else {
          setFullData(null);
        }
      },
      { root: null, rootMargin: '200px', threshold: 0.1 }
    );

    observer.observe(node);
    return () => {
      canceled = true;
      observer.disconnect();
    };
  }, [part.imageId, part.inlineData?.isThumbnail, part.inlineData?.mimeType, part.inlineData?.data]);

  return { fullData, containerRef };
};

interface Props {
  message: ChatMessage;
  isLast: boolean;
  isGenerating: boolean;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
}

const ThinkingContentItem: React.FC<{ part: Part }> = ({ part }) => {
  const [isImageHovered, setIsImageHovered] = useState(false);
  const { setPendingReferenceImage, addToast } = useUiStore();
  const { fullData, containerRef } = useLazyFullImage(part);

  if (part.text) {
    return (
      <div className="mb-2 last:mb-0">
        <Suspense fallback={<p className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{part.text}</p>}>
          <MarkdownRenderer text={part.text} />
        </Suspense>
      </div>
    );
  }

  if (part.inlineData) {
    const handleReEdit = async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const resolved = fullData
        ? { mimeType: part.inlineData!.mimeType, data: fullData }
        : await resolveMessageImageData(part);
      if (!resolved?.data) {
        addToast('图片加载失败，请重试', 'error');
        return;
      }
      setPendingReferenceImage({
        base64Data: resolved.data,
        mimeType: resolved.mimeType,
        timestamp: Date.now()
      });
    };

    const handleOpen = async () => {
      const resolved = fullData
        ? { mimeType: part.inlineData!.mimeType, data: fullData }
        : await resolveMessageImageData(part);
      if (!resolved?.data) {
        addToast('图片加载失败，请重试', 'error');
        return;
      }
      openImageInNewTab(resolved.mimeType, resolved.data);
    };

    const handleDownload = async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const resolved = fullData
        ? { mimeType: part.inlineData!.mimeType, data: fullData }
        : await resolveMessageImageData(part);
      if (!resolved?.data) {
        addToast('图片加载失败，请重试', 'error');
        return;
      }
      downloadImage(resolved.mimeType, resolved.data);
    };

    return (
      <div
        ref={containerRef}
        className="relative my-2 overflow-hidden rounded-md border border-gray-200 dark:border-gray-700/50 bg-gray-100 dark:bg-black/20 max-w-sm mx-auto group"
        onMouseEnter={() => setIsImageHovered(true)}
        onMouseLeave={() => setIsImageHovered(false)}
      >
        <img
          src={`data:${getPreviewMimeType(part, fullData)};base64,${fullData || part.inlineData.data}`}
          alt="Thinking process sketch"
          className="h-auto max-w-full object-contain opacity-80 hover:opacity-100 transition cursor-pointer"
          loading="lazy"
          onClick={handleOpen}
          title="点击查看大图"
        />

        {/* Action Buttons - touch-show-actions makes them visible on touch devices */}
        <div className={`absolute top-2 right-2 flex gap-2 transition-all touch-show-actions ${isImageHovered ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={handleReEdit}
            className="p-2.5 rounded-lg bg-cream-500 hover:bg-cream-600 text-white shadow-lg backdrop-blur-sm transition-all touch-feedback active:scale-90"
            title="再次编辑"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2.5 rounded-lg bg-black/60 hover:bg-black/80 text-white shadow-lg backdrop-blur-sm transition-all touch-feedback active:scale-90"
            title="下载图片"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
};

const ImageWithDownload: React.FC<{ part: Part; index: number }> = ({ part, index }) => {
  const [isImageHovered, setIsImageHovered] = useState(false);
  const { setPendingReferenceImage, addToast } = useUiStore();
  const { fullData, containerRef } = useLazyFullImage(part);

  if (!part.inlineData) return null;

  const handleReEdit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const resolved = fullData
      ? { mimeType: part.inlineData!.mimeType, data: fullData }
      : await resolveMessageImageData(part);
    if (!resolved?.data) {
      addToast('图片加载失败，请重试', 'error');
      return;
    }
    setPendingReferenceImage({
      base64Data: resolved.data,
      mimeType: resolved.mimeType,
      timestamp: Date.now()
    });
  };

  const handleOpen = async () => {
    const resolved = fullData
      ? { mimeType: part.inlineData!.mimeType, data: fullData }
      : await resolveMessageImageData(part);
    if (!resolved?.data) {
      addToast('图片加载失败，请重试', 'error');
      return;
    }
    openImageInNewTab(resolved.mimeType, resolved.data);
  };

  const handleDownload = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const resolved = fullData
      ? { mimeType: part.inlineData!.mimeType, data: fullData }
      : await resolveMessageImageData(part);
    if (!resolved?.data) {
      addToast('图片加载失败，请重试', 'error');
      return;
    }
    downloadImage(resolved.mimeType, resolved.data);
  };

  return (
    <div
      key={index}
      ref={containerRef}
      className="relative mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-950/50 max-w-lg mx-auto group"
      onMouseEnter={() => setIsImageHovered(true)}
      onMouseLeave={() => setIsImageHovered(false)}
    >
      <img
        src={`data:${getPreviewMimeType(part, fullData)};base64,${fullData || part.inlineData.data}`}
        alt="Generated or uploaded content"
        className="h-auto max-w-full object-contain cursor-pointer"
        loading="lazy"
        onClick={handleOpen}
        title="点击查看大图"
      />

      {/* Action Buttons - touch-show-actions makes them visible on touch devices */}
      <div className={`absolute top-3 right-3 flex gap-2 transition-all touch-show-actions ${isImageHovered ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={handleReEdit}
          className="p-2.5 rounded-lg bg-cream-500 hover:bg-cream-600 text-white shadow-lg backdrop-blur-sm transition-all"
          title="再次编辑"
        >
          <Edit className="h-5 w-5" />
        </button>
        <button
          onClick={handleDownload}
          className="p-2.5 rounded-lg bg-black/60 hover:bg-black/80 text-white shadow-lg backdrop-blur-sm transition-all"
          title="下载图片"
        >
          <Download className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

const ThinkingBlock: React.FC<{ parts: Part[], duration?: number, isFinished: boolean }> = ({ parts, duration, isFinished }) => {
  const [isExpanded, setIsExpanded] = useState(!isFinished);

  useEffect(() => {
    if (isFinished) {
      setIsExpanded(false);
    }
  }, [isFinished]);

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-purple-200/50 dark:border-purple-800/30 bg-gradient-to-br from-purple-50/80 to-indigo-50/50 dark:from-purple-900/20 dark:to-indigo-900/10">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-xs font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100/50 dark:hover:bg-purple-800/20 transition-all duration-200 group"
      >
        <div className={`
          flex items-center justify-center w-5 h-5 rounded-full bg-purple-200/50 dark:bg-purple-800/40
          transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}
        `}>
          <ChevronDown className="h-3 w-3" />
        </div>
        <BrainCircuit className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
        <span className="font-semibold">思考过程</span>
        {duration !== undefined && duration > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-purple-200/50 dark:bg-purple-800/40 text-purple-600 dark:text-purple-300">
            {duration.toFixed(1)}s
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-purple-200/50 dark:border-purple-800/20 px-4 py-4">
          {parts.map((part, i) => <ThinkingContentItem key={i} part={part} />)}
        </div>
      )}
    </div>
  );
};

export const MessageBubble = React.memo<Props>(({ message, isLast, isGenerating, onDelete, onRegenerate }) => {
  const isUser = message.role === 'user';
  const [showActions, setShowActions] = useState(false);
  const [showWeChatQR, setShowWeChatQR] = useState(false);
  const actionsDisabled = isGenerating;
  const { showDialog, addToast } = useUiStore();

  const handleDelete = () => {
    showDialog({
      type: 'confirm',
      title: '删除消息',
      message: "您确定要删除这条消息吗？",
      confirmLabel: "删除",
      onConfirm: () => onDelete(message.id)
    });
  };

  // 检查是否是数据集生成消息（包含多张带 prompt 的图片）
  const imageParts = message.parts.filter(p => p.inlineData && !p.thought);
  const isDatasetMessage = !isUser && imageParts.length >= 5 && imageParts.some(p => p.prompt);

  const handleDownloadDataset = async () => {
    try {
      type DatasetPart = { mimeType: string; data: string; prompt?: string };
      const datasetParts = await Promise.all(
        imageParts.map(async (p): Promise<DatasetPart | null> => {
          const resolved = await resolveMessageImageData(p);
          if (!resolved?.data) return null;
          return {
            mimeType: resolved.mimeType,
            data: resolved.data,
            prompt: p.prompt
          };
        })
      );

      const validParts = datasetParts.filter((p): p is DatasetPart => p !== null);
      if (validParts.length === 0) {
        addToast('没有可下载的图片', 'error');
        return;
      }

      await downloadDatasetZip(validParts);
      addToast('数据集下载成功！', 'success');
    } catch (error) {
      console.error('下载数据集失败:', error);
      addToast('数据集下载失败，请重试', 'error');
    }
  };

  // Group parts: consecutive thinking parts should be grouped together
  const groupedParts: (Part | Part[])[] = [];

  message.parts.forEach((part) => {
    const lastGroup = groupedParts[groupedParts.length - 1];

    if (part.thought) {
      if (Array.isArray(lastGroup)) {
        // Append to existing thinking group
        lastGroup.push(part);
      } else {
        // Start new thinking group
        groupedParts.push([part]);
      }
    } else {
      // Regular part (Text or Image)
      groupedParts.push(part);
    }
  });

  const renderContent = (item: Part | Part[], index: number) => {
    // 1. Handle Thinking Block Group
    if (Array.isArray(item)) {
      return <ThinkingBlock key={`think-${index}`} parts={item} duration={message.thinkingDuration} isFinished={!isLast || !isGenerating} />;
    }

    const part = item;

    // 2. Handle Text (Markdown)
    if (part.text) {
      return (
        <div key={index} className="markdown-content leading-relaxed wrap-break-word overflow-hidden">
          <LazyMarkdown>{part.text}</LazyMarkdown>
        </div>
      );
    }

    // 3. Handle Images - 单张图片使用 ImageWithDownload，多张使用 ImageGallery
    if (part.inlineData) {
      // 检查接下来连续的图片数量
      const startIndex = groupedParts.indexOf(part);
      if (startIndex === index) {
        // 收集从当前位置开始的所有连续图片
        const consecutiveImages: Part[] = [];
        for (let i = index; i < groupedParts.length; i++) {
          const p = groupedParts[i];
          if (!Array.isArray(p) && p.inlineData && !p.thought) {
            consecutiveImages.push(p);
          } else {
            break;
          }
        }

        // 如果有多张连续图片，使用 ImageGallery
        if (consecutiveImages.length > 1) {
          return <ImageGallery key={`gallery-${index}`} parts={consecutiveImages} />;
        }
      }

      // 单张图片或非首个连续图片（已被合并到 Gallery 中）
      // 检查是否已经被之前的 Gallery 处理
      for (let i = 0; i < index; i++) {
        const p = groupedParts[i];
        if (!Array.isArray(p) && p.inlineData && !p.thought) {
          // 检查从 i 开始的连续图片是否包含当前 index
          let j = i;
          while (j < groupedParts.length) {
            const pp = groupedParts[j];
            if (!Array.isArray(pp) && pp.inlineData && !pp.thought) {
              if (j === index && j > i) {
                // 当前图片已被之前的 Gallery 包含，跳过渲染
                return null;
              }
              j++;
            } else {
              break;
            }
          }
        }
      }

      return <ImageWithDownload key={index} part={part} index={index} />;
    }
    return null;
  };

  return (
    <div
      className={`flex w-full gap-3 ${isUser ? 'justify-end' : 'justify-start'} group message-bubble`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >

      {!isUser && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cream-400 via-amber-500 to-orange-500 shadow-lg shadow-amber-500/25 mt-1 ring-2 ring-white dark:ring-gray-800">
          <Sparkles className="h-4 w-4 text-white drop-shadow-sm" />
        </div>
      )}

      <div className={`flex max-w-[88%] sm:max-w-[80%] md:max-w-[75%] flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`relative rounded-2xl px-5 py-4 shadow-sm w-full transition-all duration-200 ${isUser
            ? 'bg-gradient-to-br from-cream-400 to-amber-500 text-white rounded-tr-sm shadow-amber-500/20'
            : 'bg-white dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 rounded-tl-sm border border-gray-200/80 dark:border-gray-700/50 shadow-sm'
            }`}
        >
          {groupedParts.map((item, i) => renderContent(item, i))}

          {message.isError && (
            <div className="mt-4 p-5 rounded-2xl bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/10 border border-red-200/80 dark:border-red-800/30 shadow-sm">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                  <span className="text-xl">😔</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
                    图片生成失败
                  </div>
                  <div className="text-xs text-red-500/80 dark:text-red-400/80 leading-relaxed">
                    可能是网络波动或服务暂时繁忙，给您带来不便深表歉意
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowWeChatQR(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium text-sm shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="hidden xs:inline">加入交流群获取技术支持</span>
                <span className="xs:hidden">加入交流群</span>
                <span className="text-lg">💬</span>
              </button>
            </div>
          )}

          {/* 交流群弹窗 */}
          <WeChatQRModal isOpen={showWeChatQR} onClose={() => setShowWeChatQR(false)} />

          {/* 数据集下载按钮 */}
          {isDatasetMessage && !actionsDisabled && (
            <div className="mt-4 pt-4 border-t border-gray-200/80 dark:border-gray-700/50">
              <button
                onClick={handleDownloadDataset}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-gradient-to-r from-cream-400 via-amber-500 to-orange-500 hover:from-cream-500 hover:via-amber-600 hover:to-orange-600 text-white font-semibold text-sm shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 group"
              >
                <div className="p-1.5 rounded-lg bg-white/20 group-hover:bg-white/30 transition-colors">
                  <PackageOpen className="h-4 w-4" />
                </div>
                <span className="hidden xs:inline">下载 AI-Toolkit 训练数据集</span>
                <span className="xs:hidden">下载数据集</span>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-xs">{imageParts.length} 张</span>
              </button>
              <p className="mt-2 text-[10px] text-center text-gray-500 dark:text-gray-400 leading-relaxed">
                包含图片及对应文本标注，可直接用于 AI-toolkit 训练
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium tracking-wide">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>

          {/* Actions */}
          {!actionsDisabled && (
            <div className={`flex items-center gap-0.5 transition-all duration-200 touch-show-actions ${showActions ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`}>
              <button
                onClick={() => onRegenerate(message.id)}
                className="p-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-cream-900/30 text-gray-400 hover:text-cream-600 dark:hover:text-cream-400 transition-colors"
                title="重新生成"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="删除消息"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {isUser && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 mt-1 ring-2 ring-white dark:ring-gray-800">
          <User className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </div>
      )}
    </div>
  );
});
