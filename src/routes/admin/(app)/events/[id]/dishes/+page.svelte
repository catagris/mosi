<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const categoryForm = $derived(form?.category ?? null);
	const dishForm = $derived(form?.dish ?? null);
	const hiddenCount = $derived(data.contributions.filter((d) => !d.visible).length);

	// ── Category reorder: drag on desktop, up/down buttons on touch/keyboard ──
	type Category = (typeof data.categories)[number];

	let order = $state<string[]>([]);
	let dragIndex = $state<number | null>(null);
	let overIndex = $state<number | null>(null);
	let reorderForm = $state<HTMLFormElement>();
	let orderInput = $state<HTMLInputElement>();

	// Mirror the server's order; re-syncs after every add / delete / reorder.
	$effect(() => {
		order = data.categories.map((c) => c.id);
	});

	const orderedCategories = $derived<Category[]>(
		order.length === data.categories.length
			? order
					.map((id) => data.categories.find((c) => c.id === id))
					.filter((c): c is Category => c !== undefined)
			: data.categories
	);

	function persistOrder(ids: string[]): void {
		if (!reorderForm || !orderInput) return;
		orderInput.value = ids.join(',');
		reorderForm.requestSubmit();
	}

	function dropOnto(toIndex: number): void {
		const from = dragIndex;
		dragIndex = null;
		overIndex = null;
		if (from === null || from === toIndex) return;
		const ids = orderedCategories.map((c) => c.id);
		const [moved] = ids.splice(from, 1);
		ids.splice(toIndex, 0, moved);
		order = ids; // optimistic; the action + load reload confirm it
		persistOrder(ids);
	}
</script>

<svelte:head>
	<title>{data.event.title} - Dishes</title>
</svelte:head>

<div class="space-y-8">
	<section class="space-y-4">
		<h2 class="text-lg font-semibold text-ink">Categories</h2>

		<div class="card">
			<h3 class="mb-3 font-medium text-ink">Add category</h3>
			<form
				method="POST"
				action="?/createCategory"
				use:enhance
				class="grid gap-4 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-start"
			>
				<div>
					<label class="label" for="cat-name">Name <span class="text-red-600 dark:text-red-400">*</span></label>
					<input
						id="cat-name"
						name="name"
						class="input"
						value={categoryForm?.id === null ? categoryForm.values.name : ''}
						required
					/>
					{#if categoryForm?.id === null && categoryForm.errors.name}
						<p class="field-error">{categoryForm.errors.name}</p>
					{/if}
				</div>
				<div>
					<label class="label" for="cat-description">Description</label>
					<input
						id="cat-description"
						name="description"
						class="input"
						value={categoryForm?.id === null ? categoryForm.values.description : ''}
					/>
				</div>
				<div>
					<label class="label" for="cat-target">Target</label>
					<input
						id="cat-target"
						type="number"
						min="0"
						name="target_count"
						class="input w-24"
						value={categoryForm?.id === null ? categoryForm.values.target_count : ''}
					/>
					{#if categoryForm?.id === null && categoryForm.errors.target_count}
						<p class="field-error">{categoryForm.errors.target_count}</p>
					{/if}
				</div>
				<button type="submit" class="btn-primary sm:mt-6">Add</button>
			</form>
		</div>

		<form
			method="POST"
			action="?/reorderCategories"
			use:enhance
			bind:this={reorderForm}
			class="hidden"
			aria-hidden="true"
		>
			<input type="hidden" name="order" bind:this={orderInput} />
		</form>

		{#if data.categories.length === 0}
			<p class="card text-sm text-muted">
				No categories yet - guests can still bring uncategorized dishes.
			</p>
		{:else}
			<div class="space-y-3">
				{#each orderedCategories as category, index (category.id)}
					<div
						class="card space-y-3 p-4 transition {overIndex === index
							? 'ring-2 ring-primary'
							: ''} {dragIndex === index ? 'opacity-50' : ''}"
						role="listitem"
						ondragover={(e) => {
							e.preventDefault();
							overIndex = index;
						}}
						ondragleave={() => {
							if (overIndex === index) overIndex = null;
						}}
						ondrop={(e) => {
							e.preventDefault();
							dropOnto(index);
						}}
					>
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="flex items-center gap-2">
								<span
									class="cursor-grab touch-none select-none text-muted hover:text-ink"
									draggable="true"
									ondragstart={() => (dragIndex = index)}
									ondragend={() => {
										dragIndex = null;
										overIndex = null;
									}}
									title="Drag to reorder"
									aria-hidden="true"
								>
									<svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
										<circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
										<circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
										<circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
									</svg>
								</span>
								<div>
									<span class="font-medium text-ink">{category.name}</span>
									{#if category.description}
										<p class="text-sm text-muted">{category.description}</p>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-2">
								<form method="POST" action="?/moveCategory" use:enhance>
									<input type="hidden" name="id" value={category.id} />
									<input type="hidden" name="direction" value="up" />
									<button
										type="submit"
										class="rounded-md border border-line px-2 py-1 text-sm text-muted hover:text-ink disabled:opacity-40"
										disabled={index === 0}
										aria-label="Move {category.name} up"
									>
										↑
									</button>
								</form>
								<form method="POST" action="?/moveCategory" use:enhance>
									<input type="hidden" name="id" value={category.id} />
									<input type="hidden" name="direction" value="down" />
									<button
										type="submit"
										class="rounded-md border border-line px-2 py-1 text-sm text-muted hover:text-ink disabled:opacity-40"
										disabled={index === orderedCategories.length - 1}
										aria-label="Move {category.name} down"
									>
										↓
									</button>
								</form>
								<span class="badge bg-line text-muted">
									{data.claimedByCategory[category.id] ?? 0} claimed{category.targetCount !== null
										? ` / ${category.targetCount} wanted`
										: ''}
								</span>
							</div>
						</div>

						<details open={categoryForm?.id === category.id}>
							<summary class="cursor-pointer text-sm font-medium text-primary">Edit</summary>
							<form
								method="POST"
								action="?/updateCategory"
								use:enhance
								class="mt-3 grid gap-4 border-t border-line pt-3 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-start"
							>
								<input type="hidden" name="id" value={category.id} />
								<div>
									<label class="label" for="cat-name-{category.id}">Name</label>
									<input
										id="cat-name-{category.id}"
										name="name"
										class="input"
										value={categoryForm?.id === category.id
											? categoryForm.values.name
											: category.name}
										required
									/>
									{#if categoryForm?.id === category.id && categoryForm.errors.name}
										<p class="field-error">{categoryForm.errors.name}</p>
									{/if}
								</div>
								<div>
									<label class="label" for="cat-description-{category.id}">Description</label>
									<input
										id="cat-description-{category.id}"
										name="description"
										class="input"
										value={categoryForm?.id === category.id
											? categoryForm.values.description
											: (category.description ?? '')}
									/>
								</div>
								<div>
									<label class="label" for="cat-target-{category.id}">Target</label>
									<input
										id="cat-target-{category.id}"
										type="number"
										min="0"
										name="target_count"
										class="input w-24"
										value={categoryForm?.id === category.id
											? categoryForm.values.target_count
											: (category.targetCount ?? '')}
									/>
									{#if categoryForm?.id === category.id && categoryForm.errors.target_count}
										<p class="field-error">{categoryForm.errors.target_count}</p>
									{/if}
								</div>
								<button type="submit" class="btn-secondary sm:mt-6">Save</button>
							</form>
						</details>

						<form
							method="POST"
							action="?/deleteCategory"
							use:enhance
							class="flex items-center justify-between gap-3 border-t border-line pt-3"
						>
							<input type="hidden" name="id" value={category.id} />
							<p class="text-xs text-muted">
								Existing contributions are kept but become uncategorized.
							</p>
							<button type="submit" class="shrink-0 text-sm text-red-600 hover:underline dark:text-red-400">
								Delete category
							</button>
						</form>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="space-y-4">
		<h2 class="text-lg font-semibold text-ink">Moderate contributions</h2>

		{#if data.contributions.length === 0}
			<p class="card text-sm text-muted">No dish contributions yet.</p>
		{:else}
			<div class="card overflow-x-auto p-0">
				<table class="w-full text-left text-sm">
					<thead class="bg-surface text-xs uppercase tracking-wide text-muted">
						<tr>
							<th class="px-4 py-3">Item</th>
							<th class="px-4 py-3">Category</th>
							<th class="px-4 py-3">Serves</th>
							<th class="px-4 py-3">Note</th>
							<th class="px-4 py-3">Contributor</th>
							<th class="px-4 py-3">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each data.contributions as dish (dish.id)}
							<tr class="border-t border-line align-top {dish.visible ? '' : 'opacity-60'}">
								<td class="px-4 py-3">
									<span class="font-medium text-ink">{dish.itemName}</span>
									<div class="flex flex-wrap gap-1 pt-1">
										{#if !dish.visible}
											<span class="badge bg-line text-muted">hidden</span>
										{/if}
										{#if dish.editedByAdmin}
											<span class="badge bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">edited by admin</span>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3">
									<form method="POST" action="?/recategorize" use:enhance class="flex items-center gap-1">
										<input type="hidden" name="id" value={dish.id} />
										<select
											name="category_id"
											class="input w-auto py-1 text-xs"
											aria-label="Category for {dish.itemName}"
										>
											<option value="" selected={!dish.categoryId}>Uncategorized</option>
											{#each data.categories as category (category.id)}
												<option value={category.id} selected={category.id === dish.categoryId}>
													{category.name}
												</option>
											{/each}
										</select>
										<button type="submit" class="btn-secondary px-2 py-1 text-xs">Move</button>
									</form>
								</td>
								<td class="px-4 py-3 text-muted">{dish.serves ?? '-'}</td>
								<td class="px-4 py-3 text-muted">
									{#if dish.note}
										<span class="block max-w-[12rem] truncate" title={dish.note}>{dish.note}</span>
									{:else}
										-
									{/if}
								</td>
								<td class="px-4 py-3 text-muted">
									{dish.guestName}
									{#if dish.rsvpStatus === 'withdrawn'}
										<span class="badge bg-line text-muted">withdrawn</span>
									{/if}
								</td>
								<td class="px-4 py-3">
									<div class="flex flex-wrap items-center gap-2">
										<form method="POST" action="?/toggleVisible" use:enhance>
											<input type="hidden" name="id" value={dish.id} />
											<input type="hidden" name="visible" value={dish.visible ? 'false' : 'true'} />
											<button type="submit" class="btn-secondary px-2 py-1 text-xs">
												{dish.visible ? 'Hide' : 'Show'}
											</button>
										</form>
										<form method="POST" action="?/deleteDish" use:enhance>
											<input type="hidden" name="id" value={dish.id} />
											<button type="submit" class="text-xs text-red-600 hover:underline dark:text-red-400">
												Delete
											</button>
										</form>
									</div>
									<details class="mt-2" open={dishForm?.id === dish.id}>
										<summary class="cursor-pointer text-xs font-medium text-primary">Edit</summary>
										<form
											method="POST"
											action="?/updateDish"
											use:enhance
											class="mt-2 w-64 space-y-2"
										>
											<input type="hidden" name="id" value={dish.id} />
											<div>
												<label class="label" for="dish-item-{dish.id}">Item</label>
												<input
													id="dish-item-{dish.id}"
													name="item_name"
													class="input"
													value={dishForm?.id === dish.id
														? dishForm.values.item_name
														: dish.itemName}
													required
												/>
												{#if dishForm?.id === dish.id && dishForm.errors.item_name}
													<p class="field-error">{dishForm.errors.item_name}</p>
												{/if}
											</div>
											<div>
												<label class="label" for="dish-serves-{dish.id}">Serves</label>
												<input
													id="dish-serves-{dish.id}"
													type="number"
													min="1"
													name="serves"
													class="input"
													value={dishForm?.id === dish.id
														? dishForm.values.serves
														: (dish.serves ?? '')}
												/>
												{#if dishForm?.id === dish.id && dishForm.errors.serves}
													<p class="field-error">{dishForm.errors.serves}</p>
												{/if}
											</div>
											<div>
												<label class="label" for="dish-note-{dish.id}">Note</label>
												<input
													id="dish-note-{dish.id}"
													name="note"
													class="input"
													value={dishForm?.id === dish.id ? dishForm.values.note : (dish.note ?? '')}
												/>
											</div>
											<div>
												<label class="label" for="dish-category-{dish.id}">Category</label>
												<select id="dish-category-{dish.id}" name="category_id" class="input">
													<option value="" selected={!dish.categoryId}>Uncategorized</option>
													{#each data.categories as category (category.id)}
														<option value={category.id} selected={category.id === dish.categoryId}>
															{category.name}
														</option>
													{/each}
												</select>
											</div>
											<button type="submit" class="btn-secondary px-3 py-1 text-xs">Save</button>
										</form>
									</details>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="text-xs text-muted">
				{data.contributions.length} contribution{data.contributions.length === 1 ? '' : 's'}
				{#if hiddenCount > 0}· {hiddenCount} hidden from guests{/if}
			</p>
		{/if}
	</section>
</div>
