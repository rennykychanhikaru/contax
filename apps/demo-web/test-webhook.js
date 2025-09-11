#!/usr/bin/env node

// Test script for the universal webhook endpoint
// Usage: node test-webhook.js <phoneNumber> <organizationId>

const phoneNumber = process.argv[2] || '+1234567890';
const organizationId = process.argv[3] || 'test-org-id';
const webhookUrl = 'http://localhost:3001/api/webhook/trigger-call';

// Test different payload formats
const testPayloads = [
  {
    name: 'Make.com format',
    payload: {
      phoneNumber: phoneNumber,
      organizationId: organizationId
    }
  },
  {
    name: 'HubSpot format',
    payload: {
      hs_phone: phoneNumber,
      hs_company_id: organizationId
    }
  },
  {
    name: 'Zapier format',
    payload: {
      phone: phoneNumber,
      orgId: organizationId
    }
  },
  {
    name: 'Nested format',
    payload: {
      data: {
        phone: phoneNumber,
        organizationId: organizationId
      }
    }
  },
  {
    name: 'Contact object format',
    payload: {
      contact: {
        phone: phoneNumber
      },
      company: {
        id: organizationId
      }
    }
  }
];

async function testWebhook(name, payload) {
  console.log(`\n📞 Testing ${name}...`);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Test-Script/${name}`
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Success:', result.message || 'Call initiated');
      if (result.data) {
        console.log('   Call SID:', result.data.callSid);
        console.log('   To:', result.data.to);
        console.log('   From:', result.data.from);
      }
    } else {
      console.log('❌ Error:', result.error);
      if (result.message) console.log('   Message:', result.message);
      if (result.hint) console.log('   Hint:', result.hint);
    }
  } catch (error) {
    console.log('❌ Request failed:', error.message);
  }
}

async function runTests() {
  console.log('🧪 Testing Universal Webhook Endpoint');
  console.log('=====================================');
  console.log('URL:', webhookUrl);
  console.log('Phone:', phoneNumber);
  console.log('Org ID:', organizationId);
  
  // First, check if the endpoint is accessible
  try {
    const getResponse = await fetch(webhookUrl, { method: 'GET' });
    const info = await getResponse.json();
    console.log('\n📋 Endpoint info:', info.message);
  } catch (error) {
    console.log('⚠️  Warning: Could not reach webhook endpoint. Is the server running?');
    return;
  }
  
  // Test only the first format for actual calls (to avoid multiple calls)
  // Uncomment others to test different formats
  await testWebhook(testPayloads[0].name, testPayloads[0].payload);
  
  console.log('\n💡 To test other formats, uncomment them in the script');
  console.log('   Available formats:');
  testPayloads.slice(1).forEach(test => {
    console.log(`   - ${test.name}`);
  });
}

// Run the tests
runTests().catch(console.error);