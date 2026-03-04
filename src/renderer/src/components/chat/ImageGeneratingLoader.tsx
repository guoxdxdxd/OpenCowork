import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export function ImageGeneratingLoader(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
      <motion.div
        animate={{
          rotate: 360,
          scale: [1, 1.2, 1],
        }}
        transition={{
          rotate: { duration: 2, repeat: Infinity, ease: 'linear' },
          scale: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        <Sparkles className="size-5 text-primary" />
      </motion.div>
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Generating image...</div>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="size-1.5 rounded-full bg-primary/60"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
