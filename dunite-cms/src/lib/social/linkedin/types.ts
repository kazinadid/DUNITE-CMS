export type {
  PublishPostParams,
  PublishResult,
  TokenHealthSummary,
  WorkflowPublishStatus,
  FailureType,
} from '../shared/types';

export type PublishLinkedInFormat = 'text' | 'image';

export interface LinkedInPublishContext {
  postId: string;
  socialAccountId: string;
  gate: {
    userId: string;
    organizationId: string;
  };
}

export interface LinkedInOrganization {
  id: string;          // organization URN (e.g., urn:li:organization:123456)
  name: string;
  logo_url: string | null;
  localizedName: string;
  vanityName: string | null;
}

export interface LinkedInMediaAsset {
  asset: string;       // urn:li:image:C-xxxxx
  status: string;      // READY, PROCESSING, FAILED
}

export interface LinkedInUGCPostResponse {
  id: string;          // urn:li:share:xxxxx
}

export interface LinkedInUploadRegistrationResponse {
  value: {
    uploadMechanism: {
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
        uploadUrl: string;
        headers?: Record<string, string>;
      };
    };
    asset: string;
    assetRealizedTraits: Record<string, unknown>;
  };
}

export interface LinkedInAssetStatusResponse {
  status: string;
  mediaType: string;
  asset: string;
}

export type {
  LinkedInPublishBody,
  LinkedInScheduleBody,
  LinkedInRetryBody,
  LinkedInCancelBody,
} from './validator';
