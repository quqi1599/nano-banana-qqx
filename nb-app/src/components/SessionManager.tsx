
import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { get as getVal, set as setVal } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';

const SESSION_ID_KEY = 'nb_session_id';
const STORAGE_PREFIX = 'session_data_';

export const SessionManager: React.FC = () => {
    const { isAuthenticated, isLoading: authLoading } = useAuthStore();

    const {
        localConversationId,
        localConversations,
        loadLocalConversation,
        setInputText,
        inputText,
        loadConversationList,
        loadConversation,
    } = useAppStore();

    // Use a ref to track if we allow saving (to avoid overwriting storage with empty state on initial load)
    const isLoadedRef = useRef(false);
    const sessionIdRef = useRef<string | null>(null);
    const remoteRestoreRef = useRef(false);

    // Initialize Session
    useEffect(() => {
        if (authLoading) {
            return;
        }

        if (isAuthenticated) {
            isLoadedRef.current = true; // Logged in users rely on other mechanisms, enable 'save' effectively means nothing or handle differently
            return;
        }

        const initSession = async () => {
            // 1. Get or Create Session ID from sessionStorage (Tab specific)
            let sid = sessionStorage.getItem(SESSION_ID_KEY);
            if (!sid) {
                sid = uuidv4();
                sessionStorage.setItem(SESSION_ID_KEY, sid);
            }
            sessionIdRef.current = sid;

            // 2. Try to load data from IDB
            try {
                const savedData = await getVal(`${STORAGE_PREFIX}${sid}`);
                if (savedData) {
                    const restore = () => {
                        if (savedData.inputText) {
                            setInputText(savedData.inputText || '');
                        }
                        if (savedData.localConversationId) {
                            loadLocalConversation(savedData.localConversationId);
                        } else if (localConversationId) {
                            loadLocalConversation(localConversationId);
                        } else if (localConversations.length > 0) {
                            loadLocalConversation(localConversations[0].id);
                        }
                        console.log(`[SessionManager] Restored session ${sid}`);
                    };

                    if (useAppStore.persist.hasHydrated()) {
                        restore();
                    } else {
                        useAppStore.persist.onFinishHydration(restore);
                    }
                }
            } catch (e) {
                console.error('[SessionManager] Failed to load session', e);
            } finally {
                isLoadedRef.current = true;
            }
        };

        initSession();
    }, [authLoading, isAuthenticated, loadLocalConversation, localConversationId, localConversations, setInputText]);

    useEffect(() => {
        if (authLoading) return;
        if (!isAuthenticated) {
            remoteRestoreRef.current = false;
            return;
        }
        if (remoteRestoreRef.current) return;
        remoteRestoreRef.current = true;

        const restoreRemote = async () => {
            try {
                const { conversationListPageSize } = useAppStore.getState();
                const pageSize = conversationListPageSize || 20;
                await loadConversationList(1, pageSize);

                const state = useAppStore.getState();
                if (state.messages.length > 0) return;
                if (state.conversationList.length === 0) return;

                let targetId = state.currentConversationId;
                if (!targetId || !state.conversationList.some((conv) => conv.id === targetId)) {
                    targetId = state.conversationList[0]?.id;
                }
                if (targetId) {
                    await loadConversation(targetId);
                }
            } catch (e) {
                console.error('[SessionManager] Failed to restore server history', e);
            }
        };

        if (useAppStore.persist.hasHydrated()) {
            restoreRemote();
        } else {
            useAppStore.persist.onFinishHydration(restoreRemote);
        }
    }, [authLoading, isAuthenticated, loadConversationList, loadConversation]);

    // Save Session on Change
    useEffect(() => {
        if (isAuthenticated || !isLoadedRef.current || !sessionIdRef.current) return;

        const saveData = {
            localConversationId: useAppStore.getState().localConversationId,
            inputText: useAppStore.getState().inputText,
            timestamp: Date.now()
        };

        setVal(`${STORAGE_PREFIX}${sessionIdRef.current}`, saveData).catch(e =>
            console.error('[SessionManager] Failed to save session', e)
        );

    }, [localConversationId, inputText, isAuthenticated]);

    return null;
};
