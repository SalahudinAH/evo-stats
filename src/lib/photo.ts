/**
 * Shrinks a photo to at most `max` px on the long side and returns it as base64 JPEG (no prefix).
 * Phone photos are 3–6 MB; this makes them ~150–300 KB, which uploads fast and is plenty for the AI.
 */
export async function shrinkPhoto(file: File, max = 1024, quality = 0.8): Promise<{ base64: string; dataUrl: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Could not open that photo.'))
      i.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not read that photo.')
    ctx.drawImage(img, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl }
  } finally {
    URL.revokeObjectURL(url)
  }
}
