#!/usr/bin/env node
import {
	createMessageConnection,
	StreamMessageReader,
	StreamMessageWriter,
} from "vscode-jsonrpc/node"
import { closeProject, openProject, transform } from "./transform.ts"

const connection = createMessageConnection(
	new StreamMessageReader(process.stdin),
	new StreamMessageWriter(process.stdout),
)
connection.onRequest(
	"initialize",
	({ positionEncodings }: { positionEncodings: string[] }) => {
		if (!positionEncodings.includes("utf-16"))
			throw new Error("galley requires UTF-16 content-mapper offsets.")
		return { positionEncoding: "utf-16", diagnosticSource: "galley" }
	},
)
connection.onRequest("openProject", openProject)
connection.onRequest("closeProject", closeProject)
connection.onRequest("transform", transform)
connection.listen()
