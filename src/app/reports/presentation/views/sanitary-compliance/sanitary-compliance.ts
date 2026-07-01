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
import { ReportType } from '../../../domain/model/report-type.enum';
import {
  SanitaryComplianceRow,
  SanitaryComplianceStatus,
} from '../../../domain/model/sanitary-compliance-report.entity';

type ComplianceFeedback = 'idle' | 'exported' | 'insufficient' | 'server-error';

/**
 * @summary Presents the sanitary compliance user interface in the reports bounded context.
 */
@Component({
  selector: 'app-sanitary-compliance',
  imports: [
    FormsModule,
    MatButton,
    MatIcon,
    MatProgressSpinner,
    NgClass,
    TranslatePipe,
    ListPagination,
  ],
  templateUrl: './sanitary-compliance.html',
  styleUrl: './sanitary-compliance.css',
})
export class SanitaryCompliance implements OnInit {
  protected readonly reportsStore = inject(ReportsStore);
  protected readonly assetManagementStore = inject(AssetManagementStore);
  protected readonly monitoringStore = inject(MonitoringStore);
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly router = inject(Router);

  protected readonly identityLoading = signal(false);
  protected readonly feedback = signal<ComplianceFeedback>('idle');
  protected readonly selectedAssetId = signal(0);
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');
  protected readonly pageSize = 10;
  protected readonly currentPage = signal(1);
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
  protected readonly canExportReports = computed(() => {
    return this.identityAccessStore
      .permissionKeysForRole(this.currentRole())
      .includes('roles-permissions.permissions.view-reports');
  });
  protected readonly effectiveFromDate = computed(() => this.fromDate() || this.defaultFromDate());
  protected readonly effectiveToDate = computed(() => this.toDate() || this.maxDate());
  protected readonly organizationAssets = computed(() => {
    return this.assetManagementStore.assetsForOrganization(this.activeOrganizationId());
  });
  protected readonly complianceReport = computed(() => {
    return this.reportsStore.buildSanitaryComplianceReport(this.activeOrganizationId(), {
      assetId: this.selectedAssetId(),
      fromDate: this.effectiveFromDate(),
      toDate: this.effectiveToDate(),
    });
  });
  protected readonly generatedReportsCount = computed(() => {
    return this.reportsStore
      .reportsForOrganization(this.activeOrganizationId())
      .filter((report) => report.type === ReportType.Compliance).length;
  });
  protected readonly hasRows = computed(() => this.complianceReport().rows.length > 0);
  protected readonly canExportReport = computed(() => this.complianceReport().canExport);
  protected readonly paginatedRows = computed(() =>
    this.paginate(this.complianceReport().rows, this.currentPage()),
  );

  /**
   * @summary Initializes the sanitary compliance view state.
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
    this.currentPage.set(1);
  }

  protected updateToDate(value: string): void {
    const maxDate = this.maxDate();
    const nextDate = value > maxDate ? maxDate : value;
    this.toDate.set(nextDate < this.effectiveFromDate() ? this.effectiveFromDate() : nextDate);
    this.feedback.set('idle');
    this.currentPage.set(1);
  }

  protected selectAsset(value: string): void {
    this.selectedAssetId.set(Number(value));
    this.feedback.set('idle');
    this.currentPage.set(1);
  }

  protected exportComplianceReport(): void {
    if (!this.canExportReports()) {
      return;
    }

    if (!this.canExportReport()) {
      this.feedback.set('insufficient');
      return;
    }

    this.reportsStore
      .createSanitaryComplianceReport(this.activeOrganizationId(), this.complianceReport())
      .subscribe({
        next: () => {
          this.downloadComplianceCsv();
          this.feedback.set('exported');
        },
        error: () => this.feedback.set('server-error'),
      });
  }

  protected logout(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  protected statusLabelKey(status: SanitaryComplianceStatus): string {
    return `reports.compliance.status.${status}`;
  }

  protected statusClass(status: SanitaryComplianceStatus): string {
    return `status-${status}`;
  }

  protected formatTemperature(value: number | null): string {
    return value === null ? 'N/A' : `${value.toFixed(1)} °C`;
  }

  protected formatHumidity(value: number | null): string {
    return value === null ? 'N/A' : `${value.toFixed(0)}%`;
  }

  protected trackRow(_: number, row: SanitaryComplianceRow): number {
    return row.assetId;
  }

  protected updatePage(page: number): void {
    this.currentPage.set(page);
  }

  private downloadComplianceCsv(): void {
    const csv = this.reportsStore.sanitaryComplianceCsv(this.complianceReport());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filters = this.complianceReport().filters;
    const assetSuffix = filters.assetId ? `-asset-${filters.assetId}` : '';
    const organizationSlug = this.fileNamePart(this.activeOrganizationName());

    link.href = url;
    link.download = `${organizationSlug}-compliance-${filters.fromDate}-${filters.toDate}${assetSuffix}.csv`;
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

  private paginate<T>(items: T[], page: number): T[] {
    const pageCount = Math.max(Math.ceil(items.length / this.pageSize), 1);
    const currentPage = Math.min(Math.max(page, 1), pageCount);
    const startIndex = (currentPage - 1) * this.pageSize;

    return items.slice(startIndex, startIndex + this.pageSize);
  }
}
