import type { Component } from "galley.md"

export const Branding: Component = async () => (
	<div align="center" className="branding">
		<h1>
			<code>galley</code>
		</h1>
		<img src="logo.png" width={160} alt="A & B" />
		<input disabled hidden={false} aria-hidden={false} data-count={2} />
		<label htmlFor="name" style="color: red">
			Name
		</label>
		<custom-badge data-label="example" />
	</div>
)
