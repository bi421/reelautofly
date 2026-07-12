import { AbsoluteFill, useCurrentFrame, interpolate, Easing, Sequence } from 'remotion'

export const UGCStyle: React.FC<{
  images: string[]
  captions: string[]
}> = ({ images, captions }) => {
  const frame = useCurrentFrame()
  const fps = 30

  const captionIndex = Math.min(Math.floor(frame / 90), captions.length - 1)
  const captionOpacity = interpolate(frame % 90, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#ffffff', width: 1080, height: 1920 }}>
      <Sequence from={0} durationInFrames={images.length * 90}>
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <img
            src={images[captionIndex]}
            style={{
              width: '100%',
              height: '70%',
              objectFit: 'cover',
            }}
            alt={`UGC frame ${captionIndex}`}
          />
        </AbsoluteFill>
      </Sequence>

      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 80 }}>
        <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', padding: '20px 40px', borderRadius: 8, maxWidth: '90%' }}>
          <p style={{ color: '#ffffff', fontSize: 36, fontFamily: 'sans-serif', textAlign: 'center', opacity: captionOpacity }}>
            {captions[captionIndex]}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
