// ============================================================================
// DUNITE CMS — Facebook integration types
// ============================================================================

export const FACEBOOK_GRAPH_VERSION = 'v19.0' as const;

export const FACEBOOK_OAUTH_SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
  'business_management',
] as const;

export type FacebookOAuthScope = (typeof FACEBOOK_OAUTH_SCOPES)[number];

export interface FacebookOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface FacebookUserProfile {
  id: string;
  name?: string;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
  link?: string;
  picture?: {
    data?: {
      url?: string;
      width?: number;
      height?: number;
      is_silhouette?: boolean;
    };
  };
  followers_count?: number;
  fan_count?: number;
}

export interface FacebookPagesResponse {
  data: FacebookPage[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
}

export interface FacebookGraphErrorShape {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface ConnectedFacebookPageResult {
  id: string;
  pageId: string;
  pageName: string;
}
