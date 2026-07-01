import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { IdentityAccessStore } from '../../../../identity-access/application/identity-access.store';
import { ListPagination } from '../../../../shared/presentation/components/list-pagination/list-pagination';
import { AlertsStore } from '../../../application/alerts.store';
import { Incident } from '../../../domain/model/incident.entity';
import { Notification } from '../../../domain/model/notification.entity';

type NotificationFilter = 'active' | 'pending' | 'failed';

/**
 * @summary Presents the notification list user interface in the alerts bounded context.
 */
@Component({
  selector: 'app-notification-list',
  standalone: true,
  imports: [
    TranslateModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ListPagination,
  ],
  templateUrl: './notification-list.html',
  styleUrl: './notification-list.css',
})
export class NotificationList implements OnInit {
  protected readonly alertsStore = inject(AlertsStore);
  private readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly feedbackDismissDelayMs = 3000;
  private feedbackDismissTimeoutId: number | null = null;
  protected readonly pageSize = 10;
  protected readonly currentPage = signal(1);
  protected readonly searchTerm = signal('');
  protected readonly selectedNotificationFilter = signal<NotificationFilter>('active');
  protected readonly notifications = computed(() => {
    return [...this.alertsStore.activeNotifications()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  });
  protected readonly filteredNotifications = computed(() => {
    const normalizedSearch = this.searchTerm().trim().toLowerCase();
    const filteredByStatus = this.notifications().filter((notification) =>
      this.matchesNotificationFilter(notification),
    );

    if (!normalizedSearch) {
      return filteredByStatus;
    }

    return filteredByStatus.filter((notification) => {
      const incident = this.incidentForNotification(notification);

      return [
        notification.assetName,
        notification.message,
        notification.recipient,
        notification.channel,
        notification.status,
        incident?.severity ?? '',
        incident?.escalationStatus ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
  });
  protected readonly paginatedNotifications = computed(() =>
    this.paginate(this.filteredNotifications(), this.currentPage()),
  );
  protected readonly canAttendNotifications = computed(() => this.alertsStore.canResolveAlerts());

  constructor() {
    this.destroyRef.onDestroy(() => this.clearFeedbackDismissTimeout());
  }

  /**
   * @summary Initializes the notification list view state.
   */
  ngOnInit(): void {
    this.alertsStore.clearFeedback();
    this.alertsStore.loadIncidents({ evaluateReadings: true });
  }

  protected notificationChannelIcon(notification: Notification): string {
    switch (notification.channel) {
      case 'email':
        return 'mail';
      case 'sms':
        return 'sms';
      default:
        return 'notifications';
    }
  }

  protected notificationChannelLabelKey(notification: Notification): string {
    return `alerts.notification-list.channel-${notification.channel}`;
  }

  protected notificationStatusLabelKey(notification: Notification): string {
    return `alerts.notification-list.status-${notification.status}`;
  }

  protected incidentForNotification(notification: Notification): Incident | null {
    return (
      this.alertsStore.incidents().find((incident) => incident.id === notification.incidentId) ??
      null
    );
  }

  protected notificationTitle(notification: Notification): string {
    return this.incidentForNotification(notification)?.assetName || notification.message;
  }

  protected escalationLabelKey(incident: Incident): string {
    return `alerts.notification-list.escalation-${incident.escalationStatus}`;
  }

  protected severityLabelKey(incident: Incident): string {
    return `alerts.notification-list.severity-${incident.severity}`;
  }

  protected isAttending(notification: Notification): boolean {
    const incident = this.incidentForNotification(notification);

    return Boolean(incident && this.alertsStore.recognizingId() === incident.id);
  }

  protected attendNotification(notification: Notification): void {
    const incident = this.incidentForNotification(notification);

    if (!incident || !incident.isOpen) {
      return;
    }

    if (!this.canAttendNotifications()) {
      this.showTimedFeedback('alerts.notification-list.feedback-access-denied');
      return;
    }

    const responsibleUserName = this.identityAccessStore.currentUserNameFrom(
      this.identityAccessStore.users(),
    );

    this.alertsStore.recognizeIncident(incident, responsibleUserName).subscribe({
      next: () => this.showTimedFeedback('alerts.notification-list.feedback-attended'),
      error: () => this.showTimedFeedback('alerts.notification-list.feedback-error'),
    });
  }

  protected selectNotificationFilter(filter: NotificationFilter): void {
    this.selectedNotificationFilter.set(filter);
    this.currentPage.set(1);
  }

  protected updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
  }

  protected updatePage(page: number): void {
    this.currentPage.set(page);
  }

  protected formatDate(isoDate: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoDate));
  }

  private showTimedFeedback(feedbackKey: string): void {
    this.clearFeedbackDismissTimeout();
    this.alertsStore.setFeedback(feedbackKey);
    this.feedbackDismissTimeoutId = window.setTimeout(() => {
      this.alertsStore.clearFeedback();
      this.feedbackDismissTimeoutId = null;
    }, this.feedbackDismissDelayMs);
  }

  private clearFeedbackDismissTimeout(): void {
    if (this.feedbackDismissTimeoutId === null) {
      return;
    }

    window.clearTimeout(this.feedbackDismissTimeoutId);
    this.feedbackDismissTimeoutId = null;
  }

  private matchesNotificationFilter(notification: Notification): boolean {
    switch (this.selectedNotificationFilter()) {
      case 'active':
        return Boolean(this.incidentForNotification(notification)?.isOpen);
      case 'pending':
        return notification.isPending;
      case 'failed':
        return notification.isFailed;
    }
  }

  private paginate<T>(items: T[], page: number): T[] {
    const pageCount = Math.max(Math.ceil(items.length / this.pageSize), 1);
    const currentPage = Math.min(Math.max(page, 1), pageCount);
    const startIndex = (currentPage - 1) * this.pageSize;

    return items.slice(startIndex, startIndex + this.pageSize);
  }
}
