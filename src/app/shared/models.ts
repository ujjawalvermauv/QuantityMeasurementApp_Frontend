export interface AppConfig {
  appName: string;
  apiBaseUrl: string;
  fallbackApiBaseUrl?: string;
  googleClientId?: string;
  categories: Record<string, string[]>;
}

export interface Quantity {
  value: number;
  unit: string;
  category: string;
}

export interface AuthUser {
  name: string;
  email: string;
  expiresAtUtc?: string;
}

export interface AuthResponse {
  token?: string;
  Token?: string;
  name?: string;
  fullName?: string;
  FullName?: string;
  email?: string;
  Email?: string;
  expiresAtUtc?: string;
  ExpiresAtUtc?: string;
  message?: string;
  Message?: string;
}

export type OperationType = 'convert' | 'compare' | 'add' | 'subtract' | 'divide';
