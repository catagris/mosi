import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$lib/server/env';
import { consume, RULES } from '$lib/server/rate-limit';
import { getSettings } from '$lib/server/services/settings';
import { buildEventIcs } from '$lib/calendar';
import { formatEventTime } from '$lib/utils/datetime';
import { renderEventEmail, renderMyLinksEmail, type EmailBranding } from './templates';
import type { Event } from '$lib/server/db/schema';

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

/** Org branding for the themed email shell; falls back to defaults if settings can't load. */
async function emailBranding(): Promise<EmailBranding> {
	try {
		const s = await getSettings();
		return { orgName: s.orgName, primaryColor: s.primaryColor, logoUrl: s.logoUrl };
	} catch {
		return { orgName: 'Mosi', primaryColor: '#7c3aed', logoUrl: null };
	}
}

/** A calendar invite attachment so guests (and their automations) can add the event. */
function icsAttachment(event: Event, eventUrl: string, editUrl?: string) {
	return {
		filename: `${event.slug}.ics`,
		content: buildEventIcs(event, eventUrl, editUrl ? { editUrl } : {}),
		contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
	};
}

/**
 * Email the guest their private edit link. No-op (returns false) when email
 * is disabled or the send rate limit is hit; RSVP flow never depends on it.
 */
export async function sendEditLinkEmail(options: {
	to: string;
	guestName: string;
	event: Event;
	eventUrl: string;
	editUrl: string;
}): Promise<boolean> {
	if (!emailEnabled()) return false;
	if (!consume('email:send', RULES.emailSend)) {
		console.warn('email: send rate limit hit, skipping');
		return false;
	}
	const { event, guestName, editUrl, eventUrl } = options;
	const whenLabel = formatEventTime(event.startsAt, event.timezone);
	try {
		await getTransporter().sendMail({
			from: env.smtpFrom,
			to: options.to,
			subject: `Your RSVP for ${event.title}`,
			text: [
				`Hi ${guestName},`,
				'',
				`Thanks for responding to "${event.title}" (${whenLabel}).`,
				'You can edit or withdraw your RSVP any time with this private link:',
				'',
				editUrl,
				'',
				'A calendar invite is attached. Keep this link to yourself - anyone with it can change your RSVP.'
			].join('\n'),
			html: renderEventEmail(await emailBranding(), {
				heading: `You're all set, ${guestName}!`,
				intro: `Thanks for responding to "${event.title}". Use the button below to view, change, or cancel your RSVP any time — the calendar invite is attached.`,
				eventTitle: event.title,
				whenLabel,
				location: event.location || undefined,
				buttonLabel: 'View or edit your RSVP',
				buttonUrl: editUrl,
				footerNote: 'Keep this link private — anyone with it can change your RSVP.'
			}),
			attachments: [icsAttachment(event, eventUrl, editUrl)]
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
	event: Event;
	eventUrl: string;
	editUrl: string;
}): Promise<boolean> {
	if (!emailEnabled()) return false;
	if (!consume('email:send', RULES.emailSend)) {
		console.warn('email: send rate limit hit, skipping waitlist promotion');
		return false;
	}
	const { event, guestName, editUrl, eventUrl } = options;
	const whenLabel = formatEventTime(event.startsAt, event.timezone);
	try {
		await getTransporter().sendMail({
			from: env.smtpFrom,
			to: options.to,
			subject: `You're off the waitlist for ${event.title}`,
			text: [
				`Hi ${guestName},`,
				'',
				`Good news - a spot opened up and you're now confirmed for "${event.title}" (${whenLabel}).`,
				'You can view or edit your RSVP here:',
				'',
				editUrl,
				'',
				'A calendar invite is attached. See you there!'
			].join('\n'),
			html: renderEventEmail(await emailBranding(), {
				heading: `You're in, ${guestName}!`,
				intro: `A spot opened up — you're now confirmed for "${event.title}". The calendar invite is attached.`,
				eventTitle: event.title,
				whenLabel,
				location: event.location || undefined,
				buttonLabel: 'View or edit your RSVP',
				buttonUrl: editUrl,
				footerNote: 'Keep this link private — anyone with it can change your RSVP.'
			}),
			attachments: [icsAttachment(event, eventUrl, editUrl)]
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
	items: Array<{ event: Event; eventUrl: string; editUrl: string }>;
}): Promise<boolean> {
	if (!emailEnabled() || options.items.length === 0) return false;
	if (!consume('email:send', RULES.emailSend)) {
		console.warn('email: send rate limit hit, skipping my-links email');
		return false;
	}
	const rows = options.items.map((it) => ({
		title: it.event.title,
		whenLabel: formatEventTime(it.event.startsAt, it.event.timezone),
		editUrl: it.editUrl
	}));
	try {
		await getTransporter().sendMail({
			from: env.smtpFrom,
			to: options.to,
			subject:
				rows.length === 1
					? `Your RSVP link for ${rows[0].title}`
					: `Your RSVP links (${rows.length} events)`,
			text: buildMyLinksEmailBody(rows),
			html: renderMyLinksEmail(await emailBranding(), {
				intro: "Here are your private links for the upcoming events you've RSVP'd to. Use each one to view, change, or withdraw your RSVP.",
				items: rows,
				footerNote: 'Keep these links to yourself - anyone with a link can change that RSVP.'
			}),
			attachments: options.items.map((it) => icsAttachment(it.event, it.eventUrl, it.editUrl))
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
