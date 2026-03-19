import { app, ipcMain, nativeImage } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { encodeGif } from '../image/gif-encoder'
const IMAGE_CREATE_GIF_FROM_GRID = 'image:create-gif-from-grid'

const GENERATED_IMAGES_DIR = 'generated-images'
const GRID_SIZE = 768
const GRID_COLUMNS = 3
const GRID_ROWS = 3
const FRAME_COUNT = GRID_COLUMNS * GRID_ROWS
const FRAME_SIZE = GRID_SIZE / GRID_COLUMNS
const VISIBLE_ALPHA_THRESHOLD = 32
const MAX_SIZE_DRIFT_RATIO = 0.14
const MAX_CENTER_DRIFT_RATIO = 0.08
const MAX_BOTTOM_DRIFT_RATIO = 0.08

interface PersistedImageResult {
  filePath: string
  mediaType: string
  data: string
}

interface FrameContentStats {
  bboxWidthRatio: number
  bboxHeightRatio: number
  centerXRatio: number
  bottomYRatio: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function getGeneratedImagesDir(): string {
  const dir = join(app.getPath('userData'), GENERATED_IMAGES_DIR)
  mkdirSync(dir, { recursive: true })
  return dir
}

function toPersistedImageResult(
  filePath: string,
  buffer: Buffer,
  mediaType: string
): PersistedImageResult {
  writeFileSync(filePath, buffer)
  return {
    filePath,
    mediaType,
    data: buffer.toString('base64')
  }
}

function loadSourceBuffer(args: { filePath?: string; data?: string }): Buffer {
  if (typeof args.filePath === 'string' && args.filePath.trim()) {
    return readFileSync(args.filePath)
  }

  if (typeof args.data === 'string' && args.data.trim()) {
    return Buffer.from(args.data, 'base64')
  }

  throw new Error('Missing source image file path or base64 data.')
}

function ensureSquareImage(image: Electron.NativeImage): void {
  const { width, height } = image.getSize()
  if (width <= 0 || height <= 0) {
    throw new Error('Generated image is empty.')
  }
  if (width !== height) {
    throw new Error('Generated image must be square before slicing into a 3x3 grid.')
  }
}

function normalizeGridImage(image: Electron.NativeImage): Electron.NativeImage {
  const { width, height } = image.getSize()
  if (width === GRID_SIZE && height === GRID_SIZE) {
    return image
  }

  return image.resize({ width: GRID_SIZE, height: GRID_SIZE, quality: 'best' })
}

function buildOutputDir(runId?: string): string {
  const segment = `${Date.now()}-${runId || randomUUID()}`
  const dir = join(getGeneratedImagesDir(), `gif-grid-${segment}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function analyzeFrameContent(bitmap: Buffer, width: number, height: number): FrameContentStats {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const alpha = bitmap[offset + 3]

      if (alpha > VISIBLE_ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('Generated frame does not contain a visible subject.')
  }

  const bboxWidth = maxX - minX + 1
  const bboxHeight = maxY - minY + 1

  return {
    bboxWidthRatio: bboxWidth / width,
    bboxHeightRatio: bboxHeight / height,
    centerXRatio: (minX + maxX + 1) / 2 / width,
    bottomYRatio: (maxY + 1) / height,
    minX,
    minY,
    maxX,
    maxY
  }
}

function ensureConsistentSubjectScale(statsList: FrameContentStats[]): void {
  const reference = statsList[0]

  const exceedsTolerance = (
    current: number,
    target: number,
    tolerance: number,
    useRelative = true
  ): boolean => {
    if (useRelative) {
      return Math.abs(current - target) / Math.max(target, 0.0001) > tolerance
    }

    return Math.abs(current - target) > tolerance
  }

  const inconsistentFrame = statsList.findIndex(
    (stats) =>
      exceedsTolerance(stats.bboxWidthRatio, reference.bboxWidthRatio, MAX_SIZE_DRIFT_RATIO) ||
      exceedsTolerance(stats.bboxHeightRatio, reference.bboxHeightRatio, MAX_SIZE_DRIFT_RATIO) ||
      exceedsTolerance(stats.centerXRatio, reference.centerXRatio, MAX_CENTER_DRIFT_RATIO, false) ||
      exceedsTolerance(stats.bottomYRatio, reference.bottomYRatio, MAX_BOTTOM_DRIFT_RATIO, false)
  )

  if (inconsistentFrame !== -1) {
    throw new Error(
      `Frame ${inconsistentFrame + 1} has inconsistent subject scale or anchor position. The character size, center, or baseline drifted too much across the 9 panels.`
    )
  }
}

function resolveSharedCrop(statsList: FrameContentStats[]): {
  x: number
  y: number
  width: number
  height: number
} {
  const minX = Math.min(...statsList.map((stats) => stats.minX))
  const minY = Math.min(...statsList.map((stats) => stats.minY))
  const maxX = Math.max(...statsList.map((stats) => stats.maxX))
  const maxY = Math.max(...statsList.map((stats) => stats.maxY))

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

export function registerImageGifHandlers(): void {
  ipcMain.handle(
    IMAGE_CREATE_GIF_FROM_GRID,
    async (
      _event,
      args: {
        filePath?: string
        data?: string
        mediaType?: string
        runId?: string
        frameDurationMs?: number
      }
    ) => {
      try {
        const sourceBuffer = loadSourceBuffer(args)
        const sourceImage = nativeImage.createFromBuffer(sourceBuffer)
        if (sourceImage.isEmpty()) {
          return { success: false, error: 'Failed to decode generated image.' }
        }

        ensureSquareImage(sourceImage)

        const normalizedGrid = normalizeGridImage(sourceImage)
        const outputDir = buildOutputDir(args.runId)
        const gridPng = normalizedGrid.toPNG()
        const grid = toPersistedImageResult(join(outputDir, 'grid.png'), gridPng, 'image/png')

        const rawFrames: Electron.NativeImage[] = []
        const frameStats: FrameContentStats[] = []

        for (let row = 0; row < GRID_ROWS; row += 1) {
          for (let col = 0; col < GRID_COLUMNS; col += 1) {
            const frameImage = normalizedGrid.crop({
              x: col * FRAME_SIZE,
              y: row * FRAME_SIZE,
              width: FRAME_SIZE,
              height: FRAME_SIZE
            })
            rawFrames.push(frameImage)
            frameStats.push(analyzeFrameContent(frameImage.toBitmap(), FRAME_SIZE, FRAME_SIZE))
          }
        }

        if (rawFrames.length !== FRAME_COUNT) {
          return { success: false, error: 'Failed to slice all 9 frames from the generated grid.' }
        }

        ensureConsistentSubjectScale(frameStats)

        const sharedCrop = resolveSharedCrop(frameStats)
        const frames: PersistedImageResult[] = []
        const gifFrames: Array<{ width: number; height: number; bitmap: Buffer }> = []

        rawFrames.forEach((frameImage, index) => {
          const croppedFrame = frameImage.crop(sharedCrop)
          const frameBuffer = croppedFrame.toPNG()
          frames.push(
            toPersistedImageResult(
              join(outputDir, `frame-${String(index + 1).padStart(2, '0')}.png`),
              frameBuffer,
              'image/png'
            )
          )
          gifFrames.push({
            width: sharedCrop.width,
            height: sharedCrop.height,
            bitmap: croppedFrame.toBitmap()
          })
        })

        const gifBuffer = encodeGif(gifFrames, {
          delayMs: Math.max(20, Number(args.frameDurationMs) || 120),
          loopCount: 0
        })
        const gif = toPersistedImageResult(join(outputDir, 'animation.gif'), gifBuffer, 'image/gif')

        return {
          success: true,
          grid,
          frames,
          gif,
          outputDir,
          gridSize: GRID_SIZE,
          frameSize: FRAME_SIZE
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )
}
