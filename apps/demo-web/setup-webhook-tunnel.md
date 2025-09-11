# Setting Up Webhook URL for External Services (Make, HubSpot, etc.)

## Quick Setup with ngrok

1. **Install ngrok** (if not already installed):
```bash
brew install ngrok
```

2. **Start your local development server** (already running on port 3001)

3. **Create a tunnel to your local server**:
```bash
ngrok http 3001
```

4. **Copy your public URL** from ngrok output:
```
Forwarding: https://abc123.ngrok.io -> http://localhost:3001
```

5. **Your webhook URL will be**:
```
https://abc123.ngrok.io/api/webhook/trigger-call
```

## Production URL

If deployed to production, use your production domain:
```
https://your-app.vercel.app/api/webhook/trigger-call
https://your-domain.com/api/webhook/trigger-call
```

## Testing the Webhook

### Method 1: Use the test script
```bash
node test-webhook.js +1234567890 your-org-id
```

### Method 2: Direct curl command
```bash
curl -X POST https://your-url/api/webhook/trigger-call \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890",
    "organizationId": "your-org-id"
  }'
```

### Method 3: Check endpoint info
```bash
curl https://your-url/api/webhook/trigger-call
```

## Make.com Configuration

1. In Make.com, add a **Webhooks** module
2. Select **Custom webhook**
3. Click **Add** to create a new webhook
4. Copy the webhook URL: `https://your-ngrok-url/api/webhook/trigger-call`
5. Set the method to **POST**
6. Configure the data structure to send:
   ```json
   {
     "phoneNumber": "{{phone}}",
     "organizationId": "your-org-id"
   }
   ```

## Required Fields

The webhook needs:
- **Phone Number** (in any of these field names):
  - phoneNumber, phone_number, phone, mobile, telephone, etc.
- **Organization ID** (in any of these field names):
  - organizationId, organization_id, orgId, companyId, etc.

## Getting Your Organization ID

To find your organization ID, you can:

1. Check the Supabase database:
```sql
SELECT id, name FROM organizations WHERE name = 'your-org-name';
```

2. Or check via the API (when logged in):
```bash
curl http://localhost:3001/api/org/default \
  -H "Cookie: your-auth-cookies"
```

## Environment Variable (Optional)

If you have a single organization, you can set a default in `.env.local`:
```env
DEFAULT_ORGANIZATION_ID=your-org-id-here
```

This way, the webhook will work even if the organization ID is not provided in the payload.