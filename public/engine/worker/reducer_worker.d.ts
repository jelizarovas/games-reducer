/* tslint:disable */
/* eslint-disable */

export class WorkerCore {
    free(): void;
    [Symbol.dispose](): void;
    adjust_audio(buffered: number): void;
    aspect(): number;
    fps(): number;
    frame(): void;
    height(): number;
    key(code: string, down: boolean, player: number): void;
    constructor(system: string, rom: Uint8Array, sample_rate: number, saves_json: string);
    pixels(): Uint8Array;
    release_keys(): void;
    take_audio(): Float32Array;
    take_saves(): string;
    width(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_workercore_free: (a: number, b: number) => void;
    readonly workercore_adjust_audio: (a: number, b: number) => void;
    readonly workercore_aspect: (a: number) => number;
    readonly workercore_fps: (a: number) => number;
    readonly workercore_frame: (a: number) => [number, number];
    readonly workercore_height: (a: number) => number;
    readonly workercore_key: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly workercore_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly workercore_pixels: (a: number) => [number, number];
    readonly workercore_release_keys: (a: number) => void;
    readonly workercore_take_audio: (a: number) => [number, number];
    readonly workercore_take_saves: (a: number) => [number, number];
    readonly workercore_width: (a: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
