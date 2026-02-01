/**
 * 对话历史侧边栏组件
 * 支持收缩折叠、时间线、移动端优化
 *
 * 分组逻辑：
 * - 登录用户：直接显示所有对话（不分组）
 * - 未登录 + 默认URL：归入"淘宝用户"组
 * - 未登录 + 自定义URL/API：按 api_key_prefix 分组
 */
import { useEffect, useState, useMemo } from 'react';
import { MessageSquare, Plus, Trash2, Edit2, Check, X, Clock, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { Conversation } from '../services/conversationService';
import { Pagination } from './Pagination';

// 默认中转接口地址
const DEFAULT_API_ENDPOINT = 'https://nanobanana2.peacedejiai.cc/';

interface ConversationHistoryPanelProps {
    isOpen: boolean;
    isCollapsed: boolean;
    onClose: () => void;
    onToggleCollapse: () => void;
    onSelectConversation: (id: string) => void;
    onNewConversation: () => void;
}

// ===== 对话分组接口 =====
interface ConversationGroup {
    key: string;           // 分组唯一标识
    label: string;         // 分组显示名称
    conversations: Conversation[];
}

// 按日期分组对话（用于时间线显示）
function groupConversationsByDate(conversations: Conversation[]) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setDate(thisMonth.getDate() - 30);

    const groups: Record<string, Conversation[]> = {
        今天: [],
        昨天: [],
        本周: [],
        本月: [],
        更早: [],
    };

    conversations.forEach(conv => {
        const updatedDate = new Date(conv.updated_at);
        if (updatedDate >= today) {
            groups['今天'].push(conv);
        } else if (updatedDate >= yesterday) {
            groups['昨天'].push(conv);
        } else if (updatedDate >= thisWeek) {
            groups['本周'].push(conv);
        } else if (updatedDate >= thisMonth) {
            groups['本月'].push(conv);
        } else {
            groups['更早'].push(conv);
        }
    });

    return groups;
}

// ===== 按用户类型/API Key 分组对话 =====
/**
 * 登录用户：不分组，返回一个包含所有对话的组
 * 未登录用户：按 api_key_prefix + custom_endpoint 分组
 */
function groupConversationsByUser(
    conversations: Conversation[],
    isAuthenticated: boolean
): ConversationGroup[] {
    if (isAuthenticated) {
        // 登录用户：不分组，所有对话放在一个组里
        return [{
            key: 'my_conversations',
            label: '我的对话',
            conversations: conversations
        }];
    }

    // 未登录用户：按 API Key 和 URL 分组
    const groupsMap = new Map<string, Conversation[]>();
    const groupLabels = new Map<string, string>();

    conversations.forEach(conv => {
        const isDefaultUrl = !conv.custom_endpoint || conv.custom_endpoint === DEFAULT_API_ENDPOINT;
        const apiKeyPrefix = conv.api_key_prefix;

        let groupKey: string;
        let groupLabel: string;

        if (isDefaultUrl && !apiKeyPrefix) {
            // 淘宝用户（使用默认URL，没有自定义API Key前缀）
            groupKey = 'taobao_users';
            groupLabel = '🛒 淘宝用户';
        } else if (isDefaultUrl && apiKeyPrefix) {
            // 有自定义API Key 但使用默认URL，显示完整前缀
            groupKey = `api_${apiKeyPrefix}_default_url`;
            groupLabel = `🔑 ${apiKeyPrefix}`;
        } else if (!isDefaultUrl && apiKeyPrefix) {
            // 自定义URL + 自定义API Key，显示完整前缀
            groupKey = `api_${apiKeyPrefix}_custom_url`;
            groupLabel = `🔑 ${apiKeyPrefix}`;
        } else {
            // 自定义URL但没有API Key前缀（边缘情况）
            groupKey = `custom_${conv.custom_endpoint}`;
            groupLabel = `🌐 自定义接口`;
        }

        if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, []);
            groupLabels.set(groupKey, groupLabel);
        }
        groupsMap.get(groupKey)!.push(conv);
    });

    // 转换为数组，按对话数量排序（多的在前）
    return Array.from(groupsMap.entries()).map(([key, convs]) => ({
        key,
        label: groupLabels.get(key) || key,
        conversations: convs
    })).sort((a, b) => b.conversations.length - a.conversations.length);
}

// 格式化时间
function formatTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

export const ConversationHistoryPanel = ({
    isOpen,
    isCollapsed,
    onClose,
    onToggleCollapse,
    onSelectConversation,
    onNewConversation,
}: ConversationHistoryPanelProps) => {
    const { isAuthenticated } = useAuthStore();
    const {
        apiKey,
        visitorId,
        conversationList,
        conversationListTotal,
        conversationListPage,
        conversationListPageSize,
        isConversationListLoading,
        currentConversationId,
        localConversationId,
        localConversations,
        isConversationLoading,
        loadingConversationId,
        loadConversationList,
        loadLocalConversation,
        deleteConversation,
        deleteLocalConversation,
        updateConversationTitle,
        updateLocalConversationTitle,
    } = useAppStore();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState('');
    const useLocalHistory = !isAuthenticated;
    const sourceConversations = useLocalHistory ? localConversations : conversationList;
    const totalCount = useLocalHistory
        ? sourceConversations.length
        : (conversationListTotal || conversationList.length);

    // 任何有身份标识的用户都能使用历史对话：登录用户、API Key用户、游客（visitorId）
    const canUseHistory = isAuthenticated || !!apiKey || !!visitorId;

    useEffect(() => {
        if (isOpen && canUseHistory && !useLocalHistory) {
            loadConversationList(conversationListPage, conversationListPageSize);
        }
    }, [isOpen, canUseHistory, useLocalHistory, loadConversationList, conversationListPage, conversationListPageSize]);

    // ===== 按用户类型/API Key 分组，每个组内再按日期分组 =====
    const userGroups = useMemo(
        () => groupConversationsByUser(sourceConversations, isAuthenticated),
        [sourceConversations, isAuthenticated]
    );

    // 为每个用户组内部再按日期分组
    const groupsWithDateSubgroups = useMemo(() => {
        return userGroups.map(group => ({
            ...group,
            dateGroups: groupConversationsByDate(group.conversations)
        }));
    }, [userGroups]);

    const handleDelete = async (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (!confirm('确定要删除这个对话吗？')) return;
        if (useLocalHistory) {
            deleteLocalConversation(id);
            return;
        }
        await deleteConversation(id);
    };

    const handleStartEdit = (id: string, currentTitle: string | null, e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setEditingId(id);
        setEditingTitle(currentTitle || '未命名对话');
    };

    const handleSaveEdit = async (id: string, e: React.MouseEvent<HTMLButtonElement | HTMLInputElement>) => {
        e.stopPropagation();
        if (editingTitle.trim()) {
            if (useLocalHistory) {
                updateLocalConversationTitle(id, editingTitle.trim());
            } else {
                await updateConversationTitle(id, editingTitle.trim());
            }
        }
        setEditingId(null);
        setEditingTitle('');
    };

    const handleCancelEdit = (e: React.MouseEvent<HTMLButtonElement | HTMLInputElement>) => {
        e.stopPropagation();
        setEditingId(null);
        setEditingTitle('');
    };

    const showRemoteListLoading = !useLocalHistory && isConversationListLoading;

    // 收起状态：只显示图标
    if (isCollapsed) {
        return (
            <>
                {/* 背景遮罩（仅移动端） */}
                {isOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm lg:hidden"
                        onClick={onClose}
                    />
                )}

                {/* 收起状态侧边栏 - 移动端只在isOpen时显示，桌面端始终显示 */}
                <div
                    className={`
                        fixed lg:relative z-50 h-full
                        w-16 flex-shrink-0
                        bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
                        transition-all duration-300
                        flex flex-col items-center py-4
                        ${isOpen ? 'flex' : 'hidden lg:flex'}
                    `}
                >
                    {/* 展开/收起按钮 */}
                    <button
                        onClick={onToggleCollapse}
                        className="mb-4 flex items-center justify-center h-10 w-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        title="展开"
                    >
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                    </button>

                    {/* 新建对话按钮 */}
                    <button
                        onClick={() => {
                            onNewConversation();
                            if (window.innerWidth < 1024) onClose();
                        }}
                        className="mb-4 p-3 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/30 hover:from-amber-600 hover:to-yellow-600 transition"
                        title="新建对话"
                    >
                        <Plus className="w-6 h-6" />
                    </button>

                    {/* 对话数量指示 */}
                    <div className="flex-1 flex flex-col items-center justify-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <MessageSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <span className="text-xs text-gray-500">{totalCount}</span>
                    </div>
                </div>
            </>
        );
    }

    // 展开状态
    return (
        <>
            {/* 背景遮罩（仅移动端） */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* 侧边栏 - 移动端只在isOpen时显示，桌面端始终显示 */}
            <div
                className={`
                    fixed lg:relative z-50 h-full
                    w-72 sm:w-80 flex-shrink-0
                    bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
                    transition-all duration-300
                    flex-col
                    ${isOpen ? 'flex' : 'hidden lg:flex'}
                `}
            >
                {/* 头部 */}
                <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-amber-500" />
                            <span>对话历史</span>
                            <span className="text-xs text-gray-400">{totalCount}</span>
                        </h2>
                        <div className="flex items-center gap-1">
                            {/* 收起按钮 */}
                            <button
                                onClick={onToggleCollapse}
                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition hidden lg:block"
                                title="收起"
                            >
                                <ChevronLeft className="w-4 h-4 text-gray-500" />
                            </button>
                            {/* 关闭按钮（仅移动端） */}
                            <button
                                onClick={onClose}
                                className="flex items-center justify-center h-10 w-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition lg:hidden"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                    </div>

                    {/* 新建对话按钮 */}
                    <button
                        onClick={() => {
                            onNewConversation();
                            if (window.innerWidth < 1024) onClose();
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-white rounded-xl hover:from-amber-600 hover:to-yellow-600 transition font-medium shadow-lg shadow-amber-500/30"
                    >
                        <Plus className="w-5 h-5" />
                        新建对话
                    </button>
                </div>

                {/* 对话列表 */}
                <div className="flex-1 overflow-y-auto px-3 pb-4">
                    {!canUseHistory ? (
                        <div className="text-center py-12 text-gray-400">
                            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">请登录或配置 API Key 后查看对话历史</p>
                        </div>
                    ) : showRemoteListLoading && sourceConversations.length === 0 ? (
                        <div className="py-4 space-y-3">
                            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                                <span>正在加载对话历史...</span>
                            </div>
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div
                                    key={`history-skeleton-${index}`}
                                    className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 animate-pulse"
                                >
                                    <div className="h-3 w-3/5 bg-gray-200/80 dark:bg-gray-700/70 rounded mb-2" />
                                    <div className="h-2 w-2/5 bg-gray-200/80 dark:bg-gray-700/70 rounded" />
                                </div>
                            ))}
                        </div>
                    ) : sourceConversations.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">暂无对话历史</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {showRemoteListLoading && (
                                <div className="sticky top-0 z-10 -mx-3 px-3 py-2 bg-white/85 dark:bg-gray-900/85 backdrop-blur">
                                    <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                                        <span>加载历史中...</span>
                                    </div>
                                </div>
                            )}
                            {/* 渲染用户/API 分组，每个组内再按日期分组 */}
                            {groupsWithDateSubgroups.map((userGroup) => (
                                <div key={userGroup.key} className="space-y-2">
                                    {/* 用户组标题（仅未登录用户有多组时显示） */}
                                    {!isAuthenticated && userGroups.length > 1 && (
                                        <div className="flex items-center gap-2 py-1">
                                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                                {userGroup.label}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                ({userGroup.conversations.length})
                                            </span>
                                        </div>
                                    )}

                                    {/* 该用户组内的日期子分组 */}
                                    {(Object.entries(userGroup.dateGroups) as [string, Conversation[]][]).map(([period, convs]) =>
                                        convs.length > 0 ? (
                                            <div key={`${userGroup.key}-${period}`}>
                                                {/* 时间线标题 */}
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2">
                                                        {period}
                                                    </span>
                                                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                                                </div>

                                                {/* 对话列表 */}
                                                <div className="space-y-2">
                                                    {convs.map((conv) => {
                                                        const isActive = useLocalHistory
                                                            ? localConversationId === conv.id
                                                            : currentConversationId === conv.id;
                                                        const isConvLoading = !useLocalHistory
                                                            && isConversationLoading
                                                            && loadingConversationId === conv.id;

                                                        return (
                                                            <div
                                                                key={conv.id}
                                                                onClick={() => {
                                                                    if (useLocalHistory) {
                                                                        loadLocalConversation(conv.id);
                                                                    } else {
                                                                        onSelectConversation(conv.id);
                                                                    }
                                                                    if (window.innerWidth < 1024) onClose();
                                                                }}
                                                                className={`
                                                                group p-3 rounded-xl cursor-pointer transition relative
                                                                ${isActive
                                                                        ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                                                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                                                                    }
                                                                ${isConvLoading ? 'opacity-70' : ''}
                                                            `}
                                                            >
                                                                {/* 时间线圆点 */}
                                                                <div className={`
                                                                absolute left-0 top-4 w-2 h-2 rounded-full -translate-x-[1px]
                                                                ${isActive ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}
                                                            `} />

                                                                {editingId === conv.id ? (
                                                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                                        <input
                                                                            type="text"
                                                                            value={editingTitle}
                                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingTitle(e.currentTarget.value)}
                                                                            className="flex-1 px-2 py-1 text-sm border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                                                                            autoFocus
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    handleSaveEdit(conv.id, e as any);
                                                                                } else if (e.key === 'Escape') {
                                                                                    handleCancelEdit(e as any);
                                                                                }
                                                                            }}
                                                                        />
                                                                        <button
                                                                            onClick={(e) => handleSaveEdit(conv.id, e as any)}
                                                                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                                        >
                                                                            <Check className="w-4 h-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={handleCancelEdit}
                                                                            className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                                                        >
                                                                            <X className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <div className="flex items-start justify-between gap-2">
                                                                            <div className="flex-1 min-w-0 pl-2">
                                                                                <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                                                    {conv.title || '未命名对话'}
                                                                                </h3>
                                                                                <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                                                                                    <Clock className="w-3 h-3" />
                                                                                    <span>{formatTime(conv.updated_at)}</span>
                                                                                    <span>·</span>
                                                                                    <span>{conv.message_count} 条消息</span>
                                                                                    {isConvLoading && (
                                                                                        <>
                                                                                            <span>·</span>
                                                                                            <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                                                                                            <span className="text-amber-600 dark:text-amber-400">加载中</span>
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity touch-show-actions">
                                                                                <button
                                                                                    onClick={(e) => handleStartEdit(conv.id, conv.title, e)}
                                                                                    className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition btn-compact"
                                                                                    title="重命名"
                                                                                >
                                                                                    <Edit2 className="w-3.5 h-3.5" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => handleDelete(conv.id, e)}
                                                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition btn-compact"
                                                                                    title="删除"
                                                                                >
                                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : null
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {!useLocalHistory && conversationListTotal > conversationListPageSize && (
                        <div className="sticky bottom-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur py-2">
                            <Pagination
                                page={conversationListPage}
                                pageSize={conversationListPageSize}
                                total={conversationListTotal}
                                onPageChange={(nextPage) => loadConversationList(nextPage, conversationListPageSize)}
                            />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};
