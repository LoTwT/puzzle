// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-10-22",

  devtools: { enabled: true },

  modules: ["@unocss/nuxt", "@vueuse/nuxt"],

  css: ["@unocss/reset/tailwind-compat.css", "~/assets/css/theme.css"],

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
        },
      },
    },
  },
})
