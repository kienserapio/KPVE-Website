import { useEffect, useRef, useState } from 'react'

/**
 * Reveal — wraps content in a slide-up-on-enter animation.
 *
 * Fires when the element scrolls into view (and immediately on page load
 * for anything already within the viewport), so the same motion language
 * covers both first paint and scroll. Honors prefers-reduced-motion via CSS.
 *
 * @param {string}  [as='div']     element/tag to render
 * @param {number}  [delay=0]      stagger delay in seconds
 * @param {number}  [threshold=0.15]
 * @param {boolean} [once=true]    reveal a single time, then stop observing
 */
export default function Reveal({
  as: Tag = 'div',
  delay = 0,
  threshold = 0.15,
  once = true,
  className = '',
  style,
  children,
  ...rest
}) {
  const ref = useRef(null)
  // If IntersectionObserver is unavailable, start visible so content never hides.
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined'
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // No observer support → content is already shown via the initializer.
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          if (once) observer.unobserve(el)
        } else if (!once) {
          setVisible(false)
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, once])

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`.trim()}
      style={{ transitionDelay: `${delay}s`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
