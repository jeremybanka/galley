import fs from "node:fs"
import path from "node:path"

export function Count(_, context) {
	fs.appendFileSync(path.join(context.directory, "..", "count"), "1")
	console.log("component stdout")
	return "From " + context.directory
}
