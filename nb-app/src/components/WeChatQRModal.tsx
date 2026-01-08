import React from 'react';
import { X, MessageCircle } from 'lucide-react';

interface WeChatQRModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WeChatQRModal: React.FC<WeChatQRModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={onClose}
        >
            <div
                className="relative bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
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
                        src="/wechat-group.jpg"
                        alt="微信群二维码"
                        className="w-64 h-64 rounded-lg object-cover"
                    />
                </div>

                <p className="text-center text-xs text-gray-500 mt-4">
                    二维码有效期 7 天，过期后请刷新页面获取最新
                </p>
            </div>
        </div>
    );
};
