import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Skip } from 'lucide-react';
import { useOnboardingStore, GuideStep } from '../../store/useOnboardingStore';

interface GuideTourProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

/**
 * 引导之旅组件
 * 显示步骤式引导，支持跳过、前进、后退
 */
export const GuideTour: React.FC<GuideTourProps> = ({ onComplete, onSkip }) => {
  const {
    activeGuide,
    currentStepIndex,
    nextStep,
    prevStep,
    closeGuide,
    completeGuide,
    skipGuide,
  } = useOnboardingStore();

  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentStep = activeGuide?.steps[currentStepIndex];
  const isLastStep = !activeGuide ? false : currentStepIndex === activeGuide.steps.length - 1;
  const isFirstStep = currentStepIndex === 0;
  const totalSteps = activeGuide?.steps.length || 0;

  // 计算目标元素位置
  useEffect(() => {
    if (!currentStep?.target || currentStep.position === 'center') {
      setPosition({ top: 0, left: 0, width: 0, height: 0 });
      return;
    }

    const updatePosition = () => {
      const target = document.querySelector(currentStep.target!);
      if (target) {
        const rect = target.getBoundingClientRect();
        setPosition({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updatePosition();
    // 监听窗口变化和滚动
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [currentStep]);

  // 淡入动画
  useEffect(() => {
    if (activeGuide) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [activeGuide]);

  // 执行步骤的回调
  const handleNext = () => {
    if (currentStep?.action) {
      currentStep.action();
    }

    if (isLastStep) {
      completeGuide(activeGuide!.id);
      onComplete?.();
    } else {
      nextStep();
    }
  };

  const handlePrev = () => {
    if (currentStep?.action) {
      currentStep.action();
    }
    prevStep();
  };

  const handleClose = () => {
    closeGuide();
  };

  const handleSkip = () => {
    if (activeGuide) {
      skipGuide(activeGuide.id);
    }
    onSkip?.();
  };

  // 计算弹窗位置
  const getPopoverPosition = () => {
    if (currentStep?.position === 'center') {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const { top, left, width, height } = position;
    const popoverWidth = 360;
    const popoverHeight = 250;
    const padding = 16;
    const arrowSize = 12;

    const positions: Record<string, React.CSSProperties> = {
      top: {
        bottom: `${window.innerHeight - top + padding}px`,
        left: `${left + width / 2}px`,
        transform: 'translateX(-50%)',
      },
      bottom: {
        top: `${top + height + padding}px`,
        left: `${left + width / 2}px`,
        transform: 'translateX(-50%)',
      },
      left: {
        top: `${top + height / 2}px`,
        right: `${window.innerWidth - left + padding}px`,
        transform: 'translateY(-50%)',
      },
      right: {
        top: `${top + height / 2}px`,
        left: `${left + width + padding}px`,
        transform: 'translateY(-50%)',
      },
    };

    return positions[currentStep?.position || 'bottom'] || positions.bottom;
  };

  if (!activeGuide || !currentStep) return null;

  const popoverStyle = getPopoverPosition();

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* 聚光灯效果（定位到目标元素） */}
      {currentStep.target && currentStep.position !== 'center' && (
        <div
          ref={spotlightRef}
          className="fixed z-50 pointer-events-none transition-all duration-300"
          style={{
            top: position.top - 4,
            left: position.left - 4,
            width: position.width + 8,
            height: position.height + 8,
            borderRadius: '12px',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            border: '2px solid #F59E0B',
          }}
        />
      )}

      {/* 引导游卡片 */}
      <div
        ref={containerRef}
        className={`fixed z-[60] w-full max-w-[360px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-900/50 transition-all duration-300 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        style={popoverStyle as React.CSSProperties}
      >
        {/* 进度指示器 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {activeGuide.name}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {currentStepIndex + 1} / {totalSteps}
            </span>
            <button
              onClick={handleClose}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={16} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="p-5">
          {/* 标题 */}
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
            {currentStep.title}
          </h3>

          {/* 内容 */}
          <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line leading-relaxed">
            {currentStep.content}
          </div>

          {/* 可选的图片/视频 */}
          {currentStep.image && (
            <img
              src={currentStep.image}
              alt={currentStep.title}
              className="mt-3 rounded-lg w-full object-cover max-h-40"
            />
          )}
        </div>

        {/* 进度条 */}
        {totalSteps > 1 && (
          <div className="px-5 pb-3">
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300"
                style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            <Skip size={14} />
            跳过
          </button>

          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={handlePrev}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-1"
              >
                <ChevronLeft size={16} />
                上一步
              </button>
            )}

            <button
              onClick={handleNext}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 transition-all flex items-center gap-1 shadow-lg shadow-amber-500/30"
            >
              {isLastStep ? '完成' : '下一步'}
              {!isLastStep && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

/**
 * 小型提示卡片（用于功能提示）
 */
interface TooltipGuideProps {
  title: string;
  content: string;
  target: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  onClose: () => void;
  onNext?: () => void;
}

export const TooltipGuide: React.FC<TooltipGuideProps> = ({
  title,
  content,
  target,
  position = 'bottom',
  onClose,
  onNext,
}) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updatePosition = () => {
      const el = document.querySelector(target);
      if (el) {
        const rect = el.getBoundingClientRect();
        setPos({ top: rect.top, left: rect.left });
        setVisible(true);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [target]);

  if (!visible) return null;

  const positions: Record<string, React.CSSProperties> = {
    top: {
      bottom: `${window.innerHeight - pos.top + 12}px`,
      left: `${pos.left}px`,
      transform: 'translateX(-50%)',
    },
    bottom: {
      top: `${pos.top + 48}px`,
      left: `${pos.left}px`,
      transform: 'translateX(-50%)',
    },
    left: {
      top: `${pos.top + 12}px`,
      right: `${window.innerWidth - pos.left + 12}px`,
      transform: 'translateY(-50%)',
    },
    right: {
      top: `${pos.top + 12}px`,
      left: `${pos.left + 150}px`,
      transform: 'translateY(-50%)',
    },
  };

  return (
    <div
      className={`fixed z-50 w-64 p-4 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-xl shadow-2xl transition-all duration-300 ${
        visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      }`}
      style={positions[position]}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h4 className="font-bold text-sm mb-1">{title}</h4>
          <p className="text-xs opacity-90 leading-relaxed">{content}</p>
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={onClose}
            className="p-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X size={12} />
          </button>
          {onNext && (
            <button
              onClick={onNext}
              className="p-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>
      {/* 箭头 */}
      <div
        className={`absolute w-3 h-3 bg-amber-500 rotate-45 ${
          position === 'bottom' ? '-top-1.5 left-1/2 -translate-x-1/2' :
          position === 'top' ? '-bottom-1.5 left-1/2 -translate-x-1/2' :
          position === 'left' ? '-right-1.5 top-1/2 -translate-y-1/2' :
          '-left-1.5 top-1/2 -translate-y-1/2'
        }`}
      />
    </div>
  );
};
