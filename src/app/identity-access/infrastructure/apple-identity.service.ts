import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SocialTokenExchangeRequest } from './authentication-response';

interface AppleAuthorizationResponse {
  authorization?: {
    code?: string;
    id_token?: string;
  };
  user?: {
    email?: string;
    name?: {
      firstName?: string;
      lastName?: string;
    };
  };
}

interface AppleAuth {
  init(configuration: {
    clientId: string;
    scope: string;
    redirectURI: string;
    state: string;
    nonce: string;
    usePopup: boolean;
  }): void;
  signIn(): Promise<AppleAuthorizationResponse>;
}

export interface AppleIdentityCredential extends SocialTokenExchangeRequest {
  email?: string;
  fullName?: string;
}

declare global {
  interface Window {
    AppleID?: {
      auth?: AppleAuth;
    };
  }
}

/**
 * @summary Loads Apple JS and starts the Sign in with Apple popup flow.
 */
@Injectable({ providedIn: 'root' })
export class AppleIdentityService {
  private scriptLoading?: Promise<void>;

  get configured(): boolean {
    return !!environment.appleOAuthClientId && !!environment.appleOAuthRedirectUri;
  }

  signIn(
    onCredential: (credential: AppleIdentityCredential) => void,
    onUnavailable: () => void,
  ): void {
    if (!this.configured) {
      onUnavailable();
      return;
    }

    const nonce = this.createNonce();
    this.loadScript()
      .then(() => {
        const appleAuth = window.AppleID?.auth;

        if (!appleAuth) {
          onUnavailable();
          return;
        }

        appleAuth.init({
          clientId: environment.appleOAuthClientId,
          scope: 'name email',
          redirectURI: environment.appleOAuthRedirectUri,
          state: 'coldtrace-social-auth',
          nonce,
          usePopup: true,
        });

        appleAuth
          .signIn()
          .then((response) => {
            const authorizationCode = response.authorization?.code?.trim();
            const idToken = response.authorization?.id_token?.trim();

            if (!authorizationCode && !idToken) {
              onUnavailable();
              return;
            }

            onCredential({
              ...(idToken ? { idToken } : {}),
              ...(authorizationCode ? { authorizationCode } : {}),
              redirectUri: environment.appleOAuthRedirectUri,
              nonce,
              ...this.getUserProfile(response),
            });
          })
          .catch(() => onUnavailable());
      })
      .catch(() => onUnavailable());
  }

  private loadScript(): Promise<void> {
    if (window.AppleID?.auth) {
      return Promise.resolve();
    }

    if (this.scriptLoading) {
      return this.scriptLoading;
    }

    this.scriptLoading = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"]',
      );

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src =
        'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.head.appendChild(script);
    });

    return this.scriptLoading;
  }

  private getUserProfile(
    response: AppleAuthorizationResponse,
  ): Pick<AppleIdentityCredential, 'email' | 'fullName'> {
    const email = response.user?.email?.trim().toLowerCase();
    const fullName = [response.user?.name?.firstName?.trim(), response.user?.name?.lastName?.trim()]
      .filter(Boolean)
      .join(' ');

    return {
      ...(email ? { email } : {}),
      ...(fullName ? { fullName } : {}),
    };
  }

  private createNonce(): string {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}
