interface AuditEmailOptions {
    page: 'Old User' | 'New Entry';
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    customerCode?: string | null;
    globalCode?: string | null;
    handlingAgentCode?: string | null;
    changes: Array<{
        fieldName: string;
        oldValue: any;
        newValue: any;
    }>;
    executedQuery: string;
    timestamp: string;
    submittedBy?: string;
}
export declare function sendAuditEmail(options: AuditEmailOptions): Promise<any>;
export {};
//# sourceMappingURL=email.d.ts.map