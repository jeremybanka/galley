let count = 0
export async function Badge(_, context) {
  await Promise.resolve()
  return <span data-count={++count} title={context.directory}>A &amp; B</span>
}