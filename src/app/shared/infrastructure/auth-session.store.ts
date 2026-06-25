import { Injectable, signal } from '@angular/core';

/**
 * @summary Stores the current backend JWT session in memory.
 */
@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  private readonly tokenSignal = signal<string | null>(null);

  readonly token = this.tokenSignal.asReadonly();

  setToken(token: string | null): void {
    this.tokenSignal.set(token);
  }

  clear(): void {
    this.tokenSignal.set(null);
  }
}
