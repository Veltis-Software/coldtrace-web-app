import { Component, DestroyRef, inject, signal } from '@angular/core';

import { DatePipe } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { TranslateModule } from '@ngx-translate/core';

import { IncrementApi } from '../../../../shared/infrastructure/increment-api';

interface Report {
  title: string;
  generatedAt: string;
  readingCount: number;
  incidentCount: number;
  assets: { name: string }[];
  readings: { assetId: number; temperature?: number; humidity?: number; recordedAt: string }[];
  incidents: {
    id: number;
    state: string;
    assignee?: { fullName: string };
    correctiveActions: { description: string }[];
  }[];
}

@Component({
  selector: 'app-traceability',
  imports: [DatePipe, FormsModule, TranslateModule],
  styleUrl: '../../../../shared/presentation/increment.css',
  template: ` <section class="increment-view">
    <h1>{{ 'increment.traceability' | translate }}</h1>
    <form (ngSubmit)="generate()">
      <label for="title">{{ 'increment.title' | translate }}</label
      ><input id="title" name="title" maxlength="200" required [(ngModel)]="title" /><label
        for="from"
        >{{ 'increment.from' | translate }}</label
      ><input id="from" name="from" type="datetime-local" required [(ngModel)]="from" /><label
        for="to"
        >{{ 'increment.to' | translate }}</label
      ><input id="to" name="to" type="datetime-local" required [(ngModel)]="to" /><button
        [disabled]="busy()"
      >
        {{ 'increment.generate' | translate }}
      </button>
    </form>

    @if (busy()) {
      <p role="status">{{ 'increment.generating' | translate }}</p>
    }
    @if (error()) {
      <p role="alert" class="error">{{ 'increment.report-error' | translate }}</p>
    }

    @if (report(); as result) {
      <header>
        <h2>{{ result.title }}</h2>
        <button (click)="download()">{{ 'increment.download' | translate }}</button>
      </header>
      <p>
        {{ result.generatedAt | date: 'medium' }} · {{ result.readingCount }}
        {{ 'increment.readings' | translate }} · {{ result.incidentCount }}
        {{ 'increment.incidents' | translate }}
      </p>

      <h2>{{ 'increment.assets' | translate }}</h2>
      @for (asset of result.assets; track $index) {
        <p>{{ asset.name }}</p>
      }

      <h2>{{ 'increment.incidents' | translate }}</h2>
      @for (incident of result.incidents; track incident.id) {
        <article>
          <p>
            #{{ incident.id }} · {{ incident.state }} ·
            {{ incident.assignee?.fullName || ('increment.unassigned' | translate) }}
          </p>
          @for (action of incident.correctiveActions; track $index) {
            <p>{{ action.description }}</p>
          }
        </article>
      }

      <h2>{{ 'increment.readings' | translate }}</h2>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{{ 'increment.asset' | translate }}</th>
              <th>{{ 'increment.recorded' | translate }}</th>
              <th>{{ 'increment.temperature' | translate }}</th>
              <th>{{ 'increment.humidity' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (reading of result.readings; track $index) {
              <tr>
                <td>{{ reading.assetId }}</td>
                <td>{{ reading.recordedAt | date: 'medium' }}</td>
                <td>{{ reading.temperature }}</td>
                <td>{{ reading.humidity }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </section>`,
})
export class Traceability {
  private readonly api = inject(IncrementApi);
  protected readonly busy = signal(false);
  protected readonly error = signal(false);
  protected readonly report = signal<Report | null>(null);

  protected title = 'Traceability';
  protected from = '';
  protected to = '';
  private timer?: ReturnType<typeof setTimeout>;
  private attempts = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected generate() {
    this.error.set(false);
    if (!this.from || !this.to || Date.parse(this.from) >= Date.parse(this.to)) {
      this.error.set(true);
      return;
    }
    this.busy.set(true);
    this.attempts = 0;
    this.api
      .post<{
        id: number;
      }>('/api/v1/reports', { title: this.title, periodStart: new Date(this.from).toISOString(), periodEnd: new Date(this.to).toISOString() })
      .subscribe({ next: (job) => this.poll(job.id), error: () => this.fail() });
  }

  private poll(id: number) {
    this.api.get<{ status: string }>(`/api/v1/reports/${id}`).subscribe({
      next: (job) => {
        if (job.status === 'READY')
          this.api.get<Report>(`/api/v1/reports/${id}/result`).subscribe({
            next: (value) => {
              this.report.set(value);
              this.busy.set(false);
            },
            error: () => this.fail(),
          });
        else if (++this.attempts < 60) this.timer = setTimeout(() => this.poll(id), 1000);
        else this.fail();
      },
      error: () => this.fail(),
    });
  }

  private fail() {
    this.error.set(true);
    this.busy.set(false);
  }

  protected download() {
    const result = this.report();
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'coldtrace-traceability.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
