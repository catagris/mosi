/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `mosi-${version}`;
const ASSETS = [...build, ...files];

// ---------------------------------------------------------------------------
// Install / activate: precache the app shell, drop old caches.
// ---------------------------------------------------------------------------

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
			.then(() => sw.clients.claim())
	);
});

// ---------------------------------------------------------------------------
// Fetch: cache-first for immutable build assets, network-first otherwise
// (offline shell - never cache POSTs or admin data).
// ---------------------------------------------------------------------------

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;
	if (url.pathname.includes('/stream')) return; // never intercept SSE

	if (ASSETS.includes(url.pathname)) {
		event.respondWith(
			caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) ?? fetch(request))
		);
		return;
	}

	event.respondWith(
		(async () => {
			try {
				return await fetch(request);
			} catch {
				const cached = await caches.match(request);
				if (cached) return cached;
				return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
			}
		})()
	);
});

// ---------------------------------------------------------------------------
// Web Push (tier 2): show OS notifications, deep-link on tap.
// ---------------------------------------------------------------------------

sw.addEventListener('push', (event) => {
	let data: { title?: string; body?: string; url?: string; tag?: string };
	try {
		data = event.data?.json() ?? {};
	} catch {
		data = { body: event.data?.text() };
	}
	event.waitUntil(
		sw.registration.showNotification(data.title ?? 'Mosi', {
			body: data.body ?? 'New RSVP activity',
			tag: data.tag,
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			data: { url: data.url ?? '/admin/notifications' }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = (event.notification.data?.url as string) ?? '/admin';
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			for (const client of clients) {
				if ('focus' in client) {
					client.navigate(target);
					return client.focus();
				}
			}
			return sw.clients.openWindow(target);
		})
	);
});
