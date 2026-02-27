/**
 * 新手引导流程配置
 *
 * 定义各个功能模块的引导步骤
 */

import { GuideFlow } from '../store/useOnboardingStore';

export const guideFlows: Record<string, GuideFlow> = {
  // 欢迎引导 - 首次进入时显示
  welcome: {
    id: 'welcome',
    name: '欢迎来到 NanoBanana',
    description: '快速了解如何使用 AI 图片生成平台',
    priority: 1,
    autoTrigger: true,
    steps: [
      {
        id: 'welcome-1',
        title: '👋 欢迎使用 NanoBanana',
        content: '这是一个强大的 AI 图片生成平台，支持文字描述生成图片、图片风格转换、批量处理等功能。',
        position: 'center',
      },
      {
        id: 'welcome-2',
        title: '✨ 核心功能介绍',
        content: '• 文字生成图片：输入描述，AI 为你创作\n• 图片编辑：上传图片进行风格转换\n• 批量编排：多步骤自动化处理\n• 提示词库：快速选择常用提示词',
        position: 'center',
      },
      {
        id: 'welcome-3',
        title: '🚀 开始你的创作之旅',
        content: '点击下方按钮开始详细教程，或直接关闭开始探索。你也可以随时在设置中重新查看引导。',
        position: 'center',
      },
    ],
  },

  // 聊天输入引导
  chat_input: {
    id: 'chat_input',
    name: '输入提示',
    description: '学习如何高效地与 AI 对话',
    priority: 2,
    steps: [
      {
        id: 'input-1',
        title: '💬 输入你的创意',
        content: '在输入框中描述你想要生成的图片内容，支持中英文输入。',
        target: '[data-guide="input-area"]',
        position: 'top',
      },
      {
        id: 'input-2',
        title: '📸 上传参考图片',
        content: '点击相机图标上传图片，AI 会根据你的图片进行创作。支持拖拽上传和粘贴。',
        target: '[data-guide="camera-button"]',
        position: 'top',
      },
      {
        id: 'input-3',
        title: '⚡ 快速选择提示词',
        content: '输入 `/t` 可以快速打开提示词库，选择预设的提示词模板。',
        target: '[data-guide="input-area"]',
        position: 'top',
      },
      {
        id: 'input-4',
        title: '🎨 高级选项',
        content: '点击设置图标可以调整分辨率、比例、模型等参数。',
        target: '[data-guide="settings-button"]',
        position: 'left',
      },
    ],
  },

  // 图片上传引导
  image_upload: {
    id: 'image_upload',
    name: '图片上传',
    description: '学习如何上传和处理图片',
    priority: 3,
    steps: [
      {
        id: 'upload-1',
        title: '📷 多种上传方式',
        content: '支持三种上传方式：\n1. 点击相机图标选择文件\n2. 拖拽图片到输入区域\n3. 直接粘贴图片（Ctrl+V）',
        target: '[data-guide="camera-button"]',
        position: 'top',
      },
      {
        id: 'upload-2',
        title: '🖼️ 支持的格式',
        content: '支持 JPG、PNG、WEBP 等常见图片格式，单次最多上传 14 张图片。',
        target: '[data-guide="attachment-area"]',
        position: 'top',
      },
      {
        id: 'upload-3',
        title: '📱 移动端拍照',
        content: '在手机上，相机按钮可以直接调用摄像头拍照上传。',
        target: '[data-guide="camera-button"]',
        position: 'top',
      },
    ],
  },

  // 图片历史引导
  image_history: {
    id: 'image_history',
    name: '图片历史',
    description: '管理和使用你生成的图片',
    priority: 4,
    steps: [
      {
        id: 'history-1',
        title: '🖼️ 查看历史图片',
        content: '点击图片图标可以查看所有生成过的图片，最多保存 100 张。',
        target: '[data-guide="history-button"]',
        position: 'left',
      },
      {
        id: 'history-2',
        title: '💾 下载图片',
        content: '悬停在图片上可以下载到本地，或点击查看大图。',
        target: '[data-guide="history-panel"]',
        position: 'right',
      },
      {
        id: 'history-3',
        title: '🔄 再次编辑',
        content: '点击"再次编辑"按钮可以将历史图片作为参考重新生成。',
        target: '[data-guide="history-panel"]',
        position: 'right',
      },
    ],
  },

  // 设置面板引导
  settings: {
    id: 'settings',
    name: '设置面板',
    description: '自定义你的使用体验',
    priority: 5,
    steps: [
      {
        id: 'settings-1',
        title: '⚙️ 访问模式说明',
        content: '【未登录模式】点击钥匙图标配置自己的 API Key，请求直接与自定义 API 通信，对话异步同步到平台供管理员查看。\n\n【登录模式】自动使用平台统一服务与积分系统，API Key 入口隐藏，所有请求走平台 Token 池。',
        target: '[data-guide="api-key-button"]',
        position: 'left',
      },
      {
        id: 'settings-2',
        title: '🎨 图片设置',
        content: '可以调整生成的分辨率和宽高比，支持 1K/2K/4K 和多种比例。',
        target: '[data-guide="resolution-setting"]',
        position: 'left',
      },
      {
        id: 'settings-3',
        title: '🤖 模型选择',
        content: 'Banana Pro（3.0）支持最高 4K；Banana 2（3.1）支持 512/1K/2K/4K 与更多长宽比，适合多轮创作。',
        target: '[data-guide="model-setting"]',
        position: 'left',
      },
      {
        id: 'settings-4',
        title: '🔍 思考模式',
        content: '开启后可以查看 AI 的思考过程，了解图片生成的逻辑。',
        target: '[data-guide="thinking-setting"]',
        position: 'left',
      },
    ],
  },

  // 提示词库引导
  prompts: {
    id: 'prompts',
    name: '提示词库',
    description: '使用预设提示词快速生成',
    priority: 6,
    steps: [
      {
        id: 'prompts-1',
        title: '✨ 提示词库',
        content: '点击星星图标可以打开提示词库，包含大量精选提示词模板。',
        target: '[data-guide="prompts-button"]',
        position: 'left',
      },
      {
        id: 'prompts-2',
        title: '🔍 搜索和分类',
        content: '支持按分类筛选和搜索，快速找到你需要的提示词风格。',
        target: '[data-guide="prompts-panel"]',
        position: 'right',
      },
      {
        id: 'prompts-3',
        title: '📋 使用提示词',
        content: '点击任意提示词即可填入输入框，支持中英文混合使用。',
        target: '[data-guide="prompts-panel"]',
        position: 'right',
      },
    ],
  },

  // 批量编排引导
  batch_pipeline: {
    id: 'batch_pipeline',
    name: '批量编排',
    description: '学习高级批量处理功能',
    priority: 7,
    steps: [
      {
        id: 'pipeline-1',
        title: '🔧 批量编排',
        content: '点击紫色按钮可以打开批量编排功能，支持串行、并行、组合三种模式。',
        target: '[data-guide="pipeline-button"]',
        position: 'top',
      },
      {
        id: 'pipeline-2',
        title: '📝 串行模式',
        content: '步骤依次执行，每步的输出作为下一步的输入，适合渐进式优化。',
        target: '[data-guide="pipeline-mode-serial"]',
        position: 'bottom',
      },
      {
        id: 'pipeline-3',
        title: '⚡ 并行模式',
        content: '所有步骤同时执行，同一输入产生多种风格输出。',
        target: '[data-guide="pipeline-mode-parallel"]',
        position: 'bottom',
      },
      {
        id: 'pipeline-4',
        title: '🎯 组合模式',
        content: '笛卡尔积组合，多个提示词 × 多张图片，生成所有可能的组合。',
        target: '[data-guide="pipeline-mode-combination"]',
        position: 'bottom',
      },
      {
        id: 'pipeline-5',
        title: '🎨 使用模板',
        content: '内置多种预设模板，一键加载，也可以保存自己的模板。',
        target: '[data-guide="pipeline-templates"]',
        position: 'left',
      },
    ],
  },

  // 图片再编辑引导
  re_edit: {
    id: 're_edit',
    name: '图片再编辑',
    description: '学习如何基于历史图片重新生成',
    priority: 8,
    steps: [
      {
        id: 'reedit-1',
        title: '🖼️ 查看历史图片',
        content: '在聊天界面或历史记录中，悬停在生成的图片上会显示"再次编辑"按钮。',
        target: '[data-guide="generated-image"]',
        position: 'bottom',
      },
      {
        id: 'reedit-2',
        title: '✏️ 一键编辑',
        content: '点击"再次编辑"按钮，图片会自动添加到输入框作为参考，你可以输入新的提示词进行修改。',
        target: '[data-guide="re-edit-button"]',
        position: 'bottom',
      },
      {
        id: 'reedit-3',
        title: '🔄 迭代优化',
        content: '可以多次对同一图片进行编辑，每次编辑都会基于上次的结果，实现渐进式优化。',
        target: '[data-guide="input-area"]',
        position: 'top',
      },
    ],
  },
};

// 获取可用的引导流程（按优先级排序）
export const getAvailableGuideFlows = (): GuideFlow[] => {
  return Object.values(guideFlows).sort((a, b) => a.priority - b.priority);
};

// 根据 ID 获取引导流程
export const getGuideFlow = (id: string): GuideFlow | undefined => {
  return guideFlows[id];
};
