export type ChatMessage = {
    role: string;
    content: string;
};
export declare function chatWithAI(input: {
    message?: string | undefined;
    messages?: ChatMessage[] | undefined;
    model?: string | undefined;
}): Promise<{
    reply: any;
    usage: any;
    model: any;
}>;
//# sourceMappingURL=ai.d.ts.map