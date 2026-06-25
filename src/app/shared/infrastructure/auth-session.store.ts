import { computed, Injectable, signal } from '@angular/core';

export interface AuthSessionUser {
  id: number;
  fullName: string;
  organizationId: number;
  roleId?: number;
}

export interface AuthSessionState {
  token: string;
  user: AuthSessionUser;
}

/**
 * @summary Stores the current backend JWT session in local browser storage.
 */
@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  private readonly storageKey = 'coldtrace.auth.session';
  private readonly sessionSignal = signal<AuthSessionState | null>(this.restoreSession());

  readonly session = this.sessionSignal.asReadonly();
  readonly token = computed(() => this.session()?.token ?? null);
  readonly user = computed(() => this.session()?.user ?? null);

  setSession(token: string, user: AuthSessionUser): void {
    const session: AuthSessionState = { token, user };
    this.sessionSignal.set(session);
    this.writeSession(session);
  }

  clear(): void {
    this.sessionSignal.set(null);
    this.browserStorage()?.removeItem(this.storageKey);
  }

  private restoreSession(): AuthSessionState | null {
    const storedSession = this.browserStorage()?.getItem(this.storageKey);

    if (!storedSession) {
      return null;
    }

    try {
      const session = JSON.parse(storedSession) as AuthSessionState;
      if (this.isValidSession(session)) {
        return session;
      }
    } catch {
      // Invalid local data is treated as a signed-out session.
    }

    this.browserStorage()?.removeItem(this.storageKey);
    return null;
  }

  private writeSession(session: AuthSessionState): void {
    this.browserStorage()?.setItem(this.storageKey, JSON.stringify(session));
  }

  private isValidSession(session: AuthSessionState | null): session is AuthSessionState {
    return (
      !!session?.token &&
      Number.isFinite(session.user?.id) &&
      Number.isFinite(session.user?.organizationId) &&
      !!session.user?.fullName?.trim()
    );
  }

  private browserStorage(): Storage | null {
    return typeof window === 'undefined' ? null : window.localStorage;
  }
}
