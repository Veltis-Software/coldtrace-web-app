import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Notification } from '../domain/model/notification.entity';
import { NotificationAssembler } from './notification-assembler';
import { NotificationResource, NotificationsResponse } from './notifications-response';

/**
 * @summary Connects notifications API endpoint resources to the generic API endpoint contract.
 */
export class NotificationsApiEndpoint extends BaseApiEndpoint<
  Notification,
  NotificationResource,
  NotificationsResponse,
  NotificationAssembler
> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new NotificationAssembler());
  }

  /**
   * @summary Fetches notifications for the active organization.
   */
  override getAll(): Observable<Notification[]> {
    this.endpointUrl = this.organizationScope.endpointUrlFor('notifications');
    return super.getAll();
  }
}
