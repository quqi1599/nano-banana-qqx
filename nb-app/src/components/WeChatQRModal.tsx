import React, { useEffect, useState } from 'react';
import { X, MessageCircle } from 'lucide-react';

/**
 * 二维码周更「无痛方案」：
 * 1) 仅替换文件：`nb-app/src/assets/wechat-group.jpg`
 * 2) 重新构建并发布前端
 *
 * 说明：这里使用打包导入而不是 /public + ?v=版本号。
 * 每次图片文件变化会生成新的 hash 资源地址，浏览器会自动拉新，避免缓存导致旧二维码继续显示。
 */
import wechatGroupQR from '../assets/wechat-group.jpg';

interface WeChatQRModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WeChatQRModal: React.FC<WeChatQRModalProps> = ({ isOpen, onClose }) => {
    const [shouldRender, setShouldRender] = useState(isOpen);
    const [isVisible, setIsVisible] = useState(isOpen);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            const frame = window.requestAnimationFrame(() => setIsVisible(true));
            return () => window.cancelAnimationFrame(frame);
        }

        if (shouldRender) {
            setIsVisible(false);
            const timer = window.setTimeout(() => setShouldRender(false), 200);
            return () => window.clearTimeout(timer);
        }
    }, [isOpen, shouldRender]);

    if (!shouldRender) return null;

    return (
        <div
            className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={onClose}
        >
            <div
                className={`relative bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl transition-all duration-200 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="text-center mb-4">
                    <div className="inline-flex items-center gap-2 text-green-400 mb-2">
                        <MessageCircle className="h-5 w-5" />
                        <span className="font-semibold">加入用户交流群</span>
                    </div>
                    <p className="text-sm text-gray-400">扫码加入，获取最新动态和技术支持</p>
                </div>

                <div className="flex justify-center">
                    <img
                        // 同事只需每周替换 src/assets/wechat-group.jpg，这里无需改代码。
                        src={wechatGroupQR}
                        alt="微信群二维码"
                        className="w-full max-w-[320px] max-h-[70vh] h-auto rounded-lg object-contain bg-white p-1"
                        loading="lazy"
                    />
                </div>

                <p className="text-center text-xs text-gray-500 mt-4">
                    二维码有效期 7 天，过期后请联系管理员更新（已启用版本防缓存）
                </p>
            </div>
        </div>
    );
};
