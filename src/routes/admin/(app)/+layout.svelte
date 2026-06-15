<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { registerServiceWorker } from '$lib/push-client';
	import Toasts, { type Toast } from '$lib/components/admin/Toasts.svelte';
	import PushPrompt from '$lib/components/admin/PushPrompt.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let menuOpen = $state(false);

	// Unread badge: seeded from the server, bumped live via SSE, reset whenever
	// the layout load re-runs (navigation / invalidateAll). The seed is an
	// intentional one-time snapshot (the $effect below provides the reactivity).
	let unread = $state(untrack(() => data.unreadCount));
	$effect(() => {
		unread = data.unreadCount;
	});

	// ------------------------------------------------------------------
	// Toasts
	// ------------------------------------------------------------------
	let toasts = $state<Toast[]>([]);
	let nextToastId = 1;

	function pushToast(title: string, body: string, kind: Toast['kind'] = 'info'): void {
		const id = nextToastId++;
		toasts = [...toasts, { id, title, body, kind }];
		setTimeout(() => dismissToast(id), 6000);
	}

	function dismissToast(id: number): void {
		toasts = toasts.filter((t) => t.id !== id);
	}

	// ------------------------------------------------------------------
	// Live alerts: SSE, with a 60s unread-count poll while disconnected.
	// ------------------------------------------------------------------
	const FRIENDLY: Record<string, string> = {
		'rsvp.created': 'RSVP’d',
		'rsvp.updated': 'updated their RSVP',
		'rsvp.withdrawn': 'withdrew their RSVP'
	};

	let pollTimer: ReturnType<typeof setInterval> | undefined;

	function startPolling(): void {
		if (pollTimer) return;
		pollTimer = setInterval(async () => {
			try {
				const res = await fetch('/admin/notifications/unread');
				if (res.ok) {
					const body = (await res.json()) as { count?: number };
					if (typeof body.count === 'number') unread = body.count;
				}
			} catch {
				// still offline - retry on the next tick
			}
		}, 60_000);
	}

	function stopPolling(): void {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = undefined;
		}
	}

	onMount(() => {
		if ('serviceWorker' in navigator) {
			try {
				registerServiceWorker(dev).catch(() => {
					// offline shell + push are progressive enhancements
				});
			} catch {
				// ignore registration failures entirely
			}
		}

		const source = new EventSource('/admin/stream');
		source.addEventListener('notification', (e) => {
			const message = e as MessageEvent<string>;
			try {
				const parsed = JSON.parse(message.data) as {
					type: string;
					payload?: { eventTitle?: string; guestName?: string };
				};
				unread += 1;
				pushToast(
					parsed.payload?.eventTitle ?? 'New activity',
					`${parsed.payload?.guestName ?? 'A guest'} - ${FRIENDLY[parsed.type] ?? 'RSVP activity'}`
				);
			} catch {
				// malformed payload - ignore
			}
		});
		source.onopen = () => stopPolling();
		source.onerror = () => startPolling();

		return () => {
			source.close();
			stopPolling();
		};
	});

	function handlePushResult(ok: boolean, reason?: string): void {
		if (ok) {
			pushToast('Notifications enabled', 'This device will now get RSVP alerts.', 'success');
		} else if (reason === 'denied') {
			pushToast('Notifications blocked', 'Allow notifications for this site in browser settings.');
		} else {
			pushToast('Could not enable push', 'Something went wrong - try again from Account.');
		}
	}

	// ------------------------------------------------------------------
	// Navigation
	// ------------------------------------------------------------------
	type NavItem = { href: string; label: string; exact?: boolean; badge?: number };

	const navItems: NavItem[] = $derived([
		{ href: '/admin', label: 'Dashboard', exact: true },
		{ href: '/admin/events', label: 'Events' },
		{ href: '/admin/templates', label: 'Templates' },
		{ href: '/admin/notifications', label: 'Notifications', badge: unread },
		{ href: '/admin/settings', label: 'Settings' },
		{ href: '/admin/account', label: 'Account' },
		...(data.user.role === 'owner' ? [{ href: '/admin/users', label: 'Users' }] : [])
	]);

	// Editing a template happens under /admin/events/[id]; highlight "Templates"
	// (not "Events") in that case, using the event loaded by the nested layout.
	const onTemplateEditor = $derived(
		page.url.pathname.startsWith('/admin/events/') &&
			(page.data as unknown as { event?: { isTemplate?: boolean } }).event?.isTemplate === true
	);

	function isActive(href: string, exact = false): boolean {
		const path = page.url.pathname;
		const underPath = path === href || path.startsWith(`${href}/`);
		if (href === '/admin/events') return underPath && !onTemplateEditor;
		if (href === '/admin/templates') return underPath || onTemplateEditor;
		return exact ? path === href : underPath;
	}
</script>

{#snippet navLinks(onNavigate: (() => void) | undefined)}
	{#each navItems as item (item.href)}
		<a
			href={item.href}
			class="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium {isActive(
				item.href,
				item.exact
			)
				? 'bg-primary/10 text-primary'
				: 'text-ink hover:bg-surface'}"
			aria-current={isActive(item.href, item.exact) ? 'page' : undefined}
			onclick={onNavigate}
		>
			<span>{item.label}</span>
			{#if item.badge}
				<span class="badge bg-primary text-primary-fg">{item.badge}</span>
			{/if}
		</a>
	{/each}
{/snippet}

<svelte:head>
	<title>{data.orgName} - Admin</title>
</svelte:head>

<div class="min-h-screen bg-surface md:flex">
	<!-- Sidebar (md+) -->
	<aside
		class="hidden md:sticky md:top-0 md:flex md:h-screen md:w-64 md:flex-col md:border-r md:border-line md:bg-card"
	>
		<div class="flex items-center gap-3 px-5 py-5">
			{#if data.logoUrl}
				<img src={data.logoUrl} alt="" class="h-8 w-8 rounded-lg object-cover" />
			{/if}
			<span class="truncate text-lg font-bold text-ink">{data.orgName}</span>
		</div>
		<nav class="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Admin">
			{@render navLinks(undefined)}
		</nav>
		<div class="border-t border-line p-3">
			<p class="truncate px-3 pb-2 text-xs text-muted">Signed in as {data.user.username}</p>
			<div class="flex items-center gap-2">
				<form method="POST" action="/admin/logout" class="flex-1">
					<button type="submit" class="btn-secondary w-full">Sign out</button>
				</form>
				<ThemeToggle />
			</div>
		</div>
	</aside>

	<div class="flex min-h-screen flex-1 flex-col md:min-h-0">
		<!-- Top bar (mobile) -->
		<header class="sticky top-0 z-40 border-b border-line bg-card md:hidden">
			<div class="flex items-center justify-between px-4 py-3">
				<div class="flex min-w-0 items-center gap-2">
					{#if data.logoUrl}
						<img src={data.logoUrl} alt="" class="h-7 w-7 rounded-lg object-cover" />
					{/if}
					<span class="truncate font-bold text-ink">{data.orgName}</span>
				</div>
				<div class="flex items-center gap-2">
					<ThemeToggle />
					<button
						type="button"
						class="rounded-lg p-2 text-muted hover:bg-surface"
						aria-label={menuOpen ? 'Close menu' : 'Open menu'}
						aria-expanded={menuOpen}
						onclick={() => (menuOpen = !menuOpen)}
					>
						{#if menuOpen}✕{:else}☰{/if}
					</button>
				</div>
			</div>
			{#if menuOpen}
				<nav class="space-y-1 border-t border-line px-3 py-3" aria-label="Admin">
					{@render navLinks(() => (menuOpen = false))}
					<form method="POST" action="/admin/logout" class="pt-2">
						<button type="submit" class="btn-secondary w-full">Sign out</button>
					</form>
				</nav>
			{/if}
		</header>

		<main class="flex-1 p-4 md:p-8">
			<div class="mx-auto w-full max-w-5xl">
				{@render children()}
			</div>
		</main>
	</div>
</div>

<Toasts {toasts} ondismiss={dismissToast} />

{#if data.pushEnabled && data.vapidPublicKey}
	<PushPrompt vapidPublicKey={data.vapidPublicKey} onresult={handlePushResult} />
{/if}
