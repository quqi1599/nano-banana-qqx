import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 新手引导系统
 * 支持多个功能模块的引导流程，可跳过、可重新查看
 */

export type GuideType =
  | 'welcome'           // 欢迎引导（首次进入）
  | 'chat_input'        // 聊天输入引导
  | 'image_upload'      // 图片上传引导
  | 'image_history'     // 图片历史引导
  | 'settings'          // 设置面板引导
  | 'prompts'           // 提示词库引导
  | 'batch_pipeline'    // 批量编排引导
  | 're_edit';          // 图片再编辑引导

export interface GuideStep {
  id: string;
  title: string;
  content: string;
  target?: string;      // CSS 选择器，定位目标元素
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: () => void;  // 点击下一步时的回调
  image?: string;       // 可选的示意图 URL
  video?: string;       // 可选的演示视频 URL
}

export interface GuideFlow {
  id: GuideType;
  name: string;
  description: string;
  steps: GuideStep[];
  autoTrigger?: boolean; // 是否自动触发
  priority: number;      // 优先级，用于排序
}

export interface OnboardingState {
  // 已完成的引导
  completedGuides: GuideType[];
  // 跳过的引导（用户不想再看）
  skippedGuides: GuideType[];
  // 总体是否跳过所有引导
  allGuidesSkipped: boolean;
  // 当前激活的引导流程
  activeGuide: GuideFlow | null;
  // 当前步骤索引
  currentStepIndex: number;

  // Actions
  completeGuide: (guideType: GuideType) => void;
  skipGuide: (guideType: GuideType) => void;
  skipAllGuides: () => void;
  resetGuide: (guideType: GuideType) => void;
  resetAllGuides: () => void;
  startGuide: (guide: GuideFlow) => void;
  nextStep: () => void;
  prevStep: () => void;
  closeGuide: () => void;
  isGuideCompleted: (guideType: GuideType) => boolean;
  isGuideAvailable: (guideType: GuideType) => boolean;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completedGuides: [],
      skippedGuides: [],
      allGuidesSkipped: false,
      activeGuide: null,
      currentStepIndex: 0,

      completeGuide: (guideType) =>
        set((state) => ({
          completedGuides: [...state.completedGuides, guideType],
          skippedGuides: state.skippedGuides.filter((g) => g !== guideType),
          activeGuide: null,
          currentStepIndex: 0,
        })),

      skipGuide: (guideType) =>
        set((state) => ({
          skippedGuides: [...state.skippedGuides, guideType],
          activeGuide: null,
          currentStepIndex: 0,
        })),

      skipAllGuides: () =>
        set({
          allGuidesSkipped: true,
          activeGuide: null,
          currentStepIndex: 0,
        }),

      resetGuide: (guideType) =>
        set((state) => ({
          completedGuides: state.completedGuides.filter((g) => g !== guideType),
          skippedGuides: state.skippedGuides.filter((g) => g !== guideType),
        })),

      resetAllGuides: () =>
        set({
          completedGuides: [],
          skippedGuides: [],
          allGuidesSkipped: false,
        }),

      startGuide: (guide) =>
        set({
          activeGuide: guide,
          currentStepIndex: 0,
        }),

      nextStep: () =>
        set((state) => {
          if (!state.activeGuide) return {};
          const nextIndex = state.currentStepIndex + 1;
          if (nextIndex >= state.activeGuide.steps.length) {
            // 引导完成
            return {
              activeGuide: null,
              currentStepIndex: 0,
              completedGuides: [...state.completedGuides, state.activeGuide!.id],
            };
          }
          return { currentStepIndex: nextIndex };
        }),

      prevStep: () =>
        set((state) => ({
          currentStepIndex: Math.max(0, state.currentStepIndex - 1),
        })),

      closeGuide: () =>
        set({
          activeGuide: null,
          currentStepIndex: 0,
        }),

      isGuideCompleted: (guideType) => {
        const state = get();
        return state.completedGuides.includes(guideType);
      },

      isGuideAvailable: (guideType) => {
        const state = get();
        return (
          !state.allGuidesSkipped &&
          !state.completedGuides.includes(guideType) &&
          !state.skippedGuides.includes(guideType)
        );
      },
    }),
    {
      name: 'nbnb-onboarding-storage',
      partialize: (state) => ({
        completedGuides: state.completedGuides,
        skippedGuides: state.skippedGuides,
        allGuidesSkipped: state.allGuidesSkipped,
      }),
    }
  )
);
