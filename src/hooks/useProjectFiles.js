import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PROJECT_NAME, readProject, readProjectFile, serializeProject } from '../project/project.js'
import { downloadBlob, fileBaseName } from '../project/download.js'
import { canWrite, canWriteFiles, chooseOpenFile, chooseSaveFile, projectNameOfFile, writeFile } from '../project/projectFile.js'
import { forgetRecentProjects, recentKey, rememberProject } from '../project/recentProjects.js'
import { MAX_FILE_BYTES } from '../shared/limits.js'

// Saving, opening and the recent-projects list. A project remembers the file it came from (`fileHandle`, where the browser
// can write files) so saving writes back to it; otherwise saving downloads. The app supplies how to read the project
// (`getProjectData`, a serialized project), how to replace it (`loadProject`) and whether it is still the untouched starter.
export default function useProjectFiles({ projectName, setProjectName, fileHandle, setFileHandle, getProjectData, isStarterProject, loadProject, showNotice }) {
  const [saveAsOpen, setSaveAsOpen] = useState(false)

  const remember = (name, data, handle) =>
    rememberProject(name, data, handle).then(
      () => true,
      () => false,
    )

  // The project as a file's contents, or null (after telling the user) when it cannot be saved.
  const savableData = () => {
    const data = getProjectData()
    if (new Blob([data]).size > MAX_FILE_BYTES) {
      window.alert('This project exceeds the 30 MB import limit. Export individual sheets instead.')
      return null
    }
    try {
      readProject(data)
    } catch (error) {
      window.alert(`Could not save this project: ${error.message}`)
      return null
    }
    return data
  }

  const writeTo = async (handle, data, name) => {
    try {
      if (!(await canWrite(handle))) return false
      await writeFile(handle, data)
    } catch (error) {
      window.alert(`Could not save ${handle.name}: ${error.message}`)
      return false
    }
    setFileHandle(handle)
    remember(name, data, handle)
    showNotice(`Saved ${handle.name}`)
    return true
  }

  // Asks where to save (or, without file access, for a name to download under) and saves there.
  const saveProjectAs = async () => {
    if (!canWriteFiles()) {
      setSaveAsOpen(true)
      return
    }
    const data = savableData()
    if (!data) return
    let handle
    try {
      handle = await chooseSaveFile(fileBaseName(projectName))
    } catch (error) {
      window.alert(`Could not save this project: ${error.message}`)
      return
    }
    if (!handle) return
    const name = projectNameOfFile(handle.name)
    if (await writeTo(handle, data, name)) setProjectName(name)
  }

  const downloadProject = (name) => {
    setSaveAsOpen(false)
    const data = savableData()
    if (!data) return
    setProjectName(name)
    downloadBlob(new Blob([data], { type: 'application/json' }), `${fileBaseName(name)}.spark`)
    remember(name, data)
    showNotice('Live Wire project saved')
  }

  // Saves to the project's file without asking; a project that has no file yet is saved as a new one.
  const saveProject = async () => {
    if (!canWriteFiles()) {
      downloadProject(projectName)
      return
    }
    if (!fileHandle) {
      await saveProjectAs()
      return
    }
    const data = savableData()
    if (data && !(await writeTo(fileHandle, data, projectName))) await saveProjectAs()
  }

  const saveRef = useRef(saveProject)
  useEffect(() => {
    saveRef.current = saveProject
  })
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Before another project replaces this one it is kept under Open recent; if that fails, the user is asked first.
  const leaveProject = async ({ keep = true } = {}) => {
    if (!keep || isStarterProject()) return true
    if (await remember(projectName, getProjectData())) return true
    return window.confirm('The current project could not be kept under Open recent. Replace it anyway? Unsaved work will be lost.')
  }

  // Opens a project chosen with the file picker, so it is saved back to the same file, or a file from the hidden input.
  const openProject = async (chosen) => {
    let file = chosen
    let handle = null
    if (!file) {
      try {
        handle = await chooseOpenFile()
        if (!handle) return
        file = await handle.getFile()
      } catch (error) {
        window.alert(`Could not open the project: ${error.message}`)
        return
      }
    }
    if (file.size > MAX_FILE_BYTES) {
      window.alert('This file exceeds the 30 MB limit.')
      return
    }
    const name = file.name.replace(/\.[^.]+$/, '') || DEFAULT_PROJECT_NAME
    let project
    try {
      project = readProjectFile(await file.text(), name)
    } catch (error) {
      window.alert(`Could not open ${file.name}: ${error.message}`)
      return
    }
    if (!(await leaveProject())) return
    // A single-circuit file is not a project file, so saving it asks for a new file rather than overwriting it.
    const projectFile = handle && JSON.parse(await file.text()).format !== 'spark-circuit' ? handle : null
    loadProject(project, name, projectFile)
    remember(name, serializeProject(project), projectFile || undefined)
    showNotice(`Opened ${name}.`)
  }

  const openRecent = async (entry) => {
    const reopening = recentKey(entry.name) === recentKey(projectName) && !isStarterProject()
    if (reopening && !window.confirm(`Reopen the last saved version of "${entry.name}"? Changes since then are lost.`)) return
    let project
    try {
      project = readProject(entry.data)
    } catch (error) {
      window.alert(`Could not open ${entry.name}: ${error.message}`)
      return
    }
    if (!(await leaveProject({ keep: !reopening }))) return
    loadProject(project, entry.name, entry.handle || null)
    remember(entry.name, entry.data)
    showNotice(`Opened ${entry.name}.`)
  }

  const clearRecent = async () => {
    if (!window.confirm('Forget all recent projects? Saved project files are not affected.')) return
    try {
      await forgetRecentProjects()
      showNotice('Recent projects cleared.')
    } catch (error) {
      window.alert(`Could not clear recent projects: ${error.message}`)
    }
  }

  return { saveAsOpen, closeSaveAs: () => setSaveAsOpen(false), saveProject, saveProjectAs, downloadProject, openProject, openRecent, clearRecent, leaveProject }
}
