import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter } from 'rxjs';
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
  private currentNavigationPath = this.pathFromUrl(this.router.url);
  private mobileNavigationCloseTimeout: ReturnType<typeof window.setTimeout> | null = null;

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
  protected readonly mobileNavigationOpen = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const nextPath = this.pathFromUrl(event.urlAfterRedirects);

        if (nextPath !== this.currentNavigationPath) {
          this.closeMobileNavigation();
        }

        this.currentNavigationPath = nextPath;
      });
  }

  protected contextualLinks(): ContextLink[] {
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

  protected toggleAccessDropdown(): void {
    this.accessDropdownOpen = this.accessDropdownTouched
      ? !this.accessDropdownOpen
      : !this.isAccessRoute();
    this.accessDropdownTouched = true;
    this.reportsDropdownOpen = false;
    this.reportsDropdownTouched = true;
    this.settingsDropdownOpen = false;
    this.settingsDropdownTouched = true;
  }

  protected toggleReportsDropdown(): void {
    this.reportsDropdownOpen = this.reportsDropdownTouched
      ? !this.reportsDropdownOpen
      : !this.isReportsRoute();
    this.reportsDropdownTouched = true;
    this.accessDropdownOpen = false;
    this.accessDropdownTouched = true;
    this.settingsDropdownOpen = false;
    this.settingsDropdownTouched = true;
  }

  protected toggleSettingsDropdown(): void {
    this.settingsDropdownOpen = this.settingsDropdownTouched
      ? !this.settingsDropdownOpen
      : !this.isSettingsRoute();
    this.settingsDropdownTouched = true;
    this.accessDropdownOpen = false;
    this.accessDropdownTouched = true;
    this.reportsDropdownOpen = false;
    this.reportsDropdownTouched = true;
  }

  protected toggleMobileNavigation(): void {
    this.clearMobileNavigationCloseTimeout();

    if (this.mobileNavigationOpen()) {
      this.closeMobileNavigation();
      return;
    }

    this.mobileNavigationOpen.set(true);
  }

  protected closeMobileNavigation(): void {
    this.clearMobileNavigationCloseTimeout();
    this.mobileNavigationOpen.set(false);
    this.accessDropdownOpen = false;
    this.accessDropdownTouched = false;
    this.reportsDropdownOpen = false;
    this.reportsDropdownTouched = false;
    this.settingsDropdownOpen = false;
    this.settingsDropdownTouched = false;
  }

  protected closeMobileNavigationAfterNavigation(): void {
    this.clearMobileNavigationCloseTimeout();
    this.mobileNavigationCloseTimeout = window.setTimeout(() => {
      this.mobileNavigationCloseTimeout = null;
      this.closeMobileNavigation();
    }, 180);
  }

  protected openSettings(): void {
    this.closeMobileNavigation();
    void this.router.navigate(['/asset-management/safety-ranges'], {
      queryParams: this.contextQueryParams,
    });
  }

  protected logout(): void {
    this.closeMobileNavigation();
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

  private pathFromUrl(url: string): string {
    return url.split('?')[0].split('#')[0];
  }

  private clearMobileNavigationCloseTimeout(): void {
    if (!this.mobileNavigationCloseTimeout) {
      return;
    }

    window.clearTimeout(this.mobileNavigationCloseTimeout);
    this.mobileNavigationCloseTimeout = null;
  }
}
