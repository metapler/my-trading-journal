/** Shortened display form, e.g. `0x1234…cf82`. Full value stays available via copy. */
export function shortenContract(address: string | null | undefined, chars = 4): string {
  if (!address) return '—'
  if (address.length <= chars * 2 + 1) return address
  const prefix = address.startsWith('0x') ? chars + 2 : chars
  return `${address.slice(0, prefix)}…${address.slice(-chars)}`
}

/** Copy text with clipboard API + fallback. Returns true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      return true
    } catch {
      return false
    }
  }
}
