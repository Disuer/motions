// lib.dom has FileSystemDirectoryHandle but not showDirectoryPicker, async iteration,
// or the permission methods. Declared narrowly rather than pulling in a types package.
export {}

declare global {
  interface Window {
    showDirectoryPicker(opts?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
  }
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemHandle>
    queryPermission(opts?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission(opts?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  }
}
