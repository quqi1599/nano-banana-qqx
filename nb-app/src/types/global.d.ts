
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
