import React from 'react'
import { LayoutDashboard, Crosshair, ListOrdered, SlidersHorizontal, LucideIcon } from 'lucide-react'

export type PageId = 'dashboard' | 'control' | 'program' | 'motorstudio'

export interface SidebarProps {
  activePage: PageId
  onNavigate: (page: PageId) => void
}

interface NavItem {
  id: PageId
  label: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'control', label: 'Arm Control', icon: Crosshair },
  { id: 'program', label: 'Teach & Program', icon: ListOrdered },
  { id: 'motorstudio', label: 'Motor Studio', icon: SlidersHorizontal }
]

export default function Sidebar({ activePage, onNavigate }: SidebarProps): React.JSX.Element {
  return (
    <aside
      style={{
        width: '56px',
        height: '100%',
        backgroundColor: '#0e0e13',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '12px 0',
        zIndex: 20,
        userSelect: 'none',
        flexShrink: 0
      }}
      aria-label="Main Navigation"
    >
      {navItems.map((item) => {
        const isActive = activePage === item.id
        const IconComponent = item.icon

        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={item.label}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              position: 'relative',
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
              border: isActive ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              padding: 0
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}
          >
            {/* Left accent bar on active */}
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  left: '-8px',
                  width: '3px',
                  height: '24px',
                  backgroundColor: '#38BDF8',
                  borderRadius: '0 2px 2px 0',
                  boxShadow: '0 0 8px rgba(56, 189, 248, 0.5)'
                }}
              />
            )}
            <IconComponent
              size={20}
              color={isActive ? '#38BDF8' : 'rgba(255, 255, 255, 0.4)'}
            />
          </button>
        )
      })}
    </aside>
  )
}
