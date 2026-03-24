export declare const DEBUG_TRANSFORM_DATA = "Transform Data";
export declare const DEBUG_HEADER_LAYOUT = "Header Layout";
export declare const DEBUG_VIEW_RENDER = "Data Cell Render";
export declare class DebuggerUtil {
    private static instance;
    private debug;
    static getInstance(): DebuggerUtil;
    setDebug(debug: boolean): void;
    debugCallback: (info: string, callback: () => void) => void;
    logger: (info: string, ...params: unknown[]) => void;
}
