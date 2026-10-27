export async function Greeting(
	{ name }: { name: string },
	context: { directory: string },
) {
	await Promise.resolve()
	return (
		<p>
			Hello <strong>{name}</strong> from {context.directory}
		</p>
	)
}
