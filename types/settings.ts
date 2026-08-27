export type MailPreferences = {
  autoTriage: boolean;
  writingStyle: string;
  signature: string;
  undoSendSeconds: number;
  notificationsEnabled: boolean;
};

export type MailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

export type MailRule = {
  id: string;
  name: string;
  senderContains: string;
  subjectContains: string;
  labelId: string;
  enabled: boolean;
};

export type MailSettingsData = {
  databaseReady: boolean;
  preferences: MailPreferences;
  templates: MailTemplate[];
  rules: MailRule[];
  vapidPublicKey: string;
};

export type MailSettingsResponse =
  | { success: true; data: MailSettingsData }
  | { success: false; error: string };
