import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthSessionStore } from './auth-session.store';

/**
 * @summary Adds the ColdTrace JWT bearer token to backend API requests.
 */
export const bearerTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const authSession = inject(AuthSessionStore);
  const token = authSession.token();

  if (!token || !request.url.startsWith(environment.platformProviderApiBaseUrl)) {
    return next(request);
  }

  return next(request.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  }));
};
