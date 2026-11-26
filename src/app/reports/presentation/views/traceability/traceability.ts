import { Component, DestroyRef, inject, signal } from '@angular/core';

import { DatePipe } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

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
  imports: [DatePipe, FormsModule, TranslateModule, MatIconModule, RouterLink],
  styleUrl: './traceability.css',
  templateUrl: './traceability.html',
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
    clearTimeout(this.timer);
    this.report.set(null);
    this.busy.set(true);
    this.attempts = 0;
    this.api
      .post<{
        id: number;
      }>('/api/v1/reports', {
        title: this.title,
        periodStart: new Date(this.from).toISOString(),
        periodEnd: new Date(this.to).toISOString(),
      })
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
