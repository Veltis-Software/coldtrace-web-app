import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthSessionStore } from './auth-session.store';

/**
 * @summary Adds the ColdTrace JWT bearer token to backend API requests.
 */
export const bearerTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const authSession = inject(AuthSessionStore);
  const router = inject(Router);
  const token = authSession.token();
  const authenticationEndpointUrl =
    `${environment.platformProviderApiBaseUrl}${environment.platformProviderAuthenticationEndpointPath}`;

  if (
    !token ||
    !request.url.startsWith(environment.platformProviderApiBaseUrl) ||
    request.url.startsWith(authenticationEndpointUrl)
  ) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    }),
  ).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        authSession.clear();
        void router.navigate(['/identity-access/sign-in'], { replaceUrl: true });
      }

      return throwError(() => error);
    }),
  );
};
