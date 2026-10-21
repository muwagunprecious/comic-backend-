const config = require('../config');

class FlutterwaveService {
  constructor() {
    this.secretKey = config.flutterwave.secretKey;
    this.baseUrl = config.flutterwave.baseUrl;
  }

  isConfigured() {
    return !!this.secretKey;
  }

  /**
   * Initialize a payment transaction with Flutterwave Standard
   */
  async initializeTransaction({ email, amount, reference, callback_url, metadata = {}, customer = {} }) {
    if (!this.isConfigured()) {
      return {
        status: 'success',
        message: 'Test mode transaction initialized',
        data: {
          link: `${config.frontendUrl}/comic/contribute?test_checkout=true&reference=${reference}&amount=${amount}&gateway=flutterwave`,
          reference: reference
        },
        isTestMode: true
      };
    }

    const response = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tx_ref: reference,
        amount: parseFloat(amount),
        currency: 'NGN',
        redirect_url: callback_url,
        meta: metadata,
        customer: {
          email: email || `donor_${reference}@slumart.org`,
          phonenumber: customer.phone_number || '',
          name: customer.full_name || 'Supporter'
        },
        customizations: {
          title: 'Largest Collaborative Comic Book Project',
          description: 'Contribution for African Schools Playgrounds',
          logo: 'https://slumart.org/assets/logo.png'
        }
      })
    });

    const data = await response.json();
    if (!response.ok || data.status !== 'success') {
      throw new Error(data.message || 'Flutterwave initialization failed');
    }

    return {
      status: 'success',
      message: data.message,
      data: {
        link: data.data.link,
        reference: reference
      },
      isTestMode: false
    };
  }

  /**
   * Verify transaction with Flutterwave API
   */
  async verifyTransaction(transactionIdOrRef) {
    if (!this.isConfigured()) {
      return {
        status: 'success',
        message: 'Flutterwave test transaction verified',
        data: {
          tx_ref: transactionIdOrRef,
          status: 'successful',
          amount: 1000,
          currency: 'NGN',
          id: `FLW_TEST_${Date.now()}`
        },
        isTestMode: true
      };
    }

    // Flutterwave can verify by transaction ID
    const url = `${this.baseUrl}/transactions/${encodeURIComponent(transactionIdOrRef)}/verify`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    if (!response.ok || data.status !== 'success') {
      throw new Error(data.message || 'Flutterwave verification failed');
    }

    return {
      status: 'success',
      data: data.data,
      isSuccess: data.data.status === 'successful',
      isTestMode: false
    };
  }
}

module.exports = new FlutterwaveService();
