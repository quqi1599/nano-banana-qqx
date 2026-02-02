import { useState, useCallback, useEffect } from 'react';
import {
    adminGetConversationsFiltered,
    adminGetConversation,
    adminDeleteConversation,
    adminGetUserConversationStats,
    adminGetUserConversationTimeline,
    AdminConversation,
    AdminConversationDetail,
    ConversationFilters,
    UserConversationStats,
    ConversationTimelineItem,
} from '../../../../services/conversationService';

interface ConversationDataResult {
    conversations: AdminConversation[];
    selectedConversation: AdminConversationDetail | null;
    loading: boolean;
    loadingDetail: boolean;
    error: string;
    setError: (error: string) => void;
    loadConversations: () => Promise<void>;
    loadConversationDetail: (id: string) => Promise<void>;
    handleDeleteConversation: (id: string) => Promise<void>;
    stats: UserConversationStats | null;
    timeline: ConversationTimelineItem[];
    timelineLoading: boolean;
    timelineTotal: number;
    total: number;  // 对话总数（用于分页）
}

export const useConversationData = (
    filters: ConversationFilters,
    searchQuery: string,
    userId: string | null,
    page: number,
    pageSize: number,
    viewMode: 'list' | 'timeline'
): ConversationDataResult => {
    const [conversations, setConversations] = useState<AdminConversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<AdminConversationDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [error, setError] = useState('');
    const [total, setTotal] = useState(0);  // 对话总数

    const [timeline, setTimeline] = useState<ConversationTimelineItem[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [timelineTotal, setTimelineTotal] = useState(0);
    const [stats, setStats] = useState<UserConversationStats | null>(null);

    const loadConversations = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const currentFilters = { ...filters };
            if (searchQuery) currentFilters.search = searchQuery;
            if (userId) currentFilters.user_id = userId;

            const result = await adminGetConversationsFiltered(currentFilters, page, pageSize);
            setConversations(result.conversations);
            setTotal(result.total);  // 保存总数
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [filters, searchQuery, userId, page, pageSize]);

    const loadTimeline = useCallback(async () => {
        if (!userId) return;
        setTimelineLoading(true);
        try {
            const result = await adminGetUserConversationTimeline(userId, page, pageSize);
            setTimeline(result.timeline);
            setTimelineTotal(result.total);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setTimelineLoading(false);
        }
    }, [userId, page, pageSize]);

    const loadStats = useCallback(async () => {
        if (!userId) return;
        try {
            const result = await adminGetUserConversationStats(userId);
            setStats(result);
        } catch (err) {
            console.error('加载统计失败:', err);
        }
    }, [userId]);

    const loadConversationDetail = async (id: string) => {
        setLoadingDetail(true);
        try {
            const data = await adminGetConversation(id);
            setSelectedConversation(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleDeleteConversation = async (id: string) => {
        if (!confirm('确定要删除此对话吗？')) return;
        try {
            await adminDeleteConversation(id);
            if (selectedConversation?.id === id) {
                setSelectedConversation(null);
            }
            await loadConversations();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    // Load stats when userId changes
    useEffect(() => {
        if (userId) {
            loadStats();
        } else {
            setStats(null);
        }
    }, [userId, loadStats]);

    return {
        conversations,
        selectedConversation,
        loading,
        loadingDetail,
        error,
        setError,
        loadConversations,
        loadConversationDetail,
        handleDeleteConversation,
        stats,
        timeline,
        timelineLoading,
        timelineTotal,
        total,
    };
};
