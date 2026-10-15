import type { PuzzleSave } from './types'

export interface PuzzleStorage {
  read(): Promise<unknown>
  save(snapshot: PuzzleSave): Promise<void>
  close(): void
}

/** 一个页面一个连接与写队列；跨页面的先后由 IndexedDB 事务提交顺序决定。 */
export function createPuzzleStorage(): PuzzleStorage {
  let database: IDBDatabase | null = null
  let opening: Promise<IDBDatabase> | null = null
  let cancelOpen: (() => void) | null = null
  let closed = false
  let writes = Promise.resolve()

  function open(): Promise<IDBDatabase> {
    if (closed) return Promise.reject(new Error('Puzzle storage is closed.'))
    if (database) return Promise.resolve(database)
    if (opening) return opening
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('puzzle', 1)
      let abandoned = false
      const fail = (error: unknown) => {
        abandoned = true
        reject(error)
      }
      cancelOpen = () => fail(new Error('Puzzle storage is closed.'))
      // blocked 也要让本次读取/保存退出；迟到的连接只能关闭，不能被重新采用。
      request.onblocked = () => fail(new Error('Puzzle storage is blocked.'))
      request.onerror = () => fail(request.error)
      request.onupgradeneeded = () => {
        if (closed || abandoned) {
          request.transaction?.abort()
          return
        }
        request.result.createObjectStore('sessions')
      }
      request.onsuccess = () => {
        const connection = request.result
        if (closed || abandoned) {
          connection.close()
          return
        }
        database = connection
        const releaseConnection = () => {
          connection.close()
          if (database === connection) database = null
        }
        connection.onversionchange = releaseConnection
        connection.onclose = releaseConnection
        resolve(connection)
      }
    })
    opening = pending
    const clearOpening = () => {
      if (opening === pending) {
        opening = null
        cancelOpen = null
      }
    }
    void pending.then(clearOpening, clearOpening)
    return pending
  }

  async function transact(mode: IDBTransactionMode, snapshot?: PuzzleSave): Promise<unknown> {
    const connection = await open()
    if (closed) throw new Error('Puzzle storage is closed.')
    return new Promise((resolve, reject) => {
      const transaction = connection.transaction('sessions', mode)
      const store = transaction.objectStore('sessions')
      let result: unknown
      // put/get 的 success 尚不代表持久化成功，只有 complete 才对外兑现。
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Puzzle transaction aborted.'))
      const request = snapshot ? store.put(snapshot, 'current') : store.get('current')
      request.onsuccess = () => {
        result = request.result
      }
    })
  }

  return {
    read: () => transact('readonly'),
    save(snapshot) {
      const saved = writes.then(async () => {
        await transact('readwrite', snapshot)
      })
      // 失败只影响此节点，下一次合法提交仍可尝试保存。
      writes = saved.catch(() => {})
      return saved
    },
    close() {
      closed = true
      cancelOpen?.()
      // 已启动事务允许完成；队列中尚未启动的写入会被 closed 拒绝。
      database?.close()
      database = null
    },
  }
}
