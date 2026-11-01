import { useEffect, useState } from 'react'

export default function InstallApp() {
  const [prompt, setPrompt] = useState(null)
  useEffect(() => {
    const ready = event => { event.preventDefault(); setPrompt(event) }
    const installed = () => setPrompt(null)
    window.addEventListener('beforeinstallprompt', ready); window.addEventListener('appinstalled', installed)
    return () => { window.removeEventListener('beforeinstallprompt', ready); window.removeEventListener('appinstalled', installed) }
  }, [])
  if (!prompt) return null
  return <button className="button secondary" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null) }}>Install Pandiyan Stores</button>
}
