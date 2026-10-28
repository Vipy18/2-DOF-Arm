import React from 'react'
import { motion } from 'framer-motion'

export const PageTransition: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.15, ease: 'easeOut' }}
    style={{ height: '100%', width: '100%', ...style }}
  >
    {children}
  </motion.div>
)

export default PageTransition
