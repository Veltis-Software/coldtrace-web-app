import { Component, DestroyRef, inject, signal } from '@angular/core';

import { DatePipe } from '@angular/common';

import { RouterLink } from '@angular/router';

import { TranslateModule } from '@ngx-translate/core';

import { IncrementApi, AlertRow, Notice } from '../../../../shared/infrastructure/increment-api';

@Component({
  selector: 'app-alert-inbox',
  imports: [DatePipe, RouterLink, TranslateModule],
  styleUrl: '../../../../shared/presentation/increment.css',
  template: ` <section class="increment-view">
    <header>
      <h1>{{ 'increment.alerts' | translate }}</h1>
      <button (click)="load()">{{ 'increment.refresh' | translate }}</button>
    </header>

    @if (error()) {
      <p role="alert" class="error">{{ 'increment.load-error' | translate }}</p>
    }

    <h2>{{ 'increment.notifications' | translate }}</h2>

    @for (notice of notices(); track notice.id) {
      <article>
        <a [routerLink]="notice.deep_link"
          >{{ 'increment.open-alert' | translate }} #{{ notice.incident_id }}</a
        >
        <p>{{ notice.created_at | date: 'medium' }} · {{ notice.channel }}</p>
      </article>
    } @empty {
      <p>{{ 'increment.no-notifications' | translate }}</p>
    }

    <h2>{{ 'increment.incidents' | translate }}</h2>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{{ 'increment.asset' | translate }}</th>
            <th>{{ 'increment.type' | translate }}</th>
            <th>{{ 'increment.state' | translate }}</th>
            <th>{{ 'increment.detected' | translate }}</th>
            <th>{{ 'increment.detail' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          @for (alert of alerts(); track alert.id) {
            <tr>
              <td>{{ alert.asset_id }}</td>
              <td>{{ alert.type }} · {{ alert.severity }}</td>
              <td>{{ alert.status }}</td>
              <td>{{ alert.detected_at | date: 'medium' }}</td>
              <td>
                <a [routerLink]="['/alerts', alert.id]">{{ 'increment.open-alert' | translate }}</a>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5">{{ 'increment.no-alerts' | translate }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </section>`,
})
export class AlertInbox {
  private readonly api = inject(IncrementApi);
  protected readonly alerts = signal<AlertRow[]>([]);
  protected readonly notices = signal<Notice[]>([]);
  protected readonly error = signal(false);

  constructor() {
    this.load();
    const abort = new AbortController();
    void this.api.stream(
      abort.signal,
      () => this.load(),
      () => {},
    );
    inject(DestroyRef).onDestroy(() => abort.abort());
  }

  protected load() {
    this.error.set(false);
    this.api
      .get<AlertRow[]>('/api/v1/alerts')
      .subscribe({ next: (rows) => this.alerts.set(rows), error: () => this.error.set(true) });
    this.api
      .get<Notice[]>('/api/v1/notifications')
      .subscribe({ next: (rows) => this.notices.set(rows), error: () => this.error.set(true) });
  }
}
