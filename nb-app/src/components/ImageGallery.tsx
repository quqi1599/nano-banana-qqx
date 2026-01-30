/**
 * 图片画廊组件 - 支持网格预览、全屏查看、左右滑动、批量下载
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Edit, ZoomIn, Grid3X3 } from 'lucide-react';
import { Part } from '../types';
import { downloadImage, openImageInNewTab, downloadDatasetZip } from '../utils/imageUtils';
import { resolveMessageImageData } from '../utils/messageImageUtils';
import { useUiStore } from '../store/useUiStore';

interface ImageGalleryProps {
    parts: Part[];
    onReEdit?: (part: Part) => void;
}

// 获取缩略图 MIME 类型
const getThumbnailMimeType = (part: Part) => {
    if (!part.inlineData) return 'image/jpeg';
    if (!part.inlineData.isThumbnail) return part.inlineData.mimeType;
    if (part.inlineData.thumbnailMimeType) return part.inlineData.thumbnailMimeType;
    return part.inlineData.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
};

// 获取预览 MIME 类型
const getPreviewMimeType = (part: Part, fullData: string | null) => {
    if (fullData) {
        return part.inlineData?.mimeType || 'image/jpeg';
    }
    return getThumbnailMimeType(part);
};

export const ImageGallery: React.FC<ImageGalleryProps> = ({ parts, onReEdit }) => {
    const { setPendingReferenceImage, addToast } = useUiStore();
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [fullDataCache, setFullDataCache] = useState<Record<number, string>>({});
    const [isDownloading, setIsDownloading] = useState(false);
    const touchStartX = useRef<number>(0);
    const touchEndX = useRef<number>(0);

    // 预加载当前图片的完整数据
    const loadFullData = useCallback(async (index: number) => {
        if (fullDataCache[index]) return fullDataCache[index];
        const part = parts[index];
        if (!part?.inlineData) return null;

        const resolved = await resolveMessageImageData(part);
        if (resolved?.data) {
            setFullDataCache(prev => ({ ...prev, [index]: resolved.data }));
            return resolved.data;
        }
        return null;
    }, [parts, fullDataCache]);

    // 打开 Lightbox
    const openLightbox = useCallback((index: number) => {
        setCurrentIndex(index);
        setLightboxOpen(true);
        loadFullData(index);
        // 预加载相邻图片
        if (index > 0) loadFullData(index - 1);
        if (index < parts.length - 1) loadFullData(index + 1);
    }, [loadFullData, parts.length]);

    // 关闭 Lightbox
    const closeLightbox = useCallback(() => {
        setLightboxOpen(false);
    }, []);

    // 上一张
    const goToPrev = useCallback(() => {
        const newIndex = currentIndex > 0 ? currentIndex - 1 : parts.length - 1;
        setCurrentIndex(newIndex);
        loadFullData(newIndex);
        if (newIndex > 0) loadFullData(newIndex - 1);
    }, [currentIndex, parts.length, loadFullData]);

    // 下一张
    const goToNext = useCallback(() => {
        const newIndex = currentIndex < parts.length - 1 ? currentIndex + 1 : 0;
        setCurrentIndex(newIndex);
        loadFullData(newIndex);
        if (newIndex < parts.length - 1) loadFullData(newIndex + 1);
    }, [currentIndex, parts.length, loadFullData]);

    // 键盘导航
    useEffect(() => {
        if (!lightboxOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') goToPrev();
            if (e.key === 'ArrowRight') goToNext();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxOpen, closeLightbox, goToPrev, goToNext]);

    // 触摸滑动
    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
        const diff = touchStartX.current - touchEndX.current;
        const threshold = 50;

        if (Math.abs(diff) > threshold) {
            if (diff > 0) {
                goToNext();
            } else {
                goToPrev();
            }
        }

        touchStartX.current = 0;
        touchEndX.current = 0;
    };

    // 下载当前图片
    const handleDownload = async () => {
        const part = parts[currentIndex];
        const fullData = fullDataCache[currentIndex] || await loadFullData(currentIndex);
        if (!fullData) {
            addToast('图片加载失败', 'error');
            return;
        }
        downloadImage(part.inlineData!.mimeType, fullData);
    };

    // 批量下载所有图片
    const handleDownloadAll = async () => {
        if (isDownloading) return;
        setIsDownloading(true);

        try {
            const datasetParts = await Promise.all(
                parts.map(async (p) => {
                    const resolved = await resolveMessageImageData(p);
                    if (!resolved?.data) return null;
                    return {
                        mimeType: resolved.mimeType,
                        data: resolved.data,
                        prompt: p.prompt
                    };
                })
            );

            const validParts = datasetParts.filter((p): p is { mimeType: string; data: string; prompt?: string } => !!p);
            if (validParts.length === 0) {
                addToast('没有可下载的图片', 'error');
                return;
            }

            await downloadDatasetZip(validParts);
            addToast(`已下载 ${validParts.length} 张图片`, 'success');
        } catch (error) {
            console.error('批量下载失败:', error);
            addToast('下载失败，请重试', 'error');
        } finally {
            setIsDownloading(false);
        }
    };

    // 再次编辑
    const handleReEdit = async () => {
        const part = parts[currentIndex];
        const fullData = fullDataCache[currentIndex] || await loadFullData(currentIndex);
        if (!fullData) {
            addToast('图片加载失败', 'error');
            return;
        }
        setPendingReferenceImage({
            base64Data: fullData,
            mimeType: part.inlineData!.mimeType,
            timestamp: Date.now()
        });
        closeLightbox();
    };

    // 在新标签页打开
    const handleOpenInNewTab = async () => {
        const part = parts[currentIndex];
        const fullData = fullDataCache[currentIndex] || await loadFullData(currentIndex);
        if (!fullData) {
            addToast('图片加载失败', 'error');
            return;
        }
        openImageInNewTab(part.inlineData!.mimeType, fullData);
    };

    if (parts.length === 0) return null;

    // 单张图片 - 直接显示大图
    if (parts.length === 1) {
        const part = parts[0];
        const fullData = fullDataCache[0];
        const imgSrc = `data:${getPreviewMimeType(part, fullData)};base64,${fullData || part.inlineData?.data}`;

        return (
            <div className="relative mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-950/50 max-w-lg mx-auto group">
                <img
                    src={imgSrc}
                    alt="Generated image"
                    className="h-auto max-w-full object-contain cursor-pointer"
                    loading="lazy"
                    onClick={() => openLightbox(0)}
                    title="点击查看大图"
                />

                {/* 操作按钮 */}
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity touch-show-actions">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleReEdit(); }}
                        className="p-2.5 rounded-lg bg-cream-500 hover:bg-cream-600 text-white shadow-lg backdrop-blur-sm transition-all"
                        title="再次编辑"
                    >
                        <Edit className="h-5 w-5" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                        className="p-2.5 rounded-lg bg-black/60 hover:bg-black/80 text-white shadow-lg backdrop-blur-sm transition-all"
                        title="下载图片"
                    >
                        <Download className="h-5 w-5" />
                    </button>
                </div>

                {/* Lightbox */}
                {lightboxOpen && (
                    <Lightbox
                        parts={parts}
                        currentIndex={currentIndex}
                        fullDataCache={fullDataCache}
                        onClose={closeLightbox}
                        onPrev={goToPrev}
                        onNext={goToNext}
                        onDownload={handleDownload}
                        onDownloadAll={handleDownloadAll}
                        onReEdit={handleReEdit}
                        onOpenInNewTab={handleOpenInNewTab}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        isDownloading={isDownloading}
                    />
                )}
            </div>
        );
    }

    // 多张图片 - 网格预览
    const gridCols = parts.length <= 2 ? 'grid-cols-2' : parts.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';

    return (
        <div className="mt-3">
            {/* 网格预览 */}
            <div className={`grid ${gridCols} gap-2 max-w-lg mx-auto`}>
                {parts.slice(0, 6).map((part, index) => {
                    const imgSrc = `data:${getThumbnailMimeType(part)};base64,${part.inlineData?.data}`;
                    const isLast = index === 5 && parts.length > 6;

                    return (
                        <div
                            key={index}
                            className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700/50 bg-gray-100 dark:bg-gray-900 cursor-pointer group"
                            onClick={() => openLightbox(index)}
                        >
                            <img
                                src={imgSrc}
                                alt={`Image ${index + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                loading="lazy"
                            />

                            {/* 显示剩余数量 */}
                            {isLast && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <span className="text-white text-xl font-bold">+{parts.length - 6}</span>
                                </div>
                            )}

                            {/* 悬停时显示放大图标 */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 批量下载按钮 */}
            <div className="mt-3 flex justify-center">
                <button
                    onClick={handleDownloadAll}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cream-400 to-amber-500 hover:from-cream-500 hover:to-cream-600 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                    <Download className="h-4 w-4" />
                    {isDownloading ? '下载中...' : `下载全部 (${parts.length} 张)`}
                </button>
            </div>

            {/* Lightbox */}
            {lightboxOpen && (
                <Lightbox
                    parts={parts}
                    currentIndex={currentIndex}
                    fullDataCache={fullDataCache}
                    onClose={closeLightbox}
                    onPrev={goToPrev}
                    onNext={goToNext}
                    onDownload={handleDownload}
                    onDownloadAll={handleDownloadAll}
                    onReEdit={handleReEdit}
                    onOpenInNewTab={handleOpenInNewTab}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    isDownloading={isDownloading}
                />
            )}
        </div>
    );
};

// Lightbox 组件
interface LightboxProps {
    parts: Part[];
    currentIndex: number;
    fullDataCache: Record<number, string>;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
    onDownload: () => void;
    onDownloadAll: () => void;
    onReEdit: () => void;
    onOpenInNewTab: () => void;
    onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
    onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
    onTouchEnd: () => void;
    isDownloading: boolean;
}

const Lightbox: React.FC<LightboxProps> = ({
    parts,
    currentIndex,
    fullDataCache,
    onClose,
    onPrev,
    onNext,
    onDownload,
    onDownloadAll,
    onReEdit,
    onOpenInNewTab,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    isDownloading
}) => {
    const part = parts[currentIndex];
    const fullData = fullDataCache[currentIndex];
    const imgSrc = `data:${getPreviewMimeType(part, fullData)};base64,${fullData || part.inlineData?.data}`;

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
            onClick={onClose}
        >
            {/* 关闭按钮 */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
                <X className="h-6 w-6" />
            </button>

            {/* 图片计数 */}
            {parts.length > 1 && (
                <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full bg-white/10 text-white text-sm">
                    {currentIndex + 1} / {parts.length}
                </div>
            )}

            {/* 左箭头 */}
            {parts.length > 1 && (
                <button
                    onClick={(e) => { e.stopPropagation(); onPrev(); }}
                    className="absolute left-2 sm:left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                    <ChevronLeft className="h-8 w-8" />
                </button>
            )}

            {/* 图片 */}
            <div
                className="max-w-[90vw] max-h-[80vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <img
                    src={imgSrc}
                    alt={`Image ${currentIndex + 1}`}
                    className="max-w-full max-h-[80vh] object-contain rounded-lg"
                    onClick={onOpenInNewTab}
                />
            </div>

            {/* 右箭头 */}
            {parts.length > 1 && (
                <button
                    onClick={(e) => { e.stopPropagation(); onNext(); }}
                    className="absolute right-2 sm:right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                    <ChevronRight className="h-8 w-8" />
                </button>
            )}

            {/* 底部工具栏 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md">
                <button
                    onClick={(e) => { e.stopPropagation(); onReEdit(); }}
                    className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
                    title="再次编辑"
                >
                    <Edit className="h-5 w-5" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDownload(); }}
                    className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
                    title="下载当前图片"
                >
                    <Download className="h-5 w-5" />
                </button>
                {parts.length > 1 && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDownloadAll(); }}
                        disabled={isDownloading}
                        className="px-3 py-1.5 rounded-full bg-cream-500 hover:bg-cream-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                        title="下载全部"
                    >
                        {isDownloading ? '下载中...' : `下载全部 (${parts.length})`}
                    </button>
                )}
            </div>

            {/* 缩略图导航 */}
            {parts.length > 1 && parts.length <= 10 && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 backdrop-blur-md">
                    {parts.map((p, i) => (
                        <button
                            key={i}
                            onClick={(e) => { e.stopPropagation(); }}
                            className={`w-2 h-2 rounded-full transition-colors ${i === currentIndex ? 'bg-white' : 'bg-white/40 hover:bg-white/60'}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ImageGallery;
