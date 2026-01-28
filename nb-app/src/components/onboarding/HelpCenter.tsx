import React, { useState } from 'react';
import { BookOpen, CheckCircle2, Circle, Play, RotateCcw, X } from 'lucide-react';
import { useOnboardingStore, GuideType } from '../../store/useOnboardingStore';
import { guideFlows, getAvailableGuideFlows } from '../../data/guideFlows';

interface HelpCenterProps {
  onClose: () => void;
}

/**
 * 帮助中心组件
 * 显示所有可用的引导流程，支持重新查看
 */
export const HelpCenter: React.FC<HelpCenterProps> = ({ onClose }) => {
  const {
    completedGuides,
    skippedGuides,
    isGuideCompleted,
    resetGuide,
    startGuide,
    resetAllGuides,
  } = useOnboardingStore();

  const [filter, setFilter] = useState<'all' | 'completed' | 'available'>('all');

  const availableFlows = getAvailableGuideFlows();

  const handleStartGuide = (guideId: GuideType) => {
    const guide = guideFlows[guideId];
    if (guide) {
      resetGuide(guideId);
      startGuide(guide);
      onClose();
    }
  };

  const handleResetAll = () => {
    if (confirm('确定要重置所有引导进度吗？')) {
      resetAllGuides();
    }
  };

  const filteredFlows = availableFlows.filter((flow) => {
    if (filter === 'completed') return isGuideCompleted(flow.id);
    if (filter === 'available') return !isGuideCompleted(flow.id);
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 内容卡片 */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">帮助中心</h2>
              <p className="text-sm text-gray-500">学习如何使用 NanoBanana</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* 过滤器 */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'all'
                ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
          >
            全部 ({availableFlows.length})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'completed'
                ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
          >
            已完成 ({completedGuides.length})
          </button>
          <button
            onClick={() => setFilter('available')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'available'
                ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
          >
            未完成 ({availableFlows.length - completedGuides.length})
          </button>
          <div className="flex-1" />
          <button
            onClick={handleResetAll}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1"
          >
            <RotateCcw size={14} />
            重置全部
          </button>
        </div>

        {/* 引导列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-3">
            {filteredFlows.map((flow) => {
              const isCompleted = isGuideCompleted(flow.id);
              const isSkipped = skippedGuides.includes(flow.id);

              return (
                <div
                  key={flow.id}
                  className={`p-4 rounded-xl border transition-all hover:shadow-lg ${isCompleted
                      ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                      : isSkipped
                        ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {flow.name}
                        </h3>
                        {isCompleted ? (
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 text-xs font-medium rounded-full flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            已完成
                          </span>
                        ) : isSkipped ? (
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs font-medium rounded-full">
                            已跳过
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-xs font-medium rounded-full">
                            新手必看
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {flow.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{flow.steps.length} 个步骤</span>
                        <span>优先级: {flow.priority}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleStartGuide(flow.id as GuideType)}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/30"
                    >
                      {isCompleted ? (
                        <>
                          <RotateCcw size={14} />
                          再次学习
                        </>
                      ) : (
                        <>
                          <Play size={14} />
                          {isSkipped ? '重新开始' : '开始学习'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 空状态 */}
          {filteredFlows.length === 0 && (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500">没有找到相关引导</p>
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
          <p className="text-sm text-gray-500 text-center">
            💡 提示：完成后可以随时回来重新查看这些引导
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * 帮助按钮（用于打开帮助中心）
 */
interface HelpButtonProps {
  onClick: () => void;
  badge?: boolean;
}

export const HelpButton: React.FC<HelpButtonProps> = ({ onClick, badge }) => {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center justify-center h-10 w-10 xs:h-auto xs:w-auto rounded-md xs:rounded-lg xs:p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group touch-feedback"
    >
      <BookOpen className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-amber-500 transition-colors" />
      {badge && (
        <span className="absolute top-2 xs:-top-1 right-2 xs:-right-1 w-2 h-2 xs:w-3 xs:h-3 bg-red-500 rounded-full animate-pulse" />
      )}
    </button>
  );
};
