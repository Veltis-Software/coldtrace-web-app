import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize, forkJoin, switchMap, throwError } from 'rxjs';
import { IdentityAccessStore } from '../../../application/identity-access.store';
import { AssetManagementStore } from '../../../../asset-management/application/asset-management.store';
import { Organization } from '../../../domain/model/organization.entity';
import { Role } from '../../../domain/model/role.entity';
import { User } from '../../../domain/model/user.entity';
import { IdentityAccessApi } from '../../../infrastructure/identity-access-api';

type UserFormFeedback = 'idle' | 'duplicate-email' | 'invalid-role' | 'success' | 'server-error';

/**
 * @summary Presents the user form user interface in the identity access bounded context.
 */
@Component({
  selector: 'app-user-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './user-form.html',
  styleUrl: './user-form.css',
})
export class UserForm implements OnInit {
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  protected readonly assetManagementStore = inject(AssetManagementStore);
  private readonly fb = inject(FormBuilder);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly router = inject(Router);

  protected readonly submitted = signal(false);
  protected readonly creating = signal(false);
  protected readonly loading = signal(false);
  protected readonly feedback = signal<UserFormFeedback>('idle');
  protected readonly users = signal<User[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly organizations = signal<Organization[]>([]);

  protected readonly userForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    roleId: [0, [Validators.required, Validators.min(1)]],
  });

  protected readonly assignableRoles = computed(() =>
    this.roles().filter((role) => this.identityAccessStore.canAssignRole(role, this.users(), this.roles())),
  );
  protected readonly canManageAccess = computed(
    () => this.identityAccessStore.canManageUsers(this.users(), this.roles())
  );

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

  /**
   * @summary Initializes the user form view state.
   */
  ngOnInit(): void {
    this.loadFormData();
  }

  protected loadFormData(): void {
    this.loading.set(true);
    this.feedback.set('idle');
    this.assetManagementStore.loadAssets();

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
          this.selectDefaultRole();
        },
        error: () => this.feedback.set('server-error'),
      });
  }

  protected submit(): void {
    this.submitted.set(true);
    this.feedback.set('idle');
    this.userForm.markAllAsTouched();

    if (this.userForm.invalid) {
      return;
    }

    const roleId = Number(this.userForm.controls.roleId.value);
    const selectedRole = this.roles().find((role) => role.id === roleId);
    const organizationId = this.activeOrganizationId();

    if (
      !this.canManageAccess() ||
      !this.identityAccessStore.canAssignRole(selectedRole, this.users(), this.roles()) ||
      !organizationId
    ) {
      this.feedback.set('invalid-role');
      return;
    }

    const email = this.userForm.controls.email.value.trim().toLowerCase();
    const password = this.userForm.controls.password.value;
    const { firstName, lastName } = this.getNameParts(this.userForm.controls.fullName.value);

    this.creating.set(true);
    this.identityAccessApi
      .getUsers()
      .pipe(
        switchMap((users) => {
          const emailAlreadyExists = users.some((user) => user.email.toLowerCase() === email);
          if (emailAlreadyExists) {
            return throwError(() => new Error('duplicate-email'));
          }

          const nextId = Math.max(...users.map((user) => Number(user.id)), 0) + 1;
          const nextOrganizationUserId = Math.max(
            ...users
              .filter((user) => user.organizationId === organizationId)
              .map((user) => Number(user.organizationUserId)),
            0,
          ) + 1;
          return this.identityAccessApi.createUser(
            new User(
              nextId,
              firstName,
              lastName,
              email,
              organizationId,
              roleId,
              `USR-${nextId}`,
              nextOrganizationUserId,
            ),
            password,
          );
        }),
        finalize(() => this.creating.set(false)),
      )
      .subscribe({
        next: (user) => {
          this.users.update((users) => [...users, user]);
          this.feedback.set('success');
          this.submitted.set(false);
          this.userForm.reset({
            fullName: '',
            email: '',
            password: '',
            roleId: this.assignableRoles()[0]?.id ?? 0,
          });
        },
        error: (error) => {
          this.feedback.set(
            error.message === 'duplicate-email' ? 'duplicate-email' : 'server-error',
          );
        },
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

  protected hasControlError(controlName: keyof typeof this.userForm.controls): boolean {
    const control = this.userForm.controls[controlName];
    return control.invalid && (control.touched || this.submitted());
  }

  private selectDefaultRole(): void {
    const currentRoleId = Number(this.userForm.controls.roleId.value);
    const currentRole = this.assignableRoles().find((role) => role.id === currentRoleId);

    if (!currentRole) {
      this.userForm.controls.roleId.setValue(this.assignableRoles()[0]?.id ?? 0);
    }
  }

  private activeOrganizationId(): number | null {
    return this.identityAccessStore.currentOrganizationIdFrom(this.users());
  }

  private getNameParts(fullName: string): { firstName: string; lastName: string } {
    const [firstName, ...lastNameParts] = fullName.trim().replace(/\s+/g, ' ').split(' ');
    return {
      firstName,
      lastName: lastNameParts.join(' '),
    };
  }
}
