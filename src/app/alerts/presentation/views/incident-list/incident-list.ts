import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AlertDetail, IncrementApi } from '../../../../shared/infrastructure/increment-api';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { IdentityAccessStore } from '../../../../identity-access/application/identity-access.store';
import { ListPagination } from '../../../../shared/presentation/components/list-pagination/list-pagination';
import { AlertsStore } from '../../../application/alerts.store';
import { Incident } from '../../../domain/model/incident.entity';
import { Notification } from '../../../domain/model/notification.entity';

type IncidentPanel = 'incidents' | 'closure' | 'history';

/**
 * @summary Presents the incident list user interface in the alerts bounded context.
 */
@Component({
  selector: 'app-incident-list',
  standalone: true,
  imports: [
    TranslateModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    ListPagination,
    DatePipe,
    RouterLink,
  ],
  templateUrl: './incident-list.html',
  styleUrls: ['./incident-list.css', './incident-history.css'],
})
export class IncidentList implements OnInit {
  protected readonly alertsStore = inject(AlertsStore);
  private readonly identityStore = inject(IdentityAccessStore);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
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
      this.historyError.set('Seleccione un per�odo v�lido de hasta 90 d�as.');
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
        error: () => this.historyError.set('No se pudo consultar el historial. Vuelve a intentarlo.'),
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

  protected readonly closureSubmitted = signal(false);
  protected readonly selectedNotificationIncident = signal<Incident | null>(null);
  protected readonly incidentNotifications = signal<Notification[]>([]);
  protected readonly loadingIncidentNotifications = signal(false);
  protected readonly pageSize = 10;
  protected readonly currentPage = signal(1);
  protected readonly searchTerm = signal('');
  protected readonly selectedIncidentPanel = signal<IncidentPanel>('incidents');
  protected readonly canResolveAlerts = computed(() => this.alertsStore.canResolveAlerts());
  protected readonly profileUserName = computed(() =>
    this.identityStore.currentUserNameFrom(this.identityStore.users()),
  );
  protected readonly activeIncidents = computed(() =>
    this.alertsStore.incidents().filter((incident) => !incident.isClosed),
  );
  protected readonly filteredIncidents = computed(() => {
    const searchValue = this.searchTerm().trim().toLowerCase();
    const incidents = this.activeIncidents();

    if (!searchValue) {
      return incidents;
    }

    return incidents.filter((incident) => [
      incident.assetName,
      incident.type,
      incident.value,
      incident.status,
      incident.conditionKey,
      incident.severity,
      incident.recognizedBy ?? '',
      incident.escalationStatus,
    ].some((value) => String(value ?? '').toLowerCase().includes(searchValue)));
  });
  protected readonly paginatedIncidents = computed(() =>
    this.paginate(this.filteredIncidents(), this.currentPage()),
  );
  protected readonly pendingClosureIncidents = computed(() =>
    this.activeIncidents().filter((incident) => incident.isRecognized),
  );

  protected readonly closureForm = this.fb.nonNullable.group({
    incidentId: [0, [Validators.required, Validators.min(1)]],
    correctiveAction: ['', [Validators.required, Validators.minLength(8)]],
    closureEvidence: ['', [Validators.required, Validators.minLength(8)]],
  });
  private readonly selectedClosureIncidentId = toSignal(
    this.closureForm.controls.incidentId.valueChanges,
    { initialValue: 0 },
  );
  protected readonly selectedClosureIncident = computed(() => {
    const selectedId = Number(this.selectedClosureIncidentId());
    return this.pendingClosureIncidents().find((incident) => incident.id === selectedId) ?? null;
  });

  private readonly defaultClosureSelection = effect(() => {
    const pendingIncidents = this.pendingClosureIncidents();
    const selectedId = Number(this.closureForm.controls.incidentId.value);
    const selectedStillAvailable = pendingIncidents.some((incident) => incident.id === selectedId);

    if (!selectedStillAvailable) {
      this.closureForm.controls.incidentId.setValue(pendingIncidents[0]?.id ?? 0);
    }
  });

  /**
   * @summary Initializes the incident list view state.
   */
  ngOnInit(): void {
    if (this.route.snapshot.routeConfig?.path === 'history') {
      this.selectedIncidentPanel.set('history');
      return;
    }
    if (this.route.snapshot.queryParamMap.get('panel') === 'closure') {
      this.selectedIncidentPanel.set('closure');
    }

    this.alertsStore.loadIncidents({});
  }

  protected recognize(incident: Incident): void {
    if (!incident.isOpen || this.alertsStore.recognizingId() === incident.id) {
      return;
    }
    const userName = this.profileUserName();
    this.alertsStore.recognizeIncident(incident, userName).subscribe({
      error: () => undefined,
    });
  }

  protected updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
  }

  protected selectIncidentPanel(panel: IncidentPanel): void {
    this.selectedIncidentPanel.set(panel);
    this.currentPage.set(1);
  }

  protected subtitleKey(): string {
    return this.selectedIncidentPanel() === 'closure'
      ? 'alerts.incident-list.closure-subtitle'
      : 'alerts.incident-list.incidents-subtitle';
  }

  protected openAiGuidance(incident?: Incident): void {
    const { panel: _panel, ...queryParams } = this.route.snapshot.queryParams;

    void this.router.navigate(['/alerts/ai-guidance'], {
      queryParams: {
        ...queryParams,
        ...(incident ? { incidentId: incident.id } : {}),
      },
    });
  }

  protected updatePage(page: number): void {
    this.currentPage.set(page);
  }

  protected closeIncident(): void {
    this.closureSubmitted.set(true);
    this.alertsStore.clearFeedback();
    this.closureForm.markAllAsTouched();

    if (!this.canResolveAlerts()) {
      this.alertsStore.setFeedback('alerts.incident-list.feedback-access-denied');
      return;
    }

    if (this.closureForm.invalid) {
      this.alertsStore.setFeedback('alerts.incident-list.feedback-missing-evidence');
      return;
    }

    const incident = this.selectedClosureIncident();

    if (!incident) {
      this.alertsStore.setFeedback('alerts.incident-list.feedback-invalid-incident');
      return;
    }

    if (!incident.isConditionStable) {
      this.alertsStore.setFeedback('alerts.incident-list.feedback-condition-active');
      return;
    }

    this.alertsStore
      .closeIncident(
        incident,
        this.closureForm.controls.correctiveAction.value.trim(),
        this.closureForm.controls.closureEvidence.value.trim(),
        this.profileUserName(),
      )
      .subscribe({
        next: () => {
          this.closureSubmitted.set(false);
          this.closureForm.reset({
            incidentId: this.pendingClosureIncidents()[0]?.id ?? 0,
            correctiveAction: '',
            closureEvidence: '',
          });
          this.closureForm.markAsPristine();
        },
        error: () => undefined,
      });
  }

  protected reviewIncidentNotifications(incident: Incident): void {
    this.selectedNotificationIncident.set(incident);
    this.incidentNotifications.set([]);
    this.loadingIncidentNotifications.set(true);

    this.alertsStore
      .notificationsForIncident(incident.id)
      .pipe(finalize(() => this.loadingIncidentNotifications.set(false)))
      .subscribe({
        next: (notifications) => this.incidentNotifications.set(notifications),
        error: () => this.incidentNotifications.set([]),
      });
  }

  protected stabilizeSelectedIncident(): void {
    const incident = this.selectedClosureIncident();

    if (!incident || incident.isConditionStable || this.alertsStore.stabilizingId() === incident.id) {
      return;
    }

    this.alertsStore.stabilizeIncident(incident).subscribe({
      error: () => undefined,
    });
  }

  protected hasClosureControlError(
    controlName: keyof typeof this.closureForm.controls,
  ): boolean {
    const control = this.closureForm.controls[controlName];
    return control.invalid && (control.touched || this.closureSubmitted());
  }

  protected statusLabelKey(incident: Incident): string {
    switch (incident.status) {
      case 'recognized': return 'alerts.incident-list.status-recognized';
      case 'closed': return 'alerts.incident-list.status-closed';
      default: return 'alerts.incident-list.status-open';
    }
  }

  protected escalationLabelKey(incident: Incident): string {
    return `alerts.incident-list.escalation-${incident.escalationStatus}`;
  }

  protected escalationTargetLabelKey(incident: Incident): string {
    return incident.escalatedTo
      ? `alerts.incident-list.escalation-target-${incident.escalatedTo}`
      : 'alerts.incident-list.escalation-target-none';
  }

  protected isSuccessFeedback(feedback: string): boolean {
    return [
      'alerts.incident-list.feedback-recognized',
      'alerts.incident-list.feedback-closed',
      'alerts.incident-list.feedback-stabilized',
      'alerts.incident-list.feedback-escalation-reviewed',
    ].includes(feedback);
  }

  protected severityIcon(incident: Incident): string {
    return incident.severity === 'critical' ? 'error' : 'warning';
  }

  protected conditionLabelKey(incident: Incident): string {
    return incident.isConditionStable
      ? 'alerts.incident-list.condition-stable'
      : 'alerts.incident-list.condition-active';
  }

  protected sourceLabelKey(incident: Incident): string {
    if (incident.isPendingReview) {
      return 'alerts.incident-list.source-pending-review';
    }

    if (incident.isGenerated) {
      return 'alerts.incident-list.source-generated';
    }

    return 'alerts.incident-list.source-initial';
  }

  protected typeLabelKey(incident: Incident): string {
    return `alerts.incident-list.type-${incident.type}`;
  }

  protected notificationChannelLabelKey(notification: Notification): string {
    return `alerts.notification-list.channel-${notification.channel}`;
  }

  protected notificationStatusLabelKey(notification: Notification): string {
    return `alerts.notification-list.status-${notification.status}`;
  }

  protected formatDate(isoDate: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoDate));
  }

  private paginate<T>(items: T[], page: number): T[] {
    const pageCount = Math.max(Math.ceil(items.length / this.pageSize), 1);
    const currentPage = Math.min(Math.max(page, 1), pageCount);
    const startIndex = (currentPage - 1) * this.pageSize;

    return items.slice(startIndex, startIndex + this.pageSize);
  }
}
