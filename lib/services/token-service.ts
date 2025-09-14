import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { refreshGoogleAccessToken } from '../google';
import {
  getAgentCalendarTokens,
  refreshAgentToken,
} from '../agent-calendar';

export interface TokenInfo {
  access_token: string;
  refresh_token?: string;
  expiry?: number;
  source: 'user' | 'agent';
  agent_id?: string;
}

export interface TokenResult {
  success: boolean;
  tokens?: TokenInfo;
  cookies?: Array<{ name: string; value: string }>;
  error?: string;
}

/**
 * Unified Token Management Service
 * Handles both user cookie-based tokens and agent database-stored tokens
 */
export class TokenService {

  /**
   * Get user tokens from cookies with automatic refresh
   */
  static async getUserTokens(): Promise<TokenResult> {
    try {
      const c = await cookies();
      let accessToken = c.get('gcal_access')?.value ||
                       c.get('gcal_token')?.value ||
                       process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;

      const refreshToken = c.get('gcal_refresh')?.value;
      const expiry = Number(c.get('gcal_expiry')?.value || 0);
      const nowSec = Math.floor(Date.now() / 1000);
      const setCookies: Array<{ name: string; value: string }> = [];

      // Check if token needs refresh
      if ((!accessToken || (expiry && nowSec >= expiry)) &&
          refreshToken &&
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET) {

        const refreshResult = await refreshGoogleAccessToken(
          refreshToken,
          process.env.GOOGLE_CLIENT_ID!,
          process.env.GOOGLE_CLIENT_SECRET!
        );

        if (refreshResult?.access_token) {
          accessToken = refreshResult.access_token;
          const newExpiry = nowSec + (refreshResult.expires_in || 3600) - 60;

          setCookies.push(
            { name: 'gcal_access', value: accessToken },
            { name: 'gcal_expiry', value: String(newExpiry) },
            { name: 'gcal_token', value: accessToken }
          );
        }
      }

      if (!accessToken) {
        return {
          success: false,
          error: 'No valid access token available'
        };
      }

      return {
        success: true,
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expiry,
          source: 'user'
        },
        cookies: setCookies
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get user tokens'
      };
    }
  }

  /**
   * Get agent tokens from database with automatic refresh
   */
  static async getAgentTokens(agentId: string): Promise<TokenResult> {
    try {
      const tokens = await getAgentCalendarTokens(agentId);

      if (!tokens) {
        return {
          success: false,
          error: 'Agent calendar not connected'
        };
      }

      if (!tokens.access_token) {
        return {
          success: false,
          error: 'No valid access token for agent'
        };
      }

      return {
        success: true,
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || undefined,
          expiry: tokens.token_expiry ? Number(tokens.token_expiry) : undefined,
          source: 'agent',
          agent_id: agentId
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get agent tokens'
      };
    }
  }

  /**
   * Get tokens for either user or agent
   */
  static async getTokens(agentId?: string): Promise<TokenResult> {
    if (agentId) {
      return this.getAgentTokens(agentId);
    } else {
      return this.getUserTokens();
    }
  }

  /**
   * Refresh tokens based on source
   */
  static async refreshTokens(tokens: TokenInfo): Promise<TokenResult> {
    if (!tokens.refresh_token) {
      return {
        success: false,
        error: 'No refresh token available'
      };
    }

    try {
      const refreshResult = await refreshGoogleAccessToken(
        tokens.refresh_token,
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!
      );

      if (!refreshResult?.access_token) {
        return {
          success: false,
          error: 'Failed to refresh token'
        };
      }

      if (tokens.source === 'agent' && tokens.agent_id) {
        // For agent tokens, update in database
        const agentTokens = await getAgentCalendarTokens(tokens.agent_id);
        if (agentTokens) {
          await refreshAgentToken(tokens.agent_id, agentTokens);
        }

        return this.getAgentTokens(tokens.agent_id);
      } else {
        // For user tokens, return cookie updates
        const nowSec = Math.floor(Date.now() / 1000);
        const newExpiry = nowSec + (refreshResult.expires_in || 3600) - 60;

        return {
          success: true,
          tokens: {
            access_token: refreshResult.access_token,
            refresh_token: tokens.refresh_token,
            expiry: newExpiry,
            source: 'user'
          },
          cookies: [
            { name: 'gcal_access', value: refreshResult.access_token },
            { name: 'gcal_expiry', value: String(newExpiry) },
            { name: 'gcal_token', value: refreshResult.access_token }
          ]
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh tokens'
      };
    }
  }

  /**
   * Check if tokens are expired
   */
  static isTokenExpired(tokens: TokenInfo): boolean {
    if (!tokens.expiry) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec >= tokens.expiry;
  }

  /**
   * Get valid tokens with automatic refresh if needed
   */
  static async getValidTokens(agentId?: string): Promise<TokenResult> {
    const tokenResult = await this.getTokens(agentId);

    if (!tokenResult.success || !tokenResult.tokens) {
      return tokenResult;
    }

    // Check if token needs refresh
    if (this.isTokenExpired(tokenResult.tokens) && tokenResult.tokens.refresh_token) {
      return this.refreshTokens(tokenResult.tokens);
    }

    return tokenResult;
  }

  /**
   * Apply token cookies to a NextResponse
   */
  static applyCookiesToResponse(response: NextResponse, cookies: Array<{ name: string; value: string }>): void {
    cookies.forEach(cookie => {
      response.cookies.set(cookie.name, cookie.value, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/'
      });
    });
  }

  /**
   * Create a response with token cookies applied
   */
  static createResponseWithTokens<T>(
    data: T,
    cookies?: Array<{ name: string; value: string }>,
    status: number = 200
  ): NextResponse {
    const response = NextResponse.json(data, { status });

    if (cookies && cookies.length > 0) {
      this.applyCookiesToResponse(response, cookies);
    }

    return response;
  }

  /**
   * Validate token has required scopes
   */
  static async validateTokenScopes(accessToken: string, requiredScopes: string[] = []): Promise<{
    valid: boolean;
    scopes: string[];
    error?: string;
  }> {
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);

      if (!response.ok) {
        return {
          valid: false,
          scopes: [],
          error: `Token validation failed: ${response.status}`
        };
      }

      const tokenInfo = await response.json();
      const scopes = typeof tokenInfo.scope === 'string' ? tokenInfo.scope.split(' ') : [];

      // Check if all required scopes are present
      const hasRequiredScopes = requiredScopes.every(scope => scopes.includes(scope));

      return {
        valid: hasRequiredScopes,
        scopes,
        error: hasRequiredScopes ? undefined : `Missing required scopes: ${requiredScopes.filter(s => !scopes.includes(s)).join(', ')}`
      };

    } catch (error) {
      return {
        valid: false,
        scopes: [],
        error: error instanceof Error ? error.message : 'Token validation failed'
      };
    }
  }

  /**
   * Revoke token (logout)
   */
  static async revokeToken(accessToken: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to revoke token: ${response.status}`
        };
      }

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to revoke token'
      };
    }
  }

  /**
   * Clear user token cookies
   */
  static clearUserTokenCookies(): Array<{ name: string; value: string }> {
    return [
      { name: 'gcal_access', value: '' },
      { name: 'gcal_token', value: '' },
      { name: 'gcal_refresh', value: '' },
      { name: 'gcal_expiry', value: '' }
    ];
  }

  /**
   * Create error response for token issues
   */
  static createTokenErrorResponse(error: string, status: number = 401): NextResponse {
    return NextResponse.json({ error }, { status });
  }
}