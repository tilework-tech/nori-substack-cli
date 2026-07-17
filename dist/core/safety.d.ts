export declare function requireConfirmation(confirmed: unknown, impact: string): void;
export interface DryRunDescription {
    method: string;
    url: string;
    body?: unknown;
    impact: string;
}
export declare function describeDryRun(description: DryRunDescription): {
    data: DryRunDescription;
    dryRun: true;
};
