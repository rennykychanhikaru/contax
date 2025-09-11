import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TwilioTelephonyAdapter } from '../../../../lib/telephony/twilio';

// Universal webhook endpoint that accepts calls from any system (Make, HubSpot, Zapier, etc.)
// Intelligently extracts phone numbers and organization IDs from various field names
// Helper function to extract phone number from various possible field names
function extractPhoneNumber(body: any): string | null {
  // Common field names used by different systems
  const phoneFields = [
    'phoneNumber', 'phone_number', 'phone', 'Phone', 'PhoneNumber',
    'mobile', 'Mobile', 'mobileNumber', 'mobile_number',
    'telephone', 'Telephone', 'tel', 'Tel',
    'contact', 'Contact', 'contactNumber', 'contact_number',
    'number', 'Number', 'to', 'To', 'recipient',
    'customer_phone', 'customerPhone', 'client_phone', 'clientPhone',
    // HubSpot specific
    'hs_phone', 'phone_number_1', 'mobilephone',
    // Salesforce specific
    'Phone__c', 'MobilePhone__c',
    // Generic nested structures
    'data.phone', 'data.phoneNumber', 'contact.phone', 'customer.phone'
  ];

  for (const field of phoneFields) {
    // Check direct field
    if (body[field]) return body[field];
    
    // Check nested fields (e.g., data.phone)
    if (field.includes('.')) {
      const parts = field.split('.');
      let value = body;
      for (const part of parts) {
        value = value?.[part];
        if (!value) break;
      }
      if (value) return value;
    }
  }
  
  // Check if body.data exists and search within it
  if (body.data && typeof body.data === 'object') {
    return extractPhoneNumber(body.data);
  }
  
  // Check if body.contact exists and search within it
  if (body.contact && typeof body.contact === 'object') {
    return extractPhoneNumber(body.contact);
  }
  
  return null;
}

// Helper function to extract organization ID from various possible field names
function extractOrganizationId(body: any): string | null {
  const orgFields = [
    'organizationId', 'organization_id', 'orgId', 'org_id',
    'organisationId', 'organisation_id', 'OrganizationId',
    'companyId', 'company_id', 'accountId', 'account_id',
    'tenantId', 'tenant_id', 'customerId', 'customer_id',
    // HubSpot specific
    'hs_company_id', 'companyid', 'associatedcompanyid',
    // Salesforce specific
    'AccountId', 'Account__c',
    // Generic nested structures
    'data.organizationId', 'data.orgId', 'company.id', 'organization.id'
  ];

  for (const field of orgFields) {
    // Check direct field
    if (body[field]) return body[field];
    
    // Check nested fields
    if (field.includes('.')) {
      const parts = field.split('.');
      let value = body;
      for (const part of parts) {
        value = value?.[part];
        if (!value) break;
      }
      if (value) return value;
    }
  }
  
  // Check nested objects
  if (body.data && typeof body.data === 'object') {
    const nested = extractOrganizationId(body.data);
    if (nested) return nested;
  }
  
  if (body.organization && typeof body.organization === 'object') {
    if (body.organization.id) return body.organization.id;
    const nested = extractOrganizationId(body.organization);
    if (nested) return nested;
  }
  
  if (body.company && typeof body.company === 'object') {
    if (body.company.id) return body.company.id;
    const nested = extractOrganizationId(body.company);
    if (nested) return nested;
  }
  
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // Parse the incoming request body
    const body = await req.json();
    
    // Log the incoming webhook for debugging (you can remove this in production)
    console.log('Incoming webhook payload:', JSON.stringify(body, null, 2));
    
    // Try to extract phone number from various possible field names
    const targetPhone = extractPhoneNumber(body);
    
    if (!targetPhone) {
      return NextResponse.json({ 
        error: 'Phone number not found',
        message: 'Could not extract phone number from the webhook payload. Please ensure the phone number is included in a recognized field.',
        hint: 'Common field names: phoneNumber, phone, mobile, telephone, contact, etc.',
        received: Object.keys(body)
      }, { status: 400 });
    }
    
    // Try to extract organization ID from various possible field names
    let orgId = extractOrganizationId(body);
    
    // If no organization ID found, try to use a default from environment or headers
    if (!orgId) {
      // Check if there's a default org ID in headers (for API key based auth)
      const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization');
      if (apiKey) {
        // You could look up org ID by API key here if you implement that
        // For now, we'll require the org ID in the payload
      }
      
      // Check for a default organization ID in environment variables
      orgId = process.env.DEFAULT_ORGANIZATION_ID;
      
      if (!orgId) {
        return NextResponse.json({ 
          error: 'Organization ID not found',
          message: 'Could not extract organization ID from the webhook payload. Please include it in the request.',
          hint: 'Common field names: organizationId, orgId, companyId, accountId, etc.',
          received: Object.keys(body)
        }, { status: 400 });
      }
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get agent settings to check if phone calls are enabled
    const { data: agentSettings, error: agentError } = await supabase
      .from('agent_settings')
      .select('phone_call_enabled, greeting, display_name')
      .eq('organization_id', orgId)
      .eq('name', 'default')
      .single();

    if (agentError) {
      console.error('Error fetching agent settings:', agentError);
      return NextResponse.json({ 
        error: 'Failed to fetch agent settings',
        details: agentError.message 
      }, { status: 500 });
    }

    // Check if phone calls are enabled
    if (!agentSettings || agentSettings.phone_call_enabled === false) {
      return NextResponse.json({ 
        error: 'Phone calls are disabled for this agent',
        phone_call_enabled: false,
        message: 'Please enable phone calls in Agent Settings to make outgoing calls'
      }, { status: 403 });
    }

    // Get Twilio settings for the organization
    const { data: twilioSettings, error: twilioError } = await supabase
      .from('twilio_settings')
      .select('account_sid, auth_token, phone_number')
      .eq('organization_id', orgId)
      .single();

    if (twilioError || !twilioSettings) {
      return NextResponse.json({ 
        error: 'Twilio settings not configured',
        message: 'Please configure Twilio settings in the Settings page'
      }, { status: 404 });
    }

    // Validate that all Twilio settings are present
    if (!twilioSettings.account_sid || !twilioSettings.auth_token || !twilioSettings.phone_number) {
      return NextResponse.json({ 
        error: 'Incomplete Twilio configuration',
        message: 'Please ensure Account SID, Auth Token, and Phone Number are all configured'
      }, { status: 400 });
    }

    // Initialize Twilio adapter
    const twilioAdapter = new TwilioTelephonyAdapter({
      accountSid: twilioSettings.account_sid,
      authToken: twilioSettings.auth_token,
      phoneNumber: twilioSettings.phone_number,
    });

    // Get the base URL for callbacks
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;

    // Create the outgoing call
    await twilioAdapter.startOutboundCall(targetPhone, {
      baseUrl,
      organizationId: orgId,
      agentId: 'default',
    });
    
    // Get the call SID from the adapter
    const callSid = twilioAdapter.getCurrentCallSid();

    if (!callSid) {
      throw new Error('Failed to initiate call - no call SID returned');
    }

    // Log the call in the database
    const { error: logError } = await supabase
      .from('call_logs')
      .insert({
        organization_id: orgId,
        call_sid: callSid,
        from_number: twilioSettings.phone_number,
        to_number: targetPhone,
        direction: 'outbound',
        status: 'initiated',
        metadata: {
          source: req.headers.get('user-agent') || 'webhook',
          webhook_source: body.source || body.platform || 'unknown',
          agent_name: agentSettings.display_name || 'AI Assistant',
          greeting: agentSettings.greeting,
          original_payload: JSON.stringify(body).substring(0, 500) // Store first 500 chars of payload
        },
        created_at: new Date().toISOString(),
      });

    if (logError) {
      console.error('Error logging call:', logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      message: 'Outgoing call initiated successfully',
      data: {
        callSid: callSid,
        status: 'initiated',
        to: targetPhone,
        from: twilioSettings.phone_number,
        agentName: agentSettings.display_name || 'AI Assistant',
        greeting: agentSettings.greeting || 'Hello, how can I help you today?'
      }
    });

  } catch (error: any) {
    console.error('Error in Make webhook:', error);
    
    // Handle Twilio-specific errors
    if (error.code) {
      return NextResponse.json({
        error: `Twilio error: ${error.message}`,
        code: error.code,
        details: error.message
      }, { status: 400 });
    }
    
    return NextResponse.json({
      error: 'Failed to process webhook',
      details: error.message || 'Unknown error occurred'
    }, { status: 500 });
  }
}

// GET method to verify webhook is working and show supported formats
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    message: 'Universal webhook endpoint is active',
    description: 'This endpoint accepts webhooks from any system (Make, HubSpot, Zapier, Salesforce, etc.)',
    supportedPhoneFields: [
      'phoneNumber', 'phone_number', 'phone', 'mobile', 'telephone',
      'contact', 'number', 'to', 'recipient', 'customer_phone',
      'hs_phone (HubSpot)', 'mobilephone (HubSpot)', 
      'Phone__c (Salesforce)', 'MobilePhone__c (Salesforce)',
      'Nested: data.phone, contact.phone, customer.phone'
    ],
    supportedOrgFields: [
      'organizationId', 'organization_id', 'orgId', 'companyId',
      'accountId', 'tenantId', 'customerId',
      'hs_company_id (HubSpot)', 'companyid (HubSpot)',
      'AccountId (Salesforce)', 'Account__c (Salesforce)',
      'Nested: data.organizationId, company.id, organization.id'
    ],
    examplePayloads: {
      make: {
        phoneNumber: '+1234567890',
        organizationId: 'org-123'
      },
      hubspot: {
        hs_phone: '+1234567890',
        hs_company_id: 'org-123'
      },
      zapier: {
        phone: '+1234567890',
        orgId: 'org-123'
      },
      generic: {
        data: {
          phone: '+1234567890',
          organizationId: 'org-123'
        }
      }
    },
    features: {
      intelligentExtraction: 'Automatically extracts phone and org ID from various field names',
      phoneCallCheck: 'Verifies if phone calls are enabled in agent settings',
      twilioIntegration: 'Uses configured Twilio settings to make calls',
      agentGreeting: 'Uses the configured agent greeting message',
      multiPlatform: 'Works with Make, HubSpot, Zapier, Salesforce, and custom systems'
    }
  });
}