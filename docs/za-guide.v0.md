> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.coinflow.cash/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.coinflow.cash/_mcp/server.

# 🔐 Zero Authorization

## What is Zero Authorization?

A **Zero Authorization** is a \$0.00 authorization transaction that validates a customer's card and securely stores the credentials for future use—without actually charging them. This enables you to verify card validity, store credentials, and establish authorization for subsequent transactions.

> 📘 **Card Validation Without Charging**
>
> Zero Authorization confirms that a card is valid and can be charged, while creating a secure reference for future Card on File (COF) or Merchant Initiated Transactions (MIT).

### Key Characteristics

* **No Charge**: Authorizes the card for \$0.00, so the customer is not charged
* **Card Validation**: Confirms the card is valid and in good standing
* **Secure Storage**: Credentials are tokenized and stored in Coinflow's PCI-compliant vault
* **Future Authorization**: Creates a `paymentId` reference for subsequent COF/MIT transactions
* **CVV Verification**: Requires the customer's CVV for proper authorization

***

## Why Use Zero Authorization?

Zero Authorization is essential for business models where you need to store a customer's payment method before charging them:

Store customer cards when they sign up, then charge based on actual usage later

Save payment credentials for automatic balance replenishment when thresholds
are met

Validate payment methods for free trial signups without charging until trial
ends

Verify payment capability before providing services or access

***

## How It Works

### Customer Provides Card Details

Customer enters their card information (including CVV) through your checkout flow.

### Zero Authorization is Processed

Coinflow sends a \$0.00 authorization to validate the card with the card network.

### Credentials are Stored

On success, the card is tokenized and securely stored in Coinflow's PCI-compliant vault.

### You Receive a Payment ID

The response includes a `paymentId` that you may use as the `originalPaymentId` for future card on file or merchant initiated transactions.

### Card Payment Authorized Webhook

You receive `Card Payment Authorized` webhook event if subscribed

***

## Implementation Options

Zero Authorization can be implemented in two ways:

1. **SDK Integration** - Using Coinflow's prebuilt UI with `zeroAuthorizationConfig`
2. **API Integration** - Direct API call to the Zero Authorization endpoint

***

## Option 1: SDK Integration

The simplest way to implement Zero Authorization is using Coinflow's SDK. You can configure the behavior using `zeroAuthorizationConfig`

### Configuration Options

The `zeroAuthorizationConfig` prop gives you fine-grained control over the zero authorization UI:

| Configuration                           | Description                                                                                                                                      |
| :-------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ disableSavedPaymentMethods: true }`  | **Add New Card Mode** - Hides saved payment methods, showing only the new card entry form                                                        |
| `{ disableSavedPaymentMethods: false }` | **Show Saved Methods Mode** - Displays saved payment methods for the user to select or add a new card                                            |
| `{ cardToken: "token_abc123" }`         | **Verify Card Mode** - Pre-selects a specific saved card for verification. If the token doesn't match a saved card, falls back to new card entry |

The `cardToken` value shown above is an **example**. You must use the actual card token from your customer's saved payment methods. Card tokens are returned when a customer saves a card through the Coinflow checkout flow.

### Basic Example

```jsx
import {CoinflowPurchase} from '@coinflow/react';

function ZeroAuthCheckout({wallet, connection, onSuccess}) {
  return (
    <CoinflowPurchase
      wallet={wallet}
      connection={connection}
      merchantId="your-merchant-id"
      env="sandbox"
      zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
      onSuccess={({paymentId}) => {
        // Save paymentId for future COF/MIT transactions
        console.log('Zero auth successful, paymentId:', paymentId);
        onSuccess(paymentId);
      }}
    />
  );
}
```

```jsx
import {CoinflowPurchase} from '@coinflow/react-native';

function ZeroAuthCheckout({wallet, onSuccess}) {
  return (
    <CoinflowPurchase
      wallet={wallet}
      merchantId="your-merchant-id"
      env="sandbox"
      zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
      onSuccess={({paymentId}) => {
        // Save paymentId for future COF/MIT transactions
        onSuccess(paymentId);
      }}
    />
  );
}
```

```vue
<template>
  <CoinflowPurchase
    :wallet="wallet"
    :connection="connection"
    merchantId="your-merchant-id"
    env="sandbox"
    :zeroAuthorizationConfig="{ disableSavedPaymentMethods: true }"
    @success="handleSuccess"
  />
</template>

<script>
export default {
  methods: {
    handleSuccess({paymentId}) {
      // Save paymentId for future COF/MIT transactions
      this.savedPaymentId = paymentId;
    },
  },
};
</script>
```

### Verify Existing Card Example

If you want to re-verify a specific saved card (for example, to update stored credentials), use the `cardToken` configuration:

```jsx
import {CoinflowPurchase} from '@coinflow/react';

function VerifyCardCheckout({wallet, connection, cardToken, onSuccess}) {
  return (
    <CoinflowPurchase
      wallet={wallet}
      connection={connection}
      merchantId="your-merchant-id"
      env="sandbox"
      zeroAuthorizationConfig={{ cardToken }}
      onSuccess={({paymentId}) => {
        console.log('Card verified, paymentId:', paymentId);
        onSuccess(paymentId);
      }}
    />
  );
}
```

```jsx
import {CoinflowPurchase} from '@coinflow/react-native';

function VerifyCardCheckout({wallet, cardToken, onSuccess}) {
  return (
    <CoinflowPurchase
      wallet={wallet}
      merchantId="your-merchant-id"
      env="sandbox"
      zeroAuthorizationConfig={{ cardToken }}
      onSuccess={({paymentId}) => {
        onSuccess(paymentId);
      }}
    />
  );
}
```

When using `cardToken`, if the specified token doesn't belong to the current user's saved cards, the UI will automatically fall back to showing the "Add New Card" form.

**SDK Benefits**

Using the SDK for Zero Authorization automatically handles:

* PCI-compliant card entry UI
* 3DS challenges if required
* Customer consent and compliance messaging
* Error handling and validation

***

## Option 2: API Integration

For headless implementations or custom UI flows, use the Zero Authorization API endpoint directly.

```bash
POST /api/checkout/zero-authorization/{merchantId}
```

[View Zero Authorization API Reference](/api-reference/api-reference/checkout/zero-authorization)

### Request Parameters

| Parameter             | Required | Description                                                     |
| --------------------- | -------- | --------------------------------------------------------------- |
| `card`                | Yes\*    | Card details object (if not using a saved token)                |
| `card.number`         | Yes\*    | The card number                                                 |
| `card.expiryMonth`    | Yes\*    | Card expiration month (MM format)                               |
| `card.expiryYear`     | Yes\*    | Card expiration year (YYYY format)                              |
| `card.cvv`            | Yes\*    | Card CVV/security code                                          |
| `token`               | Yes\*    | Previously tokenized card token (if not using raw card details) |
| `webhookInfo`         | No       | Custom webhook data to be sent to your webhook endpoint         |
| `customerInfo`        | No       | Additional information about the customer                       |
| `statementDescriptor` | No       | If supported, this text will appear on the customer's statement |
| `authentication3DS`   | No       | 3DS authentication data if required by the card issuer          |

*\*Either `card` or `token` is required, but not both.*

### Using a New Card

```bash
curl --request POST \
  --url https://api-sandbox.coinflow.cash/api/checkout/zero-authorization/your-merchant-id \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header 'x-user-id: customer-123' \
  --data '{
    "card": {
      "number": "4111111111111111",
      "expiryMonth": "12",
      "expiryYear": "2025",
      "cvv": "123"
    }
  }'
```

### Using a Saved Token

If the customer has a previously tokenized card, you can use the token instead:

```bash
curl --request POST \
  --url https://api-sandbox.coinflow.cash/api/checkout/zero-authorization/your-merchant-id \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header 'x-user-id: customer-123' \
  --data '{
    "token": "4111114324324111_bt"
  }'
```

### Response

A successful Zero Authorization returns the payment ID:

```json
{
  "paymentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Save the Payment ID**

Store this `paymentId` securely. You'll use it as the `originalPaymentId` when processing future Card on File or Merchant Initiated Transactions.

***

## Using Zero Authorization for Card on File

After completing a Zero Authorization, use the `paymentId` as the `originalPaymentId` for Card on File transactions:

```bash
curl --request POST \
  --url https://api-sandbox.coinflow.cash/api/checkout/card-on-file \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header 'Authorization: your-merchant-api-key' \
  --header 'x-user-id: customer-123' \
  --data '{
    "subtotal": {
      "cents": 2500,
      "currency": "USD"
    },
    "originalPaymentId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Customer Must Be Present**

Card on File transactions require the customer to actively participate in the transaction. For charges without customer involvement, use [Merchant Initiated Transactions](/guides/checkout/payment-scenarios/subsequent-transactions/merchant-initiated-transactions).

[Learn More About Card on File →](/guides/checkout/payment-scenarios/subsequent-transactions/card-on-file)

***

## Using Zero Authorization for Merchant Initiated Transactions

For charges where the merchant initiates payment without customer involvement (usage-based billing, account top-ups, etc.), use the `paymentId` as the `originalPaymentId` for MIT:

```bash
curl --request POST \
  --url https://api-sandbox.coinflow.cash/api/checkout/merchant-initiated-transaction \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header 'Authorization: your-merchant-api-key' \
  --header 'x-user-id: customer-123' \
  --data '{
    "subtotal": {
      "cents": 5000,
      "currency": "USD"
    },
    "originalPaymentId": "550e8400-e29b-41d4-a716-446655440000",
    "settlementType": "Bank"
  }'
```

**MIT Amount Limits with Zero Authorization**

When using Zero Authorization as the original payment for MIT, the maximum charge amount is determined by your merchant's `maxZeroAuthAmount` setting multiplied by the `maxMultiple`. Contact your Coinflow integration representative to configure these limits.

[Learn More About Merchant Initiated Transactions →](/guides/checkout/payment-scenarios/subsequent-transactions/merchant-initiated-transactions)

***

## Complete Example Flow

Here's a complete example showing Zero Authorization followed by both COF and MIT transactions:

### Step 1: Perform Zero Authorization

```bash Zero Authorization Request
curl --request POST \
  --url https://api-sandbox.coinflow.cash/api/checkout/zero-authorization/your-merchant-id \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header 'x-user-id: customer-123' \
  --data '{
    "card": {
      "number": "4111111111111111",
      "expiryMonth": "12",
      "expiryYear": "2025",
      "cvv": "123"
    }
  }'
```

```json Response
{
  "paymentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Step 2a: Card on File Transaction (Customer Present)

```bash Card on File Request
curl --request POST \
  --url https://api-sandbox.coinflow.cash/api/checkout/card-on-file \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header 'Authorization: your-merchant-api-key' \
  --header 'x-user-id: customer-123' \
  --data '{
    "subtotal": {
      "cents": 1500,
      "currency": "USD"
    },
    "originalPaymentId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

```json Response
{
  "paymentId": "650e8400-e29b-41d4-a716-446655440001"
}
```

### Step 2b: Merchant Initiated Transaction (No Customer Involvement)

```bash MIT Request
curl --request POST \
  --url https://api-sandbox.coinflow.cash/api/checkout/merchant-initiated-transaction \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header 'Authorization: your-merchant-api-key' \
  --header 'x-user-id: customer-123' \
  --data '{
    "subtotal": {
      "cents": 3500,
      "currency": "USD"
    },
    "originalPaymentId": "550e8400-e29b-41d4-a716-446655440000",
    "settlementType": "Bank"
  }'
```

```json Response
{
  "paymentId": "750e8400-e29b-41d4-a716-446655440002"
}
```

***

## Error Handling

**Error Message:**

```
Zero Authorization not enabled. Please contact your integrations representative.
```

**Cause:** Zero Authorization requires Card on File or MIT to be enabled on your merchant account.

**Resolution:**

* Contact your Coinflow integration representative to enable Card on File and/or MIT
* Once enabled, Zero Authorization will be available

**Error Message:**

```
Invalid card data provided
```

**Cause:** The card details provided are invalid or incomplete.

**Resolution:**

* Verify all required card fields are provided (number, expiryMonth, expiryYear, cvv)
* Ensure the card number passes basic validation (Luhn check)
* Confirm expiration date is in the future

**Error Message:**

```
3DS Challenge required
```

**Cause:** The card issuer requires 3D Secure authentication.

**Resolution:**

* Handle the 3DS challenge flow by presenting the challenge URL to the customer
* After customer completes verification, retry with the `authentication3DS` data

[Learn More About 3DS →](/guides/checkout/payment-security-risk-management/fraud-protection/about-chargeback-protection)

***

## Best Practices

When performing a Zero Authorization, clearly communicate to the customer why
you're storing their card and how it will be used (e.g., "We'll save your card
for automatic billing based on your usage").

Some card issuers require 3DS authentication even for Zero Authorization.
Implement proper 3DS handling to ensure successful card storage.

The `paymentId` returned is your reference for future transactions. Store it
securely and associate it with the customer in your database.

***

## Frequently Asked Questions

No. Zero Authorization creates a \$0.00 authorization that validates the card
without charging the customer.

No. Mobile wallet payments (Apple Pay, Google Pay) cannot be used with Zero
Authorization yet.

Tokenization converts card details into a secure token for storage. Zero
Authorization performs tokenization AND validates the card with a \$0
authorization, establishing it as a reference for future COF/MIT transactions.

***

## Next Steps

Learn how to process payments with stored credentials when the customer is present

Process charges without customer involvement using stored credentials

Test your Zero Authorization implementation

Handle 3DS challenges for Zero Authorization