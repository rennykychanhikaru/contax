import { NextResponse } from 'next/server';

/**
 * Standard error codes for API responses
 */
export const ERROR_CODES = {
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  RATE_LIMITED: 'RATE_LIMITED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Server errors (5xx)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const;

/**
 * HTTP status codes mapped to error types
 */
export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  RATE_LIMITED: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Base API error interface
 */
export interface ApiErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  path?: string;
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * API Error class for structured error handling
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: string | ApiError,
  statusCode?: number,
  details?: Record<string, unknown>,
  path?: string
): NextResponse<ApiErrorResponse> {
  let errorData: ApiErrorResponse;

  if (error instanceof ApiError) {
    errorData = {
      error: error.message,
      code: error.code,
      message: error.message,
      details: error.details,
      timestamp: new Date().toISOString(),
      path,
    };
    statusCode = error.statusCode;
  } else {
    errorData = {
      error: error,
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: error,
      details,
      timestamp: new Date().toISOString(),
      path,
    };
    statusCode = statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }

  return NextResponse.json(errorData, { status: statusCode });
}

/**
 * Predefined error response creators
 */
export const ErrorResponses = {
  /**
   * Bad Request (400) - Invalid request data
   */
  badRequest: (message: string = 'Bad request', details?: Record<string, unknown>, path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.BAD_REQUEST, HTTP_STATUS.BAD_REQUEST, details),
      undefined,
      undefined,
      path
    ),

  /**
   * Unauthorized (401) - Authentication required
   */
  unauthorized: (message: string = 'Authentication required', details?: Record<string, unknown>, path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, details),
      undefined,
      undefined,
      path
    ),

  /**
   * Forbidden (403) - Access denied
   */
  forbidden: (message: string = 'Access denied', details?: Record<string, unknown>, path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.FORBIDDEN, HTTP_STATUS.FORBIDDEN, details),
      undefined,
      undefined,
      path
    ),

  /**
   * Not Found (404) - Resource not found
   */
  notFound: (message: string = 'Resource not found', details?: Record<string, unknown>, path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, details),
      undefined,
      undefined,
      path
    ),

  /**
   * Method Not Allowed (405) - HTTP method not supported
   */
  methodNotAllowed: (message: string = 'Method not allowed', details?: Record<string, unknown>, path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.METHOD_NOT_ALLOWED, HTTP_STATUS.METHOD_NOT_ALLOWED, details),
      undefined,
      undefined,
      path
    ),

  /**
   * Rate Limited (429) - Too many requests
   */
  rateLimited: (message: string = 'Too many requests', details?: Record<string, unknown>, path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.RATE_LIMITED, HTTP_STATUS.RATE_LIMITED, details),
      undefined,
      undefined,
      path
    ),

  /**
   * Validation Error (400) - Request validation failed
   */
  validation: (errors: ValidationError[], message: string = 'Validation failed', path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, { errors }),
      undefined,
      undefined,
      path
    ),

  /**
   * Internal Server Error (500) - Unexpected server error
   */
  serverError: (message: string = 'Internal server error', details?: Record<string, unknown>, path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.INTERNAL_SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, details),
      undefined,
      undefined,
      path
    ),

  /**
   * Service Unavailable (503) - External service error
   */
  serviceUnavailable: (message: string = 'Service temporarily unavailable', details?: Record<string, unknown>, path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.SERVICE_UNAVAILABLE, HTTP_STATUS.SERVICE_UNAVAILABLE, details),
      undefined,
      undefined,
      path
    ),

  /**
   * Database Error (500) - Database operation failed
   */
  databaseError: (message: string = 'Database operation failed', details?: Record<string, unknown>, path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.DATABASE_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, details),
      undefined,
      undefined,
      path
    ),

  /**
   * External Service Error (500) - Third-party service error
   */
  externalServiceError: (message: string = 'External service error', details?: Record<string, unknown>, path?: string) =>
    createErrorResponse(
      new ApiError(message, ERROR_CODES.EXTERNAL_SERVICE_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, details),
      undefined,
      undefined,
      path
    ),
};

/**
 * Validation helper functions
 */
export const ValidationHelpers = {
  /**
   * Validate required fields are present
   */
  validateRequired: (data: Record<string, unknown>, requiredFields: string[]): ValidationError[] => {
    const errors: ValidationError[] = [];

    for (const field of requiredFields) {
      if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
        errors.push({
          field,
          message: `${field} is required`,
          code: 'REQUIRED_FIELD_MISSING'
        });
      }
    }

    return errors;
  },

  /**
   * Validate email format
   */
  validateEmail: (email: string, fieldName: string = 'email'): ValidationError | null => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        field: fieldName,
        message: 'Invalid email format',
        code: 'INVALID_EMAIL_FORMAT'
      };
    }
    return null;
  },

  /**
   * Validate phone number format (basic international format)
   */
  validatePhone: (phone: string, fieldName: string = 'phone'): ValidationError | null => {
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phone)) {
      return {
        field: fieldName,
        message: 'Phone number must be in international format (e.g., +1234567890)',
        code: 'INVALID_PHONE_FORMAT'
      };
    }
    return null;
  },

  /**
   * Validate string length
   */
  validateLength: (
    value: string,
    fieldName: string,
    min?: number,
    max?: number
  ): ValidationError | null => {
    if (min && value.length < min) {
      return {
        field: fieldName,
        message: `${fieldName} must be at least ${min} characters long`,
        code: 'MIN_LENGTH_VIOLATION'
      };
    }

    if (max && value.length > max) {
      return {
        field: fieldName,
        message: `${fieldName} must not exceed ${max} characters`,
        code: 'MAX_LENGTH_VIOLATION'
      };
    }

    return null;
  },

  /**
   * Validate UUID format
   */
  validateUUID: (uuid: string, fieldName: string = 'id'): ValidationError | null => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      return {
        field: fieldName,
        message: 'Invalid UUID format',
        code: 'INVALID_UUID_FORMAT'
      };
    }
    return null;
  },
};

/**
 * Error handler wrapper for async API route handlers
 * Catches and formats unhandled errors
 */
export function withErrorHandler<T extends unknown[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R | NextResponse<ApiErrorResponse>> => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('Unhandled API error:', error);

      // Handle known error types
      if (error instanceof ApiError) {
        return createErrorResponse(error);
      }

      // Handle Supabase errors
      if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
        return ErrorResponses.databaseError(
          ((error as { code: string; message: string })).message,
          { supabaseCode: ((error as { code: string; message: string })).code }
        );
      }

      // Handle general errors
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      return ErrorResponses.serverError(message, {
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  };
}

/**
 * Utility to extract path from NextRequest
 */
export function getRequestPath(request: Request): string {
  try {
    const url = new URL(request.url);
    return url.pathname;
  } catch {
    return 'unknown';
  }
}

/**
 * Type guards for error handling
 */
export const TypeGuards = {
  isApiError: (error: unknown): error is ApiError => {
    return error instanceof ApiError;
  },

  isSupabaseError: (error: unknown): error is { code: string; message: string } => {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      typeof ((error as { code: string; message: string })).code === 'string' &&
      typeof ((error as { code: string; message: string })).message === 'string'
    );
  },
};