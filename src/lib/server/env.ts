import 'dotenv/config';

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}

/**
 * Central runtime configuration. Getters so that importing this module never
 * throws at build time - values are only validated when actually used.
 */
export const env = {
	get databaseUrl(): string {
		return required('DATABASE_URL');
	},
	get sessionSecret(): string {
		return required('SESSION_SECRET');
	},
	get origin(): string {
		return process.env.ORIGIN ?? 'http://localhost:3000';
	},
	get isProduction(): boolean {
		return process.env.NODE_ENV === 'production';
	},

	// --- Web Push (optional) ---
	get vapidPublicKey(): string | undefined {
		return process.env.VAPID_PUBLIC_KEY || undefined;
	},
	get vapidPrivateKey(): string | undefined {
		return process.env.VAPID_PRIVATE_KEY || undefined;
	},
	get vapidSubject(): string {
		return process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
	},
	get pushEnabled(): boolean {
		return Boolean(this.vapidPublicKey && this.vapidPrivateKey);
	},

	// --- Email / SMTP (optional, OFF unless SMTP_HOST set) ---
	get smtpHost(): string | undefined {
		return process.env.SMTP_HOST || undefined;
	},
	get smtpPort(): number {
		return Number(process.env.SMTP_PORT ?? 587);
	},
	get smtpUser(): string | undefined {
		return process.env.SMTP_USER || undefined;
	},
	get smtpPass(): string | undefined {
		return process.env.SMTP_PASS || undefined;
	},
	get smtpFrom(): string {
		return process.env.SMTP_FROM || 'Mosi <no-reply@localhost>';
	},
	get emailEnabled(): boolean {
		return Boolean(this.smtpHost);
	},

	// --- Admin bootstrap & 2FA policy ---
	/**
	 * When false, TOTP two-factor is optional: setup and login no longer force
	 * enrollment, and a password alone fully authenticates a user who hasn't
	 * voluntarily enabled 2FA. Users who DID enable TOTP are always still
	 * challenged for it - this never weakens an enrolled account.
	 */
	get requireTotp(): boolean {
		return process.env.REQUIRE_TOTP !== 'false';
	},
	/** First-run admin password. When set (with no admins yet) the owner is auto-created. */
	get adminPassword(): string | undefined {
		return process.env.ADMIN_PASSWORD || undefined;
	},
	/** Username for the auto-created first-run admin (defaults to "admin"). */
	get adminUsername(): string {
		return (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
	},

	// --- Data-at-rest encryption (emails) ---
	/** Master key for encrypting PII (email addresses) at rest. openssl rand -hex 32. */
	get encryptionKey(): string | undefined {
		return process.env.ENCRYPTION_KEY || undefined;
	},

	// --- Misc ---
	get bootstrapToken(): string | undefined {
		return process.env.BOOTSTRAP_TOKEN || undefined;
	},
	/** e.g. "30/min", "100/hour", "10/sec" */
	get rateLimitRsvp(): string {
		return process.env.RATE_LIMIT_RSVP || '30/min';
	},
	/** Applies to both login and 2FA attempts, per IP. */
	get rateLimitLogin(): string {
		return process.env.RATE_LIMIT_LOGIN || '10/min';
	},
	/** Allow webhook targets on private/loopback ranges (self-hosted LAN notifiers). */
	get allowPrivateWebhooks(): boolean {
		return process.env.ALLOW_PRIVATE_WEBHOOKS === 'true';
	}
};

/**
 * Fail-fast configuration check, run once at server boot. The getters above only
 * throw when first *used*, which can surface deep in a request long after start;
 * this asserts the critical invariants up front and reports every problem at once.
 */
export function validateEnv(): void {
	const errors: string[] = [];

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		errors.push('DATABASE_URL is required.');
	} else if (databaseUrl.includes('change-me')) {
		errors.push(
			'DATABASE_URL still contains the placeholder "change-me" — set a real DB_PASSWORD.'
		);
	}

	const sessionSecret = process.env.SESSION_SECRET;
	if (!sessionSecret) {
		errors.push('SESSION_SECRET is required. Generate one with `openssl rand -hex 32`.');
	} else if (sessionSecret.length < 32) {
		errors.push(
			'SESSION_SECRET is too short (need ≥32 chars). Generate one with `openssl rand -hex 32`.'
		);
	}

	// ENCRYPTION_KEY is optional, but when present it must carry 32 bytes of key
	// material: 64 hex chars (the documented `openssl rand -hex 32`) or, for a raw
	// passphrase, at least 32 characters.
	const encryptionKey = process.env.ENCRYPTION_KEY;
	if (encryptionKey) {
		const isHex = /^[0-9a-fA-F]+$/.test(encryptionKey);
		const longEnough = isHex ? encryptionKey.length === 64 : encryptionKey.length >= 32;
		if (!longEnough) {
			errors.push(
				'ENCRYPTION_KEY must be 32 bytes — 64 hex chars from `openssl rand -hex 32` (or a ≥32-char passphrase).'
			);
		}
	}

	const origin = process.env.ORIGIN;
	if (process.env.NODE_ENV === 'production') {
		if (!origin) {
			errors.push('ORIGIN must be set in production (e.g. https://events.example.com).');
		} else if (!origin.startsWith('https://')) {
			errors.push('ORIGIN must use https in production.');
		}
	} else if (origin?.startsWith('https://')) {
		// Serving over https but NODE_ENV isn't "production" → session cookies ship
		// without the Secure flag (it's gated on isProduction). Catch this footgun up
		// front instead of silently issuing insecure cookies behind TLS.
		errors.push(
			'NODE_ENV must be "production" when ORIGIN is https — otherwise session cookies are sent without the Secure flag.'
		);
	}

	// Web Push: when keys are configured, the VAPID subject must be a real contact —
	// the placeholder default is rejected by some push services (e.g. Apple/Mozilla).
	if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
		const subject = process.env.VAPID_SUBJECT;
		if (!subject || subject === 'mailto:admin@example.com') {
			errors.push(
				'VAPID_SUBJECT must be a real "mailto:" or "https:" contact when push is enabled (not the mailto:admin@example.com placeholder).'
			);
		}
	}

	if (errors.length > 0) {
		throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
	}
}
