export interface Paginated<T> { count: number; next: string | null; previous: string | null; results: T[] }
export interface ApiErrorBody { error: { code: string; message: string; details: Record<string, unknown> } }
