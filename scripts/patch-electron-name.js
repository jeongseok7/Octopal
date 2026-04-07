/**
 * Patch Electron's Info.plist so macOS dock & menu bar shows "Octopal" instead of "Electron" during development.
 * Also creates an Octopal.app symlink so the dock tooltip shows the correct name.
 * Runs automatically via `npm postinstall`.
 */
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// This script only works on macOS — skip gracefully on other platforms
if (process.platform !== 'darwin') {
  console.log('[patch-electron-name] Skipped (not macOS)')
  process.exit(0)
}

const APP_NAME = 'Octopal'

const electronDistDir = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
)

const electronAppPath = path.join(electronDistDir, 'Electron.app')
const octopalAppPath = path.join(electronDistDir, `${APP_NAME}.app`)
const plistPath = path.join(electronAppPath, 'Contents', 'Info.plist')

if (!fs.existsSync(plistPath)) {
  console.log('[patch-electron-name] Info.plist not found, skipping.')
  process.exit(0)
}

try {
  // 1. Patch Info.plist
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${APP_NAME}" "${plistPath}"`)
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName ${APP_NAME}" "${plistPath}"`)
  console.log(`[patch-electron-name] Patched Info.plist → ${APP_NAME}`)

  // 2. Create Octopal.app symlink so macOS dock shows the correct name
  if (process.platform === 'darwin') {
    try {
      // Remove existing symlink if present
      if (fs.lstatSync(octopalAppPath).isSymbolicLink()) {
        fs.unlinkSync(octopalAppPath)
      }
    } catch {
      // Doesn't exist yet — fine
    }

    try {
      fs.symlinkSync(electronAppPath, octopalAppPath)
      console.log(`[patch-electron-name] Created symlink ${APP_NAME}.app → Electron.app`)
    } catch {
      console.log(`[patch-electron-name] Symlink already exists or failed, skipping.`)
    }

    // 3. Update electron path.txt so `electron .` launches via Octopal.app
    const pathTxtFile = path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt')
    try {
      fs.writeFileSync(pathTxtFile, `${APP_NAME}.app/Contents/MacOS/Electron`)
      console.log(`[patch-electron-name] Updated path.txt → ${APP_NAME}.app`)
    } catch {
      console.log(`[patch-electron-name] Failed to update path.txt, skipping.`)
    }
  }
} catch (err) {
  // Non-macOS or PlistBuddy not available — silently skip
  console.log('[patch-electron-name] Skipped (not macOS or PlistBuddy unavailable)')
}
