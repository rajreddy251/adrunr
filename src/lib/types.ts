export type AdsAccount = {
  customerId: string;
  descriptiveName: string;
  formattedId: string;
  manager: boolean;
  status: string;
  testAccount: boolean;
  level: number | null;
  warning: string | null;
};

export type ConnectionStatus = {
  connected: boolean;
  mockMode: boolean;
  email: string | null;
  source: "oauth" | "env" | "mock" | null;
  oauthConfigured: boolean;
  adsConfigured: boolean;
  loginCustomerId: string;
  ga4PropertyId: string | null;
  scopes: string[];
};
