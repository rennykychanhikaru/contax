#!/usr/bin/env node

/**
 * Webhook signature test helper
 *
 * This utility helps generate valid webhook signatures for testing the webhook endpoint.
 * It can be used during development to verify that the HMAC validation is working correctly.
 */

import { generateWebhookSignature } from './webhook-auth';

/**
 * Interface for webhook test configuration
 */
export interface WebhookTestConfig {
  /** The webhook secret key */
  secret: string;
  /** The JSON payload to send */
  payload: Record<string, unknown>;
  /** Optional custom timestamp (default: current time) */
  timestamp?: string;
  /** The webhook endpoint URL */
  url?: string;
}

/**
 * Generate headers and payload for testing webhook signature validation
 *
 * @param config - Test configuration
 * @returns Object containing headers, body, and curl command for testing
 */
export function generateWebhookTest(config: WebhookTestConfig) {
  // Use current timestamp if not provided
  const timestamp = config.timestamp || Date.now().toString();

  // Convert payload to JSON string
  const rawBody = JSON.stringify(config.payload);

  // Generate signature
  const signature = generateWebhookSignature(rawBody, timestamp, config.secret);

  // Prepare headers
  const headers = {
    'Content-Type': 'application/json',
    'x-signature': signature,
    'x-timestamp': timestamp
  };

  // Generate curl command for testing
  const url = config.url || 'http://localhost:3000/api/webhook/trigger-call';
  const curlCommand = `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -H "x-signature: ${signature}" \\
  -H "x-timestamp: ${timestamp}" \\
  -d '${rawBody}'`;

  return {
    headers,
    body: rawBody,
    curlCommand,
    timestamp,
    signature
  };
}

/**
 * Example test payloads for different webhook sources
 */
export const testPayloads = {
  simple: {
    phoneNumber: '+1234567890',
    organizationId: 'org-123'
  },

  hubspot: {
    hs_phone: '+1234567890',
    hs_company_id: 'org-456',
    firstname: 'John',
    lastname: 'Doe'
  },

  zapier: {
    phone: '+1234567890',
    orgId: 'org-789',
    customerName: 'Jane Smith'
  },

  nested: {
    data: {
      phone: '+1234567890',
      organizationId: 'org-101112'
    },
    meta: {
      source: 'custom-webhook',
      version: '1.0'
    }
  }
};

/**
 * Run webhook signature test - for command line usage
 */
export function runWebhookTest() {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.error('❌ WEBHOOK_SECRET environment variable is not set');
    process.exit(1);
  }

  console.log('🔐 Webhook Signature Test Helper\n');

  // Test with different payloads
  Object.entries(testPayloads).forEach(([name, payload]) => {
    console.log(`📋 Test: ${name.toUpperCase()}`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const test = generateWebhookTest({
      secret,
      payload,
      url: process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhook/trigger-call'
    });

    console.log('Headers:');
    Object.entries(test.headers).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\nCurl command:');
    console.log(test.curlCommand);
    console.log('\n' + '='.repeat(80) + '\n');
  });
}

// Run if called directly (not imported)
if (require.main === module) {
  runWebhookTest();
}