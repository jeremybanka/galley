let calls = 0
export function Header() {
	return (
		<thead>
			<tr>
				<th align="right">Value</th>
				<th>Label</th>
			</tr>
		</thead>
	)
}
async function Cells({ value }: { value: number }) {
	return (
		<>
			<td>{value}</td>
			<td>
				<strong>a|b</strong>
			</td>
		</>
	)
}
export async function Rows() {
	if (++calls > 1) throw new Error("evaluated twice")
	return (
		<>
			{[1, 2].map((value) => (
				<tr key={value}>
					<Cells value={value} />
				</tr>
			))}
		</>
	)
}
