import React, { useState, useEffect, useRef } from 'react';
import { X, MessageCircle, Plus, Send, ChevronLeft, Loader2, User, UserCog } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import {
    createTicket, getMyTickets, getTicketDetail, replyTicket,
    Ticket, TicketMessage
} from '../services/ticketService';

interface TicketModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const TicketModal = ({ isOpen, onClose }: TicketModalProps) => {
    const [activeView, setActiveView] = useState<'list' | 'create' | 'detail'>('list');
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Create Form
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newPriority, setNewPriority] = useState('normal');

    // Reply
    const [replyContent, setReplyContent] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            loadTickets();
            setActiveView('list');
        }
    }, [isOpen]);

    useEffect(() => {
        if (activeView === 'detail' && selectedTicket) {
            scrollToBottom();
        }
    }, [selectedTicket?.messages, activeView]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadTickets = async () => {
        setIsLoading(true);
        try {
            const data = await getMyTickets();
            setTickets(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    const loadTicketDetail = async (id: string) => {
        setIsLoading(true);
        try {
            const data = await getTicketDetail(id);
            setSelectedTicket(data);
            setActiveView('detail');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newTitle.trim() || !newContent.trim()) return;
        setIsLoading(true);
        try {
            await createTicket(newTitle, newContent, newPriority);
            setNewTitle('');
            setNewContent('');
            setNewPriority('normal');
            await loadTickets();
            setActiveView('list');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReply = async () => {
        if (!selectedTicket || !replyContent.trim()) return;
        try {
            // Optimistically update UI
            const optimisticMsg: TicketMessage = {
                id: Date.now().toString(),
                sender_id: 'me',
                content: replyContent,
                is_admin: false,
                created_at: new Date().toISOString()
            };
            const updatedTicket = { ...selectedTicket, messages: [...(selectedTicket.messages || []), optimisticMsg] };
            setSelectedTicket(updatedTicket);
            setReplyContent('');

            await replyTicket(selectedTicket.id, replyContent);
            // Reload to get real state
            await loadTicketDetail(selectedTicket.id);
        } catch (err) {
            setError((err as Error).message);
            // Revert on error could be implemented here
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md h-[600px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur">
                    <div className="flex items-center gap-2">
                        {activeView !== 'list' && (
                            <button
                                onClick={() => setActiveView('list')}
                                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                            >
                                <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                            </button>
                        )}
                        <h3 className="font-bold text-gray-900 dark:text-white">
                            {activeView === 'list' && '我的工单'}
                            {activeView === 'create' && '提交新工单'}
                            {activeView === 'detail' && '工单详情'}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
                    {error && (
                        <div className="m-4 p-3 bg-red-100 text-red-600 rounded-lg text-sm flex justify-between items-center">
                            <span>{error}</span>
                            <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                        </div>
                    )}

                    {/* LIST VIEW */}
                    {activeView === 'list' && (
                        <div className="p-4 space-y-3">
                            <button
                                onClick={() => setActiveView('create')}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition font-medium mb-4"
                            >
                                <Plus className="w-5 h-5" /> 提交新问题
                            </button>

                            {isLoading ? (
                                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
                            ) : tickets.length === 0 ? (
                                <div className="text-center py-10 text-gray-400 text-sm">暂无工单记录</div>
                            ) : (
                                tickets.map(ticket => (
                                    <div
                                        key={ticket.id}
                                        onClick={() => loadTicketDetail(ticket.id)}
                                        className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition cursor-pointer"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-gray-800 dark:text-gray-200 line-clamp-1">{ticket.title}</h4>
                                            <StatusBadge status={ticket.status} />
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-gray-500">
                                            <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                                            <span className={`px-2 py-0.5 rounded-full ${ticket.priority === 'high' ? 'bg-red-100 text-red-600' :
                                                ticket.priority === 'low' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-600'
                                                }`}>
                                                {ticket.priority === 'high' ? '高优先级' : '普通'}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* CREATE VIEW */}
                    {activeView === 'create' && (
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">标题</label>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTitle(e.currentTarget.value)}
                                    placeholder="简要描述问题..."
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">优先级</label>
                                <div className="flex gap-2">
                                    {['low', 'normal', 'high'].map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setNewPriority(p)}
                                            className={`flex-1 py-2 rounded-lg text-sm border ${newPriority === p
                                                ? 'bg-blue-50 border-blue-500 text-blue-600'
                                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
                                                }`}
                                        >
                                            {p === 'low' ? '低' : p === 'normal' ? '普通' : '紧急'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">详情描述</label>
                                <textarea
                                    value={newContent}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewContent(e.currentTarget.value)}
                                    placeholder="请详细描述你遇到的问题..."
                                    rows={6}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                />
                            </div>

                            <div className="pt-4">
                                <button
                                    onClick={handleCreate}
                                    disabled={isLoading || !newTitle || !newContent}
                                    className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none transition"
                                >
                                    {isLoading ? '提交中...' : '提交工单'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* DETAIL VIEW */}
                    {activeView === 'detail' && selectedTicket && (
                        <div className="flex flex-col h-full">
                            <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shadow-sm z-10">
                                <h4 className="font-bold text-lg mb-1">{selectedTicket.title}</h4>
                                <div className="flex gap-2 text-xs">
                                    <StatusBadge status={selectedTicket.status} />
                                    <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-500">ID: {selectedTicket.id.slice(0, 8)}</span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {selectedTicket.messages?.map((msg) => (
                                    <div key={msg.id} className={`flex gap-3 ${msg.is_admin ? 'flex-row' : 'flex-row-reverse'}`}>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.is_admin ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                                            }`}>
                                            {msg.is_admin ? <UserCog size={16} /> : <User size={16} />}
                                        </div>
                                        <div className={`max-w-[80%] rounded-2xl p-3 text-sm ${msg.is_admin
                                            ? 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none'
                                            : 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-500/20'
                                            }`}>
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                            <p className={`text-[10px] mt-1 opacity-70 ${msg.is_admin ? '' : 'text-blue-100'}`}>
                                                {new Date(msg.created_at).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="p-4 bg-gray-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
                                {selectedTicket.status === 'closed' ? (
                                    <div className="text-center text-gray-500 text-sm py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">工单已关闭，无法回复</div>
                                ) : (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={replyContent}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReplyContent(e.currentTarget.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
                                            placeholder="输入回复..."
                                            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        <button
                                            onClick={handleReply}
                                            disabled={!replyContent.trim()}
                                            className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition"
                                        >
                                            <Send className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const StatusBadge = ({ status }: { status: string }) => {
    const colors = {
        open: 'bg-green-100 text-green-600',
        pending: 'bg-amber-100 text-amber-600',
        resolved: 'bg-blue-100 text-blue-600',
        closed: 'bg-gray-200 text-gray-500'
    };

    const labels = {
        open: '待处理',
        pending: '待回复',
        resolved: '已解决',
        closed: '已关闭'
    };

    return (
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${(colors as any)[status] || colors.open}`}>
            {(labels as any)[status] || status}
        </span>
    );
};
