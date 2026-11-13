import { useEffect, useRef, useState } from 'react'
import { Keyboard } from 'lucide-react'
import { Sheet } from './ui'

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

/**
 * Uses the browser's own barcode reader when it has one (Chrome on Android),
 * otherwise a small WebAssembly reader (iPhone Safari has none). The reader
 * is only downloaded the first time you scan.
 */
async function makeDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      const usable = FORMATS.filter(f => supported.includes(f))
      if (usable.length) return new Native({ formats: usable })
    } catch {
      // fall through to the WebAssembly reader
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })
  return new BarcodeDetector({ formats: FORMATS as never[] }) as unknown as Detector
}

/** Point the camera at a barcode; calls onCode once with the number. */
export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied' | 'unavailable'>('starting')
  const [typed, setTyped] = useState('')
  const [manual, setManual] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let cancelled = false
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setStatus('unavailable'); setManual(true); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      } catch {
        if (!cancelled) { setStatus('denied'); setManual(true) }
        return
      }
      if (cancelled || !video.current) { stream.getTracks().forEach(t => t.stop()); return }
      video.current.srcObject = stream
      await video.current.play().catch(() => undefined)
      let detector: Detector
      try { detector = await makeDetector() } catch { if (!cancelled) { setStatus('unavailable'); setManual(true) } return }
      if (cancelled) return
      setStatus('scanning')
      const tick = async () => {
        if (cancelled || done.current || !video.current) return
        try {
          if (video.current.readyState >= 2) {
            const found = await detector.detect(video.current)
            const code = found.find(f => /^\d{8,14}$/.test(f.rawValue))?.rawValue
            if (code && !done.current) {
              done.current = true
              navigator.vibrate?.(60)
              onCode(code)
              return
            }
          }
        } catch {
          // a frame that couldn't be read; try the next one
        }
        timer = window.setTimeout(tick, 200)
      }
      void tick()
    })()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [onCode])

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault()
    const code = typed.replace(/\D/g, '')
    if (code.length >= 8 && !done.current) { done.current = true; onCode(code) }
  }

  return (
    <Sheet title="Scan barcode" onClose={onClose}>
      {status !== 'denied' && status !== 'unavailable' && (
        <div className="scanner">
          <video ref={video} playsInline muted aria-label="Camera view" />
          <div className="frame" aria-hidden="true" />
          <div className="msg">{status === 'starting' ? 'Starting camera…' : 'Hold the barcode inside the frame'}</div>
        </div>
      )}
      {status === 'denied' && <p className="small muted">The camera is blocked. Allow camera access for this app in Settings, or type the number under the barcode.</p>}
      {status === 'unavailable' && <p className="small muted">This browser can't use the camera here. Type the number under the barcode instead.</p>}
      {manual ? (
        <form className="inline-form" onSubmit={submitTyped}>
          <input inputMode="numeric" autoFocus value={typed} onChange={e => setTyped(e.target.value)} placeholder="Number under the barcode" aria-label="Barcode number" />
          <button className="btn btn-primary" disabled={typed.replace(/\D/g, '').length < 8}>Look up</button>
        </form>
      ) : (
        <button className="btn" onClick={() => setManual(true)}><Keyboard size={18} strokeWidth={2} />Type the number instead</button>
      )}
    </Sheet>
  )
}
