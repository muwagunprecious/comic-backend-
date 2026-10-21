const crypto = require('crypto');
const config = require('../config');

class PaystackService {
  constructor() {
    this.secretKey = config.paystack.secretKey;
    this.baseUrl = config.paystack.baseUrl;
  }

  isConfigured() {
    return !!this.secretKey;
  }

  /**
   * Initialize a payment transaction
   * @param {Object} params - { email, amount, reference, callback_url, metadata }
   */
  async initializeTransaction({ email, amount, reference, callback_url, metadata = {} }) {
    if (!this.isConfigured()) {
      // Return simulated test checkout URL if live keys not yet added
      return {
        status: true,
        message: 'Test mode transaction initialized',
        data: {
          authorization_url: `${config.frontendUrl}/comic/contribute?test_checkout=true&reference=${reference}&amount=${amount}`,
          access_code: `TEST_${reference}`,
          reference: reference
        },
        isTestMode: true
      };
    }

    // Paystack amounts are in kobo (NGN 1000 = 100000 kobo)
    const amountInKobo = Math.round(parseFloat(amount) * 100);

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email || `donor_${reference}@slumart.org`,
        amount: amountInKobo,
        reference: reference,
        callback_url: callback_url,
        currency: 'NGN',
        metadata: {
          ...metadata,
          custom_fields: [
            {
              display_name: 'Campaign',
              variable_name: 'campaign',
              value: 'Largest Collaborative Comic Book Project'
            },
            {
              display_name: 'Initiative',
              variable_name: 'initiative',
              value: 'Slum Art Foundation - Playgrounds for African Schools'
            }
          ]
        }
      })
    });

    const data = await response.json();
    if (!response.ok || !data.status) {
      throw new Error(data.message || 'Paystack initialization failed');
    }

    return {
      status: true,
      message: data.message,
      data: data.data,
      isTestMode: false
    };
  }

  /**
   * Verify a transaction with Paystack API
   * @param {string} reference 
   */
  async verifyTransaction(reference) {
    if (!this.isConfigured()) {
      // In test mode, allow verification of test references
      return {
        status: true,
        message: 'Verification successful (Test Mode)',
        data: {
          reference,
          status: 'success',
          gateway_response: 'Successful (Test)',
          paid_at: new Date().toISOString(),
          channel: 'test_card',
          currency: 'NGN',
          id: `TEST_TX_${Date.now()}`
        },
        isTestMode: true
      };
    }

    const response = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    if (!response.ok || !data.status) {
      throw new Error(data.message || 'Paystack verification failed');
    }

    return {
      status: true,
      data: data.data,
      isSuccess: data.data.status === 'success',
      isTestMode: false
    };
  }

  /**
   * Verify Paystack webhook signature
   * @param {string} signature 
   * @param {string|Buffer} rawBody 
   */
  verifyWebhookSignature(signature, rawBody) {
    if (!this.secretKey) return false;
    const hash = crypto.createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    return hash === signature;
  }
}

module.exports = new PaystackService();
