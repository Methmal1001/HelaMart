import type { BrandingProfile } from '~/types/admin'

export interface BrandPreviewInput {
  name: string
  profile: BrandingProfile
  /** Image sources for drawing: `media:<id>` or a local object URL of an unsaved upload. */
  logo?: string | null
  banner?: string | null
}

/**
 * Renders the in-store artwork (entrance banner, checkout board, end-cap
 * plate) for a branding profile, exactly as the 3D store draws it.
 */
export function useBrandPreview(input: () => BrandPreviewInput | null) {
  const urls = ref<{ banner: string; board: string; plate: string } | null>(null)
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  async function render() {
    const v = input()
    const mine = ++seq
    if (!v || import.meta.server) {
      urls.value = null
      return
    }
    const art = await import('~/lib/brandingArt')
    const [logo, banner] = await Promise.all([art.decodeImage(v.logo), art.decodeImage(v.banner)])
    await document.fonts?.ready
    if (mine !== seq) return
    const imgs = { logo, banner }
    urls.value = {
      banner: art.storeBannerCanvas(v.profile, v.name, imgs).toDataURL('image/jpeg', 0.86),
      board: art.checkoutBoardCanvas(v.profile, v.name, imgs).toDataURL('image/jpeg', 0.86),
      plate: art.logoPlateCanvas(v.profile, v.name, imgs).toDataURL('image/png'),
    }
    logo?.close()
    banner?.close()
  }

  watch(
    () => JSON.stringify(input()),
    () => {
      clearTimeout(timer)
      timer = setTimeout(render, 180)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => clearTimeout(timer))
  return urls
}
