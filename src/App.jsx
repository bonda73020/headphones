import { useEffect, useRef, useState } from 'react'
import '@google/model-viewer'
import headphonesUrl from './assets/3dModels/headphones.glb?url'
import './App.css'

// Кадри-зупинки з Blender (перший і останній ключ анімації + проміжні «стоянки»)
const STOP_FRAMES = [1, 21, 41, 61, 81, 101, 121]

// Частка скролу секції, коли анімація стоїть (магніт). 0.25 = 25% з кожного боку
const HOLD = 0.25

// Наскільки модель зміщена вправо від центру (золотий переріз = 61.8%)
const SHIFT = 0.236

// Матеріали з альфою (іконки): MASK = чіткі краї, без сортування прозорості
const ALPHA_PLATES = ['battery', 'bluetooth']

// Камера на кожній зупинці (відносно стартового вигляду):
// theta/phi: градуси, zoom: множник відстані, x/y/z: зсув точки погляду (метри)
const CAMS = [
  { theta: 70,  phi: 0, zoom: 0.8,  x: 0.055, y: 0, z: 0 }, // 0: старт
  { theta: 82,  phi: 0, zoom: 0.82, x: 0.055, y: 0, z: 0 }, // 1: вбік (назад)
  { theta: 94,  phi: 0, zoom: 0.85, x: 0.055, y: 0, z: 0 }, // 2: ще вбік
  { theta: 106, phi: 0, zoom: 0.88, x: 0.055, y: 0, z: 0 }, // 3: край руху назад
  { theta: 70,  phi: 0, zoom: 0.9,  x: 0.055, y: 0, z: 0 }, // 4: повернення на старт
  { theta: 50,  phi: 2, zoom: 0.93, x: 0.055, y: 0, z: 0 }, // 5: вперед (ліворуч)
  { theta: 30,  phi: 4, zoom: 0.96, x: 0.055, y: 0, z: 0 }, // 6: кінець
]

// Панелі з текстом: по одній на кожен рух анімації (порядок = порядок в анімації)
const PARTS = [
  {
    eyebrow: '01 / Comfort',
    title: 'Soft isolating cushions',
    text: 'Memory-foam cushions wrapped in protein leather seal around the ear and cut ambient noise before any electronics get involved.',
  },
  {
    eyebrow: '02 / Precision',
    title: 'Acoustic shield',
    text: 'A thin metal shield sits between the electronics and the driver, keeping interference out of your music.',
  },
  {
    eyebrow: '03 / Sound',
    title: 'High-quality sound',
    text: 'A 40 mm driver with a tuned diaphragm delivers deep, controlled bass and clear highs, even at low volume.',
  },
  {
    eyebrow: '04 / Build',
    title: 'Machined back plate',
    text: 'A rigid back plate closes the cup, seals the acoustic chamber and carries the finish.',
  },
  {
    eyebrow: '05 / Power',
    title: 'Durable 24-hour battery',
    text: 'A full day of listening on one charge. Ten minutes plugged in gives you five more hours.',
  },
  {
    eyebrow: '06 / Connection',
    title: 'Latest Bluetooth',
    text: 'Bluetooth 5.4 with LE Audio and multipoint pairs two devices at once, plus a low-latency mode for video and games.',
  },
]

const TOTAL_SECTIONS = PARTS.length + 2 // intro + частини + outro

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (t) => t * t * (3 - 2 * t)
const rad = (deg) => (deg * Math.PI) / 180

const N = STOP_FRAMES.length
const STOP_FRACS = STOP_FRAMES.map(
  (f) => (f - STOP_FRAMES[0]) / (STOP_FRAMES[N - 1] - STOP_FRAMES[0]),
)

// позиція скролу (число секцій) -> «стадія» 0..N-1 з плато на зупинках
function stageFromPos(pos) {
  const x = pos - 0.5 // 0 = центр intro-секції
  if (x <= 0) return 0
  if (x >= N - 1) return N - 1
  const i = Math.floor(x)
  const f = x - i
  const u = clamp01((f - HOLD) / (1 - 2 * HOLD))
  return i + smooth(u)
}

function progressFromStage(stage) {
  const i = Math.min(Math.floor(stage), N - 2)
  return lerp(STOP_FRACS[i], STOP_FRACS[i + 1], stage - i)
}

function sampleCam(stage) {
  const i = Math.min(Math.floor(stage), CAMS.length - 2)
  const t = stage - i
  const a = CAMS[i]
  const b = CAMS[i + 1]
  const out = {}
  for (const k of ['theta', 'phi', 'zoom', 'x', 'y', 'z']) {
    out[k] = lerp(a[k], b[k], t)
  }
  return out
}

function App() {
  const viewerRef = useRef(null)
  const targetStage = useRef(0)
  const shownStage = useRef(0)
  const baseView = useRef(null)
  const needsApply = useRef(false)
  const raf = useRef(null)

  const [activeSection, setActiveSection] = useState(0)

  useEffect(() => {
    const viewer = viewerRef.current

    const apply = (stage) => {
      // 1) час анімації
      if (viewer.duration) {
        viewer.currentTime =
          Math.min(progressFromStage(stage), 0.999) * viewer.duration
      }

      // 2) камера
      const base = baseView.current
      if (!base) return
      const s = sampleCam(stage)
      const theta = base.theta + rad(s.theta)
      const phi = base.phi + rad(s.phi)
      const radius = base.radius * s.zoom

      // зсув моделі вправо: рухаємо точку погляду вліво в екранних координатах
      const vfov = rad(viewer.getFieldOfView())
      const aspect = viewer.clientWidth / viewer.clientHeight
      const halfWidth = radius * Math.tan(vfov / 2) * aspect
      const shift = (window.innerWidth > 700 ? SHIFT : 0) * halfWidth

      const tx = base.x + s.x - Math.cos(theta) * shift
      const ty = base.y + s.y
      const tz = base.z + s.z + Math.sin(theta) * shift

      viewer.cameraOrbit = `${theta}rad ${phi}rad ${radius}m`
      viewer.cameraTarget = `${tx}m ${ty}m ${tz}m`
      viewer.jumpCameraToGoal()
    }

    const onLoad = () => {
      const materials = viewer.model.materials
      console.log('Materials in GLB:', materials.map((m) => m.name))
      console.log('Animations in GLB:', viewer.availableAnimations)

      // іконки з альфою: чіткі краї
      materials.forEach((m) => {
        const name = m.name.toLowerCase()
        if (ALPHA_PLATES.some((k) => name.includes(k))) {
          m.setAlphaMode('MASK')
          m.setAlphaCutoff(0.5)
        }
      })

      // анімація: на паузі, керуємо скролом
      if (viewer.availableAnimations.length > 0) {
        viewer.animationName =
          viewer.availableAnimations.find((a) => a === 'Explode') ||
          viewer.availableAnimations[0]
        viewer.pause()
        viewer.currentTime = 0
      }

      const o = viewer.getCameraOrbit()
      const t = viewer.getCameraTarget()
      baseView.current = {
        theta: o.theta,
        phi: o.phi,
        radius: o.radius,
        x: t.x,
        y: t.y,
        z: t.z,
      }
      needsApply.current = true
    }

    const onScroll = () => {
      const secs = [...document.querySelectorAll('[data-section]')]
      const mid = window.innerHeight / 2
      let pos = 0

      for (let k = 0; k < secs.length; k++) {
        const r = secs[k].getBoundingClientRect()
        if (mid >= r.top && mid <= r.bottom) {
          pos = k + (mid - r.top) / r.height
          break
        }
        if (mid > r.bottom) pos = k + 1
      }

      targetStage.current = stageFromPos(pos)
      const next = Math.min(Math.floor(pos), TOTAL_SECTIONS - 1)
      setActiveSection((prev) => (prev === next ? prev : next))
    }

    const onResize = () => {
      onScroll()
      needsApply.current = true
    }

    const tick = () => {
      const diff = targetStage.current - shownStage.current
      if (baseView.current && (Math.abs(diff) > 0.0005 || needsApply.current)) {
        shownStage.current += diff * 0.15 // плавність: більше = різкіше
        apply(shownStage.current)
        needsApply.current = false
      }
      raf.current = requestAnimationFrame(tick)
    }

    viewer.addEventListener('load', onLoad)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    onScroll()
    raf.current = requestAnimationFrame(tick)

    return () => {
      viewer.removeEventListener('load', onLoad)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf.current)
    }
  }, [])

  const cls = (k) => (activeSection === k ? 'section is-active' : 'section')

  return (
    <>
      <model-viewer
        ref={viewerRef}
        src={headphonesUrl}
        alt="Studio Over-Ear headphones 3D model"
        disable-pan
        interaction-prompt="none"
        camera-orbit="25deg 80deg 105%"
        min-camera-orbit="auto 0deg 1%"
        max-camera-orbit="auto 180deg 500%"
        shadow-intensity="1"
        environment-image="neutral"
      />

      <main className="content">
        <section data-section className={cls(0)}>
          <div className="panel">
            <span className="eyebrow">Orrin / Studio Series</span>
            <h1>Studio Over-Ear</h1>
            <p>Wireless headphones, taken apart. Scroll to see what is inside.</p>
            <span className="scroll-hint">Scroll to explore ↓</span>
          </div>
        </section>

        {PARTS.map((p, i) => (
          <section key={p.title} data-section className={cls(i + 1)}>
            <div className="panel">
              <span className="eyebrow">{p.eyebrow}</span>
              <h2>{p.title}</h2>
              <p>{p.text}</p>
            </div>
          </section>
        ))}

        <section data-section className={cls(PARTS.length + 1)}>
          <div className="panel">
            <span className="eyebrow">About this project</span>
            <h2>Made to be looked at.</h2>
            <p>
              This page is a small showcase of interactive 3D product
              visualization: one model, built and animated in Blender, then
              driven by scroll in the browser.
            </p>
            <p className="disclaimer">
              Orrin is a fictional brand. This is an art project for
              demonstrative purposes only. The product does not exist, and
              nothing on this page is for sale.
            </p>
            <footer className="footer">
              3D model, animation and interactive viewer by Bohdan Myronets
            </footer>
          </div>
        </section>
      </main>
    </>
  )
}

export default App