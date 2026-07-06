import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
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
  params: Record<string, string | number>;
}

interface DashboardAiChatTurn {
  id: number;
  question: string;
  answer: DashboardAiInterpretationResource | null;
  localAnswer: string;
  failure: DashboardAiFailure;
  loading: boolean;
}

/**
 * @summary Presents the AI interpretation assistant for the operational dashboard.
 */
@Component({
  selector: 'app-dashboard-ai-assistant',
  standalone: true,
  imports: [FormsModule, MatIconModule, TranslateModule],
  templateUrl: './dashboard-ai-assistant.html',
  styleUrl: './dashboard-ai-assistant.css',
})
export class DashboardAiAssistant {
  private readonly monitoringApi = inject(MonitoringApi);
  private readonly translate = inject(TranslateService);
  private nextChatTurnId = 1;

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
  protected readonly chatTurns = signal<DashboardAiChatTurn[]>([]);
  protected readonly lastQuestion = signal('');
  protected readonly loading = signal(false);
  protected readonly latestInterpretation = computed(() => {
    const answeredTurn = [...this.chatTurns()]
      .reverse()
      .find((turn) => turn.answer);

    return answeredTurn?.answer ?? null;
  });
  protected readonly currentTone = computed(() =>
    this.latestInterpretation()
      ? this.toneFromAttentionLevel(this.latestInterpretation()?.attentionLevel)
      : this.insightTone,
  );
  protected get suggestedQuestions(): DashboardAiPrompt[] {
    return [
      {
        id: 'risk',
        textKey: 'monitoring.operational.ai-question-risk',
        params: { incidents: this.activeIncidents },
      },
      {
        id: 'compliance',
        textKey: 'monitoring.operational.ai-question-compliance',
        params: { compliance: this.formatNumber(this.thermalCompliance) },
      },
      {
        id: 'next',
        textKey:
          this.criticalIncidents > 0
            ? 'monitoring.operational.ai-question-next-critical'
            : 'monitoring.operational.ai-question-next-open',
        params: { critical: this.criticalIncidents, incidents: this.activeIncidents },
      },
      {
        id: 'maintenance',
        textKey: 'monitoring.operational.ai-question-maintenance',
        params: { progress: this.formatNumber(this.maintenanceCompletion) },
      },
    ];
  }

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
  }

  protected closePanel(): void {
    this.expanded.set(false);
  }

  protected askSuggestedQuestion(prompt: DashboardAiPrompt): void {
    const translatedQuestion = this.translate.instant(prompt.textKey, prompt.params);
    this.askQuestion(translatedQuestion);
  }

  protected askQuestion(question = this.question()): void {
    const normalizedQuestion = question.trim();

    if (!normalizedQuestion) {
      return;
    }

    const chatTurnId = this.nextChatTurnId++;

    this.chatTurns.update((turns) => [
      ...turns,
      {
        id: chatTurnId,
        question: normalizedQuestion,
        answer: null,
        localAnswer: this.localAnswerFor(normalizedQuestion),
        failure: 'none',
        loading: !this.isGreeting(normalizedQuestion),
      },
    ]);
    this.question.set('');
    if (this.isGreeting(normalizedQuestion)) {
      return;
    }
    this.requestInterpretation(normalizedQuestion, chatTurnId);
  }

  protected retryChatTurn(turn: DashboardAiChatTurn): void {
    this.chatTurns.update((turns) =>
      turns.map((currentTurn) =>
        currentTurn.id === turn.id
          ? { ...currentTurn, answer: null, failure: 'none', loading: true }
          : currentTurn,
      ),
    );
    this.requestInterpretation(turn.question, turn.id);
  }

  protected formattedGeneratedAtFor(interpretation: DashboardAiInterpretationResource): string {
    const generatedAt = interpretation.generatedAt;

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

  protected visibleSourceMetricsFor(
    interpretation: DashboardAiInterpretationResource,
  ): DashboardAiSourceMetricResource[] {
    const sourceMetrics = interpretation.sourceMetrics ?? [];
    const primaryMetricNames = [
      'openIncidents',
      'thermalCompliance',
      'outOfRangeReadings',
      'devicesWithUnhealthyStatus',
    ];
    const metricsByName = new Map(sourceMetrics.map((metric) => [metric.name, metric]));
    const primaryMetrics = primaryMetricNames
      .map((metricName) => metricsByName.get(metricName))
      .filter((metric): metric is DashboardAiSourceMetricResource => Boolean(metric));

    return (primaryMetrics.length > 0 ? primaryMetrics : sourceMetrics).slice(0, 4);
  }

  protected hiddenSourceMetricCountFor(interpretation: DashboardAiInterpretationResource): number {
    const sourceMetricsCount = interpretation.sourceMetrics?.length ?? 0;

    return Math.max(0, sourceMetricsCount - this.visibleSourceMetricsFor(interpretation).length);
  }

  protected sourceMetricLabel(metric: DashboardAiSourceMetricResource): string {
    return this.metricLabel(metric.name);
  }

  protected visibleMetricInsightsFor(
    interpretation: DashboardAiInterpretationResource,
  ): DashboardAiMetricInsightResource[] {
    return (interpretation.metricInsights ?? []).slice(0, 3);
  }

  protected metricInsightLabel(metricInsight: DashboardAiMetricInsightResource): string {
    return this.metricLabel(metricInsight.metric);
  }

  private metricLabel(metricName: string): string {
    const translationKey = `monitoring.operational.ai-source-metric-${metricName}`;
    const translatedLabel = this.translate.instant(translationKey);

    return translatedLabel === translationKey ? metricName : translatedLabel;
  }

  protected hasFailure(): boolean {
    return this.failure() !== 'none';
  }

  protected failureTitleKeyFor(failure: DashboardAiFailure): string {
    return `monitoring.operational.ai-error-${failure}-title`;
  }

  protected failureBodyKeyFor(failure: DashboardAiFailure): string {
    return `monitoring.operational.ai-error-${failure}-body`;
  }

  protected metricTone(metricInsight: DashboardAiMetricInsightResource): DashboardAiTone {
    return this.toneFromAttentionLevel(metricInsight.severity);
  }

  private requestInterpretation(question?: string, chatTurnId?: number): void {
    const normalizedQuestion = question?.trim() ?? '';

    this.loading.set(true);
    if (!chatTurnId) {
      this.failure.set('none');
    }

    this.monitoringApi
      .generateDashboardAiInterpretation({
        question: normalizedQuestion || undefined,
        preferredLanguage: this.preferredLanguageFrom(normalizedQuestion),
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (interpretation) => {
          if (chatTurnId) {
            this.updateChatTurn(chatTurnId, {
              answer: interpretation,
              failure: 'none',
              loading: false,
            });
          }
          this.lastQuestion.set(interpretation.question || normalizedQuestion);
        },
        error: (error: unknown) => {
          const failure = this.failureFrom(error);

          if (chatTurnId) {
            this.updateChatTurn(chatTurnId, { failure, loading: false });
          } else {
            this.failure.set(failure);
          }
        },
      });
  }

  private updateChatTurn(chatTurnId: number, partialTurn: Partial<DashboardAiChatTurn>): void {
    this.chatTurns.update((turns) =>
      turns.map((turn) => (turn.id === chatTurnId ? { ...turn, ...partialTurn } : turn)),
    );
  }

  private localAnswerFor(question: string): string {
    if (!this.isGreeting(question)) {
      return '';
    }

    if (this.preferredLanguageFrom(question) === 'es') {
      return 'Hola. Puedo ayudarte a revisar incidencias, cumplimiento térmico, sensores o mantenimiento del dashboard.';
    }

    return 'Hi. I can help review incidents, thermal compliance, sensors, or dashboard maintenance.';
  }

  private isGreeting(question: string): boolean {
    const normalizedQuestion = this.normalizeText(question).replace(/[^\p{L}\p{N}\s]/gu, '').trim();
    const greetings = [
      'hola',
      'buenas',
      'buenos dias',
      'buenas tardes',
      'buenas noches',
      'hello',
      'hi',
      'hey',
    ];

    return greetings.includes(normalizedQuestion);
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
        /\bhola\b/,
        /\bbuenas\b/,
        /\bbuenos dias\b/,
        /\bbuenas tardes\b/,
        /\bbuenas noches\b/,
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

  private formatNumber(value: number): string {
    return new Intl.NumberFormat(this.currentLocale(), { maximumFractionDigits: 1 }).format(value);
  }

  private currentLocale(): string {
    return this.translate.getCurrentLang()?.startsWith('es') ? 'es-PE' : 'en-US';
  }
}
