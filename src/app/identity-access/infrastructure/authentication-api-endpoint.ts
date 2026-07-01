import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserAssembler } from './user-assembler';
import {
  AuthenticatedUser,
  AuthenticatedUserResource,
  SignInRequest,
  SocialIdentityProfile,
  SocialOrganizationSignUpRequest,
  SocialTokenExchangeRequest,
} from './authentication-response';

/**
 * @summary Connects authentication endpoints to identity access workflows.
 */
export class AuthenticationApiEndpoint {
  private readonly endpointUrl = `${environment.platformProviderApiBaseUrl}${environment.platformProviderAuthenticationEndpointPath}`;
  private readonly userAssembler = new UserAssembler();

  constructor(private http: HttpClient) {}

  signIn(request: SignInRequest): Observable<AuthenticatedUser> {
    return this.http
      .post<AuthenticatedUserResource>(`${this.endpointUrl}/sign-in`, request)
      .pipe(map((resource) => this.toAuthenticatedUser(resource)));
  }

  signInWithProvider(
    provider: 'google' | 'apple',
    request: SocialTokenExchangeRequest,
  ): Observable<AuthenticatedUser> {
    return this.http
      .post<AuthenticatedUserResource>(
        `${this.endpointUrl}/social/${provider}/token-exchange`,
        request,
      )
      .pipe(map((resource) => this.toAuthenticatedUser(resource)));
  }

  getSocialIdentityProfile(
    provider: 'google' | 'apple',
    request: SocialTokenExchangeRequest,
  ): Observable<SocialIdentityProfile> {
    return this.http.post<SocialIdentityProfile>(
      `${this.endpointUrl}/social/${provider}/profile-preview`,
      request,
    );
  }

  createSocialOrganizationSignUp(
    provider: 'google' | 'apple',
    request: SocialOrganizationSignUpRequest,
  ): Observable<AuthenticatedUser> {
    return this.http
      .post<AuthenticatedUserResource>(
        `${this.endpointUrl}/social/${provider}/organization-sign-up`,
        request,
      )
      .pipe(map((resource) => this.toAuthenticatedUser(resource)));
  }

  private toAuthenticatedUser(resource: AuthenticatedUserResource): AuthenticatedUser {
    return {
      user: this.userAssembler.toEntityFromResource(resource),
      token: resource.token,
    };
  }
}
