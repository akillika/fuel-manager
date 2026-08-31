export const DEMO_MODE =
  import.meta.env.VITE_DEV_DEMO === 'true' ||
  import.meta.env.VITE_DEV_DEMO === '1';

export const DEMO_USER = {
  uid: 'demo-user',
  displayName: 'Akil',
  email: 'akil@akil.codes',
  emailVerified: true,
  isAnonymous: false,
  photoURL: null,
  providerId: 'demo',
  metadata: {},
  providerData: [],
  refreshToken: '',
  tenantId: null,
  delete: async () => {},
  getIdToken: async () => 'demo-token',
  getIdTokenResult: async () => ({} as any),
  reload: async () => {},
  toJSON: () => ({}),
  phoneNumber: null,
} as any;
