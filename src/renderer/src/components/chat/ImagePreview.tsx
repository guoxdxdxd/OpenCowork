import { useState } from 'react'
import { X, Download, Copy, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

interface ImagePreviewProps {
  src: string
  alt?: string
}

export function ImagePreview({ src, alt = 'Generated image' }: ImagePreviewProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleDownload = async () => {
    try {
      let blob: Blob

      if (src.startsWith('data:')) {
        // For base64 images
        const response = await fetch(src)
        blob = await response.blob()
      } else {
        // For URL images, use Electron's fetch (no CORS restrictions)
        const response = await fetch(src)
        blob = await response.blob()
      }

      // Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `image-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Image downloaded')
    } catch (error) {
      console.error('Download failed:', error)
      toast.error('Failed to download image')
    }
  }

  const handleCopy = async () => {
    try {
      let blob: Blob

      if (src.startsWith('data:')) {
        // For base64 images
        const response = await fetch(src)
        blob = await response.blob()
      } else {
        // For URL images, use Electron's fetch (no CORS restrictions)
        const response = await fetch(src)
        blob = await response.blob()
      }

      // Copy image to clipboard
      if (navigator.clipboard && ClipboardItem) {
        // Ensure we have a valid image MIME type
        const imageType = blob.type.startsWith('image/') ? blob.type : 'image/png'
        await navigator.clipboard.write([
          new ClipboardItem({ [imageType]: blob })
        ])
        setCopied(true)
        toast.success('Image copied to clipboard')
        setTimeout(() => setCopied(false), 2000)
      } else {
        throw new Error('Clipboard API not supported')
      }
    } catch (error) {
      console.error('Copy failed:', error)
      toast.error('Failed to copy image. Please try downloading instead.')
    }
  }

  return (
    <>
      {/* Thumbnail */}
      <div
        className="relative max-w-lg rounded-lg overflow-hidden border border-border/50 cursor-pointer hover:border-primary/50 transition-colors group"
        onClick={() => setIsOpen(true)}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-auto"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium bg-black/50 px-3 py-1.5 rounded-full">
            Click to enlarge
          </div>
        </div>
      </div>

      {/* Full screen preview */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            {/* Toolbar */}
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleCopy()
                }}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDownload()
                }}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Download"
              >
                <Download className="size-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsOpen(false)
                }}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Image */}
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Close hint */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
              Click outside to close
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
