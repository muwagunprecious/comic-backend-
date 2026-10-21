const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// In-Memory/Persistent fallback storage for when DATABASE_URL is not yet configured
class MemoryStore {
  constructor() {
    this.registrations = [];
    this.payments = [];
    this.fulfilment = [];
    this.settings = {
      campaign_name: "Largest Collaborative Comic Book Project",
      organization: "Slum Art Foundation",
      min_donation_ngn: 1000,
      popup_enabled: true,
      popup_trigger: "first_visit",
      pickup_location: "Slum Art Foundation Creative Hub, Lagos, Nigeria (Exact address and collection schedule will be communicated after registration)",
      contact_email: "info@slumart.org",
      contact_phone: "+234 800 SLUM ART",
      lead_artist: "Adetunwase Adenle (4X Guinness World Record Holder)",
      cause: "PET Bottle School & Playground Construction across African Schools",
      paystack_enabled: !!config.paystack.secretKey,
      flutterwave_enabled: !!config.flutterwave.secretKey,
      test_mode: !config.paystack.secretKey && !config.flutterwave.secretKey
    };
  }

  async createRegistration(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const reg = {
      id,
      registration_reference: data.registration_reference,
      full_name: data.full_name,
      email: data.email || null,
      phone_number: data.phone_number,
      date_of_birth: data.date_of_birth || null,
      comic_format: data.comic_format,
      physical_fulfilment: data.physical_fulfilment || null,
      delivery_address: data.delivery_address || null,
      delivery_instructions: data.delivery_instructions || null,
      privacy_consent_at: now,
      created_at: now,
      updated_at: now
    };
    this.registrations.push(reg);
    return reg;
  }

  async getRegistrationByReference(reference) {
    return this.registrations.find(r => r.registration_reference === reference) || null;
  }

  async getRegistrationById(id) {
    return this.registrations.find(r => r.id === id) || null;
  }

  async createPayment(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const payment = {
      id,
      registration_id: data.registration_id,
      payment_reference: data.payment_reference,
      gateway: data.gateway || 'paystack',
      amount: parseFloat(data.amount),
      currency: data.currency || 'NGN',
      payment_status: data.payment_status || 'pending',
      gateway_transaction_id: data.gateway_transaction_id || null,
      verified_at: data.verified_at || null,
      created_at: now,
      updated_at: now
    };
    this.payments.push(payment);
    return payment;
  }

  async getPaymentByReference(reference) {
    return this.payments.find(p => p.payment_reference === reference) || null;
  }

  async getPaymentByRegistrationId(regId) {
    return this.payments.find(p => p.registration_id === regId) || null;
  }

  async updatePaymentStatus(paymentReference, status, gatewayTxId = null, verifiedAt = null) {
    const payment = this.payments.find(p => p.payment_reference === paymentReference);
    if (!payment) return null;

    payment.payment_status = status;
    if (gatewayTxId) payment.gateway_transaction_id = gatewayTxId;
    if (verifiedAt) payment.verified_at = verifiedAt;
    payment.updated_at = new Date().toISOString();
    return payment;
  }

  async createFulfilment(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const ful = {
      id,
      registration_id: data.registration_id,
      fulfilment_status: data.fulfilment_status || 'pending',
      delivery_fee: parseFloat(data.delivery_fee || 0),
      collection_location: data.collection_location || null,
      tracking_reference: data.tracking_reference || null,
      created_at: now,
      updated_at: now
    };
    this.fulfilment.push(ful);
    return ful;
  }

  async getFulfilmentByRegistrationId(regId) {
    return this.fulfilment.find(f => f.registration_id === regId) || null;
  }

  async updateFulfilmentStatus(registrationId, status, trackingReference = null) {
    let ful = this.fulfilment.find(f => f.registration_id === registrationId);
    if (!ful) {
      ful = await this.createFulfilment({
        registration_id: registrationId,
        fulfilment_status: status,
        tracking_reference: trackingReference
      });
      return ful;
    }
    ful.fulfilment_status = status;
    if (trackingReference !== null) ful.tracking_reference = trackingReference;
    ful.updated_at = new Date().toISOString();
    return ful;
  }

  async getAllRegistrations(filters = {}) {
    const { search, format, fulfilment, payment_status, page = 1, limit = 50 } = filters;
    let list = this.registrations.map(r => {
      const payment = this.payments.find(p => p.registration_id === r.id);
      const ful = this.fulfilment.find(f => f.registration_id === r.id);
      return {
        ...r,
        payment_status: payment ? payment.payment_status : 'pending',
        amount: payment ? payment.amount : 0,
        currency: payment ? payment.currency : 'NGN',
        payment_reference: payment ? payment.payment_reference : null,
        gateway: payment ? payment.gateway : null,
        verified_at: payment ? payment.verified_at : null,
        fulfilment_status: ful ? ful.fulfilment_status : 'pending',
        tracking_reference: ful ? ful.tracking_reference : null
      };
    });

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.full_name && r.full_name.toLowerCase().includes(q)) ||
        (r.phone_number && r.phone_number.includes(q)) ||
        (r.registration_reference && r.registration_reference.toLowerCase().includes(q)) ||
        (r.payment_reference && r.payment_reference.toLowerCase().includes(q))
      );
    }

    if (format) {
      list = list.filter(r => r.comic_format === format);
    }

    if (fulfilment) {
      list = list.filter(r => r.physical_fulfilment === fulfilment);
    }

    if (payment_status) {
      list = list.filter(r => r.payment_status === payment_status);
    }

    // Sort descending by created_at
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = list.length;
    const startIndex = (page - 1) * limit;
    const paginated = list.slice(startIndex, startIndex + parseInt(limit));

    return {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit) || 1,
      data: paginated
    };
  }

  async getMetrics() {
    const totalRegistrations = this.registrations.length;
    const paidPayments = this.payments.filter(p => p.payment_status === 'successful');
    const pendingPayments = this.payments.filter(p => p.payment_status === 'pending');
    const failedPayments = this.payments.filter(p => p.payment_status === 'failed' || p.payment_status === 'cancelled');

    const totalContributionsNgn = paidPayments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
    const digitalCount = this.registrations.filter(r => r.comic_format === 'digital').length;
    const physicalCount = this.registrations.filter(r => r.comic_format === 'physical').length;
    const deliveryCount = this.registrations.filter(r => r.physical_fulfilment === 'delivery').length;
    const pickupCount = this.registrations.filter(r => r.physical_fulfilment === 'pickup').length;

    return {
      totalRegistrations,
      paidCount: paidPayments.length,
      pendingCount: pendingPayments.length,
      failedCount: failedPayments.length,
      totalContributionsNgn,
      digitalCount,
      physicalCount,
      deliveryCount,
      pickupCount
    };
  }

  async getSettings() {
    return {
      ...this.settings,
      paystack_configured: !!config.paystack.secretKey,
      flutterwave_configured: !!config.flutterwave.secretKey
    };
  }

  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    return this.settings;
  }
}

// Postgres pool initialization if DATABASE_URL is available
let pool = null;
if (config.databaseUrl) {
  try {
    const requiresSsl = config.databaseUrl.includes('neon.tech') || 
                        config.databaseUrl.includes('sslmode=require') || 
                        process.env.NODE_ENV === 'production';
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: requiresSsl ? { rejectUnauthorized: false } : false
    });
  } catch (err) {
    console.error('Error initializing PostgreSQL pool:', err);
  }
}

const memoryStore = new MemoryStore();

// DB Abstraction API
class DatabaseService {
  async init() {
    if (pool) {
      try {
        const client = await pool.connect();
        client.release();
        console.log('PostgreSQL connected successfully.');
      } catch (err) {
        console.warn('PostgreSQL connection failed, falling back to in-memory store:', err.message);
      }
    }
  }

  async createRegistration(data) {
    if (!pool) return memoryStore.createRegistration(data);
    const query = `
      INSERT INTO registrations (
        registration_reference, full_name, email, phone_number, date_of_birth,
        comic_format, physical_fulfilment, delivery_address, delivery_instructions, privacy_consent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *;
    `;
    const values = [
      data.registration_reference,
      data.full_name,
      data.email || null,
      data.phone_number,
      data.date_of_birth || null,
      data.comic_format,
      data.physical_fulfilment || null,
      data.delivery_address || null,
      data.delivery_instructions || null
    ];
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  async getRegistrationByReference(reference) {
    if (!pool) return memoryStore.getRegistrationByReference(reference);
    const res = await pool.query('SELECT * FROM registrations WHERE registration_reference = $1', [reference]);
    return res.rows[0] || null;
  }

  async getRegistrationById(id) {
    if (!pool) return memoryStore.getRegistrationById(id);
    const res = await pool.query('SELECT * FROM registrations WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async createPayment(data) {
    if (!pool) return memoryStore.createPayment(data);
    const query = `
      INSERT INTO payments (
        registration_id, payment_reference, gateway, amount, currency, payment_status, gateway_transaction_id, verified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [
      data.registration_id,
      data.payment_reference,
      data.gateway || 'paystack',
      data.amount,
      data.currency || 'NGN',
      data.payment_status || 'pending',
      data.gateway_transaction_id || null,
      data.verified_at || null
    ];
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  async getPaymentByReference(reference) {
    if (!pool) return memoryStore.getPaymentByReference(reference);
    const res = await pool.query('SELECT * FROM payments WHERE payment_reference = $1', [reference]);
    return res.rows[0] || null;
  }

  async getPaymentByRegistrationId(regId) {
    if (!pool) return memoryStore.getPaymentByRegistrationId(regId);
    const res = await pool.query('SELECT * FROM payments WHERE registration_id = $1 ORDER BY created_at DESC LIMIT 1', [regId]);
    return res.rows[0] || null;
  }

  async updatePaymentStatus(paymentReference, status, gatewayTxId = null, verifiedAt = null) {
    if (!pool) return memoryStore.updatePaymentStatus(paymentReference, status, gatewayTxId, verifiedAt);
    const query = `
      UPDATE payments 
      SET payment_status = $1, 
          gateway_transaction_id = COALESCE($2, gateway_transaction_id), 
          verified_at = COALESCE($3, verified_at),
          updated_at = NOW()
      WHERE payment_reference = $4
      RETURNING *;
    `;
    const res = await pool.query(query, [status, gatewayTxId, verifiedAt, paymentReference]);
    return res.rows[0] || null;
  }

  async createFulfilment(data) {
    if (!pool) return memoryStore.createFulfilment(data);
    const query = `
      INSERT INTO fulfilment (
        registration_id, fulfilment_status, delivery_fee, collection_location, tracking_reference
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [
      data.registration_id,
      data.fulfilment_status || 'pending',
      data.delivery_fee || 0,
      data.collection_location || null,
      data.tracking_reference || null
    ];
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  async getFulfilmentByRegistrationId(regId) {
    if (!pool) return memoryStore.getFulfilmentByRegistrationId(regId);
    const res = await pool.query('SELECT * FROM fulfilment WHERE registration_id = $1', [regId]);
    return res.rows[0] || null;
  }

  async updateFulfilmentStatus(registrationId, status, trackingReference = null) {
    if (!pool) return memoryStore.updateFulfilmentStatus(registrationId, status, trackingReference);
    const query = `
      INSERT INTO fulfilment (registration_id, fulfilment_status, tracking_reference, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (registration_id) 
      DO UPDATE SET fulfilment_status = $2, tracking_reference = COALESCE($3, fulfilment.tracking_reference), updated_at = NOW()
      RETURNING *;
    `;
    const res = await pool.query(query, [registrationId, status, trackingReference]);
    return res.rows[0] || null;
  }

  async getAllRegistrations(filters = {}) {
    if (!pool) return memoryStore.getAllRegistrations(filters);
    const { search, format, fulfilment, payment_status, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let values = [];
    let idx = 1;

    if (search) {
      whereClauses.push(`(r.full_name ILIKE $${idx} OR r.phone_number ILIKE $${idx} OR r.registration_reference ILIKE $${idx} OR p.payment_reference ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }
    if (format) {
      whereClauses.push(`r.comic_format = $${idx}`);
      values.push(format);
      idx++;
    }
    if (fulfilment) {
      whereClauses.push(`r.physical_fulfilment = $${idx}`);
      values.push(fulfilment);
      idx++;
    }
    if (payment_status) {
      whereClauses.push(`p.payment_status = $${idx}`);
      values.push(payment_status);
      idx++;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM registrations r
      LEFT JOIN payments p ON r.id = p.registration_id
      ${whereStr}
    `;
    const countRes = await pool.query(countQuery, values);
    const total = parseInt(countRes.rows[0].total, 10);

    const dataQuery = `
      SELECT r.*, 
             p.payment_reference, p.gateway, p.amount, p.currency, p.payment_status, p.verified_at,
             f.fulfilment_status, f.tracking_reference
      FROM registrations r
      LEFT JOIN payments p ON r.id = p.registration_id
      LEFT JOIN fulfilment f ON r.id = f.registration_id
      ${whereStr}
      ORDER BY r.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    values.push(limit, offset);
    const dataRes = await pool.query(dataQuery, values);

    return {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit) || 1,
      data: dataRes.rows
    };
  }

  async getMetrics() {
    if (!pool) return memoryStore.getMetrics();
    const query = `
      SELECT 
        (SELECT COUNT(*) FROM registrations) as total_registrations,
        (SELECT COUNT(*) FROM payments WHERE payment_status = 'successful') as paid_count,
        (SELECT COUNT(*) FROM payments WHERE payment_status = 'pending') as pending_count,
        (SELECT COUNT(*) FROM payments WHERE payment_status IN ('failed', 'cancelled')) as failed_count,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_status = 'successful') as total_contributions_ngn,
        (SELECT COUNT(*) FROM registrations WHERE comic_format = 'digital') as digital_count,
        (SELECT COUNT(*) FROM registrations WHERE comic_format = 'physical') as physical_count,
        (SELECT COUNT(*) FROM registrations WHERE physical_fulfilment = 'delivery') as delivery_count,
        (SELECT COUNT(*) FROM registrations WHERE physical_fulfilment = 'pickup') as pickup_count
    `;
    const res = await pool.query(query);
    const row = res.rows[0];
    return {
      totalRegistrations: parseInt(row.total_registrations, 10),
      paidCount: parseInt(row.paid_count, 10),
      pendingCount: parseInt(row.pending_count, 10),
      failedCount: parseInt(row.failed_count, 10),
      totalContributionsNgn: parseFloat(row.total_contributions_ngn),
      digitalCount: parseInt(row.digital_count, 10),
      physicalCount: parseInt(row.physical_count, 10),
      deliveryCount: parseInt(row.delivery_count, 10),
      pickupCount: parseInt(row.pickup_count, 10)
    };
  }

  async getSettings() {
    if (!pool) return memoryStore.getSettings();
    const res = await pool.query("SELECT value FROM campaign_settings WHERE key = 'general'");
    if (res.rows.length > 0) {
      return {
        ...res.rows[0].value,
        paystack_configured: !!config.paystack.secretKey,
        flutterwave_configured: !!config.flutterwave.secretKey
      };
    }
    return memoryStore.getSettings();
  }

  async updateSettings(newSettings) {
    if (!pool) return memoryStore.updateSettings(newSettings);
    const query = `
      INSERT INTO campaign_settings (key, value, updated_at)
      VALUES ('general', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
      RETURNING value;
    `;
    const res = await pool.query(query, [JSON.stringify(newSettings)]);
    return res.rows[0].value;
  }
}

const db = new DatabaseService();
module.exports = db;
