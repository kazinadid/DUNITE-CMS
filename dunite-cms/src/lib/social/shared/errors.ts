export class SocialPublishGateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SocialPublishGateError';
    this.code = code;
  }
}
