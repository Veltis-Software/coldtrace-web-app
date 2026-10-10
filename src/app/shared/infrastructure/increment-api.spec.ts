import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { IncrementApi } from './increment-api';
import { AuthSessionStore } from './auth-session.store';
import { vi } from 'vitest';

describe('Increment API session and stream', () => {
  let api: IncrementApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionStore, useValue: { token: () => 'test-session' } },
      ],
    });
    api = TestBed.inject(IncrementApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
  });
  it('sends the current bearer for acknowledgement without placing it in the URL', () => {
    api.post('/api/v1/alerts/7/acknowledgement', { assigneeUserId: 11 }).subscribe();
    const request = http.expectOne(api.base + '/api/v1/alerts/7/acknowledgement');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-session');
    expect(request.request.body).toEqual({ assigneeUserId: 11 });
    request.flush({ undoAvailableUntil: '2026-10-09T20:00:10Z' });
  });
  it('handles split SSE frames and cancels the active stream on destruction', async () => {
    const abort = new AbortController();
    const update = vi.fn(() => abort.abort());
    const bytes = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.encode('id: event-1\nevent: alert.up'));
            controller.enqueue(bytes.encode('dated\ndata: {}\n\n'));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await api.stream(abort.signal, update, vi.fn());
    expect(update).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(api.base + '/api/v1/alerts/stream');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-session');
  });
  it('stops reconnecting when authentication expires', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const connected = vi.fn();
    await api.stream(new AbortController().signal, vi.fn(), connected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(connected).toHaveBeenLastCalledWith(false);
  });
});
