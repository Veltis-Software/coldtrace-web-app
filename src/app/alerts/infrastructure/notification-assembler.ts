import { BaseAssembler } from '../../shared/infrastructure/base-assembler';
import { Notification } from '../domain/model/notification.entity';
import { NotificationResource, NotificationsResponse } from './notifications-response';

/**
 * @summary Maps notification data between domain entities and API resources.
 */
export class NotificationAssembler implements BaseAssembler<Notification, NotificationResource, NotificationsResponse> {
  /**
   * @summary Maps one API resource into a domain entity.
   */
  toEntityFromResource(resource: NotificationResource): Notification {
    return new Notification(
      Number(resource.id),
      resource.organizationId,
      resource.incidentId,
      resource.assetName ?? '',
      resource.channel,
      resource.recipient,
      resource.message,
      resource.status,
      resource.createdAt,
      resource.deliveredAt ?? null,
      resource.failureReason ?? null,
    );
  }

  /**
   * @summary Maps one domain entity into an API resource.
   */
  toResourceFromEntity(entity: Notification): NotificationResource {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      incidentId: entity.incidentId,
      assetName: entity.assetName,
      channel: entity.channel,
      recipient: entity.recipient,
      message: entity.message,
      status: entity.status,
      createdAt: entity.createdAt,
      deliveredAt: entity.deliveredAt,
      failureReason: entity.failureReason,
    };
  }

  /**
   * @summary Maps an API response envelope into domain entities.
   */
  toEntitiesFromResponse(response: NotificationsResponse): Notification[] {
    return response.notifications.map((notification) => this.toEntityFromResource(notification));
  }
}
