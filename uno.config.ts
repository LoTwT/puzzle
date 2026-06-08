import {
  defineConfig,
  presetIcons,
  presetUno,
  transformerDirectives,
  transformerVariantGroup,
} from "unocss"

export default defineConfig({
  theme: {
    colors: {
      zzz: "#FFE000",
    },
    fontFamily: {
      sans: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
      serif: '"DM Serif Display", ui-serif, Georgia, serif',
      mono: '"DM Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
  },
  presets: [presetUno(), presetIcons()],
  transformers: [transformerDirectives(), transformerVariantGroup()],
})
