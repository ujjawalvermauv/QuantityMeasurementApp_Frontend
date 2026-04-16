import { Injectable } from '@angular/core';
import { AuthResponse, Quantity } from './models';
import { ConfigService } from './config.service';
import { AuthStoreService } from './auth-store.service';

const CONVERTERS = {
  length: {
    feet: {
      toBase: (value: number) => value * 12,
      fromBase: (value: number) => value / 12,
      canonical: 'Feet',
    },
    inches: {
      toBase: (value: number) => value,
      fromBase: (value: number) => value,
      canonical: 'Inches',
    },
    yards: {
      toBase: (value: number) => value * 36,
      fromBase: (value: number) => value / 36,
      canonical: 'Yards',
    },
    centimeters: {
      toBase: (value: number) => value / 2.54,
      fromBase: (value: number) => value * 2.54,
      canonical: 'Centimeters',
    },
  },
  weight: {
    kilogram: {
      toBase: (value: number) => value * 1000,
      fromBase: (value: number) => value / 1000,
      canonical: 'Kilogram',
    },
    gram: {
      toBase: (value: number) => value,
      fromBase: (value: number) => value,
      canonical: 'Gram',
    },
    pound: {
      toBase: (value: number) => value * 453.59237,
      fromBase: (value: number) => value / 453.59237,
      canonical: 'Pound',
    },
  },
  volume: {
    litre: {
      toBase: (value: number) => value * 1000,
      fromBase: (value: number) => value / 1000,
      canonical: 'Litre',
    },
    millilitre: {
      toBase: (value: number) => value,
      fromBase: (value: number) => value,
      canonical: 'Millilitre',
    },
    gallon: {
      toBase: (value: number) => value * 3785.411784,
      fromBase: (value: number) => value / 3785.411784,
      canonical: 'Gallon',
    },
  },
  temperature: {
    celsius: {
      toBase: (value: number) => value,
      fromBase: (value: number) => value,
      canonical: 'Celsius',
    },
    fahrenheit: {
      toBase: (value: number) => (value - 32) * (5 / 9),
      fromBase: (value: number) => value * (9 / 5) + 32,
      canonical: 'Fahrenheit',
    },
    kelvin: {
      toBase: (value: number) => value - 273.15,
      fromBase: (value: number) => value + 273.15,
      canonical: 'Kelvin',
    },
  },
} as const;

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(
    private readonly configService: ConfigService,
    private readonly authStore: AuthStoreService,
  ) {}

  getToken(): string | null {
    return this.authStore.getToken();
  }

  getUser() {
    return this.authStore.getUser();
  }

  clearAuthSession(): void {
    this.authStore.clearAuthSession();
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return String(baseUrl || '').replace(/\/+$/, '');
  }

  private buildCandidateBaseUrls(config: { apiBaseUrl?: string; fallbackApiBaseUrl?: string }): string[] {
    const variants = new Set<string>();

    [config.apiBaseUrl, config.fallbackApiBaseUrl]
      .filter(Boolean)
      .map((baseUrl) => this.normalizeBaseUrl(baseUrl as string))
      .forEach((baseUrl) => {
        variants.add(baseUrl);

        if (baseUrl.endsWith('/api')) {
          variants.add(baseUrl.slice(0, -4));
        } else {
          variants.add(`${baseUrl}/api`);
        }
      });

    return Array.from(variants).filter(Boolean);
  }

  private buildCandidatePaths(path: string): string[] {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const variants = new Set([normalized]);

    if (normalized.startsWith('/v1/')) {
      variants.add(`/api${normalized}`);
    }

    if (normalized.startsWith('/api/v1/')) {
      variants.add(normalized.replace(/^\/api/, ''));
    }

    return Array.from(variants);
  }

  private buildCandidateUrls(config: { apiBaseUrl?: string; fallbackApiBaseUrl?: string }, path: string): string[] {
    const urls = new Set<string>();
    const candidateBases = this.buildCandidateBaseUrls(config);
    const candidatePaths = this.buildCandidatePaths(path);

    candidateBases.forEach((baseUrl) => {
      candidatePaths.forEach((candidatePath) => {
        if (baseUrl.endsWith('/api') && candidatePath.startsWith('/api/')) {
          return;
        }

        urls.add(`${baseUrl}${candidatePath}`);
      });
    });

    return Array.from(urls);
  }

  private normalizeCategory(category: string): string {
    return String(category || '').trim().toLowerCase();
  }

  private normalizeUnit(unit: string): string {
    return String(unit || '').trim().toLowerCase();
  }

  private toNumber(value: unknown, fieldLabel: string): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(`${fieldLabel} must be a valid number.`);
    }
    return numeric;
  }

  private resolveConverter(category: string, unit: string) {
    const normalizedCategory = this.normalizeCategory(category) as keyof typeof CONVERTERS;
    const normalizedUnit = this.normalizeUnit(unit);
    const categoryConverters = CONVERTERS[normalizedCategory] as Record<
      string,
      { toBase: (value: number) => number; fromBase: (value: number) => number; canonical: string }
    >;

    if (!categoryConverters) {
      throw new Error(`Unsupported category: ${category}`);
    }

    const converter = categoryConverters[normalizedUnit];
    if (!converter) {
      throw new Error(`Unsupported unit '${unit}' for category '${category}'.`);
    }

    return {
      normalizedCategory,
      converter,
    };
  }

  private canonicalQuantity(category: string, value: number, unit: string): Quantity {
    const { normalizedCategory, converter } = this.resolveConverter(category, unit);
    return {
      value,
      unit: converter.canonical,
      category: normalizedCategory.charAt(0).toUpperCase() + normalizedCategory.slice(1),
    };
  }

  private convertQuantityLocal(source: Quantity, targetUnit: string): Quantity {
    const sourceResolved = this.resolveConverter(source.category, source.unit);
    const targetResolved = this.resolveConverter(source.category, targetUnit);

    const baseValue = sourceResolved.converter.toBase(source.value);
    const convertedValue = targetResolved.converter.fromBase(baseValue);

    return this.canonicalQuantity(source.category, convertedValue, targetUnit);
  }

  private ensureSameCategory(first: Quantity, second: Quantity): string {
    const firstCategory = this.normalizeCategory(first.category);
    const secondCategory = this.normalizeCategory(second.category);

    if (!firstCategory || !secondCategory || firstCategory !== secondCategory) {
      throw new Error('Both quantities must have the same category.');
    }

    return firstCategory;
  }

  private formatGuestMessage(operation: string): string {
    return `${operation} completed in local mode. Connect backend to save this in history.`;
  }

  private isNetworkLikeError(error: unknown): boolean {
    const status = Number((error as { status?: number })?.status || 0);
    if (status) {
      return false;
    }

    const text = String((error as { message?: string })?.message || '').toLowerCase();
    return text.includes('failed to fetch') || text.includes('networkerror') || text.includes('load failed');
  }

  private shouldUseGuestFallback(error: unknown): boolean {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 401 && !this.authStore.getToken()) {
      return true;
    }

    return this.isNetworkLikeError(error);
  }

  private async requestOrGuest<T>(
    path: string,
    options: { method?: string; body?: unknown; requiresAuth?: boolean },
    guestResolver: () => T,
  ): Promise<T> {
    try {
      return await this.request<T>(path, options);
    } catch (error) {
      if (this.shouldUseGuestFallback(error)) {
        return guestResolver();
      }

      throw error;
    }
  }

  private async request<T>(
    path: string,
    { method = 'GET', body = null, requiresAuth = false }: { method?: string; body?: unknown; requiresAuth?: boolean } = {},
  ): Promise<T> {
    const config = await this.configService.loadAppConfig();
    const candidateUrls = this.buildCandidateUrls(config, path);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.authStore.getToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (requiresAuth && !token) {
      throw new Error('Please login to continue.');
    }

    let lastError: unknown = null;

    for (const candidateUrl of candidateUrls) {
      try {
        const response = await fetch(candidateUrl, {
          method,
          headers,
          body: body ? JSON.stringify(body) : null,
        });

        if (!response.ok) {
          const payloadText = await response.text();
          let message = payloadText || `Request failed with status ${response.status}`;

          try {
            const payload = JSON.parse(payloadText);
            message = payload.userMessage || payload.message || payload.error || payload.title || message;
          } catch {
            // Keep plain text fallback.
          }

          const httpError = new Error(message) as Error & { status?: number; url?: string };
          httpError.status = response.status;
          httpError.url = candidateUrl;

          if (response.status === 404) {
            lastError = httpError;
            continue;
          }

          throw httpError;
        }

        if (response.status === 204) {
          return null as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        const status = Number((error as { status?: number })?.status || 0);
        const isNetworkError = !status;

        if (isNetworkError) {
          lastError = error;
          continue;
        }

        throw error;
      }
    }

    const firstCandidateUrl = candidateUrls[0] || 'the configured API URL';
    const networkMessage = `Unable to reach backend API at ${firstCandidateUrl}. Check API_BASE_URL and make sure the backend service is running.`;
    const networkError = new Error(networkMessage) as Error & { status?: number; url?: string };
    networkError.status = 0;
    networkError.url = firstCandidateUrl;

    if (lastError && this.isNetworkLikeError(lastError)) {
      throw networkError;
    }

    throw (lastError || networkError) as Error;
  }

  private async endpointExists(path: string, { method = 'GET', body = null }: { method?: string; body?: unknown } = {}) {
    const config = await this.configService.loadAppConfig();
    const candidateUrls = this.buildCandidateUrls(config, path);
    let sawNetworkFailure = false;
    let sawNotFound = false;

    for (const candidateUrl of candidateUrls) {
      try {
        const response = await fetch(candidateUrl, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : null,
        });

        if (response.status === 404) {
          sawNotFound = true;
          continue;
        }

        return true;
      } catch {
        sawNetworkFailure = true;
      }
    }

    if (sawNotFound) {
      return false;
    }

    if (sawNetworkFailure) {
      return null;
    }

    return false;
  }

  async isGoogleAuthAvailable() {
    return this.endpointExists('/v1/auth/google', { method: 'GET' });
  }

  async signup(payload: { name: string; email: string; password: string }) {
    const result = await this.request<AuthResponse>('/v1/auth/signup', {
      method: 'POST',
      body: { fullName: payload.name, email: payload.email, password: payload.password },
    });
    this.authStore.setAuthSession(result);
    return result;
  }

  async login(payload: { email: string; password: string }) {
    const result = await this.request<AuthResponse>('/v1/auth/login', {
      method: 'POST',
      body: payload,
    });
    this.authStore.setAuthSession(result);
    return result;
  }

  async googleLogin(idToken: string) {
    const result = await this.request<AuthResponse>('/v1/auth/google', {
      method: 'POST',
      body: { idToken },
    });
    this.authStore.setAuthSession(result);
    return result;
  }

  async logout() {
    this.authStore.clearAuthSession();
  }

  async convert(source: Quantity, targetUnit: string) {
    return this.requestOrGuest(
      '/v1/quantities/convert',
      {
        method: 'POST',
        body: { source, targetUnit },
      },
      () => ({
        source: this.canonicalQuantity(source.category, this.toNumber(source.value, 'Source value'), source.unit),
        quantityResult: this.convertQuantityLocal(source, targetUnit),
        message: this.formatGuestMessage('Conversion'),
      }),
    );
  }

  async compare(first: Quantity, second: Quantity) {
    return this.requestOrGuest(
      '/v1/quantities/compare',
      {
        method: 'POST',
        body: { first, second },
      },
      () => {
        this.ensureSameCategory(first, second);
        const firstCanonical = this.canonicalQuantity(first.category, this.toNumber(first.value, 'First value'), first.unit);
        const secondCanonical = this.canonicalQuantity(second.category, this.toNumber(second.value, 'Second value'), second.unit);
        const convertedSecond = this.convertQuantityLocal(secondCanonical, firstCanonical.unit);
        const delta = Math.abs(firstCanonical.value - convertedSecond.value);

        return {
          first: firstCanonical,
          second: secondCanonical,
          booleanResult: delta < 1e-9,
          message: this.formatGuestMessage('Comparison'),
        };
      },
    );
  }

  async add(first: Quantity, second: Quantity, targetUnit: string) {
    return this.requestOrGuest(
      '/v1/quantities/add',
      {
        method: 'POST',
        body: { first, second, targetUnit },
      },
      () => {
        this.ensureSameCategory(first, second);
        const firstCanonical = this.canonicalQuantity(first.category, this.toNumber(first.value, 'First value'), first.unit);
        const secondCanonical = this.canonicalQuantity(second.category, this.toNumber(second.value, 'Second value'), second.unit);
        const firstInTarget = this.convertQuantityLocal(firstCanonical, targetUnit);
        const secondInTarget = this.convertQuantityLocal(secondCanonical, targetUnit);

        return {
          first: firstCanonical,
          second: secondCanonical,
          quantityResult: this.canonicalQuantity(firstCanonical.category, firstInTarget.value + secondInTarget.value, targetUnit),
          message: this.formatGuestMessage('Addition'),
        };
      },
    );
  }

  async subtract(first: Quantity, second: Quantity, targetUnit: string) {
    return this.requestOrGuest(
      '/v1/quantities/subtract',
      {
        method: 'POST',
        body: { first, second, targetUnit },
      },
      () => {
        this.ensureSameCategory(first, second);
        const firstCanonical = this.canonicalQuantity(first.category, this.toNumber(first.value, 'First value'), first.unit);
        const secondCanonical = this.canonicalQuantity(second.category, this.toNumber(second.value, 'Second value'), second.unit);
        const firstInTarget = this.convertQuantityLocal(firstCanonical, targetUnit);
        const secondInTarget = this.convertQuantityLocal(secondCanonical, targetUnit);

        return {
          first: firstCanonical,
          second: secondCanonical,
          quantityResult: this.canonicalQuantity(firstCanonical.category, firstInTarget.value - secondInTarget.value, targetUnit),
          message: this.formatGuestMessage('Subtraction'),
        };
      },
    );
  }

  async divide(first: Quantity, second: Quantity) {
    return this.requestOrGuest(
      '/v1/quantities/divide',
      {
        method: 'POST',
        body: { first, second },
      },
      () => {
        this.ensureSameCategory(first, second);
        const firstCanonical = this.canonicalQuantity(first.category, this.toNumber(first.value, 'First value'), first.unit);
        const secondCanonical = this.canonicalQuantity(second.category, this.toNumber(second.value, 'Second value'), second.unit);
        const secondInFirst = this.convertQuantityLocal(secondCanonical, firstCanonical.unit);

        if (Math.abs(secondInFirst.value) < 1e-12) {
          throw new Error('Cannot divide by zero.');
        }

        return {
          first: firstCanonical,
          second: secondCanonical,
          scalarResult: firstCanonical.value / secondInFirst.value,
          message: this.formatGuestMessage('Division'),
        };
      },
    );
  }

  async history() {
    return this.request('/v1/quantities/history', {
      method: 'GET',
      requiresAuth: true,
    });
  }
}
