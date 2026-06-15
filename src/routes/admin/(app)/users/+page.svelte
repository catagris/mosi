<script lang="ts">
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '$lib/utils/confirmSubmit';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	function isLocked(lockedUntil: Date | null): boolean {
		return lockedUntil !== null && lockedUntil.getTime() > Date.now();
	}
</script>

<svelte:head>
	<title>Users - {data.orgName}</title>
</svelte:head>

<h1 class="text-2xl font-bold text-ink">Admin users</h1>
<p class="mt-1 text-sm text-muted">Manage who can sign in to this admin panel.</p>

{#if form?.actionError}
	<p class="field-error mt-4" role="alert">{form.actionError}</p>
{/if}
{#if form?.deleted}
	<p
		class="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300"
		role="status"
	>
		User deleted.
	</p>
{/if}
{#if form?.unlocked}
	<p
		class="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300"
		role="status"
	>
		Account unlocked.
	</p>
{/if}
{#if form?.reset}
	<p
		class="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300"
		role="status"
	>
		Two-factor reset - that user will re-enroll at their next sign-in.
	</p>
{/if}

<div class="mt-6 space-y-4">
	{#each data.admins as admin (admin.id)}
		<div class="card">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="min-w-0">
					<p class="flex flex-wrap items-center gap-2">
						<span class="truncate font-semibold text-ink">{admin.username}</span>
						{#if admin.id === data.user.id}
							<span class="text-xs text-muted">(you)</span>
						{/if}
						<span
							class="badge {admin.role === 'owner'
								? 'bg-primary/10 text-primary'
								: 'bg-surface text-muted'}"
						>
							{admin.role}
						</span>
						{#if isLocked(admin.lockedUntil)}
							<span class="badge bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
								>locked</span
							>
						{/if}
					</p>
					<p class="mt-1 text-xs text-muted">
						2FA {admin.totpEnabled ? '✓ enabled' : '✗ not enrolled'} · last login
						{admin.lastLoginAt ? admin.lastLoginAt.toLocaleString() : 'never'}
					</p>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					{#if isLocked(admin.lockedUntil)}
						<form method="POST" action="?/unlock" use:enhance>
							<input type="hidden" name="userId" value={admin.id} />
							<button type="submit" class="btn-secondary">Unlock</button>
						</form>
					{/if}

					{#if admin.id !== data.user.id}
						<details class="relative">
							<summary
								class="btn-secondary cursor-pointer select-none list-none text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
							>
								Danger zone
							</summary>
							<div
								class="mt-2 flex flex-wrap gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10"
							>
								<form method="POST" action="?/reset2fa" use:enhance>
									<input type="hidden" name="userId" value={admin.id} />
									<button type="submit" class="btn-secondary">Reset 2FA</button>
								</form>
								<form
									method="POST"
									action="?/delete"
									use:enhance={confirmSubmit(
										`Delete admin “${admin.username}”? This cannot be undone.`
									)}
								>
									<input type="hidden" name="userId" value={admin.id} />
									<button type="submit" class="btn-danger">Delete user</button>
								</form>
							</div>
						</details>
					{/if}
				</div>
			</div>
		</div>
	{/each}
</div>

<section class="card mt-8">
	<h2 class="text-lg font-semibold text-ink">Add an admin</h2>
	<form method="POST" action="?/create" use:enhance class="mt-4 max-w-sm space-y-4">
		{#if form?.createError}
			<p class="field-error" role="alert">{form.createError}</p>
		{/if}
		{#if form?.created}
			<p
				class="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300"
				role="status"
			>
				User created. They’ll enroll in two-factor at their first sign-in.
			</p>
		{/if}

		<div>
			<label class="label" for="newUsername">Username</label>
			<input
				id="newUsername"
				name="username"
				class="input"
				required
				minlength="3"
				maxlength="50"
				autocapitalize="none"
				spellcheck="false"
				value={form?.username ?? ''}
			/>
		</div>
		<div>
			<label class="label" for="newPassword">Temporary password</label>
			<input
				id="newPassword"
				name="password"
				type="password"
				class="input"
				required
				minlength="10"
				autocomplete="new-password"
			/>
			<p class="mt-1 text-xs text-muted">
				At least 10 characters - share it securely and have them change it under Account.
			</p>
		</div>
		<div>
			<label class="label" for="newRole">Role</label>
			<select id="newRole" name="role" class="input">
				<option value="admin" selected={form?.role !== 'owner'}>admin</option>
				<option value="owner" selected={form?.role === 'owner'}>owner</option>
			</select>
		</div>

		<button type="submit" class="btn-primary">Create user</button>
	</form>
</section>
