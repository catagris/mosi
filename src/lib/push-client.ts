/**
 * Browser-side Web Push helpers for the admin PWA (tier 2).
 * Registers the service worker, asks permission, subscribes with the VAPID
 * public key, and reports the subscription to the server.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(normalized);
	const output = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
	return output;
}

export function pushSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

export async function registerServiceWorker(dev: boolean): Promise<ServiceWorkerRegistration> {
	return navigator.serviceWorker.register('/service-worker.js', {
		type: dev ? 'module' : 'classic'
	});
}

export type EnablePushResult =
	| { ok: true }
	| { ok: false; reason: 'unsupported' | 'denied' | 'error'; detail?: string };

export async function enablePush(vapidPublicKey: string, dev: boolean): Promise<EnablePushResult> {
	if (!pushSupported()) return { ok: false, reason: 'unsupported' };
	try {
		const registration = await registerServiceWorker(dev);
		await navigator.serviceWorker.ready;
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') return { ok: false, reason: 'denied' };

		const subscription =
			(await registration.pushManager.getSubscription()) ??
			(await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource
			}));

		const response = await fetch('/admin/push/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(subscription.toJSON())
		});
		if (!response.ok) return { ok: false, reason: 'error', detail: `HTTP ${response.status}` };
		return { ok: true };
	} catch (err) {
		return { ok: false, reason: 'error', detail: (err as Error).message };
	}
}

export async function disablePushOnThisDevice(): Promise<void> {
	if (!pushSupported()) return;
	const registration = await navigator.serviceWorker.getRegistration();
	const subscription = await registration?.pushManager.getSubscription();
	if (subscription) {
		await fetch('/admin/push/unsubscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint: subscription.endpoint })
		});
		await subscription.unsubscribe();
	}
}
