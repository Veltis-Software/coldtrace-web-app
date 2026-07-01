import { NgClass } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import {
  OperationalHistoryEvent,
  OperationalHistoryFilterType,
} from '../../../domain/model/operational-history.entity';
import { ReportsStore } from '../../../application/reports.store';

/**
 * @summary Presents the operational history user interface in the reports bounded context.
 */
@Component({
  selector: 'app-operational-history',
  imports: [
    FormsModule,
    MatIcon,
    MatProgressSpinner,
    NgClass,
    TranslatePipe,
    ListPagination,
  ],
  templateUrl: './operational-history.html',
  styleUrl: './operational-history.css',
})
export class OperationalHistory implements OnInit {
  protected readonly reportsStore = inject(ReportsStore);
  protected readonly assetManagementStore = inject(AssetManagementStore);
  protected readonly monitoringStore = inject(MonitoringStore);
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly router = inject(Router);

  protected readonly identityLoading = signal(false);
  protected readonly selectedAssetId = signal(0);
  protected readonly selectedEventType = signal<OperationalHistoryFilterType>('all');
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
  protected readonly effectiveFromDate = computed(() => this.fromDate() || this.maxDate());
  protected readonly effectiveToDate = computed(() => this.toDate() || this.maxDate());
  protected readonly organizationAssets = computed(() => {
    return this.assetManagementStore.assetsForOrganization(this.activeOrganizationId());
  });
  protected readonly currentRole = computed(() => {
    return this.identityAccessStore.currentRoleFrom(this.users(), this.roles());
  });
  protected readonly canViewHistory = computed(() => {
    return this.identityAccessStore
      .permissionKeysForRole(this.currentRole())
      .includes('roles-permissions.permissions.view-reports');
  });
  protected readonly history = computed(() => {
    return this.reportsStore.buildOperationalHistory(this.activeOrganizationId(), {
      assetId: this.selectedAssetId(),
      fromDate: this.effectiveFromDate(),
      toDate: this.effectiveToDate(),
      eventType: this.selectedEventType(),
    });
  });
  protected readonly hasEvents = computed(() => this.history().totalEvents > 0);
  protected readonly paginatedEvents = computed(() =>
    this.paginate(this.history().events, this.currentPage()),
  );

  /**
   * @summary Initializes the operational history view state.
   */
  ngOnInit(): void {
    this.loadPageData();
  }

  protected loadPageData(): void {
    this.identityLoading.set(true);
    this.assetManagementStore.loadAssets();
    this.assetManagementStore.loadIoTDevices();
    this.assetManagementStore.loadGateways();
    this.assetManagementStore.loadAssetSettings();
    this.monitoringStore.loadReadings();

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
        error: () => this.identityLoading.set(false),
      });
  }

  protected selectAsset(value: string): void {
    this.selectedAssetId.set(Number(value));
    this.currentPage.set(1);
  }

  protected selectEventType(value: string): void {
    this.selectedEventType.set(value as OperationalHistoryFilterType);
    this.currentPage.set(1);
  }

  protected updateFromDate(value: string): void {
    const maxDate = this.maxDate();
    const nextDate = value > maxDate ? maxDate : value;
    this.fromDate.set(nextDate);

    if (this.effectiveToDate() < nextDate) {
      this.toDate.set(nextDate);
    }
    this.currentPage.set(1);
  }

  protected updateToDate(value: string): void {
    const maxDate = this.maxDate();
    const nextDate = value > maxDate ? maxDate : value;
    this.toDate.set(nextDate < this.effectiveFromDate() ? this.effectiveFromDate() : nextDate);
    this.currentPage.set(1);
  }

  protected logout(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  protected eventTypeLabelKey(type: OperationalHistoryFilterType): string {
    return `reports.history.types.${type}`;
  }

  protected severityLabelKey(severity: string): string {
    return `reports.history.severity.${severity}`;
  }

  protected severityClass(severity: string): string {
    return `severity-${severity}`;
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('en', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(value));
  }

  protected trackEvent(_: number, event: OperationalHistoryEvent): number {
    return event.id;
  }

  protected updatePage(page: number): void {
    this.currentPage.set(page);
  }

  private paginate<T>(items: T[], page: number): T[] {
    const pageCount = Math.max(Math.ceil(items.length / this.pageSize), 1);
    const currentPage = Math.min(Math.max(page, 1), pageCount);
    const startIndex = (currentPage - 1) * this.pageSize;

    return items.slice(startIndex, startIndex + this.pageSize);
  }
}
