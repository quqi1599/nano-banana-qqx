import React, { useState, useEffect } from 'react';
import { Search, MessageSquare, Trash2, X, Loader2, User, Bot, Clock } from 'lucide-react';
import {
    adminGetConversations,
    adminGetConversation,
    adminDeleteConversation,
    AdminConversation,
    AdminConversationDetail
} from '../../../services/conversationService';

export const AdminConversations = () => {
    const [conversations, setConversations] = useState<AdminConversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<AdminConversationDetail | null>(null);
    const [conversationSearch, setConversationSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [error, setError] = useState('');

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await adminGetConversations(undefined, conversationSearch);
            setConversations(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [conversationSearch]);

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

    const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this conversation?')) return;
        try {
            await adminDeleteConversation(id);
            if (selectedConversation?.id === id) {
                setSelectedConversation(null);
            }
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

            <div className={`${selectedConversation ? 'hidden lg:flex' : 'flex'} lg:w-80 w-full border-r border-gray-100 dark:border-gray-800 flex-col`}>
                <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-3">Conversations</h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={conversationSearch}
                            onChange={(e) => setConversationSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cream-500"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading && <div className="p-4 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
                    {!loading && conversations.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No conversations found</div>}
                    {conversations.map(c => (
                        <div
                            key={c.id}
                            onClick={() => loadConversationDetail(c.id)}
                            className={`p-4 border-b border-gray-50 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition group ${selectedConversation?.id === c.id ? 'bg-cream-50 dark:bg-cream-900/10 border-l-4 border-l-cream-500' : ''}`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <h4 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-1 flex-1 pr-2">{c.title || 'New Conversation'}</h4>
                                <button
                                    onClick={(e) => handleDeleteConversation(c.id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(c.created_at).toLocaleDateString()}</span>
                                <span>•</span>
                                <span>{c.user_email?.split('@')[0]}</span>
                            </div>
                            <div className="text-xs text-gray-500 truncate">{c.last_message}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={`${selectedConversation ? 'flex' : 'hidden lg:flex'} flex-1 flex-col bg-gray-50 dark:bg-gray-950`}>
                {selectedConversation ? (
                    <>
                        <div className="p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white line-clamp-1">{selectedConversation.title}</h3>
                                <p className="text-xs text-gray-500">{selectedConversation.user_email} • {new Date(selectedConversation.created_at).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setSelectedConversation(null)} className="lg:hidden p-2"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {loadingDetail && <div className="text-center p-4"><Loader2 className="w-6 h-6 animate-spin mx-auto text-cream-500" /></div>}
                            {!loadingDetail && selectedConversation.messages.map((msg, idx) => (
                                <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-cream-100 text-cream-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                    </div>
                                    <div className={`p-3 rounded-2xl max-w-[80%] ${msg.role === 'user' ? 'bg-cream-500 text-white rounded-tr-none' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'}`}>
                                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-2">
                        <MessageSquare className="w-12 h-12 opacity-20" />
                        <p>Select a conversation to view history</p>
                    </div>
                )}
            </div>
        </div>
    );
};
