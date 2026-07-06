import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SocialTokenExchangeRequest } from './authentication-response';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GooglePromptMomentNotification {
  isNotDisplayed(): boolean;
  isSkippedMoment(): boolean;
}

interface GoogleAccountsId {
  initialize(configuration: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }): void;
  prompt(callback?: (notification: GooglePromptMomentNotification) => void): void;
}

export type GoogleIdentityCredential = SocialTokenExchangeRequest;

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

/**
 * @summary Starts the Google identity token prompt flow.
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
        const googleIdentity = window.google?.accounts?.id;

        if (!googleIdentity) {
          onUnavailable();
          return;
        }

        googleIdentity.initialize({
          client_id: environment.googleOAuthClientId,
          callback: (response) => {
            if (!response.credential) {
              onUnavailable();
              return;
            }

            onCredential({ idToken: response.credential });
          },
        });
        googleIdentity.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            onUnavailable();
          }
        });
      })
      .catch(() => onUnavailable());
  }

  private loadScript(): Promise<void> {
    if (window.google?.accounts?.id) {
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
