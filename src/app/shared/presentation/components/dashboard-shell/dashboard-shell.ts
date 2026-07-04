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

  protected contextualLinks(): ContextLink[] {
    if (this.isAccessRoute()) {
      return [];
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
    const url = this.router.url;

    return url.includes('/alerts') && !url.includes('/alerts/notifications');
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
