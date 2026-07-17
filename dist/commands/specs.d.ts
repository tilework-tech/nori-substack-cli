export interface OptionSpec {
    flags: string;
    description: string;
    defaultValue?: string | boolean;
    choices?: readonly string[];
    required?: boolean;
}
export interface OperationSpec {
    name: string;
    description: string;
    options?: readonly OptionSpec[];
}
export interface FamilySpec {
    name: string;
    description: string;
    operations: readonly OperationSpec[];
}
export declare const commandFamilies: readonly FamilySpec[];
