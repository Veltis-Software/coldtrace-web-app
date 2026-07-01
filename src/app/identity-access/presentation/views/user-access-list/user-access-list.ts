import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize, forkJoin } from 'rxjs';
import { ListPagination } from '../../../../shared/presentation/components/list-pagination/list-pagination';
import { IdentityAccessStore } from '../../../application/identity-access.store';
import { AssetManagementStore } from '../../../../asset-management/application/asset-management.store';
import { Organization } from '../../../domain/model/organization.entity';
import { Role } from '../../../domain/model/role.entity';
import { User } from '../../../domain/model/user.entity';
import { IdentityAccessApi } from '../../../infrastructure/identity-access-api';

type UserAccessFeedback =
  | 'idle'
  | 'saved'
  | 'invalid-role'
  | 'server-error';

interface UserAccessRow {
  user: User;
  currentRole?: Role;
  selectedRole?: Role;
  selectedRoleId: number;
  permissionKeys: string[];
  pending: boolean;
}

/**
 * @summary Presents the user access list user interface in the identity access bounded context.
 */
@Component({
  selector: 'app-user-access-list',
  imports: [MatIcon, RouterLink, TranslatePipe, ListPagination],
  templateUrl: './user-access-list.html',
  styleUrl: './user-access-list.css',
})
export class UserAccessList implements OnInit {
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  protected readonly assetManagementStore = inject(AssetManagementStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly accessDenied = signal(false);
  protected readonly feedback = signal<UserAccessFeedback>('idle');
  protected readonly savedUserId = signal<number | null>(null);
  protected readonly invalidUserId = signal<number | null>(null);
  protected readonly searchTerm = signal('');
  protected readonly pageSize = 10;
  protected readonly currentPage = signal(1);
  protected readonly users = signal<User[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly organizations = signal<Organization[]>([]);
  protected readonly selectedRoleByUserId = signal<Record<number, number>>({});
  protected readonly organizationUsers = computed(() => {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      return [];
    }

    return this.users().filter((user) => user.organizationId === organizationId);
  });

  protected readonly rows = computed(() => {
    const normalizedSearch = this.searchTerm().trim().toLowerCase();
    return this.organizationUsers()
      .map((user) => this.toUserAccessRow(user))
      .filter((row) => {
        if (!normalizedSearch) {
          return true;
        }

        return [row.user.fullName, row.user.email, row.currentRole?.label, row.selectedRole?.label]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      });
  });

  protected readonly paginatedRows = computed(() => {
    const startIndex = (this.currentPage() - 1) * this.pageSize;
    return this.rows().slice(startIndex, startIndex + this.pageSize);
  });

  protected readonly administratorCount = computed(
    () =>
      this.organizationUsers().filter((user) => {
        const role = this.roleFor(user.roleId);
        return (
          this.identityAccessStore.isSuperAdministratorRole(role) ||
          this.identityAccessStore.isAdministratorRole(role)
        );
      }).length,
  );

  protected readonly activeOrganizationName = computed(() => {
    return this.identityAccessStore.currentOrganizationNameFrom(this.users(), this.organizations());
  });
  protected readonly profileUserName = computed(() =>
    this.identityAccessStore.currentUserNameFrom(this.users()),
  );
  protected readonly profileRoleLabelKey = computed(() =>
    this.identityAccessStore.currentRoleLabelKeyFrom(this.users(), this.roles()),
  );
  protected readonly canManageAccess = computed(() =>
    this.identityAccessStore.canManageUsers(this.users(), this.roles()),
  );

  protected readonly pendingChangeCount = computed(
    () =>
      Object.keys(this.selectedRoleByUserId()).filter((userId) => {
        const user = this.organizationUsers().find(
          (currentUser) => currentUser.id === Number(userId),
        );
        return user && this.selectedRoleByUserId()[Number(userId)] !== user.roleId;
      }).length,
  );

  protected readonly assetIssueCount = computed(() => {
    return this.assetManagementStore.assetIssueCountFor(this.activeOrganizationId());
  });

  /**
   * @summary Initializes the user access list view state.
   */
  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.accessDenied.set(params.get('access') === 'denied');
    });
    this.loadAccessData();
  }

  protected selectRole(userId: number, roleId: string): void {
    const nextRoleId = Number(roleId);
    const user = this.organizationUsers().find((currentUser) => currentUser.id === userId);
    const selectedRole = this.roleFor(nextRoleId);

    if (
      !user ||
      !selectedRole ||
      !this.identityAccessStore.canManageUserRole(user, this.users(), this.roles()) ||
      !this.identityAccessStore.canAssignRole(selectedRole, this.users(), this.roles())
    ) {
      return;
    }

    this.feedback.set('idle');
    this.savedUserId.set(null);
    this.invalidUserId.set(null);
    this.selectedRoleByUserId.update((current) => ({
      ...current,
      [userId]: nextRoleId,
    }));
  }

  protected saveRole(user: User): void {
    const nextRoleId = this.selectedRoleByUserId()[user.id] ?? user.roleId;
    const selectedRole = this.roleFor(nextRoleId);

    if (
      !selectedRole ||
      !this.identityAccessStore.canManageUserRole(user, this.users(), this.roles()) ||
      !this.identityAccessStore.canAssignRole(selectedRole, this.users(), this.roles())
    ) {
      this.feedback.set('invalid-role');
      this.invalidUserId.set(user.id);
      this.savedUserId.set(null);
      return;
    }

    const updatedUser = new User(
      user.id,
      user.firstName,
      user.lastName,
      user.email,
      user.organizationId,
      nextRoleId,
      user.uuid,
      user.organizationUserId,
    );

    this.identityAccessApi.updateUser(updatedUser).subscribe({
      next: (savedUser) => {
        this.users.update((users) =>
          users.map((currentUser) => {
            return currentUser.id === savedUser.id ? savedUser : currentUser;
          }),
        );
        this.selectedRoleByUserId.update((current) => {
          const next = { ...current };
          delete next[user.id];
          return next;
        });
        this.feedback.set('saved');
        this.savedUserId.set(user.id);
        this.invalidUserId.set(null);
      },
      error: () => {
        this.feedback.set('server-error');
        this.savedUserId.set(null);
        this.invalidUserId.set(user.id);
      },
    });
  }

  protected roleLabelKey(role?: Role): string {
    if (!role) {
      return 'roles-permissions.roles.unassigned';
    }

    return `roles-permissions.roles.${role.name}`;
  }

  protected canManageUserRole(user?: User): boolean {
    return this.identityAccessStore.canManageUserRole(user, this.users(), this.roles());
  }

  protected isRoleOptionDisabled(role: Role): boolean {
    return !this.identityAccessStore.canAssignRole(role, this.users(), this.roles());
  }

  protected updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
  }

  protected updatePage(page: number): void {
    this.currentPage.set(page);
  }

  protected loadAccessData(): void {
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

  protected logout(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  private toUserAccessRow(user: User): UserAccessRow {
    const selectedRoleId = this.selectedRoleByUserId()[user.id] ?? user.roleId;
    const currentRole = this.roleFor(user.roleId);
    const selectedRole = this.roleFor(selectedRoleId);

    return {
      user,
      currentRole,
      selectedRole,
      selectedRoleId,
      permissionKeys: this.identityAccessStore.permissionKeysForRole(selectedRole ?? currentRole),
      pending: selectedRoleId !== user.roleId,
    };
  }

  private activeOrganizationId(): number | null {
    return this.identityAccessStore.currentOrganizationIdFrom(this.users());
  }

  private pageCountFor(total: number): number {
    return Math.max(Math.ceil(total / this.pageSize), 1);
  }

  private roleFor(roleId: number): Role | undefined {
    return this.roles().find((role) => role.id === roleId);
  }
}
