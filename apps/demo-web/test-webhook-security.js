#!/usr/bin/env node

/**
 * Test script for webhook security implementation
 * Demonstrates how to use the new secure webhook system
 */

const BASE_URL = 'http://localhost:3000'

// Test organization ID (you'll need to get this from your database)
const TEST_ORG_ID = 'YOUR_ORG_ID_HERE'

async function testWebhookSecurity() {
  console.log('🔒 Testing Webhook Security Implementation\n')
  console.log('==========================================\n')
  
  try {
    // Step 1: Generate webhook credentials for an organization
    console.log('1. Generating webhook credentials...')
    const generateResponse = await fetch(`${BASE_URL}/api/settings/webhook?organizationId=${TEST_ORG_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    
    if (!generateResponse.ok) {
      const error = await generateResponse.json()
      console.error('   ❌ Failed to generate credentials:', error)
      return
    }
    
    const credentials = await generateResponse.json()
    console.log('   ✅ Webhook credentials generated!')
    console.log(`   📍 Webhook URL: ${credentials.webhook_url}`)
    console.log(`   🔑 Webhook Token: ${credentials.webhook_token}`)
    console.log(`   🤫 Webhook Secret: ${credentials.webhook_secret}\n`)
    
    // Step 2: Test valid webhook call with correct credentials
    console.log('2. Testing VALID webhook call with correct credentials...')
    const validResponse = await fetch(credentials.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': credentials.webhook_secret
      },
      body: JSON.stringify({
        phoneNumber: '+1234567890',
        customerName: 'Test Customer',
        context: 'Testing secure webhook'
      })
    })
    
    if (validResponse.ok) {
      const result = await validResponse.json()
      console.log('   ✅ Valid webhook call succeeded!')
      console.log(`   📞 Call ID: ${result.callId}\n`)
    } else {
      const error = await validResponse.json()
      console.log('   ❌ Valid webhook call failed:', error, '\n')
    }
    
    // Step 3: Test invalid webhook call without secret
    console.log('3. Testing INVALID webhook call without secret...')
    const invalidResponse = await fetch(credentials.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: '+1234567890',
        customerName: 'Hacker',
        context: 'Trying to trigger unauthorized call'
      })
    })
    
    if (!invalidResponse.ok) {
      const error = await invalidResponse.json()
      console.log('   ✅ Correctly rejected unauthorized request!')
      console.log(`   🚫 Error: ${error.error}\n`)
    } else {
      console.log('   ❌ SECURITY ISSUE: Unauthorized request was accepted!\n')
    }
    
    // Step 4: Test invalid webhook call with wrong secret
    console.log('4. Testing INVALID webhook call with wrong secret...')
    const wrongSecretResponse = await fetch(credentials.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': 'wrong-secret-12345'
      },
      body: JSON.stringify({
        phoneNumber: '+1234567890',
        customerName: 'Hacker',
        context: 'Trying with wrong secret'
      })
    })
    
    if (!wrongSecretResponse.ok) {
      const error = await wrongSecretResponse.json()
      console.log('   ✅ Correctly rejected wrong secret!')
      console.log(`   🚫 Error: ${error.error}\n`)
    } else {
      console.log('   ❌ SECURITY ISSUE: Wrong secret was accepted!\n`)
    }
    
    // Step 5: Get webhook status
    console.log('5. Checking webhook status and statistics...')
    const statusResponse = await fetch(`${BASE_URL}/api/settings/webhook?organizationId=${TEST_ORG_ID}`)
    
    if (statusResponse.ok) {
      const status = await statusResponse.json()
      console.log('   ✅ Webhook status retrieved!')
      console.log(`   📊 Statistics (last 24h):`)
      console.log(`      - Total requests: ${status.statistics.total_24h}`)
      console.log(`      - Successful: ${status.statistics.successful_24h}`)
      console.log(`      - Failed: ${status.statistics.failed_24h}`)
      console.log(`   🏥 Health:`)
      console.log(`      - Failures: ${status.health.failures}`)
      console.log(`      - Is Healthy: ${status.health.is_healthy ? 'Yes' : 'No'}\n`)
    }
    
    console.log('==========================================')
    console.log('✅ Webhook security test completed!')
    console.log('\nIMPORTANT REMINDERS:')
    console.log('1. Never commit webhook secrets to version control')
    console.log('2. Rotate credentials regularly')
    console.log('3. Monitor webhook logs for suspicious activity')
    console.log('4. Set appropriate rate limits for your use case')
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

// Instructions
console.log('⚠️  BEFORE RUNNING THIS TEST:\n')
console.log('1. Make sure your app is running: npm run demo:dev')
console.log('2. Get an organization ID from your database:')
console.log('   - Run: npm run supabase:start')
console.log('   - Go to: http://localhost:54323')
console.log('   - Find an organization ID in the organizations table')
console.log('3. Update TEST_ORG_ID in this script\n')
console.log('Then run: node test-webhook-security.js\n')

// Uncomment to run the test
// testWebhookSecurity()