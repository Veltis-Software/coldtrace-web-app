import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthSessionStore } from './auth-session.store';

export interface UserRef {
  userId: number;
  fullName: string;
}
export interface AlertDetail {
  id: number;
  type: string;
  severity: string;
  state: string;
  detectedAt: string;
  asset: { assetId: number; name: string; locationName?: string };
  reading?: { temperature?: number; humidity?: number; recordedAt: string };
  safeRange?: {
    minTemperature: number;
    maxTemperature: number;
    minHumidity?: number;
    maxHumidity?: number;
  };
  assignee?: UserRef;
  suggestedAssignee: UserRef;
  allowedActions: string[];
  correctiveActions: { description: string; created_at: string }[];
}
export interface CurrentState {
  assetId: number;
  status: string;
  lastTemperature?: number;
  lastHumidity?: number;
  lastRecordedAt?: string;
  updatedAt: string;
  safeRange: {
    minTemperature: number;
    maxTemperature: number;
    minHumidity?: number;
    maxHumidity?: number;
  };
}
export interface StatePage {
  items: CurrentState[];
  total: number;
}
export interface AlertRow {
  id: number;
  asset_id: number;
  type: string;
  severity: string;
  status: string;
  detected_at: string;
}
export interface Notice {
  id: number;
  incident_id: number;
  channel: string;
  status: string;
  deep_link: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class IncrementApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthSessionStore);
  readonly base = environment.platformProviderApiBaseUrl;
  private headers() {
    return { Authorization: `Bearer ${this.auth.token() ?? ''}` };
  }
  get<T>(path: string) {
    return this.http.get<T>(this.base + path, { headers: this.headers() });
  }
  post<T>(path: string, body: unknown) {
    return this.http.post<T>(this.base + path, body, { headers: this.headers() });
  }
  delete<T>(path: string) {
    return this.http.delete<T>(this.base + path, { headers: this.headers() });
  }
  async stream(
    signal: AbortSignal,
    onUpdate: () => void,
    onConnection: (connected: boolean) => void,
  ): Promise<void> {
    let cursor = '';
    while (!signal.aborted) {
      try {
        const response = await fetch(this.base + '/api/v1/alerts/stream', {
          headers: { ...this.headers(), ...(cursor ? { 'Last-Event-ID': cursor } : {}) },
          signal,
        });
        if (response.status === 401 || response.status === 403) {
          onConnection(false);
          return;
        }
        if (response.status === 409) {
          cursor = '';
          onUpdate();
          throw new Error('Stream cursor expired');
        }
        if (!response.ok || !response.body) throw new Error('Stream unavailable');
        onConnection(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const message = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const lines = message.split('\n');
            const id = lines
              .find((line) => line.startsWith('id:'))
              ?.slice(3)
              .trim();
            if (id) cursor = id;
            if (
              lines.some(
                (line) =>
                  line.trim() === 'event:alert.updated' || line.trim() === 'event: alert.updated',
              )
            )
              onUpdate();
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      onConnection(false);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2000);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }
}
