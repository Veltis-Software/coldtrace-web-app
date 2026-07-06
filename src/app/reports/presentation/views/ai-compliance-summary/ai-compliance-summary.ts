import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize, forkJoin } from 'rxjs';
import { BillingApi } from '../../../../billing/infrastructure/billing-api';
import { OrganizationSubscriptionResource } from '../../../../billing/infrastructure/billing-response';
import { IdentityAccessStore } from '../../../../identity-access/application/identity-access.store';
import { Organization } from '../../../../identity-access/domain/model/organization.entity';
import { Role } from '../../../../identity-access/domain/model/role.entity';
import { User } from '../../../../identity-access/domain/model/user.entity';
import { IdentityAccessApi } from '../../../../identity-access/infrastructure/identity-access-api';
import { ReportsStore } from '../../../application/reports.store';
import { Report } from '../../../domain/model/report.entity';
import { ReportAiSummaryResource } from '../../../infrastructure/report-ai-summary-resource';
import { ReportsApi } from '../../../infrastructure/reports-api';

type SummaryFeedbackKind = 'info' | 'success' | 'error';

interface SummaryFeedback {
  key: string;
  kind: SummaryFeedbackKind;
}

interface SummaryMetric {
  labelKey: string;
  value: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
}

@Component({
  selector: 'app-ai-compliance-summary',
  standalone: true,
  imports: [MatIcon, MatProgressSpinnerModule, RouterLink, TranslatePipe],
  templateUrl: './ai-compliance-summary.html',
  styleUrl: './ai-compliance-summary.css',
})
export class AiComplianceSummary implements OnInit {
  protected readonly reportsStore = inject(ReportsStore);
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly billingApi = inject(BillingApi);
  private readonly reportsApi = inject(ReportsApi);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly identityLoading = signal(false);
  protected readonly subscriptionLoading = signal(false);
  protected readonly subscriptionError = signal(false);
  protected readonly generating = signal(false);
  protected readonly selectedReportId = signal<number>(0);
  protected readonly summary = signal<ReportAiSummaryResource | null>(null);
  protected readonly subscription = signal<OrganizationSubscriptionResource | null>(null);
  protected readonly users = signal<User[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly organizations = signal<Organization[]>([]);
  protected readonly feedback = signal<SummaryFeedback>({
    key: 'reports.ai-summary.feedback-ready',
    kind: 'info',
  });

  protected readonly activeOrganizationId = computed(() => {
    return this.identityAccessStore.currentOrganizationIdFrom(this.users());
  });
  protected readonly loading = computed(() => {
    return (
      this.identityLoading() ||
      this.subscriptionLoading() ||
      this.reportsStore.loading()
    );
  });
  protected readonly reports = computed(() => {
    return this.reportsStore
      .reportsForOrganization(this.activeOrganizationId())
      .sort(
        (first, second) =>
          new Date(second.generatedAt).getTime() - new Date(first.generatedAt).getTime(),
      );
  });
  protected readonly selectedReport = computed<Report | null>(() => {
    const reports = this.reports();
    const selectedId = this.selectedReportId();

    return reports.find((report) => report.id === selectedId) ?? reports[0] ?? null;
  });
  protected readonly aiSummaryLocked = computed(() => {
    const subscription = this.subscription();

    if (!subscription) {
      return false;
    }

    const entitlement = subscription.entitlements.find(
      (current) => current.key === 'ai-report-summary',
    );
    return entitlement
      ? !entitlement.enabled
      : !subscription.plan.featureFlags.allowsAiReportSummary;
  });
  protected readonly sourceMetrics = computed<SummaryMetric[]>(() => {
    const report = this.summary()?.sourceReport ?? this.selectedReport();

    if (!report) {
      return [];
    }

    return [
      {
        labelKey: 'reports.ai-summary.metric-assets',
        value: this.metricValue(report.assetCount, 'assets'),
        tone: 'blue',
      },
      {
        labelKey: 'reports.ai-summary.metric-compliance',
        value: this.percentValue(report.compliancePercentage),
        tone: 'green',
      },
      {
        labelKey: 'reports.ai-summary.metric-incidents',
        value: this.metricValue(report.openIncidentCount ?? report.incidentCount, 'incidents'),
        tone: 'amber',
      },
      {
        labelKey: 'reports.ai-summary.metric-out-of-range',
        value: this.metricValue(report.outOfRangeReadingCount, 'readings'),
        tone: 'red',
      },
    ];
  });

  /**
   * @summary Initializes report selection and subscription context.
   */
  ngOnInit(): void {
    this.loadPageData();
  }

  protected loadPageData(): void {
    this.identityLoading.set(true);
    this.feedback.set({ key: 'reports.ai-summary.feedback-ready', kind: 'info' });
    this.reportsStore.loadReports({ force: true });
    this.loadSubscription();

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
          this.reportsStore.loadReports({ force: true });
        },
        error: () =>
          this.feedback.set({ key: 'reports.ai-summary.feedback-auth-error', kind: 'error' }),
      });
  }

  protected selectReport(value: string): void {
    const reportId = Number(value);

    if (!Number.isFinite(reportId) || reportId <= 0) {
      return;
    }

    this.selectedReportId.set(reportId);
    this.summary.set(null);
    this.feedback.set({ key: 'reports.ai-summary.feedback-ready', kind: 'info' });
  }

  protected generateSummary(): void {
    const report = this.selectedReport();

    if (!report) {
      this.feedback.set({ key: 'reports.ai-summary.feedback-no-report', kind: 'error' });
      return;
    }

    if (this.aiSummaryLocked()) {
      this.feedback.set({ key: 'reports.ai-summary.feedback-plan-locked', kind: 'error' });
      return;
    }

    this.generating.set(true);
    this.feedback.set({ key: 'reports.ai-summary.feedback-generating', kind: 'info' });

    this.reportsApi
      .generateAiSummary(report.id)
      .pipe(finalize(() => this.generating.set(false)))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.feedback.set({ key: 'reports.ai-summary.feedback-generated', kind: 'success' });
        },
        error: (error) =>
          this.feedback.set({ key: this.feedbackKeyFromError(error), kind: 'error' }),
      });
  }

  protected openBilling(): void {
    void this.router.navigate(['/settings/billing'], {
      queryParams: { organizationId: this.activeOrganizationId() },
    });
  }

  protected reportTypeLabelKey(value: string | null | undefined): string {
    const normalized = (value ?? '').toLowerCase().replaceAll('_', '-');
    return `reports.ai-summary.report-type-${normalized || 'unknown'}`;
  }

  protected findingStatusClass(status: string): string {
    return `status-${status.toLowerCase().replaceAll('_', '-').replaceAll(' ', '-')}`;
  }

  protected formatDate(isoDate: string | null | undefined): string {
    if (!isoDate) {
      return 'N/A';
    }

    return new Intl.DateTimeFormat(this.locale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoDate));
  }

  private loadSubscription(): void {
    this.subscriptionLoading.set(true);
    this.subscriptionError.set(false);

    this.billingApi
      .getCurrentSubscription()
      .pipe(finalize(() => this.subscriptionLoading.set(false)))
      .subscribe({
        next: (subscription) => this.subscription.set(subscription),
        error: () => {
          this.subscription.set(null);
          this.subscriptionError.set(true);
        },
      });
  }

  private metricValue(value: number | null | undefined, suffixKey: string): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    return `${value} ${this.translate.instant(`reports.ai-summary.metric-suffix-${suffixKey}`)}`;
  }

  private percentValue(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    return `${Number(value).toFixed(1)}%`;
  }

  private feedbackKeyFromError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      switch (error.status) {
        case 0:
          return 'reports.ai-summary.feedback-network-error';
        case 401:
          return 'reports.ai-summary.feedback-auth-required';
        case 402:
        case 403:
          return 'reports.ai-summary.feedback-plan-locked';
        case 404:
          return 'reports.ai-summary.feedback-report-not-found';
        case 500:
          return 'reports.ai-summary.feedback-context-error';
        case 502:
          return 'reports.ai-summary.feedback-invalid-output';
        case 503:
          return 'reports.ai-summary.feedback-provider-error';
        case 504:
          return 'reports.ai-summary.feedback-timeout';
        default:
          return 'reports.ai-summary.feedback-error';
      }
    }

    return 'reports.ai-summary.feedback-error';
  }

  private locale(): string {
    return this.translate.getCurrentLang()?.startsWith('es') ? 'es-PE' : 'en-US';
  }
}
