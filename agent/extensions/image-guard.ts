import type { ExtensionAPI, ToolResultEvent, ToolResultEventResult } from "@earendil-works/pi-coding-agent"
import { formatDimensionNote, resizeImage } from "@earendil-works/pi-coding-agent"

const MAX_DIMENSION = 2000

type ContentBlock = ToolResultEvent["content"][number]

function readUint32BE(bytes: Uint8Array, offset: number): number {
	return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
	return (bytes[offset] << 8) | bytes[offset + 1]
}

function sniffPng(bytes: Uint8Array): { width: number; height: number } | undefined {
	if (bytes.length < 24) return undefined
	const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
	if (signature.some((value, index) => bytes[index] !== value)) return undefined
	return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) }
}

function sniffJpeg(bytes: Uint8Array): { width: number; height: number } | undefined {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined
	let offset = 2
	while (offset < bytes.length - 9) {
		if (bytes[offset] !== 0xff) {
			offset += 1
			continue
		}
		const marker = bytes[offset + 1]
		const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
		if (isStartOfFrame) {
			return { width: readUint16BE(bytes, offset + 7), height: readUint16BE(bytes, offset + 5) }
		}
		if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			offset += 2
			continue
		}
		offset += 2 + readUint16BE(bytes, offset + 2)
	}
	return undefined
}

function sniffGif(bytes: Uint8Array): { width: number; height: number } | undefined {
	if (bytes.length < 10) return undefined
	if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return undefined
	return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) }
}

function sniffWebp(bytes: Uint8Array): { width: number; height: number } | undefined {
	if (bytes.length < 30) return undefined
	const tag = String.fromCharCode(...bytes.subarray(0, 4)) + String.fromCharCode(...bytes.subarray(8, 12))
	if (tag !== "RIFFWEBP") return undefined

	const chunk = String.fromCharCode(...bytes.subarray(12, 16))
	if (chunk === "VP8 ") {
		return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff }
	}
	if (chunk === "VP8L") {
		const packed = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
		return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 }
	}
	if (chunk === "VP8X") {
		const width = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)
		const height = bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)
		return { width: width + 1, height: height + 1 }
	}
	return undefined
}

function sniffDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
	return sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffGif(bytes) ?? sniffWebp(bytes)
}

function exceedsLimit(bytes: Uint8Array): boolean {
	const dimensions = sniffDimensions(bytes)
	if (!dimensions) return true
	return dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION
}

async function shrinkImageBlock(block: ContentBlock): Promise<ContentBlock[]> {
	if (block.type !== "image" || !block.data) return [block]

	let bytes: Uint8Array
	try {
		bytes = new Uint8Array(Buffer.from(block.data, "base64"))
	} catch {
		return [block]
	}

	if (!exceedsLimit(bytes)) return [block]

	const resized = await resizeImage(bytes, block.mimeType || "image/png", {
		maxWidth: MAX_DIMENSION,
		maxHeight: MAX_DIMENSION,
	})

	if (!resized) {
		return [
			{
				type: "text",
				text: "[Image omitted: exceeded the provider image limit and could not be resized.]",
			},
		]
	}

	const shrunk: ContentBlock = { type: "image", data: resized.data, mimeType: resized.mimeType }
	const note = formatDimensionNote(resized)
	return note ? [shrunk, { type: "text", text: note }] : [shrunk]
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", async (event): Promise<ToolResultEventResult | undefined> => {
		const hasImages = event.content.some((block) => block.type === "image")
		if (!hasImages) return undefined

		const rewritten: ContentBlock[] = []
		let changed = false

		for (const block of event.content) {
			const replacement = await shrinkImageBlock(block)
			if (replacement.length !== 1 || replacement[0] !== block) changed = true
			rewritten.push(...replacement)
		}

		return changed ? { content: rewritten } : undefined
	})
}
