/// <reference types="vite/client" />

import 'react';

declare module 'react' {
    interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
        // Extend standard HTML attributes to include enterKeyHint
        enterKeyHint?: 'search' | 'enter' | 'done' | 'go' | 'next' | 'previous' | 'send';
    }
    interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
        // Explicitly add to TextareaHTMLAttributes as well to satisfy stricter checks
        enterKeyHint?: 'search' | 'enter' | 'done' | 'go' | 'next' | 'previous' | 'send';
    }
}

// Vite 环境变量类型声明
interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
