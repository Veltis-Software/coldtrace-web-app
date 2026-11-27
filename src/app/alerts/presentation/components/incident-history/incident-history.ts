import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { AlertDetail, IncrementApi } from '../../../../shared/infrastructure/increment-api';

/**
 * @summary Incident history by period with corrective actions and CSV export (US13, US17, US39, US41).
 */
@Component({
  selector: 'app-incident-history',
  imports: [DatePipe, ReactiveFormsModule, MatIconModule, RouterLink, TranslateModule],
  templateUrl: './incident-history.html',
  styleUrl: './incident-history.css',
})
export class IncidentHistory {
  private readonly fb = inject(FormBuilder);
  private readonly historyApi = inject(IncrementApi);
  protected readonly history = signal<AlertDetail[]>([]);
  protected readonly historyBusy = signal(false);
  protected readonly historyError = signal('');
  protected readonly historyLoaded = signal(false);
  private historyPeriod: { from: string; to: string } | null = null;
  protected readonly historyForm = this.fb.nonNullable.group({
    from: [new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), Validators.required],
    to: [new Date().toISOString().slice(0, 10), Validators.required],
    assetId: [''],
    state: [''],
    severity: [''],
    assigneeUserId: [''],
  });

  protected loadHistory(): void {
    if (this.historyForm.invalid || this.historyBusy()) return;
    const { from, to, ...filters } = this.historyForm.getRawValue();
    const start = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 1);
    this.historyError.set('');
    this.historyLoaded.set(false);
    this.history.set([]);
    if (!(start < end) || end.getTime() - start.getTime() > 90 * 86400000) {
      this.historyError.set('increment.history-panel.period');
      return;
    }
    const query = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
    }
    this.historyBusy.set(true);
    this.historyApi.get<AlertDetail[]>('/api/v1/incidents/traceability?' + query)
      .pipe(finalize(() => this.historyBusy.set(false)))
      .subscribe({
        next: rows => { this.historyPeriod = { from, to }; this.history.set(rows); this.historyLoaded.set(true); },
        error: () => this.historyError.set('increment.history-panel.error'),
      });
  }

  protected exportHistory(): void {
    const rows = this.history().map(item => [
      item.id, item.asset.name, item.state, item.severity, item.detectedAt,
      item.assignee?.fullName ?? '', item.correctiveActions.map(action => action.description).join(' | '),
    ]);
    const quote = (value: string | number) => {
      const text = String(value);
      const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    if (!this.historyPeriod || !rows.length) return;
    const { from, to } = this.historyPeriod;
    const csv = [['Incidencia', 'Activo', 'Estado', 'Severidad', 'Detectada (UTC)', 'Responsable', 'Acciones'], ...rows]
      .map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'historial-' + from + '-' + to + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

}
