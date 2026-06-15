import { redirect, type Handle } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	validateSession,
	isFullyAuthenticated,
	clearSessionCookie
} from '$lib/server/auth/session';
import { consume, parseRule, startSweeper, RULES } from '$lib/server/rate-limit';
import { env, validateEnv } from '$lib/server/env';
import { isBootstrapCompleted } from '$lib/server/services/settings';
import { countAdminUsers } from '$lib/server/services/users';
import { ensureEnvAdmin } from '$lib/server/auth/bootstrap';
import { encryptionEnabled } from '$lib/server/crypto/pii';

// Fail fast on misconfiguration at server boot, before any request is served.
validateEnv();

startSweeper();

if (!encryptionEnabled()) {
	console.warn(
		'⚠ ENCRYPTION_KEY is not set - email addresses are stored as plaintext. Set it to encrypt PII at rest (see README).'
	);
}

const RSVP_RULE = parseRule(env.rateLimitRsvp, { capacity: 30, windowMs: 60_000 });
const LOGIN_RULE = parseRule(env.rateLimitLogin, RULES.login);

// Once bootstrap is confirmed complete we stop hitting the DB for it.
let bootstrapConfirmed = false;

async function bootstrapDone(): Promise<boolean> {
	if (bootstrapConfirmed) return true;
	// Auto-create the owner from ADMIN_PASSWORD on first run, if configured.
	await ensureEnvAdmin();
	const done = (await isBootstrapCompleted()) && (await countAdminUsers()) > 0;
	if (done) bootstrapConfirmed = true;
	return done;
}

function clientIp(event: { getClientAddress: () => string }): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain'
]);
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// ------------------------------------------------------------------
	// CSRF: reject cross-origin form submissions. We enforce this here (in
	// addition to SameSite=Lax cookies) because SvelteKit's built-in origin
	// check isn't reliably emitted into the production bundle.
	// ------------------------------------------------------------------
	if (UNSAFE_METHODS.has(event.request.method)) {
		const contentType = (event.request.headers.get('content-type') ?? '')
			.split(';')[0]
			.trim()
			.toLowerCase();
		if (FORM_CONTENT_TYPES.has(contentType)) {
			const origin = event.request.headers.get('origin');
			if (origin !== event.url.origin) {
				return new Response('Cross-site form submissions are forbidden.', {
					status: 403,
					headers: { 'Content-Type': 'text/plain' }
				});
			}
		}
	}

	// ------------------------------------------------------------------
	// Rate limiting (login, 2FA, RSVP submission, edit-token lookups)
	// ------------------------------------------------------------------
	const ip = clientIp(event);
	const tooMany = () =>
		new Response('Too many requests - slow down and try again shortly.', {
			status: 429,
			headers: { 'Retry-After': '60', 'Content-Type': 'text/plain' }
		});

	if (event.request.method === 'POST') {
		if (pathname === '/admin/login' && !consume(`login:${ip}`, LOGIN_RULE)) return tooMany();
		if (pathname === '/admin/login/2fa' && !consume(`2fa:${ip}`, LOGIN_RULE)) return tooMany();
		if (pathname.startsWith('/e/') && !consume(`rsvp:${ip}`, RSVP_RULE)) return tooMany();
	}
	if (event.request.method === 'GET' && /^\/e\/[^/]+\/edit\//.test(pathname)) {
		if (!consume(`edit-token:${ip}`, RULES.editToken)) return tooMany();
	}

	// ------------------------------------------------------------------
	// Session resolution
	// ------------------------------------------------------------------
	event.locals.user = null;
	event.locals.session = null;
	event.locals.fullyAuthenticated = false;

	const sessionId = event.cookies.get(SESSION_COOKIE);
	if (sessionId) {
		const result = await validateSession(sessionId);
		if (result) {
			event.locals.session = result.session;
			event.locals.user = result.user;
			event.locals.fullyAuthenticated = isFullyAuthenticated(
				result.session,
				result.user,
				env.requireTotp
			);
		} else {
			clearSessionCookie(event.cookies);
		}
	}

	// ------------------------------------------------------------------
	// Admin gating: /admin/** requires full auth. When REQUIRE_TOTP is
	// on (default) that means pwd + totp; with it off, an un-enrolled user is
	// full-auth on pwd alone. Half-authenticated sessions (a pwd-only session
	// that still owes a TOTP factor) may only reach the 2FA step and logout.
	// ------------------------------------------------------------------
	if (pathname === '/admin' || pathname.startsWith('/admin/')) {
		const isSetup = pathname.startsWith('/admin/setup');
		const isLogin = pathname.startsWith('/admin/login');
		const isTwoFactor = pathname.startsWith('/admin/login/2fa');
		const isLogout = pathname.startsWith('/admin/logout');

		const done = await bootstrapDone();
		if (!done && !isSetup) redirect(303, '/admin/setup');
		// Keep the freshly-bootstrapped owner on /admin/setup so the one-time
		// recovery-codes panel can render; everyone else gets bounced to login.
		if (done && isSetup && !event.locals.fullyAuthenticated) redirect(303, '/admin/login');

		if (!event.locals.fullyAuthenticated && !isSetup && !isLogin && !isLogout) {
			redirect(303, event.locals.session ? '/admin/login/2fa' : '/admin/login');
		}
		if (event.locals.fullyAuthenticated && isLogin) redirect(303, '/admin');
		if (!event.locals.session && isTwoFactor) redirect(303, '/admin/login');
	}

	const response = await resolve(event);

	// ------------------------------------------------------------------
	// Security headers. CSP is emitted by SvelteKit (svelte.config.js).
	// ------------------------------------------------------------------
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	if (env.isProduction) {
		response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
	}

	return response;
};
