import { AbsoluteFill, useCurrentFrame, interpolate, Easing, Sequence, Img } from 'remotion'

export const ProductShowcase: React.FC<{
  images: string[]
  productName: string
  price?: string
}> = ({ images, productName, price }) => {
  const frame = useCurrentFrame()
  const fps = 30
  const duration = 7 * fps

  const hookScale = interpolate(frame, [0, 30], [0.5, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })

  const hookOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const imageIndex = Math.min(Math.floor((frame - 30) / 120), images.length - 1)
  const imageProgress = ((frame - 30) % 120) / 120
  const zoom = 1 + imageProgress * 0.15

  const ctaOpacity = interpolate(frame, [5 * fps, 5.5 * fps], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', width: 1080, height: 1920 }}>
      <Sequence from={0} durationInFrames={30}>
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: hookOpacity }}>
          <div style={{ transform: `scale(${hookScale})`, textAlign: 'center' }}>
            <h1 style={{ color: '#ffffff', fontSize: 64, fontWeight: 'bold', fontFamily: 'sans-serif' }}>
              {productName}
            </h1>
          </div>
        </AbsoluteFill>
      </Sequence>

      <Sequence from={30} durationInFrames={150}>
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          {images[imageIndex] && (
            <img
              src={images[imageIndex]}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${zoom})`,
                transition: 'transform 0.1s linear',
              }}
              alt={productName}
            />
          )}
        </AbsoluteFill>
      </Sequence>

      <Sequence from={150} durationInFrames={60}>
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: ctaOpacity }}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <h2 style={{ color: '#ffffff', fontSize: 56, fontWeight: 'bold', fontFamily: 'sans-serif', marginBottom: 20 }}>
              {productName}
            </h2>
            {price && (
              <p style={{ color: '#ffdd00', fontSize: 48, fontWeight: 'bold', fontFamily: 'sans-serif' }}>
                {price}
              </p>
            )}
            <p style={{ color: '#cccccc', fontSize: 32, marginTop: 20, fontFamily: 'sans-serif' }}>
              Shop Now
            </p>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  )
}
