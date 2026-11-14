import { useCallback } from 'react'
import type { PreparedFile } from './db'

const thumbSize = 480

export const isImage = (mime: string) => mime.startsWith('image/')
export const isVideo = (mime: string) => mime.startsWith('video/')

function drawThumb(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, thumbSize / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
}

async function imageThumb(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    return await drawThumb(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}

// Кадр из начала видео; если браузер не может его прочитать — превью не будет
function videoThumb(file: File) {
  return new Promise<Blob | null>((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const done = (blob: Blob | null) => {
      URL.revokeObjectURL(url)
      resolve(blob)
    }
    const timer = setTimeout(() => done(null), 5000)
    video.muted = true
    video.preload = 'metadata'
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, video.duration / 2 || 0)
    }
    video.onseeked = () => {
      clearTimeout(timer)
      drawThumb(video, video.videoWidth, video.videoHeight).then(done, () => done(null))
    }
    video.onerror = () => {
      clearTimeout(timer)
      done(null)
    }
    video.src = url
  })
}

// Превью строится заранее: внутри транзакции IndexedDB асинхронная работа с canvas невозможна
export async function prepareFile(file: File): Promise<PreparedFile> {
  let thumb: Blob | null = null
  try {
    if (isImage(file.type)) thumb = await imageThumb(file)
    else if (isVideo(file.type)) thumb = await videoThumb(file)
  } catch {
    thumb = null
  }
  return { name: file.name, mime: file.type || 'application/octet-stream', size: file.size, blob: file, thumb }
}

const sizeFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} КБ`
  if (bytes < 1024 * 1024 * 1024) return `${sizeFormat.format(bytes / 1024 / 1024)} МБ`
  return `${sizeFormat.format(bytes / 1024 / 1024 / 1024)} ГБ`
}

// Ссылка на Blob живёт, пока элемент на экране: ref-колбэк создаёт её и освобождает при удалении
export function useBlobRef<T extends HTMLImageElement | HTMLVideoElement | HTMLAnchorElement>(blob: Blob | null) {
  return useCallback(
    (el: T | null) => {
      if (!el || !blob) return
      const url = URL.createObjectURL(blob)
      if (el instanceof HTMLAnchorElement) el.href = url
      else el.src = url
      return () => URL.revokeObjectURL(url)
    },
    [blob],
  )
}
