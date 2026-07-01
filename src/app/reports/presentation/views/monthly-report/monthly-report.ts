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
import { MonthlyReportRow, MonthlyReportStatus } from '../../../domain/model/monthly-report.entity';
import { ReportType } from '../../../domain/model/report-type.enum';

type MonthlyReportFeedback = 'idle' | 'downloaded' | 'insufficient' | 'server-error';

/**
 * @summary Presents the monthly report user interface in the reports bounded context.
 */
@Component({
  selector: 'app-monthly-report',
  imports: [
    FormsModule,
    MatButton,
    MatIcon,
    MatProgressSpinner,
    NgClass,
    TranslatePipe,
    ListPagination,
  ],
  templateUrl: './monthly-report.html',
  styleUrl: './monthly-report.css',
})
export class MonthlyReport implements OnInit {
  protected readonly reportsStore = inject(ReportsStore);
  protected readonly assetManagementStore = inject(AssetManagementStore);
  protected readonly monitoringStore = inject(MonitoringStore);
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly router = inject(Router);

  protected readonly identityLoading = signal(false);
  protected readonly feedback = signal<MonthlyReportFeedback>('idle');
  protected readonly selectedMonth = signal('');
  protected readonly pageSize = 10;
  protected readonly currentPage = signal(1);
  protected readonly users = signal<User[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly organizations = signal<Organization[]>([]);
  protected readonly maxMonth = computed(() => this.reportsStore.currentDate().slice(0, 7));

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
  protected readonly canDownloadReports = computed(() => {
    return this.identityAccessStore
      .permissionKeysForRole(this.currentRole())
      .includes('roles-permissions.permissions.view-reports');
  });
  protected readonly effectiveMonth = computed(() => this.selectedMonth() || this.maxMonth());
  protected readonly monthlyReport = computed(() => {
    return this.reportsStore.buildMonthlyReport(this.activeOrganizationId(), this.effectiveMonth());
  });
  protected readonly generatedReportsCount = computed(() => {
    return this.reportsStore
      .reportsForOrganization(this.activeOrganizationId())
      .filter((report) => report.type === ReportType.MonthlySummary).length;
  });
  protected readonly hasRows = computed(() => this.monthlyReport().rows.length > 0);
  protected readonly canDownloadReport = computed(() => this.monthlyReport().canDownload);
  protected readonly paginatedRows = computed(() =>
    this.paginate(this.monthlyReport().rows, this.currentPage()),
  );

  /**
   * @summary Initializes the monthly report view state.
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

  protected updateMonth(value: string): void {
    const maxMonth = this.maxMonth();
    this.selectedMonth.set(value > maxMonth ? maxMonth : value);
    this.feedback.set('idle');
    this.currentPage.set(1);
  }

  protected downloadMonthlyReport(): void {
    if (!this.canDownloadReports()) {
      return;
    }

    if (!this.canDownloadReport()) {
      this.feedback.set('insufficient');
      return;
    }

    this.reportsStore
      .createMonthlySummaryReport(this.activeOrganizationId(), this.monthlyReport())
      .subscribe({
        next: () => {
          this.downloadMonthlyCsv();
          this.feedback.set('downloaded');
        },
        error: () => this.feedback.set('server-error'),
      });
  }

  protected logout(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  protected statusLabelKey(status: MonthlyReportStatus): string {
    return `reports.monthly.status.${status}`;
  }

  protected statusClass(status: MonthlyReportStatus): string {
    return `status-${status}`;
  }

  protected formatTemperature(value: number | null): string {
    return value === null ? 'N/A' : `${value.toFixed(1)} °C`;
  }

  protected formatHumidity(value: number | null): string {
    return value === null ? 'N/A' : `${value.toFixed(0)}%`;
  }

  protected formatTimeRange(row: MonthlyReportRow): string {
    if (!row.firstRecordedAt || !row.lastRecordedAt) {
      return 'N/A';
    }

    return `${this.formatDate(row.firstRecordedAt)} - ${this.formatDate(row.lastRecordedAt)}`;
  }

  protected trackRow(_: number, row: MonthlyReportRow): number {
    return row.assetId;
  }

  protected updatePage(page: number): void {
    this.currentPage.set(page);
  }

  private downloadMonthlyCsv(): void {
    const csv = this.reportsStore.monthlyReportCsv(this.monthlyReport());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const month = this.monthlyReport().month;
    const organizationSlug = this.fileNamePart(this.activeOrganizationName());

    link.href = url;
    link.download = `${organizationSlug}-monthly-report-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('en', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(value));
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
