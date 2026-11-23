// Saving straight back to a project file with the File System Access API, where the browser has it. A project remembers
// the file it was opened from or first saved to (a file handle); later saves write to that file without asking.
// Without the API, saving falls back to a download.

const PICKER_TYPES = [{ description: 'Live Wire project', accept: { 'application/json': ['.spark'] } }]

export const canWriteFiles = () => typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'

export const projectNameOfFile = (fileName) => fileName.replace(/\.spark$/i, '') || fileName

// True when the user dismissed a file picker, which is not an error to report.
export const isCancel = (error) => error?.name === 'AbortError'

// Asks where to save; null when the picker is dismissed.
export async function chooseSaveFile(suggestedName) {
  try {
    return await window.showSaveFilePicker({ suggestedName: `${suggestedName}.spark`, types: PICKER_TYPES })
  } catch (error) {
    if (isCancel(error)) return null
    throw error
  }
}

// Asks for a project to open; null when the picker is dismissed.
export async function chooseOpenFile() {
  try {
    const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, excludeAcceptAllOption: false, multiple: false })
    return handle
  } catch (error) {
    if (isCancel(error)) return null
    throw error
  }
}

// Whether the page may write to the file, asking the user when the permission has lapsed (e.g. after a reload).
export async function canWrite(handle) {
  const options = { mode: 'readwrite' }
  if ((await handle.queryPermission?.(options)) === 'granted') return true
  return (await handle.requestPermission?.(options)) === 'granted'
}

export async function writeFile(handle, data) {
  const writable = await handle.createWritable()
  await writable.write(data)
  await writable.close()
}
