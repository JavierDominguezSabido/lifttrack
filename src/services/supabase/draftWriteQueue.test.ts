import { describe, expect, it } from 'vitest'
import { enqueueDraftWrite } from './draftWriteQueue'

describe('orden de escrituras del borrador', () => {
  it('un borrado espera al envío anterior aunque haya fallado', async () => {
    const events: string[] = []
    let rejectUpload!: (error: Error) => void
    const upload = enqueueDraftWrite('user', 'draft', () => new Promise<void>((_resolve, reject) => {
      events.push('upload'); rejectUpload = reject
    }))
    const failed = expect(upload).rejects.toThrow('offline')
    const deletion = enqueueDraftWrite('user', 'draft', async () => { events.push('delete') })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual(['upload'])
    rejectUpload(new Error('offline'))
    await failed
    await deletion
    expect(events).toEqual(['upload', 'delete'])
  })

  it('no bloquea borradores de otras cuentas', async () => {
    let release!: () => void
    const upload = enqueueDraftWrite('first', 'draft', () => new Promise<void>((resolve) => { release = resolve }))
    await enqueueDraftWrite('second', 'draft', async () => 'done')
    release()
    await upload
  })
})
