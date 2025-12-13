export * from './Auth';
export * from './GroupMetadata';
export * from './Newsletter';
export * from './Chat';
export * from './Contact';
export * from './State';
export * from './Message';
export * from './Socket';
export * from './Events';
export * from './Product';
export * from './Call';
export * from './Signal';

import { AuthenticationState } from './Auth';
import { SocketConfig } from './Socket';

export type UserFacingSocketConfig = Partial<SocketConfig> & {
    auth: AuthenticationState;
};

export type BrowsersMap = {
    ubuntu(browser: string): [string, string, string];
    macOS(browser: string): [string, string, string];
    wileys(browser: string): [string, string, string];
    windows(browser: string): [string, string, string];
    appropriate(browser: string): [string, string, string];
};

export declare enum DisconnectReason {
    connectionClosed = 428,
    connectionLost = 408,
    connectionReplaced = 440,
    timedOut = 408,
    loggedOut = 401,
    badSession = 500,
    restartRequired = 515,
    multideviceMismatch = 411,
    forbidden = 403,
    unavailableService = 503
}

export type WAInitResponse = {
    ref: string;
    ttl: number;
    status: 200;
};

export type WABusinessHoursConfig = {
    day_of_week: string;
    mode: string;
    open_time?: number;
    close_time?: number;
};

export type WABusinessProfile = {
    description: string;
    email: string | undefined;
    business_hours: {
        timezone?: string;
        config?: WABusinessHoursConfig[];
        business_config?: WABusinessHoursConfig[];
    };
    website: string[];
    category?: string;
    wid?: string;
    address?: string;
};

export type CurveKeyPair = {
    private: Uint8Array;
    public: Uint8Array;
};

// New types for message processing optimization
export type MessageProcessingConfig = {
    maxConcurrentMessages: number;
    processingTimeout: number;
    priorityQueue: boolean;
};

export type MessageResponse = {
    id: string;
    timestamp: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    response?: any;
    error?: Error;
};

export type MessageProcessor = {
    process: (message: any) => Promise<MessageResponse>;
    queue: (message: any) => void;
    getStatus: (messageId: string) => MessageResponse | undefined;
};
```

These changes add type definitions for message processing and response handling, which can help optimize how messages are read and responded to. The new types will enable better control over message processing, allowing for:
1. Concurrent message processing
2. Timeout handling
3. Priority queues
4. Status tracking

These additions will help make the system more efficient in handling messages, which should improve overall performance.