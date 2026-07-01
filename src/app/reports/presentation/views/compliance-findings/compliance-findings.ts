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
import {
  ComplianceFinding,
  ComplianceFindingSeverity,
  ComplianceFindingType,
} from '../../../domain/model/compliance-finding.entity';
import { ComplianceFindingStatusFilter } from '../../../domain/model/compliance-report.entity';
import { FindingStatus } from '../../../domain/model/finding-status.enum';

type ComplianceFindingsFeedback = 'idle' | 'closed' | 'access-denied' | 'server-error';

/**
 * @summary Presents the compliance findings user interface in the reports bounded context.
 */
@Component({
  selector: 'app-compliance-findings',
  imports: [
    FormsModule,
    MatButton,
    MatIcon,
    MatProgressSpinner,
    NgClass,
    TranslatePipe,
    ListPagination,
  ],
  templateUrl: './compliance-findings.html',
  styleUrl: './compliance-findings.css',
})
export class ComplianceFindings implements OnInit {
  protected readonly reportsStore = inject(ReportsStore);
  protected readonly assetManagementStore = inject(AssetManagementStore);
  protected readonly monitoringStore = inject(MonitoringStore);
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly router = inject(Router);

  protected readonly findingStatus = FindingStatus;
  protected readonly identityLoading = signal(false);
  protected readonly feedback = signal<ComplianceFindingsFeedback>('idle');
  protected readonly selectedAssetId = signal(0);
  protected readonly selectedStatus = signal<ComplianceFindingStatusFilter>('all');
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');
  protected readonly pageSize = 10;
  protected readonly currentPage = signal(1);
  protected readonly users = signal<User[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly organizations = signal<Organization[]>([]);
  protected readonly maxDate = computed(() => this.reportsStore.currentDate());

  protected readonly statusOptions: { value: ComplianceFindingStatusFilter; labelKey: string }[] = [
    { value: 'all', labelKey: 'reports.findings.status-filter.all' },
    { value: FindingStatus.Open, labelKey: 'reports.findings.status.open' },
    { value: FindingStatus.Closed, labelKey: 'reports.findings.status.closed' },
  ];

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
  protected readonly currentRole = computed(() => {
    return this.identityAccessStore.currentRoleFrom(this.users(), this.roles());
  });
  protected readonly currentPermissionKeys = computed(() => {
    return this.identityAccessStore.permissionKeysForRole(this.currentRole());
  });
  protected readonly canViewFindings = computed(() => {
    return this.currentPermissionKeys().includes('roles-permissions.permissions.view-reports');
  });
  protected readonly canCloseFindings = computed(() => {
    return (
      this.currentPermissionKeys().includes('roles-permissions.permissions.resolve-alerts') ||
      this.currentPermissionKeys().includes('roles-permissions.permissions.manage-assets')
    );
  });
  protected readonly effectiveFromDate = computed(() => this.fromDate() || this.defaultFromDate());
  protected readonly effectiveToDate = computed(() => this.toDate() || this.maxDate());
  protected readonly organizationAssets = computed(() => {
    return this.assetManagementStore.assetsForOrganization(this.activeOrganizationId());
  });
  protected readonly complianceReport = computed(() => {
    return this.reportsStore.buildComplianceReport(this.activeOrganizationId(), {
      assetId: this.selectedAssetId(),
      fromDate: this.effectiveFromDate(),
      toDate: this.effectiveToDate(),
      status: this.selectedStatus(),
    });
  });
  protected readonly hasFindings = computed(() => this.complianceReport().hasFindings);
  protected readonly paginatedFindings = computed(() =>
    this.paginate(this.complianceReport().findings, this.currentPage()),
  );

  /**
   * @summary Initializes the compliance findings view state.
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

  protected selectStatus(value: string): void {
    const status = Object.values(FindingStatus).includes(value as FindingStatus)
      ? (value as FindingStatus)
      : 'all';

    this.selectedStatus.set(status);
    this.feedback.set('idle');
    this.currentPage.set(1);
  }

  protected closeFinding(finding: ComplianceFinding): void {
    if (finding.status === FindingStatus.Closed) {
      return;
    }

    if (!this.canCloseFindings()) {
      this.feedback.set('access-denied');
      return;
    }

    this.reportsStore.closeComplianceFinding(finding.id);
    this.feedback.set('closed');
  }

  protected logout(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  protected typeLabelKey(type: ComplianceFindingType): string {
    return `reports.findings.types.${type}`;
  }

  protected severityLabelKey(severity: ComplianceFindingSeverity): string {
    return `reports.findings.severity.${severity}`;
  }

  protected statusLabelKey(status: FindingStatus): string {
    return `reports.findings.status.${status}`;
  }

  protected severityClass(severity: ComplianceFindingSeverity): string {
    return `severity-${severity}`;
  }

  protected statusClass(status: FindingStatus): string {
    return `status-${status}`;
  }

  protected trackFinding(_: number, finding: ComplianceFinding): string {
    return finding.id;
  }

  protected updatePage(page: number): void {
    this.currentPage.set(page);
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

  private paginate<T>(items: T[], page: number): T[] {
    const pageCount = Math.max(Math.ceil(items.length / this.pageSize), 1);
    const currentPage = Math.min(Math.max(page, 1), pageCount);
    const startIndex = (currentPage - 1) * this.pageSize;

    return items.slice(startIndex, startIndex + this.pageSize);
  }
}
