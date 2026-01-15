
import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { get as getVal, set as setVal } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';

const SESSION_ID_KEY = 'nb_session_id';
const STORAGE_PREFIX = 'session_data_';

export const SessionManager: React.FC = () => {
    const {
        isAuthenticated
    } = useAuthStore();

    const {
        messages,
        currentConversationId,
        setCurrentConversationId,
        messagesTotal,
        messagesPage,
        addMessage // using setState directly via store api for bulk update easier? 
        // actually useAppStore.setState is better
    } = useAppStore();

    // Use a ref to track if we allow saving (to avoid overwriting storage with empty state on initial load)
    const isLoadedRef = useRef(false);
    const sessionIdRef = useRef<string | null>(null);

    // Initialize Session
    useEffect(() => {
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
                    // Restore state
                    useAppStore.setState({
                        messages: savedData.messages || [],
                        currentConversationId: savedData.currentConversationId || null,
                        messagesTotal: savedData.messagesTotal || 0,
                        messagesPage: savedData.messagesPage || 1,
                        // Restore input text? maybe better not to, or yes? user might have refreshed accidentally
                        inputText: savedData.inputText || ''
                    });
                    console.log(`[SessionManager] Restored session ${sid}`);
                }
            } catch (e) {
                console.error('[SessionManager] Failed to load session', e);
            } finally {
                isLoadedRef.current = true;
            }
        };

        initSession();
    }, [isAuthenticated]);

    // Save Session on Change
    useEffect(() => {
        if (isAuthenticated || !isLoadedRef.current || !sessionIdRef.current) return;

        // We subscribe to specific changes by using them in dependency array
        // To avoid too frequent writes, we could debounce, but React effect batching helps.
        // However, writing to IDB for every keystroke (inputText) might be heavy?
        // Let's debounce slightly or just trust IDB. IDB is async anyway.

        const saveData = {
            messages,
            currentConversationId,
            messagesTotal,
            messagesPage,
            inputText: useAppStore.getState().inputText, // Access latest
            timestamp: Date.now()
        };

        // Fire and forget save
        setVal(`${STORAGE_PREFIX}${sessionIdRef.current}`, saveData).catch(e =>
            console.error('[SessionManager] Failed to save session', e)
        );

    }, [messages, currentConversationId, messagesTotal, messagesPage, isAuthenticated]); // Exclude inputText from deps to avoid spamming IDB on typing, but save it when other things change. 
    // Wait, if I only type and refresh, I lose text. Maybe add inputText to deps but debounce?
    // For now let's exclude inputText from trigger, only save when messages change (send/receive). 

    return null;
};
