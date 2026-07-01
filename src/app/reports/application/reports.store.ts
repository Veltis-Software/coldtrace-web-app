import { Injectable, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { AssetManagementStore } from '../../asset-management/application/asset-management.store';
import { AssetSettings } from '../../asset-management/domain/model/asset-settings.entity';
import { Asset } from '../../asset-management/domain/model/asset.entity';
import { CalibrationStatus } from '../../asset-management/domain/model/calibration-status.enum';
import { ConnectivityStatus } from '../../asset-management/domain/model/connectivity-status.enum';
import { IoTDevice } from '../../asset-management/domain/model/iot-device.entity';
import { SensorReading } from '../../monitoring/domain/model/sensor-reading.entity';
import { MonitoringStore } from '../../monitoring/application/monitoring.store';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { AuditEvidence, AuditEvidenceFilters } from '../domain/model/audit-evidence.entity';
import {
  ComplianceFinding,
  ComplianceFindingSeverity,
  ComplianceFindingType,
} from '../domain/model/compliance-finding.entity';
import {
  ComplianceReport,
  ComplianceReportFilters,
} from '../domain/model/compliance-report.entity';
import { EvidenceItem } from '../domain/model/evidence-item.entity';
import { FindingStatus } from '../domain/model/finding-status.enum';
import { Report } from '../domain/model/report.entity';
import { ReportType } from '../domain/model/report-type.enum';
import { DailyLog, DailyLogEntry, DailyLogStatus } from '../domain/model/daily-log.entity';
import {
  MonthlyReport,
  MonthlyReportRow,
  MonthlyReportStatus,
} from '../domain/model/monthly-report.entity';
import {
  OperationalHistory,
  OperationalHistoryEvent,
  OperationalHistoryFilters,
  OperationalHistorySeverity,
} from '../domain/model/operational-history.entity';
import {
  SanitaryComplianceFilters,
  SanitaryComplianceReport,
  SanitaryComplianceRow,
  SanitaryComplianceStatus,
} from '../domain/model/sanitary-compliance-report.entity';
import { ReportsApi } from '../infrastructure/reports-api';

interface LoadOptions {
  force?: boolean;
}

/**
 * @summary Manages reports state and workflows for presentation components.
 */
@Injectable({ providedIn: 'root' })
export class ReportsStore {
  private readonly reportsSignal = signal<Report[]>([]);
  private readonly loadingSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly closedComplianceFindingIdsSignal = signal<Set<string>>(new Set());
  private reportsLoadedForOrganizationId: number | null = null;
  private reportsRequestInFlightForOrganizationId: number | null = null;

  readonly reports = this.reportsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  constructor(
    private readonly reportsApi: ReportsApi,
    private readonly assetManagementStore: AssetManagementStore,
    private readonly monitoringStore: MonitoringStore,
    private readonly organizationScope: OrganizationScopeStore,
  ) {}

  /**
   * @summary Loads reports data into local state.
   */
  loadReports(options: LoadOptions = {}): void {
    const organizationId = this.organizationScope.activeOrganizationId();

    if (!organizationId) {
      this.reportsSignal.set([]);
      return;
    }

    if (
      !options.force &&
      (this.reportsLoadedForOrganizationId === organizationId ||
        this.reportsRequestInFlightForOrganizationId === organizationId)
    ) {
      return;
    }

    this.reportsRequestInFlightForOrganizationId = organizationId;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.reportsApi.getReports().subscribe({
      next: (reports) => {
        this.reportsSignal.set(reports);
        this.reportsLoadedForOrganizationId = organizationId;
        this.reportsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
      error: () => {
        // Stored reports are optional for the demo; generated views can still work from readings.
        this.reportsSignal.set([]);
        this.reportsLoadedForOrganizationId = organizationId;
        this.reportsRequestInFlightForOrganizationId = null;
        this.errorSignal.set(null);
        this.loadingSignal.set(false);
      },
    });
  }

  /**
   * @summary Returns reports scoped to one organization.
   */
  reportsForOrganization(organizationId: number | null): Report[] {
    if (!organizationId) {
      return [];
    }

    return this.reports().filter((report) => report.organizationId === organizationId);
  }

  /**
   * @summary Returns the current local date in ISO date format.
   */
  currentDate(): string {
    return this.today();
  }

  /**
   * @summary Builds daily log evidence from readings and monitored assets.
   */
  buildDailyLog(organizationId: number | null, date: string): DailyLog {
    const safeOrganizationId = organizationId ?? 0;
    const assets = this.assetManagementStore.assetsForOrganization(organizationId);
    const iotDevices = this.assetManagementStore.iotDevicesForOrganization(organizationId);
    const monitoredAssetIds = new Set(
      iotDevices
        .filter((iotDevice) => iotDevice.assetId !== null)
        .map((iotDevice) => iotDevice.assetId as number),
    );
    // Include monitored assets even when readings are missing so incomplete data is visible.
    const readings = this.monitoringStore
      .readingsForAssetIds(assets.map((asset) => asset.id))
      .filter((reading) => this.dateKeyFor(reading.recordedAt) === date);
    const assetsWithReadings = new Set(readings.map((reading) => reading.assetId));
    const reportAssets = assets.filter(
      (asset) => monitoredAssetIds.has(asset.id) || assetsWithReadings.has(asset.id),
    );
    const entries = reportAssets
      .map((asset) => this.buildDailyLogEntry(asset, readings, iotDevices))
      .sort((a, b) => b.totalReadings - a.totalReadings || a.assetName.localeCompare(b.assetName));
    const expectedReadings = entries.reduce((total, entry) => total + entry.expectedReadings, 0);

    return new DailyLog(
      Number(date.replaceAll('-', '')) + safeOrganizationId,
      safeOrganizationId,
      date,
      new Date().toISOString(),
      expectedReadings,
      entries,
    );
  }

  /**
   * @summary Builds chronological operational events from readings, alerts, and incidents.
   */
  buildOperationalHistory(
    organizationId: number | null,
    filters: OperationalHistoryFilters,
  ): OperationalHistory {
    const assets = this.assetManagementStore.assetsForOrganization(organizationId);
    const assetIds = assets.map((asset) => asset.id);
    const readings = this.monitoringStore
      .readingsForAssetIds(assetIds)
      .filter((reading) => this.isInDateRange(reading.recordedAt, filters.fromDate, filters.toDate))
      .filter((reading) => !filters.assetId || reading.assetId === filters.assetId);
    const readingEvents = readings.map((reading) =>
      this.historyReadingEvent(
        reading,
        assets,
        this.assetManagementStore.settingsForAsset(organizationId, reading.assetId),
      ),
    );
    const alertEvents = readings
      .filter((reading) => reading.isOutOfRange)
      .map((reading) =>
        this.historyAlertEvent(
          reading,
          assets,
          this.assetManagementStore.settingsForAsset(organizationId, reading.assetId),
        ),
      );
    const incidentEvents = assets
      .filter((asset) => !filters.assetId || asset.id === filters.assetId)
      .flatMap((asset) => this.historyIncidentEvents(asset, filters, readings));
    const events = [...readingEvents, ...alertEvents, ...incidentEvents]
      .filter((event) => filters.eventType === 'all' || event.eventType === filters.eventType)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return new OperationalHistory(filters, events);
  }

  /**
   * @summary Builds the sanitary compliance report for a date range and optional asset.
   */
  buildSanitaryComplianceReport(
    organizationId: number | null,
    filters: SanitaryComplianceFilters,
  ): SanitaryComplianceReport {
    const safeOrganizationId = organizationId ?? 0;
    const assets = this.assetManagementStore.assetsForOrganization(organizationId);
    const iotDevices = this.assetManagementStore.iotDevicesForOrganization(organizationId);
    const monitoredAssetIds = new Set(
      iotDevices
        .filter((iotDevice) => iotDevice.assetId !== null)
        .map((iotDevice) => iotDevice.assetId as number),
    );
    const selectedAssets = assets.filter(
      (asset) => !filters.assetId || asset.id === filters.assetId,
    );
    const selectedAssetIds = selectedAssets.map((asset) => asset.id);
    const readings = this.monitoringStore
      .readingsForAssetIds(selectedAssetIds)
      .filter((reading) =>
        this.isInDateRange(reading.recordedAt, filters.fromDate, filters.toDate),
      );
    const assetsWithReadings = new Set(readings.map((reading) => reading.assetId));
    const reportAssets = selectedAssets.filter((asset) => {
      return filters.assetId || monitoredAssetIds.has(asset.id) || assetsWithReadings.has(asset.id);
    });
    const daysCount = this.daysInRange(filters.fromDate, filters.toDate);
    const rows = reportAssets
      .map((asset) =>
        this.buildSanitaryComplianceRow(
          asset,
          readings,
          iotDevices,
          this.assetManagementStore.settingsForAsset(organizationId, asset.id),
          daysCount,
        ),
      )
      .sort(
        (a, b) =>
          b.totalReadings - a.totalReadings ||
          b.complianceRate - a.complianceRate ||
          a.assetName.localeCompare(b.assetName),
      );

    return new SanitaryComplianceReport(
      Number(`${filters.fromDate.replaceAll('-', '')}${safeOrganizationId}`),
      safeOrganizationId,
      filters,
      new Date().toISOString(),
      rows,
    );
  }

  /**
   * @summary Builds compliance findings and evidence items for the selected period.
   */
  buildComplianceReport(
    organizationId: number | null,
    filters: ComplianceReportFilters,
  ): ComplianceReport {
    const safeOrganizationId = organizationId ?? 0;
    const assets = this.assetManagementStore.assetsForOrganization(organizationId);
    const iotDevices = this.assetManagementStore.iotDevicesForOrganization(organizationId);
    const selectedAssets = assets.filter(
      (asset) => !filters.assetId || asset.id === filters.assetId,
    );
    const selectedAssetIds = selectedAssets.map((asset) => asset.id);
    const readings = this.monitoringStore
      .readingsForAssetIds(selectedAssetIds)
      .filter((reading) =>
        this.isInDateRange(reading.recordedAt, filters.fromDate, filters.toDate),
      );
    const daysCount = this.daysInRange(filters.fromDate, filters.toDate);
    const findings = selectedAssets
      .flatMap((asset) =>
        this.buildComplianceFindings(
          safeOrganizationId,
          asset,
          readings,
          iotDevices,
          this.assetManagementStore.settingsForAsset(organizationId, asset.id),
          filters,
          daysCount,
        ),
      )
      .filter((finding) => filters.status === 'all' || finding.status === filters.status)
      .sort(
        (a, b) =>
          this.severityWeight(b.severity) - this.severityWeight(a.severity) ||
          a.assetName.localeCompare(b.assetName) ||
          a.type.localeCompare(b.type),
      );

    return new ComplianceReport(
      Number(`${filters.fromDate.replaceAll('-', '')}${safeOrganizationId}`),
      safeOrganizationId,
      filters,
      new Date().toISOString(),
      findings,
    );
  }

  /**
   * @summary Builds audit evidence from reports, readings, and findings.
   */
  buildAuditEvidence(organizationId: number | null, filters: AuditEvidenceFilters): AuditEvidence {
    const safeOrganizationId = organizationId ?? 0;
    const assets = this.assetManagementStore.assetsForOrganization(organizationId);
    const iotDevices = this.assetManagementStore.iotDevicesForOrganization(organizationId);
    const selectedAssets = assets.filter(
      (asset) => !filters.assetId || asset.id === filters.assetId,
    );
    const selectedAssetIds = selectedAssets.map((asset) => asset.id);
    const readings = this.monitoringStore
      .readingsForAssetIds(selectedAssetIds)
      .filter((reading) =>
        this.isInDateRange(reading.recordedAt, filters.fromDate, filters.toDate),
      );
    const daysCount = this.daysInRange(filters.fromDate, filters.toDate);
    const expectedReadings = selectedAssets.reduce((total, asset) => {
      const assetDevices = iotDevices.filter((iotDevice) => iotDevice.assetId === asset.id);

      return total + this.expectedDailyReadingsFor(assetDevices, 0) * daysCount;
    }, 0);
    const complianceReview = this.buildComplianceReport(organizationId, {
      assetId: filters.assetId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      status: 'all',
    });
    const findings = complianceReview.findings;
    const incidentCount = findings.filter((finding) => finding.type === 'open-incident').length;
    const correctiveActionsCount = findings.filter(
      (finding) => finding.status === FindingStatus.Closed,
    ).length;
    const openFindingsCount = findings.filter(
      (finding) => finding.status === FindingStatus.Open,
    ).length;
    const limitationsCount = findings.filter((finding) => finding.severity === 'limitation').length;
    const periodReports = this.reportsForOrganization(organizationId).filter((report) =>
      this.reportOverlapsPeriod(report, filters),
    );
    // Evidence items are checklist rows, not stored documents, to keep the frontend delivery local.
    const items = [
      new EvidenceItem(
        'monitoring-readings',
        readings.length ? 'complete' : 'incomplete',
        readings.length,
        1,
        readings.length
          ? 'reports.audit.items.monitoring-readings-complete'
          : 'reports.audit.items.monitoring-readings-incomplete',
        { count: readings.length },
      ),
      new EvidenceItem(
        'generated-reports',
        periodReports.length ? 'complete' : 'incomplete',
        periodReports.length,
        1,
        periodReports.length
          ? 'reports.audit.items.generated-reports-complete'
          : 'reports.audit.items.generated-reports-incomplete',
        { count: periodReports.length },
      ),
      new EvidenceItem(
        'compliance-findings',
        limitationsCount ? 'incomplete' : 'complete',
        findings.length,
        0,
        limitationsCount
          ? 'reports.audit.items.compliance-findings-incomplete'
          : 'reports.audit.items.compliance-findings-complete',
        { count: findings.length, limitations: limitationsCount },
      ),
      new EvidenceItem(
        'incident-records',
        'complete',
        incidentCount,
        0,
        'reports.audit.items.incident-records-complete',
        { count: incidentCount },
      ),
      new EvidenceItem(
        'corrective-actions',
        openFindingsCount ? 'incomplete' : 'complete',
        correctiveActionsCount,
        openFindingsCount,
        openFindingsCount
          ? 'reports.audit.items.corrective-actions-incomplete'
          : 'reports.audit.items.corrective-actions-complete',
        { closed: correctiveActionsCount, open: openFindingsCount },
      ),
    ];

    return new AuditEvidence(
      Number(`${filters.fromDate.replaceAll('-', '')}${safeOrganizationId}`),
      safeOrganizationId,
      filters,
      new Date().toISOString(),
      items,
      readings.length,
      expectedReadings,
      incidentCount,
      correctiveActionsCount,
      periodReports,
      findings,
    );
  }

  /**
   * @summary Builds the monthly summary report for the selected month.
   */
  buildMonthlyReport(organizationId: number | null, month: string): MonthlyReport {
    const safeOrganizationId = organizationId ?? 0;
    const range = this.monthDateRange(month);
    const assets = this.assetManagementStore.assetsForOrganization(organizationId);
    const iotDevices = this.assetManagementStore.iotDevicesForOrganization(organizationId);
    const monitoredAssetIds = new Set(
      iotDevices
        .filter((iotDevice) => iotDevice.assetId !== null)
        .map((iotDevice) => iotDevice.assetId as number),
    );
    const readings = this.monitoringStore
      .readingsForAssetIds(assets.map((asset) => asset.id))
      .filter((reading) => this.isInDateRange(reading.recordedAt, range.fromDate, range.toDate));
    const assetsWithReadings = new Set(readings.map((reading) => reading.assetId));
    const reportAssets = assets.filter((asset) => {
      return monitoredAssetIds.has(asset.id) || assetsWithReadings.has(asset.id);
    });
    const rows = reportAssets
      .map((asset) => this.buildMonthlyReportRow(asset, readings))
      .sort(
        (a, b) =>
          b.totalReadings - a.totalReadings ||
          b.incidentCount - a.incidentCount ||
          a.assetName.localeCompare(b.assetName),
      );

    return new MonthlyReport(
      Number(month.replace('-', '')) + safeOrganizationId,
      safeOrganizationId,
      month,
      range.fromDate,
      range.toDate,
      new Date().toISOString(),
      rows,
    );
  }

  /**
   * @summary Stores a daily log report reference unless it already exists.
   */
  createDailyLogReport(organizationId: number | null, dailyLog: DailyLog): Observable<Report> {
    if (!organizationId) {
      return of(this.reportFromDailyLog(0, dailyLog));
    }

    const existingReport = this.reports().find((report) => {
      return (
        report.organizationId === organizationId &&
        report.type === ReportType.DailyLog &&
        report.periodDate === dailyLog.date
      );
    });

    if (existingReport) {
      return of(existingReport);
    }

    const report = this.reportFromDailyLog(organizationId, dailyLog);

    return this.reportsApi.createReport(report).pipe(
      tap((createdReport) => {
        this.reportsSignal.update((reports) => [...reports, createdReport]);
      }),
    );
  }

  /**
   * @summary Stores a sanitary compliance report reference unless it already exists.
   */
  createSanitaryComplianceReport(
    organizationId: number | null,
    complianceReport: SanitaryComplianceReport,
  ): Observable<Report> {
    if (!organizationId) {
      return of(this.reportFromSanitaryCompliance(0, complianceReport));
    }

    const existingReport = this.reports().find((report) => {
      return (
        report.organizationId === organizationId &&
        report.type === ReportType.Compliance &&
        report.uuid === this.sanitaryComplianceUuid(organizationId, complianceReport.filters)
      );
    });

    if (existingReport) {
      return of(existingReport);
    }

    const report = this.reportFromSanitaryCompliance(organizationId, complianceReport);

    return this.reportsApi.createReport(report).pipe(
      tap((createdReport) => {
        this.reportsSignal.update((reports) => [...reports, createdReport]);
      }),
    );
  }

  /**
   * @summary Stores a monthly summary report reference unless it already exists.
   */
  createMonthlySummaryReport(
    organizationId: number | null,
    monthlyReport: MonthlyReport,
  ): Observable<Report> {
    if (!organizationId) {
      return of(this.reportFromMonthlyReport(0, monthlyReport));
    }

    const existingReport = this.reports().find((report) => {
      return (
        report.organizationId === organizationId &&
        report.type === ReportType.MonthlySummary &&
        report.uuid === this.monthlyReportUuid(organizationId, monthlyReport.month)
      );
    });

    if (existingReport) {
      return of(existingReport);
    }

    const report = this.reportFromMonthlyReport(organizationId, monthlyReport);

    return this.reportsApi.createReport(report).pipe(
      tap((createdReport) => {
        this.reportsSignal.update((reports) => [...reports, createdReport]);
      }),
    );
  }

  /**
   * @summary Closes a compliance finding with resolution metadata.
   */
  closeComplianceFinding(findingId: string): void {
    this.closedComplianceFindingIdsSignal.update((findingIds) => {
      const nextFindingIds = new Set(findingIds);
      nextFindingIds.add(findingId);
      return nextFindingIds;
    });
  }

  /**
   * @summary Builds CSV content for sanitary compliance CSV.
   */
  sanitaryComplianceCsv(complianceReport: SanitaryComplianceReport): string {
    const headers = [
      'From',
      'To',
      'Asset',
      'Location',
      'Readings',
      'Expected',
      'Valid',
      'Out of range',
      'Missing',
      'Incidents',
      'Average temperature',
      'Average humidity',
      'Compliance',
      'Status',
    ];
    const rows = complianceReport.rows.map((row) => [
      complianceReport.filters.fromDate,
      complianceReport.filters.toDate,
      row.assetName,
      row.assetLocation,
      row.totalReadings,
      row.expectedReadings,
      row.validReadings,
      row.outOfRangeCount,
      row.missingReadings,
      row.incidentCount,
      row.averageTemperature === null ? 'N/A' : `${row.averageTemperature.toFixed(1)} C`,
      row.averageHumidity === null ? 'N/A' : `${row.averageHumidity.toFixed(0)}%`,
      `${row.complianceRate}%`,
      row.status,
    ]);

    return [headers, ...rows]
      .map((row) => row.map((cell) => this.csvCell(cell)).join(','))
      .join('\n');
  }

  /**
   * @summary Builds CSV content for monthly report CSV.
   */
  monthlyReportCsv(monthlyReport: MonthlyReport): string {
    const headers = [
      'Month',
      'From',
      'To',
      'Asset',
      'Location',
      'Readings',
      'Valid',
      'Out of range',
      'Incidents',
      'Average temperature',
      'Average humidity',
      'Compliance',
      'First reading',
      'Last reading',
      'Status',
    ];
    const rows = monthlyReport.rows.map((row) => [
      monthlyReport.month,
      monthlyReport.fromDate,
      monthlyReport.toDate,
      row.assetName,
      row.assetLocation,
      row.totalReadings,
      row.validReadings,
      row.outOfRangeCount,
      row.incidentCount,
      row.averageTemperature === null ? 'N/A' : `${row.averageTemperature.toFixed(1)} C`,
      row.averageHumidity === null ? 'N/A' : `${row.averageHumidity.toFixed(0)}%`,
      `${row.complianceRate}%`,
      row.firstRecordedAt ?? 'N/A',
      row.lastRecordedAt ?? 'N/A',
      row.status,
    ]);

    return [headers, ...rows]
      .map((row) => row.map((cell) => this.csvCell(cell)).join(','))
      .join('\n');
  }

  /**
   * @summary Builds CSV content for audit evidence CSV.
   */
  auditEvidenceCsv(auditEvidence: AuditEvidence): string {
    const checklistHeaders = ['Section', 'Status', 'Quantity', 'Required', 'Notes'];
    const checklistRows = auditEvidence.items.map((item) => [
      item.id,
      item.status,
      item.quantity,
      item.requiredQuantity,
      item.messageKey,
    ]);
    const reportHeaders = ['Report', 'Type', 'Period', 'Generated at'];
    const reportRows = auditEvidence.reports.map((report) => [
      report.title,
      report.type,
      report.periodDate,
      report.generatedAt,
    ]);
    const findingHeaders = ['Asset', 'Type', 'Severity', 'Status', 'Evidence'];
    const findingRows = auditEvidence.findings.map((finding) => [
      finding.assetName,
      finding.type,
      finding.severity,
      finding.status,
      finding.evidence,
    ]);

    return [
      ['Audit evidence', auditEvidence.filters.fromDate, auditEvidence.filters.toDate],
      [],
      checklistHeaders,
      ...checklistRows,
      [],
      reportHeaders,
      ...reportRows,
      [],
      findingHeaders,
      ...findingRows,
    ]
      .map((row) => row.map((cell) => this.csvCell(cell)).join(','))
      .join('\n');
  }

  private buildComplianceFindings(
    organizationId: number,
    asset: Asset,
    readings: SensorReading[],
    iotDevices: IoTDevice[],
    settings: AssetSettings | undefined,
    filters: ComplianceReportFilters,
    daysCount: number,
  ): ComplianceFinding[] {
    const assetReadings = readings.filter((reading) => reading.assetId === asset.id);
    const assetDevices = iotDevices.filter((iotDevice) => iotDevice.assetId === asset.id);
    const expectedReadings = assetDevices.length
      ? this.expectedDailyReadingsFor(assetDevices, assetReadings.length) * daysCount
      : assetReadings.length;
    const missingReadings = Math.max(expectedReadings - assetReadings.length, 0);
    const outOfRangeCount = assetReadings.filter((reading) => reading.isOutOfRange).length;
    const incidentKey = this.normalizeIncident(asset.lastIncident);
    const expiredDevices = assetDevices.filter(
      (iotDevice) => iotDevice.calibrationStatus === CalibrationStatus.Expired,
    );
    const findings: ComplianceFinding[] = [];

    if (!assetDevices.length) {
      findings.push(
        this.complianceFinding(
          organizationId,
          asset,
          filters,
          'incomplete-evaluation',
          'limitation',
          'reports.findings.messages.missing-device',
          'No linked monitoring device',
          { asset: asset.name },
        ),
      );
    }

    if (!settings) {
      findings.push(
        this.complianceFinding(
          organizationId,
          asset,
          filters,
          'incomplete-evaluation',
          'limitation',
          'reports.findings.messages.missing-settings',
          'No safety range configured',
          { asset: asset.name },
          'settings',
        ),
      );
    }

    if (missingReadings > 0) {
      findings.push(
        this.complianceFinding(
          organizationId,
          asset,
          filters,
          'missing-readings',
          assetReadings.length ? 'observation' : 'potential-non-compliance',
          'reports.findings.messages.missing-readings',
          `${assetReadings.length} / ${expectedReadings} readings`,
          {
            actual: assetReadings.length,
            expected: expectedReadings,
          },
        ),
      );
    }

    if (outOfRangeCount > 0) {
      findings.push(
        this.complianceFinding(
          organizationId,
          asset,
          filters,
          'out-of-range',
          'potential-non-compliance',
          'reports.findings.messages.out-of-range',
          `${outOfRangeCount} out of range`,
          { count: outOfRangeCount },
        ),
      );
    }

    if (incidentKey !== 'none') {
      findings.push(
        this.complianceFinding(
          organizationId,
          asset,
          filters,
          'open-incident',
          'potential-non-compliance',
          `reports.history.incidents.${incidentKey}`,
          asset.currentTemperature,
          {},
          incidentKey,
        ),
      );
    }

    if (asset.connectivity !== ConnectivityStatus.Online) {
      findings.push(
        this.complianceFinding(
          organizationId,
          asset,
          filters,
          'open-incident',
          asset.connectivity === ConnectivityStatus.Offline
            ? 'potential-non-compliance'
            : 'observation',
          'reports.findings.messages.connectivity',
          asset.connectivity,
          { status: asset.connectivity },
          `connectivity-${asset.connectivity}`,
        ),
      );
    }

    expiredDevices.forEach((iotDevice) => {
      findings.push(
        this.complianceFinding(
          organizationId,
          asset,
          filters,
          'expired-calibration',
          'observation',
          'reports.findings.messages.expired-calibration',
          iotDevice.uuid,
          {
            device: iotDevice.uuid,
            date: iotDevice.nextCalibrationDate,
          },
          iotDevice.uuid,
        ),
      );
    });

    return findings;
  }

  private complianceFinding(
    organizationId: number,
    asset: Asset,
    filters: ComplianceReportFilters,
    type: ComplianceFindingType,
    severity: ComplianceFindingSeverity,
    messageKey: string,
    evidence: string,
    messageParams: Record<string, string | number> = {},
    idSuffix = '',
  ): ComplianceFinding {
    const id = [organizationId, asset.id, filters.fromDate, filters.toDate, type, idSuffix]
      .filter((value) => value !== '')
      .join('-');
    const status = this.closedComplianceFindingIdsSignal().has(id)
      ? FindingStatus.Closed
      : FindingStatus.Open;

    return new ComplianceFinding(
      id,
      organizationId,
      asset.id,
      asset.name,
      this.assetLocationFor(asset),
      type,
      severity,
      status,
      filters.fromDate,
      filters.toDate,
      new Date().toISOString(),
      evidence,
      messageKey,
      messageParams,
    );
  }

  private buildDailyLogEntry(
    asset: Asset,
    readings: SensorReading[],
    iotDevices: IoTDevice[],
  ): DailyLogEntry {
    const assetDevices = iotDevices.filter((iotDevice) => iotDevice.assetId === asset.id);
    const assetReadings = readings
      .filter((reading) => reading.assetId === asset.id)
      .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    const temperatureReadings = assetReadings
      .map((reading) => reading.temperature)
      .filter((value): value is number => value !== null);
    const humidityReadings = assetReadings
      .map((reading) => reading.humidity)
      .filter((value): value is number => value !== null);
    const expectedReadings = this.expectedDailyReadingsFor(assetDevices, assetReadings.length);
    const missingReadings = Math.max(expectedReadings - assetReadings.length, 0);

    return {
      assetId: asset.id,
      assetName: asset.name,
      assetLocation: this.assetLocationFor(asset),
      totalReadings: assetReadings.length,
      expectedReadings,
      averageTemperature: this.average(temperatureReadings),
      averageHumidity: this.average(humidityReadings),
      outOfRangeCount: assetReadings.filter((reading) => reading.isOutOfRange).length,
      missingReadings,
      firstRecordedAt: assetReadings[0]?.recordedAt ?? null,
      lastRecordedAt: assetReadings[assetReadings.length - 1]?.recordedAt ?? null,
      status: this.entryStatus(assetReadings.length, missingReadings),
    };
  }

  private buildSanitaryComplianceRow(
    asset: Asset,
    readings: SensorReading[],
    iotDevices: IoTDevice[],
    settings: AssetSettings | undefined,
    daysCount: number,
  ): SanitaryComplianceRow {
    const assetDevices = iotDevices.filter((iotDevice) => iotDevice.assetId === asset.id);
    const assetReadings = readings.filter((reading) => reading.assetId === asset.id);
    const temperatureReadings = assetReadings
      .map((reading) => reading.temperature)
      .filter((value): value is number => value !== null);
    const humidityReadings = assetReadings
      .map((reading) => reading.humidity)
      .filter((value): value is number => value !== null);
    const expectedReadings = assetDevices.length
      ? this.expectedDailyReadingsFor(assetDevices, assetReadings.length) * daysCount
      : assetReadings.length;
    const outOfRangeCount = assetReadings.filter((reading) => reading.isOutOfRange).length;
    const validReadings = Math.max(assetReadings.length - outOfRangeCount, 0);
    const missingReadings = Math.max(expectedReadings - assetReadings.length, 0);
    const incidentCount = this.complianceIncidentCount(asset);
    const complianceDenominator = expectedReadings || assetReadings.length;
    const complianceRate = complianceDenominator
      ? Math.round((validReadings / complianceDenominator) * 100)
      : 0;

    return {
      assetId: asset.id,
      assetName: asset.name,
      assetLocation: this.assetLocationFor(asset),
      totalReadings: assetReadings.length,
      expectedReadings,
      validReadings,
      outOfRangeCount,
      missingReadings,
      incidentCount,
      averageTemperature: this.average(temperatureReadings),
      averageHumidity: this.average(humidityReadings),
      complianceRate,
      status: this.complianceStatus(
        assetReadings.length,
        expectedReadings,
        outOfRangeCount,
        missingReadings,
        incidentCount,
        settings,
      ),
    };
  }

  private buildMonthlyReportRow(asset: Asset, readings: SensorReading[]): MonthlyReportRow {
    const assetReadings = readings
      .filter((reading) => reading.assetId === asset.id)
      .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    const temperatureReadings = assetReadings
      .map((reading) => reading.temperature)
      .filter((value): value is number => value !== null);
    const humidityReadings = assetReadings
      .map((reading) => reading.humidity)
      .filter((value): value is number => value !== null);
    const outOfRangeCount = assetReadings.filter((reading) => reading.isOutOfRange).length;
    const validReadings = Math.max(assetReadings.length - outOfRangeCount, 0);
    const incidentCount = outOfRangeCount + this.complianceIncidentCount(asset);
    const complianceRate = assetReadings.length
      ? Math.round((validReadings / assetReadings.length) * 100)
      : 0;

    return {
      assetId: asset.id,
      assetName: asset.name,
      assetLocation: this.assetLocationFor(asset),
      totalReadings: assetReadings.length,
      validReadings,
      outOfRangeCount,
      incidentCount,
      averageTemperature: this.average(temperatureReadings),
      averageHumidity: this.average(humidityReadings),
      complianceRate,
      firstRecordedAt: assetReadings[0]?.recordedAt ?? null,
      lastRecordedAt: assetReadings[assetReadings.length - 1]?.recordedAt ?? null,
      status: this.monthlyStatus(assetReadings.length, incidentCount),
    };
  }

  private entryStatus(totalReadings: number, missingReadings: number): DailyLogStatus {
    if (!totalReadings) {
      return 'no-data';
    }

    return missingReadings > 0 ? 'incomplete' : 'complete';
  }

  private complianceStatus(
    totalReadings: number,
    expectedReadings: number,
    outOfRangeCount: number,
    missingReadings: number,
    incidentCount: number,
    settings: AssetSettings | undefined,
  ): SanitaryComplianceStatus {
    if (!settings || !totalReadings || !expectedReadings) {
      return 'insufficient';
    }

    return outOfRangeCount || missingReadings || incidentCount ? 'observation' : 'compliant';
  }

  private complianceIncidentCount(asset: Asset): number {
    const currentIncident = this.normalizeIncident(asset.lastIncident);
    const incidentCount = currentIncident === 'none' ? 0 : 1;
    const connectivityIncident = asset.connectivity === ConnectivityStatus.Online ? 0 : 1;

    return incidentCount + connectivityIncident;
  }

  private monthlyStatus(totalReadings: number, incidentCount: number): MonthlyReportStatus {
    if (!totalReadings) {
      return 'insufficient';
    }

    return incidentCount ? 'attention' : 'complete';
  }

  private severityWeight(severity: ComplianceFindingSeverity): number {
    if (severity === 'potential-non-compliance') {
      return 3;
    }

    return severity === 'observation' ? 2 : 1;
  }

  private expectedDailyReadingsFor(iotDevices: IoTDevice[], fallbackReadings: number): number {
    if (!iotDevices.length) {
      return fallbackReadings;
    }

    return iotDevices.reduce((total, iotDevice) => {
      return total + this.expectedReadingsForFrequency(iotDevice.readingFrequencySeconds);
    }, 0);
  }

  private expectedReadingsForFrequency(readingFrequencySeconds: number): number {
    const secondsPerDay = 86400;
    const safeFrequency = readingFrequencySeconds > 0 ? readingFrequencySeconds : 3600;

    return Math.ceil(secondsPerDay / safeFrequency);
  }

  private average(values: number[]): number | null {
    if (!values.length) {
      return null;
    }

    const total = values.reduce((sum, value) => sum + value, 0);
    return Number((total / values.length).toFixed(1));
  }

  private assetLocationFor(asset: Asset | null | undefined): string {
    return asset ? this.assetManagementStore.locationForAsset(asset) : 'N/A';
  }

  private historyReadingEvent(
    reading: SensorReading,
    assets: Asset[],
    settings: AssetSettings | undefined,
  ): OperationalHistoryEvent {
    const asset = this.assetForReading(reading, assets);

    return {
      id: reading.id,
      assetId: reading.assetId,
      assetName: asset?.name ?? `#${reading.assetId}`,
      assetLocation: this.assetLocationFor(asset),
      eventType: 'reading',
      severity: reading.isOutOfRange ? 'warning' : 'normal',
      icon: 'sensors',
      occurredAt: reading.recordedAt,
      value: this.readingValueLabel(reading),
      messageKey: reading.isOutOfRange
        ? 'reports.history.messages.reading-out-of-range'
        : 'reports.history.messages.reading-in-range',
      messageParams: {
        range: this.temperatureRangeLabel(settings),
      },
    };
  }

  private historyAlertEvent(
    reading: SensorReading,
    assets: Asset[],
    settings: AssetSettings | undefined,
  ): OperationalHistoryEvent {
    const asset = this.assetForReading(reading, assets);
    const severity = this.readingSeverity(reading, settings);

    return {
      id: 100000 + reading.id,
      assetId: reading.assetId,
      assetName: asset?.name ?? `#${reading.assetId}`,
      assetLocation: this.assetLocationFor(asset),
      eventType: 'alert',
      severity,
      icon: this.alertIcon(reading, settings),
      occurredAt: reading.recordedAt,
      value: this.readingValueLabel(reading),
      messageKey: this.alertMessageKey(reading, settings),
      messageParams: {
        range: this.temperatureRangeLabel(settings),
      },
    };
  }

  private historyIncidentEvents(
    asset: Asset,
    filters: OperationalHistoryFilters,
    readings: SensorReading[],
  ): OperationalHistoryEvent[] {
    const occurredAt = this.incidentOccurredAt(asset, filters, readings);

    if (!this.isInDateRange(occurredAt, filters.fromDate, filters.toDate)) {
      return [];
    }

    const incidents: OperationalHistoryEvent[] = [];
    const incidentKey = this.normalizeIncident(asset.lastIncident);

    if (incidentKey !== 'none') {
      incidents.push({
        id: 200000 + asset.id,
        assetId: asset.id,
        assetName: asset.name,
        assetLocation: this.assetLocationFor(asset),
        eventType: 'incident',
        severity: incidentKey === 'connection-lost' ? 'critical' : 'warning',
        icon: incidentKey === 'connection-lost' ? 'wifi_off' : 'report_problem',
        occurredAt,
        value: asset.currentTemperature,
        messageKey: `reports.history.incidents.${incidentKey}`,
        messageParams: {},
      });
    }

    if (asset.connectivity !== ConnectivityStatus.Online) {
      incidents.push({
        id: 300000 + asset.id,
        assetId: asset.id,
        assetName: asset.name,
        assetLocation: this.assetLocationFor(asset),
        eventType: 'incident',
        severity: asset.connectivity === ConnectivityStatus.Offline ? 'critical' : 'warning',
        icon: 'wifi_off',
        occurredAt,
        value: asset.connectivity,
        messageKey: 'reports.history.incidents.connectivity',
        messageParams: {
          status: asset.connectivity,
        },
      });
    }

    return incidents;
  }

  private assetForReading(reading: SensorReading, assets: Asset[]): Asset | undefined {
    return assets.find((asset) => asset.id === reading.assetId);
  }

  private readingSeverity(
    reading: SensorReading,
    settings: AssetSettings | undefined,
  ): OperationalHistorySeverity {
    if (
      settings &&
      reading.temperature !== null &&
      (reading.temperature > settings.maximumTemperature + 2 ||
        reading.temperature < settings.minimumTemperature - 2)
    ) {
      return 'critical';
    }

    if (
      (settings &&
        reading.humidity !== null &&
        this.isHumidityOutOfRange(reading.humidity, settings)) ||
      (reading.batteryLevel !== null && reading.batteryLevel < 15) ||
      (reading.signalStrength !== null && reading.signalStrength < 35)
    ) {
      return 'warning';
    }

    return reading.isOutOfRange ? 'warning' : 'normal';
  }

  private alertIcon(reading: SensorReading, settings: AssetSettings | undefined): string {
    if (
      settings &&
      reading.humidity !== null &&
      this.isHumidityOutOfRange(reading.humidity, settings)
    ) {
      return 'water_drop';
    }

    if (reading.batteryLevel !== null && reading.batteryLevel < 15) {
      return 'battery_alert';
    }

    if (reading.signalStrength !== null && reading.signalStrength < 35) {
      return 'signal_cellular_connected_no_internet_0_bar';
    }

    return reading.temperature !== null &&
      settings &&
      reading.temperature < settings.minimumTemperature
      ? 'ac_unit'
      : 'device_thermostat';
  }

  private alertMessageKey(reading: SensorReading, settings: AssetSettings | undefined): string {
    if (
      settings &&
      reading.humidity !== null &&
      this.isHumidityOutOfRange(reading.humidity, settings)
    ) {
      return reading.humidity > settings.maximumHumidity
        ? 'reports.history.messages.high-humidity'
        : 'reports.history.messages.low-humidity';
    }

    if (reading.batteryLevel !== null && reading.batteryLevel < 15) {
      return 'reports.history.messages.low-battery';
    }

    if (reading.signalStrength !== null && reading.signalStrength < 35) {
      return 'reports.history.messages.low-signal';
    }

    return settings &&
      reading.temperature !== null &&
      reading.temperature > settings.maximumTemperature
      ? 'reports.history.messages.high-temperature'
      : 'reports.history.messages.low-temperature';
  }

  private isHumidityOutOfRange(humidity: number, settings: AssetSettings): boolean {
    return humidity < settings.minimumHumidity || humidity > settings.maximumHumidity;
  }

  private readingValueLabel(reading: SensorReading): string {
    const values = [
      reading.temperature !== null ? `${reading.temperature.toFixed(1)} °C` : null,
      reading.humidity !== null ? `${reading.humidity}%` : null,
      reading.batteryLevel !== null ? `${reading.batteryLevel}% battery` : null,
      reading.signalStrength !== null ? `${reading.signalStrength}% signal` : null,
    ].filter((value): value is string => !!value);

    return values.join(' / ') || 'N/A';
  }

  private incidentOccurredAt(
    asset: Asset,
    filters: OperationalHistoryFilters,
    readings: SensorReading[],
  ): string {
    const latestReading = readings
      .filter((reading) => reading.assetId === asset.id)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0];

    return latestReading?.recordedAt ?? `${filters.toDate}T23:59:00`;
  }

  private normalizeIncident(lastIncident: string): string {
    const prefix = 'asset-management.incidents.';

    return lastIncident.startsWith(prefix)
      ? lastIncident.replace(prefix, '')
      : lastIncident || 'none';
  }

  private temperatureRangeLabel(settings: AssetSettings | undefined): string {
    if (!settings) {
      return 'N/A';
    }

    return `${settings.minimumTemperature} °C - ${settings.maximumTemperature} °C`;
  }

  private isInDateRange(value: string, fromDate: string, toDate: string): boolean {
    const dateKey = this.dateKeyFor(value);

    return dateKey >= fromDate && dateKey <= toDate;
  }

  private reportOverlapsPeriod(report: Report, filters: AuditEvidenceFilters): boolean {
    const periodDate = report.periodDate;

    if (periodDate.includes(' - ')) {
      const [fromDate, toDate] = periodDate.split(' - ');
      return fromDate <= filters.toDate && toDate >= filters.fromDate;
    }

    if (/^\d{4}-\d{2}$/.test(periodDate)) {
      const range = this.monthDateRange(periodDate);
      return range.fromDate <= filters.toDate && range.toDate >= filters.fromDate;
    }

    const dateKey = this.dateKeyFor(periodDate);
    return dateKey >= filters.fromDate && dateKey <= filters.toDate;
  }

  private reportFromDailyLog(organizationId: number, dailyLog: DailyLog): Report {
    return new Report(
      this.nextReportId(),
      organizationId,
      this.dailyLogUuid(organizationId, dailyLog.date),
      ReportType.DailyLog,
      'Daily thermal control log',
      dailyLog.date,
      new Date().toISOString(),
    );
  }

  private reportFromSanitaryCompliance(
    organizationId: number,
    complianceReport: SanitaryComplianceReport,
  ): Report {
    return new Report(
      this.nextReportId(),
      organizationId,
      this.sanitaryComplianceUuid(organizationId, complianceReport.filters),
      ReportType.Compliance,
      'Sanitary compliance report',
      `${complianceReport.filters.fromDate} - ${complianceReport.filters.toDate}`,
      new Date().toISOString(),
    );
  }

  private reportFromMonthlyReport(organizationId: number, monthlyReport: MonthlyReport): Report {
    return new Report(
      this.nextReportId(),
      organizationId,
      this.monthlyReportUuid(organizationId, monthlyReport.month),
      ReportType.MonthlySummary,
      'Monthly monitoring report',
      monthlyReport.month,
      new Date().toISOString(),
    );
  }

  private nextReportId(): number {
    return Math.max(...this.reports().map((report) => report.id), 0) + 1;
  }

  private dailyLogUuid(organizationId: number, date: string): string {
    return `RPT-DL-${date.replaceAll('-', '')}-${organizationId.toString().padStart(3, '0')}`;
  }

  private sanitaryComplianceUuid(
    organizationId: number,
    filters: SanitaryComplianceFilters,
  ): string {
    const assetKey = filters.assetId ? filters.assetId.toString().padStart(3, '0') : 'ALL';

    return `RPT-SC-${filters.fromDate.replaceAll('-', '')}-${filters.toDate.replaceAll('-', '')}-${assetKey}-${organizationId.toString().padStart(3, '0')}`;
  }

  private monthlyReportUuid(organizationId: number, month: string): string {
    return `RPT-MS-${month.replace('-', '')}-${organizationId.toString().padStart(3, '0')}`;
  }

  private today(): string {
    return this.formatDateKey(new Date());
  }

  private dateKeyFor(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value.slice(0, 10);
    }

    return this.formatDateKey(date);
  }

  private daysInRange(fromDate: string, toDate: string): number {
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T00:00:00`);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      return 1;
    }

    const millisecondsPerDay = 86400000;
    return Math.floor((to.getTime() - from.getTime()) / millisecondsPerDay) + 1;
  }

  private monthDateRange(month: string): { fromDate: string; toDate: string } {
    const currentDate = this.today();
    const currentMonth = currentDate.slice(0, 7);
    const safeMonth = month && month <= currentMonth ? month : currentMonth;
    const firstDay = `${safeMonth}-01`;

    if (safeMonth === currentMonth) {
      return { fromDate: firstDay, toDate: currentDate };
    }

    const [year, monthNumber] = safeMonth.split('-').map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate().toString().padStart(2, '0');

    return { fromDate: firstDay, toDate: `${safeMonth}-${lastDay}` };
  }

  private csvCell(value: string | number): string {
    const text = String(value).replaceAll('"', '""');

    return `"${text}"`;
  }

  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
