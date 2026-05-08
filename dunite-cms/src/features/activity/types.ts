/** Entity rows written by database triggers (`activity_logs.entity_type`). */
export type ActivityEntityType =
  | 'post'
  | 'media'
  | 'post_platform'
  | 'user'
  | (string & {});

export interface ActivityLog {
  id:           string;
  user_id:      string | null;
  entity_type:  ActivityEntityType;
  entity_id:    string | null;
  action_type:  string;
  message:      string;
  metadata:     Record<string, unknown> | null;
  created_at:   string;
  actor:        {
    id:    string;
    name:  string | null;
    email: string;
  } | null;
}

export interface RawActivityRow {
  id:          string;
  user_id:     string | null;
  entity_type: string;
  entity_id:   string | null;
  action_type: string;
  message:     string;
  metadata:    Record<string, unknown> | null;
  created_at:  string;
  actor:       { id: string; name: string | null; email: string } | null;
}

export interface ActivityListFilters {
  query?:           string;
  userId?:          string | null;
  actionType?:      string | null;
  entityType?:      string | null;
  entityId?:        string | null;
  createdFromIso?:  string | null;
  createdToIso?:    string | null;
}

export interface ActivityListParams extends ActivityListFilters {
  page:     number;
  pageSize: number;
}
