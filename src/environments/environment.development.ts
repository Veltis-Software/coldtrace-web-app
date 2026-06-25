export const environment = {
  production: false,
  platformProviderApiBaseUrl: 'http://localhost:8080',
  platformProviderAuthenticationEndpointPath: '/api/v1/authentication',
  platformProviderOrganizationsEndpointPath: '/organizations',
  platformProviderRolesEndpointPath: '/roles',
  platformProviderSignUpEndpointPath: '/organization-sign-ups',
  platformProviderSignInEndpointPath: '',
  platformProviderPasswordResetEndpointPath: '/password-reset-requests',
  googleOAuthClientId: '458208617776-jdce9bkfp960sd01v9d9tgj6ns3ca9j3.apps.googleusercontent.com',
  appleOAuthClientId: 'com.coldtrace.web',
  appleOAuthRedirectUri: 'https://coldtrace-frontend-liard.vercel.app/identity-access/sign-in',
};
