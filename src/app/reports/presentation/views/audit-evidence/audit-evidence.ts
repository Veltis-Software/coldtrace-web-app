import { NgClass } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize, forkJoin } from 'rxjs';
import { AssetManagementStore } from '../../../../asset-management/application/asset-management.store';
import { IdentityAccessStore } from '../../../../identity-access/application/identity-access.store';
import { Organization } from '../../../../identity-access/domain/model/organization.entity';
import { Role } from '../../../../identity-access/domain/model/role.entity';
import { User } from '../../../../identity-access/domain/model/user.entity';
import { IdentityAccessApi } from '../../../../identity-access/infrastructure/identity-access-api';
import { MonitoringStore } from '../../../../monitoring/application/monitoring.store';
import { ListPagination } from '../../../../shared/presentation/components/list-pagination/list-pagination';
import { ReportsStore } from '../../../application/reports.store';
import { ComplianceFinding } from '../../../domain/model/compliance-finding.entity';
import { EvidenceItem } from '../../../domain/model/evidence-item.entity';
import { Report } from '../../../domain/model/report.entity';

type AuditEvidenceFeedback = 'idle' | 'exported' | 'insufficient' | 'server-error';

/**
 * @summary Presents the audit evidence user interface in the reports bounded context.
 */
@Component({
  selector: 'app-audit-evidence',
  imports: [
    FormsModule,
    MatButton,
    MatIcon,
    MatProgressSpinner,
    NgClass,
    TranslatePipe,
    ListPagination,
  ],
  templateUrl: './audit-evidence.html',
  styleUrl: './audit-evidence.css',
})
export class AuditEvidence implements OnInit {
  protected readonly reportsStore = inject(ReportsStore);
  protected readonly assetManagementStore = inject(AssetManagementStore);
  protected readonly monitoringStore = inject(MonitoringStore);
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly router = inject(Router);

  protected readonly identityLoading = signal(false);
  protected readonly feedback = signal<AuditEvidenceFeedback>('idle');
  protected readonly selectedAssetId = signal(0);
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');
  protected readonly reportsPage = signal(1);
  protected readonly findingsPage = signal(1);
  protected readonly pageSize = 10;
  protected readonly users = signal<User[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly organizations = signal<Organization[]>([]);
  protected readonly maxDate = computed(() => this.reportsStore.currentDate());

  protected readonly loading = computed(() => {
    return (
      this.identityLoading() ||
      this.reportsStore.loading() ||
      this.assetManagementStore.loading() ||
      this.monitoringStore.loading()
    );
  });
  protected readonly activeOrganizationId = computed(() => {
    return this.identityAccessStore.currentOrganizationIdFrom(this.users());
  });
  protected readonly activeOrganizationName = computed(() => {
    return this.identityAccessStore.currentOrganizationNameFrom(this.users(), this.organizations());
  });
  protected readonly currentRole = computed(() => {
    return this.identityAccessStore.currentRoleFrom(this.users(), this.roles());
  });
  protected readonly canPrepareEvidence = computed(() => {
    return this.identityAccessStore
      .permissionKeysForRole(this.currentRole())
      .includes('roles-permissions.permissions.view-reports');
  });
  protected readonly effectiveFromDate = computed(() => this.fromDate() || this.defaultFromDate());
  protected readonly effectiveToDate = computed(() => this.toDate() || this.maxDate());
  protected readonly organizationAssets = computed(() => {
    return this.assetManagementStore.assetsForOrganization(this.activeOrganizationId());
  });
  protected readonly auditEvidence = computed(() => {
    return this.reportsStore.buildAuditEvidence(this.activeOrganizationId(), {
      assetId: this.selectedAssetId(),
      fromDate: this.effectiveFromDate(),
      toDate: this.effectiveToDate(),
    });
  });
  protected readonly canExportEvidence = computed(() => {
    return this.canPrepareEvidence() && this.auditEvidence().hasEvidence;
  });
  protected readonly paginatedReports = computed(() =>
    this.paginate(this.auditEvidence().reports, this.reportsPage()),
  );
  protected readonly paginatedFindings = computed(() =>
    this.paginate(this.auditEvidence().findings, this.findingsPage()),
  );

  /**
   * @summary Initializes the audit evidence view state.
   */
  ngOnInit(): void {
    this.loadPageData();
  }

  protected loadPageData(): void {
    this.identityLoading.set(true);
    this.feedback.set('idle');
    this.assetManagementStore.loadAssets();
    this.assetManagementStore.loadIoTDevices();
    this.assetManagementStore.loadGateways();
    this.assetManagementStore.loadAssetSettings();
    this.monitoringStore.loadReadings();
    this.reportsStore.loadReports();

    forkJoin({
      users: this.identityAccessApi.getUsers(),
      roles: this.identityAccessApi.getRoles(),
      organizations: this.identityAccessApi.getOrganizations(),
    })
      .pipe(finalize(() => this.identityLoading.set(false)))
      .subscribe({
        next: ({ users, roles, organizations }) => {
          this.users.set(users);
          this.roles.set(roles);
          this.organizations.set(organizations);
          this.identityAccessStore.setCurrentContextFrom(users, roles, organizations);
        },
        error: () => this.feedback.set('server-error'),
      });
  }

  protected updateFromDate(value: string): void {
    const maxDate = this.maxDate();
    const nextDate = value > maxDate ? maxDate : value;
    this.fromDate.set(nextDate);

    if (this.effectiveToDate() < nextDate) {
      this.toDate.set(nextDate);
    }

    this.feedback.set('idle');
    this.resetPagination();
  }

  protected updateToDate(value: string): void {
    const maxDate = this.maxDate();
    const nextDate = value > maxDate ? maxDate : value;
    this.toDate.set(nextDate < this.effectiveFromDate() ? this.effectiveFromDate() : nextDate);
    this.feedback.set('idle');
    this.resetPagination();
  }

  protected selectAsset(value: string): void {
    this.selectedAssetId.set(Number(value));
    this.feedback.set('idle');
    this.resetPagination();
  }

  protected exportEvidence(): void {
    if (!this.canPrepareEvidence()) {
      return;
    }

    if (!this.canExportEvidence()) {
      this.feedback.set('insufficient');
      return;
    }

    this.downloadEvidenceCsv();
    this.feedback.set('exported');
  }

  protected logout(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  protected itemLabelKey(item: EvidenceItem): string {
    return `reports.audit.checklist.${item.id}`;
  }

  protected itemStatusLabelKey(item: EvidenceItem): string {
    return `reports.audit.status.${item.status}`;
  }

  protected itemStatusClass(item: EvidenceItem): string {
    return `status-${item.status}`;
  }

  protected findingTypeLabelKey(finding: ComplianceFinding): string {
    return `reports.findings.types.${finding.type}`;
  }

  protected findingStatusClass(finding: ComplianceFinding): string {
    return `status-${finding.status}`;
  }

  protected reportTypeLabelKey(report: Report): string {
    return `reports.audit.report-type.${report.type}`;
  }

  protected trackItem(_: number, item: EvidenceItem): string {
    return item.id;
  }

  protected trackReport(_: number, report: Report): string {
    return report.uuid;
  }

  protected trackFinding(_: number, finding: ComplianceFinding): string {
    return finding.id;
  }

  protected updateReportsPage(page: number): void {
    this.reportsPage.set(page);
  }

  protected updateFindingsPage(page: number): void {
    this.findingsPage.set(page);
  }

  private downloadEvidenceCsv(): void {
    const csv = this.reportsStore.auditEvidenceCsv(this.auditEvidence());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filters = this.auditEvidence().filters;
    const assetSuffix = filters.assetId ? `-asset-${filters.assetId}` : '';
    const organizationSlug = this.fileNamePart(this.activeOrganizationName());

    link.href = url;
    link.download = `${organizationSlug}-audit-evidence-${filters.fromDate}-${filters.toDate}${assetSuffix}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private defaultFromDate(): string {
    const date = new Date(`${this.maxDate()}T00:00:00`);
    date.setDate(date.getDate() - 6);

    return this.formatDateInput(date);
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private fileNamePart(value: string): string {
    return (
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'organization'
    );
  }

  private resetPagination(): void {
    this.reportsPage.set(1);
    this.findingsPage.set(1);
  }

  private paginate<T>(items: T[], page: number): T[] {
    const pageCount = Math.max(Math.ceil(items.length / this.pageSize), 1);
    const currentPage = Math.min(Math.max(page, 1), pageCount);
    const startIndex = (currentPage - 1) * this.pageSize;

    return items.slice(startIndex, startIndex + this.pageSize);
  }
}
