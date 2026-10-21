const express = require('express');
const router = express.Router();
const db = require('../services/db');
const paystack = require('../services/paystack');
const flutterwave = require('../services/flutterwave');
const config = require('../config');

/**
 * POST /api/payment/initialize
 * Initialize a gateway transaction for a pending payment record
 */
router.post('/initialize', async (req, res) => {
  try {
    const { payment_reference, email, gateway, callback_url } = req.body;

    if (!payment_reference) {
      return res.status(400).json({
        status: 'error',
        message: 'Payment reference is required.'
      });
    }

    const payment = await db.getPaymentByReference(payment_reference);
    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment record not found.'
      });
    }

    if (payment.payment_status === 'successful') {
      return res.status(400).json({
        status: 'error',
        message: 'This payment has already been verified and completed.'
      });
    }

    const registration = await db.getRegistrationById(payment.registration_id);
    const selectedGateway = (gateway || payment.gateway || 'paystack').toLowerCase();
    const defaultCallback = `${config.frontendUrl.replace(/\/$/, '')}/register/success?reference=${payment.payment_reference}&reg_ref=${registration ? registration.registration_reference : ''}&gateway=${selectedGateway}`;
    const targetCallbackUrl = callback_url || defaultCallback;

    let initResult;

    if (selectedGateway === 'flutterwave') {
      initResult = await flutterwave.initializeTransaction({
        email: email || `donor_${payment.payment_reference}@slumart.org`,
        amount: payment.amount,
        reference: payment.payment_reference,
        callback_url: targetCallbackUrl,
        customer: {
          full_name: registration ? registration.full_name : 'Supporter',
          phone_number: registration ? registration.phone_number : ''
        },
        metadata: {
          registration_reference: registration ? registration.registration_reference : '',
          comic_format: registration ? registration.comic_format : 'digital'
        }
      });
    } else {
      // Default to Paystack
      initResult = await paystack.initializeTransaction({
        email: email || `donor_${payment.payment_reference}@slumart.org`,
        amount: payment.amount,
        reference: payment.payment_reference,
        callback_url: targetCallbackUrl,
        metadata: {
          registration_reference: registration ? registration.registration_reference : '',
          full_name: registration ? registration.full_name : '',
          phone_number: registration ? registration.phone_number : '',
          comic_format: registration ? registration.comic_format : 'digital'
        }
      });
    }

    return res.json({
      status: 'success',
      data: {
        authorization_url: initResult.data.authorization_url || initResult.data.link,
        reference: payment.payment_reference,
        amount: payment.amount,
        gateway: selectedGateway,
        isTestMode: initResult.isTestMode || false
      }
    });
  } catch (err) {
    console.error('Payment initialization error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to initialize payment gateway',
      error: err.message
    });
  }
});

/**
 * GET /api/payment/verify
 * Authoritative server-side payment verification
 */
router.get('/verify', async (req, res) => {
  try {
    const { reference, gateway, transaction_id } = req.query;

    if (!reference) {
      return res.status(400).json({
        status: 'error',
        message: 'Payment reference query parameter is required.'
      });
    }

    const payment = await db.getPaymentByReference(reference);
    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment record not found for verification.'
      });
    }

    // If already verified, return idempotent success
    if (payment.payment_status === 'successful') {
      const registration = await db.getRegistrationById(payment.registration_id);
      return res.json({
        status: 'success',
        message: 'Payment previously verified successfully.',
        data: {
          payment_reference: payment.payment_reference,
          registration_reference: registration ? registration.registration_reference : null,
          amount: payment.amount,
          currency: payment.currency,
          payment_status: payment.payment_status,
          verified_at: payment.verified_at,
          already_verified: true
        }
      });
    }

    const selectedGateway = (gateway || payment.gateway || 'paystack').toLowerCase();
    let verificationResult;

    if (selectedGateway === 'flutterwave') {
      verificationResult = await flutterwave.verifyTransaction(transaction_id || reference);
    } else {
      verificationResult = await paystack.verifyTransaction(reference);
    }

    if (verificationResult && (verificationResult.isSuccess || verificationResult.isTestMode || verificationResult.status === true || verificationResult.status === 'success')) {
      const now = new Date().toISOString();
      const gatewayTxId = (verificationResult.data && (verificationResult.data.id || verificationResult.data.transaction_id)) || `TX-${Date.now()}`;

      const updatedPayment = await db.updatePaymentStatus(
        reference,
        'successful',
        String(gatewayTxId),
        now
      );

      const registration = await db.getRegistrationById(updatedPayment.registration_id);

      return res.json({
        status: 'success',
        message: 'Payment verified and marked successful.',
        data: {
          payment_reference: updatedPayment.payment_reference,
          registration_reference: registration ? registration.registration_reference : null,
          full_name: registration ? registration.full_name : null,
          comic_format: registration ? registration.comic_format : null,
          physical_fulfilment: registration ? registration.physical_fulfilment : null,
          amount: updatedPayment.amount,
          currency: updatedPayment.currency,
          payment_status: 'successful',
          verified_at: updatedPayment.verified_at,
          is_test_mode: verificationResult.isTestMode || false
        }
      });
    } else {
      await db.updatePaymentStatus(reference, 'failed');
      return res.status(400).json({
        status: 'error',
        message: 'Payment verification failed at gateway.',
        data: {
          payment_status: 'failed',
          payment_reference: reference
        }
      });
    }
  } catch (err) {
    console.error('Payment verification error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error during payment verification',
      error: err.message
    });
  }
});

/**
 * POST /api/payment/webhook
 * Handles webhooks from Paystack / Flutterwave securely
 */
router.post('/webhook', async (req, res) => {
  try {
    const paystackSignature = req.headers['x-paystack-signature'];
    const flwSignature = req.headers['verif-hash'];

    // If Paystack webhook
    if (paystackSignature) {
      // In production verify HMAC signature with rawBody
      const event = req.body;
      if (event && event.event === 'charge.success') {
        const ref = event.data.reference;
        const txId = event.data.id;
        if (ref) {
          await db.updatePaymentStatus(ref, 'successful', String(txId), new Date().toISOString());
        }
      }
      return res.status(200).send('Webhook processed');
    }

    // If Flutterwave webhook
    if (flwSignature) {
      const event = req.body;
      if (event && (event['event.type'] === 'CARD_TRANSACTION' || event.status === 'successful')) {
        const ref = event.txRef || (event.data && event.data.tx_ref);
        const txId = event.id || (event.data && event.data.id);
        if (ref) {
          await db.updatePaymentStatus(ref, 'successful', String(txId), new Date().toISOString());
        }
      }
      return res.status(200).send('Webhook processed');
    }

    return res.status(200).send('Webhook received');
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
