import { formatSize, imageForModel, isImage } from './attachments'
import type { PreparedFile } from './db'

export type ModelFile = { type: 'text'; text: string } | { type: 'file'; mediaType: string; filename: string; data: Uint8Array }

const textFile = /^text\/|json|xml|csv|markdown|yaml/
const textExtension = /\.(txt|md|csv|json|xml|ya?ml|log)$/i

// Фото и PDF модели читают сами, текстовые файлы уходят текстом; об остальных модель знает только имя
export async function fileForModel(f: PreparedFile): Promise<ModelFile> {
  const note = (why: string): ModelFile => ({ type: 'text', text: `[File "${f.name}" (${f.mime}, ${formatSize(f.size)}): ${why}]` })
  if (isImage(f.mime)) {
    const image = await imageForModel(f.blob).catch(() => null)
    if (!image) return note('the image could not be read')
    return { type: 'file', mediaType: 'image/jpeg', filename: f.name, data: new Uint8Array(await image.arrayBuffer()) }
  }
  if (f.mime === 'application/pdf') return { type: 'file', mediaType: 'application/pdf', filename: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) }
  if ((textFile.test(f.mime) || textExtension.test(f.name)) && f.size <= 200 * 1024) {
    return { type: 'text', text: `File "${f.name}":\n${await f.blob.text()}` }
  }
  return note('its contents are not available to you')
}
