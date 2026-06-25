import { Component, NgZone, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize, forkJoin } from 'rxjs';
import { AuthSessionStore } from '../../../../shared/infrastructure/auth-session.store';
import { IdentityAccessStore } from '../../../application/identity-access.store';
import { User } from '../../../domain/model/user.entity';
import { AuthenticatedUser } from '../../../infrastructure/authentication-response';
import { AppleIdentityCredential, AppleIdentityService } from '../../../infrastructure/apple-identity.service';
import { GoogleIdentityCredential, GoogleIdentityService } from '../../../infrastructure/google-identity.service';
import { IdentityAccessApi } from '../../../infrastructure/identity-access-api';

type SignInFeedback =
  | 'idle'
  | 'invalid-credentials'
  | 'revoked-access'
  | 'success'
  | 'server-error'
  | 'onboarding-required'
  | 'social-unavailable';

type SocialProviderCode = 'google' | 'apple';

/**
 * @summary Presents the sign in user interface in the identity access bounded context.
 */
@Component({
  selector: 'app-sign-in',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.css',
})
export class SignIn {
  private readonly fb = inject(FormBuilder);
  private readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly authSession = inject(AuthSessionStore);
  private readonly appleIdentity = inject(AppleIdentityService);
  private readonly googleIdentity = inject(GoogleIdentityService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  protected readonly submitted = signal(false);
  protected readonly signingIn = signal(false);
  protected readonly passwordVisible = signal(false);
  protected readonly feedback = signal<SignInFeedback>('idle');
  protected readonly pendingSocialOnboardingProvider = signal<SocialProviderCode | null>(null);

  protected readonly signInForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected submit(): void {
    this.submitted.set(true);
    this.feedback.set('idle');
    this.pendingSocialOnboardingProvider.set(null);
    this.signInForm.markAllAsTouched();

    if (this.signInForm.invalid) {
      return;
    }

    const email = this.signInForm.controls.email.value.trim().toLowerCase();
    const password = this.signInForm.controls.password.value;

    this.signingIn.set(true);
    this.identityAccessApi.signIn({ email, password }).subscribe({
      next: (authenticated) => this.completeAuthenticatedSignIn(authenticated),
      error: (error) => this.handleAuthenticationError(error),
    });
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected hasControlError(controlName: keyof typeof this.signInForm.controls): boolean {
    const control = this.signInForm.controls[controlName];
    return control.invalid && (control.touched || this.submitted());
  }

  protected signInWithApple(): void {
    this.feedback.set('idle');
    this.pendingSocialOnboardingProvider.set(null);
    this.appleIdentity.signIn(
      (credential) => this.zone.run(() => this.signInWithAppleCredential(credential)),
      () => this.zone.run(() => this.feedback.set('social-unavailable')),
    );
  }

  protected signInWithGoogle(): void {
    this.feedback.set('idle');
    this.pendingSocialOnboardingProvider.set(null);
    this.googleIdentity.signIn(
      (credential) => this.zone.run(() => this.signInWithGoogleCredential(credential)),
      () => this.zone.run(() => this.feedback.set('social-unavailable')),
    );
  }

  protected continueWithSocialSignUp(): void {
    const provider = this.pendingSocialOnboardingProvider();
    if (!provider) {
      return;
    }

    this.signingIn.set(true);

    if (provider === 'google') {
      this.googleIdentity.signIn(
        (credential) => this.zone.run(() => this.openSocialSignUp('google', credential)),
        () => this.zone.run(() => this.handleSocialAuthorizationUnavailable()),
      );
      return;
    }

    this.appleIdentity.signIn(
      (credential) => this.zone.run(() => this.openSocialSignUp('apple', credential)),
      () => this.zone.run(() => this.handleSocialAuthorizationUnavailable()),
    );
  }

  protected chooseAnotherSocialAccount(): void {
    const provider = this.pendingSocialOnboardingProvider();
    this.feedback.set('idle');
    this.pendingSocialOnboardingProvider.set(null);

    if (provider === 'google') {
      this.signInWithGoogle();
      return;
    }

    if (provider === 'apple') {
      this.signInWithApple();
    }
  }

  private signInWithGoogleCredential(credential: GoogleIdentityCredential): void {
    this.feedback.set('idle');
    this.pendingSocialOnboardingProvider.set(null);
    this.signingIn.set(true);
    this.identityAccessApi.signInWithGoogle({
      ...(credential.idToken ? { idToken: credential.idToken } : {}),
      ...(credential.authorizationCode ? { authorizationCode: credential.authorizationCode } : {}),
      ...(credential.redirectUri ? { redirectUri: credential.redirectUri } : {}),
      ...(credential.nonce ? { nonce: credential.nonce } : {}),
    }).subscribe({
      next: (authenticated) => this.completeAuthenticatedSignIn(authenticated),
      error: (error) => this.handleAuthenticationError(error, 'google'),
    });
  }

  private signInWithAppleCredential(credential: AppleIdentityCredential): void {
    this.feedback.set('idle');
    this.pendingSocialOnboardingProvider.set(null);
    this.signingIn.set(true);
    this.identityAccessApi.signInWithApple({
      ...(credential.idToken ? { idToken: credential.idToken } : {}),
      ...(credential.authorizationCode ? { authorizationCode: credential.authorizationCode } : {}),
      ...(credential.redirectUri ? { redirectUri: credential.redirectUri } : {}),
      ...(credential.nonce ? { nonce: credential.nonce } : {}),
    }).subscribe({
      next: (authenticated) => this.completeAuthenticatedSignIn(authenticated),
      error: (error) => this.handleAuthenticationError(error, 'apple'),
    });
  }

  private openSocialSignUp(
    provider: SocialProviderCode,
    credential: GoogleIdentityCredential | AppleIdentityCredential,
  ): void {
    this.signingIn.set(false);
    this.feedback.set('idle');
    this.pendingSocialOnboardingProvider.set(null);
    void this.router.navigate(['/identity-access/sign-up'], {
      state: {
        socialSignUp: {
          provider,
          credential,
        },
      },
    });
  }

  private completeAuthenticatedSignIn(authenticated: AuthenticatedUser): void {
    this.authSession.setToken(authenticated.token);

    forkJoin({
      users: this.identityAccessApi.getUsersForOrganization(authenticated.user.organizationId),
      roles: this.identityAccessApi.getRoles(),
      organizations: this.identityAccessApi.getOrganizations(),
    })
      .pipe(finalize(() => this.signingIn.set(false)))
      .subscribe({
        next: ({ users, roles, organizations }) => {
          const usersWithAuthenticated = this.ensureAuthenticatedUser(users, authenticated.user);
          this.identityAccessStore.setCurrentUser(authenticated.user);
          this.identityAccessStore.setCurrentContextFrom(usersWithAuthenticated, roles, organizations);
          this.feedback.set('success');
          this.submitted.set(false);
          void this.router.navigate(['/identity-access/dashboard'], {
            queryParams: {
              organizationId: authenticated.user.organizationId,
              userId: authenticated.user.id,
            },
          });
        },
        error: () => this.handleServerError(),
      });
  }

  private ensureAuthenticatedUser(users: User[], authenticatedUser: User): User[] {
    if (users.some((user) => user.id === authenticatedUser.id)) {
      return users;
    }
    return [...users, authenticatedUser];
  }

  private handleAuthenticationError(
    error: { status?: number; error?: { code?: string } },
    provider?: SocialProviderCode,
  ): void {
    this.signingIn.set(false);

    if (error.status === 401) {
      this.feedback.set('invalid-credentials');
      return;
    }

    if (error.status === 422 || error.error?.code === 'SOCIAL_IDENTITY_REQUIRES_ONBOARDING') {
      this.feedback.set('onboarding-required');
      this.pendingSocialOnboardingProvider.set(provider ?? null);
      return;
    }

    if (error.status === 503 || error.error?.code === 'SOCIAL_PROVIDER_CONFIGURATION_MISSING') {
      this.feedback.set('social-unavailable');
      return;
    }

    this.feedback.set('server-error');
  }

  private handleSocialAuthorizationUnavailable(): void {
    this.signingIn.set(false);
    this.feedback.set('social-unavailable');
  }

  private handleServerError(): void {
    this.signingIn.set(false);
    this.feedback.set('server-error');
  }
}
