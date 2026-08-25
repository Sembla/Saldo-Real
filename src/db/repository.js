import { randomUUID } from 'node:crypto';

function now() {
  return new Date().toISOString();
}

function mapSpace(row) {
  return row && {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    locale: row.locale,
    currentBalanceCents: row.current_balance_cents,
    emergencyBufferCents: row.emergency_buffer_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEntry(row) {
  return row && {
    id: row.id,
    spaceId: row.space_id,
    title: row.title,
    type: row.type,
    amountCents: row.amount_cents,
    category: row.category,
    date: row.date,
    recurrence: row.recurrence,
    recurrenceEnd: row.recurrence_end,
    confidence: row.confidence,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDebt(row) {
  return row && {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    balanceCents: row.balance_cents,
    minimumPaymentCents: row.minimum_payment_cents,
    annualInterestRate: row.annual_interest_rate,
    dueDay: row.due_day,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGoal(row) {
  return row && {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    targetCents: row.target_cents,
    currentCents: row.current_cents,
    targetDate: row.target_date,
    kind: row.kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createRepository(db) {
  return {
    transaction(callback) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = callback();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    createUser({ email, name, passwordHash, locale = 'pt-BR' }) {
      const id = randomUUID();
      const timestamp = now();
      db.prepare(`INSERT INTO users (id, email, name, password_hash, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, email, name, passwordHash, locale, timestamp, timestamp);
      return { id, email, name, locale, createdAt: timestamp };
    },

    findUserByEmail(email) {
      return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    },

    findUserById(id) {
      const row = db.prepare('SELECT id, email, name, locale, created_at FROM users WHERE id = ?').get(id);
      return row && { id: row.id, email: row.email, name: row.name, locale: row.locale, createdAt: row.created_at };
    },

    findUserCredentialsById(id) {
      return db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(id);
    },

    updateUserPassword(id, passwordHash) {
      return db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(passwordHash, now(), id).changes;
    },

    deleteUser(id) {
      return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes;
    },

    exportUserData(id) {
      const user = this.findUserById(id);
      if (!user) return null;
      const spaces = this.listSpaces(id).map((space) => ({
        ...space,
        entries: db.prepare('SELECT * FROM entries WHERE space_id = ? ORDER BY date, created_at')
          .all(space.id).map(mapEntry),
        debts: db.prepare('SELECT * FROM debts WHERE space_id = ? ORDER BY created_at')
          .all(space.id).map(mapDebt),
        goals: db.prepare('SELECT * FROM goals WHERE space_id = ? ORDER BY created_at')
          .all(space.id).map(mapGoal),
      }));
      const auditEvents = db.prepare(`SELECT action, entity_type, entity_id, metadata_json, created_at
        FROM audit_events WHERE user_id = ? ORDER BY created_at`).all(id).map((row) => ({
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: JSON.parse(row.metadata_json),
        createdAt: row.created_at,
      }));
      return {
        exportVersion: 1,
        exportedAt: now(),
        user,
        spaces,
        auditEvents,
      };
    },

    createSession({ userId, tokenHash, expiresAt }) {
      const id = randomUUID();
      const timestamp = now();
      db.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, userId, tokenHash, expiresAt, timestamp, timestamp);
      return id;
    },

    findSession(tokenHash) {
      return db.prepare(`SELECT s.id, s.user_id, s.expires_at, u.email, u.name, u.locale
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash, now());
    },

    touchSession(id) {
      db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now(), id);
    },

    deleteSession(tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },

    deleteSessionsForUser(userId) {
      return db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
    },

    purgeExpiredSessions() {
      return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now()).changes;
    },

    createSpace(ownerId, input) {
      const id = randomUUID();
      const timestamp = now();
      db.prepare(`INSERT INTO spaces
        (id, owner_id, name, kind, currency, locale, current_balance_cents, emergency_buffer_cents, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, ownerId, input.name, input.kind, input.currency, input.locale,
        input.currentBalanceCents, input.emergencyBufferCents, timestamp, timestamp,
      );
      return this.getSpace(ownerId, id);
    },

    listSpaces(ownerId) {
      return db.prepare('SELECT * FROM spaces WHERE owner_id = ? ORDER BY created_at').all(ownerId).map(mapSpace);
    },

    getSpace(ownerId, id) {
      return mapSpace(db.prepare('SELECT * FROM spaces WHERE id = ? AND owner_id = ?').get(id, ownerId));
    },

    updateSpace(ownerId, id, input) {
      db.prepare(`UPDATE spaces SET name = ?, kind = ?, currency = ?, locale = ?,
        current_balance_cents = ?, emergency_buffer_cents = ?, updated_at = ?
        WHERE id = ? AND owner_id = ?`).run(
        input.name, input.kind, input.currency, input.locale, input.currentBalanceCents,
        input.emergencyBufferCents, now(), id, ownerId,
      );
      return this.getSpace(ownerId, id);
    },

    deleteSpace(ownerId, id) {
      return db.prepare('DELETE FROM spaces WHERE id = ? AND owner_id = ?').run(id, ownerId).changes;
    },

    createEntry(ownerId, spaceId, input) {
      if (!this.getSpace(ownerId, spaceId)) return null;
      const id = randomUUID();
      const timestamp = now();
      db.prepare(`INSERT INTO entries
        (id, space_id, title, type, amount_cents, category, date, recurrence, recurrence_end, confidence, status, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, spaceId, input.title, input.type, input.amountCents, input.category, input.date,
        input.recurrence, input.recurrenceEnd, input.confidence, input.status, input.notes,
        timestamp, timestamp,
      );
      return this.getEntry(ownerId, id);
    },

    getEntry(ownerId, id) {
      return mapEntry(db.prepare(`SELECT e.* FROM entries e JOIN spaces s ON s.id = e.space_id
        WHERE e.id = ? AND s.owner_id = ?`).get(id, ownerId));
    },

    listEntries(ownerId, spaceId, { from, to, limit = 500 } = {}) {
      if (!this.getSpace(ownerId, spaceId)) return null;
      const conditions = ['space_id = ?'];
      const params = [spaceId];
      if (from) { conditions.push('(date >= ? OR recurrence != \'none\')'); params.push(from); }
      if (to) { conditions.push('date <= ?'); params.push(to); }
      params.push(limit);
      return db.prepare(`SELECT * FROM entries WHERE ${conditions.join(' AND ')}
        ORDER BY date, created_at LIMIT ?`).all(...params).map(mapEntry);
    },

    updateEntry(ownerId, id, input) {
      const current = this.getEntry(ownerId, id);
      if (!current) return null;
      db.prepare(`UPDATE entries SET title = ?, type = ?, amount_cents = ?, category = ?, date = ?,
        recurrence = ?, recurrence_end = ?, confidence = ?, status = ?, notes = ?, updated_at = ?
        WHERE id = ?`).run(
        input.title, input.type, input.amountCents, input.category, input.date, input.recurrence,
        input.recurrenceEnd, input.confidence, input.status, input.notes, now(), id,
      );
      return this.getEntry(ownerId, id);
    },

    deleteEntry(ownerId, id) {
      const current = this.getEntry(ownerId, id);
      if (!current) return 0;
      return db.prepare('DELETE FROM entries WHERE id = ?').run(id).changes;
    },

    createDebt(ownerId, spaceId, input) {
      if (!this.getSpace(ownerId, spaceId)) return null;
      const id = randomUUID();
      const timestamp = now();
      db.prepare(`INSERT INTO debts
        (id, space_id, name, balance_cents, minimum_payment_cents, annual_interest_rate, due_day, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, spaceId, input.name, input.balanceCents, input.minimumPaymentCents,
        input.annualInterestRate, input.dueDay, input.status, timestamp, timestamp,
      );
      return mapDebt(db.prepare('SELECT * FROM debts WHERE id = ?').get(id));
    },

    listDebts(ownerId, spaceId) {
      if (!this.getSpace(ownerId, spaceId)) return null;
      return db.prepare('SELECT * FROM debts WHERE space_id = ? ORDER BY created_at').all(spaceId).map(mapDebt);
    },

    deleteDebt(ownerId, id) {
      return db.prepare(`DELETE FROM debts WHERE id = ? AND space_id IN
        (SELECT id FROM spaces WHERE owner_id = ?)`).run(id, ownerId).changes;
    },

    createGoal(ownerId, spaceId, input) {
      if (!this.getSpace(ownerId, spaceId)) return null;
      const id = randomUUID();
      const timestamp = now();
      db.prepare(`INSERT INTO goals
        (id, space_id, name, target_cents, current_cents, target_date, kind, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, spaceId, input.name, input.targetCents, input.currentCents, input.targetDate,
        input.kind, timestamp, timestamp,
      );
      return mapGoal(db.prepare('SELECT * FROM goals WHERE id = ?').get(id));
    },

    listGoals(ownerId, spaceId) {
      if (!this.getSpace(ownerId, spaceId)) return null;
      return db.prepare('SELECT * FROM goals WHERE space_id = ? ORDER BY created_at').all(spaceId).map(mapGoal);
    },

    deleteGoal(ownerId, id) {
      return db.prepare(`DELETE FROM goals WHERE id = ? AND space_id IN
        (SELECT id FROM spaces WHERE owner_id = ?)`).run(id, ownerId).changes;
    },

    getCache(key) {
      const row = db.prepare('SELECT * FROM data_cache WHERE cache_key = ? AND expires_at > ?').get(key, now());
      return row && { ...JSON.parse(row.payload_json), cache: { fetchedAt: row.fetched_at, expiresAt: row.expires_at } };
    },

    setCache(key, sourceId, payload, ttlSeconds) {
      const fetchedAt = now();
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      db.prepare(`INSERT INTO data_cache (cache_key, source_id, payload_json, fetched_at, expires_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET
        source_id = excluded.source_id, payload_json = excluded.payload_json,
        fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`)
        .run(key, sourceId, JSON.stringify(payload), fetchedAt, expiresAt);
      return { ...payload, cache: { fetchedAt, expiresAt } };
    },

    audit({ userId = null, action, entityType, entityId = null, metadata = {} }) {
      db.prepare(`INSERT INTO audit_events
        (id, user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        randomUUID(), userId, action, entityType, entityId, JSON.stringify(metadata), now(),
      );
    },

    close() {
      db.close();
    },
  };
}
