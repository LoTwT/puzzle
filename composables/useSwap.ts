import type { Options } from "sortablejs"
import Sortable from "sortablejs/modular/sortable.complete.esm"
import { onWatcherCleanup } from "vue"

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
      onUpdate: (e) => {
        const { oldIndex, newIndex } = e

        if (oldIndex == null || newIndex == null) return

        const temp = result.value.slice()

        ;[temp[oldIndex], temp[newIndex]] = [temp[newIndex], temp[oldIndex]]

        result.value = temp

        actualOptions?.onUpdate?.(e)
      },
    })

    onWatcherCleanup(() => {
      if (instance.value) {
        instance.value.destroy()
        instance.value = null
      }
    })
  })

  const reset = () => {
    result.value = toValue(source)
  }

  return {
    instance,
    result,
    reset,
  }
}
