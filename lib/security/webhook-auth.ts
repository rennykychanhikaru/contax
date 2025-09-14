import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Configuration options for webhook signature validation
 */
export interface WebhookValidationOptions {
  /** The secret key used to generate the HMAC signature */
  secret: string;
  /** Maximum age of the timestamp in seconds (default: 300 seconds = 5 minutes) */
  maxAge?: number;
  /** Custom signature header name (default: 'x-signature') */
  signatureHeader?: string;
  /** Custom timestamp header name (default: 'x-timestamp') */
  timestampHeader?: string;
}

/**
 * Result of webhook validation
 */
export interface WebhookValidationResult {
  /** Whether the validation was successful */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: 'MISSING_SECRET' | 'MISSING_SIGNATURE' | 'MISSING_TIMESTAMP' | 'INVALID_TIMESTAMP' | 'TIMESTAMP_TOO_OLD' | 'INVALID_SIGNATURE';
}

/**
 * Validates webhook HMAC signature and timestamp to prevent replay attacks
 *
 * @param rawBody - The raw request body as a string
 * @param signature - The HMAC signature from the request headers
 * @param timestamp - The timestamp from the request headers
 * @param options - Validation configuration options
 * @returns WebhookValidationResult indicating success or failure with details
 */
export function validateWebhookSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  options: WebhookValidationOptions
): WebhookValidationResult {
  // Validate secret is provided
  if (!options.secret) {
    return {
      valid: false,
      error: 'Webhook secret is not configured',
      errorCode: 'MISSING_SECRET'
    };
  }

  // Validate signature is provided
  if (!signature) {
    return {
      valid: false,
      error: 'Missing webhook signature header',
      errorCode: 'MISSING_SIGNATURE'
    };
  }

  // Validate timestamp is provided
  if (!timestamp) {
    return {
      valid: false,
      error: 'Missing timestamp header',
      errorCode: 'MISSING_TIMESTAMP'
    };
  }

  // Parse and validate timestamp
  const timestampMs = parseInt(timestamp, 10);
  if (isNaN(timestampMs)) {
    return {
      valid: false,
      error: 'Invalid timestamp format',
      errorCode: 'INVALID_TIMESTAMP'
    };
  }

  // Check timestamp age (default: 5 minutes = 300 seconds)
  const maxAge = options.maxAge || 300;
  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = Math.floor(timestampMs / 1000);

  if (currentTime - requestTime > maxAge) {
    return {
      valid: false,
      error: `Timestamp too old. Request must be within ${maxAge} seconds`,
      errorCode: 'TIMESTAMP_TOO_OLD'
    };
  }

  // Create the payload to sign (timestamp + raw body)
  const payload = `${timestamp}.${rawBody}`;

  // Generate expected signature
  const expectedSignature = createHmac('sha256', options.secret)
    .update(payload, 'utf8')
    .digest('hex');

  // Remove any signature prefix (e.g., "sha256=")
  const cleanSignature = signature.replace(/^sha256=/, '');

  // Use timing-safe comparison to prevent timing attacks
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const receivedBuffer = Buffer.from(cleanSignature, 'hex');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return {
      valid: false,
      error: 'Invalid signature format',
      errorCode: 'INVALID_SIGNATURE'
    };
  }

  const isValid = timingSafeEqual(expectedBuffer, receivedBuffer);

  if (!isValid) {
    return {
      valid: false,
      error: 'Invalid webhook signature',
      errorCode: 'INVALID_SIGNATURE'
    };
  }

  return {
    valid: true
  };
}

/**
 * Generates a webhook signature for testing purposes
 *
 * @param rawBody - The raw request body as a string
 * @param timestamp - The timestamp as a string (Unix timestamp in milliseconds)
 * @param secret - The secret key
 * @returns The HMAC signature with 'sha256=' prefix
 */
export function generateWebhookSignature(
  rawBody: string,
  timestamp: string,
  secret: string
): string {
  const payload = `${timestamp}.${rawBody}`;
  const signature = createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return `sha256=${signature}`;
}

/**
 * Middleware helper to extract headers and validate webhook signature
 * Works with Next.js Request objects
 *
 * @param request - Next.js Request object
 * @param rawBody - The raw request body as a string
 * @param options - Validation configuration options
 * @returns WebhookValidationResult
 */
export function validateWebhookFromRequest(
  request: Request,
  rawBody: string,
  options: WebhookValidationOptions
): WebhookValidationResult {
  const signatureHeader = options.signatureHeader || 'x-signature';
  const timestampHeader = options.timestampHeader || 'x-timestamp';

  const signature = request.headers.get(signatureHeader);
  const timestamp = request.headers.get(timestampHeader);

  return validateWebhookSignature(rawBody, signature, timestamp, options);
}

/**
 * Type guard to check if a validation result indicates failure
 */
export function isValidationError(result: WebhookValidationResult): result is WebhookValidationResult & { error: string; errorCode: string } {
  return !result.valid;
}