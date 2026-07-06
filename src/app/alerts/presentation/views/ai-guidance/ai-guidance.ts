import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { BillingApi } from '../../../../billing/infrastructure/billing-api';
import { OrganizationSubscriptionResource } from '../../../../billing/infrastructure/billing-response';
import { IdentityAccessStore } from '../../../../identity-access/application/identity-access.store';
import { AlertsStore } from '../../../application/alerts.store';
import { Incident } from '../../../domain/model/incident.entity';
import { AlertsApi } from '../../../infrastructure/alerts-api';
import { AiResolutionPlanResource } from '../../../infrastructure/ai-resolution-plan-resource';

type FeedbackKind = 'info' | 'success' | 'error';

interface AiGuidanceFeedback {
  key: string;
  kind: FeedbackKind;
}

@Component({
  selector: 'app-ai-guidance',
  standalone: true,
  imports: [MatIcon, MatProgressSpinnerModule, ReactiveFormsModule, TranslateModule],
  templateUrl: './ai-guidance.html',
  styleUrl: './ai-guidance.css',
})
export class AiGuidance implements OnInit {
  protected readonly alertsStore = inject(AlertsStore);
  private readonly alertsApi = inject(AlertsApi);
  private readonly billingApi = inject(BillingApi);
  private readonly identityStore = inject(IdentityAccessStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly translate = inject(TranslateService);

  protected readonly selectedIncidentId = signal<number>(0);
  protected readonly plans = signal<AiResolutionPlanResource[]>([]);
  protected readonly loadingPlans = signal(false);
  protected readonly generating = signal(false);
  protected readonly decidingPlanId = signal<number | null>(null);
  protected readonly subscription = signal<OrganizationSubscriptionResource | null>(null);
  protected readonly subscriptionLoading = signal(false);
  protected readonly subscriptionError = signal(false);
  protected readonly approveSubmitted = signal(false);
  protected readonly rejectSubmitted = signal(false);
  protected readonly feedback = signal<AiGuidanceFeedback>({
    key: 'alerts.ai-guidance.feedback-ready',
    kind: 'info',
  });

  protected readonly approvalForm = this.fb.nonNullable.group({
    finalCorrectiveAction: ['', [Validators.required, Validators.minLength(8)]],
    finalResolutionNotes: ['', [Validators.required, Validators.minLength(8)]],
  });
  protected readonly rejectionForm = this.fb.nonNullable.group({
    rejectionReason: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly activeIncidents = computed(() =>
    this.alertsStore.incidents().filter((incident) => !incident.isClosed),
  );
  protected readonly selectedIncident = computed<Incident | null>(() => {
    const incidents = this.activeIncidents();
    const selectedId = this.selectedIncidentId();

    return incidents.find((incident) => incident.id === selectedId) ?? incidents[0] ?? null;
  });
  protected readonly sortedPlans = computed(() =>
    [...this.plans()].sort(
      (first, second) =>
        new Date(second.generatedAt).getTime() - new Date(first.generatedAt).getTime(),
    ),
  );
  protected readonly activePlan = computed<AiResolutionPlanResource | null>(() => {
    const plans = this.sortedPlans();
    return plans.find((plan) => plan.status === 'pending') ?? plans[0] ?? null;
  });
  protected readonly aiGuidanceLocked = computed(() => {
    const subscription = this.subscription();

    if (!subscription) {
      return false;
    }

    const entitlement = subscription.entitlements.find((current) => current.key === 'ai-guidance');
    return entitlement ? !entitlement.enabled : !subscription.plan.featureFlags.allowsAiGuidance;
  });
  protected readonly canSubmitDecision = computed(
    () => Boolean(this.activePlan()?.status === 'pending') && !this.aiGuidanceLocked(),
  );

  private loadedPlanIncidentId = 0;
  private readonly selectedIncidentHistoryEffect = effect(() => {
    const incident = this.selectedIncident();

    if (!incident || incident.id === this.loadedPlanIncidentId) {
      return;
    }

    this.loadedPlanIncidentId = incident.id;
    this.loadPlanHistory(incident.id);
  });

  /**
   * @summary Initializes the AI guidance view with real incident and entitlement context.
   */
  ngOnInit(): void {
    const incidentId = Number(this.route.snapshot.queryParamMap.get('incidentId') ?? 0);

    if (incidentId > 0) {
      this.selectedIncidentId.set(incidentId);
    }

    this.alertsStore.loadIncidents({ evaluateReadings: true });
    this.loadSubscription();
  }

  protected selectIncident(value: string): void {
    const incidentId = Number(value);

    if (!Number.isFinite(incidentId) || incidentId <= 0) {
      return;
    }

    this.selectedIncidentId.set(incidentId);
    this.loadedPlanIncidentId = 0;
    this.feedback.set({ key: 'alerts.ai-guidance.feedback-ready', kind: 'info' });

    void this.router.navigate([], {
      queryParams: { incidentId },
      queryParamsHandling: 'merge',
      relativeTo: this.route,
    });
  }

  protected generatePlan(): void {
    const incident = this.selectedIncident();

    if (!incident) {
      this.feedback.set({ key: 'alerts.ai-guidance.feedback-no-incident', kind: 'error' });
      return;
    }

    if (this.aiGuidanceLocked()) {
      this.feedback.set({ key: 'alerts.ai-guidance.feedback-plan-locked', kind: 'error' });
      return;
    }

    this.generating.set(true);
    this.feedback.set({ key: 'alerts.ai-guidance.feedback-generating', kind: 'info' });

    this.alertsApi
      .generateAiResolutionPlan(incident.id)
      .pipe(finalize(() => this.generating.set(false)))
      .subscribe({
        next: (plan) => {
          this.upsertPlan(plan);
          this.prepareDecisionForms(plan);
          this.feedback.set({ key: 'alerts.ai-guidance.feedback-generated', kind: 'success' });
        },
        error: (error) =>
          this.feedback.set({ key: this.feedbackKeyFromError(error), kind: 'error' }),
      });
  }

  protected approvePlan(): void {
    this.approveSubmitted.set(true);
    this.approvalForm.markAllAsTouched();

    const plan = this.activePlan();
    const incident = this.selectedIncident();

    if (!plan || !incident || plan.status !== 'pending') {
      this.feedback.set({ key: 'alerts.ai-guidance.feedback-no-pending-plan', kind: 'error' });
      return;
    }

    if (this.approvalForm.invalid) {
      this.feedback.set({ key: 'alerts.ai-guidance.feedback-approval-required', kind: 'error' });
      return;
    }

    this.decidingPlanId.set(plan.id);

    this.alertsApi
      .approveAiResolutionPlan(incident.id, plan.id, {
        approvedBy: this.profileUserName(),
        finalCorrectiveAction: this.approvalForm.controls.finalCorrectiveAction.value.trim(),
        finalResolutionNotes: this.approvalForm.controls.finalResolutionNotes.value.trim(),
      })
      .pipe(finalize(() => this.decidingPlanId.set(null)))
      .subscribe({
        next: (updatedPlan) => {
          this.upsertPlan(updatedPlan);
          this.approveSubmitted.set(false);
          this.alertsStore.loadIncidents({ evaluateReadings: true, force: true, silent: true });
          this.feedback.set({ key: 'alerts.ai-guidance.feedback-approved', kind: 'success' });
        },
        error: (error) =>
          this.feedback.set({ key: this.feedbackKeyFromError(error), kind: 'error' }),
      });
  }

  protected rejectPlan(): void {
    this.rejectSubmitted.set(true);
    this.rejectionForm.markAllAsTouched();

    const plan = this.activePlan();
    const incident = this.selectedIncident();

    if (!plan || !incident || plan.status !== 'pending') {
      this.feedback.set({ key: 'alerts.ai-guidance.feedback-no-pending-plan', kind: 'error' });
      return;
    }

    if (this.rejectionForm.invalid) {
      this.feedback.set({ key: 'alerts.ai-guidance.feedback-rejection-required', kind: 'error' });
      return;
    }

    this.decidingPlanId.set(plan.id);

    this.alertsApi
      .rejectAiResolutionPlan(incident.id, plan.id, {
        rejectedBy: this.profileUserName(),
        rejectionReason: this.rejectionForm.controls.rejectionReason.value.trim(),
      })
      .pipe(finalize(() => this.decidingPlanId.set(null)))
      .subscribe({
        next: (updatedPlan) => {
          this.upsertPlan(updatedPlan);
          this.rejectSubmitted.set(false);
          this.feedback.set({ key: 'alerts.ai-guidance.feedback-rejected', kind: 'success' });
        },
        error: (error) =>
          this.feedback.set({ key: this.feedbackKeyFromError(error), kind: 'error' }),
      });
  }

  protected openIncidents(panel?: 'closure'): void {
    const queryParams = {
      ...this.route.snapshot.queryParams,
      ...(panel ? { panel } : {}),
    };

    void this.router.navigate(['/alerts/incidents'], { queryParams });
  }

  protected openBilling(): void {
    void this.router.navigate(['/settings/billing'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  protected retryHistory(): void {
    const incident = this.selectedIncident();

    if (incident) {
      this.loadedPlanIncidentId = 0;
      this.loadPlanHistory(incident.id);
    }
  }

  protected retrySubscription(): void {
    this.loadSubscription();
  }

  protected statusIcon(status: string): string {
    switch (status) {
      case 'approved':
        return 'task_alt';
      case 'rejected':
        return 'cancel';
      default:
        return 'pending_actions';
    }
  }

  protected planStatusLabelKey(status: string): string {
    return `alerts.ai-guidance.status-${status}`;
  }

  protected incidentStatusLabelKey(status: string): string {
    return `alerts.incident-list.status-${status}`;
  }

  protected conditionLabelKey(conditionStable: boolean): string {
    return conditionStable
      ? 'alerts.incident-list.condition-stable'
      : 'alerts.incident-list.condition-active';
  }

  protected typeLabelKey(type: string): string {
    return `alerts.incident-list.type-${type}`;
  }

  protected escalationLabelKey(escalationStatus: string): string {
    return `alerts.incident-list.escalation-${escalationStatus}`;
  }

  protected escalationUrgencyLabelKey(urgency: string | null | undefined): string {
    return `alerts.ai-guidance.urgency-${urgency?.toLowerCase() || 'none'}`;
  }

  protected hasApprovalControlError(
    controlName: keyof typeof this.approvalForm.controls,
  ): boolean {
    const control = this.approvalForm.controls[controlName];
    return control.invalid && (control.touched || this.approveSubmitted());
  }

  protected hasRejectionControlError(): boolean {
    const control = this.rejectionForm.controls.rejectionReason;
    return control.invalid && (control.touched || this.rejectSubmitted());
  }

  protected isDecisionInProgress(plan: AiResolutionPlanResource): boolean {
    return this.decidingPlanId() === plan.id;
  }

  protected formatDate(isoDate: string | null): string {
    if (!isoDate) {
      return '—';
    }

    return new Intl.DateTimeFormat(this.locale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoDate));
  }

  protected profileUserName(): string {
    return this.identityStore.currentUserNameFrom(this.identityStore.users()) || 'ColdTrace User';
  }

  private loadPlanHistory(incidentId: number): void {
    this.loadingPlans.set(true);

    this.alertsApi
      .getAiResolutionPlans(incidentId)
      .pipe(finalize(() => this.loadingPlans.set(false)))
      .subscribe({
        next: (plans) => {
          this.plans.set(plans);
          const activePlan = this.activePlan();

          if (activePlan) {
            this.prepareDecisionForms(activePlan);
          }
        },
        error: (error) => {
          this.plans.set([]);
          this.feedback.set({ key: this.feedbackKeyFromError(error), kind: 'error' });
        },
      });
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

  private upsertPlan(plan: AiResolutionPlanResource): void {
    this.plans.update((current) => {
      const exists = current.some((item) => item.id === plan.id);
      const nextPlans = exists
        ? current.map((item) => (item.id === plan.id ? plan : item))
        : [plan, ...current];

      return nextPlans.sort(
        (first, second) =>
          new Date(second.generatedAt).getTime() - new Date(first.generatedAt).getTime(),
      );
    });
  }

  private prepareDecisionForms(plan: AiResolutionPlanResource): void {
    this.approvalForm.reset({
      finalCorrectiveAction: plan.finalCorrectiveAction ?? plan.correctiveActionDraft ?? '',
      finalResolutionNotes: plan.finalResolutionNotes ?? plan.resolutionNotesDraft ?? '',
    });
    this.rejectionForm.reset({
      rejectionReason: plan.rejectionReason ?? '',
    });
    this.approveSubmitted.set(false);
    this.rejectSubmitted.set(false);
  }

  private feedbackKeyFromError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      switch (error.status) {
        case 0:
          return 'alerts.ai-guidance.feedback-network-error';
        case 401:
          return 'alerts.ai-guidance.feedback-auth-required';
        case 402:
        case 403:
          return 'alerts.ai-guidance.feedback-plan-locked';
        case 404:
          return 'alerts.ai-guidance.feedback-not-eligible';
        case 409:
          return 'alerts.ai-guidance.feedback-conflict';
        case 422:
          return 'alerts.ai-guidance.feedback-invalid-output';
        case 502:
        case 504:
          return 'alerts.ai-guidance.feedback-provider-error';
        default:
          return 'alerts.ai-guidance.feedback-error';
      }
    }

    return 'alerts.ai-guidance.feedback-error';
  }

  private locale(): string {
    return this.translate.getCurrentLang()?.startsWith('es') ? 'es-PE' : 'en-US';
  }
}
