/**
 * 滑块验证组件
 */
import React, { useState, useEffect, useRef } from 'react';
import { ChevronsRight, CheckCircle2 } from 'lucide-react';

interface SliderCaptchaProps {
    onVerify: () => void;
    onReset?: () => void;
}

export const SliderCaptcha: React.FC<SliderCaptchaProps> = ({ onVerify, onReset }) => {
    const [isVerified, setIsVerified] = useState(false);
    const [sliderValue, setSliderValue] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const sliderRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging || isVerified || !sliderRef.current) return;

        const sliderRect = sliderRef.current.getBoundingClientRect();
        const newValue = Math.min(
            Math.max(0, e.clientX - sliderRect.left),
            sliderRect.width - 48 // 48 is the handle width
        );

        setSliderValue(newValue);

        // Check if verified (98% threshold)
        if (newValue >= (sliderRect.width - 48 - 5)) {
            handleVerify();
        }
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (!isDragging || isVerified || !sliderRef.current) return;

        const sliderRect = sliderRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        const newValue = Math.min(
            Math.max(0, touch.clientX - sliderRect.left),
            sliderRect.width - 48
        );

        setSliderValue(newValue);

        if (newValue >= (sliderRect.width - 48 - 5)) {
            handleVerify();
        }
    };

    const handleVerify = () => {
        setIsVerified(true);
        setIsDragging(false);
        setSliderValue(sliderRef.current ? sliderRef.current.clientWidth - 48 : 0);
        onVerify();
    };

    const handleMouseUp = () => {
        if (!isVerified) {
            setIsDragging(false);
            setSliderValue(0); // Reset if not completed
            onReset?.();
        }
    };

    const reset = () => {
        setIsVerified(false);
        setSliderValue(0);
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleTouchMove);
            window.addEventListener('touchend', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDragging]);

    return (
        <div
            ref={sliderRef}
            className={`relative w-full h-12 rounded-xl overflow-hidden select-none transition-colors ${isVerified
                    ? 'bg-green-500/10 border border-green-500/20'
                    : 'bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600'
                }`}
        >
            {/* Background Text */}
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 pointer-events-none">
                {isVerified ? '验证通过' : '向右滑动验证'}
            </div>

            {/* Progress Bar */}
            <div
                className="absolute inset-y-0 left-0 bg-green-500/20 dark:bg-green-500/30 transition-all duration-0"
                style={{ width: isVerified ? '100%' : `${sliderValue + 24}px` }}
            />

            {/* Handle */}
            <div
                onMouseDown={() => !isVerified && setIsDragging(true)}
                onTouchStart={() => !isVerified && setIsDragging(true)}
                className={`absolute top-0 bottom-0 top-[2px] bottom-[2px] m-[1px] w-11 rounded-lg flex items-center justify-center cursor-pointer shadow-sm transition-transform active:scale-95 ${isVerified
                        ? 'bg-green-500 text-white right-[2px]'
                        : 'bg-white dark:bg-gray-600 text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white'
                    }`}
                style={{
                    transform: isVerified ? 'none' : `translateX(${sliderValue}px)`
                }}
            >
                {isVerified ? (
                    <CheckCircle2 className="w-5 h-5" />
                ) : (
                    <ChevronsRight className={`w-5 h-5 ${isDragging ? 'opacity-100' : 'opacity-70'}`} />
                )}
            </div>
        </div>
    );
};
