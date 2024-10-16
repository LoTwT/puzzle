import Sortable, { type Options, Swap } from "sortablejs"
import { onWatcherCleanup } from "vue"

if (import.meta.client) {
  Sortable.mount(new Swap())
}

export function useSwap<T>(
  el: MaybeRefOrGetter<HTMLElement | null>,
  source: MaybeRefOrGetter<T[]>,
  options?: MaybeRefOrGetter<Options>,
) {
  const instance = ref<Sortable | null>(null)
  const result = ref<T[]>([])

  watchEffect(() => {
    const actualEl = toValue(el)

    if (!actualEl) return

    const actualSource = toValue(source)
    const actualOptions = toValue(options)

    result.value = actualSource

    if (instance.value) {
      instance.value.destroy()
    }

    instance.value = new Sortable(actualEl, {
      ...actualOptions,
      swap: true,
      onEnd: (e) => {
        const { oldIndex, newIndex } = e

        if (oldIndex == null || newIndex == null) return

        const temp = result.value.slice()

        ;[temp[oldIndex], temp[newIndex]] = [temp[newIndex], temp[oldIndex]]

        result.value = temp

        actualOptions?.onEnd?.(e)
      },
    })

    onWatcherCleanup(() => {
      if (instance.value) {
        instance.value.destroy()
        instance.value = null
      }
    })
  })

  return {
    instance,
    result,
  }
}
