/** Canonical notification kinds (DB `notifications.type` — extend in migration + here). */
export type NotificationType =
  | 'publish_success'
  | 'publish_failure'
  | 'retry_scheduled'
  | 'retry_failed'
  | 'scheduling_conflict'
  | 'media_processing_issue'
  | 'media_library_removed'
  | 'role_change'
  | 'token_expiration'
  | 'system_warning'
  | (string & {});

export interface NotificationRow {
  id:            string;
  user_id:       string;
  type:          NotificationType;
  title:         string;
  message:       string;
  metadata:      Record<string, unknown> | null;
  read_at:       string | null;
  dismissed_at:  string | null;
  created_at:    string;
}

export interface RawNotificationRow {
  id:            string;
  user_id:       string;
  type:          string;
  title:         string;
  message:       string;
  metadata:      Record<string, unknown> | null;
  read_at:       string | null;
  dismissed_at:  string | null;
  created_at:    string;
}

export interface NotificationListParams {
  page:           number;
  pageSize:       number;
  /** Inbox only — hide rows user dismissed from the bell */
  includeDismissed?: boolean;
}
