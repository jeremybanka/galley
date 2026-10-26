import { parse, parseExpression, type ParserOptions } from "@babel/parser"
import type { Options as MdxOptions } from "remark-mdx"

const options: ParserOptions = {
	sourceType: "module",
	plugins: ["estree", "typescript", "jsx"],
	allowUndeclaredExports: true,
	allowAwaitOutsideFunction: true,
	createParenthesizedExpressions: true,
	ranges: true,
}

/** Adapt Babel's TSX parser to micromark's incremental Acorn interface. */
function read(
	source: string,
	expression: boolean,
	config: { onComment?: unknown[] },
) {
	try {
		const parsed = expression
			? parseExpression(source, options)
			: parse(source, options)
		const result = parsed.type === "File" ? parsed.program : parsed
		for (const comment of parsed.comments ?? []) {
			config.onComment?.push({
				...comment,
				type: comment.type === "CommentLine" ? "Line" : "Block",
			})
		}
		return result
	} catch (error) {
		const failure = error as SyntaxError & {
			pos: number
			raisedAt: number
			reasonCode?: string
		}
		// micromark retries at the next boundary when the candidate is incomplete.
		failure.raisedAt = failure.reasonCode?.startsWith("Unterminated")
			? source.length
			: failure.pos
		throw failure
	}
}

export const typescriptParser: NonNullable<MdxOptions["acorn"]> = {
	parse(source: string, config: { onComment?: unknown[] }) {
		return read(source, false, config)
	},
	parseExpressionAt(
		source: string,
		offset: number,
		config: { onComment?: unknown[] },
	) {
		if (offset !== 0)
			throw new Error("MDX expressions must start at offset zero.")
		return read(source, true, config)
	},
} as unknown as NonNullable<MdxOptions["acorn"]>
