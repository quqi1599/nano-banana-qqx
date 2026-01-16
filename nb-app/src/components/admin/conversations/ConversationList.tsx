import React from 'react';
import { MessageSquare, Loader2 } from 'lucide-react';
import { AdminConversation } from '../../../services/conversation/compositionService';
import { ConversationItem } from '../components/ConversationItem';
import { formatDate } from '../../../utils/formatters';

interface ConversationListProps {
    conversations: AdminConversation[];
    loading: boolean;
    onViewDetail: (id: string) => void;
    onDelete: (id: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
    conversations,
    loading,
    onViewDetail,
    onDelete,
}) => {
    if (loading) {
        return (
            <div className="p-12 text-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-cream-500" />
            </div>
        );
    }

    if (conversations.length === 0) {
        return (
            <div className="p-12 text-center text-gray-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                没有找到符合条件的对话
            </div>
        );
    }

    return (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {conversations.map((c) => (
                <ConversationItem
                    key={c.id}
                    conversation={c}
                    onViewDetail={onViewDetail}
                    onDelete={onDelete}
                />
            ))}
        </div>
    );
};
