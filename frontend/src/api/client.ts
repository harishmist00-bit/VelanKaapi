import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

import type { ApiErrorBody } from "../types/api";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://127.0.0.1:8000/api";

// NOTE: tokens live in localStorage. That is simple and works with the Authorization header (no CSRF),
// but means any XSS bug could read them. This app renders no user HTML; keep it that way.
export const tokenStore = {
  get access() { return localStorage.getItem("pos_access"); },
  get refresh() { return localStorage.getItem("pos_refresh"); },
  set(access: string, refresh?: string) {
    localStorage.setItem("pos_access", access);
    if (refresh) localStorage.setItem("pos_refresh", refresh);
  },
  clear() {
    localStorage.removeItem("pos_access");
    localStorage.removeItem("pos_refresh");
  },
};

export const api = axios.create({ baseURL: API_URL, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string> | null = null;

async function refreshAccess(): Promise<string> {
  const refresh = tokenStore.refresh;
  if (!refresh) throw new Error("no refresh token");
  const { data } = await axios.post(`${API_URL}/auth/refresh/`, { refresh });
  tokenStore.set(data.access, data.refresh);
  return data.access as string;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes("/auth/login/") || original?.url?.includes("/auth/refresh/");
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall && tokenStore.refresh) {
      original._retry = true;
      try {
        refreshing = refreshing ?? refreshAccess().finally(() => { refreshing = null; });
        const access = await refreshing;
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch {
        tokenStore.clear();
        window.dispatchEvent(new Event("auth:logout"));
      }
    }
    return Promise.reject(error);
  },
);

/** Turn any thrown error into one readable sentence for the UI. */
export function errorMessage(err: unknown): string {
  const e = err as AxiosError<ApiErrorBody>;
  if (e.response) {
    const body = e.response.data?.error;
    if (body) {
      const first = Object.entries(body.details ?? {})[0];
      if (body.code === "validation_error" && first) {
        const [field, msgs] = first;
        return `${field}: ${Array.isArray(msgs) ? msgs.join(" ") : String(msgs)}`;
      }
      return body.message;
    }
    if (e.response.status === 429) return "Too many attempts. Please wait a minute and try again.";
    return `Request failed (${e.response.status}).`;
  }
  if (e.code === "ECONNABORTED" || e.request) return "Cannot reach the server. Check your connection and that the backend is running.";
  return e instanceof Error ? e.message : "Something went wrong.";
}

export const isNetworkError = (err: unknown) => !(err as AxiosError).response;
