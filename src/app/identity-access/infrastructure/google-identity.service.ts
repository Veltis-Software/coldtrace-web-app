import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SocialTokenExchangeRequest } from './authentication-response';

interface GoogleCodeResponse {
  code?: string;
  error?: string;
}

interface GoogleCodeClient {
  requestCode(options?: { prompt?: string }): void;
}

interface GoogleAccountsOAuth2 {
  initCodeClient(configuration: {
    client_id: string;
    scope: string;
    ux_mode: 'popup';
    include_granted_scopes?: boolean;
    callback: (response: GoogleCodeResponse) => void;
    error_callback?: () => void;
  }): GoogleCodeClient;
}

export type GoogleIdentityCredential = SocialTokenExchangeRequest;

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleAccountsOAuth2;
      };
    };
  }
}

/**
 * @summary Starts the Google authorization code popup flow.
 */
@Injectable({ providedIn: 'root' })
export class GoogleIdentityService {
  private scriptLoading?: Promise<void>;

  get configured(): boolean {
    return !!environment.googleOAuthClientId;
  }

  signIn(
    onCredential: (credential: GoogleIdentityCredential) => void,
    onUnavailable: () => void,
  ): void {
    if (!this.configured) {
      onUnavailable();
      return;
    }

    this.loadScript()
      .then(() => {
        const googleOAuth = window.google?.accounts?.oauth2;

        if (!googleOAuth) {
          onUnavailable();
          return;
        }

        googleOAuth
          .initCodeClient({
            client_id: environment.googleOAuthClientId,
            scope: 'openid email profile',
            ux_mode: 'popup',
            include_granted_scopes: true,
            callback: (response) => {
              if (!response.code || response.error) {
                onUnavailable();
                return;
              }
              onCredential({
                authorizationCode: response.code,
                redirectUri: window.location.origin,
              });
            },
            error_callback: onUnavailable,
          })
          .requestCode({ prompt: 'select_account' });
      })
      .catch(() => onUnavailable());
  }

  private loadScript(): Promise<void> {
    if (window.google?.accounts?.oauth2) {
      return Promise.resolve();
    }

    if (this.scriptLoading) {
      return this.scriptLoading;
    }

    this.scriptLoading = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://accounts.google.com/gsi/client"]',
      );

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.head.appendChild(script);
    });

    return this.scriptLoading;
  }
}
