import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, UrlTree } from '@angular/router';
import { AuthSessionStore } from './auth-session.store';

/**
 * @summary Protects dashboard routes that require a ColdTrace JWT session.
 */
export const authenticatedCanActivate: CanActivateFn = () => {
  return authenticatedOrSignIn();
};

/**
 * @summary Prevents lazy dashboard modules from loading without a ColdTrace JWT session.
 */
export const authenticatedCanMatch: CanMatchFn = () => {
  return authenticatedOrSignIn();
};

function authenticatedOrSignIn(): boolean | UrlTree {
  const authSession = inject(AuthSessionStore);
  const router = inject(Router);

  return authSession.token()
    ? true
    : router.createUrlTree(['/identity-access/sign-in']);
}
