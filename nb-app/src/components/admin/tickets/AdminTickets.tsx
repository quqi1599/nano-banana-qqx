import React, { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, Send, Loader2 } from 'lucide-react';
import { getAllTickets, getTicketDetail, replyTicket, updateTicketStatus, Ticket, TicketStatus } from '../../../services/ticketService';

export const AdminTickets = () => {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [ticketStatusFilter, setTicketStatusFilter] = useState('all');
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [adminReplyContent, setAdminReplyContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [replying, setReplying] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getAllTickets(ticketStatusFilter);
            setTickets(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [ticketStatusFilter]);

    useEffect(() => {
        if (selectedTicket && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedTicket?.messages]);

    const loadTicketDetail = async (id: string) => {
        try {
            const data = await getTicketDetail(id);
            setSelectedTicket(data);
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleAdminReply = async () => {
        if (!selectedTicket || !adminReplyContent.trim()) return;
        setReplying(true);
        try {
            await replyTicket(selectedTicket.id, adminReplyContent);
            setAdminReplyContent('');
            await loadTicketDetail(selectedTicket.id);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setReplying(false);
        }
    };

    const handleUpdateTicketStatus = async (status: TicketStatus) => {
        if (!selectedTicket) return;
        try {
            setSelectedTicket({ ...selectedTicket, status });
            await updateTicketStatus(selectedTicket.id, status);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm animate-fade-in-up">
            {error && (
                <div className="fixed top-4 right-4 z-50 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-2xl text-sm shadow-xl">
                    {error}
                </div>
            )}

            <div className={`${selectedTicket ? 'hidden lg:flex' : 'flex'} lg:w-80 w-full border-r border-gray-100 dark:border-gray-800 flex-col`}>
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 dark:text-white">工单支持</h3>
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 text-xs">
                        <button
                            onClick={() => setTicketStatusFilter('all')}
                            className={`px-2 py-1 rounded ${ticketStatusFilter === 'all' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}`}
                        >
                            全部
                        </button>
                        <button
                            onClick={() => setTicketStatusFilter('open')}
                            className={`px-2 py-1 rounded ${ticketStatusFilter === 'open' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}`}
                        >
                            待处理
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading && <div className="p-4 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
                    {!loading && tickets.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">暂无工单</div>}
                    {tickets.map(t => (
                        <div
                            key={t.id}
                            onClick={() => loadTicketDetail(t.id)}
                            className={`p-4 border-b border-gray-50 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition ${selectedTicket?.id === t.id ? 'bg-cream-50 dark:bg-cream-900/10 border-l-4 border-l-cream-500' : ''}`}
                        >
                            <div className="flex justify-between mb-1">
                                <h4 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-1">{t.title}</h4>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${t.status === 'open' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                            </div>
                            <div className="text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString()}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className={`${selectedTicket ? 'flex' : 'hidden lg:flex'} flex-1 flex-col bg-gray-50 dark:bg-gray-950`}>
                {selectedTicket ? (
                    <>
                        <div className="p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white">{selectedTicket.title}</h3>
                                <p className="text-xs text-gray-500">{selectedTicket.user_email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedTicket.status === 'open' && (
                                    <button
                                        onClick={() => handleUpdateTicketStatus('closed')}
                                        className="hidden sm:block text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                                    >
                                        关闭工单
                                    </button>
                                )}
                                <button onClick={() => setSelectedTicket(null)} className="lg:hidden p-2"><X size={20} /></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {selectedTicket.messages?.map(msg => (
                                <div key={msg.id} className={`flex gap-3 ${msg.is_admin ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className={`p-3 rounded-2xl max-w-[80%] ${msg.is_admin ? 'bg-cream-500 text-white rounded-tr-none' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'}`}>
                                        <p className="text-sm">{msg.content}</p>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                        <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex gap-2">
                            <input
                                value={adminReplyContent}
                                onChange={e => setAdminReplyContent(e.currentTarget.value)}
                                placeholder="输入回复..."
                                onKeyDown={e => e.key === 'Enter' && handleAdminReply()}
                                className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-cream-500"
                            />
                            <button
                                onClick={handleAdminReply}
                                disabled={!adminReplyContent.trim() || replying}
                                className="p-2 bg-cream-600 text-white rounded-xl hover:bg-cream-700 disabled:opacity-50"
                            >
                                {replying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send size={20} />}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-2">
                        <MessageSquare className="w-12 h-12 opacity-20" />
                        <p>选择工单查看详情</p>
                    </div>
                )}
            </div>
        </div>
    );
};
