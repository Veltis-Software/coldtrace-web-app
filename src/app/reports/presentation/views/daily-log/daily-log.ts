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
import { DailyLogEntry, DailyLogStatus } from '../../../domain/model/daily-log.entity';
import { ReportsStore } from '../../../application/reports.store';

type DailyLogFeedback = 'idle' | 'generated' | 'server-error';

/**
 * @summary Presents the daily log user interface in the reports bounded context.
 */
@Component({
  selector: 'app-daily-log',
  imports: [
    FormsModule,
    MatButton,
    MatIcon,
    MatProgressSpinner,
    NgClass,
    TranslatePipe,
    ListPagination,
  ],
  templateUrl: './daily-log.html',
  styleUrl: './daily-log.css',
})
export class DailyLog implements OnInit {
  protected readonly reportsStore = inject(ReportsStore);
  protected readonly assetManagementStore = inject(AssetManagementStore);
  protected readonly monitoringStore = inject(MonitoringStore);
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly router = inject(Router);

  protected readonly identityLoading = signal(false);
  protected readonly feedback = signal<DailyLogFeedback>('idle');
  protected readonly selectedDate = signal('');
  protected readonly selectedAssetId = signal(0);
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
  protected readonly effectiveDate = computed(() => {
    return this.selectedDate() || this.reportsStore.currentDate();
  });
  protected readonly organizationAssets = computed(() => {
    return this.assetManagementStore.assetsForOrganization(this.activeOrganizationId());
  });
  protected readonly dailyLog = computed(() => {
    return this.reportsStore.buildDailyLog(this.activeOrganizationId(), this.effectiveDate());
  });
  protected readonly filteredEntries = computed(() => {
    const selectedAssetId = this.selectedAssetId();

    if (!selectedAssetId) {
      return this.dailyLog().entries;
    }

    return this.dailyLog().entries.filter((entry) => entry.assetId === selectedAssetId);
  });
  protected readonly paginatedEntries = computed(() =>
    this.paginate(this.filteredEntries(), this.currentPage()),
  );
  protected readonly generatedReportsCount = computed(() => {
    return this.reportsStore.reportsForOrganization(this.activeOrganizationId()).length;
  });
  protected readonly hasEntries = computed(() => this.filteredEntries().length > 0);
  protected readonly hasReadings = computed(() => this.dailyLog().totalReadings > 0);

  /**
   * @summary Initializes the daily log view state.
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

  protected updateDate(value: string): void {
    const maxDate = this.maxDate();
    this.selectedDate.set(value > maxDate ? maxDate : value);
    this.feedback.set('idle');
    this.currentPage.set(1);
  }

  protected selectAsset(value: string): void {
    this.selectedAssetId.set(Number(value));
    this.currentPage.set(1);
  }

  protected generateDailyLog(): void {
    if (!this.hasReadings()) {
      this.feedback.set('server-error');
      return;
    }

    this.reportsStore.createDailyLogReport(this.activeOrganizationId(), this.dailyLog()).subscribe({
      next: () => this.feedback.set('generated'),
      error: () => this.feedback.set('server-error'),
    });
  }

  protected logout(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  protected statusLabelKey(status: DailyLogStatus): string {
    return `reports.daily-log.status.${status}`;
  }

  protected statusClass(status: DailyLogStatus): string {
    return `status-${status}`;
  }

  protected formatTemperature(value: number | null): string {
    return value === null ? 'N/A' : `${value.toFixed(1)} °C`;
  }

  protected formatHumidity(value: number | null): string {
    return value === null ? 'N/A' : `${value.toFixed(0)}%`;
  }

  protected formatTimeRange(entry: DailyLogEntry): string {
    if (!entry.firstRecordedAt || !entry.lastRecordedAt) {
      return 'N/A';
    }

    return `${this.formatTime(entry.firstRecordedAt)} - ${this.formatTime(entry.lastRecordedAt)}`;
  }

  protected trackEntry(_: number, entry: DailyLogEntry): number {
    return entry.assetId;
  }

  protected updatePage(page: number): void {
    this.currentPage.set(page);
  }

  private formatTime(value: string): string {
    return new Intl.DateTimeFormat('en', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private paginate<T>(items: T[], page: number): T[] {
    const pageCount = Math.max(Math.ceil(items.length / this.pageSize), 1);
    const currentPage = Math.min(Math.max(page, 1), pageCount);
    const startIndex = (currentPage - 1) * this.pageSize;

    return items.slice(startIndex, startIndex + this.pageSize);
  }
}
