import { Injectable } from '@angular/core';
import { AuthResponse, AuthUser } from './models';

const TOKEN_KEY = 'qm_auth_token';
const USER_KEY = 'qm_auth_user';

@Injectable({ providedIn: 'root' })
export class AuthStoreService {
  getToken(): string | null {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  getUser(): AuthUser | null {
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  setAuthSession(authResponse: AuthResponse): void {
    const token = authResponse.token || authResponse.Token;
    const name = authResponse.name || authResponse.fullName || authResponse.FullName || '';
    const email = authResponse.email || authResponse.Email || '';
    const expiresAtUtc = authResponse.expiresAtUtc || authResponse.ExpiresAtUtc;

    if (!token) {
      throw new Error('Authentication token was not provided by API.');
    }

    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(
      USER_KEY,
      JSON.stringify({
        name,
        email,
        expiresAtUtc,
      }),
    );
  }

  clearAuthSession(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }
}
