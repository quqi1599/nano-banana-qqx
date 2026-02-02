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
            type DatasetPart = { mimeType: string; data: string; prompt?: string };
            const datasetParts = await Promise.all(
                parts.map(async (p): Promise<DatasetPart | null> => {
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
            <div className="relative mt-4 overflow-hidden rounded-2xl border border-gray-200/80 dark:border-gray-700/50 bg-white/80 dark:bg-gray-950/50 max-w-xl mx-auto group shadow-sm hover:shadow-md transition-all duration-300">
                {/* 图片容器 */}
                <div className="relative overflow-hidden">
                    <img
                        src={imgSrc}
                        alt="Generated image"
                        className="h-auto w-full object-contain cursor-zoom-in transform group-hover:scale-[1.02] transition-transform duration-500"
                        loading="lazy"
                        onClick={() => openLightbox(0)}
                        title="点击查看大图"
                    />
                    {/* 渐变遮罩 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                </div>

                {/* 操作按钮 - 悬浮在图片上 */}
                <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 touch-show-actions">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleReEdit(); }}
                        className="p-2.5 rounded-xl bg-white/95 dark:bg-gray-800/95 hover:bg-cream-500 hover:text-white text-cream-600 dark:text-cream-400 shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-105 active:scale-95"
                        title="再次编辑"
                    >
                        <Edit className="h-4 w-4" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                        className="p-2.5 rounded-xl bg-white/95 dark:bg-gray-800/95 hover:bg-gray-900 hover:text-white text-gray-700 dark:text-gray-300 shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-105 active:scale-95"
                        title="下载图片"
                    >
                        <Download className="h-4 w-4" />
                    </button>
                </div>

                {/* 底部信息栏 */}
                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800/50 flex items-center justify-between bg-white/50 dark:bg-gray-900/30">
                    <span className="text-xs text-gray-500 dark:text-gray-400">点击放大查看</span>
                    <div className="flex items-center gap-1.5 text-xs text-cream-600 dark:text-cream-400">
                        <ZoomIn className="h-3.5 w-3.5" />
                        <span>查看原图</span>
                    </div>
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
    const gridCols = parts.length === 2 ? 'grid-cols-2' : parts.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';
    const gapSize = parts.length <= 2 ? 'gap-3' : 'gap-2';

    return (
        <div className="mt-4">
            {/* 网格预览 */}
            <div className={`grid ${gridCols} ${gapSize} max-w-xl mx-auto`}>
                {parts.slice(0, 9).map((part, index) => {
                    const imgSrc = `data:${getThumbnailMimeType(part)};base64,${part.inlineData?.data}`;
                    const isLast = index === 8 && parts.length > 9;
                    const isLarge = parts.length === 1 || (parts.length === 2 && index === 0);

                    return (
                        <div
                            key={index}
                            className={`
                                relative overflow-hidden rounded-xl border border-gray-200/80 dark:border-gray-700/50 
                                bg-gray-100 dark:bg-gray-900 cursor-pointer group shadow-sm hover:shadow-md transition-all duration-300
                                ${isLarge ? 'col-span-1 row-span-1' : ''}
                            `}
                            style={{ aspectRatio: '1' }}
                            onClick={() => openLightbox(index)}
                        >
                            <img
                                src={imgSrc}
                                alt={`Image ${index + 1}`}
                                className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                                loading="lazy"
                            />

                            {/* 显示剩余数量 */}
                            {isLast && (
                                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
                                    <span className="text-white text-2xl font-bold">+{parts.length - 9}</span>
                                </div>
                            )}

                            {/* 悬停遮罩 */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-white text-xs font-medium">#{index + 1}</span>
                                        <ZoomIn className="h-4 w-4 text-white" />
                                    </div>
                                </div>
                            </div>

                            {/* 索引标记 */}
                            {!isLast && (
                                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                    {index + 1}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 批量下载按钮 */}
            <div className="mt-4 flex justify-center">
                <button
                    onClick={handleDownloadAll}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cream-400 to-amber-500 hover:from-cream-500 hover:to-amber-600 text-white font-medium text-sm shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 hover:-translate-y-0.5 active:translate-y-0"
                >
                    <Download className="h-4 w-4" />
                    {isDownloading ? '打包下载中...' : `一键下载全部 (${parts.length} 张)`}
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
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* 顶部导航栏 */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
                {/* 图片计数 */}
                {parts.length > 1 && (
                    <div className="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white text-sm font-medium">
                        <span className="text-cream-400">{currentIndex + 1}</span>
                        <span className="mx-1.5 text-white/50">/</span>
                        <span>{parts.length}</span>
                    </div>
                )}
                {parts.length === 1 && <div />}

                {/* 关闭按钮 */}
                <button
                    onClick={onClose}
                    className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 hover:scale-105 active:scale-95 backdrop-blur-md"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* 左箭头 */}
            {parts.length > 1 && (
                <button
                    onClick={(e) => { e.stopPropagation(); onPrev(); }}
                    className="absolute left-3 sm:left-6 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 hover:scale-105 active:scale-95 backdrop-blur-md group"
                >
                    <ChevronLeft className="h-6 w-6 group-hover:-translate-x-0.5 transition-transform" />
                </button>
            )}

            {/* 图片 */}
            <div
                className="max-w-[92vw] max-h-[82vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <img
                    src={imgSrc}
                    alt={`Image ${currentIndex + 1}`}
                    className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl cursor-pointer hover:opacity-95 transition-opacity"
                    onClick={onOpenInNewTab}
                    title="点击在新标签页打开"
                />
            </div>

            {/* 右箭头 */}
            {parts.length > 1 && (
                <button
                    onClick={(e) => { e.stopPropagation(); onNext(); }}
                    className="absolute right-3 sm:right-6 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 hover:scale-105 active:scale-95 backdrop-blur-md group"
                >
                    <ChevronRight className="h-6 w-6 group-hover:translate-x-0.5 transition-transform" />
                </button>
            )}

            {/* 底部工具栏 */}
            <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/60 via-black/20 to-transparent pb-safe-offset-4">
                <div className="flex items-center justify-center gap-2 px-4 py-4">
                    <div className="flex items-center gap-2 px-2 py-2 rounded-2xl bg-white/10 backdrop-blur-md">
                        <button
                            onClick={(e) => { e.stopPropagation(); onReEdit(); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/20 text-white transition-all duration-200"
                            title="再次编辑"
                        >
                            <Edit className="h-4 w-4" />
                            <span className="text-sm font-medium">编辑</span>
                        </button>
                        <div className="w-px h-6 bg-white/20" />
                        <button
                            onClick={(e) => { e.stopPropagation(); onDownload(); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/20 text-white transition-all duration-200"
                            title="下载当前图片"
                        >
                            <Download className="h-4 w-4" />
                            <span className="text-sm font-medium">下载</span>
                        </button>
                        {parts.length > 1 && (
                            <>
                                <div className="w-px h-6 bg-white/20" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDownloadAll(); }}
                                    disabled={isDownloading}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cream-500/90 hover:bg-cream-500 text-white text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="下载全部"
                                >
                                    <Grid3X3 className="h-4 w-4" />
                                    {isDownloading ? '下载中...' : `全部 (${parts.length})`}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* 缩略图导航 */}
                {parts.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5 px-4 pb-4 overflow-x-auto max-w-full">
                        {parts.map((p, i) => {
                            const isActive = i === currentIndex;
                            const thumbData = fullDataCache[i] || p.inlineData?.data;
                            const thumbSrc = `data:${getThumbnailMimeType(p)};base64,${thumbData}`;
                            return (
                                <button
                                    key={i}
                                    onClick={(e) => { e.stopPropagation(); }}
                                    className={`
                                        relative flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden transition-all duration-200
                                        ${isActive 
                                            ? 'ring-2 ring-cream-400 ring-offset-2 ring-offset-black/50 scale-105' 
                                            : 'opacity-50 hover:opacity-80 hover:scale-105'
                                        }
                                    `}
                                >
                                    <img
                                        src={thumbSrc}
                                        alt={`Thumbnail ${i + 1}`}
                                        className="w-full h-full object-cover"
                                    />
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImageGallery;
