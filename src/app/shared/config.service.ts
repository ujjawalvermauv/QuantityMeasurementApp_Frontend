import { Injectable } from '@angular/core';
import { AppConfig } from './models';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private configCache?: Promise<AppConfig>;

  loadAppConfig(): Promise<AppConfig> {
    if (!this.configCache) {
      this.configCache = fetch('assets/data/app-config.json', { cache: 'no-store' }).then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load app configuration.');
        }

        return response.json() as Promise<AppConfig>;
      });
    }

    return this.configCache;
  }
}
