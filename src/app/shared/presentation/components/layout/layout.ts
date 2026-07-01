import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter } from 'rxjs';
import { AlertsStore } from '../../../../alerts/application/alerts.store';
import { AssetManagementStore } from '../../../../asset-management/application/asset-management.store';
import { IdentityAccessStore } from '../../../../identity-access/application/identity-access.store';
import { ReportsStore } from '../../../../reports/application/reports.store';
import { MonthlyReport } from '../../../../reports/domain/model/monthly-report.entity';
import {
  DashboardShell,
  OrganizationMemberSummary,
} from '../dashboard-shell/dashboard-shell';
import { LanguageSwitcher } from '../language-switcher/language-switcher';

/**
 * @summary Presents the layout user interface in the shared bounded context.
 */
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, LanguageSwitcher, DashboardShell, TranslateModule],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout implements OnInit {
  private readonly router = inject(Router);
  private readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly assetManagementStore = inject(AssetManagementStore);
  private readonly alertsStore = inject(AlertsStore);
  private readonly reportsStore = inject(ReportsStore);

  protected readonly currentUrl = signal(this.router.url);
  private readonly dashboardRoutePaths = [
    '/identity-access/dashboard',
    '/asset-management/assets',
    '/asset-management/safety-ranges',
    '/asset-management/operational-parameters',
    '/maintenance',
    '/identity-access/alerts',
    '/identity-access/monitoring',
    '/identity-access/reports',
    '/identity-access/users',
    '/identity-access/roles-permissions',
    '/settings',
    '/alerts',
    '/monitoring',
    '/reports',
  ];

  protected readonly showDashboardShell = computed(() => {
    return this.dashboardRoutePaths.some((path) => this.currentUrl().includes(path));
  });

  protected readonly showLanguageSwitcher = computed(() => {
    return !this.showDashboardShell();
  });
  protected readonly dashboardContentReady = computed(() => {
    return !this.showDashboardShell() || !!this.identityAccessStore.currentUserId();
  });

  protected readonly pageTitleKey = computed(() => {
    const currentUrl = this.currentUrl();

    if (currentUrl.includes('/asset-management/assets')) {
      return 'asset-management.title';
    }

    if (currentUrl.includes('/asset-management/safety-ranges')) {
      return 'asset-management.safety-ranges.page-title';
    }

    if (currentUrl.includes('/asset-management/operational-parameters')) {
      return 'asset-management.operational-parameters.page-title';
    }

    if (currentUrl.includes('/maintenance/preventive')) {
      return 'maintenance.preventive.page-title';
    }

    if (currentUrl.includes('/maintenance/technical-service')) {
      return 'maintenance.technical-service.page-title';
    }

    if (currentUrl.includes('/settings/billing')) {
      return 'dashboard-shell.nav-billing';
    }

    if (currentUrl.includes('/monitoring/assets')) {
      return 'monitoring.asset-monitoring.page-title';
    }

    if (currentUrl.includes('/monitoring')) {
      return 'monitoring.operational.title';
    }

    if (currentUrl.includes('/alerts/ai-guidance')) {
      return 'dashboard-shell.nav-ai-guidance';
    }

    if (currentUrl.includes('/alerts/notifications')) {
      return 'alerts.notification-list.page-title';
    }

    if (currentUrl.includes('/alerts')) {
      return 'alerts.incident-list.page-title';
    }

    if (currentUrl.includes('/identity-access/roles-permissions/users/new')) {
      return 'roles-permissions.create-user-page-title';
    }

    if (currentUrl.includes('/identity-access/roles-permissions/permissions')) {
      return 'roles-permissions.permissions-page-title';
    }

    if (
      currentUrl.includes('/identity-access/roles-permissions') ||
      currentUrl.includes('/identity-access/users')
    ) {
      return 'roles-permissions.title';
    }

    if (currentUrl.includes('/identity-access/alerts')) {
      return 'roles-permissions.alerts-page-title';
    }

    if (currentUrl.includes('/reports/history')) {
      return 'reports.history.page-title';
    }

    if (currentUrl.includes('/reports/monthly')) {
      return 'reports.monthly.page-title';
    }

    if (currentUrl.includes('/reports/compliance')) {
      return 'reports.compliance.page-title';
    }

    if (currentUrl.includes('/reports/ai-summary')) {
      return 'dashboard-shell.nav-ai-summary';
    }

    if (currentUrl.includes('/reports/findings')) {
      return 'reports.findings.page-title';
    }

    if (currentUrl.includes('/reports/audit-evidence')) {
      return 'reports.audit.page-title';
    }

    if (currentUrl.includes('/identity-access/reports') || currentUrl.includes('/reports')) {
      return 'reports.daily-log.page-title';
    }

    return 'roles-permissions.main-page-title';
  });

  protected readonly activeOrganizationId = computed(() => {
    return this.identityAccessStore.currentOrganizationIdFrom(this.identityAccessStore.users());
  });

  protected readonly activeOrganizationName = computed(() => {
    return this.identityAccessStore.currentOrganizationNameFrom(
      this.identityAccessStore.users(),
      this.identityAccessStore.organizations(),
    );
  });

  protected readonly profileUserName = computed(() => {
    return this.identityAccessStore.currentUserNameFrom(this.identityAccessStore.users());
  });

  protected readonly profileRoleLabelKey = computed(() => {
    return this.identityAccessStore.currentRoleLabelKeyFrom(
      this.identityAccessStore.users(),
      this.identityAccessStore.roles(),
    );
  });

  protected readonly canManageAccess = computed(() => {
    return this.identityAccessStore.canManageRolePermissions(
      this.identityAccessStore.users(),
      this.identityAccessStore.roles(),
    );
  });

  protected readonly canManageUsers = computed(() => {
    return this.identityAccessStore.canManageUsers(
      this.identityAccessStore.users(),
      this.identityAccessStore.roles(),
    );
  });

  protected readonly canMonitorAssets = computed(() => {
    return this.identityAccessStore.canMonitorAssets(
      this.identityAccessStore.users(),
      this.identityAccessStore.roles(),
    );
  });

  private readonly currentRole = computed(() => {
    return this.identityAccessStore.currentRoleFrom(
      this.identityAccessStore.users(),
      this.identityAccessStore.roles(),
    );
  });

  private readonly canDownloadReports = computed(() => {
    return this.identityAccessStore
      .permissionKeysForRole(this.currentRole())
      .includes('roles-permissions.permissions.view-reports');
  });

  protected readonly assetIssueCount = computed(() => {
    return this.assetManagementStore.assetIssueCountFor(this.activeOrganizationId());
  });

  protected readonly pendingAlertsCount = computed(() => this.alertsStore.openIncidentsCount());
  protected readonly organizationMembers = computed<OrganizationMemberSummary[]>(() => {
    const organizationId = this.activeOrganizationId();
    const roles = this.identityAccessStore.roles();

    return this.identityAccessStore.users()
      .filter((user) => user.organizationId === organizationId)
      .slice(0, 5)
      .map((user) => {
        const role = roles.find((currentRole) => currentRole.id === user.roleId);

        return {
          id: user.id,
          fullName: user.fullName,
          initials: this.initialsFor(user.fullName),
          roleLabelKey: this.identityAccessStore.roleLabelKey(role),
        };
      });
  });
  protected readonly dashboardContextQueryParams = computed<Record<string, number>>(() => {
    const userId = this.identityAccessStore.currentUserId();
    const organizationId = this.activeOrganizationId();

    if (!userId || !organizationId) {
      return {} as Record<string, number>;
    }

    return { organizationId, userId };
  });

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);

        if (this.canLoadShellData()) {
          this.loadShellData();
        }
      });
  }

  /**
   * @summary Initializes the layout view state.
   */
  ngOnInit(): void {
    if (this.canLoadShellData()) {
      this.loadShellData();
    }
  }

  protected logout(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  protected downloadCurrentMonthReport(): void {
    if (!this.canDownloadReports()) {
      this.navigateToMonthlyReports();
      return;
    }

    const month = this.reportsStore.currentDate().slice(0, 7);
    const monthlyReport = this.reportsStore.buildMonthlyReport(this.activeOrganizationId(), month);

    if (!monthlyReport.canDownload) {
      this.navigateToMonthlyReports();
      return;
    }

    this.reportsStore
      .createMonthlySummaryReport(this.activeOrganizationId(), monthlyReport)
      .subscribe({
        next: () => this.downloadMonthlyCsv(monthlyReport),
        error: () => this.navigateToMonthlyReports(),
      });
  }

  private navigateToMonthlyReports(): void {
    void this.router.navigate(['/reports/monthly'], {
      queryParams: this.dashboardContextQueryParams(),
    });
  }

  private loadShellData(): void {
    if (!this.identityAccessStore.currentUserId()) {
      this.redirectToSignIn();
      return;
    }

    this.keepDashboardContextInUrl();
    this.identityAccessStore.loadUsers();
    this.identityAccessStore.loadOrganizations();
    this.identityAccessStore.loadRoles();
    this.alertsStore.loadIncidents({ silent: true });
  }

  private canLoadShellData(): boolean {
    return this.showDashboardShell();
  }

  private redirectToSignIn(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in'], { replaceUrl: true });
  }

  private keepDashboardContextInUrl(): void {
    const userId = this.identityAccessStore.currentUserId();
    const organizationId =
      this.activeOrganizationId() ?? this.organizationIdFromCurrentUser();
    const queryParams = this.router.parseUrl(this.router.url).queryParams;

    if (!userId || !organizationId) {
      return;
    }

    if (
      Number(queryParams['userId']) === userId &&
      Number(queryParams['organizationId']) === organizationId
    ) {
      return;
    }

    void this.router.navigate([], {
      queryParams: { organizationId, userId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private organizationIdFromCurrentUser(): number | null {
    const userId = this.identityAccessStore.currentUserId();

    return (
      this.identityAccessStore.users().find((user) => user.id === userId)?.organizationId ?? null
    );
  }

  private downloadMonthlyCsv(monthlyReport: MonthlyReport): void {
    const csv = this.reportsStore.monthlyReportCsv(monthlyReport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const organizationSlug = this.fileNamePart(this.activeOrganizationName());

    link.href = url;
    link.download = `${organizationSlug}-monthly-report-${monthlyReport.month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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

  private initialsFor(fullName: string): string {
    const initials = fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');

    return initials || 'CT';
  }
}
