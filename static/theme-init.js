// Set the color theme before first paint to avoid a flash. Default: follow the
// OS preference; an explicit choice saved in localStorage overrides it.
// Loaded from /static so it's covered by `script-src 'self'` (no CSP nonce/hash
// to maintain). Keep this render-blocking (no async/defer) in <head>.
(function () {
	try {
		var stored = localStorage.getItem('theme');
		var dark =
			stored === 'dark' ||
			(!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.classList.toggle('dark', dark);
		document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
	} catch (e) {
		/* localStorage unavailable - stay in light mode */
	}
})();
