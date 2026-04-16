import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../shared/api.service';
import { ConfigService } from '../../shared/config.service';

declare global {
  interface Window {
    google?: any;
  }
}

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './auth-page.component.html',
})
export class AuthPageComponent implements OnInit {
  mode: 'login' | 'signup' = 'login';

  name = '';
  email = '';
  password = '';

  message = '';
  messageKind = '';

  backendUnavailableNote = '';

  googleVisible = true;
  googleUnavailableNote = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: ApiService,
    private readonly configService: ConfigService,
  ) {}

  async ngOnInit(): Promise<void> {
    const routeMode = this.route.snapshot.data['mode'];
    this.mode = routeMode === 'signup' ? 'signup' : 'login';

    if (this.api.getToken() && this.api.getUser()) {
      await this.router.navigateByUrl('/dashboard');
      return;
    }

    await this.initializeGoogleLogin();
  }

  private setMessage(text: string, kind = ''): void {
    this.message = text;
    this.messageKind = kind;
  }

  private extractMessage(error: unknown): string {
    const fallback = (error as { message?: string })?.message || 'Request failed.';

    try {
      const parsed = JSON.parse(fallback);
      if (typeof parsed === 'string') {
        return parsed;
      }

      if (parsed && typeof parsed === 'object') {
        if (parsed.errors && typeof parsed.errors === 'object') {
          const firstErrorList = Object.values(parsed.errors).find((value) => Array.isArray(value) && value.length > 0);
          if (firstErrorList && typeof firstErrorList[0] === 'string') {
            return firstErrorList[0] as string;
          }
        }

        if (typeof parsed.userMessage === 'string' && parsed.userMessage.trim()) {
          return parsed.userMessage;
        }

        if (typeof parsed.message === 'string' && parsed.message.trim()) {
          return parsed.message;
        }

        if (typeof parsed.error === 'string' && parsed.error.trim()) {
          return parsed.error;
        }

        if (typeof parsed.title === 'string' && parsed.title.trim()) {
          return parsed.title;
        }
      }
    } catch {
      // Ignore parse failures and try regex extraction.
    }

    const messageMatch = fallback.match(/"Message"\s*:\s*"([^"]+)"/i);
    if (messageMatch && messageMatch[1]) {
      return messageMatch[1];
    }

    const userMessageMatch = fallback.match(/"UserMessage"\s*:\s*"([^"]+)"/i);
    if (userMessageMatch && userMessageMatch[1]) {
      return userMessageMatch[1];
    }

    return fallback;
  }

  private getGoogleOriginHelp(): string {
    const currentOrigin = window.location.origin || 'unknown origin';
    return `Register ${currentOrigin} in Google Cloud Console under Authorized JavaScript origins. If you opened the app from a file path, serve it from localhost instead.`;
  }

  private renderDisabledGoogleButton(): void {
    const container = document.getElementById('googleSignInButton');
    if (!container) {
      return;
    }

    container.innerHTML =
      '<button type="button" class="btn ghost google-disabled-btn" disabled>Sign in with Google</button>';
  }

  private isBackendUnavailable(error: unknown): boolean {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 0) {
      return true;
    }

    const message = String((error as { message?: string })?.message || '').toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('net::err_connection_refused') ||
      message.includes('unable to reach backend api') ||
      message.includes('service unavailable')
    );
  }

  private async getApiBaseUrl(): Promise<string> {
    const config = await this.configService.loadAppConfig();
    return String(config.apiBaseUrl || config.fallbackApiBaseUrl || 'the configured API URL').trim();
  }

  private async setBackendUnavailableNote(note: string): Promise<void> {
    const apiBaseUrl = await this.getApiBaseUrl();
    this.backendUnavailableNote = note ? `${note} (${apiBaseUrl})` : '';
  }

  private canUseGoogleIdentity(): boolean {
    return Boolean(window.google && window.google.accounts && window.google.accounts.id);
  }

  private async initializeGoogleLogin(): Promise<void> {
    this.googleVisible = true;
    const config = await this.configService.loadAppConfig();
    const clientId = String(config.googleClientId || '').trim();

    if (!clientId) {
      this.renderDisabledGoogleButton();
      this.googleUnavailableNote = 'Google sign-in is not enabled yet. Add googleClientId in app-config.json to enable it.';
      await this.setBackendUnavailableNote('Google sign-in is disabled until the backend is connected');
      return;
    }

    if (!this.canUseGoogleIdentity()) {
      this.renderDisabledGoogleButton();
      this.googleUnavailableNote = 'Google sign-in could not be loaded. Please refresh the page and try again.';
      await this.setBackendUnavailableNote('Google identity service could not load');
      return;
    }

    if (!/^https?:\/\//i.test(window.location.origin)) {
      this.renderDisabledGoogleButton();
      this.googleUnavailableNote = this.getGoogleOriginHelp();
      await this.setBackendUnavailableNote('Google sign-in requires a valid web origin');
      return;
    }

    const googleAuthAvailable = await this.api.isGoogleAuthAvailable();
    if (googleAuthAvailable === false) {
      this.renderDisabledGoogleButton();
      this.googleUnavailableNote =
        'Google sign-in is currently unavailable because backend Google auth route is not enabled.';
      await this.setBackendUnavailableNote('Backend is reachable, but the Google auth route is not enabled');
      return;
    }

    if (googleAuthAvailable === null) {
      this.renderDisabledGoogleButton();
      this.googleUnavailableNote = `Backend is unreachable at ${config.apiBaseUrl || 'the configured API URL'}. Start the API service or update API_BASE_URL.`;
      await this.setBackendUnavailableNote('Backend is unreachable');
      return;
    }

    this.backendUnavailableNote = '';

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (googleResponse: { credential?: string }) => {
        try {
          if (!googleResponse || !googleResponse.credential) {
            throw new Error('Google sign-in failed. Missing credential token.');
          }

          this.setMessage('Signing in with Google...');
          const response = await this.api.googleLogin(googleResponse.credential);
          const successMessage = response?.message || response?.Message || 'Google sign-in successful. Redirecting...';
          this.setMessage(successMessage, 'success');

          window.setTimeout(async () => {
            await this.router.navigateByUrl('/dashboard');
          }, 450);
        } catch (error) {
          if (Number((error as { status?: number })?.status) === 404) {
            this.setMessage(
              'Google sign-in endpoint was not found on the backend. Use email/password login or enable the Google auth API route.',
              'error',
            );
            return;
          }

          const readable = this.extractMessage(error);
          if (/origin_mismatch|authorization error|access blocked|oauth/i.test(readable)) {
            this.setMessage(this.getGoogleOriginHelp(), 'error');
            return;
          }

          this.setMessage(readable, 'error');
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    const container = document.getElementById('googleSignInButton');
    if (container) {
      container.innerHTML = '';
      window.google.accounts.id.renderButton(container, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 320,
      });
    }
  }

  async submitForm(): Promise<void> {
    this.setMessage('Working...');

    try {
      let response;
      if (this.mode === 'signup') {
        response = await this.api.signup({
          name: this.name.trim(),
          email: this.email.trim(),
          password: this.password.trim(),
        });
      } else {
        response = await this.api.login({
          email: this.email.trim(),
          password: this.password.trim(),
        });
      }

      const successMessage = response?.message || response?.Message || 'Authentication successful. Redirecting...';
      this.setMessage(successMessage, 'success');

      window.setTimeout(async () => {
        await this.router.navigateByUrl('/dashboard');
      }, 450);
    } catch (error) {
      if (this.isBackendUnavailable(error)) {
        const apiBaseUrl = await this.getApiBaseUrl();
        this.backendUnavailableNote = `Backend is unreachable at ${apiBaseUrl}. Start the API service or update API_BASE_URL.`;
        this.setMessage(
          this.backendUnavailableNote,
          'error',
        );
        return;
      }

      if (Number((error as { status?: number })?.status) === 404) {
        this.setMessage(
          'Authentication endpoint not found. Verify backend route prefix (/v1 vs /api/v1) and API base URL in app-config.json.',
          'error',
        );
        return;
      }

      const readableMessage = this.extractMessage(error);
      const alreadyExists = /already exists|already registered/i.test(readableMessage);

      if (this.mode === 'signup' && alreadyExists) {
        this.setMessage('This email is already registered. Redirecting to login...', 'error');
        window.setTimeout(async () => {
          await this.router.navigateByUrl('/login');
        }, 1200);
        return;
      }

      this.setMessage(readableMessage, 'error');
    }
  }
}
