import { useEffect } from 'react'

/**
 * Registers a beforeunload handler that fires navigator.sendBeacon to
 * DELETE the player from the room when the tab is closed, refreshed,
 * or navigated away from without going through handleLeave().
 *
 * sendBeacon is the only reliable way to send a network request during
 * page unload — fetch() and XMLHttpRequest are cancelled by the browser
 * before they complete. sendBeacon queues the request and lets the browser
 * send it even after the page is gone.
 *
 * Usage:
 *   useBeaconLeave(playerId)   ← call this in lobby/page.tsx and game/page.tsx
 *
 * The hook is a no-op when playerId is null (not yet loaded).
 * It cleans up the event listener when the component unmounts normally
 * (e.g. navigating to the game page), so the beacon only fires on true
 * unload events (tab close, browser close, hard refresh, crash).
 */
 
export function useBeaconLeave(playerId: string | null) {
  useEffect(() => {
    if (!playerId) return

    function handleUnload() {
      // sendBeacon POST to our disconnect endpoint.
      // The body can be empty — we only need the playerId in the URL.
      navigator.sendBeacon(`/api/players/${playerId}/disconnect`)
    }

    window.addEventListener('beforeunload', handleUnload)
    // pagehide fires on iOS Safari where beforeunload is unreliable
    window.addEventListener('pagehide', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
  }, [playerId])
}