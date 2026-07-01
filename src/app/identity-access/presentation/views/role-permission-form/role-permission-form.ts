import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize, forkJoin } from 'rxjs';
import { IdentityAccessStore } from '../../../application/identity-access.store';
import { AssetManagementStore } from '../../../../asset-management/application/asset-management.store';
import { Organization } from '../../../domain/model/organization.entity';
import { Role } from '../../../domain/model/role.entity';
import { User } from '../../../domain/model/user.entity';
import { IdentityAccessApi } from '../../../infrastructure/identity-access-api';
import { ListPagination } from '../../../../shared/presentation/components/list-pagination/list-pagination';

type RolePermissionFeedback = 'idle' | 'server-error';

/**
 * @summary Presents the role permission form user interface in the identity access bounded context.
 */
@Component({
  selector: 'app-role-permission-form',
  imports: [MatButton, TranslatePipe, ListPagination],
  templateUrl: './role-permission-form.html',
  styleUrl: './role-permission-form.css',
})
export class RolePermissionForm implements OnInit {
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  protected readonly assetManagementStore = inject(AssetManagementStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly feedback = signal<RolePermissionFeedback>('idle');
  protected readonly pageSize = 10;
  protected readonly currentPage = signal(1);
  protected readonly roles = signal<Role[]>([]);
  protected readonly users = signal<User[]>([]);
  protected readonly organizations = signal<Organization[]>([]);

  protected readonly activeOrganizationName = computed(() => {
    return this.identityAccessStore.currentOrganizationNameFrom(this.users(), this.organizations());
  });
  protected readonly profileUserName = computed(() => this.identityAccessStore.currentUserNameFrom(this.users()));
  protected readonly profileRoleLabelKey = computed(
    () => this.identityAccessStore.currentRoleLabelKeyFrom(this.users(), this.roles())
  );
  protected readonly assetIssueCount = computed(() => {
    return this.assetManagementStore.assetIssueCountFor(this.activeOrganizationId());
  });
  protected readonly paginatedRoles = computed(() => {
    const startIndex = (this.currentPage() - 1) * this.pageSize;

    return this.roles().slice(startIndex, startIndex + this.pageSize);
  });

  /**
   * @summary Initializes the role permission form view state.
   */
  ngOnInit(): void {
    this.loadRoles();
  }

  protected loadRoles(): void {
    this.loading.set(true);
    this.feedback.set('idle');

    forkJoin({
      users: this.identityAccessApi.getUsers(),
      roles: this.identityAccessApi.getRoles(),
      organizations: this.identityAccessApi.getOrganizations(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ users, roles, organizations }) => {
          this.users.set(users);
          this.roles.set(roles);
          this.organizations.set(organizations);
          this.identityAccessStore.setCurrentContextFrom(users, roles, organizations);
        },
        error: () => this.feedback.set('server-error'),
      });
  }

  protected roleLabelKey(role?: Role): string {
    if (!role) {
      return 'roles-permissions.roles.unassigned';
    }

    return `roles-permissions.roles.${role.name}`;
  }

  protected logout(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  protected updatePage(page: number): void {
    this.currentPage.set(page);
  }

  private activeOrganizationId(): number | null {
    return this.identityAccessStore.currentOrganizationIdFrom(this.users());
  }
}
