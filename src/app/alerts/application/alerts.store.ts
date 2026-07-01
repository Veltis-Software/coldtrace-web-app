import { computed, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, retry, switchMap, tap, throwError } from 'rxjs';
import { AssetSettings } from '../../asset-management/domain/model/asset-settings.entity';
import { Asset } from '../../asset-management/domain/model/asset.entity';
import { IoTDeviceStatus } from '../../asset-management/domain/model/iot-device-status.enum';
import { IoTDevice } from '../../asset-management/domain/model/iot-device.entity';
import { AssetManagementApi } from '../../asset-management/infrastructure/asset-management-api';
import { IdentityAccessStore } from '../../identity-access/application/identity-access.store';
import { SensorReading } from '../../monitoring/domain/model/sensor-reading.entity';
import { MonitoringApi } from '../../monitoring/infrastructure/monitoring-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { EscalationPolicy } from '../domain/model/escalation-policy.entity';
import { Incident, IncidentType } from '../domain/model/incident.entity';
import { Notification } from '../domain/model/notification.entity';
import { AlertsApi } from '../infrastructure/alerts-api';

type ReadingConditionKey =
  | 'high-temperature'
  | 'low-temperature'
  | 'high-humidity'
  | 'low-humidity'
  | 'low-battery'
  | 'low-signal';
type GeneratedConditionKey = ReadingConditionKey | 'thermal-configuration-pending';
type GeneratedIncidentCandidate = {
  reading: SensorReading;
  asset: Asset;
  type: 'temperature' | 'humidity' | 'connectivity' | 'other';
  conditionKey: GeneratedConditionKey;
  severity: 'warning' | 'critical';
  value: string;
  reviewStatus: 'complete' | 'pending-review';
};
type LoadIncidentsOptions = {
  silent?: boolean;
  evaluateReadings?: boolean;
  force?: boolean;
};

/**
 * @summary Manages alerts state and workflows for presentation components.
 */
@Injectable({ providedIn: 'root' })
export class AlertsStore {
  private readonly escalationPolicies = [
    new EscalationPolicy('critical', 30, 2, 'operations-manager'),
    new EscalationPolicy('warning', 720, 1, 'shift-supervisor'),
  ];
  private readonly incidentsSignal = signal<Incident[]>([]);
  private readonly notificationsSignal = signal<Notification[]>([]);
  private readonly loadingSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly recognizingIdSignal = signal<number | null>(null);
  private readonly closingIdSignal = signal<number | null>(null);
  private readonly stabilizingIdSignal = signal<number | null>(null);
  private readonly reviewingEscalationIdSignal = signal<number | null>(null);
  private readonly feedbackSignal = signal<string | null>(null);
  private incidentsRequestInFlight = false;
  private incidentsLoadedForOrganizationId: number | null = null;
  private incidentsEvaluatedForOrganizationId: number | null = null;
  private notificationsLoadedForOrganizationId: number | null = null;

  readonly incidents = computed(() => {
    const organizationId = this.identityAccessStore.currentOrganizationIdFrom(
      this.identityAccessStore.users(),
    );

    if (!organizationId) {
      return [];
    }

    return this.incidentsSignal().filter((incident) => incident.organizationId === organizationId);
  });
  readonly notifications = computed(() => {
    const organizationId = this.identityAccessStore.currentOrganizationIdFrom(
      this.identityAccessStore.users(),
    );

    if (!organizationId) {
      return [];
    }

    return this.notificationsSignal().filter(
      (notification) => notification.organizationId === organizationId,
    );
  });
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly recognizingId = this.recognizingIdSignal.asReadonly();
  readonly closingId = this.closingIdSignal.asReadonly();
  readonly stabilizingId = this.stabilizingIdSignal.asReadonly();
  readonly reviewingEscalationId = this.reviewingEscalationIdSignal.asReadonly();
  readonly feedback = this.feedbackSignal.asReadonly();

  readonly openIncidents = computed(() => this.incidents().filter((i) => i.isOpen));
  readonly openIncidentsCount = computed(() => this.openIncidents().length);
  readonly activeNotifications = computed(() =>
    this.notifications().filter((notification) => this.isNotificationForOpenIncident(notification)),
  );
  readonly pendingNotificationsCount = computed(
    () => this.activeNotifications().filter((notification) => notification.isPending).length,
  );
  readonly failedNotificationsCount = computed(
    () => this.activeNotifications().filter((notification) => notification.isFailed).length,
  );
  readonly escalatedIncidentsCount = computed(
    () => this.incidents().filter((incident) => incident.isEscalated).length,
  );
  readonly pendingEscalationConfigurationCount = computed(
    () => this.incidents().filter((incident) => incident.isPendingEscalationConfiguration).length,
  );

  constructor(
    private readonly alertsApi: AlertsApi,
    private readonly identityAccessStore: IdentityAccessStore,
    private readonly monitoringApi: MonitoringApi,
    private readonly assetManagementApi: AssetManagementApi,
    private readonly organizationScope: OrganizationScopeStore,
  ) {}

  /**
   * @summary Loads incidents data into local state.
   */
  loadIncidents(options: LoadIncidentsOptions = {}): void {
    const showLoading = !options.silent;
    const evaluateReadings = options.evaluateReadings ?? false;
    const organizationId = this.organizationScope.activeOrganizationId();

    if (!organizationId) {
      this.incidentsSignal.set([]);
      this.notificationsSignal.set([]);
      return;
    }

    if (this.incidentsRequestInFlight) {
      return;
    }

    if (
      !options.force &&
      this.incidentsLoadedForOrganizationId === organizationId &&
      this.notificationsLoadedForOrganizationId === organizationId &&
      (!evaluateReadings || this.incidentsEvaluatedForOrganizationId === organizationId)
    ) {
      return;
    }

    this.incidentsRequestInFlight = true;

    if (showLoading) {
      this.loadingSignal.set(true);
      this.errorSignal.set(null);
    }

    if (!evaluateReadings) {
      forkJoin({
        incidents: this.alertsApi.getIncidents(),
        notifications: this.alertsApi.getNotifications().pipe(catchError(() => of([]))),
      }).subscribe({
        next: ({ incidents, notifications }) => {
          this.incidentsSignal.set(incidents);
          this.notificationsSignal.set(notifications);
          this.incidentsLoadedForOrganizationId = organizationId;
          this.notificationsLoadedForOrganizationId = organizationId;
          if (showLoading) {
            this.loadingSignal.set(false);
          }
          this.incidentsRequestInFlight = false;
        },
        error: (error) => {
          if (showLoading) {
            this.errorSignal.set(error.message);
            this.loadingSignal.set(false);
          }
          this.incidentsRequestInFlight = false;
        },
      });
      return;
    }

    forkJoin({
      incidents: this.alertsApi.getIncidents(),
      readings: this.monitoringApi.getSensorReadings(),
      assets: this.assetManagementApi.getAssets(),
      settings: this.assetManagementApi.getAssetSettings(),
    })
      .pipe(
        switchMap(({ incidents, readings, assets, settings }) => {
          const generatedIncidents = this.generatedParameterIncidentsFrom(
            incidents,
            readings,
            assets,
            settings,
          );

          const incidentsRequest = generatedIncidents.length
            ? forkJoin(
                generatedIncidents.map((incident) =>
                  this.createIncidentWithRetry(incident).pipe(catchError(() => of(null))),
                ),
              ).pipe(
                map((createdIncidents) => [
                  ...incidents,
                  ...createdIncidents.filter(
                    (incident): incident is Incident => incident !== null,
                  ),
                ]),
              )
            : of(incidents);

          return incidentsRequest.pipe(
            switchMap((currentIncidents) => this.applyEscalationPolicies(currentIncidents)),
            switchMap((currentIncidents) =>
              forkJoin({
                incidents: of(currentIncidents),
                notifications: this.alertsApi.getNotifications().pipe(catchError(() => of([]))),
              }),
            ),
          );
        }),
      )
      .subscribe({
        next: ({ incidents, notifications }) => {
          this.incidentsSignal.set(incidents);
          this.notificationsSignal.set(notifications);
          this.incidentsLoadedForOrganizationId = organizationId;
          this.incidentsEvaluatedForOrganizationId = organizationId;
          this.notificationsLoadedForOrganizationId = organizationId;
          if (showLoading) {
            this.loadingSignal.set(false);
          }
          this.incidentsRequestInFlight = false;
        },
        error: (error) => {
          if (showLoading) {
            this.errorSignal.set(error.message);
          }
          if (showLoading) {
            this.loadingSignal.set(false);
          }
          this.incidentsRequestInFlight = false;
        },
      });
  }

  /**
   * @summary Marks an incident as recognized by the responsible user.
   */
  recognizeIncident(incident: Incident, responsibleUserName: string): Observable<Incident> {
    const recognized = this.incidentWith(incident, {
      status: 'recognized',
      recognizedBy: responsibleUserName,
      recognizedAt: new Date().toISOString(),
    });

    this.recognizingIdSignal.set(incident.id);
    this.feedbackSignal.set(null);

    return this.updateIncidentWithRetry(recognized).pipe(
      tap({
        next: (updated) => {
          this.incidentsSignal.update((current) =>
            current.map((i) => (i.id === updated.id ? updated : i)),
          );
          this.refreshNotifications();
          this.recognizingIdSignal.set(null);
          this.feedbackSignal.set('alerts.incident-list.feedback-recognized');
        },
        error: () => {
          this.recognizingIdSignal.set(null);
          this.feedbackSignal.set('alerts.incident-list.feedback-error');
        },
      }),
    );
  }

  /**
   * @summary Closes an incident with corrective action and closure evidence.
   */
  closeIncident(
    incident: Incident,
    correctiveAction: string,
    closureEvidence: string,
    responsibleUserName: string,
  ): Observable<Incident> {
    const now = new Date().toISOString();
    const closed = this.incidentWith(incident, {
      status: 'closed',
      recognizedBy: incident.recognizedBy ?? responsibleUserName,
      recognizedAt: incident.recognizedAt ?? now,
      correctiveAction,
      closureEvidence,
      closedBy: responsibleUserName,
      closedAt: now,
      escalationStatus: incident.isEscalated ? 'reviewed' : incident.escalationStatus,
      escalationReviewedBy: incident.isEscalated
        ? responsibleUserName
        : incident.escalationReviewedBy,
      escalationReviewedAt: incident.isEscalated ? now : incident.escalationReviewedAt,
    });

    this.closingIdSignal.set(incident.id);
    this.feedbackSignal.set(null);

    return this.updateIncidentWithRetry(closed).pipe(
      tap({
        next: (updated) => {
          this.incidentsSignal.update((current) =>
            current.map((i) => (i.id === updated.id ? updated : i)),
          );
          this.refreshNotifications();
          this.closingIdSignal.set(null);
          this.feedbackSignal.set('alerts.incident-list.feedback-closed');
        },
        error: () => {
          this.closingIdSignal.set(null);
          this.feedbackSignal.set('alerts.incident-list.feedback-error');
        },
      }),
    );
  }

  /**
   * @summary Marks an escalation as reviewed by the responsible user.
   */
  reviewEscalation(incident: Incident, responsibleUserName: string): Observable<Incident> {
    const reviewed = this.incidentWith(incident, {
      escalationStatus: 'reviewed',
      escalationReviewedBy: responsibleUserName,
      escalationReviewedAt: new Date().toISOString(),
    });

    this.reviewingEscalationIdSignal.set(incident.id);
    this.feedbackSignal.set(null);

    return this.updateIncidentWithRetry(reviewed).pipe(
      tap({
        next: (updated) => {
          this.incidentsSignal.update((current) =>
            current.map((i) => (i.id === updated.id ? updated : i)),
          );
          this.refreshNotifications();
          this.reviewingEscalationIdSignal.set(null);
          this.feedbackSignal.set('alerts.incident-list.feedback-escalation-reviewed');
        },
        error: () => {
          this.reviewingEscalationIdSignal.set(null);
          this.feedbackSignal.set('alerts.incident-list.feedback-error');
        },
      }),
    );
  }
  /**
   * @summary Registers an in-range reading for the incident asset and marks the condition as stable.
   */
  stabilizeIncident(incident: Incident): Observable<Incident> {
    this.stabilizingIdSignal.set(incident.id);
    this.feedbackSignal.set(null);

    return forkJoin({
      assets: this.assetManagementApi.getAssets(),
      iotDevices: this.assetManagementApi.getIoTDevices(),
      settings: this.assetManagementApi.getAssetSettings(),
      readings: this.monitoringApi.getSensorReadings(),
    }).pipe(
      switchMap(({ assets, iotDevices, settings, readings }) => {
        const reading = this.stableReadingForIncident(
          incident,
          assets,
          iotDevices,
          settings,
          readings,
        );

        if (!reading) {
          return throwError(() => new Error('missing-stabilization-context'));
        }

        const stabilized = this.incidentWith(incident, { conditionStable: true });

        return this.monitoringApi
          .createSensorReading(reading)
          .pipe(map(() => stabilized));
      }),
      tap({
        next: (updated) => {
          this.incidentsSignal.update((current) =>
            current.map((i) => (i.id === updated.id ? updated : i)),
          );
          this.stabilizingIdSignal.set(null);
          this.feedbackSignal.set('alerts.incident-list.feedback-stabilized');
        },
        error: (error) => {
          this.stabilizingIdSignal.set(null);
          this.feedbackSignal.set(
            error instanceof Error && error.message === 'missing-stabilization-context'
              ? 'alerts.incident-list.feedback-stabilize-missing-device'
              : 'alerts.incident-list.feedback-stabilize-error',
          );
        },
      }),
    );
  }

  /**
   * @summary Checks whether the current role can resolve alerts.
   */
  canResolveAlerts(): boolean {
    const users = this.identityAccessStore.users();
    const roles = this.identityAccessStore.roles();
    const role = this.identityAccessStore.currentRoleFrom(users, roles);
    return this.identityAccessStore
      .permissionKeysForRole(role)
      .includes('roles-permissions.permissions.resolve-alerts');
  }

  /**
   * @summary Clears the alert feedback message key.
   */
  clearFeedback(): void {
    this.feedbackSignal.set(null);
  }

  /**
   * @summary Stores the alert feedback message key.
   */
  setFeedback(feedback: string | null): void {
    this.feedbackSignal.set(feedback);
  }

  /**
   * @summary Loads notifications linked to one incident from the backend endpoint.
   */
  notificationsForIncident(incidentId: number): Observable<Notification[]> {
    return this.alertsApi.getNotificationsByIncidentId(incidentId);
  }

  private incidentWith(
    incident: Incident,
    changes: Partial<ConstructorParameters<typeof Incident>[0]>,
  ): Incident {
    return new Incident({
      id: incident.id,
      organizationId: incident.organizationId,
      assetId: incident.assetId,
      assetName: incident.assetName,
      type: incident.type,
      severity: incident.severity,
      value: incident.value,
      detectedAt: incident.detectedAt,
      status: incident.status,
      recognizedBy: incident.recognizedBy,
      recognizedAt: incident.recognizedAt,
      conditionStable: incident.conditionStable,
      correctiveAction: incident.correctiveAction,
      closureEvidence: incident.closureEvidence,
      closedBy: incident.closedBy,
      closedAt: incident.closedAt,
      conditionKey: incident.conditionKey,
      source: incident.source,
      sourceReadingId: incident.sourceReadingId,
      reviewStatus: incident.reviewStatus,
      escalationStatus: incident.escalationStatus,
      escalationLevel: incident.escalationLevel,
      escalationPolicyMinutes: incident.escalationPolicyMinutes,
      escalatedAt: incident.escalatedAt,
      escalatedTo: incident.escalatedTo,
      escalationReviewedBy: incident.escalationReviewedBy,
      escalationReviewedAt: incident.escalationReviewedAt,
      ...changes,
    });
  }

  private createIncidentWithRetry(incident: Incident): Observable<Incident> {
    return this.alertsApi.createIncident(incident).pipe(retry({ count: 2, delay: 250 }));
  }

  private updateIncidentWithRetry(incident: Incident): Observable<Incident> {
    return this.alertsApi.updateIncident(incident).pipe(retry({ count: 2, delay: 250 }));
  }

  private isNotificationForOpenIncident(notification: Notification): boolean {
    return (
      this.incidents().find((incident) => incident.id === notification.incidentId)?.isOpen ?? false
    );
  }

  private refreshNotifications(): void {
    this.alertsApi.getNotifications().subscribe({
      next: (notifications) => {
        this.notificationsSignal.set(notifications);
        this.notificationsLoadedForOrganizationId = this.organizationScope.activeOrganizationId();
      },
      error: () => undefined,
    });
  }

  private stableReadingForIncident(
    incident: Incident,
    assets: Asset[],
    iotDevices: IoTDevice[],
    settings: AssetSettings[],
    readings: SensorReading[],
  ): SensorReading | null {
    const asset = assets.find((currentAsset) => currentAsset.id === incident.assetId);

    if (!asset) {
      return null;
    }

    const device = this.monitoringDeviceForIncident(incident, iotDevices);
    const assetSettings = this.settingsForAsset(asset, settings);

    if (!device || !assetSettings) {
      return null;
    }

    const parameters = device.measurementParameters;

    return new SensorReading(
      Math.max(...readings.map((reading) => reading.id), 0) + 1,
      asset.id,
      device.id,
      parameters.includes('temperature') ? this.stableTemperatureFor(assetSettings) : null,
      parameters.includes('humidity') ? this.stableHumidityFor(assetSettings) : null,
      false,
      new Date().toISOString(),
      parameters.includes('motion') ? false : null,
      parameters.includes('image') ? false : null,
      parameters.includes('battery') ? 80 : null,
      parameters.includes('signal') ? 85 : null,
      asset.organizationId,
      device.gatewayId,
      asset.locationId,
    );
  }

  private monitoringDeviceForIncident(
    incident: Incident,
    iotDevices: IoTDevice[],
  ): IoTDevice | null {
    const devices = iotDevices.filter(
      (iotDevice) =>
        iotDevice.assetId === incident.assetId && iotDevice.status !== IoTDeviceStatus.Offline,
    );
    const preferredParameter = this.preferredParameterForIncident(incident);

    return (
      devices.find(
        (iotDevice) =>
          preferredParameter !== null &&
          iotDevice.measurementParameters.includes(preferredParameter),
      ) ??
      devices[0] ??
      null
    );
  }

  private preferredParameterForIncident(incident: Incident): string | null {
    if (incident.type === 'temperature') {
      return 'temperature';
    }

    if (incident.type === 'humidity') {
      return 'humidity';
    }

    if (incident.type === 'connectivity' || incident.conditionKey === 'low-signal') {
      return 'signal';
    }

    if (incident.conditionKey === 'low-battery') {
      return 'battery';
    }

    return null;
  }

  private stableTemperatureFor(settings: AssetSettings): number {
    return Number(((settings.minimumTemperature + settings.maximumTemperature) / 2).toFixed(1));
  }

  private stableHumidityFor(settings: AssetSettings): number {
    return Math.max(0, Math.min(settings.maximumHumidity - 5, 65));
  }

  private applyEscalationPolicies(incidents: Incident[]): Observable<Incident[]> {
    const updates = this.escalationUpdatesFrom(incidents);

    if (!updates.length) {
      return of(incidents);
    }

    return forkJoin(
      updates.map((incident) =>
        this.updateIncidentWithRetry(incident).pipe(catchError(() => of(incident))),
      ),
    ).pipe(
      map((updatedIncidents) =>
        incidents.map(
          (incident) => updatedIncidents.find((updated) => updated.id === incident.id) ?? incident,
        ),
      ),
    );
  }

  private escalationUpdatesFrom(incidents: Incident[]): Incident[] {
    const now = new Date();
    const updates: Incident[] = [];

    incidents.forEach((incident) => {
      const updated = this.incidentWithCurrentEscalation(incident, now);

      if (updated && this.hasEscalationChanges(incident, updated)) {
        updates.push(updated);
      }
    });

    return updates;
  }

  private incidentWithCurrentEscalation(incident: Incident, now: Date): Incident | null {
    if (incident.isClosed || incident.escalationStatus === 'reviewed') {
      return null;
    }

    if (!incident.isOpen) {
      return incident.escalationStatus === 'pending-configuration'
        ? this.incidentWith(incident, {
            escalationStatus: 'none',
            escalationLevel: 0,
            escalationPolicyMinutes: this.escalationPolicyFor(incident)?.waitingMinutes ?? null,
            escalatedAt: null,
            escalatedTo: null,
          })
        : null;
    }

    const policy = this.escalationPolicyFor(incident);

    if (!policy) {
      return this.incidentWith(incident, {
        escalationStatus: 'pending-configuration',
        escalationLevel: 0,
        escalationPolicyMinutes: null,
        escalatedAt: null,
        escalatedTo: null,
      });
    }

    if (!this.hasExceededEscalationThreshold(incident, policy, now)) {
      return this.incidentWith(incident, {
        escalationStatus: 'none',
        escalationLevel: 0,
        escalationPolicyMinutes: policy.waitingMinutes,
        escalatedAt: null,
        escalatedTo: null,
      });
    }

    return this.incidentWith(incident, {
      escalationStatus: 'escalated',
      escalationLevel: policy.level,
      escalationPolicyMinutes: policy.waitingMinutes,
      escalatedAt: incident.escalatedAt ?? now.toISOString(),
      escalatedTo: policy.targetKey,
    });
  }

  private escalationPolicyFor(incident: Incident): EscalationPolicy | undefined {
    return this.escalationPolicies.find((policy) => policy.appliesTo(incident));
  }

  private hasExceededEscalationThreshold(
    incident: Incident,
    policy: EscalationPolicy,
    now: Date,
  ): boolean {
    const detectedAt = new Date(incident.detectedAt);

    if (Number.isNaN(detectedAt.getTime())) {
      return false;
    }

    const elapsedMinutes = (now.getTime() - detectedAt.getTime()) / 60000;
    return elapsedMinutes >= policy.waitingMinutes;
  }

  private hasEscalationChanges(current: Incident, updated: Incident): boolean {
    return (
      current.escalationStatus !== updated.escalationStatus ||
      current.escalatedAt !== updated.escalatedAt ||
      current.escalatedTo !== updated.escalatedTo ||
      current.escalationReviewedBy !== updated.escalationReviewedBy ||
      current.escalationReviewedAt !== updated.escalationReviewedAt
    );
  }

  private generatedParameterIncidentsFrom(
    incidents: Incident[],
    readings: SensorReading[],
    assets: Asset[],
    settings: AssetSettings[],
  ): Incident[] {
    const candidates = [
      ...this.latestParameterCandidates(readings, assets, settings),
      ...this.pendingReviewCandidates(readings, assets, settings),
    ];
    let nextId = Math.max(...incidents.map((incident) => incident.id), 0) + 1;
    const now = new Date();
    const generatedIncidents: Incident[] = [];

    candidates.forEach((candidate) => {
      if (
        this.hasActiveEquivalentIncident(
          [...incidents, ...generatedIncidents],
          candidate.asset.organizationId,
          candidate.asset.id,
          candidate.type,
        )
      ) {
        return;
      }

      const incident = new Incident({
        id: nextId,
        organizationId: candidate.asset.organizationId,
        assetId: candidate.asset.id,
        assetName: candidate.asset.name,
        type: candidate.type,
        severity: candidate.severity,
        value: candidate.value,
        detectedAt: candidate.reading.recordedAt,
        status: 'open',
        recognizedBy: null,
        recognizedAt: null,
        conditionStable: false,
        correctiveAction: null,
        closureEvidence: null,
        closedBy: null,
        closedAt: null,
        conditionKey: candidate.conditionKey,
        source: 'sensor-reading',
        sourceReadingId: candidate.reading.id,
        reviewStatus: candidate.reviewStatus,
        escalationStatus: 'none',
        escalationLevel: 0,
        escalationPolicyMinutes: null,
        escalatedAt: null,
        escalatedTo: null,
        escalationReviewedBy: null,
        escalationReviewedAt: null,
      });
      nextId += 1;
      generatedIncidents.push(this.incidentWithCurrentEscalation(incident, now) ?? incident);
    });

    return generatedIncidents;
  }

  private latestParameterCandidates(
    readings: SensorReading[],
    assets: Asset[],
    settings: AssetSettings[],
  ): GeneratedIncidentCandidate[] {
    const latestByAsset = new Map<number, { reading: SensorReading; asset: Asset }>();

    readings
      .filter((reading) => reading.isOutOfRange)
      .forEach((reading) => {
        const asset = assets.find((currentAsset) => currentAsset.id === reading.assetId);

        if (!asset) {
          return;
        }

        const previous = latestByAsset.get(asset.id);

        if (!previous || this.isNewerReading(reading, previous.reading)) {
          latestByAsset.set(asset.id, { reading, asset });
        }
      });

    return [...latestByAsset.values()]
      .flatMap(({ reading, asset }) => {
        const assetSettings = this.settingsForAsset(asset, settings);

        return this.conditionCandidatesForReading(reading, asset, assetSettings);
      })
      .sort((a, b) => b.reading.recordedAt.localeCompare(a.reading.recordedAt));
  }

  private conditionCandidatesForReading(
    reading: SensorReading,
    asset: Asset,
    assetSettings: AssetSettings | undefined,
  ): GeneratedIncidentCandidate[] {
    const candidates: GeneratedIncidentCandidate[] = [];

    if (assetSettings && reading.temperature !== null) {
      const conditionKey = this.temperatureConditionKey(reading.temperature, assetSettings);

      if (conditionKey) {
        candidates.push({
          reading,
          asset,
          type: 'temperature',
          conditionKey,
          severity: this.thermalSeverity(reading.temperature, assetSettings),
          value: `${reading.temperature}${assetSettings.temperatureUnit}`,
          reviewStatus: 'complete',
        });
      }
    }

    if (
      assetSettings &&
      reading.humidity !== null &&
      this.isHumidityOutOfRange(reading.humidity, assetSettings)
    ) {
      candidates.push({
        reading,
        asset,
        type: 'humidity',
        conditionKey:
          reading.humidity > assetSettings.maximumHumidity ? 'high-humidity' : 'low-humidity',
        severity: this.humiditySeverity(reading.humidity, assetSettings),
        value: `${reading.humidity}${assetSettings.humidityUnit}`,
        reviewStatus: 'complete',
      });
    }

    if (reading.batteryLevel !== null && reading.batteryLevel < 15) {
      candidates.push({
        reading,
        asset,
        type: 'other',
        conditionKey: 'low-battery',
        severity: reading.batteryLevel < 10 ? 'critical' : 'warning',
        value: `${reading.batteryLevel}% battery`,
        reviewStatus: 'complete',
      });
    }

    if (reading.signalStrength !== null && reading.signalStrength < 35) {
      candidates.push({
        reading,
        asset,
        type: 'connectivity',
        conditionKey: 'low-signal',
        severity: reading.signalStrength < 30 ? 'critical' : 'warning',
        value: `${reading.signalStrength}% signal`,
        reviewStatus: 'complete',
      });
    }

    return candidates;
  }

  private humiditySeverity(humidity: number, settings: AssetSettings): 'warning' | 'critical' {
    if (humidity > settings.maximumHumidity) {
      return humidity - settings.maximumHumidity >= 5 ? 'critical' : 'warning';
    }

    return settings.minimumHumidity - humidity >= 5 ? 'critical' : 'warning';
  }

  private isHumidityOutOfRange(humidity: number, settings: AssetSettings): boolean {
    return humidity < settings.minimumHumidity || humidity > settings.maximumHumidity;
  }

  private pendingReviewCandidates(
    readings: SensorReading[],
    assets: Asset[],
    settings: AssetSettings[],
  ): GeneratedIncidentCandidate[] {
    const latestByAsset = new Map<number, { reading: SensorReading; asset: Asset }>();

    readings
      .filter((reading) => {
        return reading.isOutOfRange && (reading.temperature !== null || reading.humidity !== null);
      })
      .forEach((reading) => {
        const asset = assets.find((currentAsset) => currentAsset.id === reading.assetId);

        if (!asset || this.settingsForAsset(asset, settings)) {
          return;
        }

        const previous = latestByAsset.get(asset.id);

        if (!previous || this.isNewerReading(reading, previous.reading)) {
          latestByAsset.set(asset.id, { reading, asset });
        }
      });

    return [...latestByAsset.values()].map(({ reading, asset }) => ({
      reading,
      asset,
      type: 'other',
      conditionKey: 'thermal-configuration-pending',
      severity: 'warning',
      value: 'Pending safety range',
      reviewStatus: 'pending-review',
    }));
  }

  private hasActiveEquivalentIncident(
    incidents: Incident[],
    organizationId: number,
    assetId: number,
    type: IncidentType,
  ): boolean {
    return incidents.some((incident) => {
      if (
        incident.isClosed ||
        incident.organizationId !== organizationId ||
        incident.assetId !== assetId
      ) {
        return false;
      }

      return incident.type === type;
    });
  }

  private settingsForAsset(asset: Asset, settings: AssetSettings[]): AssetSettings | undefined {
    return (
      settings.find((setting) => setting.assetId === asset.id) ??
      settings.find(
        (setting) => setting.organizationId === asset.organizationId && setting.assetId === null,
      )
    );
  }

  private temperatureConditionKey(
    temperature: number,
    settings: AssetSettings,
  ): Extract<ReadingConditionKey, 'high-temperature' | 'low-temperature'> | null {
    if (temperature > settings.maximumTemperature) {
      return 'high-temperature';
    }

    if (temperature < settings.minimumTemperature) {
      return 'low-temperature';
    }

    return null;
  }

  private thermalSeverity(temperature: number, settings: AssetSettings): 'warning' | 'critical' {
    const upperDelta = temperature - settings.maximumTemperature;
    const lowerDelta = settings.minimumTemperature - temperature;
    const deviation = Math.max(upperDelta, lowerDelta);

    return deviation >= 2 ? 'critical' : 'warning';
  }

  private isNewerReading(current: SensorReading, previous: SensorReading): boolean {
    return new Date(current.recordedAt).getTime() > new Date(previous.recordedAt).getTime();
  }
}
