/**
 * Themed, email-client-safe HTML for guest emails. Pure (no DB/IO) so it can be
 * unit-tested. Uses table layout + inline styles only — the lowest common
 * denominator that renders in Gmail / Apple Mail / Outlook. Every interpolated
 * value is HTML-escaped; the org's primaryColor is validated before use.
 */

export type EmailBranding = {
	orgName: string;
	primaryColor: string;
	logoUrl?: string | null;
};

const DEFAULT_PRIMARY = '#7c3aed';

function esc(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Only a strict 6-digit hex reaches the inline styles (defends against CSS injection). */
function safeColor(color: string): string {
	return /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_PRIMARY;
}

function button(label: string, url: string, primary: string): string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="border-radius:8px;background:${primary}"><a href="${esc(url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;border-radius:8px">${esc(label)}</a></td></tr></table>`;
}

function layout(branding: EmailBranding, innerHtml: string): string {
	const primary = safeColor(branding.primaryColor);
	const org = esc(branding.orgName);
	const header = branding.logoUrl
		? `<img src="${esc(branding.logoUrl)}" alt="${org}" height="40" style="display:block;border:0;max-height:40px" />`
		: `<span style="font-size:20px;font-weight:700;color:#ffffff">${org}</span>`;
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4">
<tr><td style="background:${primary};padding:20px 28px">${header}</td></tr>
<tr><td style="padding:28px 28px 24px">${innerHtml}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e7e5e4;color:#78716c;font-size:12px;line-height:18px">Sent by ${org}. If this wasn't you, you can safely ignore it.</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function eventCard(eventTitle: string, whenLabel: string, location?: string): string {
	const loc = location
		? `<div style="color:#57534e;font-size:14px;margin-top:2px">${esc(location)}</div>`
		: '';
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#fafaf9;border-radius:8px"><tr><td style="padding:14px 16px"><div style="font-weight:700;font-size:16px;color:#1c1917">${esc(eventTitle)}</div><div style="color:#57534e;font-size:14px;margin-top:4px">${esc(whenLabel)}</div>${loc}</td></tr></table>`;
}

/** Single-event email (RSVP confirmation, resent edit link, waitlist promotion). */
export function renderEventEmail(
	branding: EmailBranding,
	content: {
		heading: string;
		intro: string;
		eventTitle: string;
		whenLabel: string;
		location?: string;
		buttonLabel: string;
		buttonUrl: string;
		footerNote: string;
	}
): string {
	const primary = safeColor(branding.primaryColor);
	const inner =
		`<h1 style="margin:0 0 10px;font-size:20px;line-height:26px;color:#1c1917">${esc(content.heading)}</h1>` +
		`<p style="margin:0;color:#44403c;font-size:15px;line-height:22px">${esc(content.intro)}</p>` +
		eventCard(content.eventTitle, content.whenLabel, content.location) +
		button(content.buttonLabel, content.buttonUrl, primary) +
		`<p style="margin:8px 0 0;color:#78716c;font-size:13px;line-height:20px">${esc(content.footerNote)}</p>`;
	return layout(branding, inner);
}

/** Multi-event "here are your RSVP links" email (home-page recovery flow). */
export function renderMyLinksEmail(
	branding: EmailBranding,
	content: {
		intro: string;
		items: { title: string; whenLabel: string; editUrl: string }[];
		footerNote: string;
	}
): string {
	const primary = safeColor(branding.primaryColor);
	const rows = content.items
		.map(
			(it) =>
				`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;background:#fafaf9;border-radius:8px"><tr><td style="padding:14px 16px"><div style="font-weight:700;font-size:15px;color:#1c1917">${esc(it.title)}</div><div style="color:#57534e;font-size:13px;margin:2px 0 10px">${esc(it.whenLabel)}</div><a href="${esc(it.editUrl)}" style="display:inline-block;padding:9px 16px;background:${primary};color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;border-radius:6px">View or edit RSVP</a></td></tr></table>`
		)
		.join('');
	const inner =
		`<h1 style="margin:0 0 10px;font-size:20px;line-height:26px;color:#1c1917">Your RSVP links</h1>` +
		`<p style="margin:0 0 16px;color:#44403c;font-size:15px;line-height:22px">${esc(content.intro)}</p>` +
		rows +
		`<p style="margin:8px 0 0;color:#78716c;font-size:13px;line-height:20px">${esc(content.footerNote)}</p>`;
	return layout(branding, inner);
}
