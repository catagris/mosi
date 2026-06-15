import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$lib/server/env';
import { consume, RULES } from '$lib/server/rate-limit';

/**
 * Optional email module: OFF unless SMTP_HOST is configured.
 * Only used to send guests their magic edit link - admin alerts never email.
 */

let transporter: Transporter | undefined;

export function emailEnabled(): boolean {
	return env.emailEnabled;
}

function getTransporter(): Transporter {
	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: env.smtpHost,
			port: env.smtpPort,
			secure: env.smtpPort === 465,
			auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined
		});
	}
	return transporter;
}

/**
 * Email the guest their private edit link. No-op (returns false) when email
 * is disabled or the send rate limit is hit; RSVP flow never depends on it.
 */
export async function sendEditLinkEmail(options: {
	to: string;
	guestName: string;
	eventTitle: string;
	editUrl: string;
}): Promise<boolean> {
	if (!emailEnabled()) return false;
	if (!consume('email:send', RULES.emailSend)) {
		console.warn('email: send rate limit hit, skipping');
		return false;
	}
	try {
		await getTransporter().sendMail({
			from: env.smtpFrom,
			to: options.to,
			subject: `Your RSVP for ${options.eventTitle}`,
			text: [
				`Hi ${options.guestName},`,
				'',
				`Thanks for responding to "${options.eventTitle}".`,
				'You can edit or withdraw your RSVP any time with this private link:',
				'',
				options.editUrl,
				'',
				'Keep this link to yourself - anyone with it can change your RSVP.'
			].join('\n')
		});
		return true;
	} catch (err) {
		console.error('email: send failed:', (err as Error).message);
		return false;
	}
}

/**
 * Tell a guest they've been promoted off the waitlist. Best-effort: returns
 * false (never throws) when email is disabled or the rate limit is hit.
 */
export async function sendWaitlistPromotedEmail(options: {
	to: string;
	guestName: string;
	eventTitle: string;
	editUrl: string;
}): Promise<boolean> {
	if (!emailEnabled()) return false;
	if (!consume('email:send', RULES.emailSend)) {
		console.warn('email: send rate limit hit, skipping waitlist promotion');
		return false;
	}
	try {
		await getTransporter().sendMail({
			from: env.smtpFrom,
			to: options.to,
			subject: `You're off the waitlist for ${options.eventTitle}`,
			text: [
				`Hi ${options.guestName},`,
				'',
				`Good news - a spot opened up and you're now confirmed for "${options.eventTitle}".`,
				'You can view or edit your RSVP here:',
				'',
				options.editUrl,
				'',
				'See you there!'
			].join('\n')
		});
		return true;
	} catch (err) {
		console.error('email: waitlist promotion send failed:', (err as Error).message);
		return false;
	}
}

/** Plain-text body for the consolidated "your RSVP links" email. Pure (unit-tested). */
export function buildMyLinksEmailBody(
	items: Array<{ title: string; whenLabel: string; editUrl: string }>
): string {
	const lines = [
		'Hi there,',
		'',
		"Here are your private links for the upcoming events you've RSVP'd to.",
		'Use each one to view, change, or withdraw your RSVP:',
		''
	];
	for (const item of items) {
		lines.push(`• ${item.title} - ${item.whenLabel}`, `  ${item.editUrl}`, '');
	}
	lines.push('Keep these links to yourself - anyone with a link can change that RSVP.');
	return lines.join('\n');
}

/**
 * Email a guest every edit link tied to their address in a single message
 * (home-page "email me my links" flow). Best-effort: returns false (never
 * throws) when email is disabled, there's nothing to send, or the rate limit
 * is hit. The caller shows the same neutral message either way.
 */
export async function sendMyLinksEmail(options: {
	to: string;
	items: Array<{ title: string; whenLabel: string; editUrl: string }>;
}): Promise<boolean> {
	if (!emailEnabled() || options.items.length === 0) return false;
	if (!consume('email:send', RULES.emailSend)) {
		console.warn('email: send rate limit hit, skipping my-links email');
		return false;
	}
	try {
		await getTransporter().sendMail({
			from: env.smtpFrom,
			to: options.to,
			subject:
				options.items.length === 1
					? `Your RSVP link for ${options.items[0].title}`
					: `Your RSVP links (${options.items.length} events)`,
			text: buildMyLinksEmailBody(options.items)
		});
		return true;
	} catch (err) {
		console.error('email: my-links send failed:', (err as Error).message);
		return false;
	}
}

/** For the settings screen. */
export function emailStatus(): { enabled: boolean; host?: string; from?: string } {
	return env.emailEnabled
		? { enabled: true, host: env.smtpHost, from: env.smtpFrom }
		: { enabled: false };
}
