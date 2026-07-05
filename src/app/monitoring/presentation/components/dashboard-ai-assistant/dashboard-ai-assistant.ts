import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { MonitoringApi } from '../../../infrastructure/monitoring-api';
import {
  DashboardAiInterpretationResource,
  DashboardAiMetricInsightResource,
  DashboardAiSourceMetricResource,
} from '../../../infrastructure/dashboard-ai-interpretation-response';

type DashboardAiTone = 'ok' | 'warning' | 'critical';
type DashboardAiFailure =
  | 'none'
  | 'organization-required'
  | 'auth-required'
  | 'plan-locked'
  | 'invalid-output'
  | 'timeout'
  | 'provider-error';

interface DashboardAiPrompt {
  id: string;
  textKey: string;
}

/**
 * @summary Presents the AI interpretation assistant for the operational dashboard.
 */
@Component({
  selector: 'app-dashboard-ai-assistant',
  standalone: true,
  imports: [FormsModule, MatIconModule, RouterLink, TranslateModule],
  templateUrl: './dashboard-ai-assistant.html',
  styleUrl: './dashboard-ai-assistant.css',
})
export class DashboardAiAssistant {
  private readonly monitoringApi = inject(MonitoringApi);
  private readonly translate = inject(TranslateService);

  @Input() thermalCompliance = 0;
  @Input() activeIncidents = 0;
  @Input() criticalIncidents = 0;
  @Input() monitoredAssets = 0;
  @Input() activeSensors = 0;
  @Input() readingsCount = 0;
  @Input() maintenanceCompletion = 0;
  @Input() assetIssueCount = 0;

  protected readonly question = signal('');
  protected readonly expanded = signal(false);
  protected readonly failure = signal<DashboardAiFailure>('none');
  protected readonly interpretation = signal<DashboardAiInterpretationResource | null>(null);
  protected readonly lastQuestion = signal('');
  protected readonly loading = signal(false);
  protected readonly currentTone = computed(() =>
    this.interpretation()
      ? this.toneFromAttentionLevel(this.interpretation()?.attentionLevel)
      : this.insightTone,
  );
  protected readonly suggestedQuestions: DashboardAiPrompt[] = [
    { id: 'risk', textKey: 'monitoring.operational.ai-question-risk' },
    { id: 'compliance', textKey: 'monitoring.operational.ai-question-compliance' },
    { id: 'next', textKey: 'monitoring.operational.ai-question-next' },
    { id: 'maintenance', textKey: 'monitoring.operational.ai-question-maintenance' },
  ];

  protected get insightTone(): DashboardAiTone {
    if (this.criticalIncidents > 0 || this.thermalCompliance < 85) {
      return 'critical';
    }

    if (this.activeIncidents > 0 || this.assetIssueCount > 0 || this.thermalCompliance < 95) {
      return 'warning';
    }

    return 'ok';
  }

  protected get insightStatusKey(): string {
    return `monitoring.operational.ai-status-${this.currentTone()}`;
  }

  protected updateQuestion(value: string): void {
    this.question.set(value);
  }

  protected openPanel(): void {
    this.expanded.set(true);

    if (!this.interpretation() && !this.loading()) {
      this.requestInterpretation();
    }
  }

  protected closePanel(): void {
    this.expanded.set(false);
  }

  protected askSuggestedQuestion(prompt: DashboardAiPrompt): void {
    const translatedQuestion = this.translate.instant(prompt.textKey);
    this.askQuestion(translatedQuestion);
  }

  protected askQuestion(question = this.question()): void {
    const normalizedQuestion = question.trim();

    if (!normalizedQuestion) {
      return;
    }

    this.question.set(normalizedQuestion);
    this.requestInterpretation(normalizedQuestion);
  }

  protected retry(): void {
    this.requestInterpretation(this.lastQuestion() || this.question());
  }

  protected formattedGeneratedAt(): string {
    const generatedAt = this.interpretation()?.generatedAt;

    if (!generatedAt) {
      return '';
    }

    const date = new Date(generatedAt);

    if (Number.isNaN(date.getTime())) {
      return generatedAt;
    }

    return new Intl.DateTimeFormat(this.currentLocale(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  protected formatSourceMetric(metric: DashboardAiSourceMetricResource): string {
    const value = `${metric.value ?? ''}`.trim();
    const unit = `${metric.unit ?? ''}`.trim();

    if (!unit) {
      return value;
    }

    if (unit === '%') {
      return `${value}${unit}`;
    }

    return `${value} ${unit}`;
  }

  protected hasGeneratedContent(): boolean {
    const interpretation = this.interpretation();

    return Boolean(
      interpretation?.overallReading ||
        interpretation?.metricInsights?.length ||
        interpretation?.risks?.length ||
        interpretation?.recommendedActions?.length ||
        interpretation?.sourceMetrics?.length,
    );
  }

  protected hasFailure(): boolean {
    return this.failure() !== 'none';
  }

  protected failureTitleKey(): string {
    return `monitoring.operational.ai-error-${this.failure()}-title`;
  }

  protected failureBodyKey(): string {
    return `monitoring.operational.ai-error-${this.failure()}-body`;
  }

  protected metricTone(metricInsight: DashboardAiMetricInsightResource): DashboardAiTone {
    return this.toneFromAttentionLevel(metricInsight.severity);
  }

  private requestInterpretation(question?: string): void {
    const normalizedQuestion = question?.trim() ?? '';

    this.loading.set(true);
    this.failure.set('none');

    this.monitoringApi
      .generateDashboardAiInterpretation({
        question: normalizedQuestion || undefined,
        preferredLanguage: this.preferredLanguageFrom(normalizedQuestion),
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (interpretation) => {
          this.interpretation.set(interpretation);
          this.lastQuestion.set(interpretation.question || normalizedQuestion);
          this.question.set(interpretation.question || normalizedQuestion);
        },
        error: (error: unknown) => {
          this.failure.set(this.failureFrom(error));
        },
      });
  }

  private failureFrom(error: unknown): DashboardAiFailure {
    if (error instanceof Error && error.message === 'organization-scope-required') {
      return 'organization-required';
    }

    if (!(error instanceof HttpErrorResponse)) {
      return 'provider-error';
    }

    if (error.status === 401) {
      return 'auth-required';
    }

    if ([402, 403, 409].includes(error.status)) {
      return 'plan-locked';
    }

    if (error.status === 502) {
      return 'invalid-output';
    }

    if (error.status === 504) {
      return 'timeout';
    }

    return 'provider-error';
  }

  private preferredLanguageFrom(question: string): string {
    const currentLanguage = this.translate.getCurrentLang() || 'en';

    if (currentLanguage?.startsWith('es') || this.looksLikeSpanish(question)) {
      return 'es';
    }

    return 'en';
  }

  private looksLikeSpanish(question: string): boolean {
    const normalizedQuestion = this.normalizeText(question);

    return (
      /[¿¡]/.test(question) ||
      [
        /\bque\b/,
        /\bcual(es)?\b/,
        /\bpor que\b/,
        /\bincidencia(s)?\b/,
        /\bcumplimiento\b/,
        /\bmantenimiento\b/,
        /\briesgo(s)?\b/,
        /\btemperatura\b/,
        /\bdeberia\b/,
        /\baccion(es)?\b/,
      ].some((pattern) => pattern.test(normalizedQuestion))
    );
  }

  private toneFromAttentionLevel(attentionLevel?: string): DashboardAiTone {
    const normalizedAttentionLevel = this.normalizeText(attentionLevel ?? '');

    if (
      normalizedAttentionLevel.includes('critical') ||
      normalizedAttentionLevel.includes('critica') ||
      normalizedAttentionLevel.includes('high')
    ) {
      return 'critical';
    }

    if (
      normalizedAttentionLevel.includes('warning') ||
      normalizedAttentionLevel.includes('medium') ||
      normalizedAttentionLevel.includes('attention') ||
      normalizedAttentionLevel.includes('moderate')
    ) {
      return 'warning';
    }

    return 'ok';
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private currentLocale(): string {
    return this.translate.getCurrentLang()?.startsWith('es') ? 'es-PE' : 'en-US';
  }
}
