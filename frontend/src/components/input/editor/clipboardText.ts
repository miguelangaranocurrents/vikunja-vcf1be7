import {Extension, getTextBetween, getTextSerializersFromSchema} from '@tiptap/core'
import {Plugin, PluginKey} from '@tiptap/pm/state'
import type {Fragment, Node as ProseMirrorNode, Schema, Slice} from '@tiptap/pm/model'

type TextSerializers = ReturnType<typeof getTextSerializersFromSchema>

const LIST_TYPES = ['bulletList', 'orderedList', 'taskList']

/**
 * Serializes a copied slice to plain text that keeps the structure a reader needs:
 * list items get their markers ("- ", "1. ", "- [ ] ") instead of collapsing into
 * bare lines. Returns an empty string for inline-only slices so the default
 * serializer handles those.
 */
export function serializeSliceAsText(slice: Slice, schema: Schema): string {
	const first = slice.content.firstChild
	if (first === null || first.isInline) {
		return ''
	}

	return serializeBlocks(slice.content, getTextSerializersFromSchema(schema), '')
}

function serializeBlocks(fragment: Fragment, serializers: TextSerializers, indent: string): string {
	const parts: string[] = []
	fragment.forEach(node => {
		parts.push(serializeBlock(node, serializers, indent))
	})
	return parts.join('\n\n')
}

function serializeBlock(node: ProseMirrorNode, serializers: TextSerializers, indent: string): string {
	if (node.isTextblock) {
		return indentLines(inlineText(node, serializers), indent)
	}

	if (LIST_TYPES.includes(node.type.name)) {
		return serializeList(node, serializers, indent)
	}

	return serializeBlocks(node.content, serializers, indent)
}

function serializeList(list: ProseMirrorNode, serializers: TextSerializers, indent: string): string {
	const isOrdered = list.type.name === 'orderedList'
	const start = isOrdered && typeof list.attrs.start === 'number' ? list.attrs.start : 1
	const items: string[] = []

	list.forEach((item, _offset, index) => {
		let marker = '- '
		if (isOrdered) {
			marker = `${start + index}. `
		} else if (item.type.name === 'taskItem') {
			marker = item.attrs.checked ? '- [x] ' : '- [ ] '
		}
		items.push(serializeListItem(item, serializers, indent, marker))
	})

	return items.join('\n')
}

function serializeListItem(item: ProseMirrorNode, serializers: TextSerializers, indent: string, marker: string): string {
	const childIndent = indent + ' '.repeat(marker.length)
	const lines: string[] = []

	item.forEach((child, _offset, index) => {
		if (index === 0 && child.isTextblock) {
			lines.push(indent + marker + indentLines(inlineText(child, serializers), childIndent).slice(childIndent.length))
			return
		}
		if (index === 0) {
			lines.push(indent + marker.trimEnd())
		}
		lines.push(serializeBlock(child, serializers, childIndent))
	})

	if (lines.length === 0) {
		return indent + marker.trimEnd()
	}

	return lines.join('\n')
}

function inlineText(node: ProseMirrorNode, serializers: TextSerializers): string {
	return getTextBetween(node, {from: 0, to: node.content.size}, {textSerializers: serializers})
}

function indentLines(text: string, indent: string): string {
	if (indent === '') {
		return text
	}
	return text.split('\n').map(line => indent + line).join('\n')
}

export const ClipboardText = Extension.create({
	name: 'clipboardText',

	// Must run before tiptap's own clipboardTextSerializer, which drops list markers.
	priority: 1000,

	addProseMirrorPlugins() {
		const schema = this.editor.schema
		return [
			new Plugin({
				key: new PluginKey('clipboardText'),
				props: {
					clipboardTextSerializer: slice => serializeSliceAsText(slice, schema),
				},
			}),
		]
	},
})
