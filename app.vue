<script setup lang="ts">
useHead({
  title: "Puzzle",
})

useSeoMeta({
  title: "Puzzle",
  ogTitle: "Puzzle",
  description: "A puzzle game",
  ogDescription: "A puzzle game",
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
