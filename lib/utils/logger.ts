/**
 * Centralized logging utility for Contax
 * Provides structured logging with different levels and contexts
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  userId?: string;
  organizationId?: string;
  agentId?: string;
  component?: string;
  action?: string;
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.level = process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${level}: ${message}${contextStr}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    if (this.isDevelopment) {
      console.debug(this.formatMessage('DEBUG', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    console.info(this.formatMessage('INFO', message, context));
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    console.warn(this.formatMessage('WARN', message, context));
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const errorContext = error ? { ...context, error: error.message, stack: error.stack } : context;
    console.error(this.formatMessage('ERROR', message, errorContext));
  }

  // Convenience methods for common use cases
  apiRequest(method: string, path: string, context?: LogContext): void {
    this.info(`${method} ${path}`, { ...context, action: 'api_request' });
  }

  apiResponse(method: string, path: string, status: number, context?: LogContext): void {
    const level = status >= 400 ? LogLevel.ERROR : LogLevel.INFO;
    const message = `${method} ${path} - ${status}`;

    if (level === LogLevel.ERROR) {
      this.error(message, undefined, { ...context, status, action: 'api_response' });
    } else {
      this.info(message, { ...context, status, action: 'api_response' });
    }
  }

  webhook(eventType: string, context?: LogContext): void {
    this.info(`Webhook received: ${eventType}`, { ...context, action: 'webhook_received' });
  }

  userAction(action: string, context?: LogContext): void {
    this.info(`User action: ${action}`, { ...context, action: 'user_action' });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions for easier usage
export const log = {
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, context?: LogContext) => logger.warn(message, context),
  error: (message: string, error?: Error, context?: LogContext) => logger.error(message, error, context),
  apiRequest: (method: string, path: string, context?: LogContext) => logger.apiRequest(method, path, context),
  apiResponse: (method: string, path: string, status: number, context?: LogContext) => logger.apiResponse(method, path, status, context),
  webhook: (eventType: string, context?: LogContext) => logger.webhook(eventType, context),
  userAction: (action: string, context?: LogContext) => logger.userAction(action, context),
};