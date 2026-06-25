import { Component, NgZone, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize, forkJoin, map, switchMap } from 'rxjs';
import { AuthSessionStore } from '../../../../shared/infrastructure/auth-session.store';
import { IdentityAccessStore } from '../../../application/identity-access.store';
import { Organization } from '../../../domain/model/organization.entity';
import { Role } from '../../../domain/model/role.entity';
import { User } from '../../../domain/model/user.entity';
import {
  AuthenticatedUser,
  SocialIdentityProfile,
} from '../../../infrastructure/authentication-response';
import {
  AppleIdentityCredential,
  AppleIdentityService,
} from '../../../infrastructure/apple-identity.service';
import {
  GoogleIdentityCredential,
  GoogleIdentityService,
} from '../../../infrastructure/google-identity.service';
import { IdentityAccessApi } from '../../../infrastructure/identity-access-api';

type SignUpFeedback =
  | 'idle'
  | 'duplicate-email'
  | 'success'
  | 'server-error'
  | 'social-unavailable'
  | 'social-invalid';

type SocialProviderCode = 'google' | 'apple';

interface PendingSocialCredential {
  provider: SocialProviderCode;
  idToken?: string;
  authorizationCode?: string;
  redirectUri?: string;
  nonce?: string;
  email?: string;
}

interface SocialSignUpNavigationState {
  socialSignUp?: {
    provider?: SocialProviderCode;
    credential?: GoogleIdentityCredential | AppleIdentityCredential;
  };
}

interface SocialProfile {
  email: string;
  fullName: string;
}

/**
 * @summary Presents the sign up user interface in the identity access bounded context.
 */
@Component({
  selector: 'app-sign-up',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './sign-up.html',
  styleUrl: './sign-up.css',
})
export class SignUp {
  private readonly fb = inject(FormBuilder);
  private readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly authSession = inject(AuthSessionStore);
  private readonly appleIdentity = inject(AppleIdentityService);
  private readonly googleIdentity = inject(GoogleIdentityService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  protected readonly submitted = signal(false);
  protected readonly socialSubmitted = signal(false);
  protected readonly creating = signal(false);
  protected readonly socialCreating = signal(false);
  protected readonly passwordVisible = signal(false);
  protected readonly feedback = signal<SignUpFeedback>('idle');
  protected readonly pendingSocialCredential = signal<PendingSocialCredential | null>(null);

  protected readonly signUpForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.minLength(2)]],
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
    acceptedTerms: [true, [Validators.requiredTrue]],
  });

  protected readonly socialSignUpForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.minLength(2)]],
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    acceptedTerms: [true, [Validators.requiredTrue]],
  });

  constructor() {
    this.restoreSocialSignUpFromNavigation();
  }

  protected readonly passwordMismatch = computed(() => {
    const password = this.signUpForm.controls.password.value;
    const confirmation = this.signUpForm.controls.confirmPassword.value;
    return this.submitted() && !!confirmation && password !== confirmation;
  });

  protected submit(): void {
    this.submitted.set(true);
    this.feedback.set('idle');
    this.signUpForm.markAllAsTouched();

    if (this.signUpForm.invalid || this.passwordMismatch()) {
      return;
    }

    const email = this.signUpForm.controls.email.value.trim().toLowerCase();
    const password = this.signUpForm.controls.password.value;
    const organizationName = this.signUpForm.controls.organizationName.value.trim();
    const { firstName, lastName } = this.getNameParts(this.signUpForm.controls.fullName.value);

    this.creating.set(true);
    this.identityAccessApi
      .createOrganizationSignUp({
        legalName: organizationName,
        commercialName: organizationName,
        contactEmail: email,
        firstName,
        ...(lastName ? { lastName } : {}),
        email,
        password,
      })
      .pipe(
        switchMap(() => this.identityAccessApi.signIn({ email, password })),
        switchMap((authenticated) => this.loadAuthenticatedContext(authenticated)),
        finalize(() => this.creating.set(false)),
      )
      .subscribe({
        next: ({ authenticated, users, roles, organizations }) => {
          this.completeAuthenticatedSignUp(authenticated, users, roles, organizations);
          this.signUpForm.reset({
            organizationName: '',
            fullName: '',
            email: '',
            password: '',
            confirmPassword: '',
            acceptedTerms: true,
          });
        },
        error: (error) => this.handleSignUpError(error),
      });
  }

  protected submitSocialSignUp(): void {
    this.socialSubmitted.set(true);
    this.feedback.set('idle');
    this.socialSignUpForm.markAllAsTouched();

    const credential = this.pendingSocialCredential();
    if (!credential || (!credential.idToken && !credential.authorizationCode)) {
      this.feedback.set('social-unavailable');
      return;
    }

    if (this.socialSignUpForm.invalid) {
      return;
    }

    this.socialCreating.set(true);
    this.identityAccessApi
      .createSocialOrganizationSignUp(credential.provider, {
        ...(credential.idToken ? { idToken: credential.idToken } : {}),
        ...(credential.authorizationCode
          ? { authorizationCode: credential.authorizationCode }
          : {}),
        ...(credential.redirectUri ? { redirectUri: credential.redirectUri } : {}),
        ...(credential.nonce ? { nonce: credential.nonce } : {}),
        organizationName: this.socialSignUpForm.controls.organizationName.value.trim(),
        fullName: this.socialSignUpForm.controls.fullName.value.trim(),
      })
      .pipe(
        switchMap((authenticated) => this.loadAuthenticatedContext(authenticated)),
        finalize(() => this.socialCreating.set(false)),
      )
      .subscribe({
        next: ({ authenticated, users, roles, organizations }) => {
          this.completeAuthenticatedSignUp(authenticated, users, roles, organizations);
          this.socialSignUpForm.reset({
            organizationName: '',
            fullName: '',
            acceptedTerms: true,
          });
        },
        error: (error) => this.handleSignUpError(error),
      });
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected hasControlError(controlName: keyof typeof this.signUpForm.controls): boolean {
    const control = this.signUpForm.controls[controlName];
    return control.invalid && (control.touched || this.submitted());
  }

  protected hasSocialControlError(
    controlName: keyof typeof this.socialSignUpForm.controls,
  ): boolean {
    const control = this.socialSignUpForm.controls[controlName];
    return control.invalid && (control.touched || this.socialSubmitted());
  }

  protected signUpWithGoogle(): void {
    this.feedback.set('idle');
    this.googleIdentity.signIn(
      (credential) => this.zone.run(() => this.startGoogleSignUp(credential)),
      () => this.zone.run(() => this.feedback.set('social-unavailable')),
    );
  }

  protected signUpWithApple(): void {
    this.feedback.set('idle');
    this.appleIdentity.signIn(
      (credential) => this.zone.run(() => this.startAppleSignUp(credential)),
      () => this.zone.run(() => this.feedback.set('social-unavailable')),
    );
  }

  protected cancelSocialSignUp(): void {
    this.pendingSocialCredential.set(null);
    this.socialSubmitted.set(false);
    this.feedback.set('idle');
    this.socialSignUpForm.reset({
      organizationName: '',
      fullName: '',
      acceptedTerms: true,
    });
  }

  private startGoogleSignUp(credential: GoogleIdentityCredential): void {
    this.creating.set(true);
    this.identityAccessApi
      .getSocialIdentityProfile('google', {
        ...(credential.idToken ? { idToken: credential.idToken } : {}),
        ...(credential.authorizationCode
          ? { authorizationCode: credential.authorizationCode }
          : {}),
        ...(credential.redirectUri ? { redirectUri: credential.redirectUri } : {}),
        ...(credential.nonce ? { nonce: credential.nonce } : {}),
      })
      .pipe(finalize(() => this.creating.set(false)))
      .subscribe({
        next: (profile) => this.openGoogleSocialSignUp(credential, profile),
        error: (error) => this.handleSignUpError(error),
      });
  }

  private openGoogleSocialSignUp(
    credential: GoogleIdentityCredential,
    profile: SocialIdentityProfile,
  ): void {
    const email = profile.email.trim().toLowerCase();
    const fullName = profile.fullName.trim() || this.suggestNameFromEmail(email);

    this.pendingSocialCredential.set({
      provider: 'google',
      idToken: profile.idToken || credential.idToken,
      ...(credential.nonce ? { nonce: credential.nonce } : {}),
      ...(email ? { email } : {}),
    });
    this.socialSubmitted.set(false);
    this.feedback.set('idle');
    this.socialSignUpForm.reset({
      organizationName: '',
      fullName,
      acceptedTerms: true,
    });
  }

  private startAppleSignUp(credential: AppleIdentityCredential): void {
    const profile = this.getAppleSocialProfile(credential);

    if (!profile.email) {
      this.feedback.set('social-invalid');
      return;
    }

    this.pendingSocialCredential.set({
      provider: 'apple',
      ...(credential.idToken ? { idToken: credential.idToken } : {}),
      ...(credential.authorizationCode ? { authorizationCode: credential.authorizationCode } : {}),
      ...(credential.redirectUri ? { redirectUri: credential.redirectUri } : {}),
      ...(credential.nonce ? { nonce: credential.nonce } : {}),
      email: profile.email,
    });
    this.socialSubmitted.set(false);
    this.feedback.set('idle');
    this.socialSignUpForm.reset({
      organizationName: '',
      fullName: profile.fullName,
      acceptedTerms: true,
    });
  }

  private restoreSocialSignUpFromNavigation(): void {
    const navigationState = (this.router.getCurrentNavigation()?.extras.state ??
      window.history.state) as SocialSignUpNavigationState;
    const socialSignUp = navigationState.socialSignUp;

    if (!socialSignUp?.provider || !socialSignUp.credential) {
      return;
    }

    if (!this.hasSocialAuthorization(socialSignUp.credential)) {
      return;
    }

    if (socialSignUp.provider === 'google') {
      this.startGoogleSignUp(socialSignUp.credential as GoogleIdentityCredential);
      this.clearSocialSignUpNavigationState();
      return;
    }

    if (socialSignUp.provider === 'apple') {
      this.startAppleSignUp(socialSignUp.credential as AppleIdentityCredential);
      this.clearSocialSignUpNavigationState();
    }
  }

  private hasSocialAuthorization(
    credential: GoogleIdentityCredential | AppleIdentityCredential,
  ): boolean {
    return !!credential.idToken || !!credential.authorizationCode;
  }

  private clearSocialSignUpNavigationState(): void {
    const historyState = { ...window.history.state };
    delete historyState.socialSignUp;
    window.history.replaceState(historyState, '');
  }

  private completeAuthenticatedSignUp(
    authenticated: AuthenticatedUser,
    users: User[],
    roles: Role[],
    organizations: Organization[],
  ): void {
    const usersWithAuthenticated = this.ensureAuthenticatedUser(users, authenticated.user);
    this.authSession.setToken(authenticated.token);
    this.identityAccessStore.setCurrentUser(authenticated.user);
    this.identityAccessStore.setCurrentContextFrom(usersWithAuthenticated, roles, organizations);
    this.feedback.set('success');
    this.submitted.set(false);
    this.socialSubmitted.set(false);
    this.pendingSocialCredential.set(null);
    void this.router.navigate(['/identity-access/dashboard'], {
      queryParams: {
        organizationId: authenticated.user.organizationId,
        userId: authenticated.user.id,
      },
    });
  }

  private loadAuthenticatedContext(authenticated: AuthenticatedUser) {
    this.authSession.setToken(authenticated.token);
    return forkJoin({
      users: this.identityAccessApi.getUsersForOrganization(authenticated.user.organizationId),
      roles: this.identityAccessApi.getRoles(),
      organizations: this.identityAccessApi.getOrganizations(),
    }).pipe(map((context) => ({ ...context, authenticated })));
  }

  private ensureAuthenticatedUser(users: User[], authenticatedUser: User): User[] {
    if (users.some((user) => user.id === authenticatedUser.id)) {
      return users;
    }
    return [...users, authenticatedUser];
  }

  private handleSignUpError(error: { status?: number; error?: { code?: string } }): void {
    if (error.status === 409 || error.error?.code?.endsWith('_CONFLICT')) {
      this.feedback.set('duplicate-email');
      return;
    }

    if (error.status === 401 || error.error?.code === 'PROVIDER_VALIDATION_FAILED') {
      this.feedback.set('social-invalid');
      return;
    }

    if (error.status === 503 || error.error?.code === 'SOCIAL_PROVIDER_CONFIGURATION_MISSING') {
      this.feedback.set('social-unavailable');
      return;
    }

    this.feedback.set('server-error');
  }

  private getNameParts(fullName: string): { firstName: string; lastName: string } {
    const [firstName, ...lastNameParts] = fullName.trim().replace(/\s+/g, ' ').split(' ');
    return {
      firstName,
      lastName: lastNameParts.join(' '),
    };
  }

  private getSocialProfileFromIdToken(idToken: string): SocialProfile {
    try {
      const claims = this.decodeJwtPayload(idToken);
      const email = this.getTextClaim(claims, 'email').toLowerCase();
      const fullName =
        this.getTextClaim(claims, 'name') ||
        [this.getTextClaim(claims, 'given_name'), this.getTextClaim(claims, 'family_name')]
          .filter(Boolean)
          .join(' ') ||
        this.suggestNameFromEmail(email);

      return { email, fullName };
    } catch {
      return { email: '', fullName: '' };
    }
  }

  private getAppleSocialProfile(credential: AppleIdentityCredential): SocialProfile {
    const tokenProfile = credential.idToken
      ? this.getSocialProfileFromIdToken(credential.idToken)
      : { email: '', fullName: '' };
    const email = (credential.email || tokenProfile.email).trim().toLowerCase();
    const fullName =
      credential.fullName || tokenProfile.fullName || this.suggestNameFromEmail(email);

    return { email, fullName };
  }

  private decodeJwtPayload(idToken: string): Record<string, unknown> {
    const payload = idToken.split('.')[1];
    if (!payload) {
      throw new Error('Invalid ID token');
    }
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  }

  private getTextClaim(claims: Record<string, unknown>, key: string): string {
    const value = claims[key];
    return typeof value === 'string' ? value.trim() : '';
  }

  private suggestNameFromEmail(email: string): string {
    const localPart = email.split('@')[0] ?? '';
    return localPart
      .replace(/[._-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
