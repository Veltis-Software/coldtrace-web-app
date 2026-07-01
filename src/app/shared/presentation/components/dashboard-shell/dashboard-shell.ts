import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageSwitcher } from '../language-switcher/language-switcher';

interface ContextLink {
  path: string;
  labelKey: string;
  visible: boolean;
  queryParams?: Record<string, string | number>;
}

export interface OrganizationMemberSummary {
  id: number;
  fullName: string;
  initials: string;
  roleLabelKey: string;
}

/**
 * @summary Presents the dashboard shell user interface in the shared bounded context.
 */
@Component({
  selector: 'app-dashboard-shell',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    RouterLink,
    RouterLinkActive,
    TranslateModule,
    LanguageSwitcher,
  ],
  templateUrl: './dashboard-shell.html',
  styleUrl: './dashboard-shell.css',
})
export class DashboardShell {
  private readonly router = inject(Router);

  @Input() activeOrganizationName = 'ColdTrace';
  @Input() pageTitleKey = '';
  @Input() profileUserName = 'ColdTrace';
  @Input() profileRoleLabelKey = 'roles-permissions.roles.unassigned';
  @Input() canManageAccess = false;
  @Input() canManageUsers = false;
  @Input() canMonitorAssets = false;
  @Input() assetIssuesCount = 0;
  @Input() pendingAlertsCount = 0;
  @Input() organizationMembers: OrganizationMemberSummary[] = [];
  @Input() contextQueryParams: Record<string, number> = {};

  @Output() signedOut = new EventEmitter<void>();
  @Output() monthlyReportRequested = new EventEmitter<void>();

  protected accessDropdownOpen = false;
  protected accessDropdownTouched = false;
  protected reportsDropdownOpen = false;
  protected reportsDropdownTouched = false;
  protected settingsDropdownOpen = false;
  protected settingsDropdownTouched = false;

  protected isAccessDropdownOpen(isActive: boolean): boolean {
    return this.accessDropdownTouched ? this.accessDropdownOpen : isActive || this.isAccessRoute();
  }

  protected isReportsDropdownOpen(isActive: boolean): boolean {
    return this.reportsDropdownTouched
      ? this.reportsDropdownOpen
      : isActive || this.isReportsRoute();
  }

  protected isSettingsDropdownOpen(isActive: boolean): boolean {
    return this.settingsDropdownTouched
      ? this.settingsDropdownOpen
      : isActive || this.isSettingsRoute();
  }

  protected toggleAccessDropdown(isActive: boolean): void {
    this.accessDropdownOpen = !this.isAccessDropdownOpen(isActive);
    this.accessDropdownTouched = true;
  }

  protected toggleReportsDropdown(isActive: boolean): void {
    this.reportsDropdownOpen = !this.isReportsDropdownOpen(isActive);
    this.reportsDropdownTouched = true;
  }

  protected toggleSettingsDropdown(isActive: boolean): void {
    this.settingsDropdownOpen = !this.isSettingsDropdownOpen(isActive);
    this.settingsDropdownTouched = true;
  }

  protected contextualLinks(): ContextLink[] {
    if (this.isAccessRoute()) {
      return [
        {
          path: '/identity-access/users',
          labelKey: 'dashboard-shell.nav-users',
          visible: true,
        },
        {
          path: '/identity-access/roles-permissions/users/new',
          labelKey: 'dashboard-shell.nav-new-user',
          visible: this.canManageUsers,
        },
        {
          path: '/identity-access/roles-permissions/permissions',
          labelKey: 'dashboard-shell.nav-permissions',
          visible: this.canManageAccess,
        },
      ];
    }

    if (this.isSettingsRoute()) {
      return [
        {
          path: '/asset-management/safety-ranges',
          labelKey: 'dashboard-shell.nav-safety-ranges',
          visible: true,
        },
        {
          path: '/asset-management/operational-parameters',
          labelKey: 'dashboard-shell.nav-operational-parameters',
          visible: true,
        },
        {
          path: '/maintenance/preventive',
          labelKey: 'dashboard-shell.nav-preventive-maintenance',
          visible: true,
        },
        {
          path: '/maintenance/technical-service',
          labelKey: 'dashboard-shell.nav-technical-service',
          visible: true,
        },
        {
          path: '/settings/billing',
          labelKey: 'dashboard-shell.nav-billing',
          visible: true,
        },
      ];
    }

    if (this.isAlertsRoute()) {
      return [
        { path: '/alerts/incidents', labelKey: 'dashboard-shell.nav-incidents', visible: true },
        {
          path: '/alerts/ai-guidance',
          labelKey: 'dashboard-shell.nav-ai-guidance',
          visible: true,
        },
        {
          path: '/alerts/notifications',
          labelKey: 'dashboard-shell.nav-notifications',
          visible: true,
        },
      ];
    }

    if (this.isReportsRoute()) {
      return [
        { path: '/reports/daily-log', labelKey: 'dashboard-shell.nav-daily-log', visible: true },
        { path: '/reports/monthly', labelKey: 'dashboard-shell.nav-monthly-report', visible: true },
        { path: '/reports/history', labelKey: 'dashboard-shell.nav-history', visible: true },
        { path: '/reports/compliance', labelKey: 'dashboard-shell.nav-compliance', visible: true },
        { path: '/reports/ai-summary', labelKey: 'dashboard-shell.nav-ai-summary', visible: true },
        { path: '/reports/findings', labelKey: 'dashboard-shell.nav-findings', visible: true },
        {
          path: '/reports/audit-evidence',
          labelKey: 'dashboard-shell.nav-audit-evidence',
          visible: true,
        },
      ];
    }

    return [];
  }

  protected isContextLinkActive(link: ContextLink): boolean {
    const [currentPath, currentQuery = ''] = this.router.url.split('?');

    if (currentPath !== link.path) {
      return false;
    }

    const expectedParams = Object.entries(link.queryParams ?? {});

    if (!expectedParams.length) {
      return true;
    }

    const queryParams = new URLSearchParams(currentQuery);

    return expectedParams.every(([key, value]) => queryParams.get(key) === value);
  }

  protected openSettings(): void {
    void this.router.navigate(['/asset-management/safety-ranges'], {
      queryParams: this.contextQueryParams,
    });
  }

  protected logout(): void {
    this.signedOut.emit();
  }

  protected requestMonthlyReport(): void {
    this.monthlyReportRequested.emit();
  }

  protected isAccessRoute(): boolean {
    const url = this.router.url;

    return (
      url.includes('/identity-access/users') || url.includes('/identity-access/roles-permissions')
    );
  }

  protected isReportsRoute(): boolean {
    const url = this.router.url;

    return url.includes('/reports') || url.includes('/identity-access/reports');
  }

  protected isAlertsRoute(): boolean {
    return this.router.url.includes('/alerts');
  }

  protected isSettingsRoute(): boolean {
    const url = this.router.url;

    return (
      url.includes('/asset-management/safety-ranges') ||
      url.includes('/asset-management/operational-parameters') ||
      url.includes('/maintenance') ||
      url.includes('/settings')
    );
  }
}
