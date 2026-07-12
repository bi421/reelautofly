import { AbsoluteFill, useCurrentFrame, interpolate, Easing, Sequence } from 'remotion'

export const BeforeAfter: React.FC<{
  beforeImage: string
  afterImage: string
  title?: string
}> = ({ beforeImage, afterImage, title }) => {
  const frame = useCurrentFrame()
  const fps = 30

  const divider = interpolate(frame, [0, 90], [540, 540], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const beforeOpacity = interpolate(frame, [0, 30], [1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const afterOpacity = interpolate(frame, [0, 30], [1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', width: 1080, height: 1920, display: 'flex', flexDirection: 'row' }}>
      <div style={{ width: '50%', height: '100%', position: 'relative', opacity: beforeOpacity }}>
        <img
          src={beforeImage}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt="Before"
        />
        <div style={{ position: 'absolute', bottom: 40, left: 20, color: '#ffffff', fontSize: 32, fontWeight: 'bold', fontFamily: 'sans-serif', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
          BEFORE
        </div>
      </div>

      <div style={{ width: '50%', height: '100%', position: 'relative', opacity: afterOpacity }}>
        <img
          src={afterImage}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt="After"
        />
        <div style={{ position: 'absolute', bottom: 40, right: 20, color: '#ffffff', fontSize: 32, fontWeight: 'bold', fontFamily: 'sans-serif', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
          AFTER
        </div>
      </div>

      {title && (
        <div style={{ position: 'absolute', top: 40, left: 0, right: 0, textAlign: 'center', zIndex: 10 }}>
          <h1 style={{ color: '#ffffff', fontSize: 48, fontWeight: 'bold', fontFamily: 'sans-serif', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            {title}
          </h1>
        </div>
      )}
    </AbsoluteFill>
  )
}
