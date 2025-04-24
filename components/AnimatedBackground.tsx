"use client"

import { useRef, useEffect } from "react"
import { motion, useAnimation } from "framer-motion"

interface Particle {
  x: number
  y: number
  radius: number
  color: string
  vx: number
  vy: number
  opacity: number
}

const particleColors = [
  "#FF1493", // Neon Pink
  "#DA70D6", // Neon Purple
  "#9370DB", // Medium Purple
  "#FF69B4", // Hot Pink
  "#C71585", // Medium Violet Red
  "#483D8B"  // Dark Slate Blue
]

const AnimatedBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controls = useAnimation()
  let animationFrameId: number

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let particles: Particle[] = []
    const particleCount = 50 // Reduced particle count for potentially better performance

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      createParticles() // Recreate particles on resize
    }

    const createParticles = () => {
      particles = []
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 1.5 + 0.5, // Smaller particles
          color: particleColors[Math.floor(Math.random() * particleColors.length)],
          vx: Math.random() * 0.4 - 0.2, // Slower velocity
          vy: Math.random() * 0.4 - 0.2, // Slower velocity
          opacity: Math.random() * 0.5 + 0.1, // Lower opacity
        })
      }
    }

    const animateParticles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((p) => {
        // Update position
        p.x += p.vx
        p.y += p.vy

        // Bounce off edges
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1

        // Draw particle
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.opacity
        ctx.fill()
        ctx.closePath()
      })

      ctx.globalAlpha = 1.0 // Reset global alpha

      animationFrameId = requestAnimationFrame(animateParticles)
    }

    resizeCanvas() // Initial setup
    window.addEventListener("resize", resizeCanvas)

    // Start animation
    controls.start({ opacity: 1, transition: { duration: 1 } })
    animateParticles()

    // Cleanup
    return () => {
      window.removeEventListener("resize", resizeCanvas)
      cancelAnimationFrame(animationFrameId)
    }
  }, [controls])

  return (
    <motion.canvas
      ref={canvasRef}
      initial={{ opacity: 0 }}
      animate={controls}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0, // Ensure it's behind content
        pointerEvents: "none", // Prevent canvas from intercepting clicks
      }}
    />
  )
}

export default AnimatedBackground 