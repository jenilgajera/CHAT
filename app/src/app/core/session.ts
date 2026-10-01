const TOKEN_KEY = 'friendschat.token';
const USER_KEY = 'friendschat.user';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredUser<T>(): T | null {
  try {
    const value = localStorage.getItem(USER_KEY);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: unknown | null): void {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}
