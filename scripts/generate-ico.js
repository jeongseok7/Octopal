/**
 * Generate a Windows .ico file from PNG source.
 * Uses raw Node.js — no external dependencies needed.
 *
 * ICO format: https://en.wikipedia.org/wiki/ICO_(file_format)
 * This creates a simple ICO with embedded PNG images (Vista+ format).
 *
 * Usage: node scripts/generate-ico.js
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SIZES = [256, 128, 64, 48, 32, 16]
const SOURCE = path.join(__dirname, '..', 'assets', 'icon-512.png')
const OUTPUT = path.join(__dirname, '..', 'assets', 'icon.ico')
const TEMP_DIR = path.join(__dirname, '..', '.ico-temp')

// Read PNG and create ICO with embedded PNG (Vista+ ICO format)
function createIcoFromPngs(pngBuffers) {
  const numImages = pngBuffers.length
  const headerSize = 6
  const dirEntrySize = 16
  const dataOffset = headerSize + dirEntrySize * numImages

  // ICO Header: reserved(2) + type(2) + count(2)
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)          // Reserved
  header.writeUInt16LE(1, 2)          // Type: 1 = ICO
  header.writeUInt16LE(numImages, 4)  // Number of images

  // Directory entries + image data
  const dirEntries = []
  const imageDataParts = []
  let currentOffset = dataOffset

  for (let i = 0; i < numImages; i++) {
    const png = pngBuffers[i]
    const size = SIZES[i]
    const entry = Buffer.alloc(dirEntrySize)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)   // Width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)   // Height (0 = 256)
    entry.writeUInt8(0, 2)                          // Color palette
    entry.writeUInt8(0, 3)                          // Reserved
    entry.writeUInt16LE(1, 4)                       // Color planes
    entry.writeUInt16LE(32, 6)                      // Bits per pixel
    entry.writeUInt32LE(png.length, 8)              // Image data size
    entry.writeUInt32LE(currentOffset, 12)          // Offset to image data

    dirEntries.push(entry)
    imageDataParts.push(png)
    currentOffset += png.length
  }

  return Buffer.concat([header, ...dirEntries, ...imageDataParts])
}

// Main
try {
  if (!fs.existsSync(SOURCE)) {
    console.error('[generate-ico] Source PNG not found:', SOURCE)
    process.exit(1)
  }

  // Use sips (macOS) to resize PNGs
  if (process.platform === 'darwin') {
    fs.mkdirSync(TEMP_DIR, { recursive: true })

    const pngBuffers = SIZES.map((size) => {
      const tempFile = path.join(TEMP_DIR, `icon-${size}.png`)
      fs.copyFileSync(SOURCE, tempFile)
      execSync(`sips -z ${size} ${size} "${tempFile}" --out "${tempFile}" 2>/dev/null`)
      const buf = fs.readFileSync(tempFile)
      return buf
    })

    const ico = createIcoFromPngs(pngBuffers)
    fs.writeFileSync(OUTPUT, ico)
    console.log(`[generate-ico] Created ${OUTPUT} with sizes: ${SIZES.join(', ')}`)

    // Cleanup
    fs.rmSync(TEMP_DIR, { recursive: true, force: true })
  } else {
    // Fallback: just embed the original PNG as a single-image ICO
    const png = fs.readFileSync(SOURCE)
    const ico = createIcoFromPngs([png])
    fs.writeFileSync(OUTPUT, ico)
    console.log(`[generate-ico] Created ${OUTPUT} (single 512px image)`)
  }
} catch (err) {
  console.error('[generate-ico] Error:', err.message)
  process.exit(1)
}
