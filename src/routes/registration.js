const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../services/db');
const config = require('../config');

// Helper to generate concise unique reference
function generateReference(prefix = 'SLUM') {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}-${random}-${timestamp}`;
}

/**
 * POST /api/register
 * Step 1-3 completion, creates registration & pending payment
 */
router.post('/', async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone_number,
      date_of_birth,
      comic_format,
      physical_fulfilment,
      delivery_address,
      delivery_instructions,
      privacy_consent,
      amount,
      gateway = 'paystack'
    } = req.body;

    // 1. Validation: Full Name
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid Full Name is required (at least 2 characters).'
      });
    }

    // 2. Validation: Phone Number
    if (!phone_number || typeof phone_number !== 'string' || phone_number.trim().length < 7) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid Phone Number is required.'
      });
    }

    // 3. Validation: Privacy Consent
    if (!privacy_consent) {
      return res.status(400).json({
        status: 'error',
        message: 'You must agree to the Privacy Policy and information terms to register.'
      });
    }

    // 4. Validation: Date of Birth
    if (date_of_birth) {
      const dob = new Date(date_of_birth);
      const now = new Date();
      if (isNaN(dob.getTime()) || dob > now) {
        return res.status(400).json({
          status: 'error',
          message: 'Date of birth cannot be in the future.'
        });
      }
    }

    // 5. Validation: Comic Format
    if (!comic_format || !['digital', 'physical'].includes(comic_format)) {
      return res.status(400).json({
        status: 'error',
        message: 'Comic format must be either "digital" or "physical".'
      });
    }

    // 6. Validation: Physical Fulfilment
    if (comic_format === 'physical') {
      if (!physical_fulfilment || !['delivery', 'pickup'].includes(physical_fulfilment)) {
        return res.status(400).json({
          status: 'error',
          message: 'Please choose either "delivery" or "pickup" for physical comic fulfilment.'
        });
      }

      if (physical_fulfilment === 'delivery' && (!delivery_address || delivery_address.trim().length < 5)) {
        return res.status(400).json({
          status: 'error',
          message: 'A complete delivery address is required for comic delivery.'
        });
      }
    }

    // 7. Validation: Contribution Amount
    const contributionAmount = parseFloat(amount) || config.minDonation;
    if (contributionAmount < config.minDonation) {
      return res.status(400).json({
        status: 'error',
        message: `The minimum contribution amount is ₦${config.minDonation.toLocaleString()}.`
      });
    }

    // Generate Unique Identifiers
    const registrationReference = generateReference('SLUM-REG');
    const paymentReference = generateReference('SLUM-PAY');

    // Create Registration Record in DB
    const registration = await db.createRegistration({
      registration_reference: registrationReference,
      full_name: full_name.trim(),
      email: email ? email.trim() : null,
      phone_number: phone_number.trim(),
      date_of_birth: date_of_birth || null,
      comic_format,
      physical_fulfilment: comic_format === 'physical' ? physical_fulfilment : null,
      delivery_address: comic_format === 'physical' && physical_fulfilment === 'delivery' ? delivery_address.trim() : null,
      delivery_instructions: comic_format === 'physical' && delivery_instructions ? delivery_instructions.trim() : null
    });

    // Create Initial Fulfilment Record if physical
    if (comic_format === 'physical') {
      await db.createFulfilment({
        registration_id: registration.id,
        fulfilment_status: 'pending',
        delivery_fee: 0, // Glovo fee is confirmed dynamically or separately
        collection_location: physical_fulfilment === 'pickup' ? 'Slum Art Foundation Hub, Lagos, Nigeria' : null
      });
    }

    // Create Pending Payment Record
    const payment = await db.createPayment({
      registration_id: registration.id,
      payment_reference: paymentReference,
      gateway: gateway.toLowerCase(),
      amount: contributionAmount,
      currency: 'NGN',
      payment_status: 'pending'
    });

    return res.status(201).json({
      status: 'success',
      message: 'Registration created successfully. Proceed to payment.',
      data: {
        registration_reference: registration.registration_reference,
        payment_reference: payment.payment_reference,
        full_name: registration.full_name,
        email: registration.email,
        phone_number: registration.phone_number,
        comic_format: registration.comic_format,
        physical_fulfilment: registration.physical_fulfilment,
        delivery_address: registration.delivery_address,
        amount: payment.amount,
        currency: payment.currency,
        gateway: payment.gateway,
        payment_status: payment.payment_status
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error during registration',
      error: err.message
    });
  }
});

/**
 * GET /api/registration/:reference
 * Retrieve registration and payment details by reference code
 */
router.get('/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const registration = await db.getRegistrationByReference(reference);

    if (!registration) {
      return res.status(404).json({
        status: 'error',
        message: 'Registration reference not found'
      });
    }

    const payment = await db.getPaymentByRegistrationId(registration.id);
    const fulfilment = await db.getFulfilmentByRegistrationId(registration.id);

    return res.json({
      status: 'success',
      data: {
        registration_reference: registration.registration_reference,
        full_name: registration.full_name,
        phone_number: registration.phone_number,
        date_of_birth: registration.date_of_birth,
        comic_format: registration.comic_format,
        physical_fulfilment: registration.physical_fulfilment,
        delivery_address: registration.delivery_address,
        delivery_instructions: registration.delivery_instructions,
        created_at: registration.created_at,
        payment: payment ? {
          payment_reference: payment.payment_reference,
          amount: payment.amount,
          currency: payment.currency,
          payment_status: payment.payment_status,
          gateway: payment.gateway,
          verified_at: payment.verified_at
        } : null,
        fulfilment: fulfilment ? {
          fulfilment_status: fulfilment.fulfilment_status,
          tracking_reference: fulfilment.tracking_reference,
          collection_location: fulfilment.collection_location
        } : null
      }
    });
  } catch (err) {
    console.error('Error fetching registration:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve registration',
      error: err.message
    });
  }
});

module.exports = router;
